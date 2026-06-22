// Scan Pack export engine.
//
// Renders each tile in scan order, JPEG-encodes it at quality 0.95, adds it
// to a JSZip archive, then triggers a single ZIP download. Tiles are rendered
// and discarded one at a time to keep browser memory usage low.
//
// Output ZIP contains:
//   tile_001_r00_c00.jpg
//   tile_002_r00_c01.jpg
//   ...
//   scan_manifest.json   -- metadata for ICE and future reference

import JSZip from 'jszip'
import { renderRegionToCanvas, type ProgressFn } from '../print/printRenderer'
import { resolvePageSpec, resolveRenderSpec } from '../print/printSpec'
import type { ScanGrid, ScanSettings } from './scanSpec'

/** JPEG quality for scan tiles. Higher than PDF -- ICE relies on pixel-level
    feature matching so we want maximum fidelity. */
const JPEG_QUALITY = 0.95

function canvasToBlob(canvas: HTMLCanvasElement, type: string, quality: number): Promise<Blob> {
  return new Promise((resolve, reject) => {
    canvas.toBlob(
      blob => (blob ? resolve(blob) : reject(new Error('Canvas export produced no data'))),
      type,
      quality
    )
  })
}

function triggerDownload(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  document.body.appendChild(a)
  a.click()
  a.remove()
  setTimeout(() => URL.revokeObjectURL(url), 5000)
}

function timestamp(): string {
  const d = new Date()
  const p = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}${p(d.getMonth() + 1)}${p(d.getDate())}_${p(d.getHours())}${p(d.getMinutes())}${p(d.getSeconds())}`
}

export interface ScanExportResult {
  filename: string
  tileCount: number
  tileWidthPx: number
  tileHeightPx: number
}

/**
 * Render all tiles in the scan grid and package them into a downloadable ZIP.
 *
 * @param grid      -- computed by computeScanGrid()
 * @param settings  -- the scan settings used to produce the grid
 * @param labelScale -- street-name font-size multiplier
 * @param showLabels -- whether to paint street names onto each tile
 * @param onProgress -- progress callback for UI updates
 * @param roadWidthMultiplier -- multiply all road line-widths (1 = unchanged)
 * @param saturation -- canvas saturation multiplier (1 = natural)
 */
export async function exportScanPack(
  grid: ScanGrid,
  settings: ScanSettings,
  labelScale: number,
  showLabels: boolean,
  onProgress: ProgressFn,
  roadWidthMultiplier = 1,
  saturation = 1
): Promise<ScanExportResult> {
  const zip = new JSZip()
  const total = grid.tiles.length

  const pageSpec = resolvePageSpec(
    settings.tileSizeId,
    settings.tileOrientation,
    settings.tileDpi
  )
  const renderSpec = resolveRenderSpec(pageSpec, settings.tileDetail)

  for (let i = 0; i < total; i++) {
    const tile = grid.tiles[i]
    onProgress(
      `Rendering tile ${tile.index} of ${total} ` +
      `(row ${tile.row + 1}/${settings.rows}, col ${tile.col + 1}/${settings.cols})...`
    )

    const canvas = await renderRegionToCanvas(
      tile.bbox,
      renderSpec,
      labelScale,
      showLabels,
      (msg: string) => onProgress(`Tile ${tile.index}/${total}: ${msg}`),
      roadWidthMultiplier,
      saturation
    )

    onProgress(`Encoding tile ${tile.index} of ${total}...`)
    const blob = await canvasToBlob(canvas, 'image/jpeg', JPEG_QUALITY)
    zip.file(tile.filename, blob)

    // Let the browser breathe between tiles
    await new Promise(r => setTimeout(r, 50))
  }

  const manifest = {
    generatedAt: new Date().toISOString(),
    masterBbox: {
      west: grid.masterBbox[0],
      south: grid.masterBbox[1],
      east: grid.masterBbox[2],
      north: grid.masterBbox[3],
    },
    grid: {
      cols: settings.cols,
      rows: settings.rows,
      tileCount: total,
      order: settings.order,
      overlapPercent: Math.round(settings.overlapFraction * 100),
    },
    tileSpec: {
      pageSize: settings.tileSizeId,
      orientation: settings.tileOrientation,
      dpi: settings.tileDpi,
      detail: renderSpec.detail,
      widthPx: grid.tileRenderWidthPx,
      heightPx: grid.tileRenderHeightPx,
      jpegQuality: JPEG_QUALITY,
    },
    enhancement: {
      roadWidthMultiplier,
      saturation,
    },
    zoom: grid.zoom,
    tileGeoWidthDeg: grid.tileGeoW,
    tileGeoHeightDeg: grid.tileGeoH,
    tiles: grid.tiles.map(t => ({
      index: t.index,
      filename: t.filename,
      row: t.row,
      col: t.col,
      bbox: { west: t.bbox[0], south: t.bbox[1], east: t.bbox[2], north: t.bbox[3] },
    })),
  }
  zip.file('scan_manifest.json', JSON.stringify(manifest, null, 2))

  onProgress(`Compressing ${total} tiles into ZIP...`)
  const zipBlob = await zip.generateAsync(
    { type: 'blob', compression: 'DEFLATE', compressionOptions: { level: 1 } },
    metadata => {
      if (metadata.percent < 100) {
        onProgress(`Compressing... ${Math.round(metadata.percent)}%`)
      }
    }
  )

  const filename = `scan_pack_${settings.cols}x${settings.rows}_${timestamp()}.zip`
  triggerDownload(zipBlob, filename)

  return {
    filename,
    tileCount: total,
    tileWidthPx: grid.tileRenderWidthPx,
    tileHeightPx: grid.tileRenderHeightPx,
  }
}
