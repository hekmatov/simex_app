import { loadCsv, parseCsvText } from "./loadCsv.js";

const dataSourceCache = new Map();

export async function loadDashboard(configPath) {
  const portable = portableDashboard();
  if (usingFileProtocol() && portable?.config) {
    return loadDashboardConfig(portable.config);
  }

  try {
    const configResponse = await fetch(configPath);
    if (!configResponse.ok) {
      throw new Error(`Could not load dashboard config: ${configPath}`);
    }

    const dashboard = await configResponse.json();
    return loadDashboardConfig(dashboard);
  } catch (error) {
    if (portable?.config) {
      return loadDashboardConfig(portable.config);
    }
    throw error;
  }
}

export async function loadDashboardConfig(dashboard) {
  const loadedData = {};

  for (const [sourceId, source] of Object.entries(dashboard.dataSources ?? {})) {
    loadedData[sourceId] = await loadDataSource(source);
  }

  return {
    ...dashboard,
    pages: normalizePages(dashboard),
    loadedData,
  };
}

async function loadDataSource(source) {
  const cacheKey = dataSourceCacheKey(source);
  if (dataSourceCache.has(cacheKey)) {
    return dataSourceCache.get(cacheKey);
  }

  const loadPromise = loadDataSourceFresh(source);
  dataSourceCache.set(cacheKey, loadPromise);
  try {
    const loaded = await loadPromise;
    dataSourceCache.set(cacheKey, loaded);
    return loaded;
  } catch (error) {
    dataSourceCache.delete(cacheKey);
    throw error;
  }
}

async function loadDataSourceFresh(source) {
  if (source?.type === "uploadedCsv") {
    return parseCsvText(source.csvText ?? "", source.fileName ?? "uploaded CSV");
  }

  const portableSource = portableSourceFor(source);
  if (usingFileProtocol() && portableSource) {
    return parsePortableSource(source, portableSource);
  }

  const path = sourceUrl(source);
  if (path.endsWith(".json") || path.endsWith(".geojson")) {
    try {
      const response = await fetch(path);
      if (!response.ok) {
        throw new Error(`Could not load data file: ${path}`);
      }
      return response.json();
    } catch (error) {
      if (portableSource) {
        return parsePortableSource(source, portableSource);
      }
      throw error;
    }
  }
  try {
    return await loadCsv(path);
  } catch (error) {
    if (portableSource) {
      return parsePortableSource(source, portableSource);
    }
    throw error;
  }
}

function dataSourceCacheKey(source) {
  if (source?.type === "uploadedCsv") {
    return `uploadedCsv:${source.fileName ?? ""}:${source.uploadedAt ?? ""}:${source.csvText?.length ?? 0}:${hashText(source.csvText ?? "")}`;
  }
  return `static:${String(source ?? "").replaceAll("\\", "/")}`;
}

function hashText(text) {
  let hash = 0;
  for (let index = 0; index < text.length; index += 1) {
    hash = ((hash << 5) - hash) + text.charCodeAt(index);
    hash |= 0;
  }
  return hash;
}

function sourceUrl(source) {
  const value = String(source ?? "");
  if (/^(https?:|data:|\/)/i.test(value)) {
    return value;
  }
  return `${import.meta.env.BASE_URL}${value}`;
}

function portableDashboard() {
  return globalThis.window?.SIMEX_PORTABLE_DASHBOARD ?? null;
}

function portableSourceFor(source) {
  if (!source || typeof source !== "string") {
    return null;
  }
  return portableDashboard()?.sources?.[source.replaceAll("\\", "/")] ?? null;
}

function parsePortableSource(source, portableSource) {
  if (portableSource.kind === "json") {
    return structuredClone(portableSource.data);
  }
  if (portableSource.kind === "csv") {
    return parseCsvText(portableSource.text ?? "", source);
  }
  throw new Error(`Unsupported portable data source: ${source}`);
}

function usingFileProtocol() {
  return globalThis.window?.location?.protocol === "file:";
}

function normalizePages(dashboard) {
  if (Array.isArray(dashboard.pages)) {
    return dashboard.pages;
  }

  return [
    {
      id: "dashboard",
      label: "Dashboard",
      title: dashboard.title,
      description: dashboard.description,
      sections: [
        {
          id: "main",
          title: dashboard.title,
          description: dashboard.description,
          layout: dashboard.layout,
          panels: dashboard.charts ?? [],
        },
      ],
    },
  ];
}
