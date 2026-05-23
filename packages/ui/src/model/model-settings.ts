import type { InputModality, JsonValue, ModelConfig, ModelServiceTier } from "@hicodex/codex-protocol";

export type { ModelConfig };

export const DEFAULT_MODEL_PROVIDER_ID = "hicodex_local";
export const DEFAULT_MODEL_PROVIDER_NAME = "HiCodex local gateway";
export const DEFAULT_MODEL_BASE_URL = "http://127.0.0.1:8890/v1";
export const DEFAULT_MODEL_NAME = "Qwen3.6-27B-mxfp4";
export const DEFAULT_MODEL_CONTEXT_WINDOW = 262144;
export const DEFAULT_MODEL_AUTO_COMPACT_TOKEN_LIMIT = 235929;
export const DEFAULT_MODEL_REASONING_SUMMARY = "none";
export const DEFAULT_SUBSCRIPTION_PROVIDER_ID = "openai";
export const DEFAULT_SUBSCRIPTION_MODELS = ["gpt-5.5", "gpt-5.4"];

export const EMPTY_MODEL: ModelConfig = {
  id: DEFAULT_MODEL_PROVIDER_ID,
  name: DEFAULT_MODEL_PROVIDER_NAME,
  protocol: "openai",
  baseUrl: DEFAULT_MODEL_BASE_URL,
  apiKey: "",
  model: DEFAULT_MODEL_NAME,
  models: [DEFAULT_MODEL_NAME],
  temperature: 0.2,
  maxTokens: null,
  supportsImageInput: true,
};

export interface CodexModelProvider extends Record<string, JsonValue | undefined> {
  name: string;
  base_url: string;
  wire_api: "responses";
  requires_openai_auth: false;
  experimental_bearer_token?: string;
}

export interface LocalModelCatalogEntry {
  model: string;
  displayName: string;
  description: string;
  contextWindow: number;
  autoCompactTokenLimit: number;
  inputModalities: InputModality[];
}

export interface LocalModelCatalogConfigPayload extends LocalModelCatalogEntry {
  models: string[];
}

export interface ModelListEntry {
  id: string;
  displayName?: string;
  model: string;
  inputModalities?: InputModality[];
  serviceTiers?: ModelServiceTier[];
  defaultServiceTier?: string | null;
}

export interface NormalizedModelConfig extends ModelConfig {
  id: string;
  baseUrl: string;
  model: string;
}

export interface ModelConfigEdit {
  keyPath: string;
  value: JsonValue;
  mergeStrategy: "replace";
}

export function providerIdForModel(model: Pick<ModelConfig, "id">): string {
  const normalized = model.id.trim().toLowerCase().replace(/[^a-z0-9_]/g, "_");
  return normalized || DEFAULT_MODEL_PROVIDER_ID;
}

export function normalizeBaseUrl(value: string): string {
  const trimmed = value.trim() || DEFAULT_MODEL_BASE_URL;
  return trimmed.replace(/\/+$/, "");
}

export function normalizeModelConfig(model: ModelConfig): NormalizedModelConfig {
  const configuredModels = normalizeModelSlugs([model.model, ...(model.models ?? [])]);
  const primaryModel = model.model.trim() || configuredModels[0] || DEFAULT_MODEL_NAME;
  return {
    ...model,
    id: providerIdForModel(model),
    baseUrl: normalizeBaseUrl(model.baseUrl),
    model: primaryModel,
    models: modelSlugsWithPrimary(primaryModel, configuredModels),
  };
}

export function buildLocalModelCatalogEntry(model: ModelConfig): LocalModelCatalogEntry {
  return buildLocalModelCatalogEntries(model)[0] ?? fallbackLocalModelCatalogEntry(model);
}

export function buildLocalModelCatalogEntries(model: ModelConfig): LocalModelCatalogEntry[] {
  const normalized = normalizeModelConfig(model);
  const inputModalities: InputModality[] = normalized.supportsImageInput === false
    ? ["text"]
    : ["text", "image"];
  return modelSlugsForConfig(normalized).map((slug, index) => ({
    model: slug,
    displayName: index === 0 && model.name.trim() ? model.name.trim() : formatModelDisplayName(slug),
    description: `Local OpenAI-compatible coding model via ${normalized.baseUrl}.`,
    contextWindow: DEFAULT_MODEL_CONTEXT_WINDOW,
    autoCompactTokenLimit: DEFAULT_MODEL_AUTO_COMPACT_TOKEN_LIMIT,
    inputModalities,
  }));
}

export function buildLocalModelCatalogConfig(model: ModelConfig): LocalModelCatalogConfigPayload {
  const normalized = normalizeModelConfig(model);
  const primary = buildLocalModelCatalogEntry(normalized);
  return {
    ...primary,
    model: normalized.model,
    models: modelSlugsForConfig(normalized),
  };
}

function fallbackLocalModelCatalogEntry(model: ModelConfig): LocalModelCatalogEntry {
  const normalized = normalizeModelConfig(model);
  return {
    model: normalized.model,
    displayName: model.name.trim() || formatModelDisplayName(normalized.model),
    description: `Local OpenAI-compatible coding model via ${normalized.baseUrl}.`,
    contextWindow: DEFAULT_MODEL_CONTEXT_WINDOW,
    autoCompactTokenLimit: DEFAULT_MODEL_AUTO_COMPACT_TOKEN_LIMIT,
    inputModalities: normalized.supportsImageInput === false ? ["text"] : ["text", "image"],
  };
}

export function buildCodexModelProvider(model: ModelConfig): CodexModelProvider {
  const provider: CodexModelProvider = {
    name: model.name.trim() || DEFAULT_MODEL_PROVIDER_NAME,
    base_url: normalizeBaseUrl(model.baseUrl),
    wire_api: "responses",
    requires_openai_auth: false,
  };
  const apiKey = model.apiKey.trim();
  if (apiKey) {
    provider.experimental_bearer_token = apiKey;
  }
  return provider;
}

export function buildModelConfigFromListEntry(entry: ModelListEntry): ModelConfig {
  const serviceTiers = normalizeModelServiceTiers(entry.serviceTiers);
  return {
    id: entry.id,
    name: entry.displayName ?? entry.model,
    protocol: "openai",
    baseUrl: "",
    apiKey: "",
    model: entry.model,
    models: [entry.model],
    temperature: 0.2,
    maxTokens: null,
    supportsImageInput: entry.inputModalities?.includes("image") ?? true,
    serviceTiers,
    defaultServiceTier: typeof entry.defaultServiceTier === "string" ? entry.defaultServiceTier : null,
  };
}

export function buildModelConfigsFromList(entries: ModelListEntry[]): ModelConfig[] {
  return entries.map(buildModelConfigFromListEntry);
}

export function buildModelConfigFromConfig(config: Record<string, unknown> | null | undefined): ModelConfig {
  const activeModel = stringConfigValue(config?.model) || DEFAULT_MODEL_NAME;
  const activeProviderId = stringConfigValue(config?.model_provider) || DEFAULT_MODEL_PROVIDER_ID;
  const provider = configRecord(config?.model_providers)?.[activeProviderId];
  const providerRecord = configRecord(provider);
  const providerName = stringConfigValue(providerRecord?.name)
    || (activeProviderId === DEFAULT_MODEL_PROVIDER_ID ? DEFAULT_MODEL_PROVIDER_NAME : activeProviderId);
  const providerBaseUrl = stringConfigValue(providerRecord?.base_url)
    || stringConfigValue(providerRecord?.baseUrl)
    || DEFAULT_MODEL_BASE_URL;
  return normalizeModelConfig({
    id: activeProviderId,
    name: providerName,
    protocol: "openai",
    baseUrl: providerBaseUrl,
    apiKey: stringConfigValue(providerRecord?.experimental_bearer_token),
    model: activeModel,
    models: [activeModel],
    temperature: 0.2,
    maxTokens: null,
    supportsImageInput: true,
  });
}

export function parseModelSlugsInput(value: string): string[] {
  return normalizeModelSlugs(value.split(/[\n,，;；]+/g));
}

export function normalizeModelSlugs(values: Array<string | null | undefined>): string[] {
  const seen = new Set<string>();
  const result: string[] = [];
  for (const value of values) {
    const trimmed = value?.trim();
    if (!trimmed || seen.has(trimmed)) continue;
    seen.add(trimmed);
    result.push(trimmed);
  }
  return result;
}

export function modelSlugsForConfig(model: Pick<ModelConfig, "model"> & { models?: string[] }): string[] {
  return modelSlugsWithPrimary(model.model, model.models ?? []);
}

export function modelSlugsWithPrimary(
  primaryModel: string | null | undefined,
  modelSlugs: Array<string | null | undefined>,
): string[] {
  const primary = primaryModel?.trim();
  const normalized = normalizeModelSlugs([primary, ...modelSlugs]);
  return normalized.length > 0 ? normalized : [DEFAULT_MODEL_NAME];
}

export function formatModelDisplayName(model: string): string {
  const trimmed = model.trim();
  if (!trimmed) return DEFAULT_MODEL_NAME;
  if (/^gpt-/i.test(trimmed)) {
    return trimmed.replace(/^gpt/i, "GPT");
  }
  return trimmed;
}

export function buildModelConfigEdits(model: ModelConfig, catalogPath: string): ModelConfigEdit[] {
  const normalized = normalizeModelConfig(model);
  return [
    { keyPath: "model_catalog_json", value: catalogPath, mergeStrategy: "replace" },
    { keyPath: `model_providers.${normalized.id}`, value: buildCodexModelProvider(normalized), mergeStrategy: "replace" },
    { keyPath: "model_provider", value: normalized.id, mergeStrategy: "replace" },
    { keyPath: "model", value: normalized.model, mergeStrategy: "replace" },
    { keyPath: "model_context_window", value: DEFAULT_MODEL_CONTEXT_WINDOW, mergeStrategy: "replace" },
    { keyPath: "model_auto_compact_token_limit", value: DEFAULT_MODEL_AUTO_COMPACT_TOKEN_LIMIT, mergeStrategy: "replace" },
    { keyPath: "model_reasoning_summary", value: DEFAULT_MODEL_REASONING_SUMMARY, mergeStrategy: "replace" },
  ];
}

function stringConfigValue(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

function configRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" && !Array.isArray(value)
    ? value as Record<string, unknown>
    : null;
}

function normalizeModelServiceTiers(value: ModelServiceTier[] | null | undefined): ModelServiceTier[] {
  if (!Array.isArray(value)) return [];
  return value
    .filter((tier) =>
      typeof tier?.id === "string"
      && tier.id.trim().length > 0
      && typeof tier.name === "string"
      && typeof tier.description === "string")
    .map((tier) => ({
      id: tier.id.trim(),
      name: tier.name.trim() || tier.id.trim(),
      description: tier.description.trim(),
    }));
}
