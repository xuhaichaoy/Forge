import { useCallback, useMemo } from "react";
import type { CollaborationModeMask, ModelConfig, Thread } from "@forge/codex-protocol";
import {
  normalizeReasoningEffortValue,
  type ReasoningEffortValue,
} from "../components/reasoning-picker-menu";
import type { CodexJsonRpcClient } from "../lib/codex-json-rpc-client";
import { formatError } from "../lib/format";
import type { CodexAuthSummary } from "../lib/tauri-host";
import { normalizeSubscriptionProviderId } from "../model/model-picker-selection";
import {
  CROSS_ACCOUNT_PROVIDER_SWITCH_MESSAGE,
  isCrossAccountModelSelectionForThread,
} from "../model/model-provider-switch";
import { omitThreadModelSelection } from "../model/model-selection-context";
import { normalizeModelConfig } from "../model/model-settings";
import { restartRuntimeForUpdatedProviderConfig } from "../model/model-workflow";
import { projectComposerQuotaBanner } from "../state/account-state";
import type { CodexUiState, PendingServerRequest } from "../state/codex-reducer";
import { hasCollaborationModePreset } from "../state/collaboration-modes";
import {
  projectComposerSubmitState,
  type ComposerAttachment,
  type ComposerMode,
} from "../state/composer-workflow";
import {
  withWorkspaceDeveloperInstructions,
  type ThreadWorkflowDispatch,
} from "../state/thread-workflow";
import { useAppOverlayState } from "./use-app-overlay-state";
import { useMcpAppHostBridge } from "./use-mcp-app-host-bridge";
import { useModelPickerViewModel } from "./use-model-picker-view-model";
import { useReconnectRecovery } from "./use-reconnect-recovery";
import { useTeamModelGateway } from "./use-team-model-gateway";
import { useThreadGoalActions } from "./use-thread-goal-actions";
import type { useModelPreferenceState } from "./use-model-preference-state";
import type { useUiPreferences } from "./use-ui-preferences";

/*
 * Mechanical extraction of a CONTIGUOUS hook cluster from ForgeAppBody
 * (permissions requirements + overlay anchors + team model gateway + model
 * picker view model + effective thread-context defaults + composer submit
 * state / quota banner + thread goal actions + reconnect recovery + MCP app
 * host bridge + collaboration mode loader). Hook call order inside the
 * cluster is unchanged, and the cluster is invoked from the exact source
 * position the first extracted hook previously occupied, so React's linear
 * hook sequence is preserved.
 */
export interface ForgeAppModelContextArgs {
  activePendingRequests: PendingServerRequest[];
  activeThread: Thread | null;
  activeThreadRunning: boolean;
  activeTurnId: string | null;
  client: CodexJsonRpcClient;
  codexAuthSummary: CodexAuthSummary | null;
  collaborationModes: CollaborationModeMask[];
  composerAttachments: ComposerAttachment[];
  connect: () => Promise<boolean>;
  dispatch: ThreadWorkflowDispatch;
  ensureConnected: () => Promise<boolean>;
  followUpQueueingEnabled: boolean;
  formatUiMessage: ReturnType<typeof useUiPreferences>["formatUiMessage"];
  input: string;
  loadCollaborationModes: () => Promise<CollaborationModeMask[]>;
  modelDraft: ModelConfig;
  oauthAuthMethod: string | null;
  openSideConversationPanelRef: { current: ((thread: Thread) => void) | null };
  personalProviderConfigured: boolean;
  reasoningEffortOverride: ReturnType<typeof useModelPreferenceState>["reasoningEffortOverride"];
  selectedModelKey: ReturnType<typeof useModelPreferenceState>["selectedModelKey"];
  setReasoningEffortOverride: ReturnType<typeof useModelPreferenceState>["setReasoningEffortOverride"];
  setSelectedModelKey: ReturnType<typeof useModelPreferenceState>["setSelectedModelKey"];
  setThreadModelSelection: ReturnType<typeof useModelPreferenceState>["setThreadModelSelection"];
  state: CodexUiState;
  threadModelSelections: ReturnType<typeof useModelPreferenceState>["threadModelSelections"];
  workspace: string;
  workspaceDeveloperInstructions: { workspace: string; value: string | null } | null;
}

export function useForgeAppModelContext(args: ForgeAppModelContextArgs) {
  const {
    activePendingRequests,
    activeThread,
    activeThreadRunning,
    activeTurnId,
    client,
    codexAuthSummary,
    collaborationModes,
    composerAttachments,
    connect,
    dispatch,
    ensureConnected,
    followUpQueueingEnabled,
    formatUiMessage,
    input,
    loadCollaborationModes,
    modelDraft,
    oauthAuthMethod,
    openSideConversationPanelRef,
    personalProviderConfigured,
    reasoningEffortOverride,
    selectedModelKey,
    setReasoningEffortOverride,
    setSelectedModelKey,
    setThreadModelSelection,
    state,
    threadModelSelections,
    workspace,
    workspaceDeveloperInstructions,
  } = args;
  const loadPermissionsRequirements = useCallback(async () => {
    if (!(await ensureConnected())) return undefined;
    return client.request<unknown>("configRequirements/read", {}, 120_000);
  }, [client, ensureConnected]);
  const handlePermissionsRequirementsError = useCallback((error: unknown) => {
    dispatch({
      type: "log",
      text: `Failed to load permission requirements: ${formatError(error)}`,
      level: "warn",
    });
  }, [dispatch]);
  const handleModelPickerOpen = useCallback(() => {
    dispatch({ type: "invalidateAuth" });
  }, [dispatch]);
  const {
    closeKeyboardShortcuts,
    closeModelPicker,
    closePermissionsPicker,
    closeReasoningPicker,
    keyboardShortcutsOpen,
    modelPickerAnchor,
    openKeyboardShortcuts,
    permissionsPickerAnchor,
    permissionsRequirements,
    reasoningPickerAnchor,
    toggleModelPickerAnchor,
    togglePermissionsPickerAnchor,
    toggleReasoningPickerAnchor,
  } = useAppOverlayState({
    loadPermissionsRequirements,
    onModelPickerOpen: handleModelPickerOpen,
    onPermissionsRequirementsError: handlePermissionsRequirementsError,
  });

  const restartRuntimeForProviderSwitch = useCallback(async (): Promise<boolean> => {
    try {
      return await restartRuntimeForUpdatedProviderConfig(client, dispatch, connect);
    } catch (error) {
      dispatch({
        type: "log",
        text: `provider switch runtime restart failed: ${formatError(error)}`,
        level: "warn",
      });
      return false;
    }
  }, [client, connect, dispatch]);

  const {
    provider: teamModelGatewayProvider,
    handleModelSelect,
  } = useTeamModelGateway({
    client,
    dispatch,
    connect,
    connected: state.connected,
    codexHome: state.hostStatus?.codexHome,
    threadContextDefaults: state.threadContextDefaults,
    personalModelDraft: modelDraft,
    personalProviderConfigured,
    selectedModelKey,
    setSelectedModelKey,
    refreshKey: modelPickerAnchor,
  });

  const {
    modelPickerProviders,
    readyProviders,
    decodedSelectedModelSelection,
    decodedActiveThreadModelSelection,
    defaultModelSelection,
    activeThreadDisplayModelSelection,
    effectiveModelSelection,
    modelPickerDefaultKey,
    modelPickerOverlaySelectedKey,
    modelPickerOverlayDefaultKey,
  } = useModelPickerViewModel({
    modelDraft,
    personalProviderConfigured,
    threadContextDefaults: state.threadContextDefaults,
    activeThreadId: state.activeThreadId,
    activeThreadModelProvider: activeThread?.modelProvider ?? null,
    activeThreadResolvedModel: state.activeThreadId
      ? state.threadsRuntime[state.activeThreadId]?.resolvedModel ?? null
      : null,
    selectedModelKey,
    threadModelSelections,
    codexAuthSummary,
    oauthAuthMethod,
    teamModelGatewayProvider,
  });
  /*
   * Provider context for the composer model chip tooltip ("团队模型 ·
   * 127.0.0.1:5050"). Personal and team gateways can serve identically named
   * models, so the chip alone cannot disambiguate which service a send hits.
   */
  const composerModelProviderHint = useMemo(() => {
    const providerId = state.activeThreadId
      ? activeThreadDisplayModelSelection?.providerId
      : decodedSelectedModelSelection?.providerId
        ?? (!effectiveModelSelection.noReadyProvider ? effectiveModelSelection.providerId : null);
    if (!providerId) return null;
    const provider = modelPickerProviders.find((candidate) => candidate.id === providerId);
    return provider ? `${provider.label} · ${provider.host}` : null;
  }, [
    activeThreadDisplayModelSelection?.providerId,
    decodedSelectedModelSelection?.providerId,
    effectiveModelSelection.noReadyProvider,
    effectiveModelSelection.providerId,
    modelPickerProviders,
    state.activeThreadId,
  ]);
  const composerSubmitState = useMemo(() => projectComposerSubmitState({
    input,
    attachmentCount: composerAttachments.length,
    connecting: state.connecting,
    threadRunning: activeThreadRunning,
    activeTurnId,
    pendingRequestCount: activePendingRequests.length,
    queueingEnabled: followUpQueueingEnabled,
    /*
     * New chats with no usable provider (team signed out, no personal
     * provider saved, no subscription) block the send with guidance instead
     * of silently dispatching to a dead endpoint. Existing chats keep their
     * birth provider and are not gated here.
     */
    modelUnavailableReason: !state.activeThreadId && effectiveModelSelection.noReadyProvider
      ? formatUiMessage({
        id: "hc.composer.noReadyModelProvider",
        defaultMessage: "No model service is available. Sign in to the team service first, or set a personal model endpoint in Settings → Models.",
      })
      : undefined,
  }), [
    activeThreadRunning,
    activeTurnId,
    activePendingRequests.length,
    composerAttachments.length,
    effectiveModelSelection.noReadyProvider,
    followUpQueueingEnabled,
    formatUiMessage,
    input,
    state.activeThreadId,
    state.connecting,
  ]);

  /*
   * Effective ThreadContextDefaults for thread/start + thread/fork calls.
   * If the user picked a (provider, model) pair in the UI picker, override
   * the config.toml default's model + modelProvider. Otherwise pass through
   * unchanged. Workspace AGENTS.md / CLAUDE.md instructions are appended here
   * so thread/start, thread/fork, and side conversations share the same context.
   */

  const effectiveThreadContextDefaults = useMemo(() => {
    /*
     * Birth binding: an active thread only gets a model/provider override
     * when the user explicitly re-picked one FOR THAT THREAD; the global
     * picker intent applies to new chats only. Without an override the
     * model selection is omitted, so resume/turn params keep the thread's
     * recorded provider.
     */
    const picked = state.activeThreadId
      ? decodedActiveThreadModelSelection
      : decodedSelectedModelSelection;
    const shouldApplyDefaultModelSelection = !state.activeThreadId;
    let modelContext = picked ? {
      ...state.threadContextDefaults,
      model: picked.model,
      modelProvider: normalizeSubscriptionProviderId(picked.providerId),
    } : shouldApplyDefaultModelSelection
      ? state.threadContextDefaults
      : omitThreadModelSelection(state.threadContextDefaults);
    /*
     * Apply the not-signed-in fallback: when the intended provider is not ready
     * but another is, send to the ready (provider, model) instead. Skip when
     * nothing is ready (the composer surfaces a sign-in prompt and disables send).
     */
    if ((picked || shouldApplyDefaultModelSelection)
      && !effectiveModelSelection.noReadyProvider
      && (effectiveModelSelection.providerId !== (modelContext?.modelProvider ?? "")
        || effectiveModelSelection.model !== (modelContext?.model ?? ""))) {
      modelContext = {
        ...modelContext,
        model: effectiveModelSelection.model,
        modelProvider: effectiveModelSelection.providerId,
      };
    }
    /*
     * CODEX-REF: composer-*.js — m.reasoningEffort 由 setModelAndReasoningEffort
     * 写入 modelSettings，渲染时取这个值给 picker 和送给后端。Forge 把 user 切换
     * 后的 effort 通过 reasoningEffortOverride 覆盖 thread context 默认值。
     */
    if (reasoningEffortOverride) {
      modelContext = {
        ...modelContext,
        reasoningEffort: reasoningEffortOverride,
      };
    }
    const workspaceInstructions = workspaceDeveloperInstructions?.workspace === workspace.trim()
      ? workspaceDeveloperInstructions.value
      : null;
    return withWorkspaceDeveloperInstructions(modelContext, workspaceInstructions);
  }, [decodedActiveThreadModelSelection, decodedSelectedModelSelection, effectiveModelSelection, reasoningEffortOverride, state.activeThreadId, state.threadContextDefaults, workspace, workspaceDeveloperInstructions]);
  const handleComposerModelSelect = useCallback((key: string | null) => {
    // Backstop for the picker-level cross-account lock (rows are disabled
    // with an explanation; this guards programmatic callers).
    if (activeThread && isCrossAccountModelSelectionForThread({
      currentProvider: activeThread.modelProvider,
      selectedKey: key,
      fallbackProvider: defaultModelSelection?.providerId ?? state.threadContextDefaults?.modelProvider,
    })) {
      dispatch({
        type: "log",
        text: formatUiMessage(CROSS_ACCOUNT_PROVIDER_SWITCH_MESSAGE),
        level: "warn",
      });
      return;
    }
    if (activeThread) {
      /*
       * Picking while a chat is active overrides THAT chat. `null` means
       * "the config default row" in picker terms — for an existing thread
       * that is still an explicit switch to the default (provider, model),
       * so pin the resolved key instead of clearing the override.
       */
      setThreadModelSelection(activeThread.id, key ?? modelPickerDefaultKey);
    }
    handleModelSelect(key);
  }, [
    activeThread,
    defaultModelSelection?.providerId,
    dispatch,
    formatUiMessage,
    handleModelSelect,
    modelPickerDefaultKey,
    setThreadModelSelection,
    state.threadContextDefaults?.modelProvider,
  ]);
  const handleReasoningSelect = useCallback((effort: string | null) => {
    setReasoningEffortOverride(effort);
  }, [
    setReasoningEffortOverride,
  ]);
  const activeModelSupportsImageInput = useMemo(() => {
    const providerId = effectiveThreadContextDefaults?.modelProvider ?? "";
    const modelSlug = effectiveThreadContextDefaults?.model ?? "";
    const model = state.models.find((item) => item.id === providerId)
      ?? state.models.find((item) => item.model === modelSlug)
      ?? null;
    return model?.supportsImageInput !== false;
  }, [effectiveThreadContextDefaults?.model, effectiveThreadContextDefaults?.modelProvider, state.models]);
  /*
   * codex composer reasoning picker: render the effective next-turn model's
   * advertised supportedReasoningEfforts instead of using the config default.
   */
  const activeModelSupportedEfforts = useMemo<readonly ReasoningEffortValue[] | undefined>(() => {
    const providerId = effectiveThreadContextDefaults?.modelProvider ?? "";
    const modelSlug = effectiveThreadContextDefaults?.model ?? "";
    const model = state.models.find((item) => item.id === providerId)
      ?? state.models.find((item) => item.model === modelSlug)
      ?? null;
    const efforts = model?.supportedReasoningEfforts;
    if (!efforts || efforts.length === 0) return undefined;
    const normalized = efforts
      .map((effort) => normalizeReasoningEffortValue(effort))
      .filter((effort): effort is ReasoningEffortValue => effort !== null);
    return normalized.length > 0 ? normalized : undefined;
  }, [effectiveThreadContextDefaults?.model, effectiveThreadContextDefaults?.modelProvider, state.models]);
  const composerSelectedModel = effectiveThreadContextDefaults?.model
    ?? normalizeModelConfig(modelDraft).model
    ?? null;
  const composerQuotaBanner = useMemo(
    () => projectComposerQuotaBanner(
      state.account.rateLimitsByLimitId,
      state.account.rateLimits,
      composerSelectedModel,
    ),
    [state.account.rateLimits, state.account.rateLimitsByLimitId, composerSelectedModel],
  );

  const { threadGoalPendingAction, editActiveThreadGoal, setActiveThreadGoalStatus, clearActiveThreadGoal } =
    useThreadGoalActions({ ensureConnected, activeThreadId: state.activeThreadId });

  useReconnectRecovery({
    connected: state.connected,
    activeThreadId: state.activeThreadId,
    workspace,
    effectiveThreadContextDefaults,
  });

  const {
    closeMcpFollowUpDialog,
    confirmMcpFollowUpDialog,
    handleMcpAppHostCall,
    mcpFollowUpDialog,
    readMcpResource,
  } = useMcpAppHostBridge({
    activeThreadId: state.activeThreadId,
    ensureConnected,
    hostDefaultCwd: state.hostStatus?.defaultCwd,
    openSideConversationPanelRef,
    threadContextDefaults: effectiveThreadContextDefaults,
    threads: state.threads,
    threadsRuntime: state.threadsRuntime,
    workspace,
  });

  const collaborationModesForComposerMode = useCallback(async (mode: ComposerMode): Promise<CollaborationModeMask[]> => {
    if (mode !== "plan" || hasCollaborationModePreset(collaborationModes, "plan")) return collaborationModes;
    return loadCollaborationModes();
  }, [collaborationModes, loadCollaborationModes]);

  // modelPickerProviders, readyProviders + effectiveModelSelection are defined
  // above effectiveThreadContextDefaults (hoisted so the not-signed-in fallback
  // can resolve before the thread-context defaults / composer state are built).
  return {
    activeModelSupportedEfforts,
    activeModelSupportsImageInput,
    activeThreadDisplayModelSelection,
    clearActiveThreadGoal,
    closeKeyboardShortcuts,
    closeMcpFollowUpDialog,
    closeModelPicker,
    closePermissionsPicker,
    closeReasoningPicker,
    collaborationModesForComposerMode,
    composerModelProviderHint,
    composerQuotaBanner,
    composerSubmitState,
    confirmMcpFollowUpDialog,
    editActiveThreadGoal,
    effectiveThreadContextDefaults,
    handleComposerModelSelect,
    handleMcpAppHostCall,
    handleReasoningSelect,
    keyboardShortcutsOpen,
    mcpFollowUpDialog,
    modelPickerAnchor,
    modelPickerOverlayDefaultKey,
    modelPickerOverlaySelectedKey,
    modelPickerProviders,
    openKeyboardShortcuts,
    permissionsPickerAnchor,
    permissionsRequirements,
    readMcpResource,
    readyProviders,
    reasoningPickerAnchor,
    restartRuntimeForProviderSwitch,
    setActiveThreadGoalStatus,
    teamModelGatewayProvider,
    threadGoalPendingAction,
    toggleModelPickerAnchor,
    togglePermissionsPickerAnchor,
    toggleReasoningPickerAnchor,
  };
}
