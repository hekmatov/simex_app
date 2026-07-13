import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const rootDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const distDir = path.join(rootDir, "dist");
const releaseRootDir = path.join(rootDir, "release");
const preferredReleaseDir = path.join(releaseRootDir, "SimEx Dashboard V2 Flashdrive");
let releaseDir = preferredReleaseDir;

await fs.mkdir(releaseRootDir, { recursive: true });
try {
  await fs.rm(preferredReleaseDir, { recursive: true, force: true });
} catch (error) {
  releaseDir = path.join(releaseRootDir, `SimEx Dashboard V2 Flashdrive ${timestampForFolder()}`);
  console.warn(`Could not replace the existing flash-drive folder because it is locked. Writing a fresh package to ${path.relative(rootDir, releaseDir)} instead.`);
}
await fs.cp(distDir, releaseDir, { recursive: true });

await fs.writeFile(
  path.join(releaseDir, "START_DASHBOARD.bat"),
  `@echo off
setlocal
cd /d "%~dp0"
powershell.exe -NoProfile -ExecutionPolicy Bypass -File "%~dp0start-dashboard-server.ps1"
if errorlevel 1 (
  echo.
  echo The dashboard launcher stopped because of an error.
  echo Please copy the error text above and share it with the project maintainer.
  echo.
  pause
)
`,
  "utf8",
);

await fs.writeFile(
  path.join(releaseDir, "start-dashboard-server.ps1"),
  `$ErrorActionPreference = "Stop"
$root = Split-Path -Parent $MyInvocation.MyCommand.Path
$listener = $null
$port = $null

foreach ($candidatePort in 8765..8799) {
  try {
    $candidateListener = [System.Net.HttpListener]::new()
    $candidateListener.Prefixes.Add("http://127.0.0.1:$candidatePort/")
    $candidateListener.Start()
    $listener = $candidateListener
    $port = $candidatePort
    break
  } catch {
    if ($candidateListener) {
      try { $candidateListener.Close() } catch {}
    }
  }
}

if (-not $listener) {
  throw "Could not start the dashboard server on ports 8765-8799. Another app may be blocking local web servers."
}

$url = "http://127.0.0.1:$port/"
Start-Process $url
Write-Host "SimEx Dashboard V2 is running at $url"
Write-Host "Close this window to stop the dashboard server."

function Get-ContentType($path) {
  switch ([System.IO.Path]::GetExtension($path).ToLowerInvariant()) {
    ".html" { return "text/html; charset=utf-8" }
    ".js" { return "text/javascript; charset=utf-8" }
    ".css" { return "text/css; charset=utf-8" }
    ".json" { return "application/json; charset=utf-8" }
    ".geojson" { return "application/geo+json; charset=utf-8" }
    ".csv" { return "text/csv; charset=utf-8" }
    ".png" { return "image/png" }
    ".jpg" { return "image/jpeg" }
    ".jpeg" { return "image/jpeg" }
    ".svg" { return "image/svg+xml" }
    default { return "application/octet-stream" }
  }
}

try {
  while ($true) {
    $context = $listener.GetContext()
    try {
      $requestPath = [uri]::UnescapeDataString($context.Request.Url.AbsolutePath)
      if ($requestPath -eq "/") { $requestPath = "/index.html" }
      $relative = $requestPath.TrimStart("/") -replace "/", [System.IO.Path]::DirectorySeparatorChar
      $fullPath = [System.IO.Path]::GetFullPath((Join-Path $root $relative))

      if (-not $fullPath.StartsWith($root, [System.StringComparison]::OrdinalIgnoreCase) -or -not (Test-Path -LiteralPath $fullPath -PathType Leaf)) {
        $body = [System.Text.Encoding]::UTF8.GetBytes("Not found")
        $context.Response.StatusCode = 404
        $context.Response.ContentType = "text/plain; charset=utf-8"
        $context.Response.ContentLength64 = $body.Length
        $context.Response.OutputStream.Write($body, 0, $body.Length)
      } else {
        $body = [System.IO.File]::ReadAllBytes($fullPath)
        $context.Response.StatusCode = 200
        $context.Response.ContentType = Get-ContentType $fullPath
        $context.Response.ContentLength64 = $body.Length
        $context.Response.OutputStream.Write($body, 0, $body.Length)
      }
    } finally {
      $context.Response.OutputStream.Close()
    }
  }
} finally {
  $listener.Stop()
}
`,
  "utf8",
);

await fs.writeFile(
  path.join(releaseDir, "START_HERE.md"),
  `# SimEx Dashboard V2 Flash Drive Package

## Open The Dashboard

First try double-clicking:

\`\`\`text
index.html
\`\`\`

If your browser shows a blank page, double-click:

\`\`\`text
START_DASHBOARD.bat
\`\`\`

That starts a tiny local web server using built-in Windows PowerShell and opens the dashboard in your browser. No Docker, Python, Node, pnpm, or installed web server is needed for viewers.

## Share Scenario Edits

Use edit mode inside the dashboard:

- \`Upload CSV\` adds a CSV as a dashboard data source.
- \`Export bundle\` saves dashboard edits plus uploaded CSV data into one JSON bundle.
- \`Import bundle\` restores that JSON bundle later.
- To make browser edits the package default, use \`Export package default\` before packaging and save \`packaged-dashboard-bundle.json\` in the project root.

## Caveats

- Online map tiles require internet access.
- Keep the PowerShell window open while using \`START_DASHBOARD.bat\`.
- If an institution has strict browser security rules, host this folder on any static file host instead.
`,
  "utf8",
);

console.log(`Flash-drive package written to ${path.relative(rootDir, releaseDir)}`);

function timestampForFolder() {
  const date = new Date();
  const pad = (value) => String(value).padStart(2, "0");
  return [
    date.getFullYear(),
    pad(date.getMonth() + 1),
    pad(date.getDate()),
    "-",
    pad(date.getHours()),
    pad(date.getMinutes()),
    pad(date.getSeconds()),
  ].join("");
}
