// Synchronized Web-Mercator viewport math.
//
// One math path computes the locked { center, zoom } that fits a geographic
// bounding box inside a pixel frame. The export renderer and the on-screen
// preview both call these, so screen and paper can never disagree on scale.
//
// MapLibre world size = TILE_BASE * 2^zoom px (TILE_BASE = 512).

const TILE_BASE = 512

/** [west, south, east, north] */
export type Bounds = [number, number, number, number]

export interface LockedViewport {
  center: [number, number]
  zoom: number
}

/** Normalized Web-Mercator projection: lng/lat -> x,y in [0,1]. */
export function mercator(lng: number, lat: number): { x: number; y: number } {
  const x = (lng + 180) / 360
  const clamped = Math.max(-85.051129, Math.min(85.051129, lat))
  const s = Math.sin((clamped * Math.PI) / 180)
  const y = 0.5 - Math.log((1 + s) / (1 - s)) / (4 * Math.PI)
  return { x, y }
}

/** Inverse: normalized mercator x,y -> lng/lat. */
export function unmercator(x: number, y: number): [number, number] {
  const lng = x * 360 - 180
  const n = Math.PI * (1 - 2 * y)
  const lat = (180 / Math.PI) * Math.atan(0.5 * (Math.exp(n) - Math.exp(-n)))
  return [lng, lat]
}

/**
 * The exact { center, zoom } that fits `bounds` inside a frame of
 * wPx x hPx with `padding` px on all sides. Deterministic.
 */
export function lockViewport(
  bounds: Bounds,
  wPx: number,
  hPx: number,
  padding = 0
): LockedViewport {
  const [west, south, east, north] = bounds
  const nw = mercator(west, north)
  const se = mercator(east, south)
  const dx = Math.max(1e-12, Math.abs(se.x - nw.x))
  const dy = Math.max(1e-12, Math.abs(se.y - nw.y))

  const usableW = Math.max(1, wPx - 2 * padding)
  const usableH = Math.max(1, hPx - 2 * padding)

  const zx = Math.log2(usableW / (TILE_BASE * dx))
  const zy = Math.log2(usableH / (TILE_BASE * dy))
  const zoom = Math.min(zx, zy)

  const center = unmercator((nw.x + se.x) / 2, (nw.y + se.y) / 2)
  return { center, zoom }
}

/**
 * Geographic bounds visible in a frame of wPx x hPx at a locked viewport —
 * the inverse of lockViewport.
 */
export function boundsForViewport(
  viewport: LockedViewport,
  wPx: number,
  hPx: number
): Bounds {
  const world = TILE_BASE * Math.pow(2, viewport.zoom)
  const c = mercator(viewport.center[0], viewport.center[1])
  const halfX = wPx / 2 / world
  const halfY = hPx / 2 / world
  const [west, north] = unmercator(c.x - halfX, c.y - halfY)
  const [east, south] = unmercator(c.x + halfX, c.y + halfY)
  return [west, south, east, north]
}

/** Ground metres represented by one pixel at this viewport (at centre lat). */
export function metersPerPixel(viewport: LockedViewport): number {
  const latRad = (viewport.center[1] * Math.PI) / 180
  return (40075016.686 * Math.cos(latRad)) / (TILE_BASE * Math.pow(2, viewport.zoom))
}

/**
 * Centre lng/lat of a sub-tile within a larger locked frame, holding zoom
 * constant. tileCx/tileCy are pixel positions of the tile centre measured
 * from the top-left of the full wPx x hPx frame. Used by the tiled export
 * renderer so every tile aligns seamlessly.
 */
export function subTileCenter(
  viewport: LockedViewport,
  wPx: number,
  hPx: number,
  tileCx: number,
  tileCy: number
): [number, number] {
  const world = TILE_BASE * Math.pow(2, viewport.zoom)
  const c = mercator(viewport.center[0], viewport.center[1])
  const mx = c.x + (tileCx - wPx / 2) / world
  const my = c.y + (tileCy - hPx / 2) / world
  return unmercator(mx, my)
}
