import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { isAxisPanel, migrateDashboardToDataModel } from "../src/lib/chartDataModel.js";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const configPath = path.join(root, "public", "config", "dashboard.json");

await migrateConfigFile(configPath);

async function migrateConfigFile(filePath) {
  const config = JSON.parse(await fs.readFile(filePath, "utf8"));
  await fs.writeFile(filePath, `${JSON.stringify(cleanMigratedConfig(config), null, 2)}\n`, "utf8");
  console.log(`Migrated ${path.relative(root, filePath)}.`);
}

function cleanMigratedConfig(config) {
  const migrated = migrateDashboardToDataModel(config);
  for (const page of migrated.pages ?? []) {
    for (const section of page.sections ?? []) {
      for (const panel of section.panels ?? []) {
        if (!isAxisPanel(panel)) continue;
        delete panel.x;
        delete panel.xAxisMode;
        delete panel.series;
        delete panel.seriesFrom;
        delete panel.dateSelection;
        delete panel.categorySelection;
        delete panel.dataFormat;
        if (Array.isArray(panel.filters)) {
          panel.filters = panel.filters.filter((filter) => filter?.filterId);
          if (panel.filters.length === 0) delete panel.filters;
        }
      }
    }
  }
  return migrated;
}
