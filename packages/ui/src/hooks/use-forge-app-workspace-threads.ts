import type { Dispatch, SetStateAction } from "react";
import { useCallback, useEffect, useMemo, useRef } from "react";
import type { Thread } from "@forge/codex-protocol";
import { requestComposerElementFocus } from "../components/composer-keyboard";
import type { CodexJsonRpcClient } from "../lib/codex-json-rpc-client";
import { formatError } from "../lib/format";
import { pickWorkspaceFolder } from "../lib/tauri-host";
import { browserStorage } from "../state/app-shell-helpers";
import type { CodexUiState } from "../state/codex-reducer";
import type { ComposerAttachment } from "../state/composer-workflow";
import {
  normalizeWorkspaceRoot,
  projectSidebarWorkspaceRootOptions,
  workspaceRootOptionsWithCurrent,
} from "../state/sidebar-projection";
import {
  isThreadToolHistoryHydrated,
  type ThreadWorkflowDispatch,
} from "../state/thread-workflow";
import {
  createHostPendingWorktree,
  saveComposerWorkMode,
  selectableComposerWorkMode,
  type ComposerWorkMode,
  type PendingWorktree,
  type projectWorktreeModeOptions,
} from "../state/worktrees";
import { useBackgroundAgentPanel } from "./use-background-agent-panel";
import { useThreadActions } from "./use-thread-actions";
import type { useAppShellState } from "./use-app-shell-state";

interface ThreadsRuntimeRefState {
  runtime: CodexUiState["threadsRuntime"];
  autoHydratedActiveThreadIds: Set<string>;
}

/*
 * Mechanical extraction of a CONTIGUOUS hook cluster from ForgeAppBody
 * (thread actions + workbench thread create/select + workspace root
 * selection + composer work mode + background agent panel + automations
 * panel). Hook call order inside the cluster is unchanged, and the cluster is
 * invoked from the exact source position the first extracted hook previously
 * occupied, so React's linear hook sequence is preserved.
 */
export interface ForgeAppWorkspaceThreadsArgs {
  activeThread: Thread | null;
  client: CodexJsonRpcClient;
  closeFilePreviewPanel: () => void;
  composerWorkModeOptions: ReturnType<typeof projectWorktreeModeOptions>;
  dispatch: ThreadWorkflowDispatch;
  effectiveThreadContextDefaults: CodexUiState["threadContextDefaults"];
  ensureConnected: () => Promise<boolean>;
  openSideConversationPanelRef: { current: ((thread: Thread) => void) | null };
  openWorkbenchTab: ReturnType<typeof useAppShellState>["openWorkbenchTab"];
  selectedWorkspaceRoots: string[];
  setAutomationsError: Dispatch<SetStateAction<string | null>>;
  setAutomationsLoading: Dispatch<SetStateAction<boolean>>;
  setAutomationsPanelOpen: Dispatch<SetStateAction<boolean>>;
  setAutomationsPayload: Dispatch<SetStateAction<unknown>>;
  setComposerAttachments: Dispatch<SetStateAction<ComposerAttachment[]>>;
  setComposerWorkModeState: Dispatch<SetStateAction<ComposerWorkMode>>;
  setFocusedAutomationId: Dispatch<SetStateAction<string | null>>;
  setInput: Dispatch<SetStateAction<string>>;
  setPendingWorktree: Dispatch<SetStateAction<PendingWorktree | null>>;
  setSelectedWorkspaceRoots: Dispatch<SetStateAction<string[]>>;
  setWorkspace: Dispatch<SetStateAction<string>>;
  state: CodexUiState;
  workspace: string;
  worktreeStatusCwd: string;
}

export function useForgeAppWorkspaceThreads(args: ForgeAppWorkspaceThreadsArgs) {
  const {
    activeThread,
    client,
    closeFilePreviewPanel,
    composerWorkModeOptions,
    dispatch,
    effectiveThreadContextDefaults,
    ensureConnected,
    openSideConversationPanelRef,
    openWorkbenchTab,
    selectedWorkspaceRoots,
    setAutomationsError,
    setAutomationsLoading,
    setAutomationsPanelOpen,
    setAutomationsPayload,
    setComposerAttachments,
    setComposerWorkModeState,
    setFocusedAutomationId,
    setInput,
    setPendingWorktree,
    setSelectedWorkspaceRoots,
    setWorkspace,
    state,
    workspace,
    worktreeStatusCwd,
  } = args;
  /*
   * Thread-switch fast path: a thread whose transcript is already in the
   * runtime store renders instantly on re-select — re-reading the full turn
   * payload + re-parsing the rollout on every click made switching feel
   * stuck on slower machines. Subscribed threads stay fresh via
   * notifications; unloaded threads still take the full read path.
   */
  const threadsRuntimeRef = useRef<ThreadsRuntimeRefState>({
    runtime: state.threadsRuntime,
    autoHydratedActiveThreadIds: new Set<string>(),
  });
  const maybeLegacyThreadsRuntimeRef = threadsRuntimeRef.current as unknown as Partial<ThreadsRuntimeRefState>;
  if (!(maybeLegacyThreadsRuntimeRef.autoHydratedActiveThreadIds instanceof Set)) {
    threadsRuntimeRef.current = {
      runtime: threadsRuntimeRef.current as unknown as CodexUiState["threadsRuntime"],
      autoHydratedActiveThreadIds: new Set<string>(),
    };
  }
  threadsRuntimeRef.current.runtime = state.threadsRuntime;
  const hasLoadedThreadContent = useCallback((threadId: string) => {
    const runtime = threadsRuntimeRef.current.runtime[threadId];
    // Items alone don't prove the transcript is complete: resume snapshots
    // are plain text until persisted tool calls are replayed. Without the
    // hydration check, a snapshot that landed before the host was ready
    // would pin the fast path to a card-less transcript all session.
    return Boolean(runtime && runtime.items.length > 0) && isThreadToolHistoryHydrated(threadId);
  }, []);
  const {
    archiveSelectedThread,
    closeThreadActionDialog,
    confirmForkFromOlderTurn,
    createThread,
    dismissForkFromOlderTurn,
    editLastUserTurn,
    forkActiveThreadFromTurn,
    forkConfirmOpen,
    forkConfirmSubmitting,
    forkSelectedThread,
    forkSelectedThreadIntoWorktree,
    openRenameThreadDialog,
    renameSelectedThread,
    selectThread,
    threadActionDialog,
  } = useThreadActions({
    activeThread,
    ensureConnected,
    hasLoadedThreadContent,
    setComposerAttachments,
    setInput,
    threadContextDefaults: effectiveThreadContextDefaults,
    workspace,
  });
  useEffect(() => {
    const { autoHydratedActiveThreadIds } = threadsRuntimeRef.current;
    if (!state.connected) {
      autoHydratedActiveThreadIds.clear();
      return;
    }
    if (!activeThread) return;
    if (hasLoadedThreadContent(activeThread.id)) {
      autoHydratedActiveThreadIds.delete(activeThread.id);
      return;
    }
    if (autoHydratedActiveThreadIds.has(activeThread.id)) return;
    autoHydratedActiveThreadIds.add(activeThread.id);
    void selectThread(activeThread);
  }, [activeThread, hasLoadedThreadContent, selectThread, state.connected]);
  const createWorkbenchThread = useCallback(async () => {
    openWorkbenchTab();
    await createThread();
    requestComposerElementFocus();
  }, [createThread, openWorkbenchTab]);
  const selectWorkbenchThread = useCallback(async (thread: Thread) => {
    openWorkbenchTab();
    const selection = selectThread(thread);
    requestComposerElementFocus();
    await selection;
    requestComposerElementFocus();
  }, [openWorkbenchTab, selectThread]);
  const workspaceRootOptions = useMemo(() => (
    workspaceRootOptionsWithCurrent(
      projectSidebarWorkspaceRootOptions(state.threads),
      [activeThread?.cwd, workspace, ...selectedWorkspaceRoots],
    )
  ), [activeThread?.cwd, selectedWorkspaceRoots, state.threads, workspace]);

  const selectWorkspaceRoot = useCallback((root: string) => {
    const normalized = normalizeWorkspaceRoot(root);
    if (!normalized) return;
    setPendingWorktree((current) => (
      normalizeWorkspaceRoot(current?.path ?? "") === normalized ? current : null
    ));
    setSelectedWorkspaceRoots((current) => (
      current.includes(normalized) ? current : [normalized, ...current]
    ));
    setWorkspace(normalized);
    void createWorkbenchThread();
  }, [createWorkbenchThread, setPendingWorktree, setSelectedWorkspaceRoots, setWorkspace]);

  // codex `composer.localCwdDropdown.clearProject` ("Don't work in a project"):
  // drop the active project → projectless ("" sentinel) so the next chat lands in
  // "Chats" with a generated ~/Documents/Codex cwd. Mirrors selectWorkspaceRoot for
  // the no-project state (does NOT add to selectedWorkspaceRoots).
  const selectProjectlessWorkspace = useCallback(() => {
    setPendingWorktree(null);
    setWorkspace("");
    void createWorkbenchThread();
  }, [createWorkbenchThread, setPendingWorktree, setWorkspace]);

  const openExistingWorkspaceFolder = useCallback(async () => {
    try {
      const root = await pickWorkspaceFolder();
      if (root) selectWorkspaceRoot(root);
    } catch (error) {
      dispatch({ type: "log", text: `folder picker failed: ${formatError(error)}`, level: "warn" });
    }
  }, [dispatch, selectWorkspaceRoot]);

  const setComposerWorkMode = useCallback(async (mode: ComposerWorkMode) => {
    const selectableMode = selectableComposerWorkMode(mode, composerWorkModeOptions);
    if (selectableMode !== mode) {
      const option = composerWorkModeOptions.find((candidate) => candidate.id === mode);
      dispatch({
        type: "log",
        text: option?.disabledReason ?? `${mode} mode is disabled for the current workspace.`,
        level: "warn",
      });
      return;
    }
    if (mode !== "worktree") {
      setComposerWorkModeState(saveComposerWorkMode(browserStorage(), selectableMode));
      return;
    }
    try {
      const pending = await createHostPendingWorktree({ cwd: worktreeStatusCwd });
      const pendingPath = normalizeWorkspaceRoot(pending.path);
      if (!pendingPath) throw new Error("Host returned an empty pending worktree path.");
      setPendingWorktree(pending);
      setSelectedWorkspaceRoots((current) => (
        current.includes(pendingPath) ? current : [pendingPath, ...current]
      ));
      setWorkspace(pendingPath);
      setComposerWorkModeState(saveComposerWorkMode(browserStorage(), "worktree"));
      await createWorkbenchThread();
      dispatch({
        type: "log",
        text: `Pending worktree ready: ${pendingPath}`,
        level: "info",
      });
    } catch (error) {
      dispatch({ type: "log", text: `create worktree failed: ${formatError(error)}`, level: "error" });
    }
  }, [
    composerWorkModeOptions,
    createWorkbenchThread,
    dispatch,
    setComposerWorkModeState,
    setPendingWorktree,
    setSelectedWorkspaceRoots,
    setWorkspace,
    worktreeStatusCwd,
  ]);

  const {
    backgroundAgentConversation,
    backgroundAgentCanInterrupt,
    backgroundAgentInterrupting,
    backgroundAgentMessageDraft,
    backgroundAgentMessageError,
    backgroundAgentMessageSending,
    backgroundAgentPanel,
    backgroundAgentStatus,
    backgroundAgentSubtitle,
    backgroundAgentTitle,
    closeBackgroundAgentPanel,
    interruptBackgroundAgentPanelTurn,
    openBackgroundAgentThread,
    openSideConversationPanel,
    sendBackgroundAgentPanelMessage,
    sideChatRailEntries,
    setBackgroundAgentMessageDraft,
  } = useBackgroundAgentPanel({
    ensureConnected,
    hostDefaultCwd: state.hostStatus?.defaultCwd,
    activeThreadId: state.activeThreadId,
    threadContextDefaults: effectiveThreadContextDefaults,
    threads: state.threads,
    threadsRuntime: state.threadsRuntime,
    workspace,
  });
  // Late binding for the MCP side-chat callback defined above this hook's
  // consumer (ForgeApp.tsx ~2129) — write in an effect, not during render,
  // matching openFilesTabRef / openArtifactPreviewTabRef.
  useEffect(() => {
    openSideConversationPanelRef.current = openSideConversationPanel;
    return () => {
      openSideConversationPanelRef.current = null;
    };
  }, [openSideConversationPanel, openSideConversationPanelRef]);

  const refreshAutomationsPanel = useCallback(async () => {
    setAutomationsPanelOpen(true);
    setAutomationsLoading(true);
    setAutomationsError(null);
    try {
      if (!(await ensureConnected())) {
        setAutomationsPayload(null);
        setAutomationsError("Runtime is offline.");
        return;
      }
      let payload: unknown;
      try {
        payload = await client.request<unknown>("automation/list", { limit: 50 }, 120_000);
      } catch (firstError) {
        const firstMessage = formatError(firstError);
        // "unknown variant" is the app-server's serde rejection for a method it
        // doesn't expose — same "try the legacy spelling" intent as the others.
        if (!/method not found|not implemented|unsupported|unknown method|unknown variant/i.test(firstMessage)) {
          throw firstError;
        }
        try {
          payload = await client.request<unknown>("automation/schedule/list", { limit: 50 }, 120_000);
        } catch {
          throw new Error(firstMessage);
        }
      }
      setAutomationsPayload(payload);
      setAutomationsError(null);
    } catch (error) {
      setAutomationsPayload(null);
      setAutomationsError(formatError(error));
    } finally {
      setAutomationsLoading(false);
    }
  }, [client, ensureConnected, setAutomationsError, setAutomationsLoading, setAutomationsPanelOpen, setAutomationsPayload]);

  // codex: local-conversation-thread-*.js — opening the automations surface.
  // `automationId` is the deep-link focus target from the citation chip `ke`
  // handler; the generic "Automations" entry point passes nothing and the panel
  // opens unfocused (clears any stale focus). Mirrors Codex resolving a specific
  // id (`Km({automationId,…})` / `navigate-to-route ?automationId=…`).
  const openAutomationsPanel = useCallback((automationId?: string | null) => {
    setFocusedAutomationId(automationId?.trim() || null);
    closeFilePreviewPanel();
    closeBackgroundAgentPanel();
    void refreshAutomationsPanel();
  }, [closeBackgroundAgentPanel, closeFilePreviewPanel, refreshAutomationsPanel, setFocusedAutomationId]);

  // codex: citation chip onClick (`ke`) — deep-link to the *specific* automation
  // the chip references. We thread its id through so the panel scopes/scrolls to
  // that schedule instead of opening the full list.
  const openAutomationFromConversation = useCallback((automationId: string) => {
    openAutomationsPanel(automationId);
  }, [openAutomationsPanel]);
  return {
    archiveSelectedThread,
    backgroundAgentCanInterrupt,
    backgroundAgentConversation,
    backgroundAgentInterrupting,
    backgroundAgentMessageDraft,
    backgroundAgentMessageError,
    backgroundAgentMessageSending,
    backgroundAgentPanel,
    backgroundAgentStatus,
    backgroundAgentSubtitle,
    backgroundAgentTitle,
    closeBackgroundAgentPanel,
    closeThreadActionDialog,
    confirmForkFromOlderTurn,
    createWorkbenchThread,
    dismissForkFromOlderTurn,
    editLastUserTurn,
    forkActiveThreadFromTurn,
    forkConfirmOpen,
    forkConfirmSubmitting,
    forkSelectedThread,
    forkSelectedThreadIntoWorktree,
    interruptBackgroundAgentPanelTurn,
    openAutomationFromConversation,
    openAutomationsPanel,
    openBackgroundAgentThread,
    openExistingWorkspaceFolder,
    openRenameThreadDialog,
    openSideConversationPanel,
    refreshAutomationsPanel,
    renameSelectedThread,
    selectProjectlessWorkspace,
    selectWorkbenchThread,
    selectWorkspaceRoot,
    sendBackgroundAgentPanelMessage,
    setBackgroundAgentMessageDraft,
    setComposerWorkMode,
    sideChatRailEntries,
    threadActionDialog,
    workspaceRootOptions,
  };
}
