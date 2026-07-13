import * as echarts from "echarts";

const DEFAULT_TEXT_COLOR = "#08224A";
const DEFAULT_GRID = {
  left: 58,
  right: 36,
  top: 100,
  bottom: 58,
};
const COLOR_SCHEMES = {
  manual: ["#043BCB", "#00A676", "#4496D1", "#2456A6", "#007C89", "#08224A", "#7FDEC1", "#8F1D2C"],
  pdpc: ["#043BCB", "#00A676", "#4496D1", "#2456A6", "#007C89", "#08224A", "#7FDEC1", "#8F1D2C"],
  redGreen5: ["#8F1D2C", "#E16B5A", "#F3D37A", "#7FDEC1", "#00A676"],
  likertInfographic5: ["#43A047", "#AEBB2E", "#F6A21A", "#F47C20", "#D71920"],
  caseIntensity: ["#FFF3E8", "#F3D37A", "#E16B5A", "#D71920", "#8F1D2C"],
  blueYellow5: ["#08224A", "#043BCB", "#4496D1", "#F3D37A", "#C98700"],
  cool: ["#08224A", "#2456A6", "#4496D1", "#007C89", "#7FDEC1"],
  warm: ["#8F1D2C", "#C98700", "#F3D37A", "#E16B5A", "#08224A"],
};
const choroplethGeoCache = new WeakMap();
const provinceOverlayCache = new WeakMap();
const provinceOverlayGeometryCache = new WeakMap();
const registeredMaps = new Map();

export function buildEchartsOption(panel, data, geoData, renderContext = {}) {
  const scale = renderContext.scale ?? 1;
  const compact = Boolean(renderContext.compact);
  if (panel.type === "gauge") {
    return buildGaugeOption(panel, data, scale);
  }

  if (panel.type === "mapScatter") {
    return buildMapOption(panel, data, geoData, scale);
  }

  if (panel.type === "choroplethMap" || panel.type === "chronoChoroplethMap") {
    return buildChoroplethMapOption(panel, data, geoData, scale, renderContext);
  }

  const isHorizontal = panel.type === "horizontalBar" || panel.type === "horizontalStackedBar";
  const xAxisIsDate = panel.xAxisMode === "date" || isDateLikeField(panel.x);
  const useDateAxis = xAxisIsDate && !isHorizontal;
  const filteredData = applyCategorySelection(data, panel);
  const sortedData = sortRowsForAxis(filteredData, panel.x, useDateAxis);
  const labels = orderedCategoryLabels(sortedData, panel, useDateAxis);
  const colors = panelColors(panel);
  const series = orderSeriesForPanel(panel, buildSeries(panel, sortedData, labels, colors, useDateAxis, scale));
  const hasSecondAxis = series.some((item) => item.yAxisIndex === 1);

  const valueAxis = {
    type: "value",
    name: panel.yAxisTitle ?? "",
    min: numericOrUndefined(panel.yMin) ?? (panel.yScale === "auto" ? undefined : 0),
    max: numericOrUndefined(panel.yMax),
    axisLabel: { color: DEFAULT_TEXT_COLOR, fontSize: fontSize(panel, "axis", 12, scale), formatter: axisLabelFormatter(panel) },
    nameTextStyle: { color: DEFAULT_TEXT_COLOR, fontSize: fontSize(panel, "axis", 12, scale) },
    splitLine: { show: panel.showGrid ?? true, lineStyle: { color: "rgba(8, 34, 74, 0.08)" } },
  };
  const categoryAxis = {
    type: useDateAxis ? "time" : "category",
    name: panel.xAxisTitle ?? "",
    data: useDateAxis ? undefined : isHorizontal ? [...labels].reverse() : labels,
    axisLabel: {
      color: DEFAULT_TEXT_COLOR,
      fontSize: compact ? Math.min(fontSize(panel, "axis", 12, scale), 12) : fontSize(panel, "axis", 12, scale),
      interval: useDateAxis || compact ? undefined : 0,
      rotate: useDateAxis ? undefined : panel.axisLabelRotation ?? 0,
      hideOverlap: compact ? true : useDateAxis ? undefined : false,
    },
    axisTick: { alignWithLabel: true },
  };

  return {
    color: colors,
    backgroundColor: panel.chartAreaColor ?? "transparent",
    animation: panel.chartAnimation ?? true,
    animationDurationUpdate: scaled(220, scale),
    animationEasingUpdate: "cubicOut",
    title: chartTitle(panel, scale),
    tooltip: {
      trigger: panel.tooltipTrigger ?? "axis",
      valueFormatter: formatTooltipValue,
    },
    legend: legendConfig(panel, series, scale),
    grid: scaledGrid(panel, scale, renderContext),
    xAxis: isHorizontal ? valueAxis : categoryAxis,
    yAxis: isHorizontal
      ? categoryAxis
      : hasSecondAxis
        ? [valueAxis, { ...valueAxis, name: panel.secondaryAxisTitle ?? "", min: numericOrUndefined(panel.secondaryAxisMin), max: numericOrUndefined(panel.secondaryAxisMax), splitLine: { show: false } }]
        : valueAxis,
    series: series.map((item, index) => ({
      ...item,
      data: isHorizontal ? [...item.data].reverse() : item.data,
      z: item.type === "line" ? 10 : 2,
      markLine: shouldAttachReferenceLine(series, item, index)
        ? referenceLineConfig(panel.referenceLines, item.yAxisIndex ?? 0)
        : undefined,
    })),
  };
}

function shouldAttachReferenceLine(series, item, index) {
  const axisIndex = Number(item.yAxisIndex ?? 0);
  return series.findIndex((candidate) => Number(candidate.yAxisIndex ?? 0) === axisIndex) === index;
}

function buildSeries(panel, data, labels, colors, useDateAxis, scale) {
  if (panel.seriesFrom) {
    return buildSeriesFromLongData(panel, data, labels, colors, useDateAxis, scale);
  }

  return (panel.series ?? []).map((item, index) => {
    const color = seriesColor(panel, item, colors, index);
    const resolvedType = seriesType(panel.type, item.type);
    const symbol = symbolForSeries(panel, item);
    return {
      name: item.name,
      type: resolvedType,
      yAxisIndex: item.yAxisIndex,
      data: useDateAxis
        ? data.map((row) => [row[panel.x], toNumber(row?.[item.y])])
        : labels.map((label) => {
            const row = data.find((candidate) => candidate[panel.x] === label);
            return toNumber(row?.[item.y]);
          }),
      itemStyle: { color, opacity: item.opacity ?? 1 },
      lineStyle: resolvedType === "line" ? lineStyleForSeries(item, color, scale) : undefined,
      barWidth: resolvedType === "bar" ? panel.barWidth || undefined : undefined,
      barGap: resolvedType === "bar" ? panel.barGap || undefined : undefined,
      barCategoryGap: resolvedType === "bar" ? panel.barCategoryGap || undefined : undefined,
      label: resolvedType === "bar" && panel.showValueLabels ? { show: true, position: panel.valueLabelPosition ?? "top", color: DEFAULT_TEXT_COLOR, fontSize: scaled(panel.valueLabelFontSize ?? 11, scale) } : undefined,
      symbol,
      symbolSize: symbol && symbol !== "none" ? scaled(item.markerSize ?? 6, scale) : undefined,
      showSymbol: resolvedType === "line" ? symbol !== "none" : undefined,
      areaStyle: areaStyleForSeries(panel, item, color),
      smooth: item.smooth ?? false,
      stack: item.stack || (isStackedPanel(panel.type) ? "total" : undefined),
    };
  });
}

function buildSeriesFromLongData(panel, data, labels, colors, useDateAxis, scale) {
  const nameField = panel.seriesFrom.nameField;
  const valueField = panel.seriesFrom.valueField;
  const names = uniqueValues(data.map((row) => row[nameField]));

  return names.map((name, index) => ({
    name,
    type: panel.type === "line" || panel.type === "area" ? "line" : "bar",
    data: useDateAxis
      ? data
          .filter((row) => String(row[nameField]) === String(name))
          .map((row) => [row[panel.x], toNumber(row[valueField])])
      : labels.map((label) =>
          data
            .filter((row) => row[panel.x] === label && String(row[nameField]) === String(name))
            .reduce((sum, row) => sum + toNumber(row[valueField]), 0),
        ),
    itemStyle: { color: colors[index % colors.length], opacity: panel.seriesFrom?.opacity ?? 1 },
    barWidth: panel.barWidth || undefined,
    barGap: panel.barGap || undefined,
    barCategoryGap: panel.barCategoryGap || undefined,
    label: panel.showValueLabels ? { show: true, position: panel.valueLabelPosition ?? "top", color: DEFAULT_TEXT_COLOR, fontSize: scaled(panel.valueLabelFontSize ?? 11, scale) } : undefined,
    lineStyle: lineStyleForSeries({}, colors[index % colors.length], scale),
    symbol: panel.type === "line" || panel.type === "area" ? "none" : undefined,
    symbolSize: undefined,
    showSymbol: false,
    areaStyle: panel.type === "area" ? { opacity: 0.18 } : undefined,
    stack: panel.seriesFrom?.stack || (isStackedPanel(panel.type) ? "total" : undefined),
  }));
}

function buildGaugeOption(panel, data, scale) {
  const row = data[0] ?? {};
  const value = Math.round(toNumber(row[panel.valueField]));
  const max = panel.max ?? 100;
  const label = panel.labelField ? row[panel.labelField] ?? "" : "";
  const unit = panel.unit ?? "%";

  return {
    title: chartTitle(panel, scale),
    series: [
      {
        type: "gauge",
        min: 0,
        max,
        axisLine: {
          lineStyle: {
            width: scaled(panel.gaugeArcWidth ?? 30, scale),
            color: gaugeStageSegments(panel),
          },
        },
        pointer: {
          itemStyle: {
            color: "auto",
          },
        },
        axisTick: {
          distance: scaled(-30, scale),
          length: scaled(8, scale),
          lineStyle: {
            color: "#fff",
            width: scaled(2, scale),
          },
        },
        splitLine: {
          distance: scaled(-30, scale),
          length: scaled(30, scale),
          lineStyle: {
            color: "#fff",
            width: scaled(4, scale),
          },
        },
        axisLabel: {
          color: "inherit",
          distance: scaled(40, scale),
          fontSize: fontSize(panel, "gaugeAxis", 20, scale),
        },
        detail: {
          valueAnimation: true,
          formatter: unit ? `{value}${unit}` : "{value}",
          color: "inherit",
          fontSize: fontSize(panel, "gaugeValue", 24, scale),
        },
        title: {
          show: Boolean(label),
          color: "inherit",
          fontSize: fontSize(panel, "gaugeLabel", 13, scale),
          fontWeight: 700,
          offsetCenter: [0, "52%"],
        },
        data: [{ value, name: label }],
      },
    ],
  };
}

function gaugeStageSegments(panel) {
  return [
    [Number(panel.gaugeLowStop ?? 0.3), panel.gaugeLowColor ?? "#67e0e3"],
    [Number(panel.gaugeMidStop ?? 0.7), panel.gaugeMidColor ?? "#37a2da"],
    [1, panel.gaugeHighColor ?? panel.redZone?.color ?? "#fd666d"],
  ];
}

function gaugeAxisSegments(panel, maxValue) {
  if (!panel.redZone?.enabled) {
    return [[1, panel.gaugeNormalColor ?? "#7FDEC1"]];
  }
  const max = Math.max(Number(maxValue) || 100, 1);
  const lower = clampNumber(Number(panel.redZone.lower ?? 75) / max, 0, 1);
  const upper = clampNumber(Number(panel.redZone.upper ?? max) / max, lower, 1);
  const color = panel.redZone.color ?? "#D71920";
  const track = panel.gaugeNormalColor ?? "#7FDEC1";
  if (lower <= 0 && upper >= 1) {
    return [[1, color]];
  }
  if (upper >= 1) {
    return [[lower, track], [1, color]];
  }
  return [[lower, track], [upper, color], [1, track]];
}

function clampNumber(value, min, max) {
  if (!Number.isFinite(value)) {
    return min;
  }
  return Math.min(Math.max(value, min), max);
}
function buildMapOption(panel, data, geoData, scale) {
  const mapName = panel.mapName ?? "dashboard-map";
  if (geoData) {
    echarts.registerMap(mapName, normalizeGeoJson(geoData));
  }
  const colors = panelColors(panel);
  const values = data.map((row) => toNumber(row[panel.valueField]));
  const maxValue = Math.max(...values, 1);
  const pointScale = panel.pointScale ?? 1;

  return {
    title: chartTitle(panel, scale),
    tooltip: {
      trigger: "item",
      formatter: (params) => {
        if (Array.isArray(params.value)) {
          return `${params.name}<br/>${formatTooltipValue(params.value[2])}`;
        }
        return params.name;
      },
    },
    geo: {
      map: mapName,
      roam: true,
      layoutCenter: ["50%", "56%"],
      layoutSize: "92%",
      itemStyle: {
        color: "#EEF5F9",
        borderColor: "#6F8DA3",
        borderWidth: scaled(1.2, scale),
      },
      emphasis: {
        label: { show: true, color: DEFAULT_TEXT_COLOR, fontSize: fontSize(panel, "mapLabel", 12, scale) },
        itemStyle: { color: "#D5E6F5", borderColor: "#2456A6" },
      },
    },
    visualMap: {
      min: 0,
      max: maxValue,
      left: 0,
      bottom: scaled(22, scale),
      text: ["High", "Low"],
      calculable: true,
      textStyle: { color: DEFAULT_TEXT_COLOR, fontSize: fontSize(panel, "legend", 12, scale) },
      inRange: { color: [colors[0], colors[colors.length - 1]] },
    },
    series: [
      {
        name: panel.title,
        type: "scatter",
        coordinateSystem: "geo",
        symbolSize: (value) => (10 + (toNumber(value[2]) / maxValue) * 34) * pointScale * scale,
        itemStyle: {
          color: (params) => caseMapColor(toNumber(params.value?.[2]), maxValue),
          opacity: 0.72,
          borderColor: "#F8FBFF",
          borderWidth: scaled(2, scale),
        },
        data: data.map((row) => ({
          name: row[panel.nameField],
          value: [
            toNumber(row[panel.lonField]),
            toNumber(row[panel.latField]),
            toNumber(row[panel.valueField]),
          ],
        })),
      },
    ],
  };
}

function caseMapColor(value, maxValue) {
  const intensity = maxValue ? value / maxValue : 0;
  if (intensity >= 0.7) {
    return "#043BCB";
  }
  if (intensity >= 0.4) {
    return "#2456A6";
  }
  return "#007C89";
}

function buildChoroplethMapOption(panel, data, geoData, scale, renderContext = {}) {
  const mapName = panel.mapName ?? panel.id ?? "choropleth-map";
  const geoNameProperty = panel.geoNameProperty ?? "statcode";
  const geoLabelProperty = panel.geoLabelProperty ?? "statnaam";
  const valueField = panel.valueField ?? "AantalCumulatief";
  const labelField = panel.labelField ?? "Gemeentenaam";
  const features = normalizeChoroplethGeoJson(geoData, geoNameProperty, geoLabelProperty);
  registerMapOnce(mapName, features);

  const colors = panelColors(panel);
  const mapRows = choroplethRows(panel, data, valueField);
  const values = mapRows.map((row) => row.value).filter((value) => Number.isFinite(value));
  const minValue = numericOrUndefined(panel.visualMin) ?? Math.min(...values, 0);
  const maxValue = numericOrUndefined(panel.visualMax) ?? Math.max(...values, 1);
  const provinceOverlaySource = panel.provinceOverlaySource ?? "geo_netherlands_provinces";
  const provinceOverlayGeoData = panel.showProvinceOverlay
    ? renderContext.loadedData?.[provinceOverlaySource]
    : null;
  const provinceOverlayFeatures = normalizeProvinceOverlayGeoJson(
    provinceOverlayGeoData,
    panel.provinceOverlayNameProperty ?? "statnaam",
  );
  const transitionMs = 260;
  const mapLayoutCenter = panel.mapLayoutCenter ?? ["50%", "55%"];
  const mapLayoutSize = panel.mapLayoutSize ?? "82%";
  const provinceOverlayGeometry = provinceOverlayFeatures ? cachedProvinceOverlayGeometry(provinceOverlayFeatures) : { lines: [], labels: [] };

  return {
    color: colors,
    backgroundColor: panel.chartAreaColor ?? "transparent",
    animation: true,
    animationDurationUpdate: transitionMs,
    animationEasingUpdate: "cubicOut",
    title: chartTitle(panel, scale),
    tooltip: {
      trigger: "item",
      formatter: (params) => {
        const row = params.data;
        if (!row) {
          return `${params.name}<br/>No data`;
        }
        return [
          row.displayName ?? params.name,
          `${valueField}: ${formatTooltipValue(row.value)}`,
          row.date ? `Date: ${row.date}` : "",
          row.dataMethod ? `Data: ${row.dataMethod}` : "",
          row.populationSource ? `Population: ${row.populationSource}` : "",
        ].filter(Boolean).join("<br/>");
      },
    },
    visualMap: {
      min: minValue,
      max: maxValue,
      seriesIndex: 0,
      left: scaled(18, scale),
      bottom: scaled(22, scale),
      text: [panel.highLabel ?? "High", panel.lowLabel ?? "Low"],
      calculable: true,
      textStyle: { color: DEFAULT_TEXT_COLOR, fontSize: fontSize(panel, "legend", 12, scale) },
      inRange: { color: colors },
      outOfRange: { color: "#DDE7EF" },
    },
    geo: {
      map: mapName,
      roam: panel.roam ?? true,
      nameProperty: "name",
      layoutCenter: mapLayoutCenter,
      layoutSize: mapLayoutSize,
      ...(panel.mapAspectScale ? { aspectScale: Number(panel.mapAspectScale) } : {}),
      itemStyle: {
        areaColor: panel.missingColor ?? "#DDE7EF",
        borderColor: panel.mapBorderColor ?? "#F8FBFF",
        borderWidth: scaled(panel.mapBorderWidth ?? 0.8, scale),
      },
      emphasis: {
        label: {
          show: true,
          color: DEFAULT_TEXT_COLOR,
          fontSize: fontSize(panel, "mapLabel", 12, scale),
          formatter: (params) => params.data?.displayName ?? params.name,
        },
        itemStyle: {
          areaColor: panel.mapEmphasisColor ?? "#F3D37A",
          borderColor: "#08224A",
          borderWidth: scaled(1.2, scale),
        },
      },
    },
    series: [
      {
        id: `${panel.id ?? mapName}-choropleth`,
        name: panel.title,
        type: "map",
        geoIndex: 0,
        nameProperty: "name",
        animation: true,
        animationDurationUpdate: transitionMs,
        animationEasingUpdate: "cubicOut",
        data: mapRows,
      },
      ...provinceOverlaySeries(panel, provinceOverlayGeometry.lines, provinceOverlayGeometry.labels, scale),
    ],
  };
}

function normalizeChoroplethGeoJson(geoData, codeProperty, labelProperty) {
  if (!geoData?.features) {
    return geoData;
  }
  const cacheKey = `${codeProperty}|${labelProperty}`;
  const cached = choroplethGeoCache.get(geoData);
  if (cached?.key === cacheKey) {
    return cached.value;
  }
  const normalized = {
    ...geoData,
    features: geoData.features.map((feature) => {
      const code = feature.properties?.[codeProperty] ?? feature.properties?.statcode ?? feature.properties?.name;
      const label = feature.properties?.[labelProperty] ?? feature.properties?.statnaam ?? code;
      return {
        ...feature,
        properties: {
          ...feature.properties,
          name: String(code),
          label: String(label),
        },
      };
    }),
  };
  choroplethGeoCache.set(geoData, { key: cacheKey, value: normalized });
  return normalized;
}

function normalizeProvinceOverlayGeoJson(geoData, labelProperty) {
  if (!geoData?.features) {
    return null;
  }
  const cacheKey = labelProperty;
  const cached = provinceOverlayCache.get(geoData);
  if (cached?.key === cacheKey) {
    return cached.value;
  }
  const normalized = {
    ...geoData,
    features: geoData.features.map((feature) => {
      const label = feature.properties?.[labelProperty] ?? feature.properties?.statnaam ?? feature.properties?.name ?? "";
      return {
        ...feature,
        properties: {
          ...feature.properties,
          name: String(label),
        },
      };
    }),
  };
  provinceOverlayCache.set(geoData, { key: cacheKey, value: normalized });
  return normalized;
}

function registerMapOnce(mapName, geoData) {
  if (!geoData) {
    return;
  }
  if (registeredMaps.get(mapName) === geoData) {
    return;
  }
  echarts.registerMap(mapName, geoData);
  registeredMaps.set(mapName, geoData);
}

function provinceOverlaySeries(panel, lines, labels, scale) {
  if (!lines.length && !labels.length) {
    return [];
  }
  return [
    {
      name: "Province borders",
      type: "lines",
      coordinateSystem: "geo",
      polyline: true,
      silent: true,
      animation: false,
      z: 20,
      lineStyle: {
        color: panel.provinceBorderColor ?? "#08224A",
        width: scaled(panel.provinceBorderWidth ?? 1.4, scale),
        opacity: 0.95,
      },
      data: lines.map((coords) => ({ coords })),
    },
    {
      name: "Province names",
      type: "scatter",
      coordinateSystem: "geo",
      silent: true,
      animation: false,
      symbolSize: 0,
      z: 21,
      label: {
        show: panel.showProvinceNames ?? true,
        formatter: (params) => params.name,
        color: panel.provinceNameColor ?? "#08224A",
        fontSize: scaled(panel.provinceNameFontSize ?? 12, scale),
        fontWeight: 800,
        textBorderColor: "rgba(255,255,255,0.82)",
        textBorderWidth: 3,
      },
      data: labels.map((item) => ({
        name: item.name,
        value: item.value,
      })),
    },
  ];
}

function provinceBoundaryLines(geoData) {
  return (geoData.features ?? []).flatMap((feature) => geometryRings(feature.geometry));
}

function cachedProvinceOverlayGeometry(geoData) {
  const cached = provinceOverlayGeometryCache.get(geoData);
  if (cached) {
    return cached;
  }
  const geometry = {
    lines: provinceBoundaryLines(geoData),
    labels: provinceLabelPoints(geoData),
  };
  provinceOverlayGeometryCache.set(geoData, geometry);
  return geometry;
}

function provinceLabelPoints(geoData) {
  return (geoData.features ?? []).map((feature) => {
    const rings = geometryRings(feature.geometry);
    const coordinates = rings.flat();
    return {
      name: feature.properties?.name ?? "",
      value: centroidOfCoordinates(coordinates),
    };
  }).filter((item) => Number.isFinite(item.value?.[0]) && Number.isFinite(item.value?.[1]));
}

function geometryRings(geometry) {
  if (!geometry) {
    return [];
  }
  if (geometry.type === "Polygon") {
    return (geometry.coordinates ?? []).filter((ring) => ring.length > 1);
  }
  if (geometry.type === "MultiPolygon") {
    return (geometry.coordinates ?? []).flatMap((polygon) => (polygon ?? []).filter((ring) => ring.length > 1));
  }
  return [];
}

function centroidOfCoordinates(coordinates) {
  if (!coordinates.length) {
    return [NaN, NaN];
  }
  const bounds = coordinates.reduce((current, coordinate) => ({
    minLon: Math.min(current.minLon, coordinate[0]),
    maxLon: Math.max(current.maxLon, coordinate[0]),
    minLat: Math.min(current.minLat, coordinate[1]),
    maxLat: Math.max(current.maxLat, coordinate[1]),
  }), {
    minLon: Infinity,
    maxLon: -Infinity,
    minLat: Infinity,
    maxLat: -Infinity,
  });
  return [
    (bounds.minLon + bounds.maxLon) / 2,
    (bounds.minLat + bounds.maxLat) / 2,
  ];
}

function choroplethRows(panel, data, valueField) {
  const joinField = panel.joinField ?? "MunicipalityCode";
  const dateField = panel.dateSelection?.column ?? panel.dateField ?? "Datum";
  const grouped = new Map();
  for (const row of data ?? []) {
    const code = normalizeJoinCode(row[joinField], panel);
    if (!code) {
      continue;
    }
    const value = toNumber(row[valueField]);
    const date = row[dateField];
    const current = grouped.get(code);
    if (!current || compareDateishValues(date, current.date) >= 0) {
      grouped.set(code, {
        name: code,
        value,
        displayName: row[panel.labelField ?? "Gemeentenaam"] ?? code,
        date,
        dataMethod: row.dataMethod,
        populationSource: row.populationSource,
      });
    }
  }
  return [...grouped.values()];
}

function normalizeJoinCode(value, panel) {
  const text = String(value ?? "").trim();
  if (!text) {
    return "";
  }
  if (/^[A-Za-z]{2}\d+/.test(text)) {
    return text.toUpperCase();
  }
  const numeric = Number(text);
  if (!Number.isFinite(numeric) || numeric < 0) {
    return "";
  }
  const prefix = panel.joinPrefix ?? "GM";
  const padLength = Number(panel.joinPadLength ?? 4);
  return `${prefix}${String(Math.trunc(numeric)).padStart(padLength, "0")}`;
}

function normalizeGeoJson(geoData) {
  if (!geoData?.features) {
    return geoData;
  }

  return {
    ...geoData,
    features: geoData.features.map((feature) => ({
      ...feature,
      properties: {
        ...feature.properties,
        name: feature.properties?.name ?? feature.properties?.statnaam,
      },
    })),
  };
}

function chartTitle(panel, scale = 1) {
  return {
    text: panel.title,
    left: scaled(12, scale),
    top: scaled(12, scale),
    textStyle: {
      color: DEFAULT_TEXT_COLOR,
      fontSize: fontSize(panel, "title", 17, scale),
      fontWeight: 700,
    },
  };
}

function seriesType(panelType, itemType) {
  if (itemType) {
    return itemType;
  }
  if (["bar", "groupedBar", "stackedBar", "horizontalBar", "horizontalStackedBar"].includes(panelType)) {
    return "bar";
  }
  if (panelType === "area") {
    return "line";
  }
  return panelType === "mixed" ? "line" : panelType;
}

function isStackedPanel(panelType) {
  return panelType === "stackedBar" || panelType === "horizontalStackedBar";
}

function orderedCategoryLabels(data, panel, useDateAxis) {
  const labels = uniqueValues(data.map((row) => row[panel.x]));
  if (useDateAxis || panel.categoryOrder === "csv" || !panel.categoryOrder) {
    return labels;
  }
  if (panel.categoryOrder === "alphabetical") {
    return [...labels].sort((a, b) => String(a).localeCompare(String(b), undefined, { numeric: true }));
  }
  if (panel.categoryOrder === "valueColumn" && panel.categorySortColumn) {
    const direction = panel.categorySortDirection === "asc" ? 1 : -1;
    return [...labels].sort((a, b) => {
      const aValue = categorySortValue(data, panel.x, a, panel.categorySortColumn);
      const bValue = categorySortValue(data, panel.x, b, panel.categorySortColumn);
      if (aValue !== bValue) {
        return (aValue - bValue) * direction;
      }
      return String(a).localeCompare(String(b), undefined, { numeric: true });
    });
  }
  return labels;
}

function categorySortValue(data, categoryField, categoryValue, valueField) {
  return data
    .filter((row) => String(row[categoryField]) === String(categoryValue))
    .reduce((sum, row) => sum + toNumber(row[valueField]), 0);
}

function orderSeriesForPanel(panel, series) {
  if (panel.type !== "mixed") {
    return series;
  }
  return [...series].sort((a, b) => Number(a.type === "line") - Number(b.type === "line"));
}

function legendConfig(panel, series, scale) {
  const position = panel.legendPosition ?? "top";
  const itemSize = scaled(panel.legendSize ?? 14, scale);
  const base = {
    show: panel.legend ?? true,
    type: "scroll",
    itemWidth: itemSize,
    itemHeight: Math.max(6, Math.round(itemSize * 0.7)),
    textStyle: { color: DEFAULT_TEXT_COLOR, fontSize: fontSize(panel, "legend", 12, scale) },
  };
  const insideBase = {
    ...base,
    backgroundColor: "rgba(248, 251, 255, 0.84)",
    borderRadius: scaled(8, scale),
    padding: [scaled(5, scale), scaled(8, scale)],
    z: 20,
  };

  if (position === "right") {
    return {
      ...base,
      orient: "vertical",
      top: scaled(76, scale),
      right: scaled(8, scale),
    };
  }
  if (position === "bottom") {
    return {
      ...base,
      left: "center",
      bottom: scaled(4, scale),
    };
  }
  if (position === "left") {
    return {
      ...base,
      orient: "vertical",
      top: scaled(76, scale),
      left: scaled(8, scale),
    };
  }
  if (position === "insideTopLeft") {
    return { ...insideBase, left: scaled(DEFAULT_GRID.left + 8, scale), top: scaled(DEFAULT_GRID.top + 4, scale) };
  }
  if (position === "insideTopRight") {
    return { ...insideBase, right: scaled(DEFAULT_GRID.right + 8, scale), top: scaled(DEFAULT_GRID.top + 4, scale) };
  }
  if (position === "insideBottomLeft") {
    return { ...insideBase, left: scaled(DEFAULT_GRID.left + 8, scale), bottom: scaled(DEFAULT_GRID.bottom + 4, scale) };
  }
  if (position === "insideBottomRight") {
    return { ...insideBase, right: scaled(DEFAULT_GRID.right + 8, scale), bottom: scaled(DEFAULT_GRID.bottom + 4, scale) };
  }
  return {
    ...base,
    left: "center",
    top: scaled(44, scale),
  };
}

function lineStyleForSeries(item, color, scale) {
  return {
    color,
    width: scaled(item.lineWidth ?? 3, scale),
    type: item.lineStyle === "shadow" ? "solid" : item.lineStyle ?? "solid",
    opacity: 1,
  };
}

function areaStyleForSeries(panel, item, color) {
  if (panel.type === "area") {
    return { color, opacity: 0.18 };
  }
  if (item.lineStyle !== "shadow") {
    return undefined;
  }
  return {
    color: item.shadowColor ?? color,
    opacity: 0.22,
  };
}

function symbolForSeries(panel, item) {
  if (seriesType(panel.type, item.type) !== "line") {
    return undefined;
  }
  return item.markerStyle ?? "none";
}

function isDateLikeField(field) {
  const normalized = String(field ?? "").toLowerCase();
  return normalized.includes("date") || normalized.includes("datum") || normalized.includes("snapshot");
}

function referenceLineConfig(referenceLines, yAxisIndex = 0) {
  const axisLines = (referenceLines ?? []).filter((line) => Number(line.yAxisIndex ?? 0) === Number(yAxisIndex));
  if (!axisLines.length) {
    return undefined;
  }
  return {
    symbol: "none",
    animation: false,
    silent: true,
    label: { color: DEFAULT_TEXT_COLOR, formatter: (params) => params.name ?? "" },
    data: axisLines.map((line) => ({
      yAxis: line.y,
      name: line.label,
      label: {
        show: Boolean(line.label),
        formatter: line.label ?? "",
        position: line.labelPosition ?? "end",
        color: line.color ?? DEFAULT_TEXT_COLOR,
      },
      lineStyle: {
        type: line.lineStyle === "dotted" ? [2, 9] : line.lineStyle ?? "dashed",
        color: line.color ?? "rgba(8, 34, 74, 0.55)",
        width: line.lineStyle === "dotted" ? 5 : 2,
        cap: line.lineStyle === "dotted" ? "round" : "butt",
      },
    })),
  };
}


function fontSize(panel, key, baseSize, scale) {
  const customSize = Number(panel.fontSizes?.[key]);
  const resolvedBase = Number.isFinite(customSize) ? customSize : baseSize;
  return scaled(resolvedBase, scale);
}
function scaled(value, scale) {
  return Math.round(value * scale);
}

function scaledGrid(panel, scale, renderContext = {}) {
  const legendPosition = panel.legendPosition ?? "top";
  if (renderContext.compact) {
    const hasSecondAxis = (panel.series ?? []).some((item) => Number(item.yAxisIndex ?? 0) === 1);
    return {
      containLabel: true,
      left: legendPosition === "left" ? 118 : 42,
      right: legendPosition === "right" ? 118 : hasSecondAxis ? 52 : 24,
      top: legendPosition === "top" ? 76 : 54,
      bottom: legendPosition === "bottom" ? 64 : 42,
    };
  }
  return {
    containLabel: true,
    left: legendPosition === "left" ? scaled(160, Math.min(scale, 1.25)) : scaled(DEFAULT_GRID.left, scale),
    right: legendPosition === "right" ? scaled(150, Math.min(scale, 1.25)) : scaled(DEFAULT_GRID.right + 12, Math.min(scale, 1.25)),
    top: scaled(DEFAULT_GRID.top, scale),
    bottom: legendPosition === "bottom" ? scaled(86, scale) : scaled(DEFAULT_GRID.bottom, scale),
  };
}

function panelColors(panel) {
  const base = COLOR_SCHEMES[panel.colorScheme ?? "manual"] ?? COLOR_SCHEMES.manual;
  return panel.reverseColorScheme ? [...base].reverse() : base;
}

function seriesColor(panel, item, colors, index) {
  if ((panel.colorScheme ?? "manual") === "manual" && item.color) {
    return item.color;
  }
  return colors[index % colors.length];
}

function uniqueValues(values) {
  return [...new Set(values.filter((value) => value !== undefined && value !== null))];
}

function applyCategorySelection(data, panel) {
  const selection = panel.categorySelection;
  if (!selection?.column || !Array.isArray(selection.values) || selection.values.length === 0) {
    return data;
  }
  const allowed = new Set(selection.values.map(String));
  return data.filter((row) => allowed.has(String(row[selection.column])));
}

function numericOrUndefined(value) {
  const number = Number(value);
  return Number.isFinite(number) ? number : undefined;
}

function axisLabelFormatter(panel) {
  if (panel.numberFormat === "percent") {
    return (value) => `${value}%`;
  }
  if (panel.numberFormat === "full") {
    return (value) => Number(value).toLocaleString();
  }
  return undefined;
}

function sortRowsForAxis(data, xField, useDateAxis) {
  if (!useDateAxis) {
    return data;
  }
  return [...data].sort((a, b) => new Date(a[xField]).getTime() - new Date(b[xField]).getTime());
}

function toNumber(value) {
  const number = Number(value);
  return Number.isFinite(number) ? number : 0;
}

function formatTooltipValue(value) {
  return typeof value === "number" ? value.toLocaleString() : value;
}

function compareDateishValues(a, b) {
  const dateA = Date.parse(a);
  const dateB = Date.parse(b);
  if (!Number.isNaN(dateA) && !Number.isNaN(dateB)) {
    return dateA - dateB;
  }
  return String(a ?? "").localeCompare(String(b ?? ""), undefined, { numeric: true });
}






