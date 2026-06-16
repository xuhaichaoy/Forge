import type { ModelConfig } from "@forge/codex-protocol";
import type { CodexJsonRpcClient } from "../lib/codex-json-rpc-client";
import { formatError } from "../lib/format";
import { writeLocalModelCatalog } from "../lib/tauri-host";
import type { CodexUiAction } from "../state/codex-reducer";
import { formatMessage, type I18nMessageDescriptor } from "../state/i18n";
import {
  buildCodexModelProvider,
  buildLocalModelCatalogConfig,
  buildModelConfigEdits,
  buildModelConfigsFromList,
  normalizeModelConfig,
  normalizeModelSlugs,
  type LocalModelCatalogConfigPayload,
  type ModelListEntry,
} from "./model-settings";
import {
  TEAM_MODEL_GATEWAY_PROVIDER_ID,
  teamModelGatewayDefinitionMatchesConfig,
  teamModelGatewayProviderDefinition,
  type TeamModelGatewayProviderSnapshot,
} from "./team-model-gateway";
import {
  buildConfigBatchWriteParams,
  formatConfigWriteError,
  readConfigWriteTarget,
} from "../state/config-write-target";

export type CodexUiDispatch = (action: CodexUiAction) => void;

/*
 * The one runtime-restart sequence for provider-config changes: loaded chats
 * hold app-server sessions bound to the old provider connection, so every
 * config writer tears the connection down, marks all threads for resume, and
 * reconnects. Keep the lockstep in ONE place — this existed as three drifting
 * inline copies (saveModelDraft, provisionTeamModelGatewayProvider, and
 * ForgeApp's provider-switch retry) before being unified.
 */
export async function restartRuntimeForUpdatedProviderConfig(
  client: CodexJsonRpcClient,
  dispatch: CodexUiDispatch,
  connect: () => Promise<boolean>,
): Promise<boolean> {
  await client.disconnect();
  dispatch({ type: "connected", value: false });
  dispatch({ type: "markThreadsNeedResumeAfterReconnect" });
  return connect();
}

export interface SaveModelDraftOptions {
  client: CodexJsonRpcClient;
  dispatch: CodexUiDispatch;
  connect: () => Promise<boolean>;
  modelDraft: ModelConfig;
  connected: boolean;
  codexHome?: string | null;
  restartRuntime?: boolean;
  writeModelCatalog?: (
    codexHome: string | null | undefined,
    config: LocalModelCatalogConfigPayload,
  ) => Promise<string>;
  /*
   * Model slugs that must stay in the (full-overwrite) models.json catalog
   * even though they belong to another provider — e.g. team gateway models
   * while saving the personal provider config.
   */
  additionalCatalogModels?: readonly string[];
}

export interface SaveModelDraftResult {
  wroteConfig: boolean;
  restartedRuntime: boolean;
}

export async function refreshModels(
  client: CodexJsonRpcClient,
  dispatch: CodexUiDispatch,
): Promise<void> {
  try {
    const result = await client.request<{ data?: ModelListEntry[] }>("model/list", {
      includeHidden: false,
    });
    dispatch({ type: "setModels", models: buildModelConfigsFromList(result.data ?? []) });
  } catch (error) {
    dispatch({ type: "log", text: `model/list failed: ${formatError(error)}`, level: "warn" });
  }
}

export async function saveModelDraft({
  client,
  dispatch,
  connect,
  modelDraft,
  connected,
  codexHome,
  restartRuntime = false,
  writeModelCatalog = writeLocalModelCatalog,
  additionalCatalogModels = [],
}: SaveModelDraftOptions): Promise<SaveModelDraftResult> {
  const nextModel = normalizeModelConfig(modelDraft);
  let wroteConfig = false;
  let restartedRuntime = false;
  try {
    const ready = connected || await connect();
    if (ready && nextModel.model) {
      const configWriteTarget = await readConfigWriteTarget(client, {
        keyPaths: [
          "model_catalog_json",
          "model_provider",
          "model",
          `model_providers.${nextModel.id}`,
        ],
        scope: "Model config write",
      });
      const catalogPath = await writeModelCatalog(
        codexHome,
        catalogConfigWithExtraModels(buildLocalModelCatalogConfig(nextModel), additionalCatalogModels),
      );
      const edits = buildModelConfigEdits(nextModel, catalogPath);
      await client.request("config/batchWrite", buildConfigBatchWriteParams({
        edits,
        target: configWriteTarget,
        reloadUserConfig: true,
      }));
      wroteConfig = true;
      await refreshModels(client, dispatch);
      if (restartRuntime) {
        dispatch({
          type: "log",
          text: "saved model config; restarting Codex runtime so loaded chats use the updated provider connection",
        });
        try {
          restartedRuntime = await restartRuntimeForUpdatedProviderConfig(client, dispatch, connect);
          dispatch({
            type: "log",
            text: restartedRuntime
              ? "model runtime restarted; the current chat will resume with the updated provider config"
              : "model config saved, but Codex runtime did not reconnect",
            level: restartedRuntime ? "info" : "warn",
          });
        } catch (restartError) {
          dispatch({
            type: "log",
            text: `model config saved, but runtime restart failed: ${formatError(restartError)}`,
            level: "warn",
          });
        }
        return { wroteConfig, restartedRuntime };
      }
      dispatch({
        type: "log",
        text: `saved model config for new or resumed chats; loaded chats keep their current provider connection`,
      });
    }
  } catch (error) {
    dispatch({
      type: "log",
      text: `Codex config write failed: ${formatConfigWriteError(error, "Model config write")}`,
      level: "warn",
    });
  }
  return { wroteConfig, restartedRuntime };
}

/*
 * Structured log-source tags (LogLine.source) for the team-gateway
 * provisioning pipeline. The toast viewport keys its mute table on these
 * stable ids — NOT on the user-facing copy below — so the copy lives in the
 * i18n dictionary and can change/translate freely. app-toast-viewport.tsx
 * mutes `providerUpdated` (clean success) and `reconnectPending` (transient,
 * self-healing on first login) as internal noise; only `restartFailed`
 * (actionable) and `provisionFailed` (content-dependent) can still toast.
 */
export const TEAM_MODEL_GATEWAY_LOG_SOURCES = {
  providerUpdated: "team-model-gateway/provider-updated",
  reconnectPending: "team-model-gateway/provider-updated-reconnect-pending",
  restartFailed: "team-model-gateway/provider-updated-restart-failed",
  provisionFailed: "team-model-gateway/provision-failed",
} as const;

/*
 * Localizable provisioning copy — descriptor table like team-service-auth's
 * TEAM_SERVICE_AUTH_COPY. This is a state-layer module with no hook access,
 * and the log pipeline (LogLine.text → toast/log surfaces) carries plain
 * strings, so each dispatch point formats via the module-level formatMessage
 * singleton (state/i18n documents it for exactly this case). Muting is keyed
 * on the `source` tag, so formatting locale never affects toast filtering.
 */
const TEAM_MODEL_GATEWAY_COPY = {
  providerUpdated: {
    id: "hc.teamModelGateway.providerUpdated",
    defaultMessage: "Team model connection updated",
  },
  providerUpdatedReconnectPending: {
    id: "hc.teamModelGateway.providerUpdatedReconnectPending",
    defaultMessage: "Team model connection updated, but the model service has not reconnected yet; it will retry automatically",
  },
  providerUpdatedRestartFailed: {
    id: "hc.teamModelGateway.providerUpdatedRestartFailed",
    defaultMessage: "Team model connection updated, but the service restart failed: {error}",
  },
} satisfies Record<string, I18nMessageDescriptor>;

export interface ProvisionTeamModelGatewayOptions {
  client: CodexJsonRpcClient;
  dispatch: CodexUiDispatch;
  connect: () => Promise<boolean>;
  connected: boolean;
  codexHome?: string | null;
  snapshot: TeamModelGatewayProviderSnapshot;
  /*
   * Full model list to write into models.json — the catalog file is a full
   * overwrite, so the caller passes the union of personal + team models.
   */
  catalogConfig: LocalModelCatalogConfigPayload;
  /** Injectable for tests, mirroring SaveModelDraftOptions.writeModelCatalog. */
  writeModelCatalog?: (
    codexHome: string | null | undefined,
    config: LocalModelCatalogConfigPayload,
  ) => Promise<string>;
}

export interface ProvisionTeamModelGatewayResult {
  /*
   * "provisioned" — definition written (and runtime restarted when it
   * replaced an existing one); "upToDate" — config + catalog already match;
   * "skipped" — runtime not reachable, retry later; "failed" — write error.
   */
  status: "provisioned" | "upToDate" | "skipped" | "failed";
  restartedRuntime: boolean;
}

/*
 * Provision the team gateway provider DEFINITION:
 *   - `[model_providers.team_model_gateway]` in config.toml (base_url + token)
 *   - team model entries in the models.json catalog
 *
 * Deliberately never touches the global `model` / `model_provider` keys —
 * picking a team model is a per-thread selection (ThreadStart/ThreadResume
 * modelProvider override), not a global default change. The runtime is
 * restarted only when an EXISTING definition changed (token rotation or
 * base URL change), because live thread sessions cache the old credentials;
 * a first-time write has no live consumers and restarts nothing.
 */
export async function provisionTeamModelGatewayProvider({
  client,
  dispatch,
  connect,
  connected,
  codexHome,
  snapshot,
  catalogConfig,
  writeModelCatalog = writeLocalModelCatalog,
}: ProvisionTeamModelGatewayOptions): Promise<ProvisionTeamModelGatewayResult> {
  let restartedRuntime = false;
  try {
    const ready = connected || await connect();
    if (!ready) return { status: "skipped", restartedRuntime };

    const configRead = await client.request<{ config?: Record<string, unknown> }>("config/read", {
      includeLayers: true,
    }, 120_000);
    const providers = recordValue(configRead.config?.model_providers);
    const existingProvider = providers?.[TEAM_MODEL_GATEWAY_PROVIDER_ID];
    const definition = teamModelGatewayProviderDefinition(snapshot);
    const definitionUpToDate = teamModelGatewayDefinitionMatchesConfig(definition, existingProvider);

    const catalogPath = await writeModelCatalog(codexHome, catalogConfig);

    if (!definitionUpToDate) {
      const configWriteTarget = await readConfigWriteTarget(client, {
        keyPaths: [
          "model_catalog_json",
          `model_providers.${TEAM_MODEL_GATEWAY_PROVIDER_ID}`,
        ],
        scope: "Team model provider write",
      });
      await client.request("config/batchWrite", buildConfigBatchWriteParams({
        edits: [
          { keyPath: "model_catalog_json", value: catalogPath, mergeStrategy: "replace" },
          {
            keyPath: `model_providers.${TEAM_MODEL_GATEWAY_PROVIDER_ID}`,
            value: buildCodexModelProvider(snapshot.modelConfig),
            mergeStrategy: "replace",
          },
        ],
        target: configWriteTarget,
        reloadUserConfig: true,
      }));

      if (existingProvider !== undefined) {
        // Credentials of an already-provisioned provider changed; loaded
        // chats hold sessions with the stale token, so restart once. ONE
        // success toast total — startup must not stack notifications.
        try {
          restartedRuntime = await restartRuntimeForUpdatedProviderConfig(client, dispatch, connect);
          // Toast muting keys on the `source` tag (see TEAM_MODEL_GATEWAY_LOG_SOURCES);
          // the copy comes from the i18n dictionary and is free to change.
          dispatch(restartedRuntime
            ? {
                type: "log",
                text: formatMessage(TEAM_MODEL_GATEWAY_COPY.providerUpdated),
                level: "info",
                source: TEAM_MODEL_GATEWAY_LOG_SOURCES.providerUpdated,
              }
            : {
                type: "log",
                text: formatMessage(TEAM_MODEL_GATEWAY_COPY.providerUpdatedReconnectPending),
                level: "warn",
                source: TEAM_MODEL_GATEWAY_LOG_SOURCES.reconnectPending,
              });
        } catch (restartError) {
          dispatch({
            type: "log",
            text: formatMessage(TEAM_MODEL_GATEWAY_COPY.providerUpdatedRestartFailed, {
              error: formatError(restartError),
            }),
            level: "warn",
            source: TEAM_MODEL_GATEWAY_LOG_SOURCES.restartFailed,
          });
        }
      }
      return { status: "provisioned", restartedRuntime };
    }
    return { status: "upToDate", restartedRuntime };
  } catch (error) {
    if (isRuntimeDisconnectedError(error)) {
      return { status: "skipped", restartedRuntime };
    }
    dispatch({
      type: "log",
      // Tagged for provenance only — NOT in the viewport's source mute table.
      // Whether this entry toasts is content-dependent (disconnected-runtime
      // noise is muted, real write errors surface), which the viewport still
      // decides via its text patterns.
      text: `team model provider provisioning failed: ${formatConfigWriteError(error, "Team model provider write")}`,
      level: "warn",
      source: TEAM_MODEL_GATEWAY_LOG_SOURCES.provisionFailed,
    });
    return { status: "failed", restartedRuntime };
  }
}

function isRuntimeDisconnectedError(error: unknown): boolean {
  const message = formatError(error);
  return /\bCodex app-server is not connected\b/i.test(message)
    || /\bDisconnected from Codex app-server\b/i.test(message)
    || /\bCodex app-server connection closed\b/i.test(message);
}

export function catalogConfigWithExtraModels(
  catalogConfig: LocalModelCatalogConfigPayload,
  extraModels: readonly string[],
): LocalModelCatalogConfigPayload {
  if (extraModels.length === 0) return catalogConfig;
  return {
    ...catalogConfig,
    models: normalizeModelSlugs([...catalogConfig.models, ...extraModels]),
  };
}

function recordValue(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" && !Array.isArray(value)
    ? value as Record<string, unknown>
    : null;
}
