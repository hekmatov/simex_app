# SimEx Dashboard V2

A static, config-driven React + ECharts prototype for simulation exercise dashboards.

## Goals

- Run from static web files after build.
- Let non-developers change dashboard views through JSON config and prepared CSV data.
- Keep data processing outside the dashboard.
- Support configurable charts, colors, legends, data sources, and layout presets.

## Development

Install dependencies:

```powershell
pnpm.cmd install
```

Run locally:

```powershell
pnpm.cmd dev -- --host 0.0.0.0 --port 5173
```

Build static files:

```powershell
pnpm.cmd build
```

Create a flash-drive package:

```powershell
pnpm.cmd package:flashdrive
```

Preview the built app:

```powershell
pnpm.cmd preview
```

## Key Files

- `public/config/dashboard.json`: dashboard layout and chart definitions.
- `public/data/**`: prepared display-ready CSV, JSON, and GeoJSON data files.
- `public/vendor/**`: local third-party browser scripts used by visual effects.
- `src/lib/buildEchartsOption.js`: converts chart config into ECharts options.
- `src/components/DashboardRenderer.jsx`: renders the configured dashboard.
- `src/components/ChartPanel.jsx`: renders individual charts, maps, tables, KPIs, fullscreen views, and panel actions.
- `src/components/ChartSettingsPanel.jsx`: edit-mode controls for pages, sections, panels, data, series, axes, legends, styles, and layout.
- `src/lib/chartOptionRegistry.js`: schema-style registry for chart edit options.
- `docs/app-manual.md`: public guide to dashboard use, configuration, deployment, and technical architecture.
- `docs/old-dashboard-migration-map.md`: migration notes from the original PDPC dashboard.
- `docs/municipality-choropleth.md`: municipality choropleth data join and map-source notes.
- `docs/google-feedback-form.md`: Google Form setup for participant bug reports and feature requests.

## Current Feature Map

The dashboard currently supports a config-driven multi-page layout, point-and-click edit mode, uploaded CSV data sources, portable dashboard bundle import/export, global and per-panel visual styling, per-chart data filtering, panel drag/reorder, single-chart and multi-chart fullscreen views, individual chart image export, maps, municipality choropleths, gauges, image panels, and a configurable animated background.

The footer includes a configurable feedback link. For private repositories, use the Google Form workflow in `docs/google-feedback-form.md` instead of linking to GitHub Issues.

For a complete guide to using and understanding the dashboard, see:

```text
docs/app-manual.md
```

## Portable Data Bundles

In edit mode:

- `Upload CSV` embeds a selected CSV as a dashboard data source.
- Uploaded CSV sources appear in chart data-source dropdowns.
- `Export dashboard` downloads a dashboard file containing the dashboard config plus uploaded CSV text.
- `Import dashboard` restores a dashboard file later, including the uploaded CSV data.

Static files already in `public/data/**` remain file-backed. Uploaded CSVs are bundled so they can travel by email or flash drive as one JSON file.

To make browser edit-mode changes part of the GitHub version:

Use the project's current configuration publication workflow to update the shared default dashboard. Exported dashboard files are intended for sharing or restoring browser-configured dashboard views.

When the dashboard app is updated, browser-saved edits are reconciled with the new default dashboard:

- Matching pages, sections, and panels keep the user's current edit-mode configuration.
- New default pages, sections, and panels from the update are added.
- Default file-backed data sources use the latest source definitions from the updated app.
- Uploaded CSVs and custom saved data sources are preserved.
- Global panel colors include panel/chart backgrounds, borders, edit highlight color, and multi-fullscreen selection highlight color.

## Deployment Without Docker

Build the static site:

```powershell
pnpm.cmd build
```

The deployable site is the `dist` folder. It can be copied to a static host such as GitHub Pages, Netlify, Cloudflare Pages, SharePoint static hosting, or a basic internal web server. No Python, Docker, or Node is needed by viewers after the site is built.

For sharing content separately from the app, export a dashboard bundle from edit mode and send the `.json` bundle file. Another user can open the hosted dashboard and import that bundle.

### Cloudflare Pages

Use the Cloudflare-specific build command:

```text
pnpm run build:cloudflare:linux
```

This writes a tiny `portable-dashboard-data.js` stub and lets the hosted dashboard load `public/config/dashboard.json` plus `public/data/**` as separate static files. Do not use the normal `pnpm build` command on Cloudflare Pages because the normal portable build embeds all prepared data into one file for flash-drive use, and that file can exceed Cloudflare Pages' per-file size limit.

## Flash Drive Package

Create the portable folder:

```powershell
pnpm.cmd package:flashdrive
```

The flash-drive package uses the tracked default configuration in `public/config/dashboard.json`.

Copy this folder to a USB drive:

```text
release/SimEx Dashboard V2 Flashdrive/
```

If that folder is open or locked by a running dashboard launcher, the package command creates a fresh timestamped folder under `release/` instead. Use the folder named in the command output.

The user opens:

```text
index.html
```

This package includes `portable-dashboard-data.js`, an embedded copy of the default dashboard config and prepared CSV/GeoJSON data. That embedded data is what allows the dashboard to open from `file://` without a local web server.

If `index.html` shows a blank page, open:

```text
START_DASHBOARD.bat
```

That fallback starts a tiny local server using built-in Windows PowerShell and opens the dashboard at `http://127.0.0.1:8765/`. Keep the PowerShell window open while using the dashboard.

Caveats:

- Online map tiles still need internet access.
- Some institutional browsers may block scripts from USB drives. If that happens, try `START_DASHBOARD.bat`, copy the folder to the computer first, or use a static host.
- Exported dashboard files are the best way to move scenario-specific edits and uploaded CSVs between separate dashboard copies.

## Bundle Size Note

`pnpm.cmd build` may print a Vite warning that one generated JavaScript chunk is larger than 500 kB after minification. This is a warning, not a failed build. The current bundle is large mainly because the browser app includes React, ECharts, map/chart rendering, and the dashboard editor in one static app. If startup speed becomes a deployment concern, the next optimization would be code splitting and lazy-loading heavier chart/editor modules.
