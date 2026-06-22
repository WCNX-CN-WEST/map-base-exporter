// Label-layer discovery utilities.
//
// Adapted from the Route Map PWA's styleUtils. We keep ONLY the label
// detection logic -- this build is full colour, so the monochrome overrides
// are intentionally omitted. The street-label layer ids are used to hide
// the GL-baked street names while our own SVG overlay is active (so names
// never render twice on screen).

import type { Map as MapLibreMap } from 'maplibre-gl'

// Common street-label layer signatures across open-source styles.
const STREET_LABEL_SIGNATURE =
  /transportation[_-]?name|road[_-]?label|street[_-]?(name|label)|highway[_-]?(name|label|shield)|label[_-]?(road|street)/i

/** Source-layers that carry street name text in the OpenMapTiles schema. */
const STREET_SOURCE_LAYER_SIGNATURE = /transportation_name/i

/** All symbol layers that render text (streets, places, POIs). */
export function extractLabelLayerIds(map: MapLibreMap): string[] {
  const style = map.getStyle()
  if (!style?.layers) return []

  const ids: string[] = []
  for (const layer of style.layers) {
    if (layer.type !== 'symbol') continue
    const layout = layer.layout as Record<string, unknown> | undefined
    const sourceLayer = (layer as { 'source-layer'?: string })['source-layer'] ?? ''
    const hasTextField = Boolean(layout?.['text-field'])
    const idLooksLikeLabel =
      STREET_LABEL_SIGNATURE.test(layer.id) || /name|label/i.test(layer.id)
    const sourceLayerLooksLikeLabel = STREET_SOURCE_LAYER_SIGNATURE.test(sourceLayer)
    if (hasTextField || idLooksLikeLabel || sourceLayerLooksLikeLabel) {
      ids.push(layer.id)
    }
  }
  return ids
}

/** Subset of label layers that name STREETS specifically (vs POIs, water). */
export function extractStreetLabelLayerIds(map: MapLibreMap): string[] {
  const style = map.getStyle()
  if (!style?.layers) return []

  return extractLabelLayerIds(map).filter(id => {
    const layer = style.layers.find(l => l.id === id)
    if (!layer) return false
    const sourceLayer = (layer as { 'source-layer'?: string })['source-layer'] ?? ''
    return (
      STREET_LABEL_SIGNATURE.test(id) ||
      STREET_SOURCE_LAYER_SIGNATURE.test(sourceLayer) ||
      /road|street|highway/i.test(id)
    )
  })
}

// ---------------------------------------------------------------------------
// Road-width boost
// ---------------------------------------------------------------------------

/**
 * Walk a MapLibre expression tree and multiply every numeric OUTPUT value by
 * mult. Only output positions are scaled -- stop keys, conditions, and input
 * expressions are left unchanged.
 *
 * minFloor (default 0): when > 0, any output value that would scale to zero
 * (i.e. the source value was 0) is replaced with minFloor instead. This
 * ensures road layers that have zero-width stops at low zoom levels (common in
 * OpenFreeMap Liberty for service/minor roads) produce at least a hairline in
 * the exported image.
 *
 * Handles: interpolate, step, match, case, coalesce.
 * Falls back to ["*", mult, expr] for anything else that is already an
 * expression (e.g. ["get", "width"]) so the GPU evaluates the multiply.
 */
function scaleExpr(expr: unknown, mult: number, minFloor = 0): unknown {
  if (typeof expr === 'number') {
    // Apply the floor to zero values so roads with 0-width stops at low zoom
    // are still visible after the export boost is applied.
    if (expr === 0 && minFloor > 0) return minFloor
    return expr * mult
  }
  if (!Array.isArray(expr) || expr.length === 0) return expr

  const op = expr[0] as string

  if (op === 'interpolate' || op === 'interpolate-hcl' || op === 'interpolate-lab') {
    // ["interpolate", interp, input, stop0, out0, stop1, out1, ...]
    // stops (even indices >= 3) are zoom values -- do NOT scale them.
    // outputs (odd indices >= 4) are widths -- scale these.
    const r: unknown[] = [expr[0], expr[1], expr[2]]
    for (let i = 3; i < expr.length - 1; i += 2) {
      r.push(expr[i])                               // stop key   -- untouched
      r.push(scaleExpr(expr[i + 1], mult, minFloor)) // output val -- scaled
    }
    return r
  }

  if (op === 'step') {
    // ["step", input, default, stop1, val1, stop2, val2, ...]
    const r: unknown[] = [expr[0], expr[1], scaleExpr(expr[2], mult, minFloor)]
    for (let i = 3; i < expr.length - 1; i += 2) {
      r.push(expr[i])
      r.push(scaleExpr(expr[i + 1], mult, minFloor))
    }
    return r
  }

  if (op === 'match') {
    // ["match", input, label1, val1, label2, val2, ..., default]
    // Labels can be scalars or arrays -- never scaled.
    // Values at odd positions (3, 5, 7...) and the trailing default are scaled.
    const r: unknown[] = [expr[0], expr[1]]
    for (let i = 2; i < expr.length - 1; i += 2) {
      r.push(expr[i])                               // label      -- untouched
      r.push(scaleExpr(expr[i + 1], mult, minFloor)) // value      -- scaled
    }
    r.push(scaleExpr(expr[expr.length - 1], mult, minFloor)) // default -- scaled
    return r
  }

  if (op === 'case') {
    // ["case", cond1, val1, cond2, val2, ..., default]
    // Conditions at even positions (1, 3...) are boolean -- never scaled.
    // Values at odd positions (2, 4...) and the trailing default are scaled.
    const r: unknown[] = [expr[0]]
    for (let i = 1; i < expr.length - 1; i += 2) {
      r.push(expr[i])                               // condition  -- untouched
      r.push(scaleExpr(expr[i + 1], mult, minFloor)) // value      -- scaled
    }
    r.push(scaleExpr(expr[expr.length - 1], mult, minFloor)) // default -- scaled
    return r
  }

  if (op === 'coalesce') {
    // ["coalesce", expr1, expr2, ...] -- scale every branch
    return [op, ...expr.slice(1).map(e => scaleExpr(e, mult, minFloor))]
  }

  // Anything else (["get", ...], ["feature-state", ...], arithmetic, etc.):
  // wrap with a GPU-side multiply. This is valid MapLibre expression syntax.
  return ['*', mult, expr]
}

/**
 * Source-layers that are definitively NOT roads.
 * We match on source-layer rather than layer ID because layer IDs like
 * "road_bridge_over_water" should still be boosted (it is a road!), but
 * a source-layer of "water" or "waterway" is never a road.
 */
const NON_ROAD_SOURCE_LAYER =
  /^(water|waterway|water_polygon|ocean|wetland|landcover|landuse|admin|boundary|building|aerodrome|aeroway|ferry|park|poi)$/i

/**
 * Layer IDs that are clearly non-road fills, backgrounds, or outlines
 * that happen to use "line" geometry. These are safe to skip by ID
 * because they can't be road layers regardless of source-layer.
 */
const NON_ROAD_LAYER_ID =
  /^(background|hillshade|contour|ferry|country[-_]|state[-_]|ocean[-_]|lake[-_]|river[-_]|waterway[-_]|water[-_]|wetland[-_]|landcover[-_]|landuse[-_]|admin[-_]|boundary[-_]|building[-_])/i

/**
 * Multiply the line-width of every road line layer by multiplier.
 *
 * Strategy:
 *  1. Skip layers whose source-layer is clearly non-road (water, admin, etc.)
 *  2. Skip layers whose ID starts with a clearly non-road prefix
 *  3. For everything else that is a "line" layer, scale line-width using
 *     scaleExpr() which walks the expression tree -- no expression wrapping.
 *
 * A minimum floor of multiplier * 0.5 is applied to zero-width stops so
 * service roads / laneways that are 0 px at low zoom are still visible.
 *
 * Call this inside map.once('load', ...) BEFORE registering the idle handler
 * so the boosted widths are baked into the captured snapshot.
 */
export function boostRoadLineWidths(map: MapLibreMap, multiplier: number): void {
  if (multiplier === 1) return
  const style = map.getStyle()
  if (!style?.layers) return

  const minFloor = multiplier * 0.5

  for (const layer of style.layers) {
    if (layer.type !== 'line') continue

    const sourceLayer = (layer as { 'source-layer'?: string })['source-layer'] ?? ''
    if (NON_ROAD_SOURCE_LAYER.test(sourceLayer)) continue
    if (NON_ROAD_LAYER_ID.test(layer.id)) continue

    try {
      const currentWidth = map.getPaintProperty(layer.id, 'line-width')

      let newWidth: unknown
      if (currentWidth === undefined || currentWidth === null) {
        // No explicit width set -- treat the implicit 1 px default as the base.
        newWidth = multiplier
      } else if (typeof currentWidth === 'number') {
        newWidth = currentWidth === 0 ? minFloor : currentWidth * multiplier
      } else if (Array.isArray(currentWidth)) {
        newWidth = scaleExpr(currentWidth, multiplier, minFloor)
      } else {
        continue // unexpected type (e.g. object) -- leave alone
      }

      map.setPaintProperty(layer.id, 'line-width', newWidth)
    } catch {
      // Layer absent or property type unsupported -- skip silently.
    }
  }
}

/**
 * Fetch the map style JSON, multiply every road line-width by multiplier,
 * and return the modified style spec as a plain object ready to pass to
 * new maplibregl.Map({ style: <result> }).
 *
 * Prefer this over boostRoadLineWidths() for offscreen renders: modifying
 * the style before the map is created guarantees the widths are baked into
 * the very first render and avoids any timing uncertainty around
 * setPaintProperty + idle event ordering.
 *
 * A floor of multiplier * 0.5 px is applied to zero-width stops so
 * laneways / service roads that are 0 px at low export-zoom levels are
 * still visible in the final image.
 */
export async function loadStyleWithBoostedRoads(
  styleUrl: string,
  multiplier: number
): Promise<object> {
  const resp = await fetch(styleUrl)
  if (!resp.ok) {
    throw new Error(`Failed to fetch map style: ${resp.status} ${resp.statusText}`)
  }
  const style = await resp.json() as Record<string, unknown>

  if (multiplier === 1 || !Array.isArray(style.layers)) return style

  const minFloor = multiplier * 0.5

  const layers = (style.layers as unknown[]).map((layer: unknown) => {
    const l = layer as Record<string, unknown>
    if (l['type'] !== 'line') return layer

    const sourceLayer = (l['source-layer'] as string | undefined) ?? ''
    if (NON_ROAD_SOURCE_LAYER.test(sourceLayer)) return layer
    if (NON_ROAD_LAYER_ID.test((l['id'] as string | undefined) ?? '')) return layer

    const paint = l['paint'] as Record<string, unknown> | undefined
    if (!paint) {
      // Layer has no paint block at all -- create one with the boosted width.
      return { ...l, paint: { 'line-width': multiplier } }
    }

    const lineWidth = paint['line-width']
    if (lineWidth === undefined || lineWidth === null) {
      // Paint block exists but line-width is unset -- implicit 1 px default.
      return { ...l, paint: { ...paint, 'line-width': multiplier } }
    }

    const newWidth = scaleExpr(lineWidth, multiplier, minFloor)
    return { ...l, paint: { ...paint, 'line-width': newWidth } }
  })

  return { ...style, layers }
}

// ---------------------------------------------------------------------------
// Layer visibility
// ---------------------------------------------------------------------------

/** Show or hide a named group of layers. */
export function setLayerGroupVisibility(
  map: MapLibreMap,
  layerIds: string[],
  visible: boolean
): void {
  const value = visible ? 'visible' : 'none'
  for (const id of layerIds) {
    try {
      map.setLayoutProperty(id, 'visibility', value)
    } catch {
      // layer not present yet
    }
  }
}
