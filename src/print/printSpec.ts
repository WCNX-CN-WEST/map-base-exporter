// Document size + resolution specifications for the export engine.

export type PageSizeId = 'letter' | 'tabloid' | 'a3' | 'a4' | 'custom'
export type Orientation = 'portrait' | 'landscape'
export type ExportFormat = 'png' | 'pdf' | 'jpeg'
export type Dpi = 150 | 300

/** Portrait dimensions in inches: [width, height] with width <= height. */
export const PAGE_SIZES_IN: Record<Exclude<PageSizeId, 'custom'>, [number, number]> = {
  letter: [8.5, 11],
  tabloid: [11, 17],
  a4: [8.27, 11.69],
  a3: [11.69, 16.54],
}

export const PAGE_LABELS: Record<PageSizeId, string> = {
  letter: 'Letter (8.5 x 11 in)',
  tabloid: 'Tabloid (11 x 17 in)',
  a3: 'A3 (297 x 420 mm)',
  a4: 'A4 (210 x 297 mm)',
  custom: 'Custom',
}

export interface PageSpec {
  /** Final page width in inches (after orientation applied). */
  widthIn: number
  /** Final page height in inches (after orientation applied). */
  heightIn: number
  dpi: Dpi
  /** Output raster width in pixels. */
  widthPx: number
  /** Output raster height in pixels. */
  heightPx: number
}

/**
 * Resolve a concrete page spec. For custom sizes pass customWidthIn /
 * customHeightIn (already in inches). Orientation swaps width/height so the
 * long edge runs the chosen way.
 */
export function resolvePageSpec(
  sizeId: PageSizeId,
  orientation: Orientation,
  dpi: Dpi,
  customWidthIn?: number,
  customHeightIn?: number
): PageSpec {
  let wIn: number
  let hIn: number

  if (sizeId === 'custom') {
    wIn = Math.max(1, customWidthIn ?? 11)
    hIn = Math.max(1, customHeightIn ?? 8.5)
    const short = Math.min(wIn, hIn)
    const long = Math.max(wIn, hIn)
    wIn = orientation === 'portrait' ? short : long
    hIn = orientation === 'portrait' ? long : short
  } else {
    const [pw, ph] = PAGE_SIZES_IN[sizeId] // portrait
    wIn = orientation === 'portrait' ? pw : ph
    hIn = orientation === 'portrait' ? ph : pw
  }

  return {
    widthIn: wIn,
    heightIn: hIn,
    dpi,
    widthPx: Math.round(wIn * dpi),
    heightPx: Math.round(hIn * dpi),
  }
}

// Detail / supersample
// The selection rectangle stays the exact export boundary. "Detail" re-renders
// that same area at a higher zoom into a proportionally larger pixel buffer, so
// more streets/labels appear and lines stay crisp - true granularity, not a
// stretch. Capped so the offscreen canvas can't blow past browser limits.

/** Longest edge (px) the final image is allowed to reach. */
export const MAX_OUTPUT_LONG_EDGE = 12000
/** Total pixel-area ceiling for the final image (~96 MP). */
export const MAX_OUTPUT_AREA = 96_000_000

export interface RenderSpec extends PageSpec {
  /** Detail multiplier actually used after clamping (>= 1). */
  detail: number
  /** Render buffer width in pixels (page widthPx * detail). */
  renderWidthPx: number
  /** Render buffer height in pixels (page heightPx * detail). */
  renderHeightPx: number
}

/**
 * Apply a requested detail multiplier to a page spec, clamped to the output
 * limits. Returns the effective detail and the render buffer dimensions.
 */
export function resolveRenderSpec(spec: PageSpec, requestedDetail: number): RenderSpec {
  const req = Math.max(1, Number.isFinite(requestedDetail) ? requestedDetail : 1)
  const longEdge = Math.max(spec.widthPx, spec.heightPx)
  const byEdge = MAX_OUTPUT_LONG_EDGE / longEdge
  const byArea = Math.sqrt(MAX_OUTPUT_AREA / (spec.widthPx * spec.heightPx))
  const maxDetail = Math.max(1, Math.min(byEdge, byArea))
  const detail = Math.min(req, maxDetail)
  return {
    ...spec,
    detail,
    renderWidthPx: Math.round(spec.widthPx * detail),
    renderHeightPx: Math.round(spec.heightPx * detail),
  }
}
