import { execFileSync } from "node:child_process";
import { createRequire } from "node:module";
import { mkdirSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const scriptDir = dirname(fileURLToPath(import.meta.url));
const packageRoot = resolve(scriptDir, "..");
const workspaceRoot = resolve(packageRoot, "../..");
const outDir = join(workspaceRoot, ".tmp/ui-tests");
const tscPath = join(workspaceRoot, "node_modules/typescript/bin/tsc");

rmSync(outDir, { force: true, recursive: true });
mkdirSync(outDir, { recursive: true });

execFileSync(process.execPath, [
  tscPath,
  "-p",
  join(packageRoot, "tsconfig.test.json"),
  "--pretty",
  "false",
], {
  cwd: packageRoot,
  stdio: "inherit",
});

writeFileSync(join(outDir, "package.json"), JSON.stringify({ type: "commonjs" }));

const requireFromTests = createRequire(join(outDir, "runner.cjs"));
const testDir = join(outDir, "packages/ui/test");
const testFiles = readdirSync(testDir)
  .filter((file) => file.endsWith(".test.js"))
  .sort();

if (testFiles.length === 0) {
  throw new Error("No UI test files were emitted.");
}

// i18n's active locale is a process-level singleton (state/i18n.ts). Any test that mounts
// <I18nProvider locale="…"> flips it via setActiveI18nLocale and never restores it. Because
// every test file runs in this one process in filename order, a zh-CN render in an earlier
// file (e.g. conversation-view) leaks into later files (e.g. right-rail) whose state code reads
// the module-level formatMessage and asserts English. Reset to the default after each runner so
// files start from a clean en-US baseline. Tests that assert zh-CN set it inside their own run().
const i18nRuntime = requireFromTests(join(outDir, "packages/ui/src/state/i18n.js"));

let count = 0;
for (const file of testFiles) {
  const modulePath = join(testDir, file);
  const loaded = requireFromTests(modulePath);
  const runners = Object.entries(loaded)
    .filter(([name, value]) => name !== "__esModule" && typeof value === "function")
    .sort(([left], [right]) => {
      if (left === "default") return -1;
      if (right === "default") return 1;
      return left.localeCompare(right);
    });

  if (runners.length === 0) {
    throw new Error(`${file} does not export a test runner function.`);
  }

  for (const [name, run] of runners) {
    await run();
    i18nRuntime.setActiveI18nLocale(i18nRuntime.FORGE_DEFAULT_LOCALE);
    count += 1;
    console.log(`ok ${file} ${name}`);
  }
}

console.log(`UI tests passed: ${count}`);
