import type { JsonValue, ModelConfig } from "@hicodex/codex-protocol";

export type { ModelConfig };

export const DEFAULT_MODEL_PROVIDER_ID = "hicodex_local";
export const DEFAULT_MODEL_PROVIDER_NAME = "HiCodex local gateway";
export const DEFAULT_MODEL_BASE_URL = "http://127.0.0.1:8890/v1";
export const DEFAULT_MODEL_NAME = "gpt-5.2";
export const DEFAULT_MODEL_CONTEXT_WINDOW = 262144;
export const DEFAULT_MODEL_AUTO_COMPACT_TOKEN_LIMIT = 235929;
export const DEFAULT_MODEL_REASONING_SUMMARY = "none";

export const EMPTY_MODEL: ModelConfig = {
  id: DEFAULT_MODEL_PROVIDER_ID,
  name: DEFAULT_MODEL_PROVIDER_NAME,
  protocol: "openai",
  baseUrl: DEFAULT_MODEL_BASE_URL,
  apiKey: "",
  model: DEFAULT_MODEL_NAME,
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
}

export interface ModelListEntry {
  id: string;
  displayName?: string;
  model: string;
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
  return {
    ...model,
    id: providerIdForModel(model),
    baseUrl: normalizeBaseUrl(model.baseUrl),
    model: model.model.trim(),
  };
}

export function buildLocalModelCatalogEntry(model: ModelConfig): LocalModelCatalogEntry {
  const normalized = normalizeModelConfig(model);
  return {
    model: normalized.model,
    displayName: model.name || normalized.model,
    description: `Local OpenAI-compatible coding model via ${normalized.baseUrl}.`,
    contextWindow: DEFAULT_MODEL_CONTEXT_WINDOW,
    autoCompactTokenLimit: DEFAULT_MODEL_AUTO_COMPACT_TOKEN_LIMIT,
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
  return {
    id: entry.id,
    name: entry.displayName ?? entry.model,
    protocol: "openai",
    baseUrl: "",
    apiKey: "",
    model: entry.model,
    temperature: 0.2,
    maxTokens: null,
  };
}

export function buildModelConfigsFromList(entries: ModelListEntry[]): ModelConfig[] {
  return entries.map(buildModelConfigFromListEntry);
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
