#!/usr/bin/env node
// Extracts the locally installed Codex Desktop app.asar to /private/tmp/codex-asar
// so HiCodex contributors can read it as the UI source-of-truth without copying it
// into the repo. See docs/DEVELOPMENT.md "Codex Desktop evidence workflow".

import { spawnSync } from "node:child_process";
import { copyFileSync, existsSync, mkdirSync, readdirSync, rmSync, statSync } from "node:fs";

const ASAR_PATH = process.env.HICODEX_CODEX_ASAR
  ?? "/Applications/Codex.app/Contents/Resources/app.asar";
const OUT_DIR = process.env.HICODEX_CODEX_ASAR_OUT
  ?? "/private/tmp/codex-asar";

const FORCE = process.argv.includes("--force");
const PRETTY = process.argv.includes("--pretty");

if (!existsSync(ASAR_PATH)) {
  console.error(`[codex-asar] not found: ${ASAR_PATH}`);
  console.error("[codex-asar] install Codex Desktop or set HICODEX_CODEX_ASAR=/path/to/app.asar");
  process.exit(1);
}

const previous = existsSync(OUT_DIR) ? statSync(OUT_DIR).mtimeMs : 0;
const incoming = statSync(ASAR_PATH).mtimeMs;
const upToDate = existsSync(OUT_DIR) && previous >= incoming;

if (upToDate && !FORCE) {
  console.log(`[codex-asar] already up to date at ${OUT_DIR} (use --force to re-extract)`);
} else {
  if (existsSync(OUT_DIR)) rmSync(OUT_DIR, { recursive: true, force: true });
  mkdirSync(OUT_DIR, { recursive: true });

  const result = spawnSync(
    "npx",
    ["--yes", "@electron/asar", "extract", ASAR_PATH, OUT_DIR],
    { stdio: "inherit" },
  );
  if (result.status !== 0) process.exit(result.status ?? 1);
  console.log(`[codex-asar] extracted to ${OUT_DIR}`);
}

if (PRETTY) prettifyAssets();

printIndex();

function printIndex() {
  const assets = `${OUT_DIR}/webview/assets`;
  if (!existsSync(assets)) return;
  console.log(`[codex-asar] webview assets: ${assets}`);
  if (existsSync(`${OUT_DIR}/pretty`)) {
    console.log(`[codex-asar] prettified mirror: ${OUT_DIR}/pretty`);
  }
  console.log("[codex-asar] grep entry points (examples):");
  console.log(`  rg -l 'workedFor|multi-agent-action' ${assets}`);
  console.log(`  rg -l 'sortKey|updated_at|isSubagent' ${assets}`);
}

function prettifyAssets() {
  const assets = `${OUT_DIR}/webview/assets`;
  if (!existsSync(assets)) {
    console.warn(`[codex-asar] no webview/assets/ to prettify`);
    return;
  }
  const prettyDir = `${OUT_DIR}/pretty`;
  // Skip if pretty mirror is fresher than the extracted assets and not --force.
  const prettyMtime = existsSync(prettyDir) ? statSync(prettyDir).mtimeMs : 0;
  const assetsMtime = statSync(assets).mtimeMs;
  if (prettyMtime >= assetsMtime && !FORCE) {
    console.log(`[codex-asar] pretty mirror up to date at ${prettyDir} (use --force to rebuild)`);
    return;
  }

  if (existsSync(prettyDir)) rmSync(prettyDir, { recursive: true, force: true });
  mkdirSync(prettyDir, { recursive: true });

  const files = readdirSync(assets).filter(f => f.endsWith(".js"));
  for (const file of files) {
    copyFileSync(`${assets}/${file}`, `${prettyDir}/${file.replace(/\.js$/, ".pretty.js")}`);
  }
  console.log(`[codex-asar] prettifying ${files.length} chunks → ${prettyDir}`);

  const result = spawnSync(
    "npx",
    [
      "--yes", "prettier@3.8.3",
      "--parser", "babel",
      "--print-width", "120",
      "--log-level", "warn",
      "--no-config",
      "--write", `${prettyDir}/*.pretty.js`,
    ],
    { stdio: "inherit" },
  );
  if (result.status !== 0) {
    console.warn(`[codex-asar] prettier exited with status ${result.status}; some files may not be formatted`);
  }
}
