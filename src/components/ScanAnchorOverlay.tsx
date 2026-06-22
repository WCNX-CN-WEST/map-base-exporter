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
  // Force re-projection on every map move / zoom.
  const [, setTick] = useState(0)
  // Cleanup function for any active drag; called if the component unmounts mid-drag.
  const cleanupDragRef = useRef<(() => void) | null>(null)

  useEffect(() => {
    if (!map) return
    const onMove = () => setTick(t => (t + 1) % 1_000_000)
    map.on('move', onMove)
    map.on('zoom', onMove)
    return () => { map.off('move', onMove); map.off('zoom', onMove) }
  }, [map])

  // Cancel any in-progress drag if the component unmounts mid-gesture.
  useEffect(() => {
    return () => { cleanupDragRef.current?.() }
  }, [])

  // Forward wheel events from the draggable box to MapLibre's container so
  // scroll-zoom works even when the cursor is over the grid.
  // The overlay div and the MapLibre canvas are siblings in the DOM (different
  // subtrees), so wheel events on the overlay never bubble to the canvas.
  // Re-dispatching directly on map.getContainer() routes them to MapLibre's
  // own scroll handler without triggering any extra React state.
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

  // Project [lng, lat] -> screen px relative to the map container.
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
  const boxTop  = Math.min(nw.y, se.y)
  const boxW    = Math.abs(se.x - nw.x)
  const boxH    = Math.abs(se.y - nw.y)

  // Grid lines: project each tile's right / bottom edges.
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

  // Tile index labels: centre of each tile cell.
  const tileLabels: { x: number; y: number; label: string }[] = []
  for (const tile of grid.tiles) {
    const tileLng  = west  + tile.col * (grid.tileGeoW * (1 - settings.overlapFraction))
    const tileLat  = north - tile.row * (grid.tileGeoH * (1 - settings.overlapFraction))
    const tileEast  = tileLng + grid.tileGeoW
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

  // Drag handling -- move the whole grid by offsetting the NW anchor.
  //
  // Uses window-level pointermove / pointerup listeners (same pattern as
  // SelectionOverlay's beginEditDrag) instead of setPointerCapture + React
  // synthetic events.  setPointerCapture should work in theory, but in
  // practice React's event delegation can drop captured pointermove events
  // when the cursor leaves the element, causing the "stays put then snaps"
  // behaviour the user observed.  window.addEventListener bypasses React's
  // delegation entirely: the handler fires unconditionally regardless of
  // where the cursor is.
  function onPointerDown(e: React.PointerEvent<HTMLDivElement>) {
    e.preventDefault()
    e.stopPropagation()

    // Snapshot the anchor and the pointer position at mousedown.
    const startAnchor: [number, number] = [anchor[0], anchor[1]]
    const startX = e.clientX
    const startY = e.clientY

    const onMove = (ev: PointerEvent) => {
      if (!map) return
      const dx = ev.clientX - startX
      const dy = ev.clientY - startY
      // Re-project the drag-start anchor in the CURRENT map view, then add
      // the total pixel delta.  This is zoom-safe: map.project() always
      // returns coordinates in the current viewport's pixel space, so even
      // if the user accidentally scrolled the map, the math stays correct.
      const originPx  = map.project(startAnchor)
      const newLngLat = map.unproject([originPx.x + dx, originPx.y + dy])
      onAnchorChange([newLngLat.lng, newLngLat.lat])
    }

    const onUp = () => {
      cleanupDragRef.current = null
      window.removeEventListener('pointermove', onMove)
      window.removeEventListener('pointerup',   onUp)
      window.removeEventListener('pointercancel', onUp)
    }

    cleanupDragRef.current = onUp
    window.addEventListener('pointermove', onMove)
    window.addEventListener('pointerup',   onUp)
    window.addEventListener('pointercancel', onUp)
  }

  return (
    <div
      className="scan-anchor-overlay"
      style={{ position: 'absolute', inset: 0, pointerEvents: 'none' }}
    >
      {/* Master bounding box -- draggable, intercepts pointer events but
          forwards wheel events to MapLibre so scroll-zoom still works. */}
      <div
        style={{
          position: 'absolute',
          left: boxLeft,
          top:  boxTop,
          width:  boxW,
          height: boxH,
          boxSizing: 'border-box',
          border: '2.5px solid #0066ff',
          background: 'rgba(0, 102, 255, 0.06)',
          cursor: 'move',
          pointerEvents: 'auto',
          userSelect: 'none',
        }}
        onPointerDown={onPointerDown}
        onWheel={forwardWheel}
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
              top:  t.y,
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
