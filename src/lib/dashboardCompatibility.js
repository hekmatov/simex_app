const AXIS_TYPES = new Set(["bar", "line", "area", "horizontalBar", "horizontalStackedBar", "groupedBar", "stackedBar", "mixed"]);
const GEO_TYPES = new Set(["mapScatter", "choroplethMap", "chronoChoroplethMap"]);

import { legacyBindingForPanel, profileTabularData } from "./chartDataModel.js";

export function reconcileDashboardWithLoadedData(config, loadedData) {
  const nextConfig = structuredClone(config);
  const reports = [];
  const profileCache = new Map();

  for (const page of nextConfig.pages ?? []) {
    for (const section of page.sections ?? []) {
      for (const panel of section.panels ?? []) {
        const rows = loadedData?.[panel.dataSource];
        if (!Array.isArray(rows) || rows.length === 0) {
          continue;
        }

        let profile = profileCache.get(panel.dataSource);
        if (!profile) {
          profile = profileTabularData(rows);
          profileCache.set(panel.dataSource, profile);
        }
        const columns = profile.columns.map((column) => column.name);
        const previousColumns = Array.isArray(panel.sourceSchema?.columns)
          ? panel.sourceSchema.columns.map((column) => typeof column === "string" ? column : column?.name).filter(Boolean)
          : null;
        const changes = [];

        if (previousColumns) {
          const addedColumns = columns.filter((column) => !previousColumns.includes(column));
          const removedColumns = previousColumns.filter((column) => !columns.includes(column));
          if (addedColumns.length > 0) {
            changes.push(`New CSV columns detected: ${addedColumns.join(", ")}`);
          }
          if (removedColumns.length > 0) {
            changes.push(`CSV columns no longer present: ${removedColumns.join(", ")}`);
          }
        }

        applyPanelColumnFallbacks(panel, columns, changes);
        if (AXIS_TYPES.has(panel.type)) {
          repairDataBinding(panel, columns, profile, changes);
        }
        const nextSignature = columns.join("|");
        const previousSignature = panel.sourceSchema?.signature;
        const previousFingerprint = panel.sourceSchema?.dataFingerprint;
        const previousRowCount = panel.sourceSchema?.rowCount;
        const sourceContentChanged = Boolean(previousFingerprint && previousFingerprint !== profile.fingerprint);
        const sourceSchemaChanged = Boolean(previousSignature && previousSignature !== nextSignature);
        if (sourceContentChanged) {
          if (previousRowCount !== undefined && previousRowCount !== profile.rowCount) {
            changes.push(`CSV row count changed from ${previousRowCount} to ${profile.rowCount}; chart data was refreshed.`);
          } else {
            changes.push("CSV values changed; chart data was refreshed.");
          }
        }
        panel.sourceSchema = {
          version: 2,
          columns,
          columnProfiles: profile.columns,
          signature: nextSignature,
          rowCount: profile.rowCount,
          dataFingerprint: profile.fingerprint,
          checkedAt: new Date().toISOString(),
        };

        if (sourceContentChanged || sourceSchemaChanged) {
          reports.push({
            panelId: panel.id,
            title: panel.title ?? panel.id,
            page: page.label ?? page.title ?? page.id,
            section: section.title ?? section.id,
            dataSource: panel.dataSource,
            changes,
          });
        }
      }
    }
  }

  return {
    config: nextConfig,
    reports,
    changed: reports.length > 0,
  };
}

function applyPanelColumnFallbacks(panel, columns, changes) {
  if (AXIS_TYPES.has(panel.type)) {
    return;
  }

  if (panel.type === "gauge") {
    ensureField(panel, "valueField", columns, preferredValueColumn(columns), changes, "gauge value field");
    if (panel.labelField && !columns.includes(panel.labelField)) {
      changes.push(`Cleared missing gauge label field "${panel.labelField}".`);
      panel.labelField = undefined;
    }
  }

  if (panel.type === "mapScatter") {
    ensureField(panel, "nameField", columns, preferredColumn(columns, ["name", "province", "region"]), changes, "map label/name field");
    ensureField(panel, "latField", columns, preferredColumn(columns, ["lat", "latitude"]), changes, "latitude field");
    ensureField(panel, "lonField", columns, preferredColumn(columns, ["lon", "lng", "longitude"]), changes, "longitude field");
    ensureField(panel, "valueField", columns, preferredValueColumn(columns), changes, "map value field");
  }

  if (GEO_TYPES.has(panel.type)) {
    ensureField(panel, "joinField", columns, preferredColumn(columns, ["code", "municipality", "gemeente", "id"]), changes, "CSV join field");
    ensureField(panel, "valueField", columns, preferredValueColumn(columns, panel.joinField), changes, "choropleth value field");
    if (panel.labelField && !columns.includes(panel.labelField)) {
      const fallback = preferredCategoryColumn(columns);
      changes.push(`Updated missing label field "${panel.labelField}" to "${fallback}".`);
      panel.labelField = fallback;
    }
  }

  if (panel.type === "deltaList" && panel.fields) {
    for (const [fieldKey, label] of Object.entries({ title: "delta title field", value: "delta value field", detail: "delta detail field" })) {
      if (panel.fields[fieldKey] && !columns.includes(panel.fields[fieldKey])) {
        const fallback = fieldKey === "value" ? preferredValueColumn(columns) : preferredCategoryColumn(columns);
        changes.push(`Updated missing ${label} "${panel.fields[fieldKey]}" to "${fallback}".`);
        panel.fields[fieldKey] = fallback;
      }
    }
  }
}

function repairDataBinding(panel, columns, profile, changes) {
  panel.dataBinding = panel.dataBinding ?? legacyBindingForPanel(panel);
  const binding = panel.dataBinding;
  if (!binding) return;

  repairBindingField(binding.x, "field", columns, changes, "x-axis field");
  const xProfile = profile.columns.find((column) => column.name === binding.x?.field);
  if (binding.x?.type === "temporal" && xProfile?.type !== "temporal") {
    changes.push(`Changed x-axis interpretation for "${binding.x.field}" from date/time to category because the CSV values are not dates.`);
    binding.x.type = "category";
  }
  for (const measure of binding.measures ?? []) {
    repairBindingField(measure, "field", columns, changes, "measurement field");
  }
  binding.series = binding.series ?? { fields: [] };
  binding.series.fields = (binding.series.fields ?? []).map((field) => repairFieldName(field, columns, changes, "cluster field"));
  for (const filter of binding.filters ?? []) {
    filter.field = repairFieldName(filter.field, columns, changes, "filter field");
  }
}

function repairBindingField(target, key, columns, changes, label) {
  if (!target) return;
  target[key] = repairFieldName(target[key], columns, changes, label);
}

function repairFieldName(field, columns, changes, label) {
  if (!field || columns.includes(field)) return field;
  const normalized = normalizeColumnName(field);
  const matches = columns.filter((column) => normalizeColumnName(column) === normalized);
  if (matches.length === 1) {
    changes.push(`Updated renamed ${label} "${field}" to "${matches[0]}".`);
    return matches[0];
  }
  changes.push(`Missing ${label} "${field}" requires review; no unsafe replacement was applied.`);
  return field;
}

function normalizeColumnName(value) {
  return String(value ?? "").toLowerCase().replace(/[^a-z0-9]+/g, "");
}

function ensureField(target, fieldName, columns, fallback, changes, label) {
  if (target[fieldName] && columns.includes(target[fieldName])) {
    return;
  }
  const nextValue = fallback ?? columns[0] ?? "";
  const previousValue = target[fieldName];
  changes.push(previousValue
    ? `Updated missing ${label} "${previousValue}" to "${nextValue}".`
    : `Set missing ${label} to "${nextValue}".`);
  target[fieldName] = nextValue;
}

function ensureNestedField(target, fieldName, columns, fallback, changes, label) {
  ensureField(target, fieldName, columns, fallback, changes, label);
}

function collectColumns(rows) {
  return [...new Set((rows ?? []).flatMap((row) => Object.keys(row ?? {})))];
}

function preferredColumn(columns, clues) {
  const normalizedClues = clues.map((clue) => clue.toLowerCase());
  return columns.find((column) => normalizedClues.some((clue) => String(column).toLowerCase().includes(clue))) ?? columns[0] ?? "";
}

function preferredCategoryColumn(columns) {
  return columns.find((column) => !looksNumericName(column) && !looksDateName(column)) ?? columns[0] ?? "";
}

function preferredValueColumn(columns, exclude) {
  return columns.find((column) => column !== exclude && looksNumericName(column) && !looksDateName(column))
    ?? columns.find((column) => column !== exclude && !looksDateName(column))
    ?? columns[0]
    ?? "";
}

function looksDateName(column) {
  return /date|datum|time|snapshot/i.test(String(column ?? ""));
}

function looksNumericName(column) {
  return /value|count|case|death|rate|total|number|score|percent|occupancy|admission|infection|deaths/i.test(String(column ?? ""));
}
