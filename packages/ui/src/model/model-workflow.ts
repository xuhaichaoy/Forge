import type { ModelConfig } from "@hicodex/codex-protocol";
import type { CodexJsonRpcClient } from "../lib/codex-json-rpc-client";
import { formatError } from "../lib/format";
import { writeLocalModelCatalog } from "../lib/tauri-host";
import type { CodexUiAction } from "../state/codex-reducer";
import {
  buildLocalModelCatalogEntry,
  buildModelConfigEdits,
  buildModelConfigsFromList,
  normalizeModelConfig,
  type ModelListEntry,
} from "./model-settings";

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
      const catalogPath = await writeLocalModelCatalog(
        codexHome,
        buildLocalModelCatalogEntry(nextModel),
      );
      await client.request("config/batchWrite", {
        edits: buildModelConfigEdits(nextModel, catalogPath),
        reloadUserConfig: true,
      });
      dispatch({
        type: "log",
        text: `set Codex model to ${nextModel.model}; restart sidecar if this model was not in the previous catalog`,
      });
      await refreshModels(client, dispatch);
    }
  } catch (error) {
    dispatch({ type: "log", text: `saved locally; Codex config write failed: ${formatError(error)}`, level: "warn" });
  }
}
