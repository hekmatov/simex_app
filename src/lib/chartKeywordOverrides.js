const STORAGE_KEY = "simex.voiceChartKeywordOverrides.v1";

export function readChartKeywordOverrides() {
  try {
    const parsed = JSON.parse(window.localStorage.getItem(STORAGE_KEY) || "{}");
    return parsed && typeof parsed === "object" ? parsed : {};
  } catch {
    return {};
  }
}

export function writeChartKeywordOverrides(overrides) {
  const cleanOverrides = cleanKeywordOverrides(overrides);
  window.localStorage.setItem(STORAGE_KEY, JSON.stringify(cleanOverrides));
  return cleanOverrides;
}

export function addChartKeywords(overrides, panelId, keywords) {
  const cleanKeywords = normalizeKeywordList(keywords);
  if (!panelId || cleanKeywords.length === 0) {
    return cleanKeywordOverrides(overrides);
  }
  const panelOverride = normalizePanelOverride(overrides?.[panelId]);
  const addedKeywords = uniqueStrings([...panelOverride.addedKeywords, ...cleanKeywords]);
  const removedKeywords = panelOverride.removedKeywords.filter((keyword) => !cleanKeywords.includes(keyword));
  return writeChartKeywordOverrides({
    ...overrides,
    [panelId]: { addedKeywords, removedKeywords },
  });
}

export function removeChartKeyword(overrides, panelId, keyword, isDefaultKeyword = false) {
  const cleanKeyword = normalizeKeyword(keyword);
  if (!panelId || !cleanKeyword) {
    return cleanKeywordOverrides(overrides);
  }
  const panelOverride = normalizePanelOverride(overrides?.[panelId]);
  const addedKeywords = panelOverride.addedKeywords.filter((candidate) => candidate !== cleanKeyword);
  const removedKeywords = isDefaultKeyword
    ? uniqueStrings([...panelOverride.removedKeywords, cleanKeyword])
    : panelOverride.removedKeywords;
  return writeChartKeywordOverrides({
    ...overrides,
    [panelId]: { addedKeywords, removedKeywords },
  });
}

export function restoreChartKeyword(overrides, panelId, keyword) {
  const cleanKeyword = normalizeKeyword(keyword);
  if (!panelId || !cleanKeyword) {
    return cleanKeywordOverrides(overrides);
  }
  const panelOverride = normalizePanelOverride(overrides?.[panelId]);
  return writeChartKeywordOverrides({
    ...overrides,
    [panelId]: {
      addedKeywords: panelOverride.addedKeywords,
      removedKeywords: panelOverride.removedKeywords.filter((candidate) => candidate !== cleanKeyword),
    },
  });
}

export function clearChartKeywordOverrides() {
  window.localStorage.removeItem(STORAGE_KEY);
  return {};
}

export function applyChartKeywordOverrides(aliasesByPanelId = {}, overridesByPanelId = {}) {
  const merged = {};
  const panelIds = new Set([
    ...Object.keys(aliasesByPanelId ?? {}),
    ...Object.keys(overridesByPanelId ?? {}),
  ]);
  for (const panelId of panelIds) {
    const base = normalizeAliasConfig(aliasesByPanelId?.[panelId]);
    const override = normalizePanelOverride(overridesByPanelId?.[panelId]);
    merged[panelId] = {
      ...base,
      keywords: uniqueStrings([
        ...base.keywords.filter((keyword) => !override.removedKeywords.includes(keyword)),
        ...override.addedKeywords,
      ]),
    };
  }
  return merged;
}

export function panelKeywordView(panelId, aliasesByPanelId = {}, overridesByPanelId = {}) {
  const base = normalizeAliasConfig(aliasesByPanelId?.[panelId]);
  const override = normalizePanelOverride(overridesByPanelId?.[panelId]);
  const defaultKeywords = base.keywords.filter((keyword) => !override.removedKeywords.includes(keyword));
  return {
    aliases: base.aliases,
    defaultKeywords,
    addedKeywords: override.addedKeywords,
    removedKeywords: override.removedKeywords,
  };
}

function cleanKeywordOverrides(overrides) {
  const clean = {};
  for (const [panelId, override] of Object.entries(overrides ?? {})) {
    const panelOverride = normalizePanelOverride(override);
    if (panelOverride.addedKeywords.length > 0 || panelOverride.removedKeywords.length > 0) {
      clean[panelId] = panelOverride;
    }
  }
  return clean;
}

function normalizePanelOverride(override) {
  return {
    addedKeywords: normalizeKeywordList(override?.addedKeywords ?? override?.keywords),
    removedKeywords: normalizeKeywordList(override?.removedKeywords),
  };
}

function normalizeAliasConfig(config) {
  if (Array.isArray(config)) {
    return { aliases: uniqueStrings(config), keywords: [], description: "" };
  }
  return {
    aliases: uniqueStrings(config?.aliases),
    keywords: uniqueStrings(config?.keywords),
    description: String(config?.description ?? ""),
  };
}

function normalizeKeywordList(value) {
  const list = Array.isArray(value) ? value : String(value ?? "").split(/[,\n]/);
  return uniqueStrings(list.map(normalizeKeyword).filter(Boolean));
}

function normalizeKeyword(value) {
  return String(value ?? "").trim().replace(/\s+/g, " ");
}

function uniqueStrings(values) {
  return [...new Set((values ?? []).map(String).map((value) => value.trim()).filter(Boolean))];
}
