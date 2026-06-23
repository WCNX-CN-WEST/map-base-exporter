// Dedicated street-name layer, rendered as SVG ABOVE the GL canvas.
// Pointer-transparent, so all map interactions pass through.
import { useCallback } from 'react'
import type { Map as MapLibreMap } from 'maplibre-gl'
import type { LabelPlacement } from '../hooks/useTextOverlay'

interface Props {
  labels: LabelPlacement[]
  map?: MapLibreMap | null
}

export function TextOverlay({ labels, map }: Props) {
  // Forward wheel events to MapLibre for zoom, even though SVG has pointer-events:none,
  // because some SVG implementations still capture wheel events.
  const forwardWheel = useCallback((e: React.WheelEvent) => {
    if (!map) return
    map.getContainer().dispatchEvent(
      new WheelEvent('wheel', {
        deltaX: e.nativeEvent.deltaX,
        deltaY: e.nativeEvent.deltaY,
        deltaZ: e.nativeEvent.deltaZ,
        deltaMode: e.nativeEvent.deltaMode,
        ctrlKey: e.nativeEvent.ctrlKey,
        metaKey: e.nativeEvent.metaKey,
        shiftKey: e.nativeEvent.shiftKey,
        altKey: e.nativeEvent.altKey,
        clientX: e.nativeEvent.clientX,
        clientY: e.nativeEvent.clientY,
        bubbles: true,
        cancelable: true,
      })
    )
  }, [map])

  return (
    <svg className="text-overlay" aria-hidden="true" onWheel={forwardWheel}>
      {labels.map(l => (
        <text
          key={l.id}
          x={l.x}
          y={l.y}
          transform={`rotate(${l.angle} ${l.x} ${l.y})`}
          fontSize={l.fontSize}
          className="street-label"
          textAnchor="middle"
          dominantBaseline="central"
        >
          {l.name}
        </text>
      ))}
    </svg>
  )
}
