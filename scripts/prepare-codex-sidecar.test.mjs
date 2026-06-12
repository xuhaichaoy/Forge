import { strict as assert } from "node:assert";
import { spawnSync } from "node:child_process";
import {
  chmodSync,
  closeSync,
  existsSync,
  mkdtempSync,
  mkdirSync,
  openSync,
  readFileSync,
  readSync,
  rmSync,
  statSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { delimiter, join, resolve } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const root = resolve(fileURLToPath(new URL("..", import.meta.url)));
const scriptPath = resolve(root, "scripts/prepare-codex-sidecar.mjs");
const targetBin = resolve(
  root,
  "apps/desktop/src-tauri/binaries",
  process.platform === "win32" ? "codex.exe" : "codex",
);

function targetSnapshot() {
  if (!existsSync(targetBin)) return null;
  const stat = statSync(targetBin);
  const fd = openSync(targetBin, "r");
  const header = Buffer.alloc(Math.min(16, stat.size));
  let bytesRead = 0;
  try {
    bytesRead = readSync(fd, header, 0, header.length, 0);
  } finally {
    closeSync(fd);
  }

  return {
    size: stat.size,
    mode: stat.mode,
    header: header.subarray(0, bytesRead).toString("hex"),
  };
}

function writeMinimalMachO(path, arch) {
  const cpuTypes = {
    arm64: 0x0100000c,
    x64: 0x01000007,
  };
  const buffer = Buffer.alloc(32);
  buffer.writeUInt32LE(0xfeedfacf, 0);
  buffer.writeUInt32LE(cpuTypes[arch], 4);
  writeFileSync(path, buffer);
  chmodSync(path, 0o755);
}

test("sidecar preparation rejects npm launcher scripts before copying", () => {
  const tempDir = mkdtempSync(join(tmpdir(), "hicodex-sidecar-test-"));
  const launcher = join(tempDir, process.platform === "win32" ? "codex.cmd" : "codex");
  const before = targetSnapshot();
  try {
    writeFileSync(launcher, "#!/usr/bin/env node\nconsole.log('wrapper');\n");
    chmodSync(launcher, 0o755);

    const result = spawnSync(process.execPath, [scriptPath], {
      cwd: root,
      encoding: "utf8",
      env: {
        ...process.env,
        HICODEX_CODEX_BIN: launcher,
        HICODEX_CODEX_SOURCE_DIR: resolve(tempDir, "unused-codex-rs"),
      },
    });

    assert.notEqual(result.status, 0);
    assert.match(
      `${result.stdout}\n${result.stderr}`,
      /Codex sidecar must be a native executable, not a launcher script/,
    );
    assert.deepEqual(targetSnapshot(), before);
  } finally {
    rmSync(tempDir, { recursive: true, force: true });
  }
});

test("sidecar preparation rejects wrong macOS architecture before copying", () => {
  const tempDir = mkdtempSync(join(tmpdir(), "hicodex-sidecar-test-"));
  const wrongArchBin = join(tempDir, "codex");
  const before = targetSnapshot();
  try {
    writeMinimalMachO(wrongArchBin, "x64");

    const result = spawnSync(process.execPath, [scriptPath], {
      cwd: root,
      encoding: "utf8",
      env: {
        ...process.env,
        HICODEX_CODEX_BIN: wrongArchBin,
        HICODEX_CODEX_SOURCE_DIR: resolve(tempDir, "unused-codex-rs"),
        HICODEX_CODEX_TARGET: "aarch64-apple-darwin",
      },
    });

    assert.notEqual(result.status, 0);
    assert.match(
      `${result.stdout}\n${result.stderr}`,
      /Codex sidecar has wrong architecture for aarch64-apple-darwin/,
    );
    assert.deepEqual(targetSnapshot(), before);
  } finally {
    rmSync(tempDir, { recursive: true, force: true });
  }
});

test("sidecar preparation builds Codex sidecar with locked dependencies", () => {
  const tempDir = mkdtempSync(join(tmpdir(), "hicodex-sidecar-test-"));
  const fakeBinDir = join(tempDir, "bin");
  const codexSourceDir = join(tempDir, "codex-rs");
    const argsPath = join(tempDir, "cargo-args.json");
    const before = targetSnapshot();
    try {
      mkdirSync(fakeBinDir, { recursive: true });
      mkdirSync(codexSourceDir, { recursive: true });
      writeFileSync(join(codexSourceDir, "Cargo.toml"), "[workspace]\n");
    const fakeCargoScript = join(tempDir, "fake-cargo.mjs");
    writeFileSync(
      fakeCargoScript,
      [
        "import { writeFileSync } from 'node:fs';",
        "writeFileSync(process.env.FAKE_CARGO_ARGS_PATH, JSON.stringify(process.argv.slice(2)));",
        "process.exit(7);",
        "",
      ].join("\n"),
    );
    const fakeCargo = join(fakeBinDir, process.platform === "win32" ? "cargo.cmd" : "cargo");
    if (process.platform === "win32") {
      writeFileSync(fakeCargo, `@"${process.execPath}" "${fakeCargoScript}" %*\r\n`);
    } else {
      writeFileSync(fakeCargo, `#!/bin/sh\nexec "${process.execPath}" "${fakeCargoScript}" "$@"\n`);
      chmodSync(fakeCargo, 0o755);
    }

    const result = spawnSync(process.execPath, [scriptPath], {
      cwd: root,
      encoding: "utf8",
      env: {
        ...process.env,
        FAKE_CARGO_ARGS_PATH: argsPath,
        HICODEX_CODEX_SOURCE_DIR: codexSourceDir,
        HICODEX_CODEX_TARGET: "aarch64-apple-darwin",
        PATH: `${fakeBinDir}${delimiter}${process.env.PATH ?? ""}`,
      },
    });

    assert.equal(result.status, 7);
    const args = JSON.parse(readFileSync(argsPath, "utf8"));
    assert.ok(args.includes("--locked"));
    assert.deepEqual(targetSnapshot(), before);
  } finally {
    rmSync(tempDir, { recursive: true, force: true });
  }
});
