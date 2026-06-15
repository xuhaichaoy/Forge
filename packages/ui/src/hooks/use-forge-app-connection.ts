import type { Dispatch, SetStateAction } from "react";
import { useCallback, useEffect, useRef } from "react";
import type { CollaborationModeMask, ModelConfig, Thread } from "@forge/codex-protocol";
import type { CodexJsonRpcClient } from "../lib/codex-json-rpc-client";
import { formatError } from "../lib/format";
import {
  isSettingsModelProviderExcluded,
  SETTINGS_MODEL_PROVIDER_EXCLUDED_IDS,
} from "../model/model-selection-context";
import { buildModelSettingsDraftFromConfig } from "../model/model-settings";
import { refreshModels } from "../model/model-workflow";
import type { CodexUiState } from "../state/codex-reducer";
import { listCollaborationModes } from "../state/collaboration-modes";
import type { SettingsPanelId } from "../state/composer-workflow";
import type { FileReferenceSelection } from "../state/file-references";
import type { RailEntry } from "../state/render-groups";
import {
  readWorkspaceDeveloperInstructions,
  refreshThreadContextDefaults,
  refreshThreads,
  type ThreadWorkflowDispatch,
} from "../state/thread-workflow";

/*
 * Mechanical extraction of a CONTIGUOUS hook cluster from ForgeAppBody
 * (connect / auto-connect / reconnect backoff + host status polling +
 * workspace cwd sync + workspace developer instructions + model draft
 * refresh + collaboration modes + MCP server statuses + preview reset +
 * ensureConnected). Hook call order inside the cluster is unchanged, and the
 * cluster is invoked from the exact source position the first extracted hook
 * previously occupied, so React's linear hook sequence is preserved.
 */
export interface ForgeAppConnectionArgs {
  activeSettingsPanel: SettingsPanelId | null;
  activeThread: Thread | null;
  client: CodexJsonRpcClient;
  dispatch: ThreadWorkflowDispatch;
  modelDraft: ModelConfig;
  reconnectAttempt: number;
  setArtifactPreview: (entry: RailEntry | null) => void;
  setCollaborationModes: Dispatch<SetStateAction<CollaborationModeMask[]>>;
  setFileReference: Dispatch<SetStateAction<FileReferenceSelection | null>>;
  setMcpServerStatuses: Dispatch<SetStateAction<unknown>>;
  setModelDraft: Dispatch<SetStateAction<ModelConfig>>;
  setPersonalProviderConfigured: Dispatch<SetStateAction<boolean>>;
  setReconnectAttempt: Dispatch<SetStateAction<number>>;
  setWorkspace: Dispatch<SetStateAction<string>>;
  setWorkspaceDeveloperInstructions: Dispatch<SetStateAction<{
    workspace: string;
    value: string | null;
  } | null>>;
  state: CodexUiState;
  workspace: string;
}

export function useForgeAppConnection(args: ForgeAppConnectionArgs) {
  const {
    activeSettingsPanel,
    activeThread,
    client,
    dispatch,
    modelDraft,
    reconnectAttempt,
    setArtifactPreview,
    setCollaborationModes,
    setFileReference,
    setMcpServerStatuses,
    setModelDraft,
    setPersonalProviderConfigured,
    setReconnectAttempt,
    setWorkspace,
    setWorkspaceDeveloperInstructions,
    state,
    workspace,
  } = args;
  const autoConnectStarted = useRef(false);

  const connect = useCallback(async (): Promise<boolean> => {
    dispatch({ type: "connecting", value: true });
    try {
      await client.connect();
      dispatch({ type: "connected", value: true });
      setReconnectAttempt(0);
      await refreshThreads(client, dispatch);
      await refreshModels(client, dispatch);
      return true;
    } catch (error) {
      dispatch({ type: "connected", value: false });
      dispatch({ type: "log", text: formatError(error), level: "error" });
      return false;
    } finally {
      dispatch({ type: "connecting", value: false });
    }
  }, [client, dispatch, setReconnectAttempt]);

  const loadCollaborationModes = useCallback(async (): Promise<CollaborationModeMask[]> => {
    try {
      const modes = await listCollaborationModes(client);
      setCollaborationModes(modes);
      return modes;
    } catch (error) {
      // A transient collaborationMode/list failure (its 120s timeout / a sidecar restart)
      // must NOT wipe an already-loaded catalog: clearing it makes plan mode "unavailable"
      // after it had been working — i.e. "plan auto-stops after a while". Keep prior state.
      // Once the catalog holds plan, collaborationModesForComposerMode serves it from state
      // and never re-fetches, so a later failure can no longer drop plan availability.
      dispatch({ type: "log", text: `collaborationMode/list failed: ${formatError(error)}`, level: "warn" });
      return [];
    }
  }, [client, dispatch, setCollaborationModes]);

  useEffect(() => {
    if (autoConnectStarted.current) return;
    autoConnectStarted.current = true;
    void connect();
  }, [connect]);

  useEffect(() => {
    const timer = window.setInterval(() => {
      void client.refreshStatus().catch((error) => {
        dispatch({ type: "log", text: `host_status failed: ${formatError(error)}`, level: "warn" });
      });
    }, 5_000);
    return () => window.clearInterval(timer);
  }, [client, dispatch]);

  useEffect(() => {
    if (!autoConnectStarted.current) return;
    if (state.connected || state.connecting) return;
    const delayMs = Math.min(30_000, 1_000 * (2 ** Math.min(reconnectAttempt, 5)));
    const timer = window.setTimeout(() => {
      setReconnectAttempt((current) => current + 1);
      void connect();
    }, delayMs);
    return () => window.clearTimeout(timer);
  }, [connect, reconnectAttempt, setReconnectAttempt, state.connected, state.connecting]);

  /*
   * CODEX-REF: projectless default. Codex starts every session PROJECTLESS — the
   * composer workspace-roots default to the `~` sentinel (no project selected), so a
   * first chat lands in "Chats" with a generated ~/Documents/Codex/<date>/<slug> cwd.
   * Forge models the unselected workspace as the empty string (see
   * `isProjectlessWorkspace`), so we deliberately do NOT seed `workspace` from the
   * host's defaultCwd ($HOME) anymore — seeding $HOME made every new chat look like a
   * "$HOME project" and (via the old `workspace === defaultCwd` rule) forced it
   * projectless even when the user explicitly picked $HOME as a project. `workspace`
   * is promoted to a real path only when the user opens a project thread (the
   * activeThread.cwd sync effect below) or selects a folder (`selectWorkspaceRoot`).
   */

  useEffect(() => {
    const threadCwd = activeThread?.cwd?.trim();
    if (!threadCwd) return;
    setWorkspace((current) => current === threadCwd ? current : threadCwd);
  }, [activeThread?.cwd, setWorkspace]);

  useEffect(() => {
    const currentWorkspace = workspace.trim();
    if (!currentWorkspace) {
      setWorkspaceDeveloperInstructions(null);
      return;
    }
    let cancelled = false;
    setWorkspaceDeveloperInstructions((current) => (
      current?.workspace === currentWorkspace ? current : { workspace: currentWorkspace, value: null }
    ));
    void readWorkspaceDeveloperInstructions(currentWorkspace, { codexHome: state.hostStatus?.codexHome })
      .then((value) => {
        if (!cancelled) setWorkspaceDeveloperInstructions({ workspace: currentWorkspace, value });
      })
      .catch((error) => {
        if (cancelled) return;
        setWorkspaceDeveloperInstructions({ workspace: currentWorkspace, value: null });
        dispatch({ type: "log", text: `workspace instructions load failed: ${formatError(error)}`, level: "warn" });
      });
    return () => {
      cancelled = true;
    };
  }, [dispatch, setWorkspaceDeveloperInstructions, state.hostStatus?.codexHome, workspace]);

  useEffect(() => {
    if (!state.connected) return;
    void refreshThreadContextDefaults(client, dispatch, workspace)
      .then((config) => {
        if (config) {
          const { draft, configured } = buildModelSettingsDraftFromConfig(config, {
            excludedProviderIds: SETTINGS_MODEL_PROVIDER_EXCLUDED_IDS,
          });
          setModelDraft(draft);
          // The draft above may be the factory placeholder; only a provider
          // with a saved config.toml entry participates in default/fallback
          // resolution.
          setPersonalProviderConfigured(configured);
        }
      });
  }, [client, dispatch, setModelDraft, setPersonalProviderConfigured, state.connected, workspace]);

  useEffect(() => {
    if (activeSettingsPanel !== "models" || !state.connected) return;
    if (!isSettingsModelProviderExcluded(modelDraft.id.trim())) return;
    void refreshThreadContextDefaults(client, dispatch, workspace)
      .then((config) => {
        if (config) {
          const { draft, configured } = buildModelSettingsDraftFromConfig(config, {
            excludedProviderIds: SETTINGS_MODEL_PROVIDER_EXCLUDED_IDS,
          });
          setModelDraft(draft);
          setPersonalProviderConfigured(configured);
        }
      });
  }, [activeSettingsPanel, client, dispatch, modelDraft.id, setModelDraft, setPersonalProviderConfigured, state.connected, workspace]);

  useEffect(() => {
    if (!state.connected) return;
    void loadCollaborationModes();
  }, [loadCollaborationModes, state.connected]);

  useEffect(() => {
    if (!state.connected) {
      setMcpServerStatuses(null);
      return;
    }
    let cancelled = false;
    void client.request<unknown>("mcpServerStatus/list", { limit: 50, detail: "toolsAndAuthOnly" }, 120_000)
      .then((result) => {
        if (!cancelled) setMcpServerStatuses(result);
      })
      .catch((error) => {
        if (!cancelled) {
          setMcpServerStatuses(null);
          dispatch({ type: "log", text: `mcpServerStatus/list failed: ${formatError(error)}`, level: "warn" });
        }
      });
    return () => {
      cancelled = true;
    };
  }, [client, dispatch, setMcpServerStatuses, state.invalidation.mcpStatus, state.connected]);

  useEffect(() => {
    setArtifactPreview(null);
    setFileReference(null);
  }, [setArtifactPreview, setFileReference, state.activeThreadId]);

  const ensureConnected = useCallback(async () => {
    if (state.connected) return true;
    return connect();
  }, [connect, state.connected]);
  return {
    connect,
    ensureConnected,
    loadCollaborationModes,
  };
}
