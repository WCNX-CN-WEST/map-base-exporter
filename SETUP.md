# Map Base Exporter - Setup

**Version: v1.1.0** (shown in the top bar and the export panel)

A standalone map framer and exporter. Frame a region on a full-colour map and
export it as a high-resolution PNG or PDF - built to drop into Adobe Illustrator
as a locked background layer. No routes, no stamps, no project storage.

Separate from the Route Map PWA in the parent folder; it does not touch or
depend on it.

## Prerequisites (one-time)

1. Install Node.js LTS from https://nodejs.org (the Windows installer adds
   `node` and `npm` to your PATH).
2. Restart PowerShell after install.

## Install & Run

```powershell
cd "C:\Users\tbour\OneDrive - 10082743 Manitoba INC DB Canada Cabinet Corp\Desktop\Map Scrapper\map-base-exporter"
npm install
npm run dev
```

Open Microsoft Edge (or any modern browser) at the URL it prints (usually
`http://localhost:5173`). See HOW_TO_RUN.txt for a step-by-step version.

## Build for production

```powershell
npm run build
npm run preview
```

## How to use it

Top toolbar:
- Draw region - drag a rectangle to set the export area.
- Street names / Selection box / Panel - show or hide each overlay.
- Map only - hide every overlay for a clean map; click again to restore.

Export panel (right side):
1. Street names: toggle the overlay and scale the font with the slider.
2. Document: size (Letter / Tabloid / A3 / A4 / Custom), orientation,
   format (PNG / PDF), resolution (150 or 300 DPI).
3. Detail: keeps your selected rectangle as the exact boundary and re-renders
   it at a higher zoom (1x-6x) so more streets and labels appear and lines stay
   crisp. The readout shows the resulting pixel size, megapixels and effective
   DPI; very large requests are auto-capped (you'll see a note).
4. Export - the file downloads through your browser. No region drawn = the
   current view is exported.

### Notes on the export

- The selected rectangle is the boundary; if its shape differs from the page
  shape, a little extra map shows on the longer axis so nothing is cut off.
- Large outputs render in tiles (each <= 2000 px) at one zoom and are stitched
  seamlessly - no quality loss.
- PDFs embed a lossless PNG at the page size, so the map stays crisp.
- Exported street names come from the map's own labels scaled by the font
  slider; on screen they're drawn as a crisp SVG overlay. Same slider drives
  both.

## Hosting it on the web

See DEPLOY.md - GitHub Pages (workflow included) or Netlify Drop.

## Version history

| Version | Date | Changes |
|---------|------|---------|
| v1.1.0 | 2026-06-19 | Top toolbar with overlay toggles + Map-only view; export Detail control (supersample, selection stays the boundary, capped); relative paths + GitHub Pages deploy workflow. |
| v1.0.0 | 2026-06-19 | Initial release - full-colour map, rectangle region tool, street-name overlay with font slider, tiled print-resolution export to PNG/PDF (Letter/Tabloid/A3/A4/Custom, portrait/landscape, 150/300 DPI). |

## What was verified

- `npm run typecheck` (TypeScript strict) - clean.
- `npm run build` (production Vite + Rollup, 270 modules) - succeeds.
- Unit tests: 22 on the viewport/page-size math + 10 on the detail-clamp math -
  all pass.
- React/UI layer renders without runtime errors.

**Still verify in the browser (Tim):** the live map render, tile loading, the
rectangle drag, overlay toggles, and an actual PNG/PDF export (try a 2x-3x
detail one). These need a real WebGL browser with internet access, which the
build sandbox does not have.

## Dev notes / gotchas (for future sessions)

- **This folder is in OneDrive, which is hostile to Node tooling.** Two real
  problems hit during the build:
  1. `npm install` here is very slow and OneDrive syncing mid-install left a
     package corrupted ("Cannot find module './browsers'" from caniuse-lite).
     Fix: pause OneDrive, delete `node_modules` + `package-lock.json`, reinstall.
  2. Saving source files through the editor tooling sometimes did not flush the
     full file to disk through the OneDrive sync layer (files came back
     truncated). Writing files via a shell heredoc persisted reliably. If a file
     looks cut off, rewrite it whole.
- Source is kept ASCII-only to avoid any encoding mangling on this mount.
- Keep a single `tsconfig.json` (`include: ["src"]`); a referenced composite
  node project with `noEmit` breaks `tsc --noEmit` (error TS6310).
