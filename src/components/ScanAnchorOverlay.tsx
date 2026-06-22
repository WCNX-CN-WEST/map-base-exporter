// Scan Pack -- fixed-size draggable master bounding box overlay.
//
// Unlike SelectionOverlay (which lets the user freely draw and resize),
// this overlay renders a LOCKED rectangle whose dimensions come from the
// scan grid settings. The user can only MOVE it -- dragging repositions
// the NW anchor point on the ground.
//
// The internal tile grid is drawn inside the master box so the user can
// see exactly how many tiles there are and which order they'll be captured.
// Serpentine order shows alternating left-to-right / right-to-left arrows per row.

import { useRef, useState, useCallback, useEffect } from 'react'
import type { Map as MapLibreMap } from 'maplibre-gl'
import type { ScanGrid, ScanSettings } from '../scan/scanSpec'

interface Props {
  map: MapLibreMap | null
  grid: ScanGrid
  settings: ScanSettings
  /** NW corner anchor [lng, lat] */
  anchor: [number, number]
  onAnchorChange: (anchor: [number, number]) => void
}

interface Pt { x: number; y: number }

export function ScanAnchorOverlay({ map, grid, settings, anchor, onAnchorChange }: Props) {
  // Force re-projection on every map move
  const [, setTick] = useState(0)
  const dragStart = useRef<{ clientX: number; clientY: number; anchor: [number, number] } | null>(null)

  useEffect(() => {
    if (!map) return
    const onMove = () => setTick(t => (t + 1) % 1_000_000)
    map.on('move', onMove)
    map.on('zoom', onMove)
    return () => { map.off('move', onMove); map.off('zoom', onMove) }
  }, [map])

  // Safety valve: if the pointer is released outside the box (e.g. over the
  // panel or browser chrome), the box's onPointerUp won't fire. Clear drag
  // state on the window so the grid doesn't keep chasing the cursor.
  useEffect(() => {
    const cancel = () => { dragStart.current = null }
    window.addEventListener('pointerup', cancel)
    window.addEventListener('pointercancel', cancel)
    return () => {
      window.removeEventListener('pointerup', cancel)
      window.removeEventListener('pointercancel', cancel)
    }
  }, [])

  // Project [lng, lat] -> screen px relative to the map container
  const project = useCallback((lng: number, lat: number): Pt | null => {
    if (!map) return null
    const p = map.project([lng, lat])
    return { x: p.x, y: p.y }
  }, [map])

  // The four corners of the master bbox
  const [west, south, east, north] = grid.masterBbox
  const nw = project(west, north)
  const se = project(east, south)
  if (!nw || !se) return null

  const boxLeft = Math.min(nw.x, se.x)
  const boxTop = Math.min(nw.y, se.y)
  const boxW = Math.abs(se.x - nw.x)
  const boxH = Math.abs(se.y - nw.y)

  // Grid lines: project each tile's right/bottom edges
  const colLines: number[] = []
  for (let c = 1; c < settings.cols; c++) {
    const tileLng = west + c * (grid.tileGeoW * (1 - settings.overlapFraction))
    const p = project(tileLng, north)
    if (p) colLines.push(p.x - boxLeft)
  }
  const rowLines: number[] = []
  for (let r = 1; r < settings.rows; r++) {
    const tileLat = north - r * (grid.tileGeoH * (1 - settings.overlapFraction))
    const p = project(west, tileLat)
    if (p) rowLines.push(p.y - boxTop)
  }

  // Tile index labels: centre of each tile cell
  const tileLabels: { x: number; y: number; label: string }[] = []
  for (const tile of grid.tiles) {
    const tileLng = west + tile.col * (grid.tileGeoW * (1 - settings.overlapFraction))
    const tileLat = north - tile.row * (grid.tileGeoH * (1 - settings.overlapFraction))
    const tileEast = tileLng + grid.tileGeoW
    const tileSouth = tileLat - grid.tileGeoH
    const pNw = project(tileLng, tileLat)
    const pSe = project(tileEast, tileSouth)
    if (!pNw || !pSe) continue
    tileLabels.push({
      x: (pNw.x + pSe.x) / 2 - boxLeft,
      y: (pNw.y + pSe.y) / 2 - boxTop,
      label: String(tile.index),
    })
  }

  // Drag handling -- move the whole grid by offsetting the anchor.
  //
  // IMPORTANT: setPointerCapture must be called on e.currentTarget (the
  // draggable box itself) -- NOT on a parent element. Capturing on a parent
  // with pointer-events:none silently fails, leaving onPointerUp unreachable
  // when the cursor leaves the box, which causes the "stuck drag" bug.
  function onPointerDown(e: React.PointerEvent) {
    e.preventDefault()
    e.stopPropagation()
    // Capture on THIS element so pointermove + pointerup always come here,
    // even when the cursor moves outside the box mid-drag.
    ;(e.currentTarget as HTMLElement).setPointerCapture(e.pointerId)
    dragStart.current = { clientX: e.clientX, clientY: e.clientY, anchor: [...anchor] as [number, number] }
  }

  function onPointerMove(e: React.PointerEvent) {
    if (!dragStart.current || !map) return
    const dx = e.clientX - dragStart.current.clientX
    const dy = e.clientY - dragStart.current.clientY
    // Convert pixel delta to geographic delta using the map's unproject
    const originPx = map.project(dragStart.current.anchor)
    const newLngLat = map.unproject([originPx.x + dx, originPx.y + dy])
    onAnchorChange([newLngLat.lng, newLngLat.lat])
  }

  function onPointerUp(e: React.PointerEvent) {
    ;(e.currentTarget as HTMLElement).releasePointerCapture(e.pointerId)
    dragStart.current = null
  }

  return (
    <div
      className="scan-anchor-overlay"
      style={{ position: 'absolute', inset: 0, pointerEvents: 'none' }}
    >
      {/* Master bounding box */}
      <div
        style={{
          position: 'absolute',
          left: boxLeft,
          top: boxTop,
          width: boxW,
          height: boxH,
          boxSizing: 'border-box',
          border: '2.5px solid #0066ff',
          background: 'rgba(0, 102, 255, 0.06)',
          cursor: 'move',
          pointerEvents: 'auto',
          userSelect: 'none',
        }}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerCancel={onPointerUp}
      >
        {/* Internal column grid lines */}
        {colLines.map((x, i) => (
          <div
            key={`col-${i}`}
            style={{
              position: 'absolute',
              left: x,
              top: 0,
              width: 1,
              height: '100%',
              background: 'rgba(0, 102, 255, 0.35)',
              pointerEvents: 'none',
            }}
          />
        ))}

        {/* Internal row grid lines */}
        {rowLines.map((y, i) => (
          <div
            key={`row-${i}`}
            style={{
              position: 'absolute',
              left: 0,
              top: y,
              width: '100%',
              height: 1,
              background: 'rgba(0, 102, 255, 0.35)',
              pointerEvents: 'none',
            }}
          />
        ))}

        {/* Tile index numbers */}
        {tileLabels.map((t, i) => (
          <div
            key={`lbl-${i}`}
            style={{
              position: 'absolute',
              left: t.x,
              top: t.y,
              transform: 'translate(-50%, -50%)',
              background: 'rgba(0, 102, 255, 0.82)',
              color: '#fff',
              borderRadius: 4,
              fontSize: 11,
              fontWeight: 700,
              padding: '1px 5px',
              pointerEvents: 'none',
              whiteSpace: 'nowrap',
            }}
          >
            {t.label}
          </div>
        ))}

        {/* Move cursor hint badge */}
        <div
          style={{
            position: 'absolute',
            top: 4,
            left: 4,
            background: '#0066ff',
            color: '#fff',
            fontSize: 10,
            fontWeight: 600,
            padding: '2px 6px',
            borderRadius: 3,
            pointerEvents: 'none',
          }}
        >
          Drag to position
        </div>
      </div>
    </div>
  )
}
