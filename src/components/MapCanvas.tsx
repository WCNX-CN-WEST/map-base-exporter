// Live full-colour MapLibre canvas. Holds the map container div and wires up
// the street-name overlay and the rectangle selection overlay.
import { useRef, useEffect } from 'react'
import { useMapInstance } from '../hooks/useMapInstance'
import { useTextOverlay } from '../hooks/useTextOverlay'
import { TextOverlay } from './TextOverlay'
import { SelectionOverlay } from './SelectionOverlay'
import { setLayerGroupVisibility } from '../map/styleUtils'
import { MAP_CONTAINER_CLASS } from '../map/constants'
import type { Map as MapLibreMap } from 'maplibre-gl'
import type { Frame } from '../selection/frame'

interface Props {
  labelScale: number
  showLabels: boolean
  mode: 'draw' | 'edit'
  showSelectionBox: boolean
  frames: Frame[]
  activeId: string | null
  onActiveChange: (id: string | null) => void
  onFramesChange: (frames: Frame[]) => void
  onMapReady: (map: MapLibreMap) => void
  /** Active tile style URL — passed from App when user switches styles. */
  styleUrl?: string
}

export function MapCanvas({
  labelScale,
  showLabels,
  mode,
  showSelectionBox,
  frames,
  activeId,
  onActiveChange,
  onFramesChange,
  onMapReady,
  styleUrl,
}: Props) {
  const containerRef = useRef<HTMLDivElement>(null)
  const { map, isReady, streetLabelLayerIds } = useMapInstance(containerRef, styleUrl)

  useEffect(() => {
    if (map && isReady) onMapReady(map)
  }, [map, isReady, onMapReady])

  // Hide GL-baked street names while our SVG overlay is showing them, so
  // street names never render twice on the live canvas.
  useEffect(() => {
    if (!map || !isReady) return
    setLayerGroupVisibility(map, streetLabelLayerIds, !showLabels)
  }, [map, isReady, streetLabelLayerIds, showLabels])

  const labels = useTextOverlay(map, isReady, streetLabelLayerIds, labelScale, showLabels)

  return (
    <div className="map-stage">
      <div ref={containerRef} className={MAP_CONTAINER_CLASS} />
      {showLabels && <TextOverlay labels={labels} />}
      <SelectionOverlay
        map={map}
        mode={mode}
        showBoxes={showSelectionBox || mode === 'draw'}
        frames={frames}
        activeId={activeId}
        onActiveChange={onActiveChange}
        onFramesChange={onFramesChange}
      />
    </div>
  )
}
