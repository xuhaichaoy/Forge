import { strict as assert } from "node:assert";
import { spawnSync } from "node:child_process";
import { chmodSync, existsSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const root = resolve(fileURLToPath(new URL("..", import.meta.url)));
const scriptPath = resolve(root, "scripts/smoke-codex-sidecar.mjs");
const smokeFakeSkip =
  process.platform === "win32"
    ? "fake sidecar uses a Node script shim; real Windows sidecar smoke needs a native codex.exe"
    : false;

function writeFakeCodex(dir, mode, options = {}) {
  const fake = join(dir, process.platform === "win32" ? "codex.cmd" : "codex");
  const stopFile = options.stopFile ? JSON.stringify(options.stopFile) : "null";
  const source =
    "#!/usr/bin/env node\n" +
    "const { writeFileSync } = require('node:fs');\n" +
    `const stopFile = ${stopFile};\n` +
    "const args = process.argv.slice(2);\n" +
    "if (args[0] === '--version') { console.log('fake-codex 1.0.0'); process.exit(0); }\n" +
    "if (args[0] === 'app-server') {\n" +
    (mode === "alive"
      ? "  process.on('SIGTERM', () => process.exit(0));\n" +
        "  process.stdin.on('data', (chunk) => {\n" +
        "    for (const line of chunk.toString('utf8').trim().split(/\\n+/)) {\n" +
        "      if (!line) continue;\n" +
        "      const message = JSON.parse(line);\n" +
        "      if (message.method === 'initialize') {\n" +
        "        console.log(JSON.stringify({ id: message.id, result: { userAgent: 'fake-codex 1.0.0', codexHome: process.env.CODEX_HOME, platformFamily: 'unix', platformOs: 'macos' } }));\n" +
        "      }\n" +
        "    }\n" +
        "  });\n" +
        "  setInterval(() => {}, 1000);\n"
      : mode === "hang"
        ? "  process.on('SIGTERM', () => { if (stopFile) writeFileSync(stopFile, 'stopped'); process.exit(0); });\n" +
          "  process.stdin.resume();\n" +
          "  setInterval(() => {}, 1000);\n"
      : "  console.error('fake app-server failed'); process.exit(17);\n") +
    "}\n" +
    "else { process.exit(2); }\n";
  writeFileSync(fake, source);
  chmodSync(fake, 0o755);
  return fake;
}

function runSmoke(fake, extraEnv = {}) {
  return spawnSync(process.execPath, [scriptPath], {
    cwd: root,
    encoding: "utf8",
    env: {
      ...process.env,
      HICODEX_CODEX_BIN: fake,
      HICODEX_SIDECAR_SMOKE_TIMEOUT_MS: "100",
      HICODEX_SIDECAR_VERSION_TIMEOUT_MS: "5000",
      ...extraEnv,
    },
  });
}

test("sidecar smoke passes when app-server stays alive past the timeout", { skip: smokeFakeSkip }, () => {
  const tempDir = mkdtempSync(join(tmpdir(), "hicodex-sidecar-smoke-test-"));
  try {
    const fake = writeFakeCodex(tempDir, "alive");
    const result = runSmoke(fake);
    assert.equal(result.status, 0, result.stderr);
    const payload = JSON.parse(result.stdout);
    assert.equal(payload.ok, true);
    assert.equal(payload.version, "fake-codex 1.0.0");
    assert.match(payload.codexHome, /hicodex-sidecar-smoke-/);
    assert.match(payload.codexHome, /codex-home$/);
    assert.equal(payload.platformFamily, "unix");
    assert.equal(payload.platformOs, "macos");
    assert.equal(payload.aliveAfterMs, 100);
  } finally {
    rmSync(tempDir, { recursive: true, force: true });
  }
});

test("sidecar smoke fails when app-server exits before the timeout", { skip: smokeFakeSkip }, () => {
  const tempDir = mkdtempSync(join(tmpdir(), "hicodex-sidecar-smoke-test-"));
  try {
    const fake = writeFakeCodex(tempDir, "exit");
    const result = runSmoke(fake);
    assert.notEqual(result.status, 0);
    assert.match(result.stderr, /Codex app-server exited before initialize response/);
    assert.match(result.stderr, /fake app-server failed/);
  } finally {
    rmSync(tempDir, { recursive: true, force: true });
  }
});

test("sidecar smoke stops app-server when initialize response times out", { skip: smokeFakeSkip }, () => {
  const tempDir = mkdtempSync(join(tmpdir(), "hicodex-sidecar-smoke-test-"));
  try {
    const stopFile = join(tempDir, "stopped");
    const fake = writeFakeCodex(tempDir, "hang", { stopFile });
    const result = runSmoke(fake, {
      HICODEX_SIDECAR_PROTOCOL_TIMEOUT_MS: "100",
    });
    assert.notEqual(result.status, 0);
    assert.match(result.stderr, /Timed out waiting for initialize response/);
    assert.equal(existsSync(stopFile), true);
  } finally {
    rmSync(tempDir, { recursive: true, force: true });
  }
});
