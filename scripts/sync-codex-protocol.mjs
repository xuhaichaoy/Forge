import { cpSync, existsSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, resolve } from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const codexRoot = resolve(root, "../codex/codex-rs");
// FORGE_* is the canonical env namespace; HICODEX_* stays accepted as a legacy alias.
const source =
  process.env.FORGE_CODEX_PROTOCOL_DIR ||
  process.env.HICODEX_CODEX_PROTOCOL_DIR ||
  generateExperimentalProtocolTypes();
const target = resolve(root, "packages/codex-protocol/src/generated");

if (!existsSync(source)) {
  throw new Error(`Codex protocol directory not found: ${source}`);
}

rmSync(target, { recursive: true, force: true });
mkdirSync(target, { recursive: true });
cpSync(source, target, { recursive: true });

writeFileSync(
  resolve(root, "packages/codex-protocol/src/generated.ts"),
  [
    "export type { ClientRequest } from './generated/ClientRequest';",
    "export type { ClientNotification } from './generated/ClientNotification';",
    "export type { ServerNotification } from './generated/ServerNotification';",
    "export type { ServerRequest } from './generated/ServerRequest';",
    "export type { InitializeParams } from './generated/InitializeParams';",
    "export type { InitializeResponse } from './generated/InitializeResponse';",
    "export type { ThreadItem } from './generated/v2/ThreadItem';",
    "export type { Thread } from './generated/v2/Thread';",
    "export type { Turn } from './generated/v2/Turn';",
    "export type { UserInput } from './generated/v2/UserInput';",
    "export type { ThreadStartParams } from './generated/v2/ThreadStartParams';",
    "export type { TurnStartParams } from './generated/v2/TurnStartParams';",
    "export type { CollaborationModeListParams } from './generated/v2/CollaborationModeListParams';",
    "export type { CollaborationModeListResponse } from './generated/v2/CollaborationModeListResponse';",
    "export type { CollaborationModeMask } from './generated/v2/CollaborationModeMask';",
    "export type { CollaborationMode } from './generated/CollaborationMode';",
    "export type { Config } from './generated/v2/Config';",
    "export type { Model } from './generated/v2/Model';",
    ""
  ].join("\n")
);

console.log(`Synced Codex protocol types from ${source}`);

function generateExperimentalProtocolTypes() {
  const outRoot = mkdtempSync(resolve(tmpdir(), "forge-codex-protocol-"));
  const outDir = resolve(outRoot, "typescript");
  const command = "cargo";
  const commandArgs = [
    "run",
    "--manifest-path",
    resolve(codexRoot, "Cargo.toml"),
    "-p",
    "codex-app-server-protocol",
    "--bin",
    "write_schema_fixtures",
    "--",
    "--schema-root",
    outRoot,
    "--experimental",
  ];
  const env = {
    ...process.env,
    CARGO_TARGET_DIR: process.env.CARGO_TARGET_DIR || resolve(tmpdir(), "forge-codex-rs-target"),
  };
  const result = spawnSync(command, commandArgs, {
    cwd: codexRoot,
    env,
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"],
  });
  if (result.status !== 0) {
    rmSync(outRoot, { recursive: true, force: true });
    const detail = [result.stderr, result.stdout].filter(Boolean).join("\n").trim();
    throw new Error(
      `Failed to generate experimental Codex protocol TypeScript from ${codexRoot}.${detail ? `\n${detail}` : ""}`,
    );
  }
  return outDir;
}
