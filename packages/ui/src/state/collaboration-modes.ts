import type {
  CollaborationMode,
  CollaborationModeListResponse,
  CollaborationModeMask,
  ModeKind,
  ReasoningEffort,
} from "@hicodex/codex-protocol";
import type { CodexJsonRpcClient } from "../lib/codex-json-rpc-client";
import type { ThreadContextDefaults } from "./codex-reducer";
import type { ComposerMode } from "./composer-workflow";

const REASONING_EFFORTS = new Set<ReasoningEffort>(["none", "minimal", "low", "medium", "high", "xhigh"]);

export async function listCollaborationModes(client: CodexJsonRpcClient): Promise<CollaborationModeMask[]> {
  const result = await client.request<CollaborationModeListResponse>("collaborationMode/list", {}, 120_000);
  return Array.isArray(result.data) ? result.data.filter(isCollaborationModeMask) : [];
}

export function collaborationModeFromComposerMode(
  mode: ComposerMode,
  presets: CollaborationModeMask[],
  context?: ThreadContextDefaults | null,
): CollaborationMode | null {
  if (mode === "default") return null;
  const preset = findCollaborationModePreset(presets, "plan");
  if (!preset) return null;
  const current = baseCollaborationMode(context, preset.model);
  return current ? applyCollaborationModeMask(current, preset) : null;
}

export function composerModeFromCollaborationMode(mode: CollaborationMode | null | undefined): ComposerMode {
  return mode?.mode === "plan" ? "plan" : "default";
}

export function hasCollaborationModePreset(presets: CollaborationModeMask[], mode: ModeKind): boolean {
  return findCollaborationModePreset(presets, mode) !== null;
}

export function applyCollaborationModeMask(
  current: CollaborationMode,
  mask: CollaborationModeMask,
): CollaborationMode {
  return {
    mode: mask.mode ?? current.mode,
    settings: {
      model: normalizedModel(mask.model) ?? current.settings.model,
      reasoning_effort: hasOwn(mask, "reasoning_effort")
        ? normalizeReasoningEffort(mask.reasoning_effort)
        : current.settings.reasoning_effort,
      // The v2 preset list intentionally omits developer instructions. Null tells
      // app-server to use the built-in instructions for the selected mode.
      developer_instructions: null,
    },
  };
}

export function baseCollaborationMode(
  context?: ThreadContextDefaults | null,
  fallbackModel?: string | null,
): CollaborationMode | null {
  const model = normalizedModel(context?.model) ?? normalizedModel(fallbackModel);
  if (!model) return null;
  return {
    mode: "default",
    settings: {
      model,
      reasoning_effort: normalizeReasoningEffort(context?.reasoningEffort),
      developer_instructions: typeof context?.developerInstructions === "string"
        ? context.developerInstructions
        : null,
    },
  };
}

function findCollaborationModePreset(
  presets: CollaborationModeMask[],
  mode: ModeKind,
): CollaborationModeMask | null {
  return presets.find((preset) => preset.mode === mode) ?? null;
}

function isCollaborationModeMask(value: unknown): value is CollaborationModeMask {
  if (!value || typeof value !== "object") return false;
  const record = value as Record<string, unknown>;
  return typeof record.name === "string";
}

function normalizedModel(value: unknown): string | null {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function normalizeReasoningEffort(value: unknown): ReasoningEffort | null {
  return typeof value === "string" && REASONING_EFFORTS.has(value as ReasoningEffort)
    ? value as ReasoningEffort
    : null;
}

function hasOwn(value: object, key: PropertyKey): boolean {
  return Object.prototype.hasOwnProperty.call(value, key);
}
