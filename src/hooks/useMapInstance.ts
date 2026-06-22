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

    const onStyleReady = () => {
      requestAnimationFrame(() => {
        setStreetLabelLayerIds(extractStreetLabelLayerIds(map))
        setIsReady(true)
      })
    }
    map.once('load', onStyleReady)

    mapRef.current = map
    setMapInstance(map)

    return () => {
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

    map.setStyle(styleUrl)
    map.once('styledata', () => {
      requestAnimationFrame(() => {
        setStreetLabelLayerIds(extractStreetLabelLayerIds(map))
        setIsReady(true)
      })
    })
  }, [styleUrl])

  return { map: mapInstance, isReady, streetLabelLayerIds }
}
