import {
  chmodSync,
  closeSync,
  copyFileSync,
  existsSync,
  mkdirSync,
  openSync,
  readSync,
} from "node:fs";
import { dirname, resolve } from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const defaultCodexSourceDir = resolve(root, "../codex/codex-rs");
const codexSourceDir =
  process.env.HICODEX_CODEX_SOURCE_DIR ||
  defaultCodexSourceDir;
const providedBin = process.env.HICODEX_CODEX_BIN;
const targetTriple = process.env.HICODEX_CODEX_TARGET?.trim() || "";
const targetDir = resolve(root, "apps/desktop/src-tauri/binaries");
const targetInfo = targetInfoFor(targetTriple);
// Windows 上产物与 sidecar 都是 codex.exe，其它平台是 codex。
const exeSuffix = targetInfo.exeSuffix;
const targetBin = resolve(targetDir, `codex${exeSuffix}`);

function targetInfoFor(triple) {
  if (!triple) {
    return {
      arch: normalizeNodeArch(process.arch),
      exeSuffix: process.platform === "win32" ? ".exe" : "",
      platform: process.platform,
      triple: "",
    };
  }

  const arch = triple.startsWith("aarch64")
    ? "arm64"
    : triple.startsWith("x86_64")
      ? "x64"
      : undefined;
  const platform = triple.endsWith("apple-darwin")
    ? "darwin"
    : triple.includes("windows")
      ? "win32"
      : triple.includes("linux")
        ? "linux"
        : undefined;
  if (!arch || !platform) {
    throw new Error(`Unsupported Codex sidecar target: ${triple}`);
  }
  return {
    arch,
    exeSuffix: platform === "win32" ? ".exe" : "",
    platform,
    triple,
  };
}

function normalizeNodeArch(arch) {
  if (arch === "arm64" || arch === "x64") return arch;
  return arch;
}

function readHeader(path, size = 4096) {
  const fd = openSync(path, "r");
  const header = Buffer.alloc(size);
  let bytesRead = 0;
  try {
    bytesRead = readSync(fd, header, 0, header.length, 0);
  } finally {
    closeSync(fd);
  }
  return header.subarray(0, bytesRead);
}

function archFromCpuType(cpuType) {
  if (cpuType === 0x0100000c) return "arm64";
  if (cpuType === 0x01000007) return "x64";
  return undefined;
}

function detectMachOArchs(header) {
  if (header.length < 4) return undefined;
  const magic = header.subarray(0, 4).toString("hex");
  if (magic === "cafebabe" || magic === "cafebabf") {
    if (header.length < 8) return [];
    const count = header.readUInt32BE(4);
    const archs = [];
    const entrySize = magic === "cafebabf" ? 32 : 20;
    for (let index = 0; index < count; index += 1) {
      const offset = 8 + index * entrySize;
      if (header.length < offset + 4) break;
      const arch = archFromCpuType(header.readUInt32BE(offset));
      if (arch) archs.push(arch);
    }
    return Array.from(new Set(archs));
  }
  if (["feedface", "feedfacf"].includes(magic)) {
    if (header.length < 8) return [];
    const arch = archFromCpuType(header.readUInt32BE(4));
    return arch ? [arch] : [];
  }
  if (["cefaedfe", "cffaedfe"].includes(magic)) {
    if (header.length < 8) return [];
    const arch = archFromCpuType(header.readUInt32LE(4));
    return arch ? [arch] : [];
  }
  return undefined;
}

function detectElfArchs(header) {
  if (header.length < 20 || header[0] !== 0x7f || header[1] !== 0x45 || header[2] !== 0x4c || header[3] !== 0x46) {
    return undefined;
  }
  const littleEndian = header[5] === 1;
  const machine = littleEndian ? header.readUInt16LE(18) : header.readUInt16BE(18);
  if (machine === 183) return ["arm64"];
  if (machine === 62) return ["x64"];
  return [];
}

function detectPeArchs(header) {
  if (header.length < 0x40 || header[0] !== 0x4d || header[1] !== 0x5a) {
    return undefined;
  }
  const peOffset = header.readUInt32LE(0x3c);
  if (header.length < peOffset + 6) return [];
  if (header.subarray(peOffset, peOffset + 4).toString("ascii") !== "PE\u0000\u0000") {
    return [];
  }
  const machine = header.readUInt16LE(peOffset + 4);
  if (machine === 0xaa64) return ["arm64"];
  if (machine === 0x8664) return ["x64"];
  return [];
}

function detectNativeExecutable(path) {
  const header = readHeader(path);
  const isShebang = header.length >= 2 && header[0] === 0x23 && header[1] === 0x21;
  if (isShebang) return { archs: [], format: "script" };
  const machOArchs = detectMachOArchs(header);
  if (machOArchs) return { archs: machOArchs, format: "mach-o" };
  const elfArchs = detectElfArchs(header);
  if (elfArchs) return { archs: elfArchs, format: "elf" };
  const peArchs = detectPeArchs(header);
  if (peArchs) return { archs: peArchs, format: "pe" };
  return { archs: [], format: "unknown" };
}

function expectedFormatForPlatform(platform) {
  if (platform === "darwin") return "mach-o";
  if (platform === "linux") return "elf";
  if (platform === "win32") return "pe";
  return undefined;
}

function assertNativeExecutable(path, expected) {
  const detected = detectNativeExecutable(path);
  const expectedFormat = expectedFormatForPlatform(expected.platform);
  if (detected.format === "script" || !expectedFormat || detected.format !== expectedFormat) {
    throw new Error(
      `Codex sidecar must be a native executable, not a launcher script: ${path}. ` +
        "If using an npm Codex install, set HICODEX_CODEX_BIN to the platform vendor binary under @openai/codex-*/vendor/.../bin/codex.",
    );
  }
  if (expected.arch && !detected.archs.includes(expected.arch)) {
    const found = detected.archs.length > 0 ? detected.archs.join(", ") : "unknown";
    throw new Error(
      `Codex sidecar has wrong architecture for ${expected.triple || expected.platform}: ${path}. ` +
        `Expected ${expected.arch}, found ${found}.`,
    );
  }
}

mkdirSync(targetDir, { recursive: true });

let sourceBin = providedBin;
if (!sourceBin) {
  if (!existsSync(resolve(codexSourceDir, "Cargo.toml"))) {
    throw new Error(`Codex Rust workspace not found: ${codexSourceDir}`);
  }
  const build = spawnSync(
    "cargo",
    [
      "build",
      "--release",
      "--locked",
      "-p",
      "codex-cli",
      "--bin",
      "codex",
      ...(targetInfo.triple ? ["--target", targetInfo.triple] : []),
    ],
    { cwd: codexSourceDir, stdio: "inherit" },
  );
  if (build.status !== 0) {
    process.exit(build.status ?? 1);
  }
  sourceBin = targetInfo.triple
    ? resolve(codexSourceDir, "target", targetInfo.triple, "release", `codex${exeSuffix}`)
    : resolve(codexSourceDir, `target/release/codex${exeSuffix}`);
}

if (!existsSync(sourceBin)) {
  throw new Error(`Codex binary not found: ${sourceBin}`);
}

assertNativeExecutable(sourceBin, targetInfo);
copyFileSync(sourceBin, targetBin);
if (process.platform !== "win32") {
  chmodSync(targetBin, 0o755);
}
console.log(`Prepared Codex sidecar: ${targetBin}`);
