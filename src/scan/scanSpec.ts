// Scan Pack -- grid math and tile ordering.
//
// The master bounding box is DERIVED from the tile settings, not the other
// way around. The user chooses page size + DPI + detail + a grid (cols x rows)
// and an anchor point (top-left lng/lat). The system computes:
//   the geographic size of one tile at the render zoom
//   the step between tile origins (80% of tile size -- 20% overlap)
//   the master bbox that results from the full grid
//
// All tiles share the same zoom level, so every rendered JPEG has identical
// pixel dimensions and the same ground resolution. This is what ICE needs.

import {
  lockViewport,
  boundsForViewport,
  type Bounds,
  type LockedViewport,
} from '../print/viewportUtils'
import { resolvePageSpec, resolveRenderSpec } from '../print/printSpec'
import type { PageSizeId, Orientation, Dpi } from '../print/printSpec'

export type ScanOrder = 'serpentine' | 'zigzag'

export interface ScanSettings {
  cols: number
  rows: number
  order: ScanOrder
  /** Overlap between adjacent tiles as a fraction (0.20 = 20%). */
  overlapFraction: number
  // Tile output settings -- same controls as the existing export panel.
  tileSizeId: PageSizeId
  tileOrientation: Orientation
  tileDpi: Dpi
  tileDetail: number
}

export interface ScanTile {
  /** 1-based index in scan order (the order ICE receives the files). */
  index: number
  row: number
  col: number
  bbox: Bounds
  filename: string
}

export interface ScanGrid {
  tiles: ScanTile[]
  masterBbox: Bounds
  /** Pixel dimensions of every output JPEG (identical for all tiles). */
  tileRenderWidthPx: number
  tileRenderHeightPx: number
  /** The zoom level shared by all tiles. */
  zoom: number
  /** Geographic width of one tile in degrees longitude. */
  tileGeoW: number
  /** Geographic height of one tile in degrees latitude. */
  tileGeoH: number
}

/**
 * Compute the full scan grid from a top-left anchor point and settings.
 *
 * The anchor is the NW corner of tile [row=0, col=0]. From there the grid
 * expands east and south, with each tile step = tileGeo x (1 - overlap).
 *
 * Tile geographic coverage is derived from the SCREEN view at the time the
 * anchor is placed (viewZoom + screen pixel dimensions). This ensures what
 * you see on screen is what gets exported. The print settings (DPI, page
 * size, detail) control output quality, not geographic coverage.
 *
 * viewZoom / screenW / screenH must be supplied; they are captured from the
 * live map when the user clicks "Place grid on map".
 */
export function computeScanGrid(
  anchor: [number, number], // [lng, lat] of the NW corner
  settings: ScanSettings,
  viewZoom: number,
  screenW: number,
  screenH: number
): ScanGrid {
  const { cols, rows, overlapFraction, order } = settings

  // Resolve tile pixel dimensions (for the output JPEG, not for geo sizing)
  const pageSpec = resolvePageSpec(
    settings.tileSizeId,
    settings.tileOrientation,
    settings.tileDpi
  )
  const renderSpec = resolveRenderSpec(pageSpec, settings.tileDetail)
  const tileRenderW = renderSpec.renderWidthPx
  const tileRenderH = renderSpec.renderHeightPx

  const [anchorLng, anchorLat] = anchor

  // Tile geographic size = what the screen shows at the current view zoom.
  // Each tile covers the same geographic extent as one full-screen view,
  // so the on-screen grid overlay exactly matches the exported tiles.
  const screenVp: LockedViewport = { center: [anchorLng, anchorLat], zoom: viewZoom }
  const screenBounds = boundsForViewport(screenVp, screenW, screenH)
  const tileGeoW = screenBounds[2] - screenBounds[0] // east - west (degrees lng)
  const tileGeoH = screenBounds[3] - screenBounds[1] // north - south (degrees lat)

  // Export zoom: fit the tile's geographic bbox into the render canvas.
  // All tiles share the same geographic dimensions so they all get the
  // same render zoom -- ICE can stitch them seamlessly.
  const sampleTileBbox: Bounds = [anchorLng, anchorLat - tileGeoH, anchorLng + tileGeoW, anchorLat]
  const zoom = lockViewport(sampleTileBbox, tileRenderW, tileRenderH, 0).zoom

  const stepX = tileGeoW * (1 - overlapFraction)
  const stepY = tileGeoH * (1 - overlapFraction)

  // Generate ordered tiles
  const tiles: ScanTile[] = []
  let index = 1

  for (let r = 0; r < rows; r++) {
    const colIndices: number[] = []
    if (order === 'serpentine' && r % 2 === 1) {
      // Odd rows go right to left in serpentine mode
      for (let c = cols - 1; c >= 0; c--) colIndices.push(c)
    } else {
      // Even rows (and all rows in zigzag) go left to right
      for (let c = 0; c < cols; c++) colIndices.push(c)
    }

    for (const c of colIndices) {
      // NW corner of this tile
      const west = anchorLng + c * stepX
      const north = anchorLat - r * stepY
      const east = west + tileGeoW
      const south = north - tileGeoH

      const idxStr = String(index).padStart(3, '0')
      const filename = `tile_${idxStr}_r${String(r).padStart(2, '0')}_c${String(c).padStart(2, '0')}.jpg`

      tiles.push({ index, row: r, col: c, bbox: [west, south, east, north], filename })
      index++
    }
  }

  // Master bbox = union of all tiles
  const allWest = tiles.map(t => t.bbox[0])
  const allSouth = tiles.map(t => t.bbox[1])
  const allEast = tiles.map(t => t.bbox[2])
  const allNorth = tiles.map(t => t.bbox[3])
  const masterBbox: Bounds = [
    Math.min(...allWest),
    Math.min(...allSouth),
    Math.max(...allEast),
    Math.max(...allNorth),
  ]

  return {
    tiles,
    masterBbox,
    tileRenderWidthPx: tileRenderW,
    tileRenderHeightPx: tileRenderH,
    zoom,
    tileGeoW,
    tileGeoH,
  }
}

/** Default scan settings -- reasonable starting point. */
export const DEFAULT_SCAN_SETTINGS: ScanSettings = {
  cols: 3,
  rows: 3,
  order: 'serpentine',
  overlapFraction: 0.2,
  tileSizeId: 'letter',
  tileOrientation: 'landscape',
  tileDpi: 150,
  tileDetail: 2,
}
