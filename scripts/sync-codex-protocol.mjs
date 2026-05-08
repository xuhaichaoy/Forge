import { cpSync, existsSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const source =
  process.env.HICODEX_CODEX_PROTOCOL_DIR ||
  "/Users/haichao/Desktop/data/codex/codex-rs/app-server-protocol/schema/typescript";
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
