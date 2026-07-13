const SEARCHABLE_PANEL_FIELDS = [
  "id",
  "title",
  "type",
  "dataSource",
  "geoSource",
  "x",
  "mapName",
  "nameField",
  "valueField",
  "labelField",
  "infoSource",
];

export function buildChartSearchIndex(dashboard, aliasesByPanelId = {}) {
  const dataSources = dashboard?.dataSources ?? {};
  return (dashboard?.pages ?? []).flatMap((page) =>
    (page.sections ?? []).flatMap((section) =>
      (section.panels ?? []).map((panel) => {
        const aliasConfig = normalizeAliasConfig(aliasesByPanelId[panel.id]);
        const sourceLabel = dataSources[panel.dataSource] ?? "";
        const fragments = [
          page.label,
          page.title,
          page.description,
          section.title,
          section.description,
          sourceLabel,
          ...SEARCHABLE_PANEL_FIELDS.map((field) => panel[field]),
          ...seriesFragments(panel),
          aliasConfig.description,
          ...aliasConfig.aliases,
          ...aliasConfig.keywords,
        ].filter(Boolean);
        const searchableText = normalizeText(fragments.join(" "));
        const tokens = tokenize(searchableText);
        return {
          panelId: panel.id,
          title: panel.title ?? panel.id,
          pageId: page.id,
          pageLabel: page.label ?? page.title ?? page.id,
          sectionId: section.id,
          sectionTitle: section.title ?? section.id,
          type: panel.type,
          dataSource: panel.dataSource,
          aliases: aliasConfig.aliases,
          keywords: aliasConfig.keywords,
          searchableText,
          tokens,
        };
      }),
    ),
  );
}

export function normalizeText(value) {
  return String(value ?? "")
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

export function tokenize(value) {
  return [...new Set(normalizeText(value).split(/\s+/).filter((token) => token.length > 1))];
}

function normalizeAliasConfig(config) {
  if (Array.isArray(config)) {
    return { aliases: config.map(String), keywords: [], description: "" };
  }
  return {
    aliases: asStringList(config?.aliases),
    keywords: asStringList(config?.keywords),
    description: String(config?.description ?? ""),
  };
}

function asStringList(value) {
  return Array.isArray(value) ? value.map(String).filter(Boolean) : [];
}

function seriesFragments(panel) {
  const fragments = [];
  for (const series of panel.series ?? []) {
    fragments.push(series.name, series.y, series.type);
  }
  if (panel.seriesFrom) {
    fragments.push(panel.seriesFrom.nameField, panel.seriesFrom.valueField);
  }
  if (panel.fields) {
    fragments.push(...Object.values(panel.fields));
  }
  for (const filter of panel.filters ?? []) {
    fragments.push(filter.column, filter.equals, ...(filter.in ?? []));
  }
  for (const item of panel.items ?? []) {
    fragments.push(item.label, item.value);
  }
  for (const column of panel.columns ?? []) {
    fragments.push(column);
  }
  return fragments.filter(Boolean);
}
