#!/usr/bin/env node
// Extracts the locally installed Codex Desktop app.asar to /private/tmp/codex-asar
// so HiCodex contributors can read it as the UI source-of-truth without copying it
// into the repo. See docs/DEVELOPMENT.md "Codex Desktop evidence workflow".

import { spawnSync } from "node:child_process";
import { existsSync, mkdirSync, rmSync, statSync } from "node:fs";

const ASAR_PATH = process.env.HICODEX_CODEX_ASAR
  ?? "/Applications/Codex.app/Contents/Resources/app.asar";
const OUT_DIR = process.env.HICODEX_CODEX_ASAR_OUT
  ?? "/private/tmp/codex-asar";

if (!existsSync(ASAR_PATH)) {
  console.error(`[codex-asar] not found: ${ASAR_PATH}`);
  console.error("[codex-asar] install Codex Desktop or set HICODEX_CODEX_ASAR=/path/to/app.asar");
  process.exit(1);
}

const previous = existsSync(OUT_DIR) ? statSync(OUT_DIR).mtimeMs : 0;
const incoming = statSync(ASAR_PATH).mtimeMs;
if (existsSync(OUT_DIR) && previous >= incoming && !process.argv.includes("--force")) {
  console.log(`[codex-asar] already up to date at ${OUT_DIR} (use --force to re-extract)`);
  printIndex();
  process.exit(0);
}

if (existsSync(OUT_DIR)) rmSync(OUT_DIR, { recursive: true, force: true });
mkdirSync(OUT_DIR, { recursive: true });

const result = spawnSync(
  "npx",
  ["--yes", "@electron/asar", "extract", ASAR_PATH, OUT_DIR],
  { stdio: "inherit" },
);
if (result.status !== 0) process.exit(result.status ?? 1);

console.log(`[codex-asar] extracted to ${OUT_DIR}`);
printIndex();

function printIndex() {
  const assets = `${OUT_DIR}/webview/assets`;
  if (!existsSync(assets)) return;
  console.log(`[codex-asar] webview assets: ${assets}`);
  console.log("[codex-asar] grep entry points (examples):");
  console.log(`  rg -l 'workedFor|multi-agent-action' ${assets}`);
  console.log(`  rg -l 'sortKey|updated_at|isSubagent' ${assets}`);
}
