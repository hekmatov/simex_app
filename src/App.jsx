import React, { useEffect, useState } from "react";

import DashboardRenderer from "./components/DashboardRenderer.jsx";
import { migrateDashboardToDataModel } from "./lib/chartDataModel.js";
import { reconcileDashboardWithLoadedData } from "./lib/dashboardCompatibility.js";
import { loadDashboard, loadDashboardConfig } from "./lib/loadDashboard.js";

const STORAGE_KEY = "simex-dashboard-v2-config-pages-v2";
const DEVICE_LAYOUT_STORAGE_KEY = "simex-dashboard-v2-device-layout";
const SHOW_COMPATIBILITY_REPORTS = import.meta.env.VITE_SHOW_COMPATIBILITY_REPORTS !== "false";
const BUNDLE_TYPE = "simex-dashboard-v2-bundle";
const DEFAULT_VANTA_BACKGROUND = {
  backgroundColor: "#f7f9fc",
  networkColor: "#f1a1ad",
  mouseControls: false,
  touchControls: false,
  points: 6,
  maxDistance: 17,
  spacing: 18,
  speed: 0.45,
};

const DEFAULT_GLOBAL_STYLES = {
  panelColors: {
    panelBackgroundColor: "#f5f8fb",
    panelBorderColor: "#d8e2ec",
    chartAreaColor: "#eaf1f6",
    chartAreaBorderColor: "#d8e2ec",
    editHighlightColor: "#043bcb",
    multiSelectHighlightColor: "#00a676",
  },
};

const VANTA_LIMITS = {
  points: [3, 18],
  maxDistance: [8, 32],
  spacing: [10, 34],
  speed: [0.1, 2],
};

export default function App() {
  const [dashboard, setDashboard] = useState(null);
  const [defaultConfig, setDefaultConfig] = useState(null);
  const [error, setError] = useState(null);
  const [editMode, setEditMode] = useState(false);
  const [editSessionStartConfig, setEditSessionStartConfig] = useState(null);
  const [compatibilityReports, setCompatibilityReports] = useState([]);
  const [deviceLayout, setDeviceLayout] = useState(() => loadDeviceLayout());

  const vantaSettings = sanitizeVantaSettings(dashboard?.vantaBackground);
  const vantaSettingsKey = JSON.stringify(vantaSettings);

  useEffect(() => {
    const vantaEffect = initializeVantaBackground(vantaSettings);
    return () => vantaEffect?.destroy?.();
  }, [vantaSettingsKey]);

  function changeDeviceLayout(layout) {
    setDeviceLayout(layout);
    localStorage.setItem(DEVICE_LAYOUT_STORAGE_KEY, layout);
  }

  useEffect(() => {
    loadDashboard(`${import.meta.env.BASE_URL}config/dashboard.json`)
      .then((loadedDashboard) => {
        const config = migrateDashboardToDataModel(stripRuntimeFields(loadedDashboard));
        const storedConfig = loadSavedConfig();
        const savedBrowserConfig = storedConfig ? migrateDashboardToDataModel(storedConfig) : null;
        const savedConfig = sanitizeDashboardConfig(mergeDefaultConfigAdditions(savedBrowserConfig, config) ?? config);
        if (savedBrowserConfig) {
          localStorage.setItem(STORAGE_KEY, JSON.stringify(savedConfig, null, 2));
        }

        setDefaultConfig(config);
        return loadDashboardConfig(savedConfig);
      })
      .then((loadedDashboard) => applyLoadedDashboard(loadedDashboard, { showReport: SHOW_COMPATIBILITY_REPORTS }))
      .catch((loadError) => setError(loadError));
  }, []);

  function applyLoadedDashboard(loadedDashboard, { showReport = false, persistReconciliation = true } = {}) {
    const runtimeConfig = stripRuntimeFields(loadedDashboard);
    const reconciled = reconcileDashboardWithLoadedData(runtimeConfig, loadedDashboard.loadedData);
    const safeConfig = sanitizeDashboardConfig(reconciled.config);
    if (persistReconciliation && JSON.stringify(safeConfig) !== JSON.stringify(runtimeConfig)) {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(safeConfig, null, 2));
    }
    setDashboard({
      ...safeConfig,
      loadedData: loadedDashboard.loadedData,
    });
    if (showReport && reconciled.reports.length > 0) {
      setCompatibilityReports(reconciled.reports);
    }
  }

  function updateDashboardConfig(nextConfig) {
    const safeConfig = sanitizeDashboardConfig(nextConfig);
    localStorage.setItem(STORAGE_KEY, JSON.stringify(safeConfig, null, 2));
    if (dashboard && sameDataSources(dashboard.dataSources, safeConfig.dataSources)) {
      setError(null);
      setDashboard({
        ...safeConfig,
        pages: Array.isArray(safeConfig.pages) ? safeConfig.pages : dashboard.pages,
        loadedData: dashboard.loadedData,
      });
      return;
    }
    loadDashboardConfig(safeConfig)
      .then((loadedDashboard) => {
        setError(null);
        applyLoadedDashboard(loadedDashboard);
      })
      .catch((loadError) => setError(loadError));
  }

  function previewDashboardConfig(nextConfig) {
    const safeConfig = sanitizeDashboardConfig(nextConfig);
    if (dashboard && sameDataSources(dashboard.dataSources, safeConfig.dataSources)) {
      setError(null);
      setDashboard({
        ...safeConfig,
        pages: Array.isArray(safeConfig.pages) ? safeConfig.pages : dashboard.pages,
        loadedData: dashboard.loadedData,
      });
      return;
    }
    loadDashboardConfig(safeConfig)
      .then((loadedDashboard) => {
        setError(null);
        applyLoadedDashboard(loadedDashboard, { persistReconciliation: false });
      })
      .catch((loadError) => setError(loadError));
  }

  function updatePanel(panelId, updates, options = {}) {
    const { commitToEditSession = true } = options;
    const nextConfig = updatePanelInConfig(stripRuntimeFields(dashboard), panelId, updates);
    if (!commitToEditSession) {
      previewDashboardConfig(nextConfig);
      return;
    }
    updateDashboardConfig(nextConfig);
    if (commitToEditSession && editMode && editSessionStartConfig) {
      setEditSessionStartConfig(updatePanelInConfig(editSessionStartConfig, panelId, updates));
    }
  }

  function commitPanelEditSession(config) {
    const safeConfig = sanitizeDashboardConfig(stripRuntimeFields(config));
    updateDashboardConfig(safeConfig);
    setEditSessionStartConfig(safeConfig);
  }

  function cancelPanelEditSession(config) {
    updateDashboardConfig(stripRuntimeFields(config));
  }

  function updateSection(pageId, sectionId, updates) {
    updateDashboardConfig(updateSectionInConfig(stripRuntimeFields(dashboard), pageId, sectionId, updates));
  }

  function updatePage(pageId, updates) {
    updateDashboardConfig(updatePageInConfig(stripRuntimeFields(dashboard), pageId, (page) => ({ ...page, ...updates })));
  }

  function updateDashboardFields(updates) {
    updateDashboardConfig({
      ...stripRuntimeFields(dashboard),
      ...updates,
    });
  }

  function insertSection(pageId, sectionId, panelId, section) {
    updateDashboardConfig(insertSectionAtPanelInConfig(stripRuntimeFields(dashboard), pageId, sectionId, panelId, section));
  }

  function updateVantaBackground(updates) {
    const config = stripRuntimeFields(dashboard);
    updateDashboardConfig({
      ...config,
      vantaBackground: sanitizeVantaSettings({
        ...(config.vantaBackground ?? {}),
        ...updates,
      }),
    });
  }

  function addPage(page) {
    updateDashboardConfig(addPageToConfig(stripRuntimeFields(dashboard), page));
  }

  function removePage(pageId) {
    updateDashboardConfig(removePageFromConfig(stripRuntimeFields(dashboard), pageId));
  }

  function addPanel(pageId, sectionId, panel, uploadedSource) {
    let config = stripRuntimeFields(dashboard);
    let nextPanel = panel;
    if (uploadedSource) {
      const sourceId = uniqueDataSourceId(config, uploadedSource.fileName);
      config = {
        ...config,
        dataSources: { ...(config.dataSources ?? {}), [sourceId]: uploadedSource },
      };
      nextPanel = { ...panel, dataSource: sourceId };
    }
    updateDashboardConfig(addPanelToConfig(config, pageId, sectionId, nextPanel));
  }

  function removePanel(panelId) {
    updateDashboardConfig(removePanelFromConfig(stripRuntimeFields(dashboard), panelId));
  }

  function reorderPanel(sourcePanelId, targetPanelId) {
    if (!sourcePanelId || !targetPanelId || sourcePanelId === targetPanelId) {
      return;
    }
    updateDashboardConfig(reorderPanelInConfig(stripRuntimeFields(dashboard), sourcePanelId, targetPanelId));
  }

  function toggleEditMode() {
    if (!editMode) {
      setEditSessionStartConfig(stripRuntimeFields(dashboard));
      setEditMode(true);
      return;
    }

    setEditSessionStartConfig(null);
    setEditMode(false);
  }

  function cancelEditSession() {
    if (!editSessionStartConfig) {
      setEditMode(false);
      return;
    }

    updateDashboardConfig(editSessionStartConfig);
    setEditSessionStartConfig(null);
    setEditMode(false);
  }

  function importConfig(file) {
    if (!file) {
      return;
    }

    const reader = new FileReader();
    reader.onload = () => {
      try {
        const importedFile = JSON.parse(reader.result);
        const importedConfig = importedFile?.bundleType === BUNDLE_TYPE
          ? {
              ...importedFile.config,
              dataSources: {
                ...(importedFile.config?.dataSources ?? {}),
                ...(importedFile.uploadedCsvSources ?? {}),
              },
            }
          : importedFile;
        updateDashboardConfig(migrateDashboardToDataModel(importedConfig));
      } catch (importError) {
        setError(new Error(`Could not import dashboard bundle: ${importError.message}`));
      }
    };
    reader.onerror = () => {
      setError(new Error("Could not read the selected config file."));
    };
    reader.readAsText(file);
  }

  function exportConfig(configOverride) {
    promptAndDownloadDashboardBundle(bundleFromDashboard(configOverride ?? dashboard), `SimEx-dashboard-bundle-${dateStamp()}`);
  }

  async function exportPackageDefaultConfig(configOverride) {
    const bundle = bundleFromDashboard(configOverride ?? dashboard);
    const fileName = "packaged-dashboard-bundle.json";

    if (globalThis.window?.showSaveFilePicker) {
      try {
        const fileHandle = await globalThis.window.showSaveFilePicker({
          suggestedName: fileName,
          types: [
            {
              description: "SimEx dashboard package default bundle",
              accept: { "application/json": [".json"] },
            },
          ],
        });
        const writable = await fileHandle.createWritable();
        await writable.write(JSON.stringify(bundle, null, 2));
        await writable.close();
        window.alert(`Saved ${fileName}. Place it in the project root before running pnpm.cmd package:flashdrive.`);
        return;
      } catch (saveError) {
        if (saveError?.name === "AbortError") {
          return;
        }
      }
    }

    downloadDashboardBundle(bundle, fileName);
    window.alert(`Your browser downloaded ${fileName}. Move it into the project root before running pnpm.cmd package:flashdrive.`);
  }

  function bundleFromDashboard(currentDashboard) {
    const config = stripRuntimeFields(currentDashboard);
    return {
      bundleType: BUNDLE_TYPE,
      version: 2,
      exportedAt: new Date().toISOString(),
      config,
      uploadedCsvSources: Object.fromEntries(
        Object.entries(config.dataSources ?? {}).filter(([, source]) => source?.type === "uploadedCsv"),
      ),
    };
  }

  function promptAndDownloadDashboardBundle(bundle, defaultName) {
    const chosenName = window.prompt("Name this exported dashboard bundle", defaultName);
    if (!chosenName) {
      return;
    }
    const fileName = chosenName.endsWith(".json") ? chosenName : `${chosenName}.json`;
    downloadDashboardBundle(bundle, fileName);
  }

  function downloadDashboardBundle(bundle, fileName) {
    const blob = new Blob([JSON.stringify(bundle, null, 2)], {
      type: "application/json",
    });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = fileName;
    link.click();
    URL.revokeObjectURL(url);
  }

  function uploadCsvSource(file) {
    if (!file) {
      return;
    }

    const reader = new FileReader();
    reader.onload = () => {
      const config = stripRuntimeFields(dashboard);
      const sourceId = uniqueDataSourceId(config, file.name);
      updateDashboardConfig({
        ...config,
        dataSources: {
          ...(config.dataSources ?? {}),
          [sourceId]: {
            type: "uploadedCsv",
            fileName: file.name,
            csvText: String(reader.result ?? ""),
            uploadedAt: new Date().toISOString(),
          },
        },
      });
    };
    reader.onerror = () => {
      setError(new Error("Could not read the selected CSV file."));
    };
    reader.readAsText(file);
  }

  if (error) {
    return (
      <main className="app-shell">
        <section className="status-panel status-panel-error">
          <h1>Dashboard configuration error</h1>
          <p>{error.message}</p>
        </section>
      </main>
    );
  }

  if (!dashboard) {
    return (
      <main className="app-shell">
        <section className="status-panel">
          <h1>Loading dashboard</h1>
          <p>Reading configuration and prepared data files.</p>
        </section>
      </main>
    );
  }

  return (
    <>
      {SHOW_COMPATIBILITY_REPORTS && compatibilityReports.length > 0 && (
        <CompatibilityReportModal reports={compatibilityReports} onClose={() => setCompatibilityReports([])} />
      )}
      <DashboardRenderer
        dashboard={dashboard}
        deviceLayout={deviceLayout}
        onDeviceLayoutChange={changeDeviceLayout}
        editMode={editMode}
        onToggleEditMode={toggleEditMode}
        onPageAdd={addPage}
        onPageRemove={removePage}
        onPageChange={updatePage}
        onDashboardChange={updateDashboardFields}
        onPanelChange={updatePanel}
        onPanelEditCommit={commitPanelEditSession}
        onPanelEditCancel={cancelPanelEditSession}
        onSectionChange={updateSection}
        onSectionInsert={insertSection}
        onVantaBackgroundChange={updateVantaBackground}
        onPanelAdd={addPanel}
        onPanelRemove={removePanel}
        onPanelReorder={reorderPanel}
        onImportConfig={importConfig}
        onExportConfig={exportConfig}
        onExportPackageDefault={exportPackageDefaultConfig}
        onUploadCsv={uploadCsvSource}
        onResetEditSession={cancelEditSession}
      />
    </>
  );
}

function loadDeviceLayout() {
  const layout = localStorage.getItem(DEVICE_LAYOUT_STORAGE_KEY);
  return ["auto", "tablet", "phone"].includes(layout) ? layout : "auto";
}

function CompatibilityReportModal({ reports, onClose }) {
  return (
    <div className="compatibility-modal-backdrop" role="dialog" aria-modal="true" aria-labelledby="compatibility-report-title">
      <section className="compatibility-modal">
        <header>
          <div>
            <p className="eyebrow">CSV compatibility check</p>
            <h2 id="compatibility-report-title">Chart settings were checked against source data</h2>
          </div>
          <button type="button" className="secondary" onClick={onClose}>Close</button>
        </header>
        <p>
          One or more source CSV files changed compared with saved chart settings. The dashboard applied safe fallback settings where possible.
          Review the affected charts below.
        </p>
        <div className="compatibility-report-list">
          {reports.map((report) => (
            <article key={`${report.panelId}-${report.dataSource}`} className="compatibility-report-card">
              <strong>{report.title}</strong>
              <span>{report.page} / {report.section}</span>
              <small>Data source: {report.dataSource}</small>
              <ul>
                {report.changes.map((change) => <li key={change}>{change}</li>)}
              </ul>
            </article>
          ))}
        </div>
      </section>
    </div>
  );
}

function sanitizeDashboardConfig(config) {
  if (!config) {
    return config;
  }
  return {
    ...config,
    globalStyles: sanitizeGlobalStyles(config.globalStyles),
    vantaBackground: sanitizeVantaSettings(config.vantaBackground),
  };
}

function sanitizeGlobalStyles(styles) {
  const panelColors = {
    ...DEFAULT_GLOBAL_STYLES.panelColors,
    ...(styles?.panelColors ?? {}),
  };
  return {
    ...(styles ?? {}),
    panelColors: {
      panelBackgroundColor: normalizeHexColor(panelColors.panelBackgroundColor, DEFAULT_GLOBAL_STYLES.panelColors.panelBackgroundColor),
      panelBorderColor: normalizeHexColor(panelColors.panelBorderColor, DEFAULT_GLOBAL_STYLES.panelColors.panelBorderColor),
      chartAreaColor: normalizeHexColor(panelColors.chartAreaColor, DEFAULT_GLOBAL_STYLES.panelColors.chartAreaColor),
      chartAreaBorderColor: normalizeHexColor(panelColors.chartAreaBorderColor, DEFAULT_GLOBAL_STYLES.panelColors.chartAreaBorderColor),
      editHighlightColor: normalizeHexColor(panelColors.editHighlightColor, DEFAULT_GLOBAL_STYLES.panelColors.editHighlightColor),
      multiSelectHighlightColor: normalizeHexColor(panelColors.multiSelectHighlightColor, DEFAULT_GLOBAL_STYLES.panelColors.multiSelectHighlightColor),
    },
  };
}

function sanitizeVantaSettings(settings) {
  const merged = { ...DEFAULT_VANTA_BACKGROUND, ...(settings ?? {}) };
  return {
    backgroundColor: normalizeHexColor(merged.backgroundColor, DEFAULT_VANTA_BACKGROUND.backgroundColor),
    networkColor: normalizeHexColor(merged.networkColor, DEFAULT_VANTA_BACKGROUND.networkColor),
    mouseControls: Boolean(merged.mouseControls),
    touchControls: Boolean(merged.touchControls),
    points: clampNumber(merged.points, ...VANTA_LIMITS.points),
    maxDistance: clampNumber(merged.maxDistance, ...VANTA_LIMITS.maxDistance),
    spacing: clampNumber(merged.spacing, ...VANTA_LIMITS.spacing),
    speed: clampNumber(merged.speed, ...VANTA_LIMITS.speed),
  };
}

function clampNumber(value, min, max) {
  const number = Number(value);
  if (!Number.isFinite(number)) {
    return min;
  }
  return Math.min(Math.max(number, min), max);
}

function normalizeHexColor(value, fallback) {
  const color = String(value ?? "");
  return /^#[0-9a-f]{6}$/i.test(color) ? color : fallback;
}

function loadSavedConfig() {
  const saved = localStorage.getItem(STORAGE_KEY);
  if (!saved) {
    return null;
  }
  return JSON.parse(saved);
}

function mergeDefaultConfigAdditions(savedConfig, defaultConfig) {
  if (!savedConfig) {
    return null;
  }
  const {
    dataSources: savedDataSources,
    pages: savedPages,
    loadedData: _savedLoadedData,
    ...savedTopLevel
  } = structuredClone(savedConfig);
  const {
    dataSources: defaultDataSources,
    pages: defaultPages,
    loadedData: _defaultLoadedData,
    ...defaultTopLevel
  } = structuredClone(defaultConfig ?? {});

  return {
    ...defaultTopLevel,
    ...savedTopLevel,
    dataSources: mergeDataSources(defaultDataSources, savedDataSources),
    pages: mergePages(defaultPages ?? [], savedPages ?? []),
  };
}

function mergeDataSources(defaultDataSources = {}, savedDataSources = {}) {
  const merged = { ...defaultDataSources };
  Object.entries(savedDataSources ?? {}).forEach(([sourceId, source]) => {
    const isUploadedSource = source?.type === "uploadedCsv";
    const isSavedOnlySource = !Object.prototype.hasOwnProperty.call(defaultDataSources, sourceId);
    if (isUploadedSource || isSavedOnlySource) {
      merged[sourceId] = source;
    }
  });
  return merged;
}

function mergePages(defaultPages, savedPages) {
  const savedById = new Map(savedPages.map((page) => [page.id, page]));
  const defaultIds = new Set(defaultPages.map((page) => page.id));
  return [
    ...defaultPages.map((defaultPage) => mergePage(defaultPage, savedById.get(defaultPage.id))),
    ...savedPages.filter((savedPage) => !defaultIds.has(savedPage.id)),
  ];
}

function mergePage(defaultPage, savedPage) {
  if (!savedPage) {
    return defaultPage;
  }
  const { sections: defaultSections = [], ...defaultRest } = defaultPage;
  const { sections: savedSections = [], ...savedRest } = savedPage;
  return {
    ...defaultRest,
    ...savedRest,
    sections: mergeSections(defaultSections, savedSections),
  };
}

function mergeSections(defaultSections, savedSections) {
  const savedById = new Map(savedSections.map((section) => [section.id, section]));
  const defaultIds = new Set(defaultSections.map((section) => section.id));
  return [
    ...defaultSections.map((defaultSection) => mergeSection(defaultSection, savedById.get(defaultSection.id))),
    ...savedSections.filter((savedSection) => !defaultIds.has(savedSection.id)),
  ];
}

function mergeSection(defaultSection, savedSection) {
  if (!savedSection) {
    return defaultSection;
  }
  const { panels: defaultPanels = [], ...defaultRest } = defaultSection;
  const { panels: savedPanels = [], ...savedRest } = savedSection;
  return {
    ...defaultRest,
    ...savedRest,
    panels: mergePanels(defaultPanels, savedPanels),
  };
}

function mergePanels(defaultPanels, savedPanels) {
  const defaultById = new Map(defaultPanels.map((panel) => [panel.id, panel]));
  const mergedPanels = savedPanels.map((savedPanel) => {
    const defaultPanel = defaultById.get(savedPanel.id);
    return defaultPanel ? mergePanelConfig(defaultPanel, savedPanel) : savedPanel;
  });
  const mergedPanelIds = new Set(mergedPanels.map((panel) => panel.id));

  defaultPanels.forEach((defaultPanel, index) => {
    if (mergedPanelIds.has(defaultPanel.id)) {
      return;
    }
    const previousDefaultPanel = defaultPanels
      .slice(0, index)
      .reverse()
      .find((panel) => mergedPanelIds.has(panel.id));
    const previousIndex = previousDefaultPanel
      ? mergedPanels.findIndex((panel) => panel.id === previousDefaultPanel.id)
      : -1;
    mergedPanels.splice(previousIndex + 1, 0, defaultPanel);
    mergedPanelIds.add(defaultPanel.id);
  });

  return mergedPanels;
}

function mergePanelConfig(defaultPanel, savedPanel) {
  const mergedPanel = { ...defaultPanel, ...savedPanel };
  const defaultVersion = Number(defaultPanel.configVersion ?? 0);
  const savedVersion = Number(savedPanel.configVersion ?? 0);
  const versionedFields = Array.isArray(defaultPanel.configVersionedFields)
    ? defaultPanel.configVersionedFields
    : [];

  if (defaultVersion > savedVersion && versionedFields.length > 0) {
    for (const field of versionedFields) {
      if (Object.prototype.hasOwnProperty.call(defaultPanel, field)) {
        mergedPanel[field] = structuredClone(defaultPanel[field]);
      } else {
        delete mergedPanel[field];
      }
    }
    mergedPanel.configVersion = defaultVersion;
    mergedPanel.configVersionedFields = structuredClone(versionedFields);
  }

  return mergedPanel;
}

function stripRuntimeFields(dashboard) {
  const { loadedData, ...config } = dashboard;
  return config;
}

function sameDataSources(left, right) {
  return JSON.stringify(left ?? {}) === JSON.stringify(right ?? {});
}

function updatePageInConfig(config, pageId, updater) {
  return {
    ...config,
    pages: config.pages.map((page) => (page.id === pageId ? updater(page) : page)),
  };
}

function updateSectionInConfig(config, pageId, sectionId, updates) {
  return updatePageInConfig(config, pageId, (page) => ({
    ...page,
    sections: page.sections.map((section) =>
      section.id === sectionId ? { ...section, ...updates } : section,
    ),
  }));
}

function insertSectionAtPanelInConfig(config, pageId, sectionId, panelId, newSection) {
  return updatePageInConfig(config, pageId, (page) => ({
    ...page,
    sections: page.sections.flatMap((section) => {
      if (section.id !== sectionId) {
        return [section];
      }
      const startIndex = section.panels.findIndex((panel) => panel.id === panelId);
      if (startIndex <= 0) {
        return [{ ...section, title: newSection.title, description: newSection.description }];
      }
      return [
        { ...section, panels: section.panels.slice(0, startIndex) },
        {
          id: newSection.id,
          title: newSection.title,
          description: newSection.description,
          layout: section.layout,
          filters: section.filters,
          panels: section.panels.slice(startIndex),
        },
      ];
    }),
  }));
}

function updatePanelInConfig(config, panelId, updates) {
  return {
    ...config,
    pages: config.pages.map((page) => ({
      ...page,
      sections: page.sections.map((section) => ({
        ...section,
        panels: section.panels.map((panel) =>
          panel.id === panelId ? { ...panel, ...updates } : panel,
        ),
      })),
    })),
  };
}

function addPageToConfig(config, page) {
  return {
    ...config,
    pages: [...config.pages, page],
  };
}

function removePageFromConfig(config, pageId) {
  if ((config.pages ?? []).length <= 1) {
    return config;
  }

  return {
    ...config,
    pages: config.pages.filter((page) => page.id !== pageId),
  };
}

function addPanelToConfig(config, pageId, sectionId, panel) {
  return updatePageInConfig(config, pageId, (page) => ({
    ...page,
    sections: page.sections.map((section) => {
      if (section.id !== sectionId) {
        return section;
      }
      return {
        ...section,
        panels: [panel ?? createPanelFromSection(section, config), ...section.panels],
      };
    }),
  }));
}

function removePanelFromConfig(config, panelId) {
  return {
    ...config,
    pages: config.pages.map((page) => ({
      ...page,
      sections: page.sections.map((section) => ({
        ...section,
        panels: section.panels.filter((panel) => panel.id !== panelId),
      })),
    })),
  };
}

function reorderPanelInConfig(config, sourcePanelId, targetPanelId) {
  const source = findPanelLocation(config, sourcePanelId);
  const target = findPanelLocation(config, targetPanelId);
  if (!source || !target) {
    return config;
  }

  const movedPanel = config.pages[source.pageIndex].sections[source.sectionIndex].panels[source.panelIndex];
  const nextConfig = structuredClone(config);
  nextConfig.pages[source.pageIndex].sections[source.sectionIndex].panels.splice(source.panelIndex, 1);

  const targetSection = nextConfig.pages[target.pageIndex].sections[target.sectionIndex];
  const adjustedTargetIndex =
    source.pageIndex === target.pageIndex &&
    source.sectionIndex === target.sectionIndex &&
    source.panelIndex < target.panelIndex
      ? target.panelIndex - 1
      : target.panelIndex;
  targetSection.panels.splice(adjustedTargetIndex, 0, movedPanel);
  return nextConfig;
}

function findPanelLocation(config, panelId) {
  for (let pageIndex = 0; pageIndex < config.pages.length; pageIndex += 1) {
    const page = config.pages[pageIndex];
    for (let sectionIndex = 0; sectionIndex < page.sections.length; sectionIndex += 1) {
      const panelIndex = page.sections[sectionIndex].panels.findIndex((panel) => panel.id === panelId);
      if (panelIndex !== -1) {
        return { pageIndex, sectionIndex, panelIndex };
      }
    }
  }
  return null;
}

function createPanelFromSection(section, config) {
  const template = section.panels.find((panel) => panel.dataSource && panel.x) ?? section.panels[0];
  const dataSource = template?.dataSource ?? Object.keys(config.dataSources ?? {}).find((source) => !source.startsWith("geo_"));
  const baseSeries = template?.series?.length
    ? template.series.map((series, index) => ({
        ...series,
        name: index === 0 ? "New series" : series.name,
      }))
    : [{ name: "New series", y: template?.seriesFrom?.valueField ?? "value", color: "#043BCB" }];

  return {
    id: `new_panel_${Date.now()}`,
    title: "New chart",
    type: "line",
    dataSource,
    x: template?.x ?? "date",
    size: "normal",
    legend: true,
    yScale: "zero",
    xAxisMode: looksLikeDateColumn(template?.x) ? "date" : "category",
    colorScheme: "manual",
    series: baseSeries,
  };
}

function uniqueDataSourceId(config, fileName) {
  const baseName = String(fileName ?? "uploaded-data")
    .replace(/\.[^.]+$/, "")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "") || "uploaded_data";
  let sourceId = `uploaded_${baseName}`;
  let counter = 2;
  while (config.dataSources?.[sourceId]) {
    sourceId = `uploaded_${baseName}_${counter}`;
    counter += 1;
  }
  return sourceId;
}

function createImagePanel() {
  return {
    id: `new_image_panel_${Date.now()}`,
    title: "New image",
    type: "image",
    size: "normal",
    imageSrc: "",
    imageFit: "contain",
    infoSource: "Uploaded image",
  };
}

function looksLikeDateColumn(column) {
  return String(column ?? "").toLowerCase().includes("date");
}

function dateStamp() {
  const date = new Date();
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}${month}${day}`;
}

function initializeVantaBackground(settings = DEFAULT_VANTA_BACKGROUND) {
  const element = document.getElementById("vanta-background");
  if (!element || !window.VANTA?.NET || !window.THREE) {
    return null;
  }
  const mergedSettings = sanitizeVantaSettings(settings);
  const effect = window.VANTA.NET({
    el: element,
    mouseControls: mergedSettings.mouseControls,
    touchControls: mergedSettings.touchControls,
    gyroControls: false,
    minHeight: 200.0,
    minWidth: 200.0,
    scale: 1.0,
    scaleMobile: 1.0,
    color: hexToNumber(mergedSettings.networkColor),
    backgroundColor: hexToNumber(mergedSettings.backgroundColor),
    points: Number(mergedSettings.points ?? DEFAULT_VANTA_BACKGROUND.points),
    maxDistance: Number(mergedSettings.maxDistance ?? DEFAULT_VANTA_BACKGROUND.maxDistance),
    spacing: Number(mergedSettings.spacing ?? DEFAULT_VANTA_BACKGROUND.spacing),
    speed: Number(mergedSettings.speed ?? DEFAULT_VANTA_BACKGROUND.speed),
  });
  applyVantaNetSpeed(effect, Number(mergedSettings.speed ?? DEFAULT_VANTA_BACKGROUND.speed));
  window.setTimeout(() => applyVantaNetSpeed(effect, Number(mergedSettings.speed ?? DEFAULT_VANTA_BACKGROUND.speed)), 120);
  return effect;
}

function applyVantaNetSpeed(effect, speed) {
  const multiplier = Number.isFinite(speed) ? speed : DEFAULT_VANTA_BACKGROUND.speed;
  window.requestAnimationFrame(() => {
    for (const point of effect?.points ?? []) {
      if (point._simexBaseR === undefined) {
        point._simexBaseR = point.r;
      }
      point.r = point._simexBaseR * multiplier;
    }
  });
}

function hexToNumber(hexColor) {
  const normalized = String(hexColor ?? "").replace("#", "");
  const parsed = Number.parseInt(normalized, 16);
  return Number.isFinite(parsed) ? parsed : 0xf1a1ad;
}






