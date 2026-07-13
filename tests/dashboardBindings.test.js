import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

import Papa from "papaparse";

import {
  isAxisPanel,
  migrateDashboardToDataModel,
  prepareAxisChartData,
} from "../src/lib/chartDataModel.js";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

test("every configured axis chart migrates to a valid V2 binding against its CSV", async () => {
  const rawConfig = JSON.parse(await readFile(path.join(root, "public/config/dashboard.json"), "utf8"));
  assert.equal(rawConfig.schemaVersion, 2);
  const config = migrateDashboardToDataModel(rawConfig);
  const sourceCache = new Map();
  const failures = [];
  let checked = 0;

  for (const page of config.pages ?? []) {
    for (const section of page.sections ?? []) {
      for (const panel of section.panels ?? []) {
        if (!isAxisPanel(panel)) continue;
        checked += 1;
        assert.equal(panel.dataBinding?.version, 2, `${panel.id} should have a V2 binding`);
        assert.equal(Object.hasOwn(panel, "x"), false, `${panel.id} should not retain the legacy x field`);
        assert.equal(Object.hasOwn(panel, "seriesFrom"), false, `${panel.id} should not retain legacy seriesFrom`);
        const source = config.dataSources?.[panel.dataSource];
        if (typeof source !== "string" || !source.toLowerCase().endsWith(".csv")) continue;
        let rows = sourceCache.get(source);
        if (!rows) {
          const text = await readFile(path.join(root, "public", source), "utf8");
          rows = Papa.parse(text, { header: true, dynamicTyping: true, skipEmptyLines: true }).data;
          sourceCache.set(source, rows);
        }
        const errors = prepareAxisChartData(panel, rows).diagnostics.filter((diagnostic) => diagnostic.severity === "error");
        if (errors.length > 0) failures.push(`${panel.id}: ${errors.map((error) => error.message).join("; ")}`);
      }
    }
  }

  assert.ok(checked > 0);
  assert.deepEqual(failures, []);
});

test("mortality age reference chart uses age only as x, not as cluster", async () => {
  const config = migrateDashboardToDataModel(JSON.parse(await readFile(path.join(root, "public/config/dashboard.json"), "utf8")));
  const panels = config.pages.flatMap((page) => page.sections.flatMap((section) => section.panels));
  const panel = panels.find((candidate) => candidate.id === "bio_mortality_age");
  assert.equal(panel.dataBinding.x.field, "Age group");
  assert.deepEqual(panel.dataBinding.series.fields, []);
  assert.ok(panel.dataBinding.filters.some((filter) => filter.field === "Age group" && !filter.values.includes("total_deaths")));
});

test("surgeries chart supports Year and Year plus Treatment clustering", async () => {
  const config = migrateDashboardToDataModel(JSON.parse(await readFile(path.join(root, "public/config/dashboard.json"), "utf8")));
  const panels = config.pages.flatMap((page) => page.sections.flatMap((section) => section.panels));
  const panel = panels.find((candidate) => candidate.id === "bio_delayed_healthcare");
  const source = config.dataSources[panel.dataSource];
  const text = await readFile(path.join(root, "public", source), "utf8");
  const rows = Papa.parse(text, { header: true, dynamicTyping: true, skipEmptyLines: true }).data;
  const byYear = prepareAxisChartData(panel, rows);
  const byYearAndTreatment = prepareAxisChartData({
    ...panel,
    dataBinding: {
      ...panel.dataBinding,
      series: { fields: ["Year", "Treatment"] },
    },
  }, rows);

  assert.equal(byYear.xType, "category");
  assert.equal(byYear.xValues.length, 12);
  assert.equal(byYear.series.length, 2);
  assert.equal(byYearAndTreatment.series.length, 8);
  assert.equal(new Set(byYearAndTreatment.series.map((series) => series.name)).size, 8);
});
