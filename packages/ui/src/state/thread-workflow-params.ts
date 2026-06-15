// Thread/turn protocol parameter builders plus the config→ThreadContextDefaults
// projection (mechanical extraction from thread-workflow.ts — logic moved
// verbatim). DAG note: imports only the thread-workflow-shared leaf; the
// lifecycle/fork/turns domain modules import from here, never the reverse.
import type { TurnStartParams, UserInput } from "@forge/codex-protocol";
import type { ThreadSource } from "@forge/codex-protocol/generated/v2/ThreadSource";
import { CodexJsonRpcClient } from "../lib/codex-json-rpc-client";
import { formatError } from "../lib/format";
import type { ThreadContextDefaults, ThreadMemoryPreferences } from "./codex-ui-types";
import { FORGE_IMAGE_DYNAMIC_TOOL_SPEC } from "./image-generation-tool";
import {
  compactParams,
  DEFAULT_USER_THREAD_SOURCE,
  normalizedCwd,
  stringOverride,
  type ThreadCreationOptions,
  type ThreadWorkflowDispatch,
  type TurnStartOptions,
} from "./thread-workflow-shared";

export const DEFAULT_THREAD_MEMORY_PREFERENCES: ThreadMemoryPreferences = {
  useMemories: true,
  generateMemories: true,
};

const DEFAULT_THREAD_PERSONALITY = "friendly";

export async function refreshThreadContextDefaults(
  client: CodexJsonRpcClient,
  dispatch: ThreadWorkflowDispatch,
  workspace: string,
): Promise<Record<string, unknown> | null> {
  try {
    const result = await client.request<{ config?: Record<string, unknown> }>("config/read", {
      includeLayers: false,
      cwd: normalizedCwd(workspace),
    });
    dispatch({ type: "setThreadContextDefaults", context: projectThreadContextDefaults(result.config) });
    return result.config ?? null;
  } catch (error) {
    dispatch({ type: "log", text: `config/read failed: ${formatError(error)}`, level: "warn" });
    return null;
  }
}

// `thread/start` accepts the full thread context surface. Resume/fork use
// narrower protocol shapes and must go through their method-specific builders.
export function buildThreadContextParams(
  workspace: string,
  context?: ThreadContextDefaults | null,
  options?: { includeDynamicTools?: boolean; threadSource?: ThreadSource | null },
): Record<string, unknown> {
  const memoryConfig = threadMemoryConfig(context?.memories);
  const permissions = context?.permissions;
  return {
    cwd: normalizedCwd(workspace),
    ...compactParams({
      model: context?.model,
      modelProvider: context?.modelProvider,
      serviceTier: context?.serviceTier,
      approvalPolicy: context?.approvalPolicy,
      approvalsReviewer: context?.approvalsReviewer,
      sandbox: permissions ? undefined : context?.sandbox,
      permissions,
      environments: context?.environments,
      baseInstructions: context?.baseInstructions,
      developerInstructions: context?.developerInstructions,
      personality: context?.personality,
      threadSource: options?.threadSource,
      config: memoryConfig,
      dynamicTools: options?.includeDynamicTools ? [FORGE_IMAGE_DYNAMIC_TOOL_SPEC] : undefined,
    }),
  };
}

export function buildThreadStartParams(
  workspace: string,
  context?: ThreadContextDefaults | null,
  options?: ThreadCreationOptions,
): Record<string, unknown> {
  return buildThreadContextParams(workspace, context, {
    includeDynamicTools: options?.includeDynamicTools === true,
    threadSource: options?.threadSource ?? DEFAULT_USER_THREAD_SOURCE,
  });
}

export function buildThreadResumeParams(
  workspace: string,
  context?: ThreadContextDefaults | null,
): Record<string, unknown> {
  return buildThreadBaseParams(workspace, context, { includePersonality: true });
}

export function buildThreadForkParams(
  workspace: string,
  context?: ThreadContextDefaults | null,
  options?: {
    developerInstructions?: string | null;
    ephemeral?: boolean;
    threadSource?: ThreadSource | null;
  },
): Record<string, unknown> {
  return {
    ...buildThreadBaseParams(workspace, context, {
      developerInstructions: options?.developerInstructions ?? context?.developerInstructions,
      includePersonality: false,
    }),
    ...compactParams({
      ephemeral: options?.ephemeral,
      threadSource: options?.threadSource ?? DEFAULT_USER_THREAD_SOURCE,
    }),
  };
}

function buildThreadBaseParams(
  workspace: string,
  context?: ThreadContextDefaults | null,
  options?: {
    developerInstructions?: string | null;
    includePersonality?: boolean;
  },
): Record<string, unknown> {
  const memoryConfig = threadMemoryConfig(context?.memories);
  const permissions = context?.permissions;
  return {
    cwd: normalizedCwd(workspace),
    ...compactParams({
      model: context?.model,
      modelProvider: context?.modelProvider,
      serviceTier: context?.serviceTier,
      approvalPolicy: context?.approvalPolicy,
      approvalsReviewer: context?.approvalsReviewer,
      sandbox: permissions ? undefined : context?.sandbox,
      permissions,
      baseInstructions: context?.baseInstructions,
      developerInstructions: options?.developerInstructions ?? context?.developerInstructions,
      personality: options?.includePersonality === false ? undefined : context?.personality,
      config: memoryConfig,
    }),
  };
}

export function buildTurnStartParams(
  threadId: string,
  input: UserInput[],
  workspace: string,
  context?: ThreadContextDefaults | null,
  options?: TurnStartOptions | null,
): TurnStartParams {
  const permissions = context?.permissions;
  return {
    threadId,
    input,
    cwd: normalizedCwd(workspace),
    ...compactParams({
      model: context?.model,
      serviceTier: context?.serviceTier,
      approvalPolicy: context?.approvalPolicy,
      approvalsReviewer: context?.approvalsReviewer,
      sandboxPolicy: permissions ? undefined : sandboxPolicyFromMode(context?.sandbox),
      permissions,
      environments: context?.environments,
      effort: context?.reasoningEffort,
      summary: context?.reasoningSummary,
      personality: context?.personality,
      collaborationMode: options?.collaborationMode,
    }),
  } as TurnStartParams;
}

export function projectThreadContextDefaults(config: Record<string, unknown> | null | undefined): ThreadContextDefaults | null {
  if (!config) return null;
  const memories = projectThreadMemoryPreferences(config);
  const permissions = projectThreadPermissions(config);
  const context = compactParams({
    model: stringOverride(config.model),
    modelProvider: stringOverride(config.model_provider),
    serviceTier: config.service_tier,
    approvalPolicy: config.approval_policy,
    approvalsReviewer: config.approvals_reviewer,
    sandbox: config.sandbox_mode,
    permissions,
    environments: projectThreadEnvironments(config),
    baseInstructions: stringOverride(config.instructions),
    developerInstructions: stringOverride(config.developer_instructions),
    personality: personalityOverride(config.personality) ?? defaultPersonalityOverride(config),
    reasoningEffort: config.model_reasoning_effort,
    reasoningSummary: config.model_reasoning_summary,
    memories,
  }) as ThreadContextDefaults;
  return Object.keys(context).length > 0 ? context : null;
}

export function effectiveThreadMemoryPreferences(
  context?: ThreadContextDefaults | null,
): ThreadMemoryPreferences {
  return context?.memories ?? DEFAULT_THREAD_MEMORY_PREFERENCES;
}

function projectThreadPermissions(
  config: Record<string, unknown>,
): ThreadContextDefaults["permissions"] | undefined {
  return permissionProfileSelection(config.permissions)
    ?? permissionProfileSelection(config.default_permissions)
    ?? permissionProfileSelection(config.defaultPermissions)
    ?? permissionProfileSelection(config.permission_profile)
    ?? permissionProfileSelection(config.permissionProfile)
    ?? permissionProfileSelection(config.active_permission_profile)
    ?? permissionProfileSelection(config.activePermissionProfile);
}

function permissionProfileSelection(value: unknown): ThreadContextDefaults["permissions"] | undefined {
  const directId = stringOverride(value);
  if (directId) return directId;

  const record = recordField(value);
  if (!record) return undefined;
  const type = stringOverride(record.type);
  if (type && type !== "profile") return undefined;
  const id = stringOverride(record.id);
  return id || undefined;
}

function projectThreadEnvironments(
  config: Record<string, unknown>,
): ThreadContextDefaults["environments"] | undefined {
  const fallbackCwd = stringOverride(config.cwd);
  return turnEnvironmentParams(config.environments, fallbackCwd)
    ?? turnEnvironmentParams(config.thread_environments, fallbackCwd)
    ?? turnEnvironmentParams(config.threadEnvironments, fallbackCwd)
    ?? turnEnvironmentParams(config.environment, fallbackCwd)
    ?? turnEnvironmentParams(config.environment_id, fallbackCwd)
    ?? turnEnvironmentParams(config.environmentId, fallbackCwd);
}

function turnEnvironmentParams(
  value: unknown,
  fallbackCwd: string | undefined,
): ThreadContextDefaults["environments"] | undefined {
  if (Array.isArray(value)) {
    const environments = value
      .map((entry) => turnEnvironmentParam(entry, fallbackCwd))
      .filter((entry): entry is NonNullable<ThreadContextDefaults["environments"]>[number] => entry !== null);
    if (value.length === 0 || environments.length > 0) return environments;
    return undefined;
  }
  const environment = turnEnvironmentParam(value, fallbackCwd);
  return environment ? [environment] : undefined;
}

function turnEnvironmentParam(
  value: unknown,
  fallbackCwd: string | undefined,
): NonNullable<ThreadContextDefaults["environments"]>[number] | null {
  const directId = stringOverride(value);
  if (directId) {
    return fallbackCwd ? { environmentId: directId, cwd: fallbackCwd } : null;
  }

  const record = recordField(value);
  if (!record) return null;
  const environmentId = stringOverride(record.environmentId)
    ?? stringOverride(record.environment_id)
    ?? stringOverride(record.id);
  const cwd = stringOverride(record.cwd) ?? fallbackCwd;
  return environmentId && cwd ? { environmentId, cwd } : null;
}

function projectThreadMemoryPreferences(
  config: Record<string, unknown>,
): ThreadMemoryPreferences | undefined {
  const memories = recordField(config.memories);
  const useMemories = booleanOverride(memories?.use_memories)
    ?? booleanOverride(config["memories.use_memories"]);
  const generateMemories = booleanOverride(memories?.generate_memories)
    ?? booleanOverride(config["memories.generate_memories"]);
  if (useMemories === undefined && generateMemories === undefined) return undefined;
  return {
    useMemories: useMemories ?? DEFAULT_THREAD_MEMORY_PREFERENCES.useMemories,
    generateMemories: generateMemories ?? DEFAULT_THREAD_MEMORY_PREFERENCES.generateMemories,
  };
}

function threadMemoryConfig(
  preferences: ThreadMemoryPreferences | undefined,
): Record<string, boolean> | undefined {
  if (!preferences) return undefined;
  return {
    "memories.use_memories": preferences.useMemories,
    "memories.generate_memories": preferences.generateMemories,
  };
}

function booleanOverride(value: unknown): boolean | undefined {
  return typeof value === "boolean" ? value : undefined;
}

function recordField(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" && !Array.isArray(value)
    ? value as Record<string, unknown>
    : null;
}

function personalityOverride(value: unknown): ThreadContextDefaults["personality"] | undefined {
  return value === "none" || value === "friendly" || value === "pragmatic" ? value : undefined;
}

function defaultPersonalityOverride(config: Record<string, unknown>): ThreadContextDefaults["personality"] | undefined {
  return stringOverride(config.model) || stringOverride(config.model_provider) ? DEFAULT_THREAD_PERSONALITY : undefined;
}

function sandboxPolicyFromMode(value: unknown): Record<string, unknown> | undefined {
  if (value && typeof value === "object" && typeof (value as Record<string, unknown>).type === "string") {
    return value as Record<string, unknown>;
  }
  if (typeof value !== "string") return undefined;
  switch (value) {
    case "read-only":
      return { type: "readOnly", networkAccess: false };
    case "workspace-write":
      return {
        type: "workspaceWrite",
        writableRoots: [],
        networkAccess: false,
        excludeTmpdirEnvVar: false,
        excludeSlashTmp: false,
      };
    case "danger-full-access":
      return { type: "dangerFullAccess" };
    default:
      return undefined;
  }
}
