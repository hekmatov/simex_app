import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const rootDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const publicDir = path.join(rootDir, "public");
const configPath = path.join(publicDir, "config", "dashboard.json");
const packageDefaultBundlePath = path.join(rootDir, "packaged-dashboard-bundle.json");
const outputPath = path.join(publicDir, "portable-dashboard-data.js");
const BUNDLE_TYPE = "simex-dashboard-v2-bundle";
const embedPortableData = process.env.SIMEX_EMBED_PORTABLE_DATA !== "0";

if (!embedPortableData) {
  const payload = {
    type: "simex-dashboard-v2-portable-data",
    generatedAt: new Date().toISOString(),
    packageDefault: false,
    config: null,
    sources: {},
  };
  const js = `window.SIMEX_PORTABLE_DASHBOARD = ${JSON.stringify(payload)};\n`;
  await fs.writeFile(outputPath, js, "utf8");
  console.log(`Wrote ${path.relative(rootDir, outputPath)} as a cloud-hosting stub without embedded data.`);
  process.exit(0);
}

const config = await portableConfig();
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
  packageDefault: Boolean(await fileExists(packageDefaultBundlePath)),
  config,
  sources,
};

const js = `window.SIMEX_PORTABLE_DASHBOARD = ${JSON.stringify(payload)};\n`;
await fs.writeFile(outputPath, js, "utf8");
console.log(`Wrote ${path.relative(rootDir, outputPath)} with ${Object.keys(sources).length} embedded data source(s).`);

async function portableConfig() {
  const bundledConfig = await packageDefaultConfig();
  if (bundledConfig) {
    console.log(`Using package default bundle: ${path.relative(rootDir, packageDefaultBundlePath)}`);
    return bundledConfig;
  }
  return JSON.parse(stripBom(await fs.readFile(configPath, "utf8")));
}

async function packageDefaultConfig() {
  if (!(await fileExists(packageDefaultBundlePath))) {
    return null;
  }

  const bundle = JSON.parse(stripBom(await fs.readFile(packageDefaultBundlePath, "utf8")));
  if (bundle?.bundleType !== BUNDLE_TYPE || !bundle.config) {
    throw new Error(`${path.relative(rootDir, packageDefaultBundlePath)} is not a valid SimEx dashboard bundle.`);
  }

  return {
    ...bundle.config,
    dataSources: {
      ...(bundle.config.dataSources ?? {}),
      ...(bundle.uploadedCsvSources ?? {}),
    },
  };
}

async function fileExists(filePath) {
  try {
    await fs.access(filePath);
    return true;
  } catch {
    return false;
  }
}

function stripBom(text) {
  return text.replace(/^\uFEFF/, "");
}
