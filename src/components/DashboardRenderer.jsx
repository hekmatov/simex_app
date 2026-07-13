import React from "react";

import AddChartWizard from "./AddChartWizard.jsx";
import ColorField from "./ColorField.jsx";
import DeviceLayoutControl from "./DeviceLayoutControl.jsx";
import InstallDashboardPrompt from "./InstallDashboardPrompt.jsx";
import ChartPanel, { PanelBody } from "./ChartPanel.jsx";
import ChartSettingsPanel from "./ChartSettingsPanelV2.jsx";
import LayoutGrid from "./LayoutGrid.jsx";

export default function DashboardRenderer({
  dashboard,
  deviceLayout,
  onDeviceLayoutChange,
  editMode,
  onToggleEditMode,
  onPageAdd,
  onPageRemove,
  onPageChange,
  onDashboardChange,
  onPanelChange,
  onPanelEditCommit,
  onPanelEditCancel,
  onSectionChange,
  onSectionInsert,
  onVantaBackgroundChange,
  onPanelAdd,
  onPanelRemove,
  onPanelReorder,
  onImportConfig,
  onExportConfig,
  onExportPackageDefault,
  onUploadCsv,
  onResetEditSession,
}) {
  const [activePageId, setActivePageId] = React.useState(
    dashboard.pages?.[0]?.id ?? "dashboard",
  );
  const [selectedPanelId, setSelectedPanelId] = React.useState(null);
  const [draggingPanelId, setDraggingPanelId] = React.useState(null);
  const [dragOverPanelId, setDragOverPanelId] = React.useState(null);
  const [multiSelectMode, setMultiSelectMode] = React.useState(false);
  const [multiPanelIds, setMultiPanelIds] = React.useState([]);
  const [multiFullscreenOpen, setMultiFullscreenOpen] = React.useState(false);
  const [multiFullscreenLayout, setMultiFullscreenLayout] = React.useState("sideBySide");
  const importInputRef = React.useRef(null);
  const csvInputRef = React.useRef(null);
  const [showVantaSettings, setShowVantaSettings] = React.useState(false);
  const [backgroundDraft, setBackgroundDraft] = React.useState(() => sanitizeVantaSettings(dashboard.vantaBackground));
  const [selectedPanelDraft, setSelectedPanelDraft] = React.useState(null);
  const [chartWizardTarget, setChartWizardTarget] = React.useState(null);
  const [chartEditBaseline, setChartEditBaseline] = React.useState(null);
  const [dashboardDraft, setDashboardDraft] = React.useState(() => dashboardTextDraftFromDashboard(dashboard));
  const [pageDrafts, setPageDrafts] = React.useState({});
  const [sectionDrafts, setSectionDrafts] = React.useState({});
  const dashboardDebounceRef = React.useRef(null);
  const pageDebounceRef = React.useRef(null);
  const sectionDebounceRef = React.useRef(null);
  const [filterValues, setFilterValues] = React.useState(() =>
    collectFilterDefaults(dashboard),
  );

  React.useEffect(() => {
    setFilterValues((current) => ({
      ...collectFilterDefaults(dashboard),
      ...current,
    }));
  }, [dashboard]);

  const activePage =
    dashboard.pages.find((page) => page.id === activePageId) ?? dashboard.pages[0];
  const selectedPanel = findPanel(dashboard, selectedPanelId);
  const globalPanelColors = React.useMemo(() => resolveGlobalPanelColors(dashboard), [dashboard.globalStyles]);
  const selectedPanelData = dashboard.loadedData[selectedPanel?.dataSource] ?? [];
  const selectedPanelColumns = Array.isArray(selectedPanelData)
    ? Object.keys(selectedPanelData[0] ?? {})
    : [];

  React.useEffect(() => {
    setSelectedPanelDraft(selectedPanel ? structuredClone(selectedPanel) : null);
  }, [selectedPanel?.id]);

  React.useEffect(() => {
    if (!editMode) {
      setShowVantaSettings(false);
      setSelectedPanelId(null);
    }
  }, [editMode]);

  React.useEffect(() => {
    setDashboardDraft(dashboardTextDraftFromDashboard(dashboard));
  }, [dashboard.programLabel, dashboard.scenarioLabel, dashboard.lastUpdated]);

  function changeFilter(filter, value) {
    setFilterValues((current) => ({
      ...current,
      [filter.id]: value,
    }));
  }

  function removePanel(panelId) {
    setSelectedPanelId((current) => (current === panelId ? null : current));
    onPanelRemove(panelId);
  }

  function handlePanelDragStart(event, panelId) {
    setDraggingPanelId(panelId);
    event.dataTransfer.effectAllowed = "move";
    event.dataTransfer.setData("text/plain", panelId);
  }

  function handlePanelDragOver(event, panelId) {
    if (!editMode || !draggingPanelId) {
      return;
    }
    event.preventDefault();
    event.dataTransfer.dropEffect = "move";
    if (draggingPanelId === panelId) {
      setDragOverPanelId(null);
      return;
    }
    setDragOverPanelId(panelId);
  }

  function handlePanelDrop(event, targetPanelId) {
    event.preventDefault();
    const sourcePanelId = event.dataTransfer.getData("text/plain") || draggingPanelId;
    onPanelReorder(sourcePanelId, targetPanelId);
    setDraggingPanelId(null);
    setDragOverPanelId(null);
  }

  function clearDragState() {
    setDraggingPanelId(null);
    setDragOverPanelId(null);
  }

  function handlePointerDragState(sourcePanelId, targetPanelId) {
    setDraggingPanelId(sourcePanelId);
    setDragOverPanelId(targetPanelId);
  }

  function startMultiFullscreenSelection(panelId) {
    setMultiSelectMode(true);
    setMultiPanelIds((current) => (current.includes(panelId) ? current : [...current, panelId].slice(0, 4)));
  }

  function toggleMultiPanel(panelId) {
    setMultiPanelIds((current) => {
      if (current.includes(panelId)) {
        return current.filter((id) => id !== panelId);
      }
      if (current.length >= 4) {
        return current;
      }
      return [...current, panelId];
    });
  }

  function closeMultiFullscreen() {
    setMultiFullscreenOpen(false);
  }

  function cancelMultiSelection() {
    setMultiSelectMode(false);
    setMultiPanelIds([]);
    setMultiFullscreenOpen(false);
  }

  function addPage() {
    const label = window.prompt("Name this new tab", "New tab");
    if (!label) {
      return;
    }

    const pageId = uniquePageId(dashboard, label);
    onPageAdd({
      id: pageId,
      label,
      title: label,
      description: "New dashboard page.",
      sections: [
        {
          id: `${pageId}_section`,
          title: "New section",
          description: "",
          panels: [],
        },
      ],
    });
    setActivePageId(pageId);
    setSelectedPanelId(null);
  }

  function openBackgroundSettings() {
    setBackgroundDraft(sanitizeVantaSettings(dashboard.vantaBackground));
    setShowVantaSettings(true);
  }

  function saveBackgroundSettings() {
    onVantaBackgroundChange(sanitizeVantaSettings(backgroundDraft));
    setShowVantaSettings(false);
  }

  function resetBackgroundSettings() {
    const defaults = sanitizeVantaSettings();
    setBackgroundDraft(defaults);
    onVantaBackgroundChange(defaults);
    setShowVantaSettings(false);
  }

  function changeBackgroundDraft(updates) {
    setBackgroundDraft((current) => ({ ...current, ...updates }));
  }

  function changeSelectedPanel(updates) {
    const base = selectedPanelDraft ?? selectedPanel;
    if (!base) {
      return;
    }
    const nextPanel = { ...base, ...updates };
    setSelectedPanelDraft(nextPanel);
    onPanelChange(nextPanel.id, diffPanel(base, nextPanel), { commitToEditSession: false });
  }

  function saveSelectedPanel() {
    onPanelEditCommit(dashboardWithCurrentDrafts());
    setChartEditBaseline(null);
    setSelectedPanelId(null);
  }

  function cancelSelectedPanel() {
    if (chartEditBaseline) {
      onPanelEditCancel(chartEditBaseline);
    }
    setChartEditBaseline(null);
    setSelectedPanelId(null);
  }

  function changePage(pageId, updates) {
    setPageDrafts((current) => ({
      ...current,
      [pageId]: { ...(current[pageId] ?? pageDraftFromPage(dashboard.pages.find((page) => page.id === pageId))), ...updates },
    }));
    window.clearTimeout(pageDebounceRef.current);
    const basePage = pageDrafts[pageId] ?? pageDraftFromPage(dashboard.pages.find((page) => page.id === pageId));
    const nextDraft = { ...basePage, ...updates };
    pageDebounceRef.current = window.setTimeout(() => onPageChange(pageId, nextDraft), 650);
  }

  function changeDashboardText(updates) {
    const nextDraft = { ...dashboardDraft, ...updates };
    setDashboardDraft(nextDraft);
    window.clearTimeout(dashboardDebounceRef.current);
    dashboardDebounceRef.current = window.setTimeout(() => onDashboardChange(nextDraft), 650);
  }

  function changeSection(section, updates) {
    const baseSection = sectionDrafts[section.id] ?? sectionDraftFromSection(section);
    const nextDraft = { ...baseSection, ...updates };
    setSectionDrafts((current) => ({
      ...current,
      [section.id]: nextDraft,
    }));
    window.clearTimeout(sectionDebounceRef.current);
    sectionDebounceRef.current = window.setTimeout(() => {
      onSectionChange(activePage.id, section.id, nextDraft);
    }, 650);
  }

  function applyBackgroundSettings() {
    onVantaBackgroundChange(sanitizeVantaSettings(backgroundDraft));
  }

  function changeGlobalPanelColors(updates) {
    onDashboardChange({
      globalStyles: {
        ...(dashboard.globalStyles ?? {}),
        panelColors: {
          ...globalPanelColors,
          ...updates,
        },
      },
    });
  }

  function startSectionAtPanel(section, panel) {
    const title = window.prompt("Section title", "New section");
    if (!title) {
      return;
    }
    const description = window.prompt("Section subtext", "") ?? "";
    onSectionInsert(activePage.id, section.id, panel.id, {
      id: `${section.id}_${Date.now()}`,
      title,
      description,
    });
  }

  function removeSectionTitle(section) {
    onSectionChange(activePage.id, section.id, { title: "", description: "" });
  }

  function removeActivePage() {
    if ((dashboard.pages ?? []).length <= 1) {
      return;
    }
    if (!window.confirm(`Remove the "${activePage.label}" tab?`)) {
      return;
    }

    const activeIndex = dashboard.pages.findIndex((page) => page.id === activePage.id);
    const fallbackPage = dashboard.pages[activeIndex - 1] ?? dashboard.pages[activeIndex + 1] ?? dashboard.pages[0];
    onPageRemove(activePage.id);
    setActivePageId(fallbackPage.id);
    setSelectedPanelId(null);
  }

  function openPanelEditor(panelId) {
    if (!chartEditBaseline) {
      setChartEditBaseline(dashboardWithCurrentDrafts());
    }
    setSelectedPanelId(panelId);
  }

  function saveEditMode() {
    if (chartEditBaseline) {
      onPanelEditCommit(dashboardWithCurrentDrafts());
      setChartEditBaseline(null);
    }
    onToggleEditMode();
  }

  function dashboardWithCurrentDrafts() {
    const nextDashboard = structuredClone(dashboard);
    Object.assign(nextDashboard, dashboardDraft);

    nextDashboard.pages = (nextDashboard.pages ?? []).map((page) => {
      const pageDraft = pageDrafts[page.id];
      const nextPage = pageDraft ? { ...page, ...pageDraft } : page;
      return {
        ...nextPage,
        sections: (nextPage.sections ?? []).map((section) => {
          const sectionDraft = sectionDrafts[section.id];
          const nextSection = sectionDraft ? { ...section, ...sectionDraft } : section;
          return {
            ...nextSection,
            panels: (nextSection.panels ?? []).map((panel) =>
              selectedPanelDraft && panel.id === selectedPanelDraft.id ? selectedPanelDraft : panel,
            ),
          };
        }),
      };
    });

    return nextDashboard;
  }

  if (editMode && showVantaSettings) {
    return (
      <main className="app-shell background-editor-shell">
        <section className="background-editor-bar">
          <VantaSettingsPanel settings={backgroundDraft} onChange={changeBackgroundDraft} />
          <div className="background-editor-actions">
            <button type="button" className="secondary" onClick={applyBackgroundSettings}>Apply</button>
            <button type="button" onClick={saveBackgroundSettings}>Save</button>
            <button type="button" className="secondary" onClick={resetBackgroundSettings}>Reset</button>
          </div>
        </section>
      </main>
    );
  }

  return (
    <main className="app-shell" data-device-layout={deviceLayout}>
      <header className="dashboard-header">
        <div className="dashboard-brand-block">
          <img className="pdpc-header-mark" src={`${import.meta.env.BASE_URL}assets/pdpc-mark.png`} alt="" />
          <div>
            <p className="eyebrow">{dashboardDraft.programLabel}</p>
            {editMode ? (
              <div className="header-text-edit-fields">
                <input
                  aria-label="Program label"
                  value={dashboardDraft.programLabel ?? ""}
                  onChange={(event) => changeDashboardText({ programLabel: event.target.value })}
                />
                <input
                  aria-label="Page title"
                  value={(pageDrafts[activePage.id]?.title ?? activePage?.title) ?? dashboard.title}
                  onChange={(event) => changePage(activePage.id, { title: event.target.value })}
                />
                <input
                  aria-label="Page subtitle"
                  value={(pageDrafts[activePage.id]?.description ?? activePage?.description) ?? dashboard.description}
                  onChange={(event) => changePage(activePage.id, { description: event.target.value })}
                />
              </div>
            ) : (
              <>
                <h1>{activePage?.title ?? dashboard.title}</h1>
                <p className="subtitle">{activePage?.description ?? dashboard.description}</p>
              </>
            )}
          </div>
        </div>
        <div className="header-right-rail">
          <dl className="dashboard-meta">
            <div>
              <dt>Scenario</dt>
              <dd>
                {editMode ? (
                  <input value={dashboardDraft.scenarioLabel ?? ""} onChange={(event) => changeDashboardText({ scenarioLabel: event.target.value })} />
                ) : (
                  dashboard.scenarioLabel
                )}
              </dd>
            </div>
            <div>
              <dt>Updated</dt>
              <dd>
                {editMode ? (
                  <input value={dashboardDraft.lastUpdated ?? ""} onChange={(event) => changeDashboardText({ lastUpdated: event.target.value })} />
                ) : (
                  dashboard.lastUpdated
                )}
              </dd>
            </div>
          </dl>
        </div>
        <div className="header-floating-actions">
          <button
            type="button"
            className="header-edit-floating-button"
            aria-label={editMode ? "Save edit mode" : "Open edit mode"}
            title={editMode ? "Save" : "Edit mode"}
            onClick={editMode ? saveEditMode : onToggleEditMode}
          >
            {editMode ? "Save" : <span className="edit-sliders-icon" aria-hidden="true" />}
          </button>
        </div>
      </header>
      {editMode && (
        <section className="edit-command-banner" aria-label="Edit commands">
          <div className="edit-command-title">
            <p className="eyebrow">Mode</p>
            <h2>Edit mode</h2>
          </div>
          <div className="header-edit-controls">
            <div className="tab-edit-controls">
              <button type="button" onClick={addPage}>Add tab</button>
              <button type="button" className="secondary" disabled={(dashboard.pages ?? []).length <= 1} onClick={removeActivePage}>Remove tab</button>
            </div>
            <button type="button" onClick={() => importInputRef.current?.click()}>Import bundle</button>
            <button type="button" onClick={() => onExportConfig(dashboardWithCurrentDrafts())}>Export bundle</button>
            <button type="button" onClick={() => onExportPackageDefault(dashboardWithCurrentDrafts())}>Export package default</button>
            <button type="button" className="secondary" onClick={() => csvInputRef.current?.click()}>Upload CSV</button>
            <GlobalPanelColorControls colors={globalPanelColors} onChange={changeGlobalPanelColors} />
            <button type="button" className="secondary" onClick={openBackgroundSettings}>Background</button>
            <button type="button" className="secondary" onClick={onResetEditSession}>Reset edits</button>
            {multiSelectMode && (
              <>
                <button type="button" disabled={multiPanelIds.length < 2} onClick={() => setMultiFullscreenOpen(true)}>Multi-fullscreen ({multiPanelIds.length})</button>
                <button type="button" className="secondary" onClick={cancelMultiSelection}>Cancel multi</button>
              </>
            )}
            <input
              ref={importInputRef}
              className="visually-hidden"
              type="file"
              accept="application/json,.json"
              onChange={(event) => {
                onImportConfig(event.target.files?.[0]);
                event.target.value = "";
              }}
            />
            <input
              ref={csvInputRef}
              className="visually-hidden"
              type="file"
              accept=".csv,text/csv"
              onChange={(event) => {
                onUploadCsv(event.target.files?.[0]);
                event.target.value = "";
              }}
            />
          </div>
        </section>
      )}

      {multiSelectMode && !editMode && (
        <section className="multi-select-banner" aria-label="Multi-fullscreen selection">
          <strong>{multiPanelIds.length} selected</strong>
          <button type="button" disabled={multiPanelIds.length < 2} onClick={() => setMultiFullscreenOpen(true)}>Multi-fullscreen</button>
          <button type="button" className="secondary" onClick={cancelMultiSelection}>Cancel</button>
        </section>
      )}

      <nav className="page-tabs" aria-label="Dashboard pages">
        {dashboard.pages.map((page) => (
          editMode ? (
            <label className={`page-tab-edit ${page.id === activePage.id ? "active" : ""}`} key={page.id}>
              <button
                type="button"
                className={page.id === activePage.id ? "active" : "secondary"}
                onClick={() => {
                  setActivePageId(page.id);
                  setSelectedPanelId(null);
                }}
              >
                Open
              </button>
              <input
                value={(pageDrafts[page.id]?.label ?? page.label) ?? ""}
                onChange={(event) => changePage(page.id, { label: event.target.value })}
              />
            </label>
          ) : (
            <button
              key={page.id}
              type="button"
              className={page.id === activePage.id ? "active" : "secondary"}
              onClick={() => {
                setActivePageId(page.id);
                setSelectedPanelId(null);
              }}
            >
              {page.label}
            </button>
          )
        ))}
      </nav>

      <section
        className={`dashboard-workspace ${
          editMode && selectedPanel ? "dashboard-workspace-with-settings" : ""
        }`}
      >
        <div className="page-stack">
          {activePage.sections.map((section) => (
            <section className="dashboard-section" key={section.id}>
              <div className="section-header">
                <div className="section-title-block">
                  {editMode ? (
                    <>
                      <label className="section-edit-field">
                        <span>Section title</span>
                        <input
                          value={(sectionDrafts[section.id]?.title ?? section.title) ?? ""}
                          onChange={(event) => changeSection(section, { title: event.target.value })}
                        />
                      </label>
                      <label className="section-edit-field">
                        <span>Section subtext</span>
                        <input
                          value={(sectionDrafts[section.id]?.description ?? section.description) ?? ""}
                          onChange={(event) => changeSection(section, { description: event.target.value })}
                        />
                      </label>
                    </>
                  ) : (
                    <>
                      <h2>{section.title}</h2>
                      {section.description && <p>{section.description}</p>}
                    </>
                  )}
                </div>
                {editMode && (
                  <div className="section-actions">
                    <button
                      type="button"
                      className="secondary add-panel-button"
                      onClick={() => setChartWizardTarget({ pageId: activePage.id, sectionId: section.id })}
                    >
                      Add chart
                    </button>
                    <button
                      type="button"
                      className="secondary add-panel-button"
                      onClick={() => removeSectionTitle(section)}
                    >
                      Remove title
                    </button>
                  </div>
                )}
              </div>
              <LayoutGrid>
                {section.panels.map((panel) => (
                  <ChartPanel
                    key={panel.id}
                    panel={panel}
                    globalPanelColors={globalPanelColors}
                    data={dashboard.loadedData[panel.dataSource]}
                    geoData={dashboard.loadedData[panel.geoSource]}
                    loadedData={dashboard.loadedData}
                    filterDefinitions={section.filters ?? []}
                    filterValues={filterValues}
                    editMode={editMode}
                    isDragging={draggingPanelId === panel.id}
                    isDragTarget={dragOverPanelId === panel.id}
                    isSelected={editMode && selectedPanelId === panel.id}
                    multiSelectMode={multiSelectMode}
                    isMultiSelected={multiPanelIds.includes(panel.id)}
                    onEdit={() => openPanelEditor(panel.id)}
                    onRemove={() => removePanel(panel.id)}
                    onToggleMultiSelect={() => toggleMultiPanel(panel.id)}
                    onFullScreenHold={() => startMultiFullscreenSelection(panel.id)}
                    onPointerDragStateChange={handlePointerDragState}
                    onPointerReorder={(sourcePanelId, targetPanelId) => {
                      onPanelReorder(sourcePanelId, targetPanelId);
                      clearDragState();
                    }}
                    onStartSection={() => startSectionAtPanel(section, panel)}
                  />
                ))}
              </LayoutGrid>
            </section>
          ))}
        </div>

        {editMode && selectedPanel && (
          <ChartSettingsPanel
            panel={selectedPanelDraft ?? selectedPanel}
            dataSources={dashboard.dataSources}
            dataColumns={selectedPanelColumns}
            dataRows={Array.isArray(selectedPanelData) ? selectedPanelData : []}
            globalPanelColors={globalPanelColors}
            onSave={saveSelectedPanel}
            onCancel={cancelSelectedPanel}
            onRemove={() => removePanel(selectedPanel.id)}
            onChange={changeSelectedPanel}
          />
        )}
      </section>
      <AddChartWizard
        open={Boolean(chartWizardTarget)}
        dataSources={dashboard.dataSources}
        loadedData={dashboard.loadedData}
        onClose={() => setChartWizardTarget(null)}
        onCreate={({ panel, uploadedSource }) => onPanelAdd(chartWizardTarget.pageId, chartWizardTarget.sectionId, panel, uploadedSource)}
      />
      {multiFullscreenOpen && (
        <MultiFullscreenOverlay
          dashboard={dashboard}
          panelIds={multiPanelIds}
          layout={multiFullscreenLayout}
          onLayoutChange={setMultiFullscreenLayout}
          onPanelOrderChange={setMultiPanelIds}
          onClose={closeMultiFullscreen}
        />
      )}
      <DashboardFooter dashboard={dashboard} />
      <div className="dashboard-device-tools">
        <InstallDashboardPrompt />
        <DeviceLayoutControl value={deviceLayout} onChange={onDeviceLayoutChange} />
      </div>
    </main>
  );
}

function DashboardFooter({ dashboard }) {
  const feedbackUrl = dashboard.feedbackUrl || feedbackMailtoUrl(dashboard.contactEmail);
  const contactUrl = dashboard.contactEmail ? `mailto:${dashboard.contactEmail}` : null;
  const showRepositoryLink = Boolean(dashboard.repositoryUrl && dashboard.showRepositoryLink);
  return (
    <footer className="dashboard-footer" aria-label="Dashboard information and feedback">
      <div>
        <strong>{dashboard.footerTitle ?? "SimEx Dashboard V2"}</strong>
        <span>{dashboard.footerCredit ?? "Developed by Hekmat Alrouh"}</span>
      </div>
      <nav aria-label="Project links">
        <a href={feedbackUrl} target="_blank" rel="noreferrer">
          Report a bug / request a feature
        </a>
        {contactUrl && <a href={contactUrl}>Contact maintainer</a>}
        {showRepositoryLink && (
          <a href={dashboard.repositoryUrl} target="_blank" rel="noreferrer">
            Project repository
          </a>
        )}
      </nav>
    </footer>
  );
}

function feedbackMailtoUrl(contactEmail) {
  const email = contactEmail || "hekmat.alrouh@live.com";
  return `mailto:${email}?subject=${encodeURIComponent("SimEx Dashboard feedback")}`;
}

function MultiFullscreenOverlay({ dashboard, panelIds, layout, label = "Multi-fullscreen", reason, onLayoutChange, onPanelOrderChange, onClose }) {
  const panels = panelIds.map((panelId) => findPanel(dashboard, panelId)).filter(Boolean);
  const globalPanelColors = resolveGlobalPanelColors(dashboard);
  const layoutOptions = multiLayoutOptions(panels.length);
  const resolvedLayout = layoutOptions.some((option) => option.value === layout) ? layout : layoutOptions[0]?.value;
  if (panels.length === 0) {
    return null;
  }

  return (
    <div className="fullscreen-backdrop" role="dialog" aria-modal="true">
      <article className={`multi-fullscreen-panel multi-fullscreen-${resolvedLayout}`}>
        <div className="multi-fullscreen-controls">
          <div className="multi-fullscreen-title">
            <strong>{label}</strong>
            {reason?.detail && <span>{reason.detail}</span>}
          </div>
          {layoutOptions.map((option) => (
            <button key={option.value} type="button" className={resolvedLayout === option.value ? "active" : "secondary"} onClick={() => onLayoutChange(option.value)} title={option.label}>
              {option.icon}
            </button>
          ))}
          <button type="button" className="secondary" onClick={onClose}>Close</button>
        </div>
        <div className={`multi-fullscreen-grid multi-count-${panels.length} layout-${resolvedLayout}`}>
          {panels.map((panel, index) => (
            <section className={`multi-fullscreen-cell multi-cell-${index + 1}`} key={panel.id}>
              <div className="multi-cell-controls">
                <strong>{index + 1}</strong>
                <button type="button" className="secondary" disabled={index === 0} onClick={() => onPanelOrderChange(moveItem(panelIds, index, index - 1))}>Prev</button>
                <button type="button" className="secondary" disabled={index === panels.length - 1} onClick={() => onPanelOrderChange(moveItem(panelIds, index, index + 1))}>Next</button>
              </div>
              <PanelBody
                panel={panel}
                globalPanelColors={globalPanelColors}
                data={dashboard.loadedData[panel.dataSource] ?? []}
                geoData={dashboard.loadedData[panel.geoSource]}
                loadedData={dashboard.loadedData}
                fullScreen
                multiFullScreen={panels.length > 1}
              />
            </section>
          ))}
        </div>
      </article>
    </div>
  );
}

function GlobalPanelColorControls({ colors, onChange }) {
  return (
    <details className="global-color-controls">
      <summary>Global panel colors</summary>
      <div className="global-color-grid">
        <ColorField label="Panel background" value={colors.panelBackgroundColor} fallback="#f5f8fb" onChange={(color) => onChange({ panelBackgroundColor: color })} />
        <ColorField label="Panel border" value={colors.panelBorderColor} fallback="#d8e2ec" onChange={(color) => onChange({ panelBorderColor: color })} />
        <ColorField label="Chart background" value={colors.chartAreaColor} fallback="#eaf1f6" onChange={(color) => onChange({ chartAreaColor: color })} />
        <ColorField label="Chart border" value={colors.chartAreaBorderColor} fallback="#d8e2ec" onChange={(color) => onChange({ chartAreaBorderColor: color })} />
        <ColorField label="Edit highlight" value={colors.editHighlightColor} fallback="#043bcb" onChange={(color) => onChange({ editHighlightColor: color })} />
        <ColorField label="Multi-fullscreen highlight" value={colors.multiSelectHighlightColor} fallback="#00a676" onChange={(color) => onChange({ multiSelectHighlightColor: color })} />
      </div>
    </details>
  );
}

function moveItem(items, fromIndex, toIndex) {
  const nextItems = [...items];
  const [item] = nextItems.splice(fromIndex, 1);
  nextItems.splice(toIndex, 0, item);
  return nextItems;
}

function multiLayoutOptions(count) {
  if (count === 1) {
    return [{ value: "solo", label: "Single chart", icon: "1" }];
  }
  if (count === 2) {
    return [
      { value: "sideBySide", label: "Side by side", icon: "||" },
      { value: "overUnder", label: "Over-under", icon: "=" },
    ];
  }
  if (count === 3) {
    return [
      { value: "topFocus", label: "One on top", icon: "T" },
      { value: "bottomFocus", label: "One on bottom", icon: "B" },
      { value: "leftFocus", label: "One on left", icon: "L" },
      { value: "rightFocus", label: "One on right", icon: "R" },
    ];
  }
  return [{ value: "grid2x2", label: "2 by 2", icon: "2x2" }];
}

function defaultMultiLayout(count) {
  return multiLayoutOptions(count)[0]?.value ?? "solo";
}

function diffPanel(previous, next) {
  const updates = {};
  for (const key of Object.keys(next)) {
    if (JSON.stringify(previous?.[key]) !== JSON.stringify(next[key])) {
      updates[key] = next[key];
    }
  }
  return updates;
}

function dashboardTextDraftFromDashboard(dashboard) {
  return {
    programLabel: dashboard?.programLabel ?? "",
    scenarioLabel: dashboard?.scenarioLabel ?? "",
    lastUpdated: dashboard?.lastUpdated ?? "",
  };
}

function pageDraftFromPage(page) {
  return {
    label: page?.label ?? "",
    title: page?.title ?? "",
    description: page?.description ?? "",
  };
}

function sectionDraftFromSection(section) {
  return {
    title: section?.title ?? "",
    description: section?.description ?? "",
  };
}

function VantaSettingsPanel({ settings = {}, onChange }) {
  const resolved = sanitizeVantaSettings(settings);
  return (
    <div className="vanta-settings-panel">
      <label>
        Color scheme
        <select
          value={resolved.colorScheme ?? "manual"}
          onChange={(event) => {
            const scheme = event.target.value;
            const colors = backgroundPaletteColors(scheme);
            onChange({
              colorScheme: scheme,
              ...(colors ? { backgroundColor: colors[0], networkColor: colors[1] } : {}),
            });
          }}
        >
          {BACKGROUND_COLOR_SCHEMES.map((scheme) => <option key={scheme.value} value={scheme.value}>{scheme.label}</option>)}
        </select>
      </label>
      <div className="color-scheme-preview" aria-label="Background color scheme preview">
        {(backgroundPaletteColors(resolved.colorScheme) ?? [resolved.backgroundColor, resolved.networkColor]).map((color, index) => <span key={`${color}-${index}`} style={{ backgroundColor: color }} />)}
      </div>
      <ColorField label="Static background" value={resolved.backgroundColor} fallback="#08224a" onChange={(color) => onChange({ backgroundColor: color, colorScheme: "manual" })} />
      <ColorField label="Line/dot color" value={resolved.networkColor} fallback="#9bd3ff" onChange={(color) => onChange({ networkColor: color, colorScheme: "manual" })} />
      <RangeSetting label="Points" value={resolved.points} min={3} max={18} step={1} onChange={(points) => onChange({ points })} />
      <RangeSetting label="Max distance" value={resolved.maxDistance} min={8} max={32} step={1} onChange={(maxDistance) => onChange({ maxDistance })} />
      <RangeSetting label="Spacing" value={resolved.spacing} min={10} max={34} step={1} onChange={(spacing) => onChange({ spacing })} />
      <RangeSetting label="Motion speed" value={resolved.speed} min={0.1} max={2} step={0.05} onChange={(speed) => onChange({ speed })} />
      <label className="checkbox-row"><input type="checkbox" checked={resolved.mouseControls} onChange={(event) => onChange({ mouseControls: event.target.checked })} />Mouse tracking</label>
    </div>
  );
}

function resolveGlobalPanelColors(dashboard) {
  return {
    panelBackgroundColor: dashboard?.globalStyles?.panelColors?.panelBackgroundColor ?? "#f5f8fb",
    panelBorderColor: dashboard?.globalStyles?.panelColors?.panelBorderColor ?? "#d8e2ec",
    chartAreaColor: dashboard?.globalStyles?.panelColors?.chartAreaColor ?? "#eaf1f6",
    chartAreaBorderColor: dashboard?.globalStyles?.panelColors?.chartAreaBorderColor ?? "#d8e2ec",
    editHighlightColor: dashboard?.globalStyles?.panelColors?.editHighlightColor ?? "#043bcb",
    multiSelectHighlightColor: dashboard?.globalStyles?.panelColors?.multiSelectHighlightColor ?? "#00a676",
  };
}

function RangeSetting({ label, value, min, max, step, onChange }) {
  return (
    <label className="range-setting">
      <span>{label}</span>
      <input
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        onChange={(event) => onChange(Number(event.target.value))}
      />
      <output>{value}</output>
    </label>
  );
}

function sanitizeVantaSettings(settings) {
  const merged = {
    backgroundColor: "#f7f9fc",
    networkColor: "#f1a1ad",
    mouseControls: false,
    touchControls: false,
    points: 6,
    maxDistance: 17,
    spacing: 18,
    speed: 0.45,
    ...settings,
  };
  return {
    ...merged,
    points: clampNumber(merged.points, 3, 18),
    maxDistance: clampNumber(merged.maxDistance, 8, 32),
    spacing: clampNumber(merged.spacing, 10, 34),
    speed: clampNumber(merged.speed, 0.1, 2),
  };
}

const BACKGROUND_COLOR_SCHEMES = [
  { value: "manual", label: "Manual colors" },
  { value: "pdpc", label: "PDPC mixed" },
  { value: "redGreen5", label: "Likert red to green" },
  { value: "likertInfographic5", label: "Likert infographic" },
  { value: "caseIntensity", label: "Case intensity" },
  { value: "blueYellow5", label: "Likert blue to yellow" },
  { value: "cool", label: "Cool blues/teals" },
  { value: "warm", label: "Warm alert" },
];

function backgroundPaletteColors(scheme) {
  const palettes = {
    pdpc: ["#08224A", "#043BCB", "#36BDEB", "#2BAA7B", "#F1A1AD"],
    redGreen5: ["#D71920", "#FDAE61", "#FFFFBF", "#A6D96A", "#1A9641"],
    likertInfographic5: ["#3BA64A", "#A7B734", "#F6A21A", "#F47B20", "#DF1F2D"],
    caseIntensity: ["#7FDEC1", "#4496D1", "#043BCB", "#08224A", "#8F1D2C"],
    blueYellow5: ["#2C7BB6", "#ABD9E9", "#FFFFBF", "#FDAE61", "#D7191C"],
    cool: ["#08224A", "#2456A6", "#4496D1", "#007C89", "#7FDEC1"],
    warm: ["#8F1D2C", "#C98700", "#F3D37A", "#E16B5A", "#08224A"],
  };
  return palettes[scheme];
}

function clampNumber(value, min, max) {
  const number = Number(value);
  if (!Number.isFinite(number)) {
    return min;
  }
  return Math.min(Math.max(number, min), max);
}

function FilterControls({ filters, values, onChange }) {
  if (filters.length === 0) {
    return null;
  }

  return (
    <div className="filter-strip">
      {filters.map((filter) => {
        const value = values[filter.id];
        if (filter.type === "dateRange") {
          return (
            <div className="filter-pair" key={filter.id}>
              <span>{filter.label}</span>
              <input
                aria-label={`${filter.label} start`}
                type="date"
                value={value?.start ?? filter.defaultStart}
                min={filter.defaultStart}
                max={filter.defaultEnd}
                onChange={(event) =>
                  onChange(filter, { ...value, start: event.target.value })
                }
              />
              <input
                aria-label={`${filter.label} end`}
                type="date"
                value={value?.end ?? filter.defaultEnd}
                min={filter.defaultStart}
                max={filter.defaultEnd}
                onChange={(event) =>
                  onChange(filter, { ...value, end: event.target.value })
                }
              />
            </div>
          );
        }

        return (
          <label key={filter.id}>
            {filter.label}
            <select
              value={value ?? filter.defaultValue}
              onChange={(event) => onChange(filter, event.target.value)}
            >
              {filter.options.map((option) => (
                <option key={option} value={option}>
                  {option}
                </option>
              ))}
            </select>
          </label>
        );
      })}
    </div>
  );
}

function collectFilterDefaults(dashboard) {
  const defaults = {};
  for (const page of dashboard.pages ?? []) {
    for (const section of page.sections ?? []) {
      for (const filter of section.filters ?? []) {
        defaults[filter.id] =
          filter.type === "dateRange"
            ? { start: filter.defaultStart, end: filter.defaultEnd }
            : filter.defaultValue;
      }
    }
  }
  return defaults;
}

function findPanel(dashboard, panelId) {
  if (!panelId) {
    return null;
  }
  for (const page of dashboard.pages ?? []) {
    for (const section of page.sections ?? []) {
      const panel = section.panels.find((candidate) => candidate.id === panelId);
      if (panel) {
        return panel;
      }
    }
  }
  return null;
}

function uniquePageId(dashboard, label) {
  const base = slugify(label) || "new_page";
  const existing = new Set((dashboard.pages ?? []).map((page) => page.id));
  let candidate = base;
  let counter = 2;
  while (existing.has(candidate)) {
    candidate = `${base}_${counter}`;
    counter += 1;
  }
  return candidate;
}

function slugify(value) {
  return String(value)
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "");
}







