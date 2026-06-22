// Map Base Exporter -- top bar + full-screen map + export panel.
// Holds all UI state and runs both the single-region export and the
// scan pack export (new). Supports multiple named export frames for
// the single-region path.
import { useCallback, useEffect, useRef, useState } from 'react'
import type { Map as MapLibreMap } from 'maplibre-gl'
import { TopBar, type Visibility } from './components/TopBar'
import { MapCanvas } from './components/MapCanvas'
import { ExportPanel, type ExportSettings } from './components/ExportPanel'
import { ScanPanel } from './components/ScanPanel'
import { ScanAnchorOverlay } from './components/ScanAnchorOverlay'
import { exportBaseMap } from './print/exportEngine'
import { boundsForViewport, type Bounds } from './print/viewportUtils'
import type { Frame } from './selection/frame'
import { DEFAULT_MAP_STYLE_ID, getStyleUrl, type MapStyleId } from './map/constants'
import { computeScanGrid, DEFAULT_SCAN_SETTINGS, type ScanSettings, type ScanGrid } from './scan/scanSpec'
import { exportScanPack } from './scan/scanExport'

const DEFAULT_SETTINGS: ExportSettings = {
  sizeId: 'tabloid',
  orientation: 'landscape',
  format: 'png',
  dpi: 150,
  customWidthIn: 11,
  customHeightIn: 8.5,
}

const ALL_VISIBLE: Visibility = { panel: true, labels: true, selectionBox: true }
const ALL_HIDDEN: Visibility = { panel: false, labels: false, selectionBox: false }

/** Which export mode the panel is showing */
type PanelMode = 'export' | 'scan'

export function App() {
  const mapRef = useRef<MapLibreMap | null>(null)

  // -- Single-region export state
  const [settings, setSettings] = useState<ExportSettings>(DEFAULT_SETTINGS)
  const [labelScale, setLabelScale] = useState(1)
  const [detail, setDetail] = useState(2)

  // -- Map Enhancement state (shared by both export and scan paths)
  const [roadWidthMultiplier, setRoadWidthMultiplier] = useState(2.0)
  const [saturation, setSaturation] = useState(1.4)

  const [mapStyleId, setMapStyleId] = useState<MapStyleId>(DEFAULT_MAP_STYLE_ID)
  const [visibility, setVisibility] = useState<Visibility>(ALL_VISIBLE)
  const [selecting, setSelecting] = useState(false)
  const [frames, setFrames] = useState<Frame[]>([])
  const [activeId, setActiveId] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [progress, setProgress] = useState('')

  // -- Scan Pack state
  const [panelMode, setPanelMode] = useState<PanelMode>('export')
  const [scanSettings, setScanSettings] = useState<ScanSettings>(DEFAULT_SCAN_SETTINGS)
  const [scanAnchor, setScanAnchor] = useState<[number, number] | null>(null)
  /** Screen zoom + canvas size captured when the user places the grid.
      Freezes the tile geographic scale so moving the grid does not change tile coverage. */
  const [scanViewState, setScanViewState] = useState<{ zoom: number; screenW: number; screenH: number } | null>(null)
  const [scanGrid, setScanGrid] = useState<ScanGrid | null>(null)
  const [scanBusy, setScanBusy] = useState(false)
  const [scanProgress, setScanProgress] = useState('')

  // Recompute the scan grid whenever anchor, settings, or locked view change
  useEffect(() => {
    if (!scanAnchor || !scanViewState) { setScanGrid(null); return }
    const grid = computeScanGrid(scanAnchor, scanSettings, scanViewState.zoom, scanViewState.screenW, scanViewState.screenH)
    setScanGrid(grid)
  }, [scanAnchor, scanSettings, scanViewState])

  // -- Single-region export handlers
  const onMapReady = useCallback((map: MapLibreMap) => {
    mapRef.current = map
  }, [])

  const toggleVis = useCallback((key: keyof Visibility) => {
    setVisibility(v => ({ ...v, [key]: !v[key] }))
  }, [])

  const renameFrame = useCallback((id: string, name: string) => {
    setFrames(fs => fs.map(f => (f.id === id ? { ...f, name } : f)))
  }, [])

  const deleteFrame = useCallback((id: string) => {
    setFrames(fs => fs.filter(f => f.id !== id))
    setActiveId(a => (a === id ? null : a))
  }, [])

  const clearFrames = useCallback(() => {
    setFrames([])
    setActiveId(null)
  }, [])

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'Delete' && e.key !== 'Backspace') return
      const t = e.target as HTMLElement | null
      if (t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.isContentEditable)) return
      if (!activeId) return
      e.preventDefault()
      deleteFrame(activeId)
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [activeId, deleteFrame])

  const mapOnlyActive =
    !visibility.panel && !visibility.labels && !visibility.selectionBox
  const onMapOnly = useCallback(() => {
    setVisibility(v =>
      !v.panel && !v.labels && !v.selectionBox ? ALL_VISIBLE : ALL_HIDDEN
    )
  }, [])

  const currentViewBounds = useCallback((): Bounds | null => {
    const map = mapRef.current
    if (!map) return null
    const canvas = map.getCanvas()
    return boundsForViewport(
      { center: [map.getCenter().lng, map.getCenter().lat], zoom: map.getZoom() },
      canvas.clientWidth,
      canvas.clientHeight
    )
  }, [])

  const onExport = useCallback(async () => {
    const jobs: { bbox: Bounds; tag?: string }[] =
      frames.length > 0
        ? frames.map((f, i) => ({
            bbox: f.bounds,
            tag: `${String(i + 1).padStart(2, '0')}${f.name.trim() ? `-${f.name.trim()}` : ''}`,
          }))
        : (() => {
            const b = currentViewBounds()
            return b ? [{ bbox: b }] : []
          })()

    if (jobs.length === 0) { setProgress('Map not ready yet.'); return }

    setBusy(true)
    const total = jobs.length
    const saved: string[] = []
    try {
      for (let i = 0; i < jobs.length; i++) {
        const job = jobs[i]
        const label = total > 1 ? `Region ${i + 1} of ${total}: ` : ''
        const result = await exportBaseMap(
          {
            bbox: job.bbox,
            sizeId: settings.sizeId,
            orientation: settings.orientation,
            format: settings.format,
            dpi: settings.dpi,
            labelScale,
            showLabels: visibility.labels,
            detail,
            customWidthIn: settings.customWidthIn,
            customHeightIn: settings.customHeightIn,
            filenameTag: job.tag,
            roadWidthMultiplier,
            saturation,
          },
          msg => setProgress(`${label}${msg}`)
        )
        saved.push(result.filename)
        if (i < jobs.length - 1) await new Promise(r => setTimeout(r, 400))
      }
      setProgress(
        total > 1
          ? `Saved ${saved.length} maps. Allow multiple downloads if your browser asks.`
          : `Saved ${saved[0]}`
      )
    } catch (err) {
      console.error('[MapBaseExporter] export failed:', err)
      setProgress(`Export failed: ${err instanceof Error ? err.message : String(err)}`)
    } finally {
      setBusy(false)
    }
  }, [frames, currentViewBounds, settings, labelScale, detail, visibility.labels, roadWidthMultiplier, saturation])

  // -- Scan Pack handlers
  const onPlaceAnchor = useCallback(() => {
    const map = mapRef.current
    if (!map) return
    const c = map.getCenter()
    const viewZoom = map.getZoom()
    const canvas = map.getCanvas()
    const screenW = canvas.clientWidth
    const screenH = canvas.clientHeight
    // Lock the current view state -- tile geographic scale is frozen from this point
    const viewState = { zoom: viewZoom, screenW, screenH }
    // Compute grid centred on current view to find master bbox dimensions
    const grid = computeScanGrid([c.lng, c.lat], scanSettings, viewZoom, screenW, screenH)
    const geoW = grid.masterBbox[2] - grid.masterBbox[0]
    const geoH = grid.masterBbox[3] - grid.masterBbox[1]
    setScanViewState(viewState)
    setScanAnchor([c.lng - geoW / 2, c.lat + geoH / 2])
  }, [scanSettings])

  const onClearAnchor = useCallback(() => {
    setScanAnchor(null)
    setScanGrid(null)
    setScanViewState(null)
  }, [])

  const onScanExport = useCallback(async () => {
    if (!scanGrid) return
    setScanBusy(true)
    setScanProgress('')
    try {
      const result = await exportScanPack(
        scanGrid,
        scanSettings,
        labelScale,
        visibility.labels,
        msg => setScanProgress(msg),
        roadWidthMultiplier,
        saturation
      )
      setScanProgress(
        `Done -- ${result.tileCount} tiles saved to ${result.filename}`
      )
    } catch (err) {
      console.error('[ScanPack] export failed:', err)
      setScanProgress(`Export failed: ${err instanceof Error ? err.message : String(err)}`)
    } finally {
      setScanBusy(false)
    }
  }, [scanGrid, scanSettings, labelScale, visibility.labels, roadWidthMultiplier, saturation])

  return (
    <div className="app">
      <TopBar
        visibility={visibility}
        onToggle={toggleVis}
        selecting={selecting}
        onToggleSelecting={() => setSelecting(s => !s)}
        onMapOnly={onMapOnly}
        mapOnlyActive={mapOnlyActive}
        mapStyleId={mapStyleId}
        onMapStyleChange={setMapStyleId}
      />
      <div className="workspace">
        <div className="map-stage-wrapper" style={{ position: 'relative', flex: 1 }}>
          <MapCanvas
            labelScale={labelScale}
            showLabels={visibility.labels}
            mode={selecting ? 'draw' : 'edit'}
            showSelectionBox={visibility.selectionBox && panelMode === 'export'}
            frames={frames}
            activeId={activeId}
            onActiveChange={setActiveId}
            onFramesChange={setFrames}
            onMapReady={onMapReady}
            styleUrl={getStyleUrl(mapStyleId)}
          />
          {panelMode === 'scan' && scanGrid && scanAnchor && (
            <ScanAnchorOverlay
              map={mapRef.current}
              grid={scanGrid}
              settings={scanSettings}
              anchor={scanAnchor}
              onAnchorChange={setScanAnchor}
            />
          )}
        </div>

        {visibility.panel && (
          <aside className="panel">
            {/* Mode switcher tabs */}
            <div className="seg" style={{ margin: '12px 16px 0' }}>
              <button
                className={panelMode === 'export' ? 'on' : ''}
                onClick={() => setPanelMode('export')}
              >
                Export
              </button>
              <button
                className={panelMode === 'scan' ? 'on' : ''}
                onClick={() => setPanelMode('scan')}
              >
                Scan Pack
              </button>
            </div>

            {/* Map Enhancement -- shared controls visible in both export and scan modes */}
            <section className="panel-section">
              <h2>Map Enhancement</h2>
              <label className="slider-label">
                <span>
                  Road width <strong>{roadWidthMultiplier.toFixed(1)}x</strong>
                </span>
                <input
                  type="range"
                  min={1}
                  max={4}
                  step={0.25}
                  value={roadWidthMultiplier}
                  onChange={e => setRoadWidthMultiplier(parseFloat(e.target.value))}
                />
              </label>
              <label className="slider-label">
                <span>
                  Colour richness <strong>{saturation.toFixed(1)}x</strong>
                </span>
                <input
                  type="range"
                  min={1}
                  max={3}
                  step={0.1}
                  value={saturation}
                  onChange={e => setSaturation(parseFloat(e.target.value))}
                />
              </label>
              <p className="hint">
                Applied during export only. Roads pop, colours stay true to the style.
              </p>
            </section>

            {panelMode === 'export' && (
              <ExportPanel
                settings={settings}
                onSettingsChange={setSettings}
                labelScale={labelScale}
                onLabelScaleChange={setLabelScale}
                showLabels={visibility.labels}
                onShowLabelsChange={v => setVisibility(prev => ({ ...prev, labels: v }))}
                detail={detail}
                onDetailChange={setDetail}
                selecting={selecting}
                onToggleSelecting={() => setSelecting(s => !s)}
                frames={frames}
                activeId={activeId}
                onActivate={setActiveId}
                onRenameFrame={renameFrame}
                onDeleteFrame={deleteFrame}
                onClearFrames={clearFrames}
                onExport={onExport}
                busy={busy}
                progress={progress}
              />
            )}

            {panelMode === 'scan' && (
              <ScanPanel
                settings={scanSettings}
                onSettingsChange={setScanSettings}
                labelScale={labelScale}
                showLabels={visibility.labels}
                grid={scanGrid}
                hasAnchor={scanAnchor !== null}
                onPlaceAnchor={onPlaceAnchor}
                onClearAnchor={onClearAnchor}
                onExport={onScanExport}
                onBack={() => setPanelMode('export')}
                busy={scanBusy}
                progress={scanProgress}
              />
            )}
          </aside>
        )}
      </div>
    </div>
  )
}
