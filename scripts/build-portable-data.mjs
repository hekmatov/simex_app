import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const rootDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const publicDir = path.join(rootDir, "public");
const configPath = path.join(publicDir, "config", "dashboard.json");
const outputPath = path.join(publicDir, "portable-dashboard-data.js");
const embedPortableData = process.env.SIMEX_EMBED_PORTABLE_DATA !== "0";

if (!embedPortableData) {
  const payload = {
    type: "simex-dashboard-v2-portable-data",
    generatedAt: new Date().toISOString(),
    config: null,
    sources: {},
  };
  const js = `window.SIMEX_PORTABLE_DASHBOARD = ${JSON.stringify(payload)};\n`;
  await fs.writeFile(outputPath, js, "utf8");
  console.log(`Wrote ${path.relative(rootDir, outputPath)} as a cloud-hosting stub without embedded data.`);
  process.exit(0);
}

const config = JSON.parse(stripBom(await fs.readFile(configPath, "utf8")));
const sources = {};

for (const source of Object.values(config.dataSources ?? {})) {
  if (!source || typeof source !== "string") {
    continue;
  }

  const normalizedSource = source.replaceAll("\\", "/");
  const absoluteSourcePath = path.join(publicDir, normalizedSource);
  const extension = path.extname(normalizedSource).toLowerCase();

  if (extension === ".json" || extension === ".geojson") {
    sources[normalizedSource] = {
      kind: "json",
      data: JSON.parse(stripBom(await fs.readFile(absoluteSourcePath, "utf8"))),
    };
    continue;
  }

  if (extension === ".csv") {
    sources[normalizedSource] = {
      kind: "csv",
      text: await fs.readFile(absoluteSourcePath, "utf8"),
    };
  }
}

const payload = {
  type: "simex-dashboard-v2-portable-data",
  generatedAt: new Date().toISOString(),
  config,
  sources,
};

const js = `window.SIMEX_PORTABLE_DASHBOARD = ${JSON.stringify(payload)};\n`;
await fs.writeFile(outputPath, js, "utf8");
console.log(`Wrote ${path.relative(rootDir, outputPath)} with ${Object.keys(sources).length} embedded data source(s).`);

function stripBom(text) {
  return text.replace(/^\uFEFF/, "");
}
