import type { ModelConfig } from "@hicodex/codex-protocol";
import { hostFromBaseUrl } from "../lib/format";
import {
  normalizeTeamServiceBaseUrl,
  readTeamServiceConnectionConfig,
  type TeamServiceConnectionConfig,
} from "../lib/team-service-connection";
import type { ModelPickerProvider } from "./model-picker-selection";
import { normalizeModelConfig, normalizeModelSlugs } from "./model-settings";

export const TEAM_MODEL_GATEWAY_PROVIDER_ID = "team_model_gateway";
export const TEAM_MODEL_GATEWAY_PROVIDER_NAME = "团队模型";

export interface TeamModelGatewayProviderSnapshot {
  provider: ModelPickerProvider;
  modelConfig: ModelConfig;
  teamName: string | null;
}

export class TeamModelGatewayRequestError extends Error {
  readonly status: number | null;

  constructor(message: string, status: number | null) {
    super(message);
    this.name = "TeamModelGatewayRequestError";
    this.status = status;
  }
}

export function teamModelGatewayBaseUrl(config: Pick<TeamServiceConnectionConfig, "baseUrl">): string {
  return `${normalizeTeamServiceBaseUrl(config.baseUrl)}/api/team-gateway/v1`;
}

/*
 * The gateway's /models endpoint returns canonical model ids of the form
 * `provider_id:model_id` (Yuxi team_gateway_service `_model_spec`). The ids
 * are used VERBATIM — the gateway parses the same spec back in
 * `resolve_chat_context`, so the client must never invent or rewrite
 * prefixes (a client-side prefix made model identity depend on unrelated
 * lookups and broke session resume).
 */
export function teamModelSlugsFromResponse(value: unknown): string[] {
  return normalizeModelSlugs(teamModelItemsFromResponse(value).map(modelSlugFromItem));
}

/*
 * The member's default model advertised by the gateway (`is_default` on
 * /models items — Yuxi `member.default_model_spec`). New chats without an
 * explicit pick should land on it.
 */
export function teamDefaultModelFromResponse(value: unknown): string | null {
  for (const item of teamModelItemsFromResponse(value)) {
    if (objectRecord(item)?.is_default === true) {
      const slug = modelSlugFromItem(item);
      if (slug) return slug;
    }
  }
  return null;
}

/** Optional display names advertised by the gateway, keyed by model id. */
export function teamModelLabelsFromResponse(value: unknown): Record<string, string> {
  const labels: Record<string, string> = {};
  for (const item of teamModelItemsFromResponse(value)) {
    const slug = modelSlugFromItem(item);
    const label = stringValue(objectRecord(item)?.display_name);
    if (slug && label && label !== slug) labels[slug] = label;
  }
  return labels;
}

export function teamNameFromResponse(value: unknown): string | null {
  const record = objectRecord(value);
  return stringValue(record?.team_name)
    || stringValue(record?.name)
    || stringValue(objectRecord(record?.team)?.name)
    || stringValue(objectRecord(record?.current_team)?.name)
    || null;
}

/*
 * Map a persisted/recorded team model selection onto the gateway's current
 * model list. Handles legacy selections that predate server-scoped ids
 * (bare `model_id`) or carry a client-invented prefix: match by the model
 * part after the `provider_id:` prefix, but only when unambiguous.
 */
export function reconcileTeamModelSlug(
  selected: string | null | undefined,
  models: readonly string[],
): string | null {
  const slug = selected?.trim();
  if (!slug) return null;
  if (models.includes(slug)) return slug;
  const bare = bareModelId(slug);
  const matches = models.filter((model) => model === bare || bareModelId(model) === bare);
  return matches.length === 1 ? matches[0] : null;
}

function bareModelId(spec: string): string {
  const idx = spec.indexOf(":");
  return idx >= 0 ? spec.slice(idx + 1) : spec;
}

export function buildTeamModelGatewayProviderSnapshot(args: {
  connection: TeamServiceConnectionConfig;
  models: string[];
  selectedModel?: string | null;
  teamName?: string | null;
  modelLabels?: Record<string, string>;
  defaultModel?: string | null;
}): TeamModelGatewayProviderSnapshot | null {
  const models = normalizeModelSlugs(args.models);
  if (models.length === 0) return null;
  const selectedModel = reconcileTeamModelSlug(args.selectedModel, models);
  const defaultModel = args.defaultModel && models.includes(args.defaultModel)
    ? args.defaultModel
    : null;
  const baseUrl = teamModelGatewayBaseUrl(args.connection);
  const label = args.teamName?.trim()
    ? `${args.teamName.trim()} · ${TEAM_MODEL_GATEWAY_PROVIDER_NAME}`
    : TEAM_MODEL_GATEWAY_PROVIDER_NAME;
  const primaryModel = selectedModel ?? defaultModel ?? models[0];
  const modelConfig = normalizeModelConfig({
    id: TEAM_MODEL_GATEWAY_PROVIDER_ID,
    name: label,
    protocol: "openai",
    baseUrl,
    apiKey: args.connection.token,
    model: primaryModel,
    models,
    temperature: 0.2,
    maxTokens: null,
    supportsImageInput: true,
  });
  return {
    provider: {
      id: TEAM_MODEL_GATEWAY_PROVIDER_ID,
      label,
      host: hostFromBaseUrl(baseUrl, "团队网关"),
      baseUrl,
      models,
      modelLabels: args.modelLabels,
      defaultModel: defaultModel ?? undefined,
      authMode: "api-key",
    },
    modelConfig,
    teamName: args.teamName?.trim() || null,
  };
}

/*
 * The provider DEFINITION written to config.toml
 * (`[model_providers.team_model_gateway]`). Selection changes never touch
 * it; it is provisioned once and rewritten only when these fields change
 * (sign-in, token rotation, service base URL change).
 */
export interface TeamModelGatewayProviderDefinition {
  name: string;
  baseUrl: string;
  token: string;
}

export function teamModelGatewayProviderDefinition(
  snapshot: TeamModelGatewayProviderSnapshot,
): TeamModelGatewayProviderDefinition {
  return {
    name: snapshot.modelConfig.name,
    baseUrl: snapshot.modelConfig.baseUrl,
    token: snapshot.modelConfig.apiKey.trim(),
  };
}

export function teamModelGatewayDefinitionMatchesConfig(
  definition: TeamModelGatewayProviderDefinition,
  configProvider: unknown,
): boolean {
  const record = objectRecord(configProvider);
  if (!record) return false;
  return stringValue(record.name) === definition.name
    && stringValue(record.base_url) === definition.baseUrl
    && stringValue(record.experimental_bearer_token) === definition.token;
}

/*
 * In-session change signature for the provisioning effect: covers the
 * config.toml definition plus the model catalog contents, so provisioning
 * re-runs when either needs a rewrite and stays idle otherwise.
 */
export function teamModelGatewayProvisionSignature(
  snapshot: TeamModelGatewayProviderSnapshot,
  catalogModels: readonly string[],
): string {
  const definition = teamModelGatewayProviderDefinition(snapshot);
  return JSON.stringify([definition.name, definition.baseUrl, definition.token, [...catalogModels]]);
}

export async function loadTeamModelGatewayProvider(
  selectedModel?: string | null,
): Promise<TeamModelGatewayProviderSnapshot | null> {
  const connection = readTeamServiceConnectionConfig();
  if (!connection.token.trim()) return null;

  const modelsResponse = await teamModelGatewayRequest<unknown>("/api/team-gateway/v1/models", connection);
  const models = teamModelSlugsFromResponse(modelsResponse);
  if (models.length === 0) return null;
  const modelLabels = teamModelLabelsFromResponse(modelsResponse);
  const defaultModel = teamDefaultModelFromResponse(modelsResponse);

  let teamName: string | null = null;
  try {
    const teamResponse = await teamModelGatewayRequest<unknown>("/api/teams/current", connection);
    teamName = teamNameFromResponse(teamResponse);
  } catch {
    teamName = null;
  }

  return buildTeamModelGatewayProviderSnapshot({
    connection,
    models,
    selectedModel,
    teamName,
    modelLabels,
    defaultModel,
  });
}

export function isTeamModelGatewayUnavailable(error: unknown): boolean {
  return error instanceof TeamModelGatewayRequestError
    && (error.status === 401 || error.status === 403 || error.status === 404);
}

async function teamModelGatewayRequest<T>(
  path: string,
  connection: TeamServiceConnectionConfig,
): Promise<T> {
  const headers = new Headers();
  headers.set("Content-Type", "application/json");
  const token = connection.token.trim();
  if (token) headers.set("Authorization", `Bearer ${token}`);

  const response = await fetch(`${normalizeTeamServiceBaseUrl(connection.baseUrl)}${path}`, {
    headers,
  });
  if (!response.ok) {
    throw new TeamModelGatewayRequestError(await responseErrorMessage(response), response.status);
  }
  if (response.status === 204) return undefined as T;
  return await response.json() as T;
}

async function responseErrorMessage(response: Response): Promise<string> {
  try {
    const contentType = response.headers.get("content-type") ?? "";
    const detail = contentType.includes("application/json")
      ? await response.json()
      : await response.text();
    return stringValue(objectRecord(detail)?.message)
      || stringValue(objectRecord(detail)?.detail)
      || (typeof detail === "string" && detail.trim() ? detail.trim() : "")
      || `Team model gateway request failed (${response.status})`;
  } catch {
    return `Team model gateway request failed (${response.status})`;
  }
}

function teamModelItemsFromResponse(value: unknown): unknown[] {
  const record = objectRecord(value);
  return Array.isArray(value)
    ? value
    : arrayValue(record?.data) ?? arrayValue(record?.models) ?? arrayValue(record?.items) ?? [];
}

function modelSlugFromItem(value: unknown): string | null {
  if (typeof value === "string") return value;
  const record = objectRecord(value);
  return stringValue(record?.id)
    || stringValue(record?.model)
    || stringValue(record?.slug)
    || stringValue(record?.name)
    || null;
}

function objectRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" && !Array.isArray(value)
    ? value as Record<string, unknown>
    : null;
}

function arrayValue(value: unknown): unknown[] | null {
  return Array.isArray(value) ? value : null;
}

function stringValue(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}
