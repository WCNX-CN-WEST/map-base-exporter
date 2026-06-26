// Owns the MapLibre Map object lifecycle: create, style-load, destroy.
//
// Full-colour build — no monochrome overrides. On style load we discover
// the street-label layer ids so the App can hide the GL-baked names while
// the SVG street-name overlay is active.
import { useEffect, useRef, useState } from 'react'
import maplibregl, { type Map as MapLibreMap } from 'maplibre-gl'
import { TILE_STYLE_URL, ZOOM, DEFAULT_CENTER, setActiveStyleUrl } from '../map/constants'
import { extractStreetLabelLayerIds } from '../map/styleUtils'

export interface MapInstanceState {
  map: MapLibreMap | null
  isReady: boolean
  /** Street/road name layers — hidden while the SVG overlay is active. */
  streetLabelLayerIds: string[]
}

export function useMapInstance(
  containerRef: React.RefObject<HTMLDivElement>,
  styleUrl?: string
): MapInstanceState {
  const mapRef = useRef<MapLibreMap | null>(null)
  const [mapInstance, setMapInstance] = useState<MapLibreMap | null>(null)
  const [isReady, setIsReady] = useState(false)
  const [streetLabelLayerIds, setStreetLabelLayerIds] = useState<string[]>([])
  const loadedStyleUrlRef = useRef<string>(TILE_STYLE_URL)

  useEffect(() => {
    if (!containerRef.current || mapRef.current) return

    const map = new maplibregl.Map({
      container: containerRef.current,
      style: TILE_STYLE_URL,
      center: DEFAULT_CENTER,
      zoom: ZOOM.DEFAULT,
      bearing: 0,
      minZoom: ZOOM.MIN,
      maxZoom: ZOOM.MAX,
      attributionControl: false,
      pitchWithRotate: false,
      // Keep the live canvas readable; the export uses its own offscreen
      // maps at print pixel ratio.
    })

    map.addControl(new maplibregl.AttributionControl({ compact: true }), 'bottom-right')
    map.addControl(new maplibregl.NavigationControl({ showCompass: true }), 'top-right')
    map.addControl(new maplibregl.ScaleControl({ maxWidth: 140, unit: 'metric' }), 'bottom-left')

    // ── Ready detection ───────────────────────────────────────────────────────
    // MapLibre's "load" event fires when the map first becomes idle (all tiles
    // loaded, no pending requests). On some hosts (e.g. GitHub Pages) the map
    // never reaches idle because WebGL keeps requesting tiles in the background,
    // so "load" never fires even though the style is fully parsed and the map
    // renders visually. We use a belt-and-suspenders approach:
    //   1. Primary: wait for the "load" event (normal case).
    //   2. Fallback: after 4 s, if the style already has layers (style._loaded),
    //      mark the map ready so the user is not stuck with "Map not ready yet."
    let readyFired = false
    let fallbackTimer: ReturnType<typeof setTimeout>

    const markReady = () => {
      if (readyFired) return
      readyFired = true
      clearTimeout(fallbackTimer)
      requestAnimationFrame(() => {
        try {
          setStreetLabelLayerIds(extractStreetLabelLayerIds(map))
        } catch (e) {
          console.warn('[useMapInstance] extractStreetLabelLayerIds failed:', e)
        }
        setIsReady(true)
      })
    }

    map.once('load', markReady)

    fallbackTimer = setTimeout(() => {
      const style = map.getStyle()
      if (style?.layers?.length) {
        console.warn(
          '[useMapInstance] "load" event did not fire within 4 s — ' +
          'style has ' + style.layers.length + ' layers, forcing isReady via fallback.'
        )
        markReady()
      }
    }, 4000)
    // ─────────────────────────────────────────────────────────────────────────

    mapRef.current = map
    setMapInstance(map)

    return () => {
      clearTimeout(fallbackTimer)
      map.remove()
      mapRef.current = null
      setMapInstance(null)
      setIsReady(false)
      setStreetLabelLayerIds([])
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // ── Style switcher ────────────────────────────────────────────────────────
  useEffect(() => {
    const map = mapRef.current
    if (!map || !styleUrl || styleUrl === loadedStyleUrlRef.current) return

    loadedStyleUrlRef.current = styleUrl
    setActiveStyleUrl(styleUrl)
    setIsReady(false)
    setStreetLabelLayerIds([])

    let switchReadyFired = false
    let switchFallbackTimer: ReturnType<typeof setTimeout>

    const markSwitchReady = () => {
      if (switchReadyFired) return
      switchReadyFired = true
      clearTimeout(switchFallbackTimer)
      requestAnimationFrame(() => {
        try {
          setStreetLabelLayerIds(extractStreetLabelLayerIds(map))
        } catch (e) {
          console.warn('[useMapInstance] extractStreetLabelLayerIds (style switch) failed:', e)
        }
        setIsReady(true)
      })
    }

    map.setStyle(styleUrl)
    map.once('styledata', markSwitchReady)

    switchFallbackTimer = setTimeout(() => {
      const style = map.getStyle()
      if (style?.layers?.length) {
        console.warn('[useMapInstance] "styledata" event timeout after style switch — forcing ready')
        markSwitchReady()
      }
    }, 4000)

    return () => {
      clearTimeout(switchFallbackTimer)
    }
  }, [styleUrl])

  return { map: mapInstance, isReady, streetLabelLayerIds }
}
