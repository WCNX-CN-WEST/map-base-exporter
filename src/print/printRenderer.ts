// Offscreen print-resolution rendering.
//
// Renders a geographic region into a single raster canvas. A print page at
// 300 DPI (and higher with the detail multiplier) can easily exceed a
// browser's maximum WebGL canvas / texture size, so the buffer is split into
// a grid of tiles no larger than MAX_TILE_PX per edge. Each tile renders in
// its own hidden MapLibre instance at the SAME zoom (so tiles align), is
// captured after 'idle', then composited onto the full-resolution canvas.
//
// Street names are NOT taken from MapLibre's GL labels (which don't survive the
// offscreen capture reliably). Instead the GL street labels are hidden, the
// street-name geometry is read straight from the vector source per tile, and
// the SAME placement module used by the on-screen overlay positions the names.
// They are then painted onto the composited canvas with the Canvas 2D API,
// sized by the font-size slider -- so the exported file matches the preview.
import maplibregl from 'maplibre-gl'
import type { StyleSpecification } from 'maplibre-gl'
import { getActiveStyleUrl } from '../map/constants'
import {
  loadStyleWithBoostedRoads,
  extractStreetLabelLayerIds,
  setLayerGroupVisibility,
} from '../map/styleUtils'
import {
  collectStreetLines,
  placeLabels,
  resolveStreetSources,
  type LabelPlacement,
  type Pt,
} from '../map/labelPlacement'
import {
  lockViewport,
  subTileCenter,
  type Bounds,
  type LockedViewport,
} from './viewportUtils'
import type { RenderSpec } from './printSpec'

export type ProgressFn = (message: string) => void

/** Max pixel size of any single offscreen GL tile (per edge). Conservative
    to stay well within browser WebGL limits across GPUs. */
const MAX_TILE_PX = 2000

/** Hard ceiling on the offscreen render wait (ms) before giving up. */
const RENDER_TIMEOUT_MS = 60000

/** Physical street-label size in points at multiplier 1.0. The slider scales
    this; converting to render pixels keeps names the right size on paper. */
const LABEL_BASE_PT = 9

/** What a single rendered tile hands back: its raster plus the street-name
    geometry projected into FULL-PAGE pixel space (offset by the tile origin). */
interface TileResult {
  canvas: HTMLCanvasElement
}

/**
 * Render a single tile (one hidden MapLibre instance) to a 2D canvas, and --
 * when labels are on -- collect its street-name geometry into byName.
 *
 * style: either the URL string (when no road boost) or a pre-processed style
 * object from loadStyleWithBoostedRoads() (when multiplier > 1). Passing the
 * object avoids repeated fetches and ensures boosted widths are baked into the
 * very first render rather than applied via setPaintProperty after load.
 */
function renderTile(
  widthPx: number,
  heightPx: number,
  center: [number, number],
  zoom: number,
  offsetX: number,
  offsetY: number,
  byName: Map<string, Pt[][]> | null,
  style: string | StyleSpecification
): Promise<TileResult> {
  return new Promise((resolve, reject) => {
    const container = document.createElement('div')
    container.style.cssText = `position:fixed;left:-100000px;top:0;width:${widthPx}px;height:${heightPx}px;`
    document.body.appendChild(container)

    const map = new maplibregl.Map({
      container,
      style,
      center,
      zoom,
      bearing: 0,
      interactive: false,
      attributionControl: false,
      pixelRatio: 1,
      preserveDrawingBuffer: true,
      fadeDuration: 0,
    })

    let settled = false
    const cleanup = () => {
      try {
        map.remove()
      } catch {
        // ignore
      }
      container.remove()
    }

    const timeout = setTimeout(() => {
      if (settled) return
      settled = true
      cleanup()
      reject(new Error('Print tile render timed out (tiles not loading?)'))
    }, RENDER_TIMEOUT_MS)

    map.once('load', () => {
      // Hide the GL-baked street names -- we paint our own overlay instead, so
      // the captured raster is a clean base map with no doubled-up text.
      if (byName) {
        try {
          setLayerGroupVisibility(map, extractStreetLabelLayerIds(map), false)
        } catch {
          // style without those layers -- fine
        }
      }

      map.once('idle', () => {
        if (settled) return
        settled = true
        clearTimeout(timeout)
        try {
          // Read street-name geometry from the vector source (independent of
          // layer visibility) and project it into full-page pixel space.
          if (byName) {
            const sources = resolveStreetSources(map, extractStreetLabelLayerIds(map))
            collectStreetLines(map, sources, byName, offsetX, offsetY)
          }

          const gl = map.getCanvas()
          const copy = document.createElement('canvas')
          copy.width  = gl.width
          copy.height = gl.height
          copy.getContext('2d')!.drawImage(gl, 0, 0)
          cleanup()
          resolve({ canvas: copy })
        } catch (err) {
          cleanup()
          reject(err)
        }
      })
    })

    map.once('error', e => {
      if (!map.getStyle() && !settled) {
        settled = true
        clearTimeout(timeout)
        cleanup()
        reject(e.error ?? new Error('Map style failed to load'))
      }
    })
  })
}

/** Integer tile edges that partition [0, total] into n contiguous spans. */
function tileEdges(total: number, n: number): number[] {
  const edges: number[] = []
  for (let i = 0; i <= n; i++) edges.push(Math.round((i * total) / n))
  return edges
}

/** Paint placed street labels onto the composited page canvas, matching the
    on-screen .street-label style: dark text with a white halo for legibility. */
function paintLabels(ctx: CanvasRenderingContext2D, labels: LabelPlacement[]): void {
  ctx.save()
  ctx.textAlign = 'center'
  ctx.textBaseline = 'middle'
  ctx.lineJoin = 'round'
  ctx.miterLimit = 2
  for (const l of labels) {
    ctx.save()
    ctx.translate(l.x, l.y)
    ctx.rotate((l.angle * Math.PI) / 180)
    ctx.font = `600 ${l.fontSize}px 'Segoe UI', system-ui, sans-serif`
    // White halo (paint-order: stroke, then fill -- same as the SVG overlay).
    ctx.strokeStyle = '#ffffff'
    ctx.lineWidth = Math.max(2, l.fontSize * 0.22)
    ctx.strokeText(l.name, 0, 0)
    ctx.fillStyle = '#111111'
    ctx.fillText(l.name, 0, 0)
    ctx.restore()
  }
  ctx.restore()
}

/**
 * Render a geographic bounding box into a single canvas. The bbox is the exact
 * boundary (fit + centred inside the buffer's aspect). The render buffer size
 * is renderWidthPx x renderHeightPx; a detail > 1 makes that larger than the
 * nominal page so the SAME area is rendered at a higher zoom.
 *
 * roadWidthMultiplier (default 1): multiplies all road line-widths in the GL
 * render before capture. The style JSON is fetched ONCE and pre-processed
 * before any MapLibre instance is created, so the widths are baked into the
 * initial style and not applied via setPaintProperty (which has timing risks).
 * Roads with zero-width stops at low zoom get a minimum floor so laneways
 * remain visible regardless of export zoom.
 *
 * saturation (default 1): applied to the composited canvas via a Canvas 2D
 * CSS filter (saturate(N)) after all tiles are assembled and labels painted.
 * 1 = natural, 1.5 = vivid, 2 = bold.
 */
export async function renderRegionToCanvas(
  bbox: Bounds,
  spec: RenderSpec,
  labelScale: number,
  showLabels: boolean,
  onProgress: ProgressFn,
  roadWidthMultiplier = 1,
  saturation = 1
): Promise<HTMLCanvasElement> {
  const outW = spec.renderWidthPx
  const outH = spec.renderHeightPx
  const viewport: LockedViewport = lockViewport(bbox, outW, outH, 0)

  const cols = Math.max(1, Math.ceil(outW / MAX_TILE_PX))
  const rows = Math.max(1, Math.ceil(outH / MAX_TILE_PX))
  const colEdges = tileEdges(outW, cols)
  const rowEdges = tileEdges(outH, rows)

  const page = document.createElement('canvas')
  page.width  = outW
  page.height = outH
  const ctx = page.getContext('2d')!
  ctx.fillStyle = '#ffffff'
  ctx.fillRect(0, 0, page.width, page.height)

  // Accumulates street-name geometry across every tile, in page pixel space.
  const byName: Map<string, Pt[][]> | null = showLabels ? new Map() : null

  // Pre-process the style once for all tiles. When roadWidthMultiplier > 1
  // the style JSON is fetched and every road line-width is scaled; the
  // resulting plain object is passed to each MapLibre instance directly so
  // no per-tile setPaintProperty calls are needed.
  const tileStyle: string | StyleSpecification =
    roadWidthMultiplier !== 1
      ? (await loadStyleWithBoostedRoads(getActiveStyleUrl(), roadWidthMultiplier)) as unknown as StyleSpecification
      : getActiveStyleUrl()

  const total = cols * rows
  let done = 0

  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      const x0 = colEdges[c]
      const y0 = rowEdges[r]
      const tileW = colEdges[c + 1] - x0
      const tileH = rowEdges[r + 1] - y0
      if (tileW <= 0 || tileH <= 0) continue

      const cx = x0 + tileW / 2
      const cy = y0 + tileH / 2
      const center = subTileCenter(viewport, outW, outH, cx, cy)

      done++
      const detailNote = spec.detail > 1 ? ` (detail ${spec.detail.toFixed(1)}x)` : ''
      onProgress(
        total > 1
          ? `Rendering tile ${done}/${total} at ${spec.dpi} DPI${detailNote}...`
          : `Rendering map at ${spec.dpi} DPI${detailNote}...`
      )

      const tile = await renderTile(tileW, tileH, center, viewport.zoom, x0, y0, byName, tileStyle)
      ctx.drawImage(tile.canvas, x0, y0)
    }
  }

  // Place + paint names once, globally, so collisions are resolved across the
  // whole page (not per tile) and the slider drives the size.
  if (byName && byName.size > 0) {
    onProgress('Placing street names...')
    const effectiveDpi = spec.dpi * spec.detail
    const fontPx = (LABEL_BASE_PT * Math.max(0.1, labelScale) * effectiveDpi) / 72
    const labels = placeLabels(byName, fontPx, outW, outH)
    paintLabels(ctx, labels)
  }

  // Colour saturation boost -- GPU-accelerated via Canvas 2D filter.
  // saturation=1 is identity; 2 = vivid; 3 = bold. Applied after labels so
  // the white halos are also boosted (they stay near-white and look fine).
  if (saturation !== 1) {
    onProgress('Applying colour boost...')
    const boosted = document.createElement('canvas')
    boosted.width  = outW
    boosted.height = outH
    const bCtx = boosted.getContext('2d')!
    bCtx.filter = `saturate(${saturation})`
    bCtx.drawImage(page, 0, 0)
    bCtx.filter = 'none'
    return boosted
  }

  return page
}
