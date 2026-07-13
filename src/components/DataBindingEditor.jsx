import React from "react";

import {
  CHART_DATA_MODEL_VERSION,
  createSuggestedDataBinding,
  prepareAxisChartData,
  profileTabularData,
} from "../lib/chartDataModel.js";

export default function DataBindingEditor({ panel, rows = [], onChange }) {
  const profile = React.useMemo(() => profileTabularData(rows), [rows]);
  const binding = panel.dataBinding ?? createSuggestedDataBinding(rows);
  const prepared = React.useMemo(
    () => prepareAxisChartData({ ...panel, dataBinding: binding }, rows),
    [panel, binding, rows],
  );

  React.useEffect(() => {
    if (!panel.dataBinding && profile.columns.length > 0) {
      onChange({ dataBinding: createSuggestedDataBinding(rows) });
    }
  }, [panel.dataSource, panel.dataBinding, profile.fingerprint]);

  function commit(nextBinding) {
    onChange({ dataBinding: { ...nextBinding, version: CHART_DATA_MODEL_VERSION } });
  }

  function patch(updates) {
    commit({ ...binding, ...updates });
  }

  function changeX(field) {
    const column = profile.columns.find((item) => item.name === field);
    patch({
      x: { field, type: column?.type === "temporal" ? "temporal" : "category" },
      series: {
        ...(binding.series ?? {}),
        fields: (binding.series?.fields ?? []).filter((item) => item !== field),
      },
    });
  }

  function toggleMeasure(field, checked) {
    const current = binding.measures ?? [];
    patch({
      measures: checked
        ? [...current, { field, label: field }]
        : current.filter((measure) => measure.field !== field),
    });
  }

  function patchMeasure(index, updates) {
    patch({
      measures: (binding.measures ?? []).map((measure, measureIndex) => (
        measureIndex === index ? { ...measure, ...updates } : measure
      )),
    });
  }

  function toggleClusterField(field, checked) {
    const current = binding.series?.fields ?? [];
    patch({
      series: {
        ...(binding.series ?? {}),
        fields: checked ? [...current, field] : current.filter((item) => item !== field),
      },
    });
  }

  function addFilter(field) {
    if (!field || (binding.filters ?? []).some((filter) => filter.field === field)) return;
    const column = profile.columns.find((item) => item.name === field);
    const values = uniqueValues(rows, field);
    const filter = column?.type === "temporal" && values.length > 5
      ? { field, operator: "range", min: values[0] ?? "", max: values[values.length - 1] ?? "" }
      : { field, operator: "in", values };
    patch({ filters: [...(binding.filters ?? []), filter] });
  }

  function patchFilter(index, updates) {
    patch({
      filters: (binding.filters ?? []).map((filter, filterIndex) => (
        filterIndex === index ? { ...filter, ...updates } : filter
      )),
    });
  }

  function removeFilter(index) {
    patch({ filters: (binding.filters ?? []).filter((_, filterIndex) => filterIndex !== index) });
  }

  const selectedMeasures = new Set((binding.measures ?? []).map((measure) => measure.field));
  const clusterFields = new Set(binding.series?.fields ?? []);
  const measureCandidates = profile.columns.filter((column) => (
    column.type === "number" || selectedMeasures.has(column.name)
  ));
  const clusterCandidates = profile.columns.filter((column) => (
    column.name !== binding.x?.field
    && (column.type !== "number" || (column.uniqueCount <= 10 && column.uniqueCount <= Math.max(1, profile.rowCount * 0.2)))
  ));

  return (
    <div className="data-binding-editor">
      <div className="data-profile-summary">
        <strong>{profile.shape === "long" ? "Long-format pattern" : profile.shape === "wide" ? "Wide-format pattern" : "Simple table pattern"}</strong>
        <span>{profile.rowCount.toLocaleString()} rows · {profile.columns.length} columns</span>
        <small>The chart uses field roles, so you do not need to reshape the CSV just to switch between one measure, several measures, or clustered categories.</small>
      </div>
      <details className="data-profile-columns">
        <summary>Inspect detected column types and examples</summary>
        <div className="data-profile-column-list">
          {profile.columns.map((column) => (
            <div key={column.name}>
              <strong>{column.name}</strong>
              <span>{columnTypeLabel(column.type)} · {column.uniqueCount} unique</span>
              <small>{column.examples.map(String).join(" · ") || "No non-empty examples"}</small>
            </div>
          ))}
        </div>
      </details>

      <section className="binding-role-card">
        <h4>1. X-axis observation</h4>
        <label>
          What should each x-position represent?
          <select value={binding.x?.field ?? ""} onChange={(event) => changeX(event.target.value)}>
            <option value="">Choose a column</option>
            {profile.columns.map((column) => (
              <option key={column.name} value={column.name}>{column.name} · {columnTypeLabel(column.type)}</option>
            ))}
          </select>
        </label>
        <label>
          X-axis interpretation
          <select value={binding.x?.type ?? "category"} onChange={(event) => patch({ x: { ...binding.x, type: event.target.value } })}>
            <option value="category">Categories</option>
            <option value="temporal">Date / time</option>
          </select>
        </label>
      </section>

      <section className="binding-role-card">
        <h4>2. Measurements</h4>
        <p className="settings-note">Choose one measurement for a single line/bar, or several numeric columns for multiple measurements.</p>
        <div className="binding-checkbox-list">
          {measureCandidates.map((column) => (
            <label key={column.name} className="checkbox-row">
              <input
                type="checkbox"
                checked={selectedMeasures.has(column.name)}
                onChange={(event) => toggleMeasure(column.name, event.target.checked)}
              />
              <span>{column.name}</span>
              <small>{column.uniqueCount} values</small>
            </label>
          ))}
        </div>
        {(binding.measures ?? []).map((measure, index) => (
          <div className="binding-measure-card" key={`${measure.field}-${index}`}>
            <strong>{measure.field}</strong>
            <label>Legend label<input value={measure.label ?? measure.field} onChange={(event) => patchMeasure(index, { label: event.target.value })} /></label>
            {panel.type === "mixed" && (
              <label>Mark<select value={measure.type ?? "bar"} onChange={(event) => patchMeasure(index, { type: event.target.value })}><option value="bar">Bar</option><option value="line">Line</option></select></label>
            )}
            <label>Y-axis<select value={measure.yAxisIndex ?? 0} onChange={(event) => patchMeasure(index, { yAxisIndex: Number(event.target.value) })}><option value={0}>Primary</option><option value={1}>Secondary</option></select></label>
            <label>Color<input type="color" value={measure.color ?? defaultColor(index)} onChange={(event) => patchMeasure(index, { color: event.target.value })} /></label>
            <MeasureAppearance panelType={panel.type} measure={measure} onChange={(updates) => patchMeasure(index, updates)} />
          </div>
        ))}
      </section>

      <section className="binding-role-card">
        <h4>3. Cluster observations</h4>
        <p className="settings-note">Optional. Each unique combination becomes a separate line or bar series. The x-axis column is intentionally unavailable here.</p>
        <div className="binding-checkbox-list">
          {clusterCandidates.map((column) => (
            <label key={column.name} className="checkbox-row">
              <input
                type="checkbox"
                checked={clusterFields.has(column.name)}
                onChange={(event) => toggleClusterField(column.name, event.target.checked)}
              />
              <span>{column.name}</span>
              <small>{column.uniqueCount} categories</small>
            </label>
          ))}
          {clusterCandidates.length === 0 && <p className="settings-note">No additional categorical columns were detected.</p>}
        </div>
      </section>

      <section className="binding-role-card">
        <h4>4. Filter categories</h4>
        <FilterAdder columns={profile.columns} filters={binding.filters ?? []} onAdd={addFilter} />
        <div className="binding-filter-list">
          {(binding.filters ?? []).map((filter, index) => (
            <FilterCard
              key={`${filter.field}-${index}`}
              filter={filter}
              rows={rows}
              onChange={(updates) => patchFilter(index, updates)}
              onRemove={() => removeFilter(index)}
            />
          ))}
        </div>
      </section>

      <section className="binding-role-card">
        <h4>5. Duplicate observations</h4>
        <label>
          If several rows have the same x and cluster values
          <select value={binding.aggregation ?? "sum"} onChange={(event) => patch({ aggregation: event.target.value })}>
            <option value="sum">Add them</option>
            <option value="mean">Average them</option>
            <option value="first">Use first row</option>
            <option value="last">Use last row</option>
            <option value="min">Use minimum</option>
            <option value="max">Use maximum</option>
            <option value="count">Count rows</option>
          </select>
        </label>
        <label>
          Missing observations
          <select value={binding.missingValue ?? "gap"} onChange={(event) => patch({ missingValue: event.target.value })}>
            <option value="gap">Leave a gap</option>
            <option value="zero">Show zero</option>
          </select>
        </label>
      </section>

      <div className="binding-preview-summary">
        <strong>Live binding check</strong>
        <span>{prepared.rowsAfter.toLocaleString()} of {prepared.rowsBefore.toLocaleString()} rows · {prepared.xValues.length} x-values · {prepared.series.length} series</span>
        {prepared.diagnostics.length === 0 ? (
          <small className="binding-diagnostic-ok">Ready to plot.</small>
        ) : (
          <ul className="binding-diagnostics">
            {prepared.diagnostics.map((diagnostic, index) => (
              <li className={`binding-diagnostic-${diagnostic.severity}`} key={`${diagnostic.code}-${index}`}>{diagnostic.message}</li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}

function MeasureAppearance({ panelType, measure, onChange }) {
  const markType = panelType === "mixed" ? (measure.type ?? "bar") : panelType === "area" ? "line" : panelType;
  if (markType !== "line") return null;
  return (
    <div className="binding-measure-appearance">
      <label>Line width<input type="number" min="1" max="16" value={measure.lineWidth ?? 3} onChange={(event) => onChange({ lineWidth: Number(event.target.value) })} /></label>
      <label>Line style<select value={measure.lineStyle ?? "solid"} onChange={(event) => onChange({ lineStyle: event.target.value })}><option value="solid">Solid</option><option value="dashed">Dashed</option><option value="dotted">Dotted</option><option value="shadow">Shadow</option></select></label>
      <label>Marker<select value={measure.markerStyle ?? "none"} onChange={(event) => onChange({ markerStyle: event.target.value })}><option value="none">None</option><option value="circle">Circle</option><option value="emptyCircle">Empty circle</option><option value="rect">Square</option><option value="diamond">Diamond</option><option value="triangle">Triangle</option></select></label>
      <label>Marker size<input type="number" min="2" max="24" value={measure.markerSize ?? 6} onChange={(event) => onChange({ markerSize: Number(event.target.value) })} /></label>
      <label className="checkbox-row"><input type="checkbox" checked={measure.smooth ?? false} onChange={(event) => onChange({ smooth: event.target.checked })} />Smooth line</label>
    </div>
  );
}

function FilterAdder({ columns, filters, onAdd }) {
  const [field, setField] = React.useState("");
  const used = new Set(filters.map((filter) => filter.field));
  return (
    <div className="binding-filter-adder">
      <select value={field} onChange={(event) => setField(event.target.value)}>
        <option value="">Choose a filter column</option>
        {columns.filter((column) => !used.has(column.name)).map((column) => (
          <option key={column.name} value={column.name}>{column.name}</option>
        ))}
      </select>
      <button type="button" className="secondary" disabled={!field} onClick={() => { onAdd(field); setField(""); }}>Add filter</button>
    </div>
  );
}

function FilterCard({ filter, rows, onChange, onRemove }) {
  const values = React.useMemo(() => uniqueValues(rows, filter.field), [rows, filter.field]);
  if (filter.operator === "range") {
    return (
      <div className="binding-filter-card">
        <div className="settings-series-header"><strong>{filter.field}</strong><button type="button" className="secondary" onClick={onRemove}>Remove</button></div>
        <div className="date-range-fields">
          <label>From<input value={filter.min ?? ""} onChange={(event) => onChange({ min: event.target.value })} /></label>
          <label>To<input value={filter.max ?? ""} onChange={(event) => onChange({ max: event.target.value })} /></label>
        </div>
      </div>
    );
  }

  const selected = new Set((filter.values ?? []).map(String));
  function toggle(value, checked) {
    const next = new Set(selected);
    if (checked) next.add(String(value)); else next.delete(String(value));
    onChange({ values: values.filter((item) => next.has(String(item))) });
  }
  return (
    <div className="binding-filter-card">
      <div className="settings-series-header"><strong>{filter.field}</strong><button type="button" className="secondary" onClick={onRemove}>Remove</button></div>
      <div className="date-checklist-actions">
        <button type="button" className="secondary" onClick={() => onChange({ values })}>Select all</button>
        <button type="button" className="secondary" onClick={() => onChange({ values: [] })}>Deselect all</button>
      </div>
      <div className="binding-filter-values">
        {values.map((value) => (
          <label key={String(value)} className="checkbox-row">
            <input type="checkbox" checked={selected.has(String(value))} onChange={(event) => toggle(value, event.target.checked)} />
            <span>{String(value)}</span>
          </label>
        ))}
      </div>
    </div>
  );
}

function uniqueValues(rows, field) {
  const seen = new Map();
  for (const row of rows ?? []) {
    const value = row?.[field];
    if (value === undefined || value === null || value === "") continue;
    const key = String(value);
    if (!seen.has(key)) seen.set(key, value);
  }
  return [...seen.values()].sort(compareValues);
}

function compareValues(left, right) {
  const leftTime = Date.parse(left);
  const rightTime = Date.parse(right);
  if (Number.isFinite(leftTime) && Number.isFinite(rightTime)) return leftTime - rightTime;
  return String(left).localeCompare(String(right), undefined, { numeric: true });
}

function columnTypeLabel(type) {
  if (type === "number") return "number";
  if (type === "temporal") return "date/time";
  if (type === "category") return "category";
  return "text";
}

function defaultColor(index) {
  return ["#043bcb", "#00a676", "#4496d1", "#8f1d2c"][index % 4];
}
