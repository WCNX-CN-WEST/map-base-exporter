// Export controls: document size, orientation, format, DPI, plus the
// street-name font-size slider, the detail control, and the export trigger.
import type { PageSizeId, Orientation, ExportFormat, Dpi } from '../print/printSpec'
import { PAGE_LABELS, resolvePageSpec, resolveRenderSpec } from '../print/printSpec'
import { VERSION } from '../config/version'
import type { Frame } from '../selection/frame'

export interface ExportSettings {
  sizeId: PageSizeId
  orientation: Orientation
  format: ExportFormat
  dpi: Dpi
  customWidthIn: number
  customHeightIn: number
}

interface Props {
  settings: ExportSettings
  onSettingsChange: (s: ExportSettings) => void
  labelScale: number
  onLabelScaleChange: (v: number) => void
  showLabels: boolean
  onShowLabelsChange: (v: boolean) => void
  detail: number
  onDetailChange: (v: number) => void
  selecting: boolean
  onToggleSelecting: () => void
  frames: Frame[]
  activeId: string | null
  onActivate: (id: string | null) => void
  onRenameFrame: (id: string, name: string) => void
  onDeleteFrame: (id: string) => void
  onClearFrames: () => void
  onExport: () => void
  busy: boolean
  progress: string
}

const SIZE_IDS: PageSizeId[] = ['letter', 'tabloid', 'a3', 'a4', 'custom']
const DETAIL_PRESETS = [1, 2, 3, 4]

export function ExportPanel({
  settings,
  onSettingsChange,
  labelScale,
  onLabelScaleChange,
  showLabels,
  onShowLabelsChange,
  detail,
  onDetailChange,
  selecting,
  onToggleSelecting,
  frames,
  activeId,
  onActivate,
  onRenameFrame,
  onDeleteFrame,
  onClearFrames,
  onExport,
  busy,
  progress,
}: Props) {
  const set = <K extends keyof ExportSettings>(key: K, value: ExportSettings[K]) =>
    onSettingsChange({ ...settings, [key]: value })

  const spec = resolvePageSpec(
    settings.sizeId,
    settings.orientation,
    settings.dpi,
    settings.customWidthIn,
    settings.customHeightIn
  )
  const renderSpec = resolveRenderSpec(spec, detail)
  const clamped = renderSpec.detail < detail - 0.01
  const megapixels = (renderSpec.renderWidthPx * renderSpec.renderHeightPx) / 1_000_000

  return (
    <aside className="panel">
      <header className="panel-head">
        <h1>Map Base Exporter</h1>
        <span className="version">v{VERSION}</span>
      </header>

      <section className="panel-section">
        <h2>Regions</h2>
        <button
          className={selecting ? 'btn-primary full' : 'btn-secondary full'}
          onClick={onToggleSelecting}
        >
          {selecting ? 'Drawing - click to stop' : 'Draw new region'}
        </button>
        <p className="hint">
          {selecting
            ? 'Drag on the map to add a region. Draw as many as you like, then click to stop.'
            : 'Drag a region to move it; drag its handles to resize. Each region exports as its own file.'}
        </p>

        {frames.length === 0 ? (
          <span className="pill">No regions - current view used</span>
        ) : (
          <ul className="frame-list">
            {frames.map((f, i) => (
              <li
                key={f.id}
                className={`frame-row${f.id === activeId ? ' active' : ''}`}
                onClick={() => onActivate(f.id)}
              >
                <span className="frame-index">{i + 1}</span>
                <input
                  className="frame-name"
                  type="text"
                  value={f.name}
                  placeholder={`Region ${i + 1}`}
                  onChange={e => onRenameFrame(f.id, e.target.value)}
                  onFocus={() => onActivate(f.id)}
                />
                <button
                  className="btn-ghost frame-del"
                  title="Delete this region"
                  onClick={e => {
                    e.stopPropagation()
                    onDeleteFrame(f.id)
                  }}
                >
                  ✕
                </button>
              </li>
            ))}
          </ul>
        )}

        {frames.length > 0 && (
          <div className="row gap">
            <span className="pill ok">
              {frames.length} region{frames.length > 1 ? 's' : ''}
            </span>
            <button className="btn-ghost" onClick={onClearFrames}>
              Clear all
            </button>
          </div>
        )}
      </section>

      <section className="panel-section">
        <h2>Street names</h2>
        <label className="checkbox">
          <input
            type="checkbox"
            checked={showLabels}
            onChange={e => onShowLabelsChange(e.target.checked)}
          />
          Show street-name overlay
        </label>
        <label className="slider-label">
          <span>
            Font size <strong>{labelScale.toFixed(2)}x</strong>
          </span>
          <input
            type="range"
            min={0.6}
            max={2.4}
            step={0.05}
            value={labelScale}
            disabled={!showLabels}
            onChange={e => onLabelScaleChange(parseFloat(e.target.value))}
          />
        </label>
      </section>

      <section className="panel-section">
        <h2>Document</h2>
        <label className="field">
          <span>Size</span>
          <select
            value={settings.sizeId}
            onChange={e => set('sizeId', e.target.value as PageSizeId)}
          >
            {SIZE_IDS.map(id => (
              <option key={id} value={id}>
                {PAGE_LABELS[id]}
              </option>
            ))}
          </select>
        </label>

        {settings.sizeId === 'custom' && (
          <div className="row gap">
            <label className="field small">
              <span>Width (in)</span>
              <input
                type="number"
                min={1}
                step={0.1}
                value={settings.customWidthIn}
                onChange={e => set('customWidthIn', parseFloat(e.target.value) || 0)}
              />
            </label>
            <label className="field small">
              <span>Height (in)</span>
              <input
                type="number"
                min={1}
                step={0.1}
                value={settings.customHeightIn}
                onChange={e => set('customHeightIn', parseFloat(e.target.value) || 0)}
              />
            </label>
          </div>
        )}

        <label className="field">
          <span>Orientation</span>
          <div className="seg">
            <button
              className={settings.orientation === 'portrait' ? 'on' : ''}
              onClick={() => set('orientation', 'portrait')}
            >
              Portrait
            </button>
            <button
              className={settings.orientation === 'landscape' ? 'on' : ''}
              onClick={() => set('orientation', 'landscape')}
            >
              Landscape
            </button>
          </div>
        </label>

        <label className="field">
          <span>Format</span>
          <div className="seg">
            <button
              className={settings.format === 'png' ? 'on' : ''}
              onClick={() => set('format', 'png')}
            >
              PNG
            </button>
            <button
              className={settings.format === 'pdf' ? 'on' : ''}
              onClick={() => set('format', 'pdf')}
            >
              PDF
            </button>
          </div>
        </label>

        <label className="field">
          <span>Resolution</span>
          <div className="seg">
            <button className={settings.dpi === 150 ? 'on' : ''} onClick={() => set('dpi', 150)}>
              150 DPI
            </button>
            <button className={settings.dpi === 300 ? 'on' : ''} onClick={() => set('dpi', 300)}>
              300 DPI
            </button>
          </div>
        </label>
      </section>

      <section className="panel-section">
        <h2>Detail</h2>
        <p className="hint">
          Your selected region stays the boundary. Higher detail re-renders the
          same area at a higher zoom - more streets and labels, crisper lines.
        </p>
        <div className="seg">
          {DETAIL_PRESETS.map(d => (
            <button key={d} className={Math.round(detail) === d ? 'on' : ''} onClick={() => onDetailChange(d)}>
              {d}x
            </button>
          ))}
        </div>
        <label className="slider-label">
          <span>
            Custom <strong>{detail.toFixed(1)}x</strong>
          </span>
          <input
            type="range"
            min={1}
            max={6}
            step={0.5}
            value={detail}
            onChange={e => onDetailChange(parseFloat(e.target.value))}
          />
        </label>
        <p className="dims">
          Output: {renderSpec.renderWidthPx.toLocaleString()} x{' '}
          {renderSpec.renderHeightPx.toLocaleString()} px ({megapixels.toFixed(0)} MP)
          <br />
          {spec.widthIn.toFixed(2)} x {spec.heightIn.toFixed(2)} in - base {spec.dpi} DPI
          {renderSpec.detail > 1 && ` - effective ${Math.round(spec.dpi * renderSpec.detail)} DPI`}
          {clamped && (
            <>
              <br />
              <span className="warn-text">
                Capped at {renderSpec.detail.toFixed(1)}x to stay within browser limits.
              </span>
            </>
          )}
        </p>
      </section>

      <section className="panel-section">
        <button className="btn-primary full export" onClick={onExport} disabled={busy}>
          {busy
            ? 'Exporting...'
            : frames.length > 1
            ? `Export ${frames.length} ${settings.format.toUpperCase()}s`
            : `Export ${settings.format.toUpperCase()}`}
        </button>
        {busy && <p className="progress">{progress}</p>}
        {!busy && progress && <p className="progress">{progress}</p>}
      </section>
    </aside>
  )
}
