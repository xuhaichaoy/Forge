import {
  buildConfigBatchWriteParams,
  configWriteTargetFromReadResult,
  configWriteTargetMissingMessage,
  formatConfigWriteError,
  readConfigWriteTarget,
} from "../src/state/config-write-target";
import type { ConfigWriteActionEdit } from "../src/state/command-panel";

export default async function runConfigWriteTargetTests(): Promise<void> {
  derivesWriteTargetFromMatchingOrigins();
  derivesWriteTargetFromNestedMcpServerOrigins();
  fallsBackToUserLayerForNewConfigKeys();
  failsClosedWhenNoUserConfigTargetExists();
  explainsMissingVersionedTargets();
  explainsVersionConflicts();
  await readsConfigLayersBeforeBuildingBatchWriteParams();
}

function derivesWriteTargetFromMatchingOrigins(): void {
  const target = configWriteTargetFromReadResult(
    {
      origins: {
        "plugins.browser-use.enabled": {
          name: { type: "user", file: "/Users/me/.codex/config.toml" },
          version: "origin-3",
        },
      },
      layers: [{
        name: { type: "user", file: "/Users/me/.codex/config.toml" },
        version: "layer-2",
      }],
    },
    ["plugins.browser-use"],
  );

  assertDeepEqual(
    target,
    { filePath: "/Users/me/.codex/config.toml", expectedVersion: "origin-3" },
    "config writes should prefer the matching user origin and version for existing keys",
  );
}

function fallsBackToUserLayerForNewConfigKeys(): void {
  const target = configWriteTargetFromReadResult(
    {
      origins: {
        "sandbox_mode": {
          name: { type: "project", dotCodexFolder: "/workspace/.codex" },
          version: "project-1",
        },
      },
      layers: [{
        name: { type: "user", file: "/Users/me/.codex/config.toml" },
        version: "user-9",
      }],
    },
    ["memories.use_memories"],
  );

  assertDeepEqual(
    target,
    { filePath: "/Users/me/.codex/config.toml", expectedVersion: "user-9" },
    "new command-panel config keys should target the current user config layer",
  );
}

function derivesWriteTargetFromNestedMcpServerOrigins(): void {
  const target = configWriteTargetFromReadResult(
    {
      origins: {
        "mcp_servers.github.command": {
          name: { type: "user", file: "/Users/me/.codex/config.toml" },
          version: "mcp-7",
        },
      },
      layers: [{
        name: { type: "user", file: "/Users/me/.codex/config.toml" },
        version: "layer-2",
      }],
    },
    ["mcp_servers.github"],
  );

  assertDeepEqual(
    target,
    { filePath: "/Users/me/.codex/config.toml", expectedVersion: "mcp-7" },
    "MCP config writes should reuse the generic nested-origin target for a server table",
  );
}

function failsClosedWhenNoUserConfigTargetExists(): void {
  const target = configWriteTargetFromReadResult(
    {
      origins: {
        "apps.gmail.enabled": {
          name: { type: "project", dotCodexFolder: "/workspace/.codex" },
          version: "project-1",
        },
      },
      layers: [{
        name: { type: "project", dotCodexFolder: "/workspace/.codex" },
        version: "project-1",
      }],
    },
    ["apps.gmail.enabled"],
  );

  assertEqual(target, undefined, "project-only config should not silently fall back to an unversioned write");
}

function explainsMissingVersionedTargets(): void {
  assertEqual(
    configWriteTargetMissingMessage("Permissions config write"),
    "Permissions config write needs app-server’s versioned user config target (filePath and expectedVersion). Refresh Settings so HiCodex can read the latest config layers, then try again.",
    "missing write-target message should name filePath and expectedVersion",
  );
  assertThrows(
    () => buildConfigBatchWriteParams({
      edits: [],
      target: { filePath: " ", expectedVersion: "2" },
    }),
    "Config write needs app-server’s versioned user config target (filePath and expectedVersion). Refresh Settings so HiCodex can read the latest config layers, then try again.",
    "blank filePath should fail before config/batchWrite",
  );
}

function explainsVersionConflicts(): void {
  assertEqual(
    formatConfigWriteError(new Error("version mismatch for config.toml"), "Model config write"),
    "Model config write was not saved because the config file changed after Settings loaded. Refresh Settings to get the latest filePath and expectedVersion, then apply the change again. (version mismatch for config.toml)",
    "version conflict message should ask the user to refresh Settings",
  );
  assertEqual(
    formatConfigWriteError(new Error("missing expectedVersion"), "Plugin config write"),
    "Plugin config write needs app-server’s versioned user config target (filePath and expectedVersion). Refresh Settings so HiCodex can read the latest config layers, then try again. (missing expectedVersion)",
    "missing expectedVersion message should explain the versioned config target",
  );
}

async function readsConfigLayersBeforeBuildingBatchWriteParams(): Promise<void> {
  const calls: Array<{ method: string; params: unknown; timeoutMs: number | undefined }> = [];
  const client = {
    async request<T>(method: string, params?: unknown, timeoutMs?: number): Promise<T> {
      calls.push({ method, params, timeoutMs });
      return {
        origins: {},
        layers: [{
          name: { type: "user", file: "/Users/me/.codex/config.toml" },
          version: "user-11",
        }],
      } as T;
    },
  };

  const target = await readConfigWriteTarget(client, {
    cwd: " /workspace ",
    keyPaths: ["apps.gmail.enabled"],
  });
  const edits: ConfigWriteActionEdit[] = [{
    keyPath: "apps.gmail.enabled",
    value: true,
    mergeStrategy: "upsert",
  }];

  assertDeepEqual(
    calls,
    [{
      method: "config/read",
      params: { includeLayers: true, cwd: "/workspace" },
      timeoutMs: 120_000,
    }],
    "config writes should read includeLayers for a versioned user config target first",
  );
  assertDeepEqual(
    buildConfigBatchWriteParams({ edits, target, reloadUserConfig: true }),
    {
      edits,
      filePath: "/Users/me/.codex/config.toml",
      expectedVersion: "user-11",
      reloadUserConfig: true,
    },
    "config/batchWrite params should carry filePath and expectedVersion",
  );
}

function assertEqual(actual: unknown, expected: unknown, message: string): void {
  if (actual !== expected) {
    throw new Error(`${message}: expected ${String(expected)}, got ${String(actual)}`);
  }
}

function assertThrows(fn: () => void, expectedMessage: string, message: string): void {
  try {
    fn();
  } catch (error) {
    assertEqual(error instanceof Error ? error.message : String(error), expectedMessage, message);
    return;
  }
  throw new Error(`${message}: expected function to throw`);
}

function assertDeepEqual(actual: unknown, expected: unknown, message: string): void {
  const actualJson = JSON.stringify(actual);
  const expectedJson = JSON.stringify(expected);
  if (actualJson !== expectedJson) {
    throw new Error(`${message}: expected ${expectedJson}, got ${actualJson}`);
  }
}
