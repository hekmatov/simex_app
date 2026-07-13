export const CHART_DATA_MODEL_VERSION = 2;

const AXIS_PANEL_TYPES = new Set([
  "bar",
  "line",
  "area",
  "horizontalBar",
  "horizontalStackedBar",
  "groupedBar",
  "stackedBar",
  "mixed",
]);

const DATE_NAME_PATTERN = /date|datum|time|snapshot|month|year/i;
const STRICT_DATE_NAME_PATTERN = /date|datum|time|snapshot/i;
const IDENTIFIER_NAME_PATTERN = /(^|[_\s-])(id|code|key)($|[_\s-])/i;

export function isAxisPanel(panel) {
  return AXIS_PANEL_TYPES.has(panel?.type);
}

export function profileTabularData(rows = []) {
  const safeRows = Array.isArray(rows) ? rows : [];
  const names = [...new Set(safeRows.flatMap((row) => Object.keys(row ?? {})))];
  const columns = names.map((name) => profileColumn(name, safeRows));
  const numericColumns = columns.filter((column) => column.type === "number");
  const dimensionColumns = columns.filter((column) => column.type === "category" || column.type === "temporal");
  const likelyLong = numericColumns.length === 1 && dimensionColumns.length >= 2;
  const likelyWide = numericColumns.length > 1;

  return {
    version: CHART_DATA_MODEL_VERSION,
    rowCount: safeRows.length,
    columns,
    numericColumns: numericColumns.map((column) => column.name),
    temporalColumns: columns.filter((column) => column.type === "temporal").map((column) => column.name),
    categoryColumns: columns.filter((column) => column.type === "category").map((column) => column.name),
    shape: likelyLong ? "long" : likelyWide ? "wide" : "simple",
    fingerprint: fingerprintRows(safeRows, names),
  };
}

export function createSuggestedDataBinding(rows = [], overrides = {}) {
  const profile = profileTabularData(rows);
  const xField = overrides.xField
    ?? profile.temporalColumns[0]
    ?? profile.categoryColumns[0]
    ?? profile.columns[0]?.name
    ?? "";
  const measureFields = overrides.measureFields?.length
    ? overrides.measureFields
    : profile.numericColumns.slice(0, 1);

  return {
    version: CHART_DATA_MODEL_VERSION,
    x: {
      field: xField,
      type: profile.temporalColumns.includes(xField) ? "temporal" : "category",
    },
    measures: measureFields.map((field) => ({ field, label: field })),
    series: { fields: [] },
    filters: [],
    aggregation: "sum",
    missingValue: "gap",
  };
}

export function legacyBindingForPanel(panel) {
  if (!isAxisPanel(panel)) {
    return null;
  }
  if (panel.dataBinding?.version === CHART_DATA_MODEL_VERSION) {
    return structuredClone(panel.dataBinding);
  }

  const measures = panel.seriesFrom?.valueField
    ? [{ field: panel.seriesFrom.valueField, label: panel.yAxisTitle || panel.seriesFrom.valueField }]
    : uniqueMeasures(panel.series ?? []);
  const filters = [];

  if (panel.dateSelection?.column) {
    const selection = panel.dateSelection;
    if (selection.mode === "range") {
      filters.push({ field: selection.column, operator: "range", min: selection.start, max: selection.end });
    } else if (selection.mode === "single") {
      filters.push({ field: selection.column, operator: "in", values: [selection.value] });
    } else if (Array.isArray(selection.values)) {
      filters.push({ field: selection.column, operator: "in", values: selection.values });
    }
  }
  if (panel.categorySelection?.column && Array.isArray(panel.categorySelection.values)) {
    filters.push({
      field: panel.categorySelection.column,
      operator: "in",
      values: panel.categorySelection.values,
    });
  }
  for (const filter of panel.filters ?? []) {
    if (filter?.column && filter.equals !== undefined) {
      filters.push({ field: filter.column, operator: "in", values: [filter.equals] });
    } else if (filter?.column && Array.isArray(filter.in)) {
      filters.push({ field: filter.column, operator: "in", values: filter.in });
    }
  }

  return {
    version: CHART_DATA_MODEL_VERSION,
    x: {
      field: panel.x ?? "",
      type: panel.xAxisMode === "date" || (panel.xAxisMode !== "category" && STRICT_DATE_NAME_PATTERN.test(panel.x ?? ""))
        ? "temporal"
        : "category",
    },
    measures,
    series: {
      fields: panel.seriesFrom?.nameField ? [panel.seriesFrom.nameField] : [],
    },
    filters: deduplicateFilters(filters),
    aggregation: panel.seriesFrom ? "sum" : "first",
    missingValue: "gap",
  };
}

export function migrateDashboardToDataModel(config) {
  const nextConfig = structuredClone(config);
  nextConfig.schemaVersion = CHART_DATA_MODEL_VERSION;
  for (const page of nextConfig.pages ?? []) {
    for (const section of page.sections ?? []) {
      for (const panel of section.panels ?? []) {
        if (isAxisPanel(panel) && !panel.dataBinding) {
          panel.dataBinding = legacyBindingForPanel(panel);
        }
      }
    }
  }
  return nextConfig;
}

export function prepareAxisChartData(panel, rows = []) {
  const binding = panel?.dataBinding ?? legacyBindingForPanel(panel);
  const safeRows = Array.isArray(rows) ? rows : [];
  const profile = profileTabularData(safeRows);
  const diagnostics = validateBinding(binding, profile);
  if (!binding || diagnostics.some((item) => item.severity === "error")) {
    return emptyPreparedData(binding, profile, diagnostics, safeRows.length);
  }

  const filteredRows = applyDataFilters(safeRows, binding.filters ?? []);
  const xType = resolveXType(binding, profile, diagnostics);
  const seriesFields = binding.series?.fields ?? [];
  const groupKeys = collectGroupKeys(filteredRows, seriesFields);
  const xValues = orderXValues(
    uniqueValues(filteredRows.map((row) => row?.[binding.x.field])),
    xType,
    panel.categoryOrder,
  );
  const measures = binding.measures ?? [];
  const preparedSeries = [];

  for (const measure of measures) {
    const groups = groupKeys.length > 0 ? groupKeys : [{ id: "all", values: [], label: "" }];
    for (const group of groups) {
      const name = seriesName(measure, group, measures.length, seriesFields.length);
      const values = xValues.map((xValue) => {
        const matchingRows = filteredRows.filter((row) => (
          sameValue(row?.[binding.x.field], xValue)
          && group.values.every((value, index) => sameValue(row?.[seriesFields[index]], value))
        ));
        return aggregateMeasure(matchingRows, measure.field, binding.aggregation, binding.missingValue);
      });
      preparedSeries.push({
        id: `${measure.field}::${group.id}`,
        name,
        measureField: measure.field,
        groupValues: Object.fromEntries(seriesFields.map((field, index) => [field, group.values[index]])),
        type: measure.type,
        color: measure.color,
        opacity: measure.opacity,
        yAxisIndex: measure.yAxisIndex,
        lineWidth: measure.lineWidth,
        lineStyle: measure.lineStyle,
        markerStyle: measure.markerStyle,
        markerSize: measure.markerSize,
        smooth: measure.smooth,
        stack: measure.stack,
        values,
      });
    }
  }

  if (preparedSeries.length > 30) {
    diagnostics.push({
      severity: "warning",
      code: "high-series-count",
      message: `${preparedSeries.length} series will be drawn. Filter categories or use fewer cluster fields for a more readable chart.`,
    });
  }
  if (filteredRows.length === 0) {
    diagnostics.push({ severity: "error", code: "no-filtered-rows", message: "The selected filters leave no observations to plot." });
  }

  return {
    binding,
    profile,
    diagnostics,
    rowsBefore: safeRows.length,
    rowsAfter: filteredRows.length,
    xType,
    xValues,
    series: preparedSeries,
  };
}

export function applyDataFilters(rows, filters) {
  return (filters ?? []).reduce((currentRows, filter) => {
    if (!filter?.field || filter.enabled === false) {
      return currentRows;
    }
    if (filter.operator === "range") {
      return currentRows.filter((row) => valueInRange(row?.[filter.field], filter.min, filter.max));
    }
    if (filter.operator === "notIn") {
      const blocked = new Set((filter.values ?? []).map(normalizeValue));
      return currentRows.filter((row) => !blocked.has(normalizeValue(row?.[filter.field])));
    }
    const allowed = new Set((filter.values ?? []).map(normalizeValue));
    return currentRows.filter((row) => allowed.has(normalizeValue(row?.[filter.field])));
  }, rows);
}

export function bindingDiagnostics(panel, rows = []) {
  return prepareAxisChartData(panel, rows).diagnostics;
}

function validateBinding(binding, profile) {
  const diagnostics = [];
  const columns = new Set(profile.columns.map((column) => column.name));
  if (!binding) {
    return [{ severity: "error", code: "missing-binding", message: "This chart has no data binding." }];
  }
  if (!binding.x?.field || !columns.has(binding.x.field)) {
    diagnostics.push({ severity: "error", code: "missing-x", message: `X-axis field "${binding.x?.field ?? ""}" is not present in the CSV.` });
  }
  if (!Array.isArray(binding.measures) || binding.measures.length === 0) {
    diagnostics.push({ severity: "error", code: "missing-measure", message: "Choose at least one numeric measurement." });
  }
  for (const measure of binding.measures ?? []) {
    if (!columns.has(measure.field)) {
      diagnostics.push({ severity: "error", code: "missing-measure-field", message: `Measurement field "${measure.field}" is not present in the CSV.` });
      continue;
    }
    const column = profile.columns.find((item) => item.name === measure.field);
    if (column?.type !== "number") {
      diagnostics.push({ severity: "warning", code: "non-numeric-measure", message: `Measurement field "${measure.field}" contains non-numeric values; invalid values will be treated as gaps.` });
    }
  }
  const seriesFields = binding.series?.fields ?? [];
  for (const field of seriesFields) {
    if (!columns.has(field)) {
      diagnostics.push({ severity: "error", code: "missing-series-field", message: `Cluster field "${field}" is not present in the CSV.` });
    }
    if (field === binding.x?.field) {
      diagnostics.push({ severity: "error", code: "duplicate-dimension-role", message: `"${field}" cannot be both the x-axis and a cluster field.` });
    }
  }
  for (const filter of binding.filters ?? []) {
    if (filter.field && !columns.has(filter.field)) {
      diagnostics.push({ severity: "error", code: "missing-filter-field", message: `Filter field "${filter.field}" is not present in the CSV.` });
    }
  }
  return diagnostics;
}

function resolveXType(binding, profile, diagnostics) {
  const requestedType = binding?.x?.type === "temporal" ? "temporal" : "category";
  if (requestedType !== "temporal") return requestedType;
  const column = profile.columns.find((item) => item.name === binding.x?.field);
  if (column?.type === "temporal") return requestedType;
  diagnostics.push({
    severity: "warning",
    code: "temporal-axis-fallback",
    message: `X-axis field "${binding.x?.field ?? ""}" is not date/time data. It will be plotted as categories instead.`,
  });
  return "category";
}

function profileColumn(name, rows) {
  const values = rows
    .map((row) => row?.[name])
    .filter((value) => value !== undefined && value !== null && value !== "");
  const unique = uniqueValues(values);
  const numericCount = values.filter((value) => Number.isFinite(Number(value))).length;
  const temporalCount = values.filter((value) => looksTemporalValue(value, name)).length;
  const numericRatio = values.length > 0 ? numericCount / values.length : 0;
  const temporalRatio = values.length > 0 ? temporalCount / values.length : 0;
  let type = "text";
  if (numericRatio >= 0.9 && !IDENTIFIER_NAME_PATTERN.test(name)) {
    type = "number";
  } else if (temporalRatio >= 0.8) {
    type = "temporal";
  } else if (unique.length <= Math.max(50, Math.ceil(rows.length * 0.5))) {
    type = "category";
  }
  return {
    name,
    type,
    nonEmptyCount: values.length,
    uniqueCount: unique.length,
    examples: unique.slice(0, 5),
  };
}

function looksTemporalValue(value, name) {
  if (typeof value !== "string" && !DATE_NAME_PATTERN.test(name)) {
    return false;
  }
  const text = String(value);
  if (!DATE_NAME_PATTERN.test(name) && !/^\d{4}[-/]\d{1,2}[-/]\d{1,2}$/.test(text) && !/^\d{1,2}[-/]\d{1,2}[-/]\d{4}$/.test(text)) {
    return false;
  }
  return Number.isFinite(Date.parse(text));
}

function fingerprintRows(rows, columns) {
  let hash = 2166136261;
  const update = (text) => {
    for (let index = 0; index < text.length; index += 1) {
      hash ^= text.charCodeAt(index);
      hash = Math.imul(hash, 16777619);
    }
  };
  update(columns.join("\u001f"));
  for (const row of rows) {
    for (const column of columns) {
      update(`${normalizeValue(row?.[column])}\u001e`);
    }
  }
  return `${rows.length}:${(hash >>> 0).toString(16).padStart(8, "0")}`;
}

function uniqueMeasures(series) {
  const seen = new Set();
  return series.flatMap((item) => {
    if (!item?.y || seen.has(item.y)) {
      return [];
    }
    seen.add(item.y);
    return [{
      field: item.y,
      label: item.name || item.y,
      type: item.type,
      color: item.color,
      opacity: item.opacity,
      yAxisIndex: item.yAxisIndex,
      lineWidth: item.lineWidth,
      lineStyle: item.lineStyle,
      markerStyle: item.markerStyle,
      markerSize: item.markerSize,
      smooth: item.smooth,
      stack: item.stack,
    }];
  });
}

function deduplicateFilters(filters) {
  const byKey = new Map();
  for (const filter of filters) {
    byKey.set(`${filter.field}:${filter.operator}`, filter);
  }
  return [...byKey.values()];
}

function collectGroupKeys(rows, fields) {
  if (fields.length === 0) {
    return [];
  }
  const groups = new Map();
  for (const row of rows) {
    const values = fields.map((field) => row?.[field]);
    const id = values.map(normalizeValue).join("\u001f");
    if (!groups.has(id)) {
      groups.set(id, {
        id,
        values,
        label: values.map((value, index) => `${fields[index]}: ${value}`).join(" · "),
      });
    }
  }
  return [...groups.values()];
}

function seriesName(measure, group, measureCount, seriesFieldCount) {
  const measureLabel = measure.label || measure.field;
  if (seriesFieldCount === 0) {
    return measureLabel;
  }
  const groupLabel = group.values.map(String).join(" · ");
  return measureCount > 1 ? `${measureLabel} — ${groupLabel}` : groupLabel;
}

function aggregateMeasure(rows, field, method = "sum", missingValue = "gap") {
  const values = rows
    .map((row) => row?.[field])
    .filter((value) => value !== undefined && value !== null && value !== "")
    .map(Number)
    .filter(Number.isFinite);
  if (values.length === 0) {
    return missingValue === "zero" ? 0 : null;
  }
  if (method === "first") return values[0];
  if (method === "last") return values[values.length - 1];
  if (method === "mean") return values.reduce((sum, value) => sum + value, 0) / values.length;
  if (method === "min") return Math.min(...values);
  if (method === "max") return Math.max(...values);
  if (method === "count") return values.length;
  return values.reduce((sum, value) => sum + value, 0);
}

function orderXValues(values, type, order) {
  if (type === "temporal") {
    return [...values].sort((a, b) => compareDateish(a, b));
  }
  if (order === "alphabetical") {
    return [...values].sort((a, b) => String(a).localeCompare(String(b), undefined, { numeric: true }));
  }
  return values;
}

function valueInRange(value, min, max) {
  if (min === undefined || min === "" || max === undefined || max === "") {
    return true;
  }
  const valueTime = Date.parse(value);
  const minTime = Date.parse(min);
  const maxTime = Date.parse(max);
  if (Number.isFinite(valueTime) && Number.isFinite(minTime) && Number.isFinite(maxTime)) {
    return valueTime >= minTime && valueTime <= maxTime;
  }
  const numericValue = Number(value);
  const numericMin = Number(min);
  const numericMax = Number(max);
  if ([numericValue, numericMin, numericMax].every(Number.isFinite)) {
    return numericValue >= numericMin && numericValue <= numericMax;
  }
  return String(value) >= String(min) && String(value) <= String(max);
}

function compareDateish(left, right) {
  const leftTime = Date.parse(left);
  const rightTime = Date.parse(right);
  if (Number.isFinite(leftTime) && Number.isFinite(rightTime)) {
    return leftTime - rightTime;
  }
  return String(left).localeCompare(String(right), undefined, { numeric: true });
}

function emptyPreparedData(binding, profile, diagnostics, rowCount) {
  return {
    binding,
    profile,
    diagnostics,
    rowsBefore: rowCount,
    rowsAfter: 0,
    xType: binding?.x?.type === "temporal" ? "temporal" : "category",
    xValues: [],
    series: [],
  };
}

function uniqueValues(values) {
  const seen = new Map();
  for (const value of values) {
    if (value === undefined || value === null || value === "") continue;
    const key = normalizeValue(value);
    if (!seen.has(key)) seen.set(key, value);
  }
  return [...seen.values()];
}

function sameValue(left, right) {
  return normalizeValue(left) === normalizeValue(right);
}

function normalizeValue(value) {
  return String(value ?? "");
}
