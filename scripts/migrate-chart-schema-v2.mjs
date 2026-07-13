import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { isAxisPanel, migrateDashboardToDataModel } from "../src/lib/chartDataModel.js";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const configPath = path.join(root, "public", "config", "dashboard.json");
const packageBundlePath = path.join(root, "packaged-dashboard-bundle.json");

await migrateConfigFile(configPath);

try {
  const bundle = JSON.parse(await fs.readFile(packageBundlePath, "utf8"));
  if (bundle?.config) {
    bundle.version = 2;
    bundle.config = cleanMigratedConfig(bundle.config);
    await fs.writeFile(packageBundlePath, `${JSON.stringify(bundle, null, 2)}\n`, "utf8");
    console.log(`Migrated ${path.relative(root, packageBundlePath)}.`);
  }
} catch (error) {
  if (error.code !== "ENOENT") throw error;
}

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
