# Chart Data System V2

## Purpose

The chart editor now describes what columns mean instead of asking users to assemble chart-type-specific configuration fragments. Axis charts use one data-binding model whether the source CSV is long, wide, or somewhere in between.

The model separates four concepts that the previous editor could accidentally overlap:

1. **X observation**: the category or date/time shown along the x-axis.
2. **Measurements**: one or more numeric columns to plot.
3. **Cluster dimensions**: zero or more category columns whose values become separate lines or bar series.
4. **Filters**: category/date selections that limit rows without also changing the x-axis or clustering behavior.

The same column cannot be both the x-axis and a cluster dimension. This prevents the invalid configuration previously seen in the `Age Distribution of HeV-A26 Mortality` chart.

## Versioning decision

- Dashboard configuration schema: `schemaVersion: 2` at runtime.
- Chart data-binding schema: `dataBinding.version: 2`.
- Exported dashboard bundle: `version: 2`.
- Existing V1 axis-panel fields are upgraded to V2 bindings when loaded.
- New exports contain the V2 binding, including uploaded CSV sources.
- Maps, images, tables, gauges, KPI cards, and delta panels keep their specialized configuration because their data semantics are genuinely different from x/y axis charts.

This is a clean internal migration rather than another compatibility layer inside the renderer: the renderer consumes a canonical prepared chart-data result for all V2 axis charts.

## Canonical axis-chart binding

```json
{
  "dataBinding": {
    "version": 2,
    "x": { "field": "date", "type": "temporal" },
    "measures": [
      { "field": "deaths", "label": "Deaths", "color": "#00A676" }
    ],
    "series": { "fields": ["Age group"] },
    "filters": [
      { "field": "Age group", "operator": "in", "values": ["60-79"] }
    ],
    "aggregation": "sum",
    "missingValue": "gap"
  }
}
```

### Long-format example

| date | Age group | deaths |
| --- | --- | ---: |
| 2027-05-01 | 60-79 | 4 |
| 2027-05-01 | 80+ | 3 |

To show all age groups over time, use `date` as x, `deaths` as the measurement, and `Age group` as the cluster field. To show only 60-79-year-olds, keep those roles and filter `Age group` to `60-79`.

To show an age distribution at one date, use `Age group` as x, `deaths` as the measurement, no cluster field, filter `date` to one date, and filter out summary rows such as `total_deaths`.

### Wide-format example

| date | cases | deaths |
| --- | ---: | ---: |
| 2027-05-01 | 120 | 4 |
| 2027-05-02 | 145 | 6 |

To show both measures over time, use `date` as x and select both `cases` and `deaths` as measurements. No pivot or CSV rewrite is required.

## Data preparation pipeline

All V2 axis charts use this sequence:

1. Profile the loaded table and infer numeric, temporal, categorical, and text columns.
2. Validate the configured field roles against the actual CSV.
3. Apply chart filters.
4. Form observation keys from x plus the selected cluster fields.
5. Aggregate duplicate observations using the chosen rule.
6. Produce one canonical list of x-values and prepared series.
7. Convert the prepared result into ECharts options.

Supported duplicate rules are sum, mean, first, last, minimum, maximum, and count. Missing observations can remain gaps or be shown as zero.

The pipeline reports missing columns, non-numeric measurements, empty filter results, duplicate dimension roles, and excessive series counts before rendering.

## Editor behavior

The chart editor now includes a single **Observations, Measurements & Filters** section for axis charts.

- It identifies the likely source shape without requiring a long/wide declaration.
- It displays detected column types, cardinality, and example values from the selected CSV.
- It allows one or several measurement columns.
- It allows multiple cluster dimensions.
- It allows multiple independent filters on any columns.
- It gives a live summary of rows retained, x-values, series, and validation diagnostics.
- Existing controls remain available for chart type, axes, scale, legend, palette, text size, panel size, reference lines, and bar appearance.

## Add-new-chart wizard

`Add chart` now opens a three-step wizard:

1. **Source**: select an existing dashboard CSV or upload a new CSV. Uploaded CSV text is stored as an `uploadedCsv` source.
2. **Data roles**: choose x, measurements, cluster dimensions, filters, aggregation, and missing-value behavior, with live diagnostics.
3. **Chart and review**: choose title, chart type, panel size, and legend behavior, then review row/x/series counts.

Creating a chart from an uploaded CSV is atomic: the source and panel enter dashboard state together, so one cannot be saved without the other.

## CSV change detection and user notification

Each data-backed panel stores a V2 source snapshot containing column names, inferred column profiles, row count, a content fingerprint, and the check timestamp.

When the dashboard loads:

- Changed values or row counts refresh the chart automatically and produce a compatibility report.
- Added or removed columns are reported.
- Case/punctuation-only column renames can be repaired automatically and are reported.
- Missing semantic fields are not replaced with an arbitrary column. The chart is marked for review instead of silently showing plausible but wrong data.

This preserves the original update utility while detecting content-only CSV changes, which the previous column-signature check could not see.

## Bundle, browser persistence, and deployment

The existing persistence model remains:

- Browser edits are stored locally while editing.
- `Export bundle` includes the V2 dashboard configuration and all uploaded CSV text.
- `Import bundle` restores both configuration and uploaded data.
- V1 bundles are upgraded when loaded.
- `Export package default` continues to create `packaged-dashboard-bundle.json`.
- `promote:bundle` continues to write tracked config and uploaded files.
- Portable and flash-drive builds continue to embed prepared static sources.

Because filters, measures, cluster roles, and aggregation are part of each panel's exported `dataBinding`, another user receives the same chart construction rather than only the same raw CSV.

## Preserved feature matrix

| Existing utility | V2 treatment |
| --- | --- |
| Edit/save/cancel/reset | Preserved |
| Drag/reorder, page and section editing | Preserved |
| Fullscreen and multi-fullscreen | Preserved |
| PNG/JPEG panel export | Preserved |
| Source CSV viewer and source hover text | Preserved |
| Date/category selection | Replaced by general multi-column filters |
| Manual series list vs `seriesFrom` | Replaced by measurements plus cluster fields |
| Long/wide selector | Replaced by automatic profiling and field roles |
| CSV schema check | Expanded to schema, row count, inferred types, and content fingerprint |
| Uploaded CSV bundle portability | Preserved and used directly by the wizard |
| Maps, choropleths, gauges, tables, KPI, delta, images | Preserved as specialized panel types |
| Color, legend, axes, references, sizing | Preserved |

## Recommended follow-up work

1. Add a small inline visual preview inside the wizard using the prepared data result.
2. Add per-generated-series style overrides for category-derived series.
3. Add saved chart templates for common epidemiological views.
4. Add a data-source manager for renaming/removing uploaded CSVs and showing dependent panels.
5. Add browser-level regression tests for wizard creation, bundle round-trips, and CSV-change reports.
