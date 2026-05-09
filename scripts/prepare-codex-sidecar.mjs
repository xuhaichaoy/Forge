import { chmodSync, copyFileSync, existsSync, mkdirSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const defaultCodexSourceDir = resolve(root, "../codex/codex-rs");
const codexSourceDir =
  process.env.HICODEX_CODEX_SOURCE_DIR ||
  defaultCodexSourceDir;
const providedBin = process.env.HICODEX_CODEX_BIN;
const targetDir = resolve(root, "apps/desktop/src-tauri/binaries");
const targetBin = resolve(targetDir, "codex");

mkdirSync(targetDir, { recursive: true });

let sourceBin = providedBin;
if (!sourceBin) {
  if (!existsSync(resolve(codexSourceDir, "Cargo.toml"))) {
    throw new Error(`Codex Rust workspace not found: ${codexSourceDir}`);
  }
  const build = spawnSync(
    "cargo",
    ["build", "--release", "-p", "codex-cli", "--bin", "codex"],
    { cwd: codexSourceDir, stdio: "inherit" },
  );
  if (build.status !== 0) {
    process.exit(build.status ?? 1);
  }
  sourceBin = resolve(codexSourceDir, "target/release/codex");
}

if (!existsSync(sourceBin)) {
  throw new Error(`Codex binary not found: ${sourceBin}`);
}

copyFileSync(sourceBin, targetBin);
chmodSync(targetBin, 0o755);
console.log(`Prepared Codex sidecar: ${targetBin}`);
