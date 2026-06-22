// Shared street-name collection + placement.
//
// Single source of truth for street labels. BOTH the on-screen SVG overlay
// (useTextOverlay) and the offscreen print export (printRenderer) call these,
// so what you see on screen is exactly what lands in the exported file.
//
// The math is framework-free: it reads street name linestrings from the vector
// tile source (works even when GL label layers are hidden), projects them to
// pixel space, places labels along each road, and rejects overlaps greedily.

import type { Map as MapLibreMap } from 'maplibre-gl'

export interface Pt {
  x: number
  y: number
}

export interface SourceTarget {
  source: string
  sourceLayer: string
}

export interface LabelPlacement {
  id: string
  name: string
  x: number
  y: number
  /** degrees, in (-90, 90] — always readable left-to-right */
  angle: number
  fontSize: number
}

/** Estimated glyph width as a fraction of font size. */
const GLYPH_W = 0.62

/** Base font size for a zoom level, scaled by the user multiplier. Used by the
 *  on-screen overlay (screen px). The export computes its own physical size. */
export function fontSizeForZoom(zoom: number, labelScale: number): number {
  const base = Math.max(10, Math.min(22, 11 + (zoom - 14) * 1.5))
  return Math.round(base * labelScale * 10) / 10
}

/** Resolve which (source, source-layer) pairs hold street names. */
export function resolveStreetSources(
  map: MapLibreMap,
  streetLabelLayerIds: string[]
): SourceTarget[] {
  const style = map.getStyle()
  if (!style?.layers) return []
  const seen = new Set<string>()
  const out: SourceTarget[] = []
  for (const id of streetLabelLayerIds) {
    const layer = style.layers.find(l => l.id === id) as
      | { source?: string; 'source-layer'?: string }
      | undefined
    if (!layer?.source || !layer['source-layer']) continue
    const key = `${layer.source}:${layer['source-layer']}`
    if (seen.has(key)) continue
    seen.add(key)
    out.push({ source: layer.source, sourceLayer: layer['source-layer'] })
  }
  return out
}

/**
 * Collect projected polylines per street name from the map's CURRENT viewport,
 * appending into `byName`. Optional offsetX/offsetY shift the projected points
 * into a larger page coordinate space (used by the tiled export so every tile's
 * names land in the right place on the full canvas).
 */
export function collectStreetLines(
  map: MapLibreMap,
  sources: SourceTarget[],
  byName: Map<string, Pt[][]>,
  offsetX = 0,
  offsetY = 0
): void {
  for (const tgt of sources) {
    let feats
    try {
      feats = map.querySourceFeatures(tgt.source, { sourceLayer: tgt.sourceLayer })
    } catch {
      continue
    }
    for (const f of feats) {
      const name =
        (f.properties?.name as string) ??
        (f.properties?.['name:latin'] as string) ??
        null
      if (!name) continue
      const geom = f.geometry
      const lines: [number, number][][] =
        geom.type === 'LineString'
          ? [geom.coordinates as [number, number][]]
          : geom.type === 'MultiLineString'
            ? (geom.coordinates as [number, number][][])
            : []
      for (const line of lines) {
        const pts: Pt[] = []
        for (const c of line) {
          const p = map.project([c[0], c[1]])
          pts.push({ x: p.x + offsetX, y: p.y + offsetY })
        }
        if (pts.length >= 2) {
          const arr = byName.get(name) ?? []
          arr.push(pts)
          byName.set(name, arr)
        }
      }
    }
  }
}

/**
 * Place labels along each collected polyline in a W x H pixel frame, with a
 * font size in that same pixel space. Repeat spacing and collision padding
 * scale with the font size, so density looks consistent at any resolution.
 * Greedy collision rejection means names never overlap.
 */
export function placeLabels(
  byName: Map<string, Pt[][]>,
  fontSize: number,
  W: number,
  H: number
): LabelPlacement[] {
  // A long road gets a repeated label roughly every this many px.
  const repeatPx = Math.max(160, fontSize * 22)
  // Padding added around each label's collision box (px).
  const collidePad = Math.max(4, fontSize * 0.4)

  const placed: LabelPlacement[] = []
  const boxes: { x1: number; y1: number; x2: number; y2: number }[] = []
  let idCounter = 0

  const collides = (cx: number, cy: number, w: number, h: number): boolean => {
    const x1 = cx - w / 2 - collidePad
    const y1 = cy - h / 2 - collidePad
    const x2 = cx + w / 2 + collidePad
    const y2 = cy + h / 2 + collidePad
    for (const b of boxes) {
      if (x1 < b.x2 && x2 > b.x1 && y1 < b.y2 && y2 > b.y1) return true
    }
    boxes.push({ x1, y1, x2, y2 })
    return false
  }

  for (const [name, polylines] of byName) {
    const textW = name.length * fontSize * GLYPH_W

    for (const pts of polylines) {
      const cum: number[] = [0]
      for (let i = 1; i < pts.length; i++) {
        cum.push(cum[i - 1] + Math.hypot(pts[i].x - pts[i - 1].x, pts[i].y - pts[i - 1].y))
      }
      const total = cum[cum.length - 1]
      if (total < textW + 20) continue

      const anchors: number[] = []
      const mid = total / 2
      anchors.push(mid)
      for (let s = mid + repeatPx; s < total - textW / 2; s += repeatPx) anchors.push(s)
      for (let s = mid - repeatPx; s > textW / 2; s -= repeatPx) anchors.push(s)

      for (const s of anchors) {
        let i = 0
        while (i < cum.length - 2 && cum[i + 1] < s) i++
        const segLen = cum[i + 1] - cum[i]
        if (segLen === 0) continue
        const t = (s - cum[i]) / segLen
        const x = pts[i].x + (pts[i + 1].x - pts[i].x) * t
        const y = pts[i].y + (pts[i + 1].y - pts[i].y) * t

        if (x < -textW || x > W + textW || y < -30 || y > H + 30) continue

        let angle = (Math.atan2(pts[i + 1].y - pts[i].y, pts[i + 1].x - pts[i].x) * 180) / Math.PI
        if (angle > 90) angle -= 180
        if (angle <= -90) angle += 180

        const rad = (Math.abs(angle) * Math.PI) / 180
        const bw = textW * Math.cos(rad) + fontSize * Math.sin(rad)
        const bh = textW * Math.sin(rad) + fontSize * Math.cos(rad)
        if (collides(x, y, bw, bh)) continue

        placed.push({ id: `lbl_${idCounter++}`, name, x, y, angle, fontSize })
      }
    }
  }

  return placed
}
