// Export orchestration: render the selected region, then emit PNG, JPEG, or
// PDF and trigger a browser download. PDFs embed a lossless PNG so the base
// map stays crisp when placed as a locked background layer in Illustrator.
// JPEG is smaller than PNG and useful when file size matters more than
// lossless fidelity; quality is user-controlled (1-100, default 85).
import { jsPDF } from 'jspdf'
import { renderRegionToCanvas, type ProgressFn } from './printRenderer'
import { resolvePageSpec, resolveRenderSpec } from './printSpec'
import type { PageSizeId, Orientation, ExportFormat, Dpi } from './printSpec'
import type { Bounds } from './viewportUtils'

export interface ExportOptions {
  bbox: Bounds
  sizeId: PageSizeId
  orientation: Orientation
  format: ExportFormat
  dpi: Dpi
  labelScale: number
  /** Whether to paint the street-name overlay onto the exported image. */
  showLabels: boolean
  /** Detail / supersample multiplier (>= 1). Selection stays the boundary. */
  detail: number
  customWidthIn?: number
  customHeightIn?: number
  /** Optional tag inserted into the filename (e.g. region index + name). */
  filenameTag?: string
  /** Multiply road line-widths in the output (1 = unchanged, 2 = double). */
  roadWidthMultiplier?: number
  /** Canvas saturation multiplier (1 = natural, 1.5 = vivid, 2 = bold). */
  saturation?: number
  /** JPEG quality 1-100 (only used when format === 'jpeg'). Default 85. */
  jpegQuality?: number
}

/** Lower-case, filesystem-safe slug for a region name. */
function slugify(s: string): string {
  return s
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 40)
}

function canvasToBlob(canvas: HTMLCanvasElement, type: string, quality?: number): Promise<Blob> {
  return new Promise((resolve, reject) => {
    canvas.toBlob(
      blob => (blob ? resolve(blob) : reject(new Error('Canvas export produced no data'))),
      type,
      quality
    )
  })
}

function timestamp(): string {
  const d = new Date()
  const p = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}${p(d.getMonth() + 1)}${p(d.getDate())}_${p(d.getHours())}${p(d.getMinutes())}${p(d.getSeconds())}`
}

function triggerDownload(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  document.body.appendChild(a)
  a.click()
  a.remove()
  setTimeout(() => URL.revokeObjectURL(url), 4000)
}

export interface ExportResult {
  filename: string
  widthPx: number
  heightPx: number
  detail: number
}

export async function exportBaseMap(
  opts: ExportOptions,
  onProgress: ProgressFn
): Promise<ExportResult> {
  const pageSpec = resolvePageSpec(
    opts.sizeId,
    opts.orientation,
    opts.dpi,
    opts.customWidthIn,
    opts.customHeightIn
  )
  const spec = resolveRenderSpec(pageSpec, opts.detail)

  onProgress('Preparing export...')
  const canvas = await renderRegionToCanvas(
    opts.bbox,
    spec,
    opts.labelScale,
    opts.showLabels,
    onProgress,
    opts.roadWidthMultiplier ?? 1,
    opts.saturation ?? 1
  )

  const detailTag = spec.detail > 1 ? `_${spec.detail.toFixed(1).replace('.', '-')}x` : ''
  const slug = opts.filenameTag ? slugify(opts.filenameTag) : ''
  const tag = slug ? `_${slug}` : ''
  const base = `basemap${tag}_${opts.sizeId}_${opts.orientation}_${opts.dpi}dpi${detailTag}_${timestamp()}`

  if (opts.format === 'png') {
    onProgress('Encoding PNG...')
    const blob = await canvasToBlob(canvas, 'image/png')
    const filename = `${base}.png`
    triggerDownload(blob, filename)
    return { filename, widthPx: spec.renderWidthPx, heightPx: spec.renderHeightPx, detail: spec.detail }
  }

  if (opts.format === 'jpeg') {
    onProgress('Encoding JPEG...')
    const quality = Math.max(1, Math.min(100, opts.jpegQuality ?? 85)) / 100
    const blob = await canvasToBlob(canvas, 'image/jpeg', quality)
    const filename = `${base}.jpg`
    triggerDownload(blob, filename)
    return { filename, widthPx: spec.renderWidthPx, heightPx: spec.renderHeightPx, detail: spec.detail }
  }

  onProgress('Building PDF...')
  const pngData = canvas.toDataURL('image/png')
  const orientation = spec.widthIn >= spec.heightIn ? 'landscape' : 'portrait'
  const pdf = new jsPDF({
    orientation,
    unit: 'in',
    format: [spec.widthIn, spec.heightIn],
    compress: true,
  })
  pdf.addImage(pngData, 'PNG', 0, 0, spec.widthIn, spec.heightIn)
  pdf.setProperties({
    title: 'Map Base Export',
    subject: 'High-resolution base map for Adobe Illustrator',
    creator: 'Map Base Exporter',
  })
  const filename = `${base}.pdf`
  triggerDownload(pdf.output('blob'), filename)
  return { filename, widthPx: spec.renderWidthPx, heightPx: spec.renderHeightPx, detail: spec.detail }
}
