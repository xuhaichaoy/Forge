import type { CollaborationMode } from "@hicodex/codex-protocol";
import { stringField } from "../lib/format";
import type { ThreadContextDefaults } from "./codex-reducer";

export function threadContextDefaultsFromThreadSettings(settings: Record<string, unknown>): ThreadContextDefaults {
  return compactThreadContext({
    model: stringField(settings, "model"),
    modelProvider: stringField(settings, "modelProvider"),
    serviceTier: settings.serviceTier,
    approvalPolicy: settings.approvalPolicy,
    approvalsReviewer: stringField(settings, "approvalsReviewer"),
    sandbox: sandboxModeFromSandboxPolicy(settings.sandboxPolicy),
    sandboxIsNonDefault: sandboxPolicyIsNonDefault(settings.sandboxPolicy),
    permissions: permissionsFromActivePermissionProfile(settings.activePermissionProfile),
    reasoningEffort: settings.effort,
    reasoningSummary: settings.summary,
    personality: personalityParam(settings.personality),
  });
}

export function mergeThreadContextDefaults(
  current: ThreadContextDefaults | null,
  settings: ThreadContextDefaults,
): ThreadContextDefaults | null {
  const preserved = compactThreadContext({
    baseInstructions: current?.baseInstructions,
    developerInstructions: current?.developerInstructions,
    environments: current?.environments,
    memories: current?.memories,
  });
  const next = compactThreadContext({ ...preserved, ...settings });
  return Object.keys(next).length > 0 ? next : null;
}

function compactThreadContext(context: ThreadContextDefaults): ThreadContextDefaults {
  return Object.fromEntries(
    Object.entries(context).filter(([, value]) => value !== undefined && value !== null && value !== ""),
  ) as ThreadContextDefaults;
}

function sandboxPolicyIsNonDefault(value: unknown): boolean {
  const policy = recordParam(value);
  if (!policy) return false;
  const type = stringField(policy, "type");
  if (type === "readOnly") return policy.networkAccess === true;
  if (type === "workspaceWrite") {
    return policy.networkAccess === true
      || policy.excludeSlashTmp === true
      || policy.excludeTmpdirEnvVar === true;
  }
  return false;
}

function sandboxModeFromSandboxPolicy(value: unknown): unknown {
  const policy = recordParam(value);
  const type = stringField(policy, "type");
  switch (type) {
    case "dangerFullAccess":
      return "danger-full-access";
    case "readOnly":
      return "read-only";
    case "workspaceWrite":
      return "workspace-write";
    case "externalSandbox":
      return policy;
    default:
      return undefined;
  }
}

function permissionsFromActivePermissionProfile(value: unknown): string | undefined {
  return stringField(value, "id") || undefined;
}

function personalityParam(value: unknown): ThreadContextDefaults["personality"] | undefined {
  return value === "none" || value === "friendly" || value === "pragmatic" ? value : undefined;
}

export function collaborationModeParam(value: unknown): CollaborationMode | null | undefined {
  if (value === null) return null;
  const mode = recordParam(value);
  if (!mode) return undefined;
  const kind = stringField(mode, "mode");
  if (kind !== "plan" && kind !== "default") return undefined;
  if (!recordParam(mode.settings)) return undefined;
  return mode as unknown as CollaborationMode;
}

function recordParam(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" ? value as Record<string, unknown> : null;
}
