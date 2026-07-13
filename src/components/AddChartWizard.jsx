import React from "react";

import DataBindingEditor from "./DataBindingEditor.jsx";
import { createSuggestedDataBinding, prepareAxisChartData } from "../lib/chartDataModel.js";
import { parseCsvText } from "../lib/loadCsv.js";

const CHART_TYPES = [
  { value: "line", label: "Line" },
  { value: "bar", label: "Bar" },
  { value: "groupedBar", label: "Grouped bar" },
  { value: "stackedBar", label: "Stacked bar" },
  { value: "area", label: "Area" },
  { value: "horizontalBar", label: "Horizontal bar" },
  { value: "horizontalStackedBar", label: "Horizontal stacked bar" },
  { value: "mixed", label: "Mixed bar / line" },
];

export default function AddChartWizard({ open, dataSources, loadedData, onClose, onCreate }) {
  const sourceEntries = React.useMemo(() => Object.entries(dataSources ?? {}).filter(([sourceId]) => (
    Array.isArray(loadedData?.[sourceId])
  )), [dataSources, loadedData]);
  const [step, setStep] = React.useState(0);
  const [sourceId, setSourceId] = React.useState("");
  const [uploadedSource, setUploadedSource] = React.useState(null);
  const [uploadedRows, setUploadedRows] = React.useState([]);
  const [uploadError, setUploadError] = React.useState("");
  const [draft, setDraft] = React.useState(() => defaultPanel());

  const rows = uploadedSource ? uploadedRows : loadedData?.[sourceId] ?? [];
  const prepared = React.useMemo(() => prepareAxisChartData(draft, rows), [draft, rows]);
  const hasErrors = prepared.diagnostics.some((diagnostic) => diagnostic.severity === "error");

  React.useEffect(() => {
    if (!open) return;
    const firstSource = sourceEntries[0]?.[0] ?? "";
    const firstRows = loadedData?.[firstSource] ?? [];
    setStep(0);
    setSourceId(firstSource);
    setUploadedSource(null);
    setUploadedRows([]);
    setUploadError("");
    setDraft({ ...defaultPanel(), dataSource: firstSource, dataBinding: createSuggestedDataBinding(firstRows) });
  }, [open]);

  if (!open) return null;

  function selectSource(nextSourceId) {
    const nextRows = loadedData?.[nextSourceId] ?? [];
    setSourceId(nextSourceId);
    setUploadedSource(null);
    setUploadedRows([]);
    setUploadError("");
    setDraft((current) => ({
      ...current,
      dataSource: nextSourceId,
      dataBinding: createSuggestedDataBinding(nextRows),
    }));
  }

  async function uploadCsv(file) {
    if (!file) return;
    try {
      const csvText = await file.text();
      const parsedRows = parseCsvText(csvText, file.name);
      setUploadedSource({
        type: "uploadedCsv",
        fileName: file.name,
        csvText,
        uploadedAt: new Date().toISOString(),
      });
      setUploadedRows(parsedRows);
      setSourceId("");
      setUploadError("");
      setDraft((current) => ({
        ...current,
        dataSource: "",
        dataBinding: createSuggestedDataBinding(parsedRows),
      }));
    } catch (error) {
      setUploadError(error.message);
    }
  }

  function finish() {
    if ((!sourceId && !uploadedSource) || hasErrors) return;
    onCreate({
      panel: {
        ...draft,
        id: `chart_${Date.now()}`,
        dataSource: sourceId,
      },
      uploadedSource,
    });
    onClose();
  }

  return (
    <div className="chart-wizard-backdrop" role="dialog" aria-modal="true" aria-labelledby="chart-wizard-title">
      <section className="chart-wizard">
        <header className="chart-wizard-header">
          <div>
            <p className="eyebrow">Add new chart</p>
            <h2 id="chart-wizard-title">{stepTitle(step)}</h2>
          </div>
          <button type="button" className="secondary" onClick={onClose}>Close</button>
        </header>

        <ol className="chart-wizard-steps" aria-label="Wizard progress">
          {["Source", "Data roles", "Chart & review"].map((label, index) => (
            <li className={index === step ? "active" : index < step ? "complete" : ""} key={label}>{index + 1}. {label}</li>
          ))}
        </ol>

        <div className="chart-wizard-body">
          {step === 0 && (
            <div className="chart-wizard-source-grid">
              <section className="wizard-choice-card">
                <h3>Use an existing CSV</h3>
                <label>
                  Dashboard data source
                  <select value={sourceId} onChange={(event) => selectSource(event.target.value)}>
                    <option value="">Choose a source</option>
                    {sourceEntries.map(([id, source]) => (
                      <option key={id} value={id}>{dataSourceLabel(id, source)}</option>
                    ))}
                  </select>
                </label>
                {sourceId && <SourceSummary sourceId={sourceId} source={dataSources[sourceId]} rows={rows} />}
              </section>

              <section className="wizard-choice-card">
                <h3>Upload a new CSV</h3>
                <p>The CSV will be embedded in exported bundles, so another user receives the chart and its data together.</p>
                <input type="file" accept=".csv,text/csv" onChange={(event) => uploadCsv(event.target.files?.[0])} />
                {uploadedSource && <SourceSummary sourceId="New upload" source={uploadedSource} rows={uploadedRows} />}
                {uploadError && <p className="wizard-error">{uploadError}</p>}
              </section>
            </div>
          )}

          {step === 1 && (
            <DataBindingEditor
              panel={draft}
              rows={rows}
              onChange={(updates) => setDraft((current) => ({ ...current, ...updates }))}
            />
          )}

          {step === 2 && (
            <div className="chart-wizard-review">
              <section className="wizard-choice-card">
                <h3>Presentation</h3>
                <label>Chart title<input value={draft.title} onChange={(event) => setDraft((current) => ({ ...current, title: event.target.value }))} /></label>
                <label>Chart type<select value={draft.type} onChange={(event) => setDraft((current) => ({ ...current, type: event.target.value }))}>{CHART_TYPES.map((type) => <option key={type.value} value={type.value}>{type.label}</option>)}</select></label>
                <label>Panel size<select value={draft.size} onChange={(event) => setDraft((current) => ({ ...current, size: event.target.value }))}><option value="normal">Normal</option><option value="wide">Wide</option><option value="tall">Tall</option><option value="large">Large</option><option value="half">Half</option></select></label>
                <label className="checkbox-row"><input type="checkbox" checked={draft.legend} onChange={(event) => setDraft((current) => ({ ...current, legend: event.target.checked }))} />Show legend</label>
              </section>

              <section className="wizard-review-card">
                <h3>Data preview</h3>
                <dl>
                  <div><dt>Rows used</dt><dd>{prepared.rowsAfter.toLocaleString()} / {prepared.rowsBefore.toLocaleString()}</dd></div>
                  <div><dt>X-axis</dt><dd>{draft.dataBinding?.x?.field || "Not selected"}</dd></div>
                  <div><dt>Measurements</dt><dd>{(draft.dataBinding?.measures ?? []).map((measure) => measure.label || measure.field).join(", ") || "None"}</dd></div>
                  <div><dt>Clustered by</dt><dd>{draft.dataBinding?.series?.fields?.join(", ") || "Not clustered"}</dd></div>
                  <div><dt>Result</dt><dd>{prepared.xValues.length} x-values · {prepared.series.length} series</dd></div>
                </dl>
                {prepared.diagnostics.length > 0 && <ul className="binding-diagnostics">{prepared.diagnostics.map((diagnostic, index) => <li className={`binding-diagnostic-${diagnostic.severity}`} key={`${diagnostic.code}-${index}`}>{diagnostic.message}</li>)}</ul>}
              </section>
            </div>
          )}
        </div>

        <footer className="chart-wizard-footer">
          <button type="button" className="secondary" disabled={step === 0} onClick={() => setStep((current) => Math.max(0, current - 1))}>Back</button>
          <span>{step === 0 && !sourceId && !uploadedSource ? "Choose or upload a CSV to continue." : ""}</span>
          {step < 2 ? (
            <button type="button" disabled={(step === 0 && !sourceId && !uploadedSource) || (step === 1 && hasErrors)} onClick={() => setStep((current) => current + 1)}>Continue</button>
          ) : (
            <button type="button" disabled={hasErrors || !draft.title.trim()} onClick={finish}>Add chart</button>
          )}
        </footer>
      </section>
    </div>
  );
}

function SourceSummary({ sourceId, source, rows }) {
  return (
    <div className="wizard-source-summary">
      <strong>{sourceId}</strong>
      <span>{source?.fileName ?? source}</span>
      <small>{rows.length.toLocaleString()} rows · {Object.keys(rows[0] ?? {}).length} columns</small>
    </div>
  );
}

function defaultPanel() {
  return {
    id: "new_chart",
    title: "New chart",
    type: "line",
    dataSource: "",
    size: "normal",
    legend: true,
    yScale: "zero",
    colorScheme: "pdpc",
    dataBinding: createSuggestedDataBinding([]),
  };
}

function dataSourceLabel(sourceId, source) {
  return source?.type === "uploadedCsv" ? `${sourceId} — ${source.fileName ?? "uploaded CSV"}` : sourceId;
}

function stepTitle(step) {
  if (step === 0) return "Choose the data source";
  if (step === 1) return "Tell the chart what each column means";
  return "Choose the chart and review the result";
}
