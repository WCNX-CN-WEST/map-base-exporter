// Street-name overlay for the on-screen map.
//
// Thin React wrapper around the shared placement module in map/labelPlacement.
// The same module powers the print export, so screen and paper always agree on
// which names appear and where.
import { useState, useEffect, useCallback, useRef } from 'react'
import type { Map as MapLibreMap } from 'maplibre-gl'
import { MIN_LABEL_ZOOM } from '../map/constants'
import {
  collectStreetLines,
  fontSizeForZoom,
  placeLabels,
  resolveStreetSources,
  type LabelPlacement,
  type Pt,
  type SourceTarget,
} from '../map/labelPlacement'

export type { LabelPlacement }

export function useTextOverlay(
  map: MapLibreMap | null,
  isReady: boolean,
  streetLabelLayerIds: string[],
  labelScale: number,
  enabled: boolean
): LabelPlacement[] {
  const [labels, setLabels] = useState<LabelPlacement[]>([])
  const sourcesRef = useRef<SourceTarget[]>([])

  const recompute = useCallback(() => {
    if (!map || !enabled || sourcesRef.current.length === 0) {
      setLabels([])
      return
    }
    const zoom = map.getZoom()
    if (zoom < MIN_LABEL_ZOOM) {
      setLabels([])
      return
    }

    const canvas = map.getCanvas()
    const W = canvas.clientWidth
    const H = canvas.clientHeight
    const fontSize = fontSizeForZoom(zoom, labelScale)

    const byName = new Map<string, Pt[][]>()
    collectStreetLines(map, sourcesRef.current, byName)
    setLabels(placeLabels(byName, fontSize, W, H))
  }, [map, enabled, labelScale])

  // Resolve tile sources once per style.
  useEffect(() => {
    if (!map || !isReady) return
    sourcesRef.current = resolveStreetSources(map, streetLabelLayerIds)
    recompute()
  }, [map, isReady, streetLabelLayerIds, recompute])

  // Recompute when the camera settles or new tiles arrive (debounced).
  useEffect(() => {
    if (!map || !isReady || !enabled) return
    let timer: ReturnType<typeof setTimeout> | null = null
    const onSettle = () => {
      if (timer) clearTimeout(timer)
      timer = setTimeout(recompute, 150)
    }
    map.on('moveend', onSettle)
    map.on('zoomend', onSettle)
    map.on('sourcedata', onSettle)
    return () => {
      if (timer) clearTimeout(timer)
      map.off('moveend', onSettle)
      map.off('zoomend', onSettle)
      map.off('sourcedata', onSettle)
    }
  }, [map, isReady, enabled, recompute])

  return labels
}
