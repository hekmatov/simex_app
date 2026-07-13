const AXIS_TYPES = new Set(["bar", "line", "area", "horizontalBar", "horizontalStackedBar", "groupedBar", "stackedBar", "mixed"]);
const GEO_TYPES = new Set(["mapScatter", "choroplethMap", "chronoChoroplethMap"]);

export function reconcileDashboardWithLoadedData(config, loadedData) {
  const nextConfig = structuredClone(config);
  const reports = [];

  for (const page of nextConfig.pages ?? []) {
    for (const section of page.sections ?? []) {
      for (const panel of section.panels ?? []) {
        const rows = loadedData?.[panel.dataSource];
        if (!Array.isArray(rows) || rows.length === 0) {
          continue;
        }

        const columns = collectColumns(rows);
        const previousColumns = Array.isArray(panel.sourceSchema?.columns) ? panel.sourceSchema.columns : null;
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
        const nextSignature = columns.join("|");
        const previousSignature = panel.sourceSchema?.signature;
        panel.sourceSchema = {
          columns,
          signature: nextSignature,
          checkedAt: new Date().toISOString(),
        };

        if (changes.length > 0 || (previousSignature && previousSignature !== nextSignature)) {
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
    ensureField(panel, "x", columns, preferredCategoryColumn(columns), changes, "x/category field");
    panel.series = (panel.series ?? []).map((series, index) => {
      const nextSeries = { ...series };
      ensureField(nextSeries, "y", columns, preferredValueColumn(columns, panel.x), changes, `${series.name ?? `Series ${index + 1}`} value field`);
      return nextSeries;
    });
    if (panel.seriesFrom) {
      ensureNestedField(panel.seriesFrom, "nameField", columns, preferredCategoryColumn(columns), changes, "long-format series name column");
      ensureNestedField(panel.seriesFrom, "valueField", columns, preferredValueColumn(columns, panel.seriesFrom.nameField), changes, "long-format series value column");
    }
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
