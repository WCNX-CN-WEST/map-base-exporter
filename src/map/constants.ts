// Map configuration constants for the Map Base Exporter.
//
// Style-switchable build: the user can pick any style from the TopBar and the
// export will use whichever one is active at export time.

// ── Map style registry ────────────────────────────────────────────────────────
const STADIA_KEY = '3f5b5102-2169-4399-8aa4-51e45abe548f'

export const MAP_STYLES = [
  {
    id: 'liberty',
    label: 'Liberty (Coloured)',
    url: 'https://tiles.openfreemap.org/styles/liberty',
  },
  {
    id: 'positron',
    label: 'Positron (Light)',
    url: 'https://tiles.openfreemap.org/styles/positron/style.json',
  },
  {
    id: 'alidade-smooth',
    label: 'Alidade Smooth (Muted)',
    url: `https://tiles.stadiamaps.com/styles/alidade_smooth.json?api_key=${STADIA_KEY}`,
  },
  {
    id: 'stamen-toner',
    label: 'Stamen Toner (B&W)',
    url: `https://tiles.stadiamaps.com/styles/stamen_toner.json?api_key=${STADIA_KEY}`,
  },
] as const satisfies readonly { id: string; label: string; url: string }[]

export type MapStyleId = (typeof MAP_STYLES)[number]['id']
export const DEFAULT_MAP_STYLE_ID: MapStyleId = 'liberty'

export function getStyleUrl(id: MapStyleId): string {
  return MAP_STYLES.find(s => s.id === id)!.url
}

// Active style URL consumed by the offscreen print renderer. Updated whenever
// the user switches styles so exports always match what they see on screen.
let _activeStyleUrl = getStyleUrl(DEFAULT_MAP_STYLE_ID)
export function setActiveStyleUrl(url: string): void { _activeStyleUrl = url }
export function getActiveStyleUrl(): string { return _activeStyleUrl }

// Kept for any legacy imports — resolves to the current default.
export const TILE_STYLE_URL = getStyleUrl(DEFAULT_MAP_STYLE_ID)

// Zoom levels
export const ZOOM = {
  /** Default zoom on first load */
  DEFAULT: 13,
  /** Minimum zoom */
  MIN: 3,
  /** Maximum zoom — vector stays sharp */
  MAX: 20,
} as const

// Default centre — Okanagan operational theatre (matches the sibling project).
// [lng, lat]
export const DEFAULT_CENTER: [number, number] = [-119.5937, 49.4991]

// Minimum zoom before street-name overlay labels appear (tile name density).
export const MIN_LABEL_ZOOM = 13

// CSS class added to the MapLibre container div.
export const MAP_CONTAINER_CLASS = 'mbe-map-container'
