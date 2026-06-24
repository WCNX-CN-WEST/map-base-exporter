// Multi-frame selection tool.
//
// Two modes:
//   - 'draw': drag on empty map to add a new export frame. Stay in draw mode so
//     several regions can be marked in a row.
//   - 'edit' (default): move a frame by dragging its body, or resize it with the
//     eight handles on the active frame. Empty-space drags fall through to the
//     map so panning still works.
//
// Every frame is stored as a geographic bounding box and re-projected to the
// screen on each map move, so frames stay locked to the ground. While a frame is
// being dragged or resized we hold a live screen-pixel preview for that one
// frame and convert it back to geographic bounds on release.
import { useRef, useState, useCallback, useEffect } from 'react'
import type { Map as MapLibreMap } from 'maplibre-gl'
import type { Bounds } from '../print/viewportUtils'
import { makeFrameId, type Frame } from '../selection/frame'

type Mode = 'draw' | 'edit'

interface Props {
  map: MapLibreMap | null
  mode: Mode
  /** Whether to draw committed frames at all. */
  showBoxes: boolean
  frames: Frame[]
  activeId: string | null
  onActiveChange: (id: string | null) => void
  onFramesChange: (frames: Frame[]) => void
}

interface ScreenRect {
  x: number
  y: number
  w: number
  h: number
}

type HandleId = 'n' | 's' | 'e' | 'w' | 'ne' | 'nw' | 'se' | 'sw'
const HANDLES: HandleId[] = ['nw', 'n', 'ne', 'e', 'se', 's', 'sw', 'w']
const HANDLE_CURSOR: Record<HandleId, string> = {
  n: 'ns-resize',
  s: 'ns-resize',
  e: 'ew-resize',
  w: 'ew-resize',
  ne: 'nesw-resize',
  sw: 'nesw-resize',
  nw: 'nwse-resize',
  se: 'nwse-resize',
}

const MIN_PX = 16

interface DragState {
  id: string
  kind: 'move' | 'resize'
  handle?: HandleId
  startX: number
  startY: number
  startRect: ScreenRect
}

export function SelectionOverlay({
  map,
  mode,
  showBoxes,
  frames,
  activeId,
  onActiveChange,
  onFramesChange,
}: Props) {
  const surfaceRef = useRef<HTMLDivElement>(null)
  const [drawRect, setDrawRect] = useState<ScreenRect | null>(null)
  const drawing = useRef(false)
  const drawAnchor = useRef<{ x: number; y: number }>({ x: 0, y: 0 })
  const dragState = useRef<DragState | null>(null)
  const [preview, setPreview] = useState<{ id: string; rect: ScreenRect } | null>(null)
  // Bumped on every map move to force re-projection of committed frames.
  const [, setTick] = useState(0)

  useEffect(() => {
    if (!map) return
    const onMove = () => setTick(t => (t + 1) % 1_000_000)
    map.on('move', onMove)
    map.on('zoom', onMove)
    return () => {
      map.off('move', onMove)
      map.off('zoom', onMove)
    }
  }, [map])

  // Project a frame's geographic bounds to a screen rect in surface-local px.
  const projectFrame = useCallback(
    (f: Frame): ScreenRect | null => {
      if (!map) return null
      const [west, south, east, north] = f.bounds
      const nw = map.project([west, north])
      const se = map.project([east, south])
      const x = Math.min(nw.x, se.x)
      const y = Math.min(nw.y, se.y)
      return { x, y, w: Math.abs(se.x - nw.x), h: Math.abs(se.y - nw.y) }
    },
    [map]
  )

  // Screen rect -> geographic bbox (top of screen = north).
  const rectToBounds = useCallback(
    (r: ScreenRect): Bounds | null => {
      if (!map) return null
      const nw = map.unproject([r.x, r.y])
      const se = map.unproject([r.x + r.w, r.y + r.h])
      return [nw.lng, se.lat, se.lng, nw.lat]
    },
    [map]
  )

  const toLocal = useCallback((clientX: number, clientY: number) => {
    const r = surfaceRef.current!.getBoundingClientRect()
    return { x: clientX - r.left, y: clientY - r.top }
  }, [])

  // ---- Drawing a brand-new frame (draw mode) -----------------------------
  function onSurfacePointerDown(e: React.PointerEvent) {
    if (mode !== 'draw') return
    surfaceRef.current?.setPointerCapture(e.pointerId)
    const p = toLocal(e.clientX, e.clientY)
    drawing.current = true
    drawAnchor.current = { x: p.x, y: p.y }
    setDrawRect({ x: p.x, y: p.y, w: 0, h: 0 })
  }

  function onSurfacePointerMove(e: React.PointerEvent) {
    if (!drawing.current) return
    const p = toLocal(e.clientX, e.clientY)
    const a = drawAnchor.current
    setDrawRect({ x: Math.min(a.x, p.x), y: Math.min(a.y, p.y), w: Math.abs(p.x - a.x), h: Math.abs(p.y - a.y) })
  }

  function onSurfacePointerUp(e: React.PointerEvent) {
    if (!drawing.current) return
    drawing.current = false
    surfaceRef.current?.releasePointerCapture(e.pointerId)
    const rect = drawRect
    setDrawRect(null)
    if (!rect || rect.w < MIN_PX || rect.h < MIN_PX) return
    const bounds = rectToBounds(rect)
    if (!bounds) return
    const f: Frame = { id: makeFrameId(), bounds, name: '' }
    onFramesChange([...frames, f])
    onActiveChange(f.id)
  }

  // ---- Moving / resizing an existing frame (edit mode) -------------------
  const onWinMove = useCallback((e: PointerEvent) => {
    const d = dragState.current
    if (!d) return
    const dx = e.clientX - d.startX
    const dy = e.clientY - d.startY
    const rect = d.kind === 'move' ? moveRect(d.startRect, dx, dy) : resizeRect(d.startRect, d.handle!, dx, dy)
    setPreview({ id: d.id, rect })
  }, [])

  const onWinUp = useCallback(() => {
    const d = dragState.current
    window.removeEventListener('pointermove', onWinMove)
    window.removeEventListener('pointerup', onWinUp)
    dragState.current = null
    setPreview(prev => {
      if (d && prev && prev.id === d.id) {
        const bounds = rectToBounds(prev.rect)
        if (bounds) {
          onFramesChange(frames.map(f => (f.id === d.id ? { ...f, bounds } : f)))
        }
      }
      return null
    })
  }, [frames, onFramesChange, onWinMove, rectToBounds])

  const beginEditDrag = useCallback(
    (e: React.PointerEvent, frame: Frame, kind: 'move' | 'resize', handle?: HandleId) => {
      if (mode !== 'edit') return
      e.stopPropagation()
      e.preventDefault()
      const startRect = projectFrame(frame)
      if (!startRect) return
      onActiveChange(frame.id)
      dragState.current = { id: frame.id, kind, handle, startX: e.clientX, startY: e.clientY, startRect }
      setPreview({ id: frame.id, rect: startRect })
      window.addEventListener('pointermove', onWinMove)
      window.addEventListener('pointerup', onWinUp)
    },
    [mode, projectFrame, onActiveChange, onWinMove, onWinUp]
  )

  // Clean up window listeners if the component unmounts mid-drag.
  useEffect(() => {
    return () => {
      window.removeEventListener('pointermove', onWinMove)
      window.removeEventListener('pointerup', onWinUp)
    }
  }, [onWinMove, onWinUp])

  const surfaceInteractive = mode === 'draw'

  // Forward wheel events from the overlay to MapLibre's container so zoom
  // works even when the cursor is over selection frames or their grip handles.
  // The overlay and MapLibre canvas are siblings in the DOM, so wheel events
  // on the overlay would normally never bubble to MapLibre. Re-dispatching
  // directly on map.getContainer() routes them to MapLibre's scroll handler.
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
    <div
      ref={surfaceRef}
      className="selection-overlay"
      style={{
        pointerEvents: surfaceInteractive ? 'auto' : 'none',
        cursor: surfaceInteractive ? 'crosshair' : 'default',
      }}
      onPointerDown={onSurfacePointerDown}
      onPointerMove={onSurfacePointerMove}
      onPointerUp={onSurfacePointerUp}
      onPointerCancel={() => {
        drawing.current = false
        setDrawRect(null)
      }}
      onWheel={forwardWheel}
    >
      {showBoxes &&
        frames.map((f, i) => {
          const rect = preview && preview.id === f.id ? preview.rect : projectFrame(f)
          if (!rect) return null
          const isActive = f.id === activeId
          const style: React.CSSProperties = { left: rect.x, top: rect.y, width: rect.w, height: rect.h }
          const label = f.name.trim() || `Region ${i + 1}`
          return (
            <div
              key={f.id}
              className={`selection-rect committed${isActive ? ' active' : ''}`}
              style={{ ...style, pointerEvents: 'none' }}
            >
              <span className="frame-badge">{label}</span>

              {/* Four thin border-grip strips — only these intercept pointer
                  events. The frame interior stays pointer-events:none so the
                  map beneath remains pan/zoomable. Wheel events forwarded here
                  because the outer surface div has pointer-events:none in edit
                  mode and won't receive wheel events directly. */}
              {mode === 'edit' && (['n','s','w','e'] as const).map(side => (
                <div
                  key={side}
                  className={`frame-grip frame-grip-${side}`}
                  onPointerDown={e => beginEditDrag(e, f, 'move')}
                  onWheel={forwardWheel}
                />
              ))}

              {mode === 'edit' &&
                isActive &&
                HANDLES.map(h => (
                  <span
                    key={h}
                    className={`frame-handle h-${h}`}
                    style={{ cursor: HANDLE_CURSOR[h], pointerEvents: 'auto' }}
                    onPointerDown={e => beginEditDrag(e, f, 'resize', h)}
                    onWheel={forwardWheel}
                  />
                ))}
            </div>
          )
        })}

      {drawRect && (
        <div
          className="selection-rect drawing"
          style={{ left: drawRect.x, top: drawRect.y, width: drawRect.w, height: drawRect.h }}
        />
      )}
    </div>
  )
}

// ---- pure geometry helpers ----------------------------------------------

function moveRect(r: ScreenRect, dx: number, dy: number): ScreenRect {
  return { x: r.x + dx, y: r.y + dy, w: r.w, h: r.h }
}

function resizeRect(r: ScreenRect, handle: HandleId, dx: number, dy: number): ScreenRect {
  let left = r.x
  let top = r.y
  let right = r.x + r.w
  let bottom = r.y + r.h

  if (handle.includes('w')) left += dx
  if (handle.includes('e')) right += dx
  if (handle.includes('n')) top += dy
  if (handle.includes('s')) bottom += dy

  // Keep a minimum size without flipping the rectangle.
  if (right - left < MIN_PX) {
    if (handle.includes('w')) left = right - MIN_PX
    else right = left + MIN_PX
  }
  if (bottom - top < MIN_PX) {
    if (handle.includes('n')) top = bottom - MIN_PX
    else bottom = top + MIN_PX
  }

  return { x: left, y: top, w: right - left, h: bottom - top }
}
