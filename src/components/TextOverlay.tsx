// Dedicated street-name layer, rendered as SVG ABOVE the GL canvas.
// Pointer-transparent, so all map interactions pass through.
import type { LabelPlacement } from '../hooks/useTextOverlay'

interface Props {
  labels: LabelPlacement[]
}

export function TextOverlay({ labels }: Props) {
  return (
    <svg className="text-overlay" aria-hidden="true">
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
