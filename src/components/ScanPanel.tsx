// Scan Pack -- settings panel.
//
// Controls: grid dimensions (cols x rows), scan order (serpentine / zigzag),
// tile page size, DPI, detail, and the export trigger.
// The overlap is fixed at 20% per spec and shown as a read-only label.

import type { ScanSettings, ScanOrder } from '../scan/scanSpec'
import type { ScanGrid } from '../scan/scanSpec'
import type { PageSizeId, Orientation, Dpi } from '../print/printSpec'
import { PAGE_LABELS } from '../print/printSpec'

interface Props {
  settings: ScanSettings
  onSettingsChange: (s: ScanSettings) => void
  labelScale: number
  showLabels: boolean
  /** The computed grid -- used for the tile count readout. Null when no anchor set. */
  grid: ScanGrid | null
  /** True when anchor has been placed on the map */
  hasAnchor: boolean
  onPlaceAnchor: () => void
  onClearAnchor: () => void
  onExport: () => void
  onBack: () => void
  busy: boolean
  progress: string
}

const SIZE_IDS: PageSizeId[] = ['letter', 'tabloid', 'a3', 'a4']
const ORIENTATIONS: Orientation[] = ['landscape', 'portrait']
const DPIS: Dpi[] = [150, 300]
const DETAIL_PRESETS = [1, 2, 3, 4]
const MAX_TILES = 64

export function ScanPanel({
  settings,
  onSettingsChange,
  labelScale,
  showLabels,
  grid,
  hasAnchor,
  onPlaceAnchor,
  onClearAnchor,
  onExport,
  onBack,
  busy,
  progress,
}: Props) {
  const set = <K extends keyof ScanSettings>(key: K, val: ScanSettings[K]) =>
    onSettingsChange({ ...settings, [key]: val })

  const tileCount = grid ? grid.tiles.length : settings.cols * settings.rows
  const tooManyTiles = tileCount > MAX_TILES

  return (
    <section className="panel-section scan-panel">
      <div style={{ marginBottom: 10 }}>
        <button className="btn-ghost" onClick={onBack} style={{ fontSize: 13 }}>
          Back to Export
        </button>
      </div>
      <h2>Scan Pack</h2>
      <p className="hint">
        Sets a fixed-size grid on the map. Each cell exports as a separate JPEG.
        All tiles are packaged in a single ZIP for Microsoft Image Composite Editor.
      </p>

      {/* Grid dimensions */}
      <div className="row gap" style={{ alignItems: 'center' }}>
        <label className="field small">
          <span>Columns</span>
          <input
            type="number"
            min={1}
            max={12}
            value={settings.cols}
            onChange={e => set('cols', Math.max(1, Math.min(12, parseInt(e.target.value) || 1)))}
          />
        </label>
        <span style={{ paddingTop: 18, color: '#888' }}>x</span>
        <label className="field small">
          <span>Rows</span>
          <input
            type="number"
            min={1}
            max={12}
            value={settings.rows}
            onChange={e => set('rows', Math.max(1, Math.min(12, parseInt(e.target.value) || 1)))}
          />
        </label>
        <div style={{ paddingTop: 18 }}>
          <span className={`pill ${tooManyTiles ? 'warn' : 'ok'}`}>
            {tileCount} tile{tileCount !== 1 ? 's' : ''}
          </span>
        </div>
      </div>
      {tooManyTiles && (
        <p className="warn-text">Maximum {MAX_TILES} tiles. Reduce columns or rows.</p>
      )}

      {/* Scan order */}
      <label className="field">
        <span>Scan order</span>
        <div className="seg">
          {(['serpentine', 'zigzag'] as ScanOrder[]).map(o => (
            <button
              key={o}
              className={settings.order === o ? 'on' : ''}
              onClick={() => set('order', o)}
            >
              {o === 'serpentine' ? 'Serpentine' : 'Zigzag'}
            </button>
          ))}
        </div>
      </label>
      <p className="hint" style={{ marginTop: -6 }}>
        {settings.order === 'serpentine'
          ? 'Rows alternate direction: left to right, then right to left.'
          : 'All rows run left to right, top to bottom.'}
      </p>

      {/* Overlap (read-only) */}
      <div className="row gap" style={{ alignItems: 'center', marginBottom: 8 }}>
        <span className="tool-label">Overlap</span>
        <span className="pill ok">20% fixed</span>
      </div>

      {/* Tile page size */}
      <label className="field">
        <span>Tile size</span>
        <select
          value={settings.tileSizeId}
          onChange={e => set('tileSizeId', e.target.value as PageSizeId)}
        >
          {SIZE_IDS.map(id => (
            <option key={id} value={id}>{PAGE_LABELS[id]}</option>
          ))}
        </select>
      </label>

      {/* Orientation */}
      <label className="field">
        <span>Orientation</span>
        <div className="seg">
          {ORIENTATIONS.map(o => (
            <button
              key={o}
              className={settings.tileOrientation === o ? 'on' : ''}
              onClick={() => set('tileOrientation', o)}
            >
              {o.charAt(0).toUpperCase() + o.slice(1)}
            </button>
          ))}
        </div>
      </label>

      {/* DPI */}
      <label className="field">
        <span>Resolution</span>
        <div className="seg">
          {DPIS.map(d => (
            <button
              key={d}
              className={settings.tileDpi === d ? 'on' : ''}
              onClick={() => set('tileDpi', d)}
            >
              {d} DPI
            </button>
          ))}
        </div>
      </label>

      {/* Detail */}
      <label className="field">
        <span>Detail</span>
        <div className="seg">
          {DETAIL_PRESETS.map(d => (
            <button
              key={d}
              className={Math.round(settings.tileDetail) === d ? 'on' : ''}
              onClick={() => set('tileDetail', d)}
            >
              {d}x
            </button>
          ))}
        </div>
      </label>
      {grid && (
        <p className="dims">
          Each tile: {grid.tileRenderWidthPx.toLocaleString()} x {grid.tileRenderHeightPx.toLocaleString()} px
          {showLabels ? ' - street names on' : ' - street names off'}
          {labelScale !== 1 ? ` - labels ${labelScale.toFixed(2)}x` : ''}
        </p>
      )}

      {/* Anchor placement */}
      <div style={{ marginTop: 10 }}>
        {!hasAnchor ? (
          <>
            <button className="btn-primary full" onClick={onPlaceAnchor}>
              Place grid on map
            </button>
            <p className="hint">
              Click to drop the grid at the centre of the current view. Then drag it into position.
            </p>
          </>
        ) : (
          <div className="row gap">
            <span className="pill ok">Grid placed</span>
            <button className="btn-ghost" onClick={onClearAnchor}>Remove</button>
          </div>
        )}
      </div>

      {/* Export */}
      <button
        className="btn-primary full export"
        style={{ marginTop: 12 }}
        onClick={onExport}
        disabled={busy || !hasAnchor || tooManyTiles}
      >
        {busy
          ? 'Exporting...'
          : hasAnchor
          ? `Export Scan Pack (${tileCount} tiles to ZIP)`
          : 'Place grid first'}
      </button>
      {(busy || progress) && <p className="progress">{progress}</p>}
    </section>
  )
}
