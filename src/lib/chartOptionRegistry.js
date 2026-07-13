export const CHART_SETTING_TABS = [
  { id: "data", label: "Data" },
  { id: "series", label: "Series" },
  { id: "axes", label: "Axes & Scale" },
  { id: "style", label: "Style & Layout" },
];

const COMMON_SECTIONS = {
  data: ["source", "dataBinding", "categoryOrder"],
  series: [],
  axes: ["axisFields", "axisScale", "secondaryAxis", "referenceLines"],
  style: ["titleLayout", "legend", "palette", "textSize", "panelLayout"],
};

const BAR_SECTIONS = {
  data: ["source", "dataBinding", "categoryOrder"],
  series: ["barAppearance"],
  axes: ["axisFields", "axisScale", "secondaryAxis"],
  style: ["titleLayout", "legend", "palette", "textSize", "panelLayout", "tooltip"],
};

const TYPE_SECTIONS = {
  line: COMMON_SECTIONS,
  area: COMMON_SECTIONS,
  mixed: {
    data: ["source", "dataBinding", "categoryOrder"],
    series: ["barAppearance"],
    axes: ["axisFields", "axisScale", "secondaryAxis", "referenceLines"],
    style: ["titleLayout", "legend", "palette", "textSize", "panelLayout", "tooltip"],
  },
  bar: BAR_SECTIONS,
  horizontalBar: BAR_SECTIONS,
  groupedBar: BAR_SECTIONS,
  stackedBar: BAR_SECTIONS,
  horizontalStackedBar: BAR_SECTIONS,
  gauge: {
    data: ["source"],
    series: ["gaugeData", "gaugeRedZone"],
    axes: [],
    style: ["titleLayout", "palette", "textSize", "panelLayout"],
  },
  mapScatter: {
    data: ["source"],
    series: ["mapData"],
    axes: [],
    style: ["titleLayout", "palette", "textSize", "panelLayout"],
  },
  choroplethMap: {
    data: ["source", "singleDateSelection"],
    series: ["choroplethData"],
    axes: [],
    style: ["titleLayout", "palette", "textSize", "panelLayout"],
  },
  chronoChoroplethMap: {
    data: ["source", "dateSelection"],
    series: ["choroplethData"],
    axes: [],
    style: ["titleLayout", "palette", "textSize", "panelLayout"],
  },
  image: {
    data: ["imageSource"],
    series: [],
    axes: [],
    style: ["titleLayout", "textSize", "panelLayout"],
  },
  table: {
    data: ["source"],
    series: ["tableFields"],
    axes: [],
    style: ["titleLayout", "panelLayout"],
  },
  deltaList: {
    data: ["source"],
    series: ["deltaFields"],
    axes: [],
    style: ["titleLayout", "panelLayout"],
  },
  kpi: {
    data: ["source"],
    series: ["kpiFields"],
    axes: [],
    style: ["titleLayout", "panelLayout"],
  },
};

export const CHART_OPTION_SECTIONS = {
  source: { tab: "data", title: "Source", optionIds: ["title", "infoSource", "dataSource", "sourceCsv", "panelType"] },
  dataBinding: { tab: "data", title: "Observations, Measurements & Filters", optionIds: ["xRole", "measures", "clusterFields", "filters", "aggregation"] },
  dateSelection: { tab: "data", title: "Date Filter", optionIds: ["dateSelection"] },
  singleDateSelection: { tab: "data", title: "Date", optionIds: ["singleDateSelection"] },
  categorySelection: { tab: "data", title: "Category Checklist", optionIds: ["categorySelection"] },
  categoryOrder: { tab: "data", title: "Category Ordering", optionIds: ["categoryOrder", "categorySortColumn", "categorySortDirection"] },
  seriesList: { tab: "series", title: "Series", optionIds: ["addSeries", "removeSeries", "duplicateSeries", "seriesFields"] },
  seriesFrom: { tab: "series", title: "Grouped / Stacked Data", optionIds: ["seriesFromName", "seriesFromValue"] },
  barAppearance: { tab: "series", title: "Bar Appearance", optionIds: ["barWidth", "barGap", "categoryGap", "showValueLabels", "labelPosition"] },
  gaugeData: { tab: "series", title: "Gauge Data", optionIds: ["valueField", "labelField", "unit", "max"] },
  gaugeRedZone: { tab: "series", title: "Gauge Stage Colors", optionIds: ["gaugeStageColors"] },
  mapData: { tab: "series", title: "Map Data", optionIds: ["nameField", "valueField", "pointScale"] },
  choroplethData: { tab: "series", title: "Choropleth Data & Overlay", optionIds: ["geoSource", "joinField", "valueField", "labelField", "mapLayoutSize", "visualRange", "provinceOverlay"] },
  imageSource: { tab: "data", title: "Image Source", optionIds: ["imageUpload", "imageFit"] },
  tableFields: { tab: "series", title: "Table Columns", optionIds: ["columns"] },
  deltaFields: { tab: "series", title: "Delta Fields", optionIds: ["titleField", "valueField", "detailField"] },
  kpiFields: { tab: "series", title: "KPI Fields", optionIds: ["labelField", "valueField"] },
  axisFields: { tab: "axes", title: "Axis Fields", optionIds: ["x", "xAxisMode", "xAxisTitle", "yAxisTitle"] },
  axisScale: { tab: "axes", title: "Scale & Labels", optionIds: ["yScale", "yMin", "yMax", "axisLabelRotation", "showGrid", "numberFormat"] },
  secondaryAxis: { tab: "axes", title: "Secondary Axis", optionIds: ["secondaryAxisTitle", "secondaryAxisMin", "secondaryAxisMax"] },
  referenceLines: { tab: "axes", title: "Reference Lines", optionIds: ["referenceLines"] },
  titleLayout: { tab: "style", title: "Title & Info", optionIds: ["title", "infoSource"] },
  legend: { tab: "style", title: "Legend", optionIds: ["legend", "legendPosition", "legendSize", "legendFont"] },
  palette: { tab: "style", title: "Palette", optionIds: ["colorScheme", "reverseColorScheme"] },
  textSize: { tab: "style", title: "Text Size", optionIds: ["fontSizes"] },
  panelLayout: { tab: "style", title: "Panel Layout", optionIds: ["size", "fullscreenScaling"] },
  tooltip: { tab: "style", title: "Tooltip", optionIds: ["tooltipTrigger"] },
};

export function getSectionsForPanelType(type) {
  return TYPE_SECTIONS[type] ?? TYPE_SECTIONS.line;
}
