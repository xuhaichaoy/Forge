import { formatUnknown } from "../lib/format";
import { buildInfoDetails, type ForgeBuildInfo } from "./build-info";
import type { CommandPanelEntry } from "./command-panel";

export function projectDebugConfigEntries(
  value: unknown,
  cwd: string,
  buildInfo?: ForgeBuildInfo,
): CommandPanelEntry[] {
  const buildEntry = buildInfo ? [projectBuildInfoEntry(buildInfo)] : [];
  const root = recordValue(value);
  if (!root) {
    return [
      ...buildEntry,
      {
        id: "debug-config:raw",
        title: "Config response",
        kind: "status",
        meta: cwd || "global config",
        details: [formatUnknown(value)],
        action: {
          type: "copyText",
          title: "Debug config",
          label: "Debug config",
          text: compactDebugJson(value),
        },
      },
    ];
  }

  const effectiveConfig = firstRecordField(root, ["config", "settings", "effective", "effectiveConfig"]) ?? root;
  const layers = firstArrayField(root, ["layers", "configLayers", "config_layers"]);
  const entries: CommandPanelEntry[] = [...buildEntry, {
    id: "debug-config:effective",
    title: "Effective config",
    kind: "status",
    status: `${Object.keys(effectiveConfig).length} key(s)`,
    meta: cwd || "global config",
    details: summarizeDebugConfig(effectiveConfig),
    action: {
      type: "copyText",
      title: "Debug config",
      label: "Debug config",
      text: compactDebugJson(value),
    },
  }];

  layers.forEach((layer, index) => {
    const layerConfig = firstRecordField(layer, ["config", "settings", "values"]) ?? layer;
    entries.push({
      id: `debug-config:layer:${index}`,
      title: debugLayerTitle(layer, index),
      kind: "status",
      status: debugLayerStatus(layer),
      meta: debugLayerMeta(layer),
      details: summarizeDebugConfig(layerConfig),
    });
  });

  return entries;
}

function projectBuildInfoEntry(buildInfo: ForgeBuildInfo): CommandPanelEntry {
  return {
    id: "debug-config:build",
    title: "Forge build",
    kind: "status",
    status: `${buildInfo.flavor} / ${buildInfo.channel}`,
    meta: buildInfo.version,
    details: buildInfoDetails(buildInfo),
    action: {
      type: "copyText",
      title: "Build info",
      label: "Build info",
      text: JSON.stringify(buildInfo, null, 2),
    },
  };
}

function summarizeDebugConfig(config: Record<string, unknown>): string[] {
  const preferredKeys = [
    "model",
    "model_provider",
    "approval_policy",
    "approvals_reviewer",
    "sandbox_mode",
    "profile",
    "model_reasoning_effort",
    "model_reasoning_summary",
    "instructions",
    "developer_instructions",
  ];
  const details: string[] = [];
  const seen = new Set<string>();
  for (const key of preferredKeys) {
    const formatted = debugConfigDetail(config, key);
    if (!formatted) continue;
    seen.add(key);
    details.push(formatted);
  }
  const memories = recordField(config, "memories");
  if (memories) {
    for (const key of ["use_memories", "generate_memories"]) {
      const formatted = debugConfigDetail(memories, key, `memories.${key}`);
      if (formatted) details.push(formatted);
    }
  }
  for (const [key, value] of Object.entries(config)) {
    if (details.length >= 10) break;
    if (seen.has(key) || key === "memories") continue;
    const formatted = formatDebugValue(value);
    if (formatted) details.push(`${key}: ${formatted}`);
  }
  return details.length > 0 ? details : ["No scalar config values returned."];
}

function debugConfigDetail(config: Record<string, unknown>, key: string, label = key): string {
  const formatted = formatDebugValue(config[key]);
  return formatted ? `${label}: ${formatted}` : "";
}

function formatDebugValue(value: unknown): string {
  if (typeof value === "string") return truncateDebugValue(value.trim());
  if (typeof value === "number" || typeof value === "boolean") return String(value);
  if (value === null) return "null";
  return "";
}

function truncateDebugValue(value: string): string {
  if (!value) return "";
  return value.length > 160 ? `${value.slice(0, 157)}...` : value;
}

function debugLayerTitle(layer: Record<string, unknown>, index: number): string {
  return fieldText(layer, "name")
    || fieldText(layer, "source")
    || fieldText(layer, "path")
    || `Config layer ${index + 1}`;
}

function debugLayerStatus(layer: Record<string, unknown>): string | undefined {
  return fieldText(layer, "status")
    || fieldText(layer, "kind")
    || (layer.enabled === false ? "disabled" : undefined);
}

function debugLayerMeta(layer: Record<string, unknown>): string | undefined {
  return fieldText(layer, "path")
    || fieldText(layer, "cwd")
    || fieldText(layer, "profile")
    || undefined;
}

function recordValue(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" && !Array.isArray(value)
    ? value as Record<string, unknown>
    : null;
}

function recordField(value: Record<string, unknown>, key: string): Record<string, unknown> | null {
  return recordValue(value[key]);
}

function firstRecordField(value: Record<string, unknown>, keys: string[]): Record<string, unknown> | null {
  for (const key of keys) {
    const record = recordField(value, key);
    if (record) return record;
  }
  return null;
}

function firstArrayField(value: Record<string, unknown>, keys: string[]): Record<string, unknown>[] {
  for (const key of keys) {
    const field = value[key];
    if (Array.isArray(field)) return field.map(recordValue).filter((item): item is Record<string, unknown> => item != null);
  }
  return [];
}

function fieldText(value: Record<string, unknown>, key: string): string {
  const field = value[key];
  if (typeof field === "string") return field.trim();
  if (typeof field === "number" || typeof field === "boolean" || typeof field === "bigint") return String(field);
  return "";
}

function compactDebugJson(value: unknown): string {
  try {
    return JSON.stringify(value, null, 2);
  } catch {
    return formatUnknown(value);
  }
}
