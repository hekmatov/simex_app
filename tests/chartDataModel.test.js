import test from "node:test";
import assert from "node:assert/strict";

import {
  legacyBindingForPanel,
  prepareAxisChartData,
  profileTabularData,
} from "../src/lib/chartDataModel.js";
import { reconcileDashboardWithLoadedData } from "../src/lib/dashboardCompatibility.js";

test("wide data can show several measurements on one time axis", () => {
  const rows = [
    { date: "2027-05-01", cases: 10, deaths: 1 },
    { date: "2027-05-02", cases: 15, deaths: 2 },
  ];
  const panel = {
    type: "line",
    dataBinding: {
      version: 2,
      x: { field: "date", type: "temporal" },
      measures: [{ field: "cases", label: "Cases" }, { field: "deaths", label: "Deaths" }],
      series: { fields: [] },
      filters: [],
      aggregation: "sum",
      missingValue: "gap",
    },
  };

  const prepared = prepareAxisChartData(panel, rows);
  assert.deepEqual(prepared.xValues, ["2027-05-01", "2027-05-02"]);
  assert.equal(prepared.series.length, 2);
  assert.deepEqual(prepared.series[0].values, [10, 15]);
  assert.deepEqual(prepared.series[1].values, [1, 2]);
});

test("long data keeps x, cluster, and filters as independent roles", () => {
  const rows = [
    { date: "2027-05-01", age: "60-79", deaths: 4 },
    { date: "2027-05-02", age: "60-79", deaths: 6 },
    { date: "2027-05-01", age: "80+", deaths: 3 },
    { date: "2027-05-02", age: "80+", deaths: 5 },
  ];
  const panel = {
    type: "line",
    dataBinding: {
      version: 2,
      x: { field: "date", type: "temporal" },
      measures: [{ field: "deaths", label: "Deaths" }],
      series: { fields: ["age"] },
      filters: [{ field: "age", operator: "in", values: ["60-79"] }],
      aggregation: "sum",
      missingValue: "gap",
    },
  };

  const prepared = prepareAxisChartData(panel, rows);
  assert.equal(prepared.rowsAfter, 2);
  assert.equal(prepared.series.length, 1);
  assert.equal(prepared.series[0].name, "60-79");
  assert.deepEqual(prepared.series[0].values, [4, 6]);
});

test("the same field cannot be both x-axis and cluster dimension", () => {
  const rows = [{ age: "60-79", deaths: 4 }];
  const panel = {
    type: "bar",
    dataBinding: {
      version: 2,
      x: { field: "age", type: "category" },
      measures: [{ field: "deaths", label: "Deaths" }],
      series: { fields: ["age"] },
      filters: [],
      aggregation: "sum",
    },
  };

  const prepared = prepareAxisChartData(panel, rows);
  assert.ok(prepared.diagnostics.some((diagnostic) => diagnostic.code === "duplicate-dimension-role"));
});

test("text month names fall back from a time axis to categorical rendering", () => {
  const rows = [
    { Year: 2026, "Month name": "January", Cases: 10 },
    { Year: 2027, "Month name": "January", Cases: 12 },
    { Year: 2026, "Month name": "February", Cases: 14 },
    { Year: 2027, "Month name": "February", Cases: 16 },
  ];
  const panel = {
    type: "groupedBar",
    dataBinding: {
      version: 2,
      x: { field: "Month name", type: "temporal" },
      measures: [{ field: "Cases", label: "Cases" }],
      series: { fields: ["Year"] },
      filters: [],
      aggregation: "sum",
      missingValue: "gap",
    },
  };

  const prepared = prepareAxisChartData(panel, rows);
  assert.equal(prepared.xType, "category");
  assert.deepEqual(prepared.xValues, ["January", "February"]);
  assert.equal(prepared.series.length, 2);
  assert.ok(prepared.diagnostics.some((diagnostic) => diagnostic.code === "temporal-axis-fallback"));
});

test("adding and removing a second cluster field produces stable unique series", () => {
  const rows = [
    { Year: 2026, "Month name": "January", Treatment: "A", Cases: 10 },
    { Year: 2027, "Month name": "January", Treatment: "A", Cases: 12 },
    { Year: 2026, "Month name": "January", Treatment: "B", Cases: 14 },
    { Year: 2027, "Month name": "January", Treatment: "B", Cases: 16 },
  ];
  const baseBinding = {
    version: 2,
    x: { field: "Month name", type: "category" },
    measures: [{ field: "Cases", label: "Cases" }],
    filters: [],
    aggregation: "sum",
    missingValue: "gap",
  };
  const byYear = prepareAxisChartData({ type: "groupedBar", dataBinding: { ...baseBinding, series: { fields: ["Year"] } } }, rows);
  const byYearAndTreatment = prepareAxisChartData({ type: "groupedBar", dataBinding: { ...baseBinding, series: { fields: ["Year", "Treatment"] } } }, rows);

  assert.equal(byYear.series.length, 2);
  assert.deepEqual(byYear.series.map((series) => series.name), ["2026", "2027"]);
  assert.equal(byYearAndTreatment.series.length, 4);
  assert.equal(new Set(byYearAndTreatment.series.map((series) => series.id)).size, 4);
  assert.deepEqual(byYearAndTreatment.series.map((series) => series.name), ["2026 · A", "2027 · A", "2026 · B", "2027 · B"]);
});

test("legacy long-format panels migrate to explicit field roles", () => {
  const binding = legacyBindingForPanel({
    type: "stackedBar",
    x: "date",
    xAxisMode: "date",
    seriesFrom: { nameField: "Age group", valueField: "deaths" },
    dateSelection: { column: "date", mode: "single", value: "02/05/2027" },
  });

  assert.equal(binding.x.field, "date");
  assert.deepEqual(binding.series.fields, ["Age group"]);
  assert.deepEqual(binding.measures.map((measure) => measure.field), ["deaths"]);
  assert.deepEqual(binding.filters[0].values, ["02/05/2027"]);
});

test("profiling distinguishes wide numeric measures from dimensions", () => {
  const profile = profileTabularData([
    { region: "North", date: "2027-05-01", cases: 10, deaths: 1 },
    { region: "South", date: "2027-05-02", cases: 12, deaths: 2 },
  ]);
  assert.equal(profile.shape, "wide");
  assert.deepEqual(profile.numericColumns, ["cases", "deaths"]);
  assert.ok(profile.categoryColumns.includes("region"));
  assert.ok(profile.temporalColumns.includes("date"));
});

test("CSV value changes refresh the source fingerprint and are reported", () => {
  const config = {
    pages: [{
      id: "page",
      label: "Page",
      sections: [{
        id: "section",
        title: "Section",
        panels: [{
          id: "chart",
          title: "Chart",
          type: "bar",
          dataSource: "source",
          dataBinding: {
            version: 2,
            x: { field: "group", type: "category" },
            measures: [{ field: "value", label: "Value" }],
            series: { fields: [] },
            filters: [],
            aggregation: "sum",
          },
          sourceSchema: {
            columns: ["group", "value"],
            signature: "group|value",
            rowCount: 1,
            dataFingerprint: profileTabularData([{ group: "A", value: 1 }]).fingerprint,
          },
        }],
      }],
    }],
  };

  const result = reconcileDashboardWithLoadedData(config, { source: [{ group: "A", value: 2 }] });
  assert.equal(result.reports.length, 1);
  assert.ok(result.reports[0].changes.includes("CSV values changed; chart data was refreshed."));
  assert.notEqual(result.config.pages[0].sections[0].panels[0].sourceSchema.dataFingerprint, config.pages[0].sections[0].panels[0].sourceSchema.dataFingerprint);
});
