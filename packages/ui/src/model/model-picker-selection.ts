import {
  DEFAULT_MODEL_NAME,
  DEFAULT_SUBSCRIPTION_HTTP_PROVIDER_ID,
  DEFAULT_SUBSCRIPTION_MODELS,
  DEFAULT_SUBSCRIPTION_PROVIDER_ID,
} from "./model-settings";

export interface ModelPickerProvider {
  /** Matches `[model_providers.X]` key in config.toml */
  id: string;
  /** Display name shown in the section header */
  label: string;
  /** Endpoint host shown in the section header meta */
  host: string;
  /** Default base URL (display only - actual call uses config.toml) */
  baseUrl: string;
  /** List of model slugs available under this provider */
  models: string[];
  /**
   * Optional display names keyed by model slug - e.g. the team gateway's
   * canonical ids are `provider_id:model_id` and advertise a friendlier
   * `display_name` alongside.
   */
  modelLabels?: Record<string, string>;
  /**
   * The provider's preferred model when nothing is explicitly selected -
   * e.g. the team gateway's member default (`is_default` from /models).
   * Fallback resolution prefers it over `models[0]`.
   */
  defaultModel?: string;
  /**
   * `"oauth"` = provider uses ChatGPT subscription via `codex login` flow,
   * no API key required (e.g. OpenAI official);
   * `"api-key"` = traditional bearer token (e.g. gptbest proxy).
   */
  authMode: "oauth" | "api-key";
}

export const DEFAULT_PROVIDERS: ModelPickerProvider[] = [
  {
    id: "hicodex_local",
    label: "API compatible provider",
    host: "127.0.0.1:8890",
    baseUrl: "http://127.0.0.1:8890/v1",
    models: [DEFAULT_MODEL_NAME],
    authMode: "api-key",
  },
  {
    /*
     * Forge routes ChatGPT subscription traffic through a configured HTTP
     * provider instead of codex-rs's built-in `openai` provider. The built-in
     * provider enables Responses-over-WebSocket; on networks that block or
     * throttle the websocket path, every new thread burns its first turn on
     * websocket retries before falling back to HTTP. `openai_http` still uses
     * the same `/login` ChatGPT OAuth credentials and ChatGPT Codex backend,
     * but starts directly on the HTTP Responses transport.
     */
    id: DEFAULT_SUBSCRIPTION_HTTP_PROVIDER_ID,
    label: "ChatGPT 订阅 · OpenAI HTTP",
    host: "chatgpt.com",
    baseUrl: "https://chatgpt.com/backend-api/codex",
    models: DEFAULT_SUBSCRIPTION_MODELS,
    authMode: "oauth",
  },
];

export function isSubscriptionProviderId(providerId: string | null | undefined): boolean {
  const normalized = providerId?.trim();
  return normalized === DEFAULT_SUBSCRIPTION_PROVIDER_ID
    || normalized === DEFAULT_SUBSCRIPTION_HTTP_PROVIDER_ID;
}

export function normalizeSubscriptionProviderId(providerId: string): string {
  return providerId === DEFAULT_SUBSCRIPTION_PROVIDER_ID
    ? DEFAULT_SUBSCRIPTION_HTTP_PROVIDER_ID
    : providerId;
}

export interface ModelSelectionRef {
  providerId: string;
  model: string;
}

export interface ResolvedModelSelection {
  /** The (provider, model) that should actually be used to start/send a turn. */
  providerId: string;
  model: string;
  /** The user's intended selection (saved pick or config.toml default), if any. */
  intended: ModelSelectionRef | null;
  /** True when `intended`'s provider was not ready, so we fell back to another. */
  fellBack: boolean;
  /** True when no provider is auth-ready at all - the caller should block send. */
  noReadyProvider: boolean;
}

/*
 * Product logic for "the selected model's provider is not signed in".
 *
 * Rather than silently send to an unusable provider (which only spins on
 * "Reconnecting... N/5"), resolve the EFFECTIVE (provider, model):
 *   1. intended provider ready  -> use it (normal path; fellBack=false).
 *   2. intended not ready, some other provider ready -> fall back to the first
 *      ready provider's first model (fellBack=true). The intended pick is kept
 *      by the caller, so signing in restores it automatically.
 *   3. nothing ready -> noReadyProvider=true; caller disables send + prompts
 *      sign-in / configuration.
 * Reachability is a separate layer: a provider can be auth-ready but its
 * endpoint down - that is caught by the transport, not here.
 */
export function resolveEffectiveModelSelection(args: {
  intended: ModelSelectionRef | null;
  providers: readonly { id: string; models: readonly string[]; defaultModel?: string }[];
  readyProviders: ReadonlySet<string>;
  allowFallback?: boolean;
}): ResolvedModelSelection {
  const { intended, providers, readyProviders, allowFallback = true } = args;
  const intendedReady =
    intended != null
    && intended.providerId.length > 0
    && isModelSelectionAvailable(intended, providers)
    && readyProviders.has(intended.providerId);
  if (intendedReady) {
    return { providerId: intended!.providerId, model: intended!.model, intended, fellBack: false, noReadyProvider: false };
  }
  if (intended != null && !allowFallback) {
    return { providerId: intended.providerId, model: intended.model, intended, fellBack: false, noReadyProvider: true };
  }
  const fallback = providers.find((provider) => readyProviders.has(provider.id) && provider.models.length > 0);
  if (fallback) {
    // Only a "fall back" when the user actually intended a (now-unusable)
    // provider; with no intention this is just picking the ready default.
    // Prefer the provider's own default model (e.g. the team member default)
    // over the first list entry.
    const fallbackModel = fallback.defaultModel && fallback.models.includes(fallback.defaultModel)
      ? fallback.defaultModel
      : fallback.models[0];
    return { providerId: fallback.id, model: fallbackModel, intended, fellBack: intended != null, noReadyProvider: false };
  }
  return {
    providerId: intended?.providerId ?? "",
    model: intended?.model ?? "",
    intended,
    fellBack: false,
    noReadyProvider: true,
  };
}

export function isModelSelectionAvailable(
  selection: ModelSelectionRef | null,
  providers: readonly { id: string; models: readonly string[] }[],
): selection is ModelSelectionRef {
  if (!selection) return false;
  const provider = providers.find((item) => item.id === selection.providerId);
  return Boolean(provider && provider.models.includes(selection.model));
}
