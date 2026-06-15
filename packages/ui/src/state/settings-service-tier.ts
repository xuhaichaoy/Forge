import type { ModelConfig, ModelServiceTier } from "@forge/codex-protocol";
import type { CommandPanelEntry } from "./command-panel";

const SERVICE_TIER_STANDARD_VALUE = "default";
const SERVICE_TIER_FAST_VALUE = "priority";
const SERVICE_TIER_STANDARD_LABEL = "Standard";
const SERVICE_TIER_STANDARD_DESCRIPTION = "Default speed";
const SERVICE_TIER_FAST_DESCRIPTION = "1.5x speed, increased usage";
const SERVICE_TIER_ULTRAFAST_DESCRIPTION = "The fastest available responses for latency-sensitive work";

interface ProjectServiceTierSettingsContext {
  model: ModelConfig | null;
  serviceTier?: unknown;
}

interface ProjectedServiceTierOption {
  value: string;
  label: string;
  description: string;
}

export function projectServiceTierSettingsEntry(
  context: ProjectServiceTierSettingsContext,
): CommandPanelEntry | null {
  // CODEX-REF: Desktop General settings renders Speed from model.serviceTiers;
  // local Codex config_types.rs uses "default" as the explicit Standard sentinel.
  const options = projectServiceTierOptions(context.model?.serviceTiers ?? []);
  if (options.length <= 1) return null;

  const currentValue = normalizeServiceTierRequestValue(context.serviceTier);
  const currentOption = options.find((option) => option.value === currentValue);
  const currentLabel = currentOption?.label ?? `Custom (${currentValue})`;
  return {
    id: "settings:service-tier",
    title: "Speed",
    kind: "status",
    status: currentLabel,
    meta: context.model?.model || "Current model",
    details: [
      "Choose the inference tier used across chats, subagents, and compaction",
      context.model?.defaultServiceTier
        ? `Model default service tier: ${context.model.defaultServiceTier}`
        : "Standard explicitly bypasses model catalog defaults.",
    ],
    secondaryActions: options
      .filter((option) => option.value !== currentValue)
      .map((option) => serviceTierAction(option)),
  };
}

export function findSettingsActiveModel(
  models: ModelConfig[],
  modelProvider: string | null,
  modelSlug: string | null,
): ModelConfig | null {
  if (modelProvider) {
    const providerMatch = models.find((model) => model.id === modelProvider);
    if (providerMatch) return providerMatch;
  }
  if (modelSlug) {
    const slugMatch = models.find((model) => model.model === modelSlug || model.models?.includes(modelSlug));
    if (slugMatch) return slugMatch;
  }
  return models[0] ?? null;
}

function projectServiceTierOptions(serviceTiers: ModelServiceTier[]): ProjectedServiceTierOption[] {
  const options: ProjectedServiceTierOption[] = [
    {
      value: SERVICE_TIER_STANDARD_VALUE,
      label: SERVICE_TIER_STANDARD_LABEL,
      description: SERVICE_TIER_STANDARD_DESCRIPTION,
    },
  ];
  const seen = new Set(options.map((option) => option.value));
  for (const tier of serviceTiers) {
    const value = normalizeServiceTierRequestValue(tier.id);
    if (!value || seen.has(value) || value === SERVICE_TIER_STANDARD_VALUE) continue;
    seen.add(value);
    options.push({
      value,
      label: serviceTierLabel(tier),
      description: serviceTierDescription(tier),
    });
  }
  return options;
}

function serviceTierLabel(tier: ModelServiceTier): string {
  const kind = serviceTierKind(tier.id, tier.name);
  if (kind === "fast") return "Fast";
  if (kind === "ultrafast") return "Ultrafast";
  return tier.name.trim() || tier.id.trim();
}

function serviceTierDescription(tier: ModelServiceTier): string {
  const description = tier.description.trim();
  if (description) return description;
  const kind = serviceTierKind(tier.id, tier.name);
  if (kind === "fast") return SERVICE_TIER_FAST_DESCRIPTION;
  if (kind === "ultrafast") return SERVICE_TIER_ULTRAFAST_DESCRIPTION;
  return tier.id.trim();
}

function serviceTierKind(id: string, name: string): "fast" | "ultrafast" | null {
  const normalizedId = id.trim().toLowerCase();
  const normalizedName = name.trim().toLowerCase();
  if (normalizedId === "priority" || normalizedId === "fast" || normalizedName === "priority" || normalizedName === "fast") {
    return "fast";
  }
  if (normalizedId === "ultrafast" || normalizedName === "ultrafast") {
    return "ultrafast";
  }
  return null;
}

function normalizeServiceTierRequestValue(value: unknown): string {
  if (typeof value !== "string") return SERVICE_TIER_STANDARD_VALUE;
  const trimmed = value.trim();
  if (!trimmed) return SERVICE_TIER_STANDARD_VALUE;
  const normalized = trimmed.toLowerCase();
  if (normalized === "standard" || normalized === SERVICE_TIER_STANDARD_VALUE) return SERVICE_TIER_STANDARD_VALUE;
  if (normalized === "fast") return SERVICE_TIER_FAST_VALUE;
  return normalized;
}

function serviceTierAction(option: ProjectedServiceTierOption) {
  return {
    id: `service-tier:${option.value}`,
    label: option.label,
    title: `Use ${option.label} speed`,
    action: {
      type: "writeConfig" as const,
      title: `Use ${option.label} speed`,
      message: `Set speed to ${option.label}.`,
      edits: [{
        keyPath: "service_tier",
        value: option.value,
        mergeStrategy: "replace" as const,
      }],
      reloadUserConfig: true,
    },
  };
}
