// Top toolbar - toggles for everything overlaid on the map, so the map can be
// viewed clean. "Map only" hides all overlays in one click; clicking it again
// restores them.
import { VERSION } from '../config/version'
import { MAP_STYLES, type MapStyleId } from '../map/constants'

export interface Visibility {
  panel: boolean
  labels: boolean
  selectionBox: boolean
}

interface Props {
  visibility: Visibility
  onToggle: (key: keyof Visibility) => void
  selecting: boolean
  onToggleSelecting: () => void
  onMapOnly: () => void
  mapOnlyActive: boolean
  /** Currently active map style ID. */
  mapStyleId: MapStyleId
  onMapStyleChange: (id: MapStyleId) => void
}

export function TopBar({
  visibility,
  onToggle,
  selecting,
  onToggleSelecting,
  onMapOnly,
  mapOnlyActive,
  mapStyleId,
  onMapStyleChange,
}: Props) {
  return (
    <header className="topbar">
      <div className="topbar-brand">
        <span className="topbar-title">Map Base Exporter</span>
        <span className="topbar-version">v{VERSION}</span>
      </div>

      <div className="topbar-tools">
        <button
          className={`tb-btn ${selecting ? 'on' : ''}`}
          onClick={onToggleSelecting}
          title="Drag a rectangle to set the export region"
        >
          {selecting ? 'Drawing region...' : 'Draw region'}
        </button>

        <span className="tb-sep" />

        <button
          className={`tb-btn ${visibility.labels ? 'on' : ''}`}
          onClick={() => onToggle('labels')}
          title="Show/hide the street-name overlay"
        >
          Street names
        </button>
        <button
          className={`tb-btn ${visibility.selectionBox ? 'on' : ''}`}
          onClick={() => onToggle('selectionBox')}
          title="Show/hide the selection rectangle"
        >
          Selection box
        </button>
        <button
          className={`tb-btn ${visibility.panel ? 'on' : ''}`}
          onClick={() => onToggle('panel')}
          title="Show/hide the export panel"
        >
          Panel
        </button>

        <span className="tb-sep" />

        <select
          className="tb-btn"
          value={mapStyleId}
          onChange={e => onMapStyleChange(e.target.value as MapStyleId)}
          title="Switch base map style"
        >
          {MAP_STYLES.map(s => (
            <option key={s.id} value={s.id}>{s.label}</option>
          ))}
        </select>

        <span className="tb-sep" />

        <button
          className={`tb-btn ${mapOnlyActive ? 'on' : ''}`}
          onClick={onMapOnly}
          title="Hide every overlay for a clean map (click again to restore)"
        >
          {mapOnlyActive ? 'Show tools' : 'Map only'}
        </button>
      </div>
    </header>
  )
}
