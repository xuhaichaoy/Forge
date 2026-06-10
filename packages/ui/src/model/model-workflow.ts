import type { ModelConfig } from "@hicodex/codex-protocol";
import type { CodexJsonRpcClient } from "../lib/codex-json-rpc-client";
import { formatError } from "../lib/format";
import { writeLocalModelCatalog } from "../lib/tauri-host";
import type { CodexUiAction } from "../state/codex-reducer";
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

export interface SaveModelDraftOptions {
  client: CodexJsonRpcClient;
  dispatch: CodexUiDispatch;
  connect: () => Promise<boolean>;
  modelDraft: ModelConfig;
  connected: boolean;
  codexHome?: string | null;
  restartRuntime?: boolean;
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
  additionalCatalogModels = [],
}: SaveModelDraftOptions): Promise<SaveModelDraftResult> {
  const nextModel = normalizeModelConfig(modelDraft);
  dispatch({ type: "upsertModel", model: nextModel });
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
      const catalogPath = await writeLocalModelCatalog(
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
          await client.disconnect();
          dispatch({ type: "connected", value: false });
          dispatch({ type: "markThreadsNeedResumeAfterReconnect" });
          restartedRuntime = await connect();
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
      text: `saved locally; Codex config write failed: ${formatConfigWriteError(error, "Model config write")}`,
      level: "warn",
    });
  }
  return { wroteConfig, restartedRuntime };
}

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

    const catalogPath = await writeLocalModelCatalog(codexHome, catalogConfig);

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
        // chats hold sessions with the stale token, so restart once.
        dispatch({
          type: "log",
          text: "team model connection updated; restarting Codex runtime so loaded chats use the new credentials",
        });
        try {
          await client.disconnect();
          dispatch({ type: "connected", value: false });
          dispatch({ type: "markThreadsNeedResumeAfterReconnect" });
          restartedRuntime = await connect();
          if (!restartedRuntime) {
            dispatch({
              type: "log",
              text: "team model connection updated, but Codex runtime did not reconnect",
              level: "warn",
            });
          }
        } catch (restartError) {
          dispatch({
            type: "log",
            text: `team model connection updated, but runtime restart failed: ${formatError(restartError)}`,
            level: "warn",
          });
        }
      }
      return { status: "provisioned", restartedRuntime };
    }
    return { status: "upToDate", restartedRuntime };
  } catch (error) {
    dispatch({
      type: "log",
      text: `team model provider provisioning failed: ${formatConfigWriteError(error, "Team model provider write")}`,
      level: "warn",
    });
    return { status: "failed", restartedRuntime };
  }
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
