import React from "react";

const CHART_TYPES = [
  { value: "bar", label: "Bar" },
  { value: "line", label: "Line" },
  { value: "area", label: "Area" },
  { value: "horizontalBar", label: "Horizontal bar" },
  { value: "horizontalStackedBar", label: "Horizontal stacked bar" },
  { value: "groupedBar", label: "Grouped bar" },
  { value: "stackedBar", label: "Stacked bar" },
  { value: "mixed", label: "Mixed bar/line" },
  { value: "gauge", label: "Gauge" },
  { value: "mapScatter", label: "Map" },
  { value: "table", label: "Table" },
  { value: "deltaList", label: "Delta list" },
  { value: "kpi", label: "KPI cards" },
];

const COLOR_SCHEMES = [
  { value: "manual", label: "Manual series colors" },
  { value: "pdpc", label: "PDPC mixed" },
  { value: "redGreen5", label: "Likert red to green" },
  { value: "likertInfographic5", label: "Likert infographic" },
  { value: "blueYellow5", label: "Likert blue to yellow" },
  { value: "cool", label: "Cool blues/teals" },
  { value: "warm", label: "Warm alert" },
];

const LEGEND_POSITIONS = [
  { value: "top", label: "Top" },
  { value: "right", label: "Right" },
  { value: "bottom", label: "Bottom" },
  { value: "left", label: "Left" },
  { value: "insideTopLeft", label: "Inside top-left" },
  { value: "insideTopRight", label: "Inside top-right" },
  { value: "insideBottomLeft", label: "Inside bottom-left" },
  { value: "insideBottomRight", label: "Inside bottom-right" },
];

const SERIES_TYPE_OPTIONS = [
  { value: "bar", label: "Bar" },
  { value: "line", label: "Line" },
];

const LINE_STYLE_OPTIONS = [
  { value: "solid", label: "Solid" },
  { value: "dashed", label: "Dashed" },
  { value: "dotted", label: "Dotted" },
  { value: "shadow", label: "Shadowed" },
];

const MARKER_STYLE_OPTIONS = [
  { value: "none", label: "None" },
  { value: "circle", label: "Circle" },
  { value: "emptyCircle", label: "Open circle" },
  { value: "rect", label: "Square" },
  { value: "diamond", label: "Diamond" },
  { value: "triangle", label: "Triangle" },
];

const AXIS_PANEL_TYPES = new Set([
  "bar",
  "line",
  "area",
  "horizontalBar",
  "horizontalStackedBar",
  "groupedBar",
  "stackedBar",
  "mixed",
]);
const SERIES_PANEL_TYPES = new Set([
  "bar",
  "line",
  "area",
  "horizontalBar",
  "horizontalStackedBar",
  "groupedBar",
  "stackedBar",
  "mixed",
]);

const ECHART_PANEL_TYPES = new Set([
  "bar",
  "line",
  "area",
  "horizontalBar",
  "horizontalStackedBar",
  "groupedBar",
  "stackedBar",
  "mixed",
  "gauge",
  "mapScatter",
]);

const FONT_CONTROL_DEFINITIONS = {
  title: { label: "Chart title", defaultValue: 17 },
  axis: { label: "Axis labels", defaultValue: 12 },
  legend: { label: "Legend / scale labels", defaultValue: 12 },
  gaugeValue: { label: "Gauge value", defaultValue: 28 },
  gaugeLabel: { label: "Gauge label", defaultValue: 13 },
  gaugeAxis: { label: "Gauge axis labels", defaultValue: 12 },
  mapLabel: { label: "Map hover labels", defaultValue: 12 },
};

export default function ChartSettingsPanel({
  panel,
  dataSources,
  dataColumns,
  dataRows = [],
  onChange,
  onClose,
  onRemove,
}) {
  const editableSeries = panel.series ?? [];
  const fontControls = fontControlsForPanel(panel.type);
  const inferredDateColumn = inferDateColumn(dataColumns, panel);
  const dateOptions = collectDateOptions(dataRows, inferredDateColumn);
  const dataSourcePath = panel.dataSource ? dataSources?.[panel.dataSource] : "";

  function updateSeries(index, updates) {
    onChange({
      series: editableSeries.map((series, seriesIndex) =>
        seriesIndex === index ? { ...series, ...updates } : series,
      ),
    });
  }

  function updateSeriesFrom(updates) {
    onChange({
      seriesFrom: {
        ...(panel.seriesFrom ?? {}),
        ...updates,
      },
    });
  }

  function updateFields(updates) {
    onChange({
      fields: {
        ...(panel.fields ?? {}),
        ...updates,
      },
    });
  }

  function updateFontSize(key, delta, defaultValue) {
    const currentValue = Number(panel.fontSizes?.[key] ?? defaultValue);
    const nextValue = clamp(currentValue + delta, 8, 48);
    onChange({
      fontSizes: {
        ...(panel.fontSizes ?? {}),
        [key]: nextValue,
      },
    });
  }

  return (
    <aside className="settings-panel" aria-label="Panel settings">
      <div className="settings-panel-header">
        <div>
          <p className="eyebrow">Panel settings</p>
          <h2>{panel.title}</h2>
        </div>
        <button type="button" className="secondary" onClick={onClose}>
          Close
        </button>
      </div>

      <section className="settings-section">
        <h3>Basics</h3>
        <label>
          Title
          <input
            value={panel.title}
            onChange={(event) => onChange({ title: event.target.value })}
          />
        </label>

        <label>
          Information source
          <textarea
            rows={3}
            value={panel.infoSource ?? ""}
            placeholder={`Source: ${panel.dataSource ?? "dashboard configuration"}`}
            onChange={(event) => onChange({ infoSource: event.target.value })}
          />
        </label>

        <label>
          Data source
          <select
            value={panel.dataSource ?? ""}
            onChange={(event) =>
              onChange({ dataSource: event.target.value, dateSelection: undefined })
            }
          >
            <option value="">No data source</option>
            {Object.keys(dataSources ?? {}).map((sourceId) => (
              <option key={sourceId} value={sourceId}>
                {sourceId}
              </option>
            ))}
          </select>
        </label>

        <div className="settings-button-row">
          <button
            type="button"
            className="secondary"
            disabled={!dataSourcePath}
            onClick={() => openDataSourceTable(panel.title, dataSourcePath, dataRows)}
          >
            View source CSV
          </button>
        </div>
        <p className="settings-note">
          Shows the currently loaded CSV rows in a read-only table so you can inspect the source data without opening a local app.
        </p>

        <label>
          Panel type
          <select
            value={panel.type}
            onChange={(event) => onChange({ type: event.target.value })}
          >
            {CHART_TYPES.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>
        </label>

        <DateSelectionControl
          column={inferredDateColumn}
          options={dateOptions}
          selection={panel.dateSelection}
          onChange={(dateSelection) => onChange({ dateSelection })}
        />

        <label>
          Size
          <select
            value={normalizePanelSize(panel.size)}
            onChange={(event) => onChange({ size: event.target.value })}
          >
            <option value="half">Half, 0.5 x 1</option>
            <option value="normal">Normal, 1 x 1</option>
            <option value="wide">Wide, 2 x 1</option>
            <option value="tall">Tall, 1 x 2</option>
            <option value="large">Large, 2 x 2</option>
          </select>
        </label>
      </section>

      {AXIS_PANEL_TYPES.has(panel.type) && (
        <section className="settings-section">
          <h3>Axis</h3>
          <label>
            X axis column
            <select
              value={panel.x ?? ""}
              onChange={(event) => onChange({ x: event.target.value })}
            >
              <ColumnOptions columns={dataColumns} />
            </select>
          </label>
          <label>
            X axis type
            <select
              value={panel.xAxisMode ?? "category"}
              onChange={(event) => onChange({ xAxisMode: event.target.value })}
            >
              <option value="category">Category labels</option>
              <option value="date">Date/time axis</option>
            </select>
          </label>
          <label>
            Y axis scale
            <select
              value={panel.yScale ?? "zero"}
              onChange={(event) => onChange({ yScale: event.target.value })}
            >
              <option value="zero">Start at zero</option>
              <option value="auto">Automatic</option>
            </select>
          </label>
          {(panel.xAxisMode ?? "category") !== "date" && (
            <>
              <label>
                Category order
                <select
                  value={panel.categoryOrder ?? "csv"}
                  onChange={(event) => onChange({ categoryOrder: event.target.value })}
                >
                  <option value="csv">Order of appearance in CSV</option>
                  <option value="alphabetical">Alphabetical</option>
                  <option value="valueColumn">By selected value column</option>
                </select>
              </label>
              {panel.categoryOrder === "valueColumn" && (
                <>
                  <label>
                    Sort value column
                    <select
                      value={panel.categorySortColumn ?? ""}
                      onChange={(event) => onChange({ categorySortColumn: event.target.value })}
                    >
                      <ColumnOptions columns={dataColumns} />
                    </select>
                  </label>
                  <label>
                    Sort direction
                    <select
                      value={panel.categorySortDirection ?? "desc"}
                      onChange={(event) => onChange({ categorySortDirection: event.target.value })}
                    >
                      <option value="desc">Highest first</option>
                      <option value="asc">Lowest first</option>
                    </select>
                  </label>
                </>
              )}
            </>
          )}
        </section>
      )}

      {fontControls.length > 0 && (
        <section className="settings-section settings-font-list">
          <h3>Text size</h3>
          {fontControls.map((control) => (
            <FontSizeControl
              key={control.key}
              label={control.label}
              value={Number(panel.fontSizes?.[control.key] ?? control.defaultValue)}
              onDecrease={() => updateFontSize(control.key, -1, control.defaultValue)}
              onIncrease={() => updateFontSize(control.key, 1, control.defaultValue)}
            />
          ))}
        </section>
      )}

      {supportsColorScheme(panel.type) && (
        <section className="settings-section">
          <h3>Color</h3>
          <label>
            Color scheme
            <select
              value={panel.colorScheme ?? "manual"}
              onChange={(event) => onChange({ colorScheme: event.target.value })}
            >
              {COLOR_SCHEMES.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
          </label>
          <label className="checkbox-row">
            <input
              type="checkbox"
              checked={panel.reverseColorScheme ?? false}
              onChange={(event) => onChange({ reverseColorScheme: event.target.checked })}
            />
            Reverse scheme
          </label>
          <ColorSchemePreview scheme={panel.colorScheme} reverse={panel.reverseColorScheme} />
        </section>
      )}

      {supportsLegend(panel.type) && (
        <section className="settings-section">
          <h3>Legend</h3>
          <label className="checkbox-row">
            <input
              type="checkbox"
              checked={panel.legend ?? true}
              onChange={(event) => onChange({ legend: event.target.checked })}
            />
            Show legend
          </label>
          <label>
            Position
            <select
              value={panel.legendPosition ?? defaultLegendPosition(panel.type)}
              onChange={(event) => onChange({ legendPosition: event.target.value })}
            >
              {LEGEND_POSITIONS.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
          </label>
          <label>
            Symbol size
            <input
              type="number"
              min="8"
              max="36"
              value={panel.legendSize ?? 14}
              onChange={(event) => onChange({ legendSize: Number(event.target.value) })}
            />
          </label>
          <label>
            Font size
            <input
              type="number"
              min="8"
              max="28"
              value={panel.fontSizes?.legend ?? 12}
              onChange={(event) =>
                onChange({
                  fontSizes: {
                    ...(panel.fontSizes ?? {}),
                    legend: Number(event.target.value),
                  },
                })
              }
            />
          </label>
        </section>
      )}

      {SERIES_PANEL_TYPES.has(panel.type) && editableSeries.length > 0 && (
        <section className="settings-section settings-series-list">
          <h3>Series</h3>
          {editableSeries.map((series, index) => (
            <div className="settings-series" key={`${panel.id}-${series.y}-${index}`}>
              {panel.type === "mixed" && (
                <label>
                  Series type
                  <select
                    value={series.type ?? "line"}
                    onChange={(event) => updateSeries(index, { type: event.target.value })}
                  >
                    {SERIES_TYPE_OPTIONS.map((option) => (
                      <option key={option.value} value={option.value}>
                        {option.label}
                      </option>
                    ))}
                  </select>
                </label>
              )}
              <label>
                Name
                <input
                  value={series.name}
                  onChange={(event) =>
                    updateSeries(index, { name: event.target.value })
                  }
                />
              </label>
              <label>
                Value column
                <select
                  value={series.y ?? ""}
                  onChange={(event) => updateSeries(index, { y: event.target.value })}
                >
                  <ColumnOptions columns={dataColumns} />
                </select>
              </label>
              <label>
                Color
                <input
                  type="color"
                  value={series.color ?? "#043BCB"}
                  onChange={(event) =>
                    updateSeries(index, { color: event.target.value })
                  }
                />
              </label>
              {isLineLike(panel.type, series.type) && (
                <>
                  <label>
                    Line width
                    <input
                      type="number"
                      min="1"
                      max="8"
                      value={series.lineWidth ?? 3}
                      onChange={(event) =>
                        updateSeries(index, { lineWidth: Number(event.target.value) })
                      }
                    />
                  </label>
                  <label>
                    Line style
                    <select
                      value={series.lineStyle ?? "solid"}
                      onChange={(event) => updateSeries(index, { lineStyle: event.target.value })}
                    >
                      {LINE_STYLE_OPTIONS.map((option) => (
                        <option key={option.value} value={option.value}>
                          {option.label}
                        </option>
                      ))}
                    </select>
                  </label>
                  {series.lineStyle === "shadow" && (
                    <label>
                      Shadow color
                      <input
                        type="color"
                        value={series.shadowColor ?? "#4F6F8C"}
                        onChange={(event) => updateSeries(index, { shadowColor: event.target.value })}
                      />
                    </label>
                  )}
                  <label>
                    Marker
                    <select
                      value={series.markerStyle ?? "none"}
                      onChange={(event) => updateSeries(index, { markerStyle: event.target.value })}
                    >
                      {MARKER_STYLE_OPTIONS.map((option) => (
                        <option key={option.value} value={option.value}>
                          {option.label}
                        </option>
                      ))}
                    </select>
                  </label>
                </>
              )}
            </div>
          ))}
        </section>
      )}

      {SERIES_PANEL_TYPES.has(panel.type) && panel.seriesFrom && (
        <section className="settings-section">
          <h3>Grouped/stacked data</h3>
          <label>
            Series name column
            <select
              value={panel.seriesFrom.nameField ?? ""}
              onChange={(event) => updateSeriesFrom({ nameField: event.target.value })}
            >
              <ColumnOptions columns={dataColumns} />
            </select>
          </label>
          <label>
            Value column
            <select
              value={panel.seriesFrom.valueField ?? ""}
              onChange={(event) => updateSeriesFrom({ valueField: event.target.value })}
            >
              <ColumnOptions columns={dataColumns} />
            </select>
          </label>
        </section>
      )}

      {panel.type === "gauge" && (
        <section className="settings-section">
          <h3>Gauge</h3>
          <label>
            Value column
            <select
              value={panel.valueField ?? ""}
              onChange={(event) => onChange({ valueField: event.target.value })}
            >
              <ColumnOptions columns={dataColumns} />
            </select>
          </label>
          <label>
            Label column
            <select
              value={panel.labelField ?? ""}
              onChange={(event) => onChange({ labelField: event.target.value })}
            >
              <ColumnOptions columns={dataColumns} />
            </select>
          </label>
          <label>
            Maximum
            <input
              type="number"
              value={panel.max ?? 100}
              onChange={(event) => onChange({ max: Number(event.target.value) })}
            />
          </label>
          <label className="checkbox-row">
            <input
              type="checkbox"
              checked={panel.redZone?.enabled ?? false}
              onChange={(event) =>
                onChange({ redZone: { ...(panel.redZone ?? {}), enabled: event.target.checked } })
              }
            />
            Show red zone
          </label>
          {panel.redZone?.enabled && (
            <>
              <label>
                Red zone lower bound
                <input
                  type="number"
                  value={panel.redZone?.lower ?? 75}
                  onChange={(event) =>
                    onChange({ redZone: { ...(panel.redZone ?? {}), lower: Number(event.target.value) } })
                  }
                />
              </label>
              <label>
                Red zone upper bound
                <input
                  type="number"
                  value={panel.redZone?.upper ?? panel.max ?? 100}
                  onChange={(event) =>
                    onChange({ redZone: { ...(panel.redZone ?? {}), upper: Number(event.target.value) } })
                  }
                />
              </label>
              <label>
                Red zone color
                <input
                  type="color"
                  value={panel.redZone?.color ?? "#D71920"}
                  onChange={(event) =>
                    onChange({ redZone: { ...(panel.redZone ?? {}), color: event.target.value } })
                  }
                />
              </label>
            </>
          )}
        </section>
      )}

      {panel.type === "mapScatter" && (
        <section className="settings-section">
          <h3>Map</h3>
          <label>
            Province/name column
            <select
              value={panel.nameField ?? ""}
              onChange={(event) => onChange({ nameField: event.target.value })}
            >
              <ColumnOptions columns={dataColumns} />
            </select>
          </label>
          <label>
            Value column
            <select
              value={panel.valueField ?? ""}
              onChange={(event) => onChange({ valueField: event.target.value })}
            >
              <ColumnOptions columns={dataColumns} />
            </select>
          </label>
          <label>
            Point scale
            <input
              type="number"
              min="0.25"
              max="3"
              step="0.25"
              value={panel.pointScale ?? 1}
              onChange={(event) => onChange({ pointScale: Number(event.target.value) })}
            />
          </label>
          <label>
            Boundary horizontal offset
            <input
              type="number"
              min="-40"
              max="40"
              value={panel.boundaryOffsetX ?? 0}
              onChange={(event) => onChange({ boundaryOffsetX: Number(event.target.value) })}
            />
          </label>
          <label>
            Boundary vertical offset
            <input
              type="number"
              min="-40"
              max="40"
              value={panel.boundaryOffsetY ?? 0}
              onChange={(event) => onChange({ boundaryOffsetY: Number(event.target.value) })}
            />
          </label>
        </section>
      )}

      {panel.type === "table" && (
        <section className="settings-section">
          <h3>Table</h3>
          <label>
            Columns
            <input
              value={(panel.columns ?? []).join(", ")}
              onChange={(event) =>
                onChange({
                  columns: event.target.value
                    .split(",")
                    .map((column) => column.trim())
                    .filter(Boolean),
                })
              }
            />
          </label>
        </section>
      )}

      {panel.type === "deltaList" && (
        <section className="settings-section">
          <h3>Delta list</h3>
          <label>
            Title field
            <select
              value={panel.fields?.title ?? ""}
              onChange={(event) => updateFields({ title: event.target.value })}
            >
              <ColumnOptions columns={dataColumns} />
            </select>
          </label>
          <label>
            Value field
            <select
              value={panel.fields?.value ?? ""}
              onChange={(event) => updateFields({ value: event.target.value })}
            >
              <ColumnOptions columns={dataColumns} />
            </select>
          </label>
          <label>
            Rows shown
            <input
              type="number"
              min="1"
              max="50"
              value={panel.rowLimit ?? 12}
              onChange={(event) => onChange({ rowLimit: Number(event.target.value) })}
            />
          </label>
        </section>
      )}

      <section className="settings-section settings-danger-zone">
        <h3>Panel</h3>
        <button
          type="button"
          className="danger"
          onClick={() => {
            if (window.confirm("Remove this panel?")) {
              onRemove();
            }
          }}
        >
          Remove panel
        </button>
      </section>
    </aside>
  );
}

function DateSelectionControl({ column, options, selection, onChange }) {
  if (!column || options.length === 0) {
    return (
      <div className="date-checklist-control">
        <span className="settings-field-label">Date range</span>
        <p className="settings-note">No date-like column was found for this data source.</p>
      </div>
    );
  }

  if (options.length <= 5) {
    return (
      <DateChecklistControl
        column={column}
        options={options}
        selectedValues={selectedDateValues(selection, column, options)}
        onChange={(values) => onChange({ column, mode: "list", values })}
      />
    );
  }

  return (
    <DateRangeControl
      column={column}
      options={options}
      range={selectedDateRange(selection, column, options)}
      onChange={(range) => onChange({ column, mode: "range", ...range })}
    />
  );
}

function DateChecklistControl({ column, options, selectedValues, onChange }) {
  const selectedSet = new Set(selectedValues.map(String));

  function toggleDate(option, checked) {
    const next = new Set(selectedSet);
    if (checked) {
      next.add(String(option));
    } else {
      next.delete(String(option));
    }
    onChange(options.filter((candidate) => next.has(String(candidate))));
  }

  return (
    <div className="date-checklist-control">
      <div className="date-checklist-header">
        <span className="settings-field-label">Date range</span>
        <small>{column}</small>
      </div>
      <div className="date-checklist-actions">
        <button type="button" className="secondary" onClick={() => onChange(options)}>
          Select all
        </button>
        <button type="button" className="secondary" onClick={() => onChange([])}>
          Deselect all
        </button>
      </div>
      <div className="date-checklist" role="group" aria-label="Available dates">
        {options.map((option) => (
          <label className="date-checkbox-row" key={option}>
            <input
              type="checkbox"
              checked={selectedSet.has(String(option))}
              onChange={(event) => toggleDate(option, event.target.checked)}
            />
            <span>{option}</span>
          </label>
        ))}
      </div>
    </div>
  );
}

function DateRangeControl({ column, options, range, onChange }) {
  const [activeEdge, setActiveEdge] = React.useState("start");
  const minDate = options[0];
  const maxDate = options[options.length - 1];
  const available = new Set(options.map(String));

  function commitRange(nextRange) {
    const start = coerceAvailableDate(nextRange.start, options, "start");
    const end = coerceAvailableDate(nextRange.end, options, "end");
    if (compareDateishValues(start, end) > 0) {
      onChange({ start: end, end });
      return;
    }
    onChange({ start, end });
  }

  function pickDate(date) {
    if (!available.has(date)) {
      return;
    }
    if (activeEdge === "start") {
      commitRange({ start: date, end: range.end });
      setActiveEdge("end");
    } else {
      commitRange({ start: range.start, end: date });
      setActiveEdge("start");
    }
  }

  return (
    <div className="date-checklist-control date-range-control">
      <div className="date-checklist-header">
        <span className="settings-field-label">Date range</span>
        <small>{column} · {options.length} dates</small>
      </div>
      <div className="date-range-fields">
        <label>
          From
          <input
            type="date"
            value={range.start}
            min={minDate}
            max={maxDate}
            onChange={(event) => commitRange({ start: event.target.value, end: range.end })}
          />
        </label>
        <label>
          To
          <input
            type="date"
            value={range.end}
            min={minDate}
            max={maxDate}
            onChange={(event) => commitRange({ start: range.start, end: event.target.value })}
          />
        </label>
      </div>
      <div className="date-checklist-actions">
        <button type="button" className="secondary" onClick={() => commitRange({ start: minDate, end: maxDate })}>
          Full range
        </button>
        <button type="button" className="secondary" onClick={() => setActiveEdge(activeEdge === "start" ? "end" : "start")}>
          Picking {activeEdge === "start" ? "from" : "to"}
        </button>
      </div>
      <details className="date-calendar-details">
        <summary>Open date calendar</summary>
        <div className="date-calendar-grid">
          {buildCalendarMonths(options).map((month) => (
            <section className="date-calendar-month" key={month.key}>
              <h4>{month.label}</h4>
              <div className="date-calendar-weekdays" aria-hidden="true">
                {['M', 'T', 'W', 'T', 'F', 'S', 'S'].map((day, index) => (
                  <span key={`${day}-${index}`}>{day}</span>
                ))}
              </div>
              <div className="date-calendar-days">
                {month.days.map((day) => {
                  if (!day.date) {
                    return <span className="date-calendar-spacer" key={day.key} />;
                  }
                  const availableDay = available.has(day.date);
                  const inRange = compareDateishValues(day.date, range.start) >= 0 && compareDateishValues(day.date, range.end) <= 0;
                  const isEdge = day.date === range.start || day.date === range.end;
                  return (
                    <button
                      type="button"
                      key={day.date}
                      className={[
                        "date-calendar-day",
                        availableDay ? "available" : "unavailable",
                        inRange ? "in-range" : "",
                        isEdge ? "range-edge" : "",
                      ].filter(Boolean).join(" ")}
                      disabled={!availableDay}
                      onClick={() => pickDate(day.date)}
                      title={availableDay ? day.date : `${day.date} unavailable`}
                    >
                      {day.label}
                    </button>
                  );
                })}
              </div>
            </section>
          ))}
        </div>
      </details>
      <p className="settings-note">Dates outside the data source range are blocked. Grey calendar days are not present in the selected data source.</p>
    </div>
  );
}

function FontSizeControl({ label, value, onDecrease, onIncrease }) {
  return (
    <div className="font-size-row">
      <span>{label}</span>
      <div className="font-size-controls">
        <button type="button" className="secondary" onClick={onDecrease} aria-label={`Decrease ${label} font size`}>
          -
        </button>
        <output>{value}px</output>
        <button type="button" className="secondary" onClick={onIncrease} aria-label={`Increase ${label} font size`}>
          +
        </button>
      </div>
    </div>
  );
}
function ColumnOptions({ columns }) {
  return (
    <>
      <option value="">Choose column</option>
      {columns.map((column) => (
        <option key={column} value={column}>
          {column}
        </option>
      ))}
    </>
  );
}

function ColorSchemePreview({ scheme = "manual", reverse = false }) {
  const colors = previewColors(scheme, reverse);
  return (
    <div className="color-scheme-preview" aria-label="Color scheme preview">
      {colors.map((color) => (
        <span key={color} style={{ backgroundColor: color }} />
      ))}
    </div>
  );
}

function previewColors(scheme, reverse) {
  const schemes = {
    manual: ["#043BCB", "#00A676", "#4496D1", "#8F1D2C", "#7FDEC1"],
    pdpc: ["#043BCB", "#00A676", "#4496D1", "#2456A6", "#007C89"],
    redGreen5: ["#8F1D2C", "#E16B5A", "#F3D37A", "#7FDEC1", "#00A676"],
    likertInfographic5: ["#43A047", "#AEBB2E", "#F6A21A", "#F47C20", "#D71920"],
    blueYellow5: ["#08224A", "#043BCB", "#4496D1", "#F3D37A", "#C98700"],
    cool: ["#08224A", "#2456A6", "#4496D1", "#007C89", "#7FDEC1"],
    warm: ["#8F1D2C", "#C98700", "#F3D37A", "#E16B5A", "#08224A"],
  };
  const colors = schemes[scheme] ?? schemes.manual;
  return reverse ? [...colors].reverse() : colors;
}

function collectDateOptions(rows, column) {
  if (!column || !Array.isArray(rows)) {
    return [];
  }
  const values = rows
    .map((row) => row?.[column])
    .filter((value) => value !== undefined && value !== null && String(value).trim() !== "")
    .map(String);
  return [...new Set(values)].sort(compareDateishValues);
}

function selectedDateValues(selection, column, options) {
  if (selection?.column === column && Array.isArray(selection.values)) {
    return selection.values.map(String);
  }
  return options;
}

function selectedDateRange(selection, column, options) {
  const fallback = { start: options[0], end: options[options.length - 1] };
  if (selection?.column !== column) {
    return fallback;
  }
  if (selection.mode === "range") {
    return {
      start: coerceAvailableDate(selection.start, options, "start"),
      end: coerceAvailableDate(selection.end, options, "end"),
    };
  }
  if (Array.isArray(selection.values) && selection.values.length > 0) {
    const savedValues = selection.values.map(String).sort(compareDateishValues);
    return {
      start: coerceAvailableDate(savedValues[0], options, "start"),
      end: coerceAvailableDate(savedValues[savedValues.length - 1], options, "end"),
    };
  }
  return fallback;
}

function coerceAvailableDate(value, options, edge) {
  if (!value) {
    return edge === "start" ? options[0] : options[options.length - 1];
  }
  if (options.includes(value)) {
    return value;
  }
  const sorted = [...options].sort(compareDateishValues);
  if (edge === "start") {
    return sorted.find((candidate) => compareDateishValues(candidate, value) >= 0) ?? sorted[sorted.length - 1];
  }
  return [...sorted].reverse().find((candidate) => compareDateishValues(candidate, value) <= 0) ?? sorted[0];
}

function buildCalendarMonths(options) {
  const dates = options.map((value) => new Date(`${value}T00:00:00`)).filter((date) => !Number.isNaN(date.getTime()));
  if (dates.length === 0) {
    return [];
  }
  const first = new Date(dates[0].getFullYear(), dates[0].getMonth(), 1);
  const last = new Date(dates[dates.length - 1].getFullYear(), dates[dates.length - 1].getMonth(), 1);
  const months = [];
  for (let cursor = new Date(first); cursor <= last; cursor.setMonth(cursor.getMonth() + 1)) {
    months.push(buildCalendarMonth(cursor));
  }
  return months;
}

function buildCalendarMonth(monthDate) {
  const year = monthDate.getFullYear();
  const month = monthDate.getMonth();
  const label = monthDate.toLocaleString(undefined, { month: "short", year: "numeric" });
  const firstDay = new Date(year, month, 1);
  const leadingDays = (firstDay.getDay() + 6) % 7;
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const days = [];
  for (let index = 0; index < leadingDays; index += 1) {
    days.push({ key: `blank-${year}-${month}-${index}`, date: "" });
  }
  for (let day = 1; day <= daysInMonth; day += 1) {
    const date = `${year}-${String(month + 1).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
    days.push({ key: date, date, label: day });
  }
  return { key: `${year}-${month}`, label, days };
}

function inferDateColumn(columns, panel) {
  if (!Array.isArray(columns) || columns.length === 0) {
    return "";
  }

  const savedColumn = panel.dateSelection?.column;
  if (savedColumn && columns.includes(savedColumn)) {
    return savedColumn;
  }

  const preferred = [panel.x, "date", "Date", "date_value", "date_label", "Snapshot", "Snapshot label"];
  const exact = preferred.find((candidate) => candidate && columns.includes(candidate));
  if (exact && isDateLikeColumn(exact)) {
    return exact;
  }

  return columns.find(isDateLikeColumn) ?? "";
}

function isDateLikeColumn(column) {
  const normalized = String(column ?? "").toLowerCase();
  return normalized.includes("date") || normalized.includes("snapshot");
}

function compareDateishValues(a, b) {
  const dateA = Date.parse(a);
  const dateB = Date.parse(b);
  if (!Number.isNaN(dateA) && !Number.isNaN(dateB)) {
    return dateA - dateB;
  }
  return String(a).localeCompare(String(b), undefined, { numeric: true });
}

function fontControlsForPanel(type) {
  if (!ECHART_PANEL_TYPES.has(type)) {
    return [];
  }

  const keys = ["title"];
  if (AXIS_PANEL_TYPES.has(type)) {
    keys.push("axis", "legend");
  }
  if (type === "gauge") {
    keys.push("gaugeValue", "gaugeLabel", "gaugeAxis");
  }
  if (type === "mapScatter") {
    keys.push("legend", "mapLabel");
  }

  return keys.map((key) => ({ key, ...FONT_CONTROL_DEFINITIONS[key] }));
}

function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value));
}
function supportsColorScheme(type) {
  return type !== "kpi" && type !== "table" && type !== "deltaList";
}

function supportsLegend(type) {
  return type !== "kpi" && type !== "table" && type !== "deltaList";
}

function defaultLegendPosition(type) {
  return "top";
}

function openDataSourceTable(title, path, rows) {
  if (!path) {
    return;
  }
  const tableRows = Array.isArray(rows) ? rows : [];
  const columns = collectColumns(tableRows);
  const popup = window.open("", "_blank", "width=1120,height=760");
  if (!popup) {
    return;
  }

  const safeTitle = escapeHtml(`${title || "Chart"} source CSV`);
  const safePath = escapeHtml(path);
  const tableMarkup = columns.length
    ? renderCsvTable(tableRows, columns)
    : '<p class="empty-state">No rows are currently loaded for this data source.</p>';

  popup.document.open();
  popup.document.write(`<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <title>${safeTitle}</title>
  <style>
    :root { color-scheme: light; font-family: Inter, Segoe UI, Arial, sans-serif; }
    body { background: #f5f8fc; color: #08224a; margin: 0; padding: 22px; }
    header { margin-bottom: 16px; }
    h1 { font-size: 20px; margin: 0 0 6px; }
    p { color: #52677d; font-size: 13px; margin: 0; }
    .table-wrap { background: white; border: 1px solid rgba(8, 34, 74, 0.12); border-radius: 12px; max-height: calc(100vh - 120px); overflow: auto; }
    table { border-collapse: collapse; font-size: 12px; min-width: 100%; }
    th, td { border-bottom: 1px solid rgba(8, 34, 74, 0.08); border-right: 1px solid rgba(8, 34, 74, 0.06); max-width: 280px; padding: 7px 9px; text-align: left; white-space: nowrap; }
    th { background: #eaf1f6; font-weight: 700; position: sticky; top: 0; z-index: 1; }
    td { color: #20364d; }
    .empty-state { background: white; border-radius: 12px; padding: 18px; }
  </style>
</head>
<body>
  <header>
    <h1>${safeTitle}</h1>
    <p>${safePath} · ${tableRows.length} loaded row${tableRows.length === 1 ? "" : "s"}</p>
  </header>
  <div class="table-wrap">${tableMarkup}</div>
</body>
</html>`);
  popup.document.close();
}

function collectColumns(rows) {
  const columns = [];
  const seen = new Set();
  rows.forEach((row) => {
    Object.keys(row ?? {}).forEach((column) => {
      if (!seen.has(column)) {
        seen.add(column);
        columns.push(column);
      }
    });
  });
  return columns;
}

function renderCsvTable(rows, columns) {
  const header = columns.map((column) => `<th>${escapeHtml(column)}</th>`).join("");
  const body = rows
    .map((row) => `<tr>${columns.map((column) => `<td>${escapeHtml(row?.[column])}</td>`).join("")}</tr>`)
    .join("");
  return `<table><thead><tr>${header}</tr></thead><tbody>${body}</tbody></table>`;
}

function escapeHtml(value) {
  return String(value ?? "").replace(/[&<>"']/g, (character) => {
    const replacements = {
      "&": "&amp;",
      "<": "&lt;",
      ">": "&gt;",
      '"': "&quot;",
      "'": "&#39;",
    };
    return replacements[character];
  });
}

function isLineLike(panelType, seriesType) {
  return panelType === "line" || panelType === "area" || seriesType === "line";
}

function normalizePanelSize(size) {
  return size === "standard" || !size ? "normal" : size;
}
