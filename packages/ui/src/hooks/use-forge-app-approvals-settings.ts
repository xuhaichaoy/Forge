import type { Dispatch, MutableRefObject, SetStateAction } from "react";
import { useCallback } from "react";
import type { ModelConfig } from "@forge/codex-protocol";
import type { CodexJsonRpcClient } from "../lib/codex-json-rpc-client";
import { formatError } from "../lib/format";
import {
  DEFAULT_MODEL_REASONING_SUMMARY,
  encodeSelection,
  normalizeModelConfig,
} from "../model/model-settings";
import { saveModelDraft as saveModelDraftWorkflow } from "../model/model-workflow";
import { browserStorage } from "../state/app-shell-helpers";
import {
  PLAN_IMPLEMENTATION_REQUEST_METHOD,
  buildApprovalResult,
  buildStopPendingRequestResult,
  planImplementationFollowUpText,
} from "../state/approval-requests";
import {
  collectBackgroundSubagentStopThreadIds,
  type mergeBackgroundSubagentStopThreadIds,
} from "../state/background-subagents-stop";
import type {
  CodexUiState,
  PendingServerRequest,
  selectItemsByThread,
} from "../state/codex-reducer";
import type { CommandPanelKind, CommandPanelOptions, CommandPanelState } from "../state/command-panel";
import type { ComposerAttachment, ComposerMode, SettingsPanelId } from "../state/composer-workflow";
import {
  claimForgeImageToolRequest,
  executeForgeImageToolCall,
  imageToolFailureText,
  isForgeImageToolCall,
  saveImageGenerationSettings,
  type ImageGenerationSettings,
} from "../state/image-generation-tool";
import {
  deriveBackgroundPendingRequests,
  pendingRequestOwnerThreadId,
  pendingRequestScope,
} from "../state/pending-request-scope";
import {
  permissionModeThreadSettingsPatch,
  type PermissionMode,
} from "../state/permissions-mode";
import {
  cleanBackgroundTerminalsForThread,
  interruptThreadTurn,
  readInProgressTurnId,
  readThread,
  refreshThreadContextDefaults,
  refreshThreadMetadata,
  type ThreadWorkflowDispatch,
} from "../state/thread-workflow";
import {
  useCommandPanelActions,
  type McpServerFormAction,
  type McpToolFormAction,
} from "./use-command-panel-actions";
import type { useAppOverlayState } from "./use-app-overlay-state";
import type { useCommandPanelFileSearch } from "./use-command-panel-file-search";
import type { useModelPreferenceState } from "./use-model-preference-state";
import type { useTeamModelGateway } from "./use-team-model-gateway";
import type { useThreadPins } from "./use-thread-pins";
import type { useTurnSubmission } from "./use-turn-submission";
import type { useUiPreferences } from "./use-ui-preferences";

/*
 * Mechanical extraction of a CONTIGUOUS hook cluster from ForgeAppBody
 * (command-panel actions + settings-panel apply + approval responses +
 * background-subagent stop + model/image draft apply). Hook call order inside
 * the cluster is unchanged, and the cluster is invoked from the exact source
 * position the first extracted hook previously occupied, so React's linear
 * hook sequence is preserved.
 */
export interface ForgeAppApprovalsSettingsArgs {
  activeTurnId: string | null;
  backgroundSubagentsStopAllPending: boolean;
  backgroundSubagentStopThreadIds: ReturnType<typeof mergeBackgroundSubagentStopThreadIds>;
  client: CodexJsonRpcClient;
  closePermissionsPicker: ReturnType<typeof useAppOverlayState>["closePermissionsPicker"];
  connect: () => Promise<boolean>;
  dispatch: ThreadWorkflowDispatch;
  ensureConnected: () => Promise<boolean>;
  handledImageToolRequestIdsRef: MutableRefObject<Set<string>>;
  imageGenerationDraft: ImageGenerationSettings;
  imageGenerationSettings: ImageGenerationSettings;
  itemsByThread: ReturnType<typeof selectItemsByThread>;
  mcpServerForm: McpServerFormAction | null;
  mcpToolForm: McpToolFormAction | null;
  modelDraft: ModelConfig;
  notificationPreferences: ReturnType<typeof useUiPreferences>["notificationPreferences"];
  openCommandPanel: (panel: CommandPanelKind, options?: CommandPanelOptions) => void;
  openFileSearchPanel: ReturnType<typeof useCommandPanelFileSearch>["openFileSearchPanel"];
  openSettingsPanelContent: (panel: CommandPanelKind, options?: CommandPanelOptions) => void;
  resetUiKeyboardShortcut: ReturnType<typeof useUiPreferences>["resetUiKeyboardShortcut"];
  runSlashCommandFromPanel: (commandId: string) => void;
  selectThreadById: (threadId: string) => void;
  sendTurn: ReturnType<typeof useTurnSubmission>["sendTurn"];
  setActiveComposerMode: (mode: ComposerMode) => void;
  setActiveSettingsPanel: Dispatch<SetStateAction<SettingsPanelId | null>>;
  setBackgroundSubagentsStopAllPending: Dispatch<SetStateAction<boolean>>;
  setCommandPanel: Dispatch<SetStateAction<CommandPanelState | null>>;
  setComposerAttachments: Dispatch<SetStateAction<ComposerAttachment[]>>;
  setDismissedPlanImplementationRequestIds: Dispatch<SetStateAction<ReadonlySet<string>>>;
  setImageGenerationDraft: Dispatch<SetStateAction<ImageGenerationSettings>>;
  setImageGenerationSettings: Dispatch<SetStateAction<ImageGenerationSettings>>;
  setInput: Dispatch<SetStateAction<string>>;
  setMcpServerForm: Dispatch<SetStateAction<McpServerFormAction | null>>;
  setMcpToolForm: Dispatch<SetStateAction<McpToolFormAction | null>>;
  setNotificationPreferences: ReturnType<typeof useUiPreferences>["setNotificationPreferences"];
  setSelectedModelKey: ReturnType<typeof useModelPreferenceState>["setSelectedModelKey"];
  setThreadPinnedById: ReturnType<typeof useThreadPins>["setThreadPinnedById"];
  setUiCodeFontSize: ReturnType<typeof useUiPreferences>["setUiCodeFontSize"];
  setUiKeyboardShortcut: ReturnType<typeof useUiPreferences>["setUiKeyboardShortcut"];
  setUiLocale: ReturnType<typeof useUiPreferences>["setUiLocale"];
  setUiReducedMotion: ReturnType<typeof useUiPreferences>["setUiReducedMotion"];
  setUiThemeMode: ReturnType<typeof useUiPreferences>["setUiThemeMode"];
  state: CodexUiState;
  teamModelGatewayProvider: ReturnType<typeof useTeamModelGateway>["provider"];
  workspace: string;
}

export function useForgeAppApprovalsSettings(args: ForgeAppApprovalsSettingsArgs) {
  const {
    activeTurnId,
    backgroundSubagentsStopAllPending,
    backgroundSubagentStopThreadIds,
    client,
    closePermissionsPicker,
    connect,
    dispatch,
    ensureConnected,
    handledImageToolRequestIdsRef,
    imageGenerationDraft,
    imageGenerationSettings,
    itemsByThread,
    mcpServerForm,
    mcpToolForm,
    modelDraft,
    notificationPreferences,
    openCommandPanel,
    openFileSearchPanel,
    openSettingsPanelContent,
    resetUiKeyboardShortcut,
    runSlashCommandFromPanel,
    selectThreadById,
    sendTurn,
    setActiveComposerMode,
    setActiveSettingsPanel,
    setBackgroundSubagentsStopAllPending,
    setCommandPanel,
    setComposerAttachments,
    setDismissedPlanImplementationRequestIds,
    setImageGenerationDraft,
    setImageGenerationSettings,
    setInput,
    setMcpServerForm,
    setMcpToolForm,
    setNotificationPreferences,
    setSelectedModelKey,
    setThreadPinnedById,
    setUiCodeFontSize,
    setUiKeyboardShortcut,
    setUiLocale,
    setUiReducedMotion,
    setUiThemeMode,
    state,
    teamModelGatewayProvider,
    workspace,
  } = args;
  const {
    callMcpToolFromPanel,
    selectCommandPanelAction,
    selectCommandPanelEntry,
    writeMcpServerConfigFromPanel,
  } = useCommandPanelActions({
    activeThreadId: state.activeThreadId,
    activeTurnId,
    ensureConnected,
    openCommandPanel,
    setActiveSettingsPanel,
    setCommandPanel,
    setComposerAttachments,
    setInput,
    setMcpServerForm,
    setMcpToolForm,
    setUiLocale,
    setUiThemeMode,
    setUiCodeFontSize,
    setUiReducedMotion,
    setUiKeyboardShortcut,
    resetUiKeyboardShortcut,
    notificationPreferences,
    setNotificationPreferences,
    runSlashCommand: runSlashCommandFromPanel,
    openFileSearchPanel,
    setThreadPinnedById,
    selectThreadById,
    workspace,
  });

  const handleSettingsPanelSelectAction = useCallback(
    (action: Parameters<typeof selectCommandPanelAction>[0]) => selectCommandPanelAction(action, openSettingsPanelContent),
    [selectCommandPanelAction, openSettingsPanelContent],
  );
  const handleSettingsPanelSelectEntry = useCallback(
    (entry: Parameters<NonNullable<import("../components/model-settings-panel").SettingsPanelProps["onSelectEntry"]>>[0]) => {
      if (entry.disabled || !entry.action) return;
      selectCommandPanelAction(entry.action, openSettingsPanelContent);
    },
    [selectCommandPanelAction, openSettingsPanelContent],
  );
  // CODEX-REF: composer-*.js / use-permissions-mode-*.js — composer quick
  // permission choices apply to the current thread's next turns, not global
  // config.toml defaults.
  const applyComposerPermissionMode = useCallback(
    (mode: PermissionMode) => {
      const threadId = state.activeThreadId;
      if (!threadId) {
        dispatch({ type: "log", text: "Select or start a thread before changing permissions.", level: "warn" });
        closePermissionsPicker();
        return;
      }
      closePermissionsPicker();
      void (async () => {
        if (!(await ensureConnected())) return;
        try {
          await client.request("thread/settings/update", {
            threadId,
            ...permissionModeThreadSettingsPatch(mode),
          }, 120_000);
        } catch (error) {
          dispatch({ type: "log", text: `Failed to update permissions: ${formatError(error)}`, level: "error" });
        }
      })();
    },
    [client, closePermissionsPicker, dispatch, ensureConnected, state.activeThreadId],
  );

  const handleMcpToolFormSubmit = useCallback((argumentsValue: Record<string, unknown>) => {
    const action = mcpToolForm;
    setMcpToolForm(null);
    void callMcpToolFromPanel({ type: "callMcpTool", server: action!.server, tool: action!.tool, arguments: argumentsValue });
  }, [mcpToolForm, callMcpToolFromPanel, setMcpToolForm]);

  const handleMcpServerFormSubmit = useCallback((name: string, config: Record<string, unknown>) => {
    const formAction = mcpServerForm;
    setMcpServerForm(null);
    void writeMcpServerConfigFromPanel({
      type: "writeMcpServerConfig",
      title: formAction!.mode === "edit" ? `Save ${name}` : "Add MCP server",
      name,
      config,
    }, openSettingsPanelContent);
  }, [mcpServerForm, writeMcpServerConfigFromPanel, openSettingsPanelContent, setMcpServerForm]);

  const interruptActiveTurn = useCallback(async () => {
    if (!state.activeThreadId || !activeTurnId) return;
    try {
      await interruptThreadTurn(client, state.activeThreadId, activeTurnId);
    } catch (error) {
      dispatch({ type: "log", text: formatError(error), level: "error" });
    }
  }, [activeTurnId, client, dispatch, state.activeThreadId]);

  const respondToRequest = useCallback(async (
    request: PendingServerRequest,
    accepted: boolean,
    answers?: Record<string, string[]>,
  ) => {
    try {
      if (request.method === PLAN_IMPLEMENTATION_REQUEST_METHOD) {
        setDismissedPlanImplementationRequestIds((current) => new Set([...current, String(request.id)]));
        dispatch({ type: "resolveServerRequest", id: request.id });
        if (!accepted) return;
        const followUp = planImplementationFollowUpText(request, answers);
        if (!followUp) return;
        setActiveComposerMode("default");
        await sendTurn({
          bypassSubmitState: true,
          input: followUp,
          mode: "default",
        });
        return;
      }
      if (isForgeImageToolCall(request)) {
        if (!claimForgeImageToolRequest(handledImageToolRequestIdsRef.current, request)) {
          dispatch({ type: "resolveServerRequest", id: request.id });
          return;
        }
        const result = accepted
          ? await executeForgeImageToolCall(request, normalizeModelConfig(modelDraft), {
              codexHome: state.hostStatus?.codexHome,
              imageSettings: imageGenerationSettings,
            })
          : {
              success: false,
              contentItems: [{ type: "inputText" as const, text: "Image generation was cancelled." }],
            };
        if (accepted) {
          const failureText = imageToolFailureText(result);
          if (failureText) dispatch({ type: "log", text: failureText, level: "error" });
        }
        await client.respond(request.id, result);
        dispatch({ type: "resolveServerRequest", id: request.id });
        return;
      }
      if (request.method === "item/tool/requestUserInput" && !accepted) {
        const scope = pendingRequestScope(request);
        const threadId = scope.threadId
          ?? pendingRequestOwnerThreadId(request, { itemsByThread })
          ?? state.activeThreadId;
        const runtime = threadId ? state.threadsRuntime[threadId] : null;
        const turnId = scope.turnId ?? runtime?.activeTurnId ?? (threadId === state.activeThreadId ? activeTurnId : null);
        if (threadId && turnId) {
          await interruptThreadTurn(client, threadId, turnId);
          dispatch({ type: "resolveServerRequest", id: request.id });
          return;
        }
      }
      const result = buildApprovalResult(request, accepted, answers);
      if (result === null) {
        await client.reject(request.id, accepted ? "Unsupported Forge request" : "Rejected by Forge user");
      } else {
        await client.respond(request.id, result);
      }
      dispatch({ type: "resolveServerRequest", id: request.id });
    } catch (error) {
      dispatch({ type: "log", text: formatError(error), level: "error" });
    }
  }, [
    activeTurnId,
    client,
    dispatch,
    handledImageToolRequestIdsRef,
    imageGenerationSettings,
    itemsByThread,
    modelDraft,
    sendTurn,
    setActiveComposerMode,
    setDismissedPlanImplementationRequestIds,
    state.activeThreadId,
    state.hostStatus?.codexHome,
    state.threadsRuntime,
  ]);

  const stopBackgroundSubagents = useCallback(async () => {
    if (backgroundSubagentsStopAllPending || backgroundSubagentStopThreadIds.length === 0) return;
    setBackgroundSubagentsStopAllPending(true);
    try {
      if (!(await ensureConnected())) return;
      const stopThreadIds = await collectBackgroundSubagentStopThreadIds({
        activeThreadId: state.activeThreadId,
        seedThreadIds: backgroundSubagentStopThreadIds,
        readThread: (threadId) => readThread(client, threadId, true),
      });
      const stopPendingRequests = deriveBackgroundPendingRequests(state.pendingRequests, {
        activeThreadId: state.activeThreadId,
        backgroundThreadIds: stopThreadIds,
        itemsByThread,
      });
      let pendingRequestCount = 0;
      let interruptedCount = 0;
      let terminalCleanupCount = 0;
      let failedCount = 0;
      const requestThreadIds = new Set<string>();
      for (const request of stopPendingRequests) {
        const ownerThreadId = pendingRequestOwnerThreadId(request, { itemsByThread });
        if (ownerThreadId) requestThreadIds.add(ownerThreadId);
        try {
          const result = buildStopPendingRequestResult(request);
          if (result === null) {
            await client.reject(request.id, "Stopped by Forge user");
          } else {
            await client.respond(request.id, result);
          }
          dispatch({ type: "resolveServerRequest", id: request.id });
          pendingRequestCount += 1;
        } catch {
          failedCount += 1;
        }
      }

      const refreshedThreadIds = new Set<string>();
      for (const threadId of stopThreadIds) {
        let turnId = state.threadsRuntime[threadId]?.activeTurnId ?? null;
        if (!turnId) {
          try {
            turnId = await readInProgressTurnId(client, threadId);
          } catch {
            failedCount += 1;
          }
        }
        let shouldRefresh = requestThreadIds.has(threadId);
        try {
          if (turnId) {
            await interruptThreadTurn(client, threadId, turnId);
            interruptedCount += 1;
            shouldRefresh = true;
          } else {
            await cleanBackgroundTerminalsForThread(client, threadId);
            terminalCleanupCount += 1;
            shouldRefresh = true;
          }
          if (shouldRefresh && !refreshedThreadIds.has(threadId)) {
            await refreshThreadMetadata(client, threadId, dispatch);
            refreshedThreadIds.add(threadId);
          }
        } catch {
          failedCount += 1;
        }
      }

      const handledCount = pendingRequestCount + interruptedCount + terminalCleanupCount;
      if (handledCount > 0) {
        const parts = [
          interruptedCount > 0
            ? `${interruptedCount} running background agent${interruptedCount === 1 ? "" : "s"}`
            : null,
          pendingRequestCount > 0
            ? `${pendingRequestCount} pending request${pendingRequestCount === 1 ? "" : "s"}`
            : null,
          terminalCleanupCount > 0
            ? `${terminalCleanupCount} background terminal cleanup${terminalCleanupCount === 1 ? "" : "s"}`
            : null,
        ].filter(Boolean);
        dispatch({
          type: "log",
          text: `Stop requested for ${parts.join(" and ")}.`,
          level: failedCount > 0 ? "warn" : "info",
        });
      } else {
        dispatch({
          type: "log",
          text: failedCount > 0
            ? "Failed to stop background agents."
            : "No running background agent turns or terminals were found.",
          level: failedCount > 0 ? "error" : "warn",
        });
      }
    } finally {
      setBackgroundSubagentsStopAllPending(false);
    }
  }, [
    backgroundSubagentStopThreadIds,
    backgroundSubagentsStopAllPending,
    client,
    dispatch,
    ensureConnected,
    itemsByThread,
    setBackgroundSubagentsStopAllPending,
    state.activeThreadId,
    state.pendingRequests,
    state.threadsRuntime,
  ]);

  const applyModelDraft = useCallback(() => {
    const nextModel = normalizeModelConfig(modelDraft);
    void saveModelDraftWorkflow({
      client,
      dispatch,
      connect,
      modelDraft,
      connected: state.connected,
      codexHome: state.hostStatus?.codexHome,
      restartRuntime: true,
      // models.json is a full overwrite — keep the team gateway entries alive.
      additionalCatalogModels: teamModelGatewayProvider?.models ?? [],
    }).then((result) => {
      if (result.wroteConfig && nextModel.model) {
        setSelectedModelKey(encodeSelection(nextModel.id, nextModel.model));
        dispatch({
          type: "setThreadContextDefaults",
          context: {
            ...state.threadContextDefaults,
            model: nextModel.model,
            modelProvider: nextModel.id,
            reasoningSummary: state.threadContextDefaults?.reasoningSummary ?? DEFAULT_MODEL_REASONING_SUMMARY,
            personality: state.threadContextDefaults?.personality ?? "friendly",
          },
        });
      }
      if (result.wroteConfig && !result.restartedRuntime) {
        void refreshThreadContextDefaults(client, dispatch, workspace);
      }
    });
  }, [
    client,
    dispatch,
    connect,
    modelDraft,
    setSelectedModelKey,
    state.connected,
    state.hostStatus?.codexHome,
    state.threadContextDefaults,
    teamModelGatewayProvider?.models,
    workspace,
  ]);

  const applyImageGenerationDraft = useCallback(() => {
    const nextSettings = saveImageGenerationSettings(browserStorage(), imageGenerationDraft);
    setImageGenerationSettings(nextSettings);
    setImageGenerationDraft(nextSettings);
    dispatch({
      type: "log",
      text: nextSettings.baseUrl
        ? `set image generation endpoint to ${nextSettings.baseUrl}`
        : "image generation endpoint cleared; Forge image_gen will stay disabled until an image endpoint is configured",
    });
  }, [dispatch, imageGenerationDraft, setImageGenerationDraft, setImageGenerationSettings]);
  return {
    applyComposerPermissionMode,
    applyImageGenerationDraft,
    applyModelDraft,
    handleMcpServerFormSubmit,
    handleMcpToolFormSubmit,
    handleSettingsPanelSelectAction,
    handleSettingsPanelSelectEntry,
    interruptActiveTurn,
    respondToRequest,
    selectCommandPanelAction,
    selectCommandPanelEntry,
    stopBackgroundSubagents,
  };
}
