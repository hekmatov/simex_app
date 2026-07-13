import test from "node:test";
import assert from "node:assert/strict";

import { reconcileDashboardWithLoadedData } from "../src/lib/dashboardCompatibility.js";
import { profileTabularData } from "../src/lib/chartDataModel.js";

const rows = [
  { Month: "January", Cases: 3 },
  { Month: "February", Cases: 5 },
];

function dashboardWithFingerprint(fingerprint) {
  const profile = profileTabularData(rows);
  return {
    pages: [{
      id: "page",
      sections: [{
        id: "section",
        panels: [{
          id: "panel",
          title: "Test chart",
          type: "line",
          dataSource: "source",
          dataBinding: {
            x: { field: "Month", type: "temporal" },
            measures: [{ field: "Cases" }],
            series: { fields: [] },
            filters: [],
          },
          sourceSchema: {
            columns: profile.columns,
            signature: profile.columns.map((column) => column.name).join("|"),
            rowCount: profile.rowCount,
            dataFingerprint: fingerprint,
          },
        }],
      }],
    }],
  };
}

test("axis repairs do not report a CSV change when the fingerprint is unchanged", () => {
  const fingerprint = profileTabularData(rows).fingerprint;
  const result = reconcileDashboardWithLoadedData(dashboardWithFingerprint(fingerprint), { source: rows });

  assert.equal(result.config.pages[0].sections[0].panels[0].dataBinding.x.type, "category");
  assert.deepEqual(result.reports, []);
});

test("a changed CSV fingerprint still produces a compatibility report", () => {
  const result = reconcileDashboardWithLoadedData(dashboardWithFingerprint("older-data"), { source: rows });

  assert.equal(result.reports.length, 1);
  assert.ok(result.reports[0].changes.some((change) => change.includes("CSV values changed")));
});
