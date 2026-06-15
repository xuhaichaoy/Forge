import type { Dispatch, MutableRefObject, SetStateAction } from "react";
import { useCallback } from "react";
import type { CollaborationModeMask } from "@forge/codex-protocol";
import type { CodexJsonRpcClient, RpcDebugEvent } from "../lib/codex-json-rpc-client";
import { pickFileReferences } from "../lib/tauri-host";
import type { AccountState } from "../state/account-state";
import { loadAllApps } from "../state/app-list";
import type { resolveForgeBuildInfo } from "../state/build-info";
import type { CodexUiState } from "../state/codex-reducer";
import { hasCollaborationModePreset } from "../state/collaboration-modes";
import type { CommandPanelKind, CommandPanelOptions } from "../state/command-panel";
import {
  applySlashCommand,
  composerAttachmentsFromPaths,
  type ComposerAttachment,
  type ComposerMentionMarker,
  type ComposerMentionOption,
  type ComposerMode,
  type SettingsPanelId,
  type SlashCommand,
  type SlashCommandAction,
} from "../state/composer-workflow";
import type { WorkspaceFuzzyFileSearchController } from "../state/fuzzy-file-search-session";
import {
  dedupeComposerMentionOptions,
  mentionOptionsFromAgentThreads,
  mentionOptionsFromAppsResponse,
  mentionOptionsFromConfiguredAgentsResponse,
  mentionOptionsFromFuzzyFiles,
  mentionOptionsFromPluginsResponse,
  mentionOptionsFromSkillsResponse,
} from "../state/mention-options";
import {
  appRegistryEntriesFromResponse,
  type AppRegistryEntry,
} from "../state/render-groups";
import { runSlashRequestWorkflow } from "../state/slash-request-workflow";
import type { ThreadWorkflowDispatch } from "../state/thread-workflow";
import type { Thread } from "@forge/codex-protocol";
import {
  attachmentsWithDataImagePreviews,
} from "./use-turn-submission";
import type { useAppOverlayState } from "./use-app-overlay-state";
import type { useBackgroundAgentPanel } from "./use-background-agent-panel";
import type { useThreadActions } from "./use-thread-actions";
import type { useUiPreferences } from "./use-ui-preferences";

/*
 * Mechanical extraction of a CONTIGUOUS hook cluster from ForgeAppBody
 * (slash-request workflow + slash actions + composer mention/file pickers +
 * plan/goal composer toggles). Hook call order inside the cluster is
 * unchanged, and the cluster is invoked from the exact source position the
 * first extracted hook previously occupied, so React's linear hook sequence
 * is preserved.
 */
export interface ForgeAppSlashCommandsArgs {
  activeItems: NonNullable<CodexUiState["threadsRuntime"][string]>["items"];
  activeThread: Thread | null;
  activeTurnId: string | null;
  buildInfo: ReturnType<typeof resolveForgeBuildInfo>;
  client: CodexJsonRpcClient;
  collaborationModes: CollaborationModeMask[];
  collaborationModesForComposerMode: (mode: ComposerMode) => Promise<CollaborationModeMask[]>;
  composerMode: ComposerMode;
  createWorkbenchThread: () => Promise<void>;
  dispatch: ThreadWorkflowDispatch;
  effectiveThreadContextDefaults: CodexUiState["threadContextDefaults"];
  ensureConnected: () => Promise<boolean>;
  fileSearchControllerRef: MutableRefObject<WorkspaceFuzzyFileSearchController | null>;
  formatUiMessage: ReturnType<typeof useUiPreferences>["formatUiMessage"];
  input: string;
  loadSettingsPanel: (panel: SettingsPanelId) => Promise<void>;
  openCommandMenu: () => void;
  openCommandPanel: (panel: CommandPanelKind, options?: CommandPanelOptions) => void;
  openRenameThreadDialog: ReturnType<typeof useThreadActions>["openRenameThreadDialog"];
  openSideConversationPanel: ReturnType<typeof useBackgroundAgentPanel>["openSideConversationPanel"];
  rpcDebugEvents: RpcDebugEvent[];
  setAccountProjectionState: (next: AccountState) => void;
  setActiveComposerMode: (mode: ComposerMode) => void;
  setAppRegistry: Dispatch<SetStateAction<AppRegistryEntry[]>>;
  setComposerAttachments: Dispatch<SetStateAction<ComposerAttachment[]>>;
  setComposerGoalMode: Dispatch<SetStateAction<boolean>>;
  setComposerStatusPanelOpen: (open: boolean) => void;
  setInput: Dispatch<SetStateAction<string>>;
  state: CodexUiState;
  toggleReasoningPickerAnchor: ReturnType<typeof useAppOverlayState>["toggleReasoningPickerAnchor"];
  uiThemeSnapshot: ReturnType<typeof useUiPreferences>["uiThemeSnapshot"];
  workspace: string;
}

export function useForgeAppSlashCommands(args: ForgeAppSlashCommandsArgs) {
  const {
    activeItems,
    activeThread,
    activeTurnId,
    buildInfo,
    client,
    collaborationModes,
    collaborationModesForComposerMode,
    composerMode,
    createWorkbenchThread,
    dispatch,
    effectiveThreadContextDefaults,
    ensureConnected,
    fileSearchControllerRef,
    formatUiMessage,
    input,
    loadSettingsPanel,
    openCommandMenu,
    openCommandPanel,
    openRenameThreadDialog,
    openSideConversationPanel,
    rpcDebugEvents,
    setAccountProjectionState,
    setActiveComposerMode,
    setAppRegistry,
    setComposerAttachments,
    setComposerGoalMode,
    setComposerStatusPanelOpen,
    setInput,
    state,
    toggleReasoningPickerAnchor,
    uiThemeSnapshot,
    workspace,
  } = args;
  const runSlashRequest = useCallback((request: Parameters<typeof runSlashRequestWorkflow>[0], payload?: Record<string, unknown>) => (
    runSlashRequestWorkflow(request, payload, {
      client,
      formatMessage: formatUiMessage,
      dispatch,
      ensureConnected,
      openCommandPanel,
      openRenameThreadDialog,
      workspace,
      defaultCwd: state.hostStatus?.defaultCwd ?? undefined,
      activeThread,
      activeThreadId: state.activeThreadId,
      activeTurnId,
      activeItems,
      connected: state.connected,
      pid: state.hostStatus?.pid,
      modelCount: state.models.length,
      pendingRequestCount: state.pendingRequests.length,
      threadContextDefaults: effectiveThreadContextDefaults,
      openSideConversationPanel,
      accountState: state.account,
      setAccountState: setAccountProjectionState,
      uiTheme: uiThemeSnapshot,
      logs: state.logs,
      rpcDebugEvents,
      buildInfo,
      onShowStatusPanel: () => setComposerStatusPanelOpen(true),
    })
  // oxlint-disable-next-line react-hooks/exhaustive-deps -- 故意省略 activeItems：slash workflow 取触发时刻的 items 快照，本 memo 已由高频 state 键（logs/pendingRequests）保持新鲜
  ), [
    state.account,
    activeThread,
    activeTurnId,
    buildInfo,
    client,
    dispatch,
    formatUiMessage,
    ensureConnected,
    openCommandPanel,
    openRenameThreadDialog,
    openSideConversationPanel,
    setAccountProjectionState,
    state.activeThreadId,
    state.connected,
    state.hostStatus?.defaultCwd,
    state.hostStatus?.pid,
    state.models.length,
    state.pendingRequests.length,
    state.logs,
    setComposerStatusPanelOpen,
    rpcDebugEvents,
    effectiveThreadContextDefaults,
    uiThemeSnapshot,
    workspace,
  ]);

  const enableComposerPlanMode = useCallback(async (): Promise<boolean> => {
    const modes = await collaborationModesForComposerMode("plan");
    if (!hasCollaborationModePreset(modes, "plan")) {
      dispatch({
        type: "log",
        text: "Plan mode is unavailable until collaboration modes load from app-server",
        level: "warn",
      });
      return false;
    }
    setActiveComposerMode("plan");
    return true;
  }, [collaborationModesForComposerMode, dispatch, setActiveComposerMode]);

  const handleSlashAction = useCallback(async (action: SlashCommandAction) => {
    switch (action.action) {
      case "openSettings":
        setInput("");
        setComposerAttachments([]);
        await loadSettingsPanel(action.panel);
        return;
      case "createThread":
        setInput("");
        setComposerAttachments([]);
        await createWorkbenchThread();
        return;
      case "clearInput":
        setInput("");
        setComposerAttachments([]);
        return;
      case "insertText":
        setInput(action.text);
        setComposerAttachments([]);
        return;
      case "setComposerMode":
        if (action.mode === "plan") {
          if (action.text !== undefined) {
            setInput(action.text);
            setComposerAttachments([]);
          } else {
            setInput("");
          }
          void enableComposerPlanMode();
          return;
        }
        setActiveComposerMode(action.mode);
        if (action.text !== undefined) {
          setInput(action.text);
          setComposerAttachments([]);
        } else {
          setInput("");
        }
        return;
      case "setGoalMode":
        // codex /goal slash → enter goal-input mode (independent of plan); the
        // next submit sets the goal through the replace-confirm gate. Clear the
        // "/goal" slash text so the goal placeholder shows (pre-fill if an
        // objective arg was supplied).
        setComposerGoalMode(action.on);
        setInput(action.text ?? "");
        setComposerAttachments([]);
        return;
      case "request":
        setInput("");
        setComposerAttachments([]);
        await runSlashRequest(action.request, action.payload);
        return;
      case "showCommands":
        setInput("");
        setComposerAttachments([]);
        openCommandMenu();
        return;
      case "showReasoningPicker": {
        /*
         * CODEX-REF: composer-*.js — `/reasoning` slash command opens the
         * Reasoning effort dropdown anchored to the composer footer chip. Forge
         * 用 `[data-chip="reasoning"]` 选 footer chip 作为 anchor；如果 chip 不存在
         * （e.g. effort 字段未设置时该 chip 不渲染），把 anchor 设为 composer
         * footer 本身作为退路。
         */
        setInput("");
        setComposerAttachments([]);
        if (typeof document !== "undefined") {
          const chip = document.querySelector<HTMLElement>('[data-chip="reasoning"]')
            ?? document.querySelector<HTMLElement>(".hc-composer-settings-chips");
          if (chip) {
            toggleReasoningPickerAnchor(chip);
          }
        }
        return;
      }
      case "log":
        dispatch({ type: "log", text: action.message, level: action.level });
    }
  }, [createWorkbenchThread, dispatch, enableComposerPlanMode, loadSettingsPanel, openCommandMenu, runSlashRequest, setActiveComposerMode, setComposerAttachments, setComposerGoalMode, setInput, toggleReasoningPickerAnchor]);

  const executeSlashCommand = useCallback((command: SlashCommand) => {
    void handleSlashAction(applySlashCommand(command.id, { input, mode: composerMode }));
  }, [composerMode, handleSlashAction, input]);

  const runSlashCommandFromPanel = useCallback((commandId: string) => {
    void handleSlashAction(applySlashCommand(commandId, { input: "", mode: composerMode }));
  }, [composerMode, handleSlashAction]);

  const browseComposerFiles = useCallback(async (kind: "file" | "image"): Promise<ComposerAttachment[]> => {
    const paths = await pickFileReferences(kind, true);
    const attachments = composerAttachmentsFromPaths(paths);
    const visibleAttachments = kind === "image"
      ? attachments.filter((attachment) => attachment.type === "localImage")
      : attachments;
    return attachmentsWithDataImagePreviews(visibleAttachments);
  }, []);

  const searchComposerMentions = useCallback(async (
    query: string,
    marker: ComposerMentionMarker,
  ): Promise<ComposerMentionOption[]> => {
    const cwd = activeThread?.cwd?.trim() || workspace.trim() || state.hostStatus?.defaultCwd?.trim() || "";
    if (!(await ensureConnected())) return [];
    const trimmedQuery = query.trim();
    if (marker === "$") {
      const [skillResult, appResult] = await Promise.allSettled([
        client.request<unknown>("skills/list", {
          cwds: cwd ? [cwd] : [],
          forceReload: false,
        }),
        loadAllApps(client, { threadId: state.activeThreadId }),
      ]);
      if (skillResult.status === "rejected" && appResult.status === "rejected") throw skillResult.reason;
      if (appResult.status === "fulfilled") {
        setAppRegistry(appRegistryEntriesFromResponse(appResult.value));
      }
      return dedupeComposerMentionOptions([
        ...(skillResult.status === "fulfilled" ? mentionOptionsFromSkillsResponse(skillResult.value, query) : []),
        ...(appResult.status === "fulfilled" ? mentionOptionsFromAppsResponse(appResult.value, query) : []),
      ]).slice(0, 25);
    }
    const liveAgentOptions = mentionOptionsFromAgentThreads(state.threads, query, {
      excludedThreadIds: [state.activeThreadId],
    });
    const liveAgentRoles = state.threads.map((thread) => thread.agentRole);
    const [pluginResult, skillResult, fileResult, configResult] = await Promise.allSettled([
      client.request<unknown>("plugin/list", {
        cwds: cwd ? [cwd] : null,
      }),
      trimmedQuery
        ? client.request<unknown>("skills/list", {
            cwds: cwd ? [cwd] : [],
            forceReload: false,
          })
        : Promise.resolve(null),
      trimmedQuery && cwd
        ? fileSearchControllerRef.current?.searchOnce({
            roots: [cwd],
            query,
            timeoutMs: 120_000,
          }) ?? Promise.resolve({ files: [] })
        : Promise.resolve({ files: [] }),
      client.request<unknown>("config/read", {
        includeLayers: false,
        cwd: cwd || null,
      }, 120_000),
    ]);
    if (
      pluginResult.status === "rejected"
      && skillResult.status === "rejected"
      && fileResult.status === "rejected"
      && configResult.status === "rejected"
      && liveAgentOptions.length === 0
    ) throw pluginResult.reason;
    return dedupeComposerMentionOptions([
      ...liveAgentOptions,
      ...(configResult.status === "fulfilled"
        ? mentionOptionsFromConfiguredAgentsResponse(configResult.value, query, liveAgentRoles)
        : []),
      ...(pluginResult.status === "fulfilled" ? mentionOptionsFromPluginsResponse(pluginResult.value, query) : []),
      ...(skillResult.status === "fulfilled" ? mentionOptionsFromSkillsResponse(skillResult.value, query) : []),
      ...(fileResult.status === "fulfilled" ? mentionOptionsFromFuzzyFiles(fileResult.value.files ?? []) : []),
    ]).slice(0, 25);
  }, [activeThread?.cwd, client, ensureConnected, fileSearchControllerRef, setAppRegistry, state.activeThreadId, state.hostStatus?.defaultCwd, state.threads, workspace]);

  const selectComposerPlan = useCallback(() => {
    if (composerMode === "plan") {
      setActiveComposerMode("default");
      return;
    }
    void enableComposerPlanMode();
  }, [composerMode, enableComposerPlanMode, setActiveComposerMode]);
  // codex composer.goalDropdown "Pursue goal" — toggles goal mode; submitting in
  // goal mode sets the thread goal (handled in useTurnSubmission's sendTurn).
  const pursueComposerGoal = useCallback(() => {
    setComposerGoalMode((on) => !on);
  }, [setComposerGoalMode]);
  const hasPlanComposerMode = hasCollaborationModePreset(collaborationModes, "plan");
  return {
    browseComposerFiles,
    executeSlashCommand,
    hasPlanComposerMode,
    pursueComposerGoal,
    runSlashCommandFromPanel,
    runSlashRequest,
    searchComposerMentions,
    selectComposerPlan,
  };
}
