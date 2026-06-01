import type { ConfigWriteActionEdit, ConfigWriteTarget } from "./command-panel";
import { formatError } from "../lib/format";

const CONFIG_READ_TIMEOUT_MS = 120_000;

export interface ConfigReadClient {
  request<T>(method: string, params?: unknown, timeoutMs?: number): Promise<T>;
}

export interface ConfigBatchWriteParams {
  edits: ConfigWriteActionEdit[];
  filePath: string;
  expectedVersion: string;
  reloadUserConfig?: boolean;
}

export function configWriteTargetFromReadResult(
  configReadResult: unknown,
  keyPaths: readonly string[] = [],
): ConfigWriteTarget | undefined {
  const root = recordObject(configReadResult);
  const origins = recordObject(root.origins);
  const targetFromOrigins = originWriteTargetForKeyPaths(origins, keyPaths);
  if (targetFromOrigins) return targetFromOrigins;
  return userLayerWriteTarget(root.layers);
}

export async function readConfigWriteTarget(
  client: ConfigReadClient,
  options: {
    cwd?: string | null;
    keyPaths?: readonly string[];
    scope?: string;
  } = {},
): Promise<ConfigWriteTarget> {
  const cwd = typeof options.cwd === "string" && options.cwd.trim() ? options.cwd.trim() : null;
  const result = await client.request<unknown>("config/read", {
    includeLayers: true,
    cwd,
  }, CONFIG_READ_TIMEOUT_MS);
  const target = configWriteTargetFromReadResult(result, options.keyPaths ?? []);
  if (!target) throw new Error(configWriteTargetMissingMessage(options.scope));
  return target;
}

export function buildConfigBatchWriteParams(params: {
  edits: ConfigWriteActionEdit[];
  target: ConfigWriteTarget;
  reloadUserConfig?: boolean;
}): ConfigBatchWriteParams {
  const filePath = params.target.filePath.trim();
  const expectedVersion = params.target.expectedVersion.trim();
  if (!filePath || !expectedVersion) {
    throw new Error(configWriteTargetMissingMessage());
  }
  return {
    edits: params.edits,
    filePath,
    expectedVersion,
    reloadUserConfig: params.reloadUserConfig,
  };
}

export function configWriteTargetMissingMessage(scope = "Config write"): string {
  return `${scope} needs app-server’s versioned user config target (filePath and expectedVersion). Refresh Settings so HiCodex can read the latest config layers, then try again.`;
}

export function formatConfigWriteError(error: unknown, scope = "Config write"): string {
  const message = formatError(error);
  const lower = message.toLowerCase();
  if (lower.includes("filepath") || lower.includes("expectedversion") || lower.includes("expected version")) {
    return `${configWriteTargetMissingMessage(scope)} (${message})`;
  }
  if (
    lower.includes("version mismatch")
    || lower.includes("stale")
    || lower.includes("conflict")
    || lower.includes("changed on disk")
    || lower.includes("modified on disk")
  ) {
    return `${scope} was not saved because the config file changed after Settings loaded. Refresh Settings to get the latest filePath and expectedVersion, then apply the change again. (${message})`;
  }
  return message;
}

function originWriteTargetForKeyPaths(
  origins: Record<string, unknown>,
  keyPaths: readonly string[],
): ConfigWriteTarget | undefined {
  for (const keyPath of keyPaths) {
    const target = originWriteTargetForKeyPath(origins, keyPath);
    if (target) return target;
  }
  return undefined;
}

function originWriteTargetForKeyPath(
  origins: Record<string, unknown>,
  keyPath: string,
): ConfigWriteTarget | undefined {
  const normalized = keyPath.trim();
  if (!normalized) return undefined;

  const exact = originWriteTarget(origins[normalized]);
  if (exact) return exact;

  const childPrefix = `${normalized}.`;
  for (const [originPath, origin] of Object.entries(origins)) {
    if (!originPath.startsWith(childPrefix)) continue;
    const target = originWriteTarget(origin);
    if (target) return target;
  }

  let parent = normalized;
  while (parent.includes(".")) {
    parent = parent.slice(0, parent.lastIndexOf("."));
    const target = originWriteTarget(origins[parent]);
    if (target) return target;
  }
  return undefined;
}

function originWriteTarget(origin: unknown): ConfigWriteTarget | undefined {
  const metadata = recordObject(origin);
  const source = recordObject(metadata.name);
  if (source.type !== "user") return undefined;
  const filePath = typeof source.file === "string" ? source.file : "";
  const expectedVersion = typeof metadata.version === "string" ? metadata.version : "";
  return filePath && expectedVersion ? { filePath, expectedVersion } : undefined;
}

function userLayerWriteTarget(layers: unknown): ConfigWriteTarget | undefined {
  if (!Array.isArray(layers)) return undefined;
  for (const layer of layers) {
    const record = recordObject(layer);
    const source = recordObject(record.name);
    if (source.type !== "user") continue;
    const filePath = typeof source.file === "string" ? source.file : "";
    const expectedVersion = typeof record.version === "string" ? record.version : "";
    if (filePath && expectedVersion) return { filePath, expectedVersion };
  }
  return undefined;
}

function recordObject(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? value as Record<string, unknown>
    : {};
}
