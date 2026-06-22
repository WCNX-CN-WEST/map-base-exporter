// Version manifest - single source of truth for the build identifier.
// Per Tim's versioning standard: SemVer, version visible in the UI,
// changelog entry required on every bump.

export const VERSION = '1.5.1'

export interface ChangelogEntry {
  version: string
  date: string
  editor: string
  changes: string[]
}

export const CHANGELOG: ChangelogEntry[] = [
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
