const SUPPORTED_PANEL_TYPES = new Set([
  "bar",
  "line",
  "area",
  "horizontalBar",
  "horizontalStackedBar",
  "groupedBar",
  "stackedBar",
  "mixed",
  "gauge",
  "mapScatter",
  "choroplethMap",
  "chronoChoroplethMap",
  "image",
  "kpi",
  "table",
  "deltaList",
]);

import { isAxisPanel, prepareAxisChartData } from "./chartDataModel.js";

export function validatePanelConfig(panel, data, geoData) {
  if (!SUPPORTED_PANEL_TYPES.has(panel.type)) {
    return `Unsupported panel type "${panel.type}".`;
  }

  if (panel.type === "kpi" && panel.items?.length) {
    return null;
  }

  if (panel.type === "image") {
    return panel.imageSrc ? null : "Upload an image for this panel.";
  }

  if (!Array.isArray(data)) {
    return `Data source "${panel.dataSource}" was not loaded.`;
  }

  if (data.length === 0) {
    return `Data source "${panel.dataSource}" has no rows after filtering.`;
  }

  if (isAxisPanel(panel) && panel.dataBinding) {
    const diagnostic = prepareAxisChartData(panel, data).diagnostics.find((item) => item.severity === "error");
    return diagnostic?.message ?? null;
  }

  const columns = new Set(Object.keys(data[0]));

  if (panel.type === "table" || panel.type === "deltaList") {
    return validateFields(panel, columns);
  }

  if (panel.type === "gauge") {
    return columns.has(panel.valueField)
      ? null
      : `Gauge value column "${panel.valueField}" was not found.`;
  }

  if (panel.type === "mapScatter") {
    if (!geoData) {
      return `GeoJSON source "${panel.geoSource}" was not loaded.`;
    }
    for (const field of [panel.nameField, panel.latField, panel.lonField, panel.valueField]) {
      if (!columns.has(field)) {
        return `Map column "${field}" was not found in "${panel.dataSource}".`;
      }
    }
    return null;
  }

  if (panel.type === "choroplethMap" || panel.type === "chronoChoroplethMap") {
    if (!geoData) {
      return `GeoJSON source "${panel.geoSource}" was not loaded.`;
    }
    for (const field of [panel.joinField, panel.valueField]) {
      if (!columns.has(field)) {
        return `Choropleth column "${field}" was not found in "${panel.dataSource}".`;
      }
    }
    return null;
  }

  if (!columns.has(panel.x)) {
    return `Column "${panel.x}" was not found in "${panel.dataSource}".`;
  }

  if (panel.seriesFrom) {
    for (const field of [panel.seriesFrom.nameField, panel.seriesFrom.valueField]) {
      if (!columns.has(field)) {
        return `Series column "${field}" was not found in "${panel.dataSource}".`;
      }
    }
    return null;
  }

  for (const series of panel.series ?? []) {
    if (!columns.has(series.y)) {
      return `Column "${series.y}" was not found in "${panel.dataSource}".`;
    }
  }

  return null;
}

function validateFields(panel, columns) {
  const fields = panel.type === "table" ? panel.columns ?? [] : Object.values(panel.fields ?? {});
  for (const field of fields) {
    if (field && !columns.has(field)) {
      return `Column "${field}" was not found in "${panel.dataSource}".`;
    }
  }
  return null;
}
