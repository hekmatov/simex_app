# SimEx Dashboard V2 App Manual

## Purpose and scope

SimEx Dashboard V2 is a static, configurable web dashboard for presenting simulation-exercise data. It combines prepared epidemiological and socio-economic data with configurable charts, maps, tables, indicators, and comparison panels. This manual describes the published dashboard and its supported configuration and deployment model.

## Dashboard at a glance

The default dashboard has three pages:

- **HeV-A26 Dashboard Home** for scenario overview and headline indicators.
- **HeV-A26 Dashboard: Epidemiological overview** for cases and mortality, healthcare, testing, wastewater surveillance, and vaccination.
- **HeV-A26 Dashboard: Socio-economic overview** for behaviour, public trust, subjective wellbeing, economy, and absenteeism.

Each page contains sections, which in turn contain panels. A panel is an independently configured visualisation or display component.

## Using the dashboard

### View mode

Use the page tabs to move between dashboard pages, then scroll through the sections and panels. Hover a chart point or map feature to inspect values where a tooltip is available.

Panel actions can include:

- Fullscreen display for one panel.
- Multi-panel fullscreen selection for two to four panels.
- Image export as PNG or JPEG at 96, 150, or 300 DPI-equivalent scales.
- Source information and an in-app view of the source CSV, where configured.

Charts automatically increase text and visual weight when shown in tall, large, or fullscreen panels.

### Edit mode

Edit mode provides browser-based controls for changing the dashboard without manually modifying JSON or source code. It can be used to:

- Edit dashboard header text, page titles, scenario metadata, and section text.
- Add, rename, or remove pages.
- Add, reorder, resize, or remove panels.
- Configure panel data, filters, chart series, axes, colours, labels, legends, and reference lines.
- Upload a CSV as a dashboard data source.
- Import or export a portable dashboard bundle.
- Configure global and panel-specific visual surfaces.

Edits are stored in the browser while the dashboard is in use. Export a bundle to preserve or share a configured dashboard.

## Panel types

The application supports the following panel types:

- Line, area, bar, grouped-bar, stacked-bar, horizontal-bar, and horizontal-stacked-bar charts.
- Mixed bar-and-line charts.
- Gauge indicators.
- Point/scatter maps and choropleth maps.
- Animated choropleth maps with timeline controls.
- Tables.
- KPI/statistic cards.
- Delta or comparison lists.
- Image panels.

The visible default dashboard contains the panel types appropriate to its prepared data. Additional supported panel types can be selected in edit mode.

## Data, filters, and chart construction

### Data sources

The dashboard is data-driven. Its default configuration is in `public/config/dashboard.json`; prepared data is held under `public/data/`.

| Content | Repository location |
| --- | --- |
| Dashboard configuration | `public/config/dashboard.json` |
| Biomedical data | `public/data/biomedical/` |
| Socio-economic data | `public/data/socio-economic/` |
| Geographic boundaries | `public/data/geo/` |
| Promoted uploaded CSVs | `public/data/uploaded/` |
| Visual assets | `public/assets/` |

CSV files provide chart and table data. JSON and GeoJSON files provide geographic boundaries and other structured content. Runtime data processing is deliberately limited: data is expected to be prepared before it is added to the dashboard.

### Chart Data System V2

Axis-based charts use the version 2 chart data-binding model. It makes chart meaning explicit instead of relying on separate configuration paths for long and wide CSVs.

A binding describes:

- **X observation**: the category or date/time value shown along the x-axis.
- **Measurements**: one or more numeric fields to plot.
- **Cluster dimensions**: categorical fields whose values form separate series.
- **Filters**: conditions that retain only relevant rows.
- **Aggregation**: how duplicate observations are combined.
- **Missing-value treatment**: whether missing values remain gaps or are shown as zero.

The same field cannot be both the x observation and a cluster dimension. This avoids ambiguous chart definitions and makes a chart's interpretation easier to inspect.

For example, with `date`, `age group`, and `deaths` columns:

- To plot deaths over time by age group, use `date` as x, `deaths` as the measurement, and `age group` as the cluster dimension.
- To plot an age distribution on one date, use `age group` as x, `deaths` as the measurement, and a date filter. Do not use a cluster dimension.

Supported duplicate-observation rules are sum, mean, first, last, minimum, maximum, and count.

### Filters and ordering

Every panel controls its own data selection. Common options are:

- Date selections or date ranges.
- Category selections.
- Multiple independent filters.
- Category ordering by source-file order, alphabetically, or values from a selected data field.

One panel's filters do not silently change another panel's data. This permits several panels to show distinct views of the same source file.

### Data validation and compatibility

The dashboard validates panel configuration against loaded source data. It detects missing fields, invalid numeric measurements, empty filter results, invalid role combinations, and unsupported panel types.

For data-backed panels, the compatibility model can compare source columns, inferred field types, row counts, and a content fingerprint. Clear case- or punctuation-only field renames can be repaired; ambiguous replacements are not guessed. A panel is instead marked for review, protecting against a plausible but incorrect visualisation.

## Editing charts and layout

### Adding a chart

The Add chart workflow has three stages:

1. **Source** — choose an existing CSV or upload a new one.
2. **Data roles** — choose x, measurements, cluster dimensions, filters, aggregation, and missing-value behaviour.
3. **Chart and review** — select the title, panel type, panel size, and legend settings, then review the generated chart summary.

The editor reports retained rows, x values, generated series, and configuration diagnostics before a chart is created.

### Series, axes, and style

Depending on the panel type, edit mode supports:

- Manual colours and named colour palettes.
- Reversible Likert-style and other sequential palettes.
- Line width, line style, markers, area fills, and shadows.
- Bar width, gaps, grouping, and stacking.
- Primary and secondary y-axes.
- Legend visibility, placement, symbols, and font size.
- Axis titles, label rotation, ranges, and zero/automatic scaling.
- Reference lines with configurable value, label, colour, axis, and line style.
- Panel size, panel background, chart-area background, and border styling.

Mixed charts keep line series above bar series to preserve visibility.

### Maps

Point maps use a map base layer with local overlay data. They support pan, wheel zoom, zoom buttons, reset/recenter controls, and configurable location, label, and value fields.

Choropleth panels join prepared data to local GeoJSON boundaries. Their configuration selects the geometry source, join field, value field, label field, colour scale, and boundary appearance. Animated choropleths add a play/pause timeline.

Map base tiles may require internet access. Boundary geometry and thematic data remain part of the static dashboard package.

### Other panels

- **Gauges** display a value against configurable maximum, range colours, arc width, unit, and alert range.
- **Tables** show selected fields from a data source.
- **KPI cards** present a primary value with supporting text.
- **Delta/comparison lists** show configurable rows of values or changes.
- **Image panels** support uploaded browser image formats, fit/crop/stretch display, zoom, positioning, and alt text.

## Dashboard files

A dashboard file is a JSON file containing the dashboard configuration together with uploaded CSV text. It preserves panel data bindings, page structure, layout, and styling.

Use **Export dashboard** to create a portable, shareable copy of the configured dashboard. Use **Import dashboard** to restore it in another dashboard instance.

To share a scenario-specific version:

1. Make and save edits in edit mode.
2. Export a dashboard file.
3. Share the JSON file.
4. Import it into another copy of the dashboard.

The application accepts supported earlier bundle formats and upgrades them to the current model when loading.

## Technical architecture

### Architecture overview

SimEx Dashboard V2 is a client-side single-page application. A browser loads a static HTML, JavaScript, CSS, configuration, and data package; React then renders the dashboard from configuration and loaded data.

```text
Static files
  ├─ dashboard configuration and data sources
  ├─ React application
  └─ CSS and local assets
          ↓
Configuration and data loader
          ↓
Dashboard state, validation, migration, and reconciliation
          ↓
Page, section, and panel React components
          ↓
Apache ECharts options or specialised panel renderers
          ↓
Interactive dashboard in the browser
```

This design separates **content** (configuration and prepared data) from **application behaviour** (React components and chart-rendering code). In many cases, dashboard content can therefore be changed through the editor or configuration files without changing the application code.

### Technology versions

| Technology | Declared version | Role |
| --- | --- | --- |
| React | `^19.1.0` | User-interface components and state updates |
| React DOM | `^19.1.0` | Browser rendering for React |
| Vite | `^6.3.5` | Development server and static production build |
| Vite React plugin | `^4.6.0` | JSX and React integration for Vite |
| Apache ECharts | `^5.6.0` | Chart, gauge, and choropleth rendering |
| echarts-for-react | `^3.0.2` | React-oriented ECharts component integration |
| Papa Parse | `^5.5.3` | CSV parsing in the browser |

`^` means compatible updates within the same major version may be installed. The exact installed package versions are recorded in the project lockfile.

The dashboard configuration schema is `schemaVersion: 2`, chart bindings use `dataBinding.version: 2`, and exported dashboard bundles use version 2.

### React implementation

The application entry point is `src/main.jsx`. It creates the React root, loads global styles, and registers a service worker when the browser supports one. Rendering is wrapped in `React.StrictMode`, which helps expose unsafe lifecycle patterns during development.

`src/App.jsx` owns the top-level dashboard state. Its principal responsibilities are:

- Load the default dashboard configuration.
- Restore compatible browser-saved edits.
- Load and cache all referenced data sources.
- Migrate older configuration structures to the current chart data model.
- Reconcile configured panels with newly loaded source data.
- Persist safe configuration changes to browser storage.
- Manage edit sessions, preview changes, save, reset, import, and export.

The application keeps configuration and runtime data separate. Saved configuration contains pages, panels, data-source definitions, and settings; loaded rows and GeoJSON are attached at runtime as `loadedData`. This prevents large parsed datasets from being copied into browser persistence with every edit.

React components are structured by dashboard responsibility:

| Component or module | Responsibility |
| --- | --- |
| `src/App.jsx` | Application state, persistence, import/export, and configuration updates |
| `src/components/DashboardRenderer.jsx` | Header, tabs, pages, sections, editing controls, and panel placement |
| `src/components/ChartPanel.jsx` | A single panel's renderer, actions, fullscreen behaviour, and specialised displays |
| `src/components/ChartSettingsPanel.jsx` | Point-and-click panel editing interface |
| `src/components/ChartSettingsPanelV2.jsx` | Tabbed editor implementation used by the settings interface |
| `src/components/LayoutGrid.jsx` | Edit-mode panel ordering and drag behaviour |
| `src/lib/chartOptionRegistry.js` | Registry of editor tabs, option groups, and panel-specific controls |

State updates are configuration-first: a panel edit creates an updated configuration, validates it, reloads data only when data sources have changed, and then re-renders the affected dashboard. This keeps ordinary style and layout edits responsive while correctly reloading data after a data-source change.

### Browser persistence and reconciliation

The dashboard stores browser edits in `localStorage`. Browser state is useful for continuing edits on the same device, but it is not a substitute for an exported bundle.

On startup, the app loads the default configuration and merges compatible saved browser edits into it. Matching page, section, and panel identifiers retain their edits; newly published default content can be added; uploaded and custom data sources are preserved. This approach lets the baseline dashboard evolve without unnecessarily discarding local configuration work.

The app also stores a device layout preference separately, allowing display-oriented choices to remain local to the browser.

### Vite and static build model

Vite supplies the development server and produces the production-ready static site. The Vite configuration uses a relative base path (`./`), allowing the built application to work from a subdirectory as well as from a portable package.

Relevant scripts are:

| Command | Purpose |
| --- | --- |
| `pnpm.cmd dev -- --host 0.0.0.0 --port 5173` | Start a local development server |
| `pnpm.cmd build` | Produce a static build in `dist/` |
| `pnpm.cmd preview` | Preview the production build |
| `pnpm.cmd build:cloudflare` | Windows-oriented Cloudflare build |
| `pnpm run build:cloudflare:linux` | Linux-oriented Cloudflare build |
| `pnpm.cmd package:flashdrive` | Create a portable package under `release/` |

Before ordinary development and production builds, a build step prepares portable dashboard data. For a normal static or portable build, configuration and prepared source data can be embedded in `portable-dashboard-data.js`. This makes the dashboard usable when opened directly from a file system, where browser security rules can prevent normal `fetch` requests for nearby CSV or JSON files.

For Cloudflare Pages, the dedicated build leaves configuration and data as separate static resources instead of producing one large embedded-data file. This avoids static-host file-size limits and lets the hosted site load its data normally.

### Data loading and portable operation

`src/lib/loadDashboard.js` implements the data-loading strategy.

1. It checks whether a portable embedded dashboard is available.
2. It loads `config/dashboard.json` when running from a web server.
3. It loads each configured source as CSV, JSON, GeoJSON, or an uploaded CSV.
4. It caches loaded sources to avoid repeated parsing and network requests.
5. When direct-file loading is used, it reads embedded portable sources rather than relying on fetch requests.

CSV parsing is performed in the browser by Papa Parse. Uploaded CSVs are represented as configuration data containing their file name and text, so an exported bundle can carry both a panel definition and the source data it needs.

### Apache ECharts implementation

Apache ECharts is the primary visualisation engine. `src/lib/buildEchartsOption.js` translates a panel's configuration and prepared data into the option object expected by ECharts.

For an axis chart, the option builder creates:

- A category or time x-axis.
- One or two value axes.
- Series for bars, lines, areas, and mixed charts.
- Tooltip, legend, title, grid, palette, and animation settings.
- Optional data labels and reference lines.

The Chart Data System V2 prepares a canonical list of x values and series values before the option builder runs. This is an important design decision: ECharts receives already-interpreted chart data, rather than being responsible for resolving CSV structure, filters, and aggregation rules. The same rendering path can then support both long and wide source data.

The option builder also:

- Registers and caches map geometry for choropleths.
- Builds ECharts gauge options.
- Uses panel dimensions to scale fonts, grid spacing, marker sizes, line weights, and map elements.
- Keeps line series above bar series in mixed charts.
- Supports palettes, explicit series colours, transparent chart surfaces, and value formatters.

`ResizeObserver` is used where needed to react to real rendered panel dimensions. This is why a chart in a tall or fullscreen panel can use its added space rather than retaining the typography of a normal panel.

### Styling and visual design

Global styling is defined in `src/styles.css`. The dashboard uses CSS for the page layout, panel grid, edit controls, fullscreen overlays, responsive behaviour, and visual states such as dragging and panel selection.

The visual design separates:

- Panel surface colour and border.
- Inner chart-area colour and border.
- Edit-mode highlight colour.
- Multi-panel fullscreen selection highlight.

Panels inherit global surface settings by default, while individual panels can use their own overrides. This preserves visual consistency while allowing an important chart or map to be distinguished.

The application also supports an optional animated background using locally included browser assets. Its values are clamped to safe ranges before use, and background updates are isolated from ordinary chart edits so the effect does not restart unnecessarily.

### Configuration and validation design decisions

Several implementation decisions make the dashboard safer to maintain:

- **Configuration-driven content:** pages, sections, panels, source references, and most chart settings live outside React component code.
- **Prepared-data model:** intensive data transformation is expected before data enters the dashboard, keeping browser rendering predictable.
- **Explicit field roles:** Chart Data System V2 prevents a field from having conflicting roles.
- **Specialised panel models:** maps, gauges, tables, KPIs, comparison lists, and images retain their own configurations because their data semantics differ from x/y charts.
- **Validation before rendering:** missing fields and unsupported configurations are reported instead of producing misleading results.
- **Conservative source reconciliation:** unambiguous renames may be repaired, but semantic substitutions are never guessed.
- **Portable bundles:** configuration and uploaded CSV data can travel together without needing a server-side database.
- **Static deployment:** the deployed app does not require a runtime API, database, Python process, or container.

## Deployment

Build the static site with:

```powershell
pnpm.cmd build
```

Deploy the resulting `dist/` directory to any static host, such as GitHub Pages, Netlify, Cloudflare Pages, SharePoint static hosting, or an internal web server.

Viewers need only a modern web browser. Node.js and package tools are required only by maintainers who build or package the dashboard.

For a portable folder, run:

```powershell
pnpm.cmd package:flashdrive
```

Open the packaged `index.html`. If a browser blocks scripts opened directly from portable storage, use the supplied `START_DASHBOARD.bat` launcher to serve the package locally.

## Practical guidance

- Give every panel a descriptive title and, where appropriate, source information.
- Keep CSV column names stable and data types consistent.
- Check panel filters first when a chart is empty.
- Use a table alongside a chart when viewers need exact values.
- Keep units consistent across titles, axes, labels, and source data.
- Test a map after changing its data-to-boundary join field.
- Export a dashboard file before a substantial round of browser edits or before importing another dashboard file.
- Use 150 or 300 DPI-equivalent exports for reports and presentation slides.

## Further technical references

- `docs/chart-data-system-v2.md` explains the Chart Data System V2 model and migration details.
- `docs/municipality-choropleth.md` documents the municipal choropleth data join.
- `README.md` contains a concise project and deployment overview.
