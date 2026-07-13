import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const rootDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const publicDir = path.join(rootDir, "public");
const configPath = path.join(publicDir, "config", "dashboard.json");
const defaultBundlePath = path.join(rootDir, "packaged-dashboard-bundle.json");
const BUNDLE_TYPE = "simex-dashboard-v2-bundle";

const inputPath = path.resolve(rootDir, process.argv[2] ?? defaultBundlePath);

const bundle = JSON.parse(stripBom(await fs.readFile(inputPath, "utf8")));
if (bundle?.bundleType !== BUNDLE_TYPE || !bundle.config) {
  throw new Error(`${path.relative(rootDir, inputPath)} is not a valid SimEx dashboard bundle.`);
}

const promotedConfig = structuredClone(bundle.config);
promotedConfig.dataSources = { ...(promotedConfig.dataSources ?? {}) };

await fs.mkdir(path.dirname(configPath), { recursive: true });
await fs.mkdir(path.join(publicDir, "data", "uploaded"), { recursive: true });

for (const [sourceId, source] of Object.entries(bundle.uploadedCsvSources ?? {})) {
  if (source?.type !== "uploadedCsv") {
    continue;
  }

  const fileName = `${safeFileStem(source.fileName ?? sourceId)}-${safeFileStem(sourceId)}.csv`;
  const relativePath = `data/uploaded/${fileName}`;
  await fs.writeFile(path.join(publicDir, relativePath), source.csvText ?? "", "utf8");
  promotedConfig.dataSources[sourceId] = relativePath;
}

for (const [sourceId, source] of Object.entries(promotedConfig.dataSources)) {
  if (source?.type === "uploadedCsv") {
    const fileName = `${safeFileStem(source.fileName ?? sourceId)}-${safeFileStem(sourceId)}.csv`;
    const relativePath = `data/uploaded/${fileName}`;
    await fs.writeFile(path.join(publicDir, relativePath), source.csvText ?? "", "utf8");
    promotedConfig.dataSources[sourceId] = relativePath;
  }
}

await fs.writeFile(configPath, `${JSON.stringify(promotedConfig, null, 2)}\n`, "utf8");

console.log(`Promoted ${path.relative(rootDir, inputPath)} into ${path.relative(rootDir, configPath)}.`);
console.log("Review the Git diff, then commit the updated config and any files under public/data/uploaded.");

function safeFileStem(value) {
  return String(value ?? "uploaded")
    .replace(/\.[^.]+$/, "")
    .replace(/[^a-z0-9_-]+/gi, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 80)
    || "uploaded";
}

function stripBom(text) {
  return text.replace(/^\uFEFF/, "");
}
