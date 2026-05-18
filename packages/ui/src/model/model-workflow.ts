import type { ModelConfig } from "@hicodex/codex-protocol";
import type { CodexJsonRpcClient } from "../lib/codex-json-rpc-client";
import { formatError } from "../lib/format";
import { writeLocalModelCatalog } from "../lib/tauri-host";
import type { CodexUiAction } from "../state/codex-reducer";
import {
  buildLocalModelCatalogConfig,
  buildModelConfigEdits,
  buildModelConfigsFromList,
  normalizeModelConfig,
  type ModelListEntry,
} from "./model-settings";
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
}: SaveModelDraftOptions): Promise<void> {
  const nextModel = normalizeModelConfig(modelDraft);
  dispatch({ type: "upsertModel", model: nextModel });
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
        buildLocalModelCatalogConfig(nextModel),
      );
      const edits = buildModelConfigEdits(nextModel, catalogPath);
      await client.request("config/batchWrite", buildConfigBatchWriteParams({
        edits,
        target: configWriteTarget,
        reloadUserConfig: true,
      }));
      dispatch({
        type: "log",
        text: `set Codex model to ${nextModel.model}; restart sidecar if this model was not in the previous catalog`,
      });
      await refreshModels(client, dispatch);
    }
  } catch (error) {
    dispatch({
      type: "log",
      text: `saved locally; Codex config write failed: ${formatConfigWriteError(error, "Model config write")}`,
      level: "warn",
    });
  }
}
