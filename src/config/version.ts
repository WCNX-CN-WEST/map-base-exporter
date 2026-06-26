// Version manifest - single source of truth for the build identifier.
// Per Tim's versioning standard: SemVer, version visible in the UI,
// changelog entry required on every bump.

export const VERSION = '1.5.6'

export interface ChangelogEntry {
  version: string
  date: string
  editor: string
  changes: string[]
}

export const CHANGELOG: ChangelogEntry[] = [
  {
    version: '1.5.6',
    date: '2026-06-26',
    editor: 'TARS',
    changes: [
      'Bug fix: PNG/JPEG/PDF export always timed out with "Print tile render timed out" on GitHub Pages.',
      'Root cause: offscreen MapLibre instances never fired the idle event (same tile-request loop as the isReady bug).',
      'Fix: added render-event fallback in renderTile() — after ≥ 3 render frames + 750 ms quiet, capture the canvas.',
      'Hard cap: if renders are continuous (sprite animation etc.), capture 8 s after first frame.',
      'load+idle primary path unchanged — still used when the environment supports it.',
    ],
  },
  {
    version: '1.5.5',
    date: '2026-06-26',
    editor: 'TARS',
    changes: [
      'Bug fix: map never reached "ready" state on GitHub Pages — the MapLibre "load" event was not firing because tile requests kept the map from going idle, locking all exports at "Map not ready yet."',
      'Added 4-second fallback in useMapInstance: if "load" does not fire but the style already has layers (style._loaded), the map is marked ready so exports work immediately.',
      'Same resilience pattern applied to the style-switcher path (styledata event + 4 s fallback).',
      'extractStreetLabelLayerIds wrapped in try/catch so an exception can never silently block isReady from being set.',
    ],
  },
  {
    version: '1.5.4',
    date: '2026-06-26',
    editor: 'TARS',
    changes: ['Fixed Export/Scan Pack tab buttons not rendering: replaced .seg class with dedicated .panel-tabs class to avoid CSS overflow-hidden collapse in flex-column panel context.'],
  },
  {
    version: '1.5.3',
    date: '2026-06-26',
    editor: 'Claude (Anthropic)',
    changes: [
      'Bug fix: label duplication on export -- GL text layers are now always hidden unconditionally during tile rendering (using extractLabelLayerIds, not just street labels) so Canvas 2D overlay is the sole source of street names in every export',
      'Bug fix: responsive panel -- ExportPanel no longer renders a nested <aside> panel wrapper, eliminating a flex-sizing conflict that caused the Export/Scan Pack tabs to disappear on smaller displays',
      'Panel width is now responsive via clamp(260px, 28vw, 330px) so the UI scales gracefully on narrow viewports',
      'App title and version moved to the outer panel header so they remain visible regardless of which panel mode is active',
    ],
  },
  {
    version: '1.5.2',
    date: '2026-06-22',
    editor: 'Claude (Anthropic)',
    changes: [
      'JPEG export format added to the Export panel -- choose JPEG alongside PNG and PDF',
      'JPEG quality slider (1-100) appears when JPEG is selected; default 85 balances file size and fidelity',
      'JPEG encoding uses the browser Canvas toBlob API with user-controlled quality; files download as .jpg',
    ],
  },
  {
    version: '1.5.1',
    date: '2026-06-22',
    editor: 'Claude (Anthropic)',
    changes: [
      'Bug fix: grid drag now continues when cursor leaves the grid element -- replaced setPointerCapture + React synthetic events with window.addEventListener(pointermove), same pattern as SelectionOverlay',
      'Bug fix: scroll-zoom now works over the scan grid -- wheel events on the overlay are forwarded to the MapLibre container so zoom is never blocked by the grid',
      'Bug fix: road width boost now pre-processes the style JSON once before tile rendering instead of using setPaintProperty after load -- eliminates timing issues and guarantees widths are baked into the first render',
      'Road width: added minimum floor (multiplier * 0.5 px) for zero-width stops so laneways and service roads that are 0 px at low zoom become visible in exports',
    ],
  },
  {
    version: '1.5.0',
    date: '2026-06-22',
    editor: 'Claude (Anthropic)',
    changes: [
      'Map Enhancement controls: road width multiplier (1x-4x) and colour richness (1x-3x) sliders in the panel, visible in both Export and Scan Pack modes',
      'Road width boost applied via MapLibre paint property overrides on all transportation line layers before the offscreen tile is captured',
      'Colour saturation boost applied post-compositing via Canvas 2D saturate() filter -- GPU-accelerated, zero performance cost',
      'Enhancement settings recorded in the Scan Pack ZIP manifest for reproducibility',
    ],
  },
  {
    version: '1.4.0',
    date: '2026-06-22',
    editor: 'Claude (Anthropic)',
    changes: [
      'Scan Pack: fixed tile geographic coordinates -- tiles now cover the area visible on screen at the current zoom, so what you see in the grid overlay is exactly what gets exported',
      'Scan Pack: added back button at the top of the Scan Pack panel so you can always return to the Export panel',
    ],
  },
  {
    version: '1.3.0',
    date: '2026-06-20',
    editor: 'Claude (Anthropic)',
    changes: [
      'Multiple export regions - draw as many regions as you like and export them all in one run, each as its own image file, ready to bring into a stitching app',
      'Editable region frames - move a region by dragging its body and resize it with the eight handles on the active frame; frames stay locked to the ground as you pan and zoom',
      'Name each region - an optional name per region flows into the exported filename so drilled-down maps are easy to identify',
      'Region list in the panel with per-region delete and Clear all; press Delete or Backspace to remove the selected region on the map',
      'Exports run sequentially with per-region progress; your browser may ask once to allow multiple downloads',
    ],
  },
  {
    version: '1.2.0',
    date: '2026-06-19',
    editor: 'Claude (Anthropic)',
    changes: [
      'Street names now render in the exported PNG/PDF - the export paints the same street-name overlay you see on screen instead of relying on MapLibre GL labels, which were dropping out of the offscreen render',
      'The Font-size slider now controls the size of street names in the exported file, sized in points so names stay consistent across page sizes and DPI',
      'Street-name placement logic moved to a shared module so screen and export can never disagree on which names appear',
    ],
  },
  {
    version: '1.1.0',
    date: '2026-06-19',
    editor: 'Claude (Anthropic)',
    changes: [
      'Top toolbar: toggle the control panel, street-name overlay and selection box on/off, plus a one-click Map-only clean view',
      'Export detail control - keeps the selected rectangle as the exact boundary and re-renders it at higher zoom (supersampling) for maximum granularity, with safety caps on output size',
      'Relative asset paths + GitHub Pages deploy workflow for hosting the app at a web link',
    ],
  },
  {
    version: '1.0.0',
    date: '2026-06-19',
    editor: 'Claude (Anthropic)',
    changes: [
      'Initial release - standalone Map Base Exporter',
      'Full-colour MapLibre GL map on OpenFreeMap vector tiles (no API key)',
      'Rectangle selection tool locked to a geographic bounding box',
      'Street name SVG overlay with live font-size slider',
      'Export engine: offscreen tiled render at print resolution',
      'Document sizes Letter / Tabloid / A3 / A4 / Custom, portrait / landscape, PNG / PDF, 150 or 300 DPI',
    ],
  },
]
