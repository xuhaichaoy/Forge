import type {
  CollaborationMode,
  JsonRpcNotification,
  JsonRpcRequest,
  ModelConfig,
  RequestId,
  Thread,
  ThreadGoal,
  ThreadActiveFlag,
  ThreadStatus,
  ThreadItem,
  UserInput,
} from "@hicodex/codex-protocol";
import type { TurnEnvironmentParams } from "@hicodex/codex-protocol/generated/v2/TurnEnvironmentParams";
import { stringField } from "../lib/format";
import type { HostStatus } from "../lib/tauri-host";
import { composerModeFromCollaborationMode } from "./collaboration-modes";
import type { ComposerMode } from "./composer-workflow";
import type { McpServerStartupStatus } from "./mcp-skills-management";
import type { AccumulatedThreadItem } from "./render-groups";
import {
  canNavigateBackInHistory,
  canNavigateForwardInHistory,
  pushThreadHistoryEntry,
} from "./thread-history";
import { isThreadStatusInProgress } from "./thread-item-fields";

export interface PendingServerRequest {
  id: RequestId;
  method: string;
  params?: unknown;
  createdAt: number;
}

export interface LogLine {
  id: string;
  level: "info" | "warn" | "error";
  text: string;
  at: number;
}

export interface ThreadContextDefaults {
  model?: string;
  modelProvider?: string;
  serviceTier?: unknown;
  approvalPolicy?: unknown;
  approvalsReviewer?: unknown;
  sandbox?: unknown;
  permissions?: string;
  environments?: TurnEnvironmentParams[];
  baseInstructions?: string;
  developerInstructions?: string;
  personality?: "none" | "friendly" | "pragmatic";
  reasoningEffort?: unknown;
  reasoningSummary?: unknown;
  memories?: ThreadMemoryPreferences;
}

export interface ThreadMemoryPreferences {
  useMemories: boolean;
  generateMemories: boolean;
}

export interface TurnPlanSnapshot {
  threadId: string;
  turnId: string | null;
  explanation: string | null;
  plan: unknown[];
  updatedAt: number;
}

// codex: local-conversation-thread-CecHj6JI.js#mu — RightRail status footer
// reads `usedTokens` / `contextWindow` from the `thread/tokenUsage/updated`
// notification (ThreadTokenUsage). `usedTokens` mirrors Desktop's "tokens
// used" counter (last-turn input + output) and `contextWindow` is
// `modelContextWindow` (null until the server has model metadata).
export interface ThreadTokenUsageSnapshot {
  usedTokens: number;
  contextWindow: number | null;
}

export interface ThreadTokenSpeedSnapshot {
  tokensPerSecond: number;
  turnId: string | null;
}

interface ThreadTokenSpeedSample {
  outputTokens: number;
  timeMs: number;
}

interface ThreadTokenSpeedTracker {
  completedDurationMs: number | null;
  estimatedOutputBytes: number;
  estimatedOutputTokens: number;
  lastLiveSpeedPublishedAtMs: number | null;
  latestTokenUsage: Record<string, unknown> | null;
  samples: ThreadTokenSpeedSample[];
  startedAtMs: number;
  turnId: string;
}

export interface ThreadRuntimeSlice {
  activeTurnId: string | null;
  items: AccumulatedThreadItem[];
  /**
   * Ordered list of turn ids. Mirrors the per-turn `turn.items` model used by
   * Codex Desktop; new items are placed inside their turn segment.
   */
  turnOrder: string[];
  /**
   * FIFO queue of optimistic local turn ids. The head is bound to the real
   * `turnId` reported by the next `turn/started` notification on that thread.
   */
  pendingOptimisticTurns: string[];
  latestCollaborationMode: CollaborationMode | null;
  turnPlan: TurnPlanSnapshot | null;
  turnDiff: string;
  composerMode: ComposerMode | null;
  threadGoal: ThreadGoal | null;
  threadGoalTurnId: string | null;
  hookRunsByTurn?: Record<string, unknown[]>;
  terminalTurnIds: string[];
  // codex: local-conversation-thread-CecHj6JI.js#mu — populated by the
  // `thread/tokenUsage/updated` notification; absent until the server emits
  // the first counter for this thread. Optional so older fixtures that do
  // not need the footer continue to type-check.
  tokenUsage?: ThreadTokenUsageSnapshot | null;
  tokenSpeed?: ThreadTokenSpeedSnapshot | null;
  tokenSpeedTracker?: ThreadTokenSpeedTracker | null;
}

export interface CodexUiState {
  connected: boolean;
  connecting: boolean;
  hostStatus: HostStatus | null;
  threads: Thread[];
  activeThreadId: string | null;
  threadsRuntime: Record<string, ThreadRuntimeSlice>;
  composerMode: ComposerMode;
  pendingRequests: PendingServerRequest[];
  logs: LogLine[];
  models: ModelConfig[];
  threadContextDefaults: ThreadContextDefaults | null;
  mcpServerStartupStatuses: Record<string, McpServerStartupStatus>;
  // codex: electron-menu-shortcuts-DQYPVyfu.js#navigateBack/Forward —
  // in-app thread history stack (browser-style back/forward over the
  // sequence of activated threads). See `./thread-history.ts`.
  threadHistoryStack: string[];
  threadHistoryIndex: number;
}

export type CodexUiAction =
  | { type: "connecting"; value: boolean }
  | { type: "connected"; value: boolean }
  | { type: "hostStatus"; status: HostStatus }
  | { type: "setThreads"; threads: Thread[] }
  | { type: "upsertThread"; thread: Thread; select?: boolean }
  | { type: "setActiveThread"; threadId: string | null }
  | { type: "removeThread"; threadId: string }
  | { type: "markThreadsNeedResumeAfterReconnect" }
  | { type: "setLatestCollaborationMode"; threadId: string; collaborationMode: CollaborationMode | null }
  | { type: "setActiveComposerMode"; mode: ComposerMode }
  | { type: "resetThreadComposerMode"; threadId: string }
  | { type: "notification"; message: JsonRpcNotification }
  | { type: "serverRequest"; request: JsonRpcRequest }
  | { type: "resolveServerRequest"; id: RequestId }
  | { type: "log"; text: string; level?: "info" | "warn" | "error" }
  | { type: "setModels"; models: ModelConfig[] }
  | { type: "upsertModel"; model: ModelConfig }
  | { type: "setThreadContextDefaults"; context: ThreadContextDefaults | null }
  | {
      type: "optimisticUserMessage";
      threadId: string;
      localTurnId: string;
      localId: string;
      content: UserInput[];
      cwd?: string | null;
    }
  | { type: "bindOptimisticTurn"; threadId: string; localTurnId: string; turnId: string }
  | { type: "dropOptimisticUserMessage"; threadId: string; localId: string }
  // codex: electron-menu-shortcuts-DQYPVyfu.js#navigateBack/Forward —
  // dispatched by the ported menu commands (CmdOrCtrl+[ / CmdOrCtrl+]).
  | { type: "navigateBackInHistory" }
  | { type: "navigateForwardInHistory" };

export const initialCodexUiState: CodexUiState = {
  connected: false,
  connecting: false,
  hostStatus: null,
  threads: [],
  activeThreadId: null,
  threadsRuntime: {},
  composerMode: "default",
  pendingRequests: [],
  logs: [],
  models: [],
  threadContextDefaults: null,
  mcpServerStartupStatuses: {},
  // codex: electron-menu-shortcuts-DQYPVyfu.js#navigateBack/Forward —
  // empty history; first `setActiveThread` populates the stack.
  threadHistoryStack: [],
  threadHistoryIndex: -1,
};

const EMPTY_THREAD_RUNTIME: ThreadRuntimeSlice = Object.freeze({
  activeTurnId: null,
  items: [],
  turnOrder: [],
  pendingOptimisticTurns: [],
  latestCollaborationMode: null,
  turnPlan: null,
  turnDiff: "",
  composerMode: null,
  threadGoal: null,
  threadGoalTurnId: null,
  hookRunsByTurn: {},
  terminalTurnIds: [],
  // codex: local-conversation-thread-CecHj6JI.js#mu — null until the first
  // `thread/tokenUsage/updated` notification lands; RightRail status footer
  // stays hidden while this is falsy (mirrors Desktop's `tokensUsed != null`
  // gate inside `mu`).
  tokenUsage: null,
  tokenSpeed: { tokensPerSecond: 0, turnId: null },
  tokenSpeedTracker: null,
});

export function selectThreadRuntime(
  state: CodexUiState,
  threadId: string | null | undefined,
): ThreadRuntimeSlice {
  if (!threadId) return EMPTY_THREAD_RUNTIME;
  return state.threadsRuntime[threadId] ?? EMPTY_THREAD_RUNTIME;
}

export function selectActiveThreadRuntime(state: CodexUiState): ThreadRuntimeSlice {
  return selectThreadRuntime(state, state.activeThreadId);
}

export function selectThreadItems(
  state: CodexUiState,
  threadId: string | null | undefined,
): AccumulatedThreadItem[] {
  return selectThreadRuntime(state, threadId).items;
}

export function selectActiveTurnId(
  state: CodexUiState,
  threadId: string | null | undefined,
): string | null {
  return selectThreadRuntime(state, threadId).activeTurnId;
}

export function selectLatestCollaborationMode(
  state: CodexUiState,
  threadId: string | null | undefined,
): CollaborationMode | null {
  return selectThreadRuntime(state, threadId).latestCollaborationMode;
}

export function selectThreadComposerMode(
  state: CodexUiState,
  threadId: string | null | undefined,
): ComposerMode {
  if (!threadId) return "default";
  const runtime = selectThreadRuntime(state, threadId);
  return runtime.composerMode ?? composerModeFromCollaborationMode(runtime.latestCollaborationMode);
}

export function selectItemsByThread(state: CodexUiState): Record<string, AccumulatedThreadItem[]> {
  return Object.fromEntries(
    Object.entries(state.threadsRuntime).map(([threadId, runtime]) => [threadId, runtime.items]),
  );
}

export function codexUiReducer(state: CodexUiState, action: CodexUiAction): CodexUiState {
  switch (action.type) {
    case "connecting":
      return { ...state, connecting: action.value };
    case "connected":
      return { ...state, connected: action.value, connecting: false };
    case "hostStatus":
      return { ...state, hostStatus: action.status, connected: action.status.running };
    case "setThreads":
      return withActiveComposerMode({
        ...state,
        threads: action.threads,
        threadsRuntime: enrichMultiAgentReceiverThreadsInRuntimes(state.threadsRuntime, action.threads),
        activeThreadId: nextActiveThreadId(state.activeThreadId, action.threads),
      });
    case "upsertThread":
      return upsertThreadState(state, action.thread, action.select === true);
    case "setActiveThread": {
      // codex: electron-menu-shortcuts-DQYPVyfu.js#navigateBack/Forward —
      // every explicit thread switch participates in the navigation
      // history (browser-style back stack). Forward branch is truncated
      // and consecutive duplicates of the same id are coalesced — see
      // `./thread-history.ts`.
      const historyPatch = pushThreadHistoryEntry(
        state.threadHistoryStack,
        state.threadHistoryIndex,
        action.threadId,
      );
      return withActiveComposerMode({
        ...state,
        activeThreadId: action.threadId,
        threadHistoryStack: historyPatch.threadHistoryStack,
        threadHistoryIndex: historyPatch.threadHistoryIndex,
      });
    }
    case "navigateBackInHistory": {
      // codex: electron-menu-shortcuts-DQYPVyfu.js#navigateBack — separate
      // from `setActiveThread` because the history cursor moves without
      // pushing a new entry; otherwise pressing Back would immediately
      // bury the entry we just navigated to.
      if (!canNavigateBackInHistory(state.threadHistoryStack, state.threadHistoryIndex)) {
        return state;
      }
      const newIndex = state.threadHistoryIndex - 1;
      const targetId = state.threadHistoryStack[newIndex];
      if (!targetId) return state;
      return withActiveComposerMode({
        ...state,
        activeThreadId: targetId,
        threadHistoryIndex: newIndex,
      });
    }
    case "navigateForwardInHistory": {
      // codex: electron-menu-shortcuts-DQYPVyfu.js#navigateForward — mirror
      // of the back case; no-op at the head of the stack.
      if (!canNavigateForwardInHistory(state.threadHistoryStack, state.threadHistoryIndex)) {
        return state;
      }
      const newIndex = state.threadHistoryIndex + 1;
      const targetId = state.threadHistoryStack[newIndex];
      if (!targetId) return state;
      return withActiveComposerMode({
        ...state,
        activeThreadId: targetId,
        threadHistoryIndex: newIndex,
      });
    }
    case "removeThread": {
      const nextThreads = state.threads.filter((thread) => thread.id !== action.threadId);
      const { [action.threadId]: _removed, ...threadsRuntime } = state.threadsRuntime;
      return withActiveComposerMode({
        ...state,
        threads: nextThreads,
        threadsRuntime,
        activeThreadId: state.activeThreadId === action.threadId ? nextThreads[0]?.id ?? null : state.activeThreadId,
      });
    }
    case "markThreadsNeedResumeAfterReconnect":
      return markThreadsNeedResumeAfterReconnectState(state);
    case "setLatestCollaborationMode":
      return setLatestCollaborationModeState(state, action.threadId, action.collaborationMode);
    case "setActiveComposerMode":
      return setActiveComposerModeState(state, action.mode);
    case "resetThreadComposerMode":
      return resetThreadComposerModeState(state, action.threadId);
    case "notification":
      return applyNotification(state, action.message);
    case "serverRequest":
      return {
        ...state,
        pendingRequests: [
          ...state.pendingRequests.filter((request) => request.id !== action.request.id),
          {
            id: action.request.id,
            method: action.request.method,
            params: action.request.params,
            createdAt: Date.now(),
          },
        ],
      };
    case "resolveServerRequest":
      return {
        ...state,
        pendingRequests: state.pendingRequests.filter((request) => request.id !== action.id),
      };
    case "log":
      return prependLog(state, action.text, action.level);
    case "setModels":
      return { ...state, models: action.models };
    case "upsertModel":
      return {
        ...state,
        models: [
          action.model,
          ...state.models.filter((model) => model.id !== action.model.id),
        ],
      };
    case "setThreadContextDefaults":
      return { ...state, threadContextDefaults: action.context };
    case "optimisticUserMessage":
      return applyOptimisticUserMessage(state, action);
    case "bindOptimisticTurn":
      return applyBindOptimisticTurn(state, action);
    case "dropOptimisticUserMessage":
      return applyDropOptimisticUserMessage(state, action);
    default:
      return state;
  }
}

function normalizeThreadRuntime(runtime: Partial<ThreadRuntimeSlice> | undefined): ThreadRuntimeSlice {
  const threadGoal = runtime?.threadGoal ?? null;
  const threadGoalTurnId = runtime?.threadGoalTurnId ?? null;
  const hookRunsByTurn = runtime?.hookRunsByTurn ?? {};
  const rawItems = runtime?.items ?? [];
  const goalProjectedItems = threadGoal
    ? projectCompletedThreadGoalOntoAssistantMessages(
        projectThreadGoalOntoUserMessages(rawItems, threadGoal, threadGoalTurnId),
        threadGoal,
        threadGoalTurnId,
      )
    : rawItems;
  const items = projectHookStatsOntoAssistantMessages(goalProjectedItems, hookRunsByTurn);
  const terminalTurnIds = dedupeStrings(runtime?.terminalTurnIds ?? []);
  return {
    activeTurnId: runtime?.activeTurnId ?? null,
    items,
    turnOrder: runtime?.turnOrder ?? [],
    pendingOptimisticTurns: runtime?.pendingOptimisticTurns ?? [],
    latestCollaborationMode: runtime?.latestCollaborationMode ?? null,
    turnPlan: runtime?.turnPlan ?? null,
    turnDiff: runtime?.turnDiff ?? "",
    composerMode: runtime?.composerMode ?? null,
    threadGoal,
    threadGoalTurnId,
    hookRunsByTurn,
    terminalTurnIds,
    // codex: local-conversation-thread-CecHj6JI.js#mu — preserve the latest
    // token-usage snapshot across patch cycles; the reducer rewrites it only
    // when `thread/tokenUsage/updated` arrives.
    tokenUsage: runtime?.tokenUsage ?? null,
    tokenSpeed: runtime?.tokenSpeed ?? { tokensPerSecond: 0, turnId: null },
    tokenSpeedTracker: runtime?.tokenSpeedTracker ?? null,
  };
}

function dedupeStrings(values: string[]): string[] {
  const next: string[] = [];
  for (const value of values) {
    if (value && !next.includes(value)) next.push(value);
  }
  return next;
}

function updateThreadRuntime(
  state: CodexUiState,
  threadId: string,
  updater: (runtime: ThreadRuntimeSlice) => ThreadRuntimeSlice,
): CodexUiState {
  return {
    ...state,
    threadsRuntime: {
      ...state.threadsRuntime,
      [threadId]: updater(selectThreadRuntime(state, threadId)),
    },
  };
}

function threadRuntimePatch(
  state: CodexUiState,
  threadId: string,
  patch: Partial<ThreadRuntimeSlice>,
): CodexUiState {
  return updateThreadRuntime(state, threadId, (runtime) => normalizeThreadRuntime({ ...runtime, ...patch }));
}

function withActiveComposerMode(state: CodexUiState): CodexUiState {
  return {
    ...state,
    composerMode: selectThreadComposerMode(state, state.activeThreadId),
  };
}

function applyOptimisticUserMessage(
  state: CodexUiState,
  action: Extract<CodexUiAction, { type: "optimisticUserMessage" }>,
): CodexUiState {
  const { threadId, localTurnId, localId, content } = action;
  if (!threadId || !localTurnId || !localId) return state;

  // Idempotency guard: don't add a second optimistic bubble for the same text
  // when one is already pending in this thread. Protects against quick
  // double-submits, retries, or redundant workflow paths re-dispatching.
  const runtime = selectThreadRuntime(state, threadId);
  const existingItems = runtime.items;
  const incomingContentKey = userInputContentKey(content);
  if (incomingContentKey) {
    for (const existing of existingItems) {
      if (existing.type !== "userMessage") continue;
      if (!localIdOf(existing)) continue;
      const existingContentKey = userInputContentKey((existing as Record<string, unknown>).content);
      if (existingContentKey === incomingContentKey) return state;
    }
  }

  const order = ensureTurnInOrder(runtime.turnOrder, localTurnId);
  const needsBinding = isOptimisticTurnPlaceholder(localTurnId);
  const pending = runtime.pendingOptimisticTurns;
  const nextPending = needsBinding && !pending.includes(localTurnId)
    ? [...pending, localTurnId]
    : pending;
  const item: AccumulatedThreadItem = {
    id: localId,
    type: "userMessage",
    content,
    createdAt: Date.now(),
    completed: false,
    _turnId: localTurnId,
    _localId: localId,
  };
  return threadRuntimePatch(state, threadId, {
    turnOrder: order,
    pendingOptimisticTurns: nextPending,
    items: placeItemInTurn(runtime.items, item, order),
  });
}

export const OPTIMISTIC_TURN_PLACEHOLDER_PREFIX = "optimistic-turn:";

function isOptimisticTurnPlaceholder(turnId: string): boolean {
  return turnId.startsWith(OPTIMISTIC_TURN_PLACEHOLDER_PREFIX);
}

function applyBindOptimisticTurn(
  state: CodexUiState,
  action: Extract<CodexUiAction, { type: "bindOptimisticTurn" }>,
): CodexUiState {
  return bindOptimisticTurn(state, action.threadId, action.localTurnId, action.turnId);
}

function bindNextOptimisticTurn(state: CodexUiState, threadId: string, turnId: string): CodexUiState {
  const queue = selectThreadRuntime(state, threadId).pendingOptimisticTurns;
  if (!queue || queue.length === 0) return state;
  const head = queue[0];
  if (!head || head === turnId) {
    return threadRuntimePatch(state, threadId, { pendingOptimisticTurns: queue.slice(1) });
  }
  return bindOptimisticTurn(state, threadId, head, turnId);
}

function bindOptimisticTurn(
  state: CodexUiState,
  threadId: string,
  localTurnId: string,
  turnId: string,
): CodexUiState {
  if (!threadId || !localTurnId || !turnId || localTurnId === turnId) return state;
  const runtime = selectThreadRuntime(state, threadId);
  const order = runtime.turnOrder;
  if (!order || !order.includes(localTurnId)) {
    const pendingQueue = runtime.pendingOptimisticTurns.filter((id) => id !== localTurnId);
    return threadRuntimePatch(state, threadId, { pendingOptimisticTurns: pendingQueue });
  }
  const rebound = order.map((id) => (id === localTurnId ? turnId : id));
  const dedup: string[] = [];
  for (const id of rebound) if (!dedup.includes(id)) dedup.push(id);
  const items = runtime.items;
  // If the target turn already has a confirmed userMessage, drop the local
  // placeholder instead of rebinding. The server may normalize structured
  // input differently, so same-turn confirmation is stronger than text equality.
  const confirmedUserMessagesInTurn = items.filter((item) =>
    isConfirmedUserMessage(item) && turnIdOf(item) === turnId
  );
  const preservedConfirmedById = new Map<string, AccumulatedThreadItem>();
  const unmatchedConfirmed = [...confirmedUserMessagesInTurn];
  const next: AccumulatedThreadItem[] = [];
  for (const item of items) {
    if (turnIdOf(item) !== localTurnId) {
      next.push(item);
      continue;
    }
    if (item.type === "userMessage" && localIdOf(item)) {
      const contentMatchIndex = unmatchedConfirmed.findIndex((confirmed) => userMessagesHaveSameContent(item, confirmed));
      if (contentMatchIndex >= 0) {
        const confirmed = unmatchedConfirmed.splice(contentMatchIndex, 1)[0];
        rememberConfirmedWithLocalInputs(preservedConfirmedById, confirmed, item);
        continue;
      }
      if (unmatchedConfirmed.length > 0) {
        const confirmed = unmatchedConfirmed.shift();
        rememberConfirmedWithLocalInputs(preservedConfirmedById, confirmed, item);
        continue;
      }
      if (confirmedUserMessagesInTurn.length > 0) {
        rememberConfirmedWithLocalInputs(preservedConfirmedById, confirmedUserMessagesInTurn[0], item);
        continue;
      }
    }
    next.push({ ...item, _turnId: turnId });
  }
  const pending = runtime.pendingOptimisticTurns.filter((id) => id !== localTurnId);
  return threadRuntimePatch(state, threadId, {
    turnOrder: dedup,
    pendingOptimisticTurns: pending,
    items: applyPreservedConfirmedUserMessages(next, preservedConfirmedById),
  });
}

function applyDropOptimisticUserMessage(
  state: CodexUiState,
  action: Extract<CodexUiAction, { type: "dropOptimisticUserMessage" }>,
): CodexUiState {
  const { threadId, localId } = action;
  if (!threadId || !localId) return state;
  const runtime = selectThreadRuntime(state, threadId);
  const items = runtime.items;
  const target = items.find((item) => localIdOf(item) === localId);
  if (!target) return state;
  const filtered = items.filter((item) => item !== target);
  const turnId = turnIdOf(target);
  const order = runtime.turnOrder;
  const stillUsesTurn = turnId
    ? filtered.some((item) => turnIdOf(item) === turnId)
    : false;
  const nextOrder = turnId && !stillUsesTurn ? order.filter((id) => id !== turnId) : order;
  const pending = turnId && !stillUsesTurn
    ? runtime.pendingOptimisticTurns.filter((id) => id !== turnId)
    : runtime.pendingOptimisticTurns;
  return threadRuntimePatch(state, threadId, {
    turnOrder: nextOrder,
    pendingOptimisticTurns: pending,
    items: filtered,
  });
}

function prependLog(
  state: CodexUiState,
  text: string,
  level: "info" | "warn" | "error" = "info",
): CodexUiState {
  return {
    ...state,
    logs: [
      {
        id: `${Date.now().toString(36)}-${state.logs.length}`,
        at: Date.now(),
        level,
        text,
      },
      ...state.logs,
    ].slice(0, 120),
  };
}

function setLatestCollaborationModeState(
  state: CodexUiState,
  threadId: string,
  collaborationMode: CollaborationMode | null,
): CodexUiState {
  if (!threadId.trim()) return state;
  const currentRuntime = selectThreadRuntime(state, threadId);
  if (!collaborationMode) {
    const next = threadRuntimePatch(state, threadId, { latestCollaborationMode: null });
    return state.activeThreadId === threadId && currentRuntime.composerMode === null
      ? withActiveComposerMode(next)
      : next;
  }
  const next = threadRuntimePatch(state, threadId, { latestCollaborationMode: collaborationMode });
  return state.activeThreadId === threadId && currentRuntime.composerMode === null
    ? withActiveComposerMode(next)
    : next;
}

function setActiveComposerModeState(state: CodexUiState, mode: ComposerMode): CodexUiState {
  if (!state.activeThreadId) return { ...state, composerMode: mode };
  return {
    ...threadRuntimePatch(state, state.activeThreadId, { composerMode: mode }),
    composerMode: mode,
  };
}

function resetThreadComposerModeState(state: CodexUiState, threadId: string): CodexUiState {
  if (!threadId.trim()) return state;
  const next = threadRuntimePatch(state, threadId, { composerMode: "default" });
  return state.activeThreadId === threadId ? { ...next, composerMode: "default" } : next;
}

function markThreadsNeedResumeAfterReconnectState(state: CodexUiState): CodexUiState {
  if (state.threads.length === 0) return state;
  const threadsRuntime = { ...state.threadsRuntime };
  for (const thread of state.threads) {
    const runtime = selectThreadRuntime(state, thread.id);
    threadsRuntime[thread.id] = normalizeThreadRuntime({
      ...runtime,
      activeTurnId: null,
      pendingOptimisticTurns: [],
    });
  }
  return {
    ...state,
    threads: state.threads.map((thread) => ({
      ...thread,
      status: { type: "notLoaded" },
    })),
    threadsRuntime,
  };
}

function applyNotification(state: CodexUiState, message: JsonRpcNotification): CodexUiState {
  const params = (message.params ?? {}) as Record<string, unknown>;
  switch (message.method) {
    case "error":
      return applyErrorNotification(state, params);
    case "thread/started": {
      const thread = params.thread as Thread | undefined;
      if (!thread?.id) return state;
      const snapshotItems = collectThreadItems(thread);
      const runtime = selectThreadRuntime(state, thread.id);
      const currentItems = runtime.items;
      const terminalTurnIds = terminalTurnIdsForRuntime(runtime);
      const activeTurnIds = activeTurnIdsFromThread(thread);
      const staleActiveSnapshot = activeTurnIds.some((turnId) => terminalTurnIds.has(turnId));
      const activeTurns = activeTurnsFromThread(thread, terminalTurnIds);
      const nextActiveTurnId = activeTurns[thread.id] ?? (staleActiveSnapshot ? null : runtime.activeTurnId);
      const hasLiveTurn = Boolean(nextActiveTurnId);
      const shouldMergeSnapshot = hasLiveTurn || snapshotTouchesTurnIds(snapshotItems, terminalTurnIds);
      const nextTurnOrder = turnOrderFromThread(thread, runtime.turnOrder);
      const nextItems = snapshotItems.length > 0
        ? shouldMergeSnapshot
          ? mergeLiveThreadSnapshotItems(
              currentItems,
              snapshotItems,
              staleActiveSnapshot ? terminalTurnIds : undefined,
            )
          : snapshotItems
        : runtime.items;
      const optimisticTurnState = snapshotItems.length > 0
        ? pruneUnusedOptimisticTurnState(
            nextTurnOrder,
            runtime.pendingOptimisticTurns,
            nextItems ?? [],
          )
        : {
            turnOrder: nextTurnOrder,
            pending: runtime.pendingOptimisticTurns,
          };
      const nextThreads = upsertThread(state.threads, threadWithNonRegressingStatus(
        thread,
        state.threads.find((item) => item.id === thread.id),
        staleActiveSnapshot,
        Boolean(activeTurns[thread.id]),
      ));
      const nextThreadsRuntime = enrichMultiAgentReceiverThreadsInRuntimes({
        ...state.threadsRuntime,
        [thread.id]: normalizeThreadRuntime({
          ...runtime,
          activeTurnId: nextActiveTurnId ?? null,
          turnOrder: optimisticTurnState.turnOrder,
          pendingOptimisticTurns: optimisticTurnState.pending,
          items: snapshotItems.length > 0 ? nextItems ?? [] : runtime.items,
        }),
      }, nextThreads);
      return withActiveComposerMode({
        ...state,
        threads: nextThreads,
        activeThreadId: state.activeThreadId ?? thread.id,
        threadsRuntime: nextThreadsRuntime,
      });
    }
    case "thread/status/changed": {
      const threadId = String(params.threadId ?? "");
      if (!threadId) return state;
      return {
        ...state,
        threads: state.threads.map((thread) =>
          thread.id === threadId ? { ...thread, status: normalizeThreadStatus(params.status, thread.status) } : thread,
        ),
      };
    }
    case "thread/name/updated": {
      const threadId = String(params.threadId ?? "");
      if (!threadId) return state;
      const nextName = typeof params.threadName === "string" ? params.threadName : null;
      return {
        ...state,
        threads: state.threads.map((thread) =>
          thread.id === threadId ? { ...thread, name: nextName } : thread,
        ),
      };
    }
    case "thread/settings/updated":
      return applyThreadSettingsUpdatedNotification(state, params);
    case "thread/archived":
    case "thread/closed": {
      const threadId = String(params.threadId ?? "");
      if (!threadId) return state;
      const nextThreads = state.threads.filter((thread) => thread.id !== threadId);
      const { [threadId]: _removed, ...threadsRuntime } = state.threadsRuntime;
      return withActiveComposerMode({
        ...state,
        threads: nextThreads,
        threadsRuntime,
        activeThreadId: state.activeThreadId === threadId ? nextThreads[0]?.id ?? null : state.activeThreadId,
      });
    }
    case "thread/unarchived": {
      const threadId = String(params.threadId ?? "");
      if (!threadId) return state;
      return prependLog(state, `thread unarchived: ${shortThreadId(threadId)}`);
    }
    case "thread/tokenUsage/updated":
      // codex: local-conversation-thread-CecHj6JI.js#mu — projects the
      // `ThreadTokenUsage` payload (last-turn breakdown + `modelContextWindow`)
      // into `ThreadRuntimeSlice.tokenUsage` so `RightRail`'s status footer
      // can render the "X / Y tokens used" line and context-window tooltip.
      return applyThreadTokenUsageUpdatedNotification(state, params);
    case "thread/compacted":
      return applyThreadCompactedNotification(state, params);
    case "thread/goal/updated":
      return applyThreadGoalUpdatedNotification(state, params);
    case "thread/goal/cleared":
      return applyThreadGoalClearedNotification(state, params);
    case "turn/started": {
      const turn = params.turn as TurnLike | undefined;
      const threadId = String(params.threadId ?? turn?.threadId ?? state.activeThreadId ?? "");
      if (!threadId) return state;
      const baseState: CodexUiState = turn?.id
        ? bindNextOptimisticTurn(state, threadId, turn.id)
        : state;
      const runtime = selectThreadRuntime(baseState, threadId);
      const order = ensureTurnInOrder(runtime.turnOrder, turn?.id ?? null);
      const tokenSpeedPatch = turn?.id ? startedTokenSpeedPatch(turn.id) : {};
      return withActiveComposerMode({
        ...baseState,
        activeThreadId: baseState.activeThreadId ?? threadId,
        threadsRuntime: {
          ...baseState.threadsRuntime,
          [threadId]: normalizeThreadRuntime({
            ...runtime,
            ...tokenSpeedPatch,
            activeTurnId: turn?.id ?? runtime.activeTurnId,
            turnOrder: order,
            terminalTurnIds: turn?.id
              ? runtime.terminalTurnIds.filter((id) => id !== turn.id)
              : runtime.terminalTurnIds,
            items: mergeItems(runtime.items, turnItemsWithWorkedFor(turn), order),
          }),
        },
      });
    }
    case "item/started":
    case "item/completed":
    case "item/autoApprovalReview/started":
    case "item/autoApprovalReview/completed":
    case "item/commandExecution/requestApproval":
    case "item/fileChange/requestApproval":
    case "item/permissions/requestApproval":
    case "item/tool/call":
    case "item/tool/requestUserInput": {
      const threadId = String(params.threadId ?? "");
      const turnIdParam = typeof params.turnId === "string" && params.turnId.length > 0 ? params.turnId : null;
      const item = params.item as ThreadItem | undefined;
      if (!threadId || !item?.id) return state;
      // Codex Desktop's app-server-manager-signals carries a per-event
      // completion bias on these item-level cases; treat any "/completed"
      // suffix as terminal and everything else as in-progress so the merger
      // can fold deltas into the same row.
      const isCompletedEvent = message.method.endsWith("/completed");
      const itemWithStatus = isCompletedEvent
        ? { ...item, completed: true }
        : { ...item, completed: false };
      const stampedItem = itemWithLifecycleTiming(itemWithStatus as ThreadItem, params);
      const reconciled = item.type === "userMessage"
        ? reconcileUserMessage(state, threadId, turnIdParam, stampedItem)
        : state;
      return upsertItem(reconciled, threadId, stampedItem, turnIdParam);
    }
    /*
     * Codex Desktop's `remote-conversation-page` dispatcher consumes exactly
     * 5 item-level delta channels (docs §26.4). HiCodex used to subscribe to
     * 4 extra protocol-defined channels — none of which had a downstream
     * consumer in the renderer:
     *
     *   - `item/reasoning/summaryPartAdded` — `appendReasoningText` already
     *     auto-expands the summary array via `updateReasoningParts`, making
     *     a separate "pre-allocate slot" channel redundant. Matches Codex's
     *     `Tn(arr, idx, default)` helper which expands on first delta arrival.
     *   - `item/commandExecution/terminalInteraction` — writes
     *     `terminalInteractions[]` on the item, but nothing in HiCodex
     *     reads that field (verified 2026-05-21 grep).
     *   - `item/fileChange/outputDelta` — flagged deprecated in the v2
     *     protocol; modern app-server does not send it.
     *   - `item/mcpToolCall/progress` — Desktop currently logs and ignores
     *     this progress message instead of projecting a renderer field.
     *
     * The 5 channels HiCodex now consumes match Codex exactly. The single
     * intentional divergence is `item/fileChange/patchUpdated` below, kept
     * because HiCodex renders `changes[]` incrementally via
     * `tool-activity-detail.tsx:334` (Codex waits for `item/completed`).
     */
    case "item/agentMessage/delta":
      return updateLiveTokenSpeed(appendItemText(state, params, "agentMessage", "text", "delta"), params);
    case "item/plan/delta":
      return updateLiveTokenSpeed(appendItemText(state, params, "plan", "text", "delta"), params);
    case "item/reasoning/textDelta":
      return updateLiveTokenSpeed(appendReasoningText(state, params, "content", "contentIndex"), params);
    case "item/reasoning/summaryTextDelta":
      return updateLiveTokenSpeed(appendReasoningText(state, params, "summary", "summaryIndex"), params);
    case "item/commandExecution/outputDelta":
      return appendItemText(state, params, "commandExecution", "aggregatedOutput", "delta");
    case "item/fileChange/patchUpdated":
      // HiCodex extension (not in Codex Desktop's 5-channel set).
      return mergeItemFields(state, params, "fileChange", { changes: params.changes });
    case "turn/plan/updated":
      return upsertTurnPlan(state, params);
    case "turn/diff/updated": {
      const threadId = String(params.threadId ?? "");
      const diff = typeof params.diff === "string" ? params.diff : "";
      if (!threadId) return state;
      return threadRuntimePatch(state, threadId, { turnDiff: diff });
    }
    case "turn/completed":
      return finishTurn(state, params, "completed");
    case "turn/failed":
      return finishTurn(state, params, "failed");
    case "turn/interrupted":
    case "turn/cancelled":
      return finishTurn(state, params, "interrupted");
    case "serverRequest/resolved":
      return {
        ...state,
        pendingRequests: state.pendingRequests.filter((request) => request.id !== params.requestId),
      };
    case "mcpServer/startupStatus/updated":
      return applyMcpServerStartupStatusNotification(state, params, message);
    default:
      return logNotificationIfUseful(state, message);
  }
}

function applyMcpServerStartupStatusNotification(
  state: CodexUiState,
  params: Record<string, unknown>,
  message: JsonRpcNotification,
): CodexUiState {
  const name = stringParam(params, "name");
  if (!name) return logNotificationIfUseful(state, message);
  const startup: McpServerStartupStatus = {
    status: formatUnknownForLog(params.status) || "unknown",
    error: stringParam(params, "error") || null,
    updatedAt: Date.now(),
  };
  return logNotificationIfUseful({
    ...state,
    mcpServerStartupStatuses: {
      ...state.mcpServerStartupStatuses,
      [name]: startup,
    },
  }, message);
}

function applyErrorNotification(state: CodexUiState, params: Record<string, unknown>): CodexUiState {
  const error = recordParam(params.error);
  const text = turnErrorMessage(error) || formatUnknownForLog(params);
  const retryText = params.willRetry === true ? " (will retry)" : "";
  const logged = text ? prependLog(state, `${text}${retryText}`, "error") : state;
  if (params.willRetry === true) return logged;

  const threadId = String(params.threadId ?? "");
  if (!threadId || !text) return logged;
  const turnId = String(params.turnId ?? "");
  const runtime = selectThreadRuntime(logged, threadId);
  const order = ensureTurnInOrder(runtime.turnOrder, turnId || null);
  return {
    ...logged,
    threads: logged.threads.map((thread) =>
      thread.id === threadId ? { ...thread, status: { type: "systemError" } } : thread,
    ),
    threadsRuntime: {
      ...logged.threadsRuntime,
      [threadId]: normalizeThreadRuntime({
        ...runtime,
        turnOrder: order,
        items: mergeItems(runtime.items, [streamErrorItem(turnId, error, text)], order),
      }),
    },
  };
}

// codex: git-branch-picker-dropdown-content/me + local-conversation-thread
// status footer — context usage is calculated from `last.totalTokens` and
// `modelContextWindow`. The cumulative `total` object is not the number Desktop
// shows in the right-rail status row.
function applyThreadTokenUsageUpdatedNotification(
  state: CodexUiState,
  params: Record<string, unknown>,
): CodexUiState {
  const threadId = stringParam(params, "threadId");
  if (!threadId) return state;
  const tokenUsage = recordParam(params.tokenUsage);
  if (!tokenUsage) return state;
  const usedTokens = pickTokenTotal(tokenUsage);
  if (usedTokens === null) return state;
  const contextWindowRaw = tokenUsage.modelContextWindow;
  const contextWindow = typeof contextWindowRaw === "number" && Number.isFinite(contextWindowRaw)
    ? contextWindowRaw
    : null;
  const turnId = turnIdParam(params);
  const runtime = selectThreadRuntime(state, threadId);
  const tokenSpeedTracker = runtime.tokenSpeedTracker?.turnId === turnId
    ? { ...runtime.tokenSpeedTracker, latestTokenUsage: tokenUsage }
    : runtime.tokenSpeedTracker ?? null;
  return threadRuntimePatch(state, threadId, {
    tokenUsage: { usedTokens, contextWindow },
    tokenSpeedTracker,
  });
}

// codex: No(tokenUsageInfo) in the Desktop bundle reads
// `tokenUsage.last.totalTokens` for context usage. Fall back to the cumulative
// shape only for older app-server payloads that do not include `last`.
function pickTokenTotal(tokenUsage: Record<string, unknown>): number | null {
  const last = recordParam(tokenUsage.last);
  if (last) {
    const lastTotal = numberField(last, "totalTokens");
    if (lastTotal !== null) return lastTotal;
  }
  const total = recordParam(tokenUsage.total);
  if (total) {
    const totalTokens = numberField(total, "totalTokens");
    if (totalTokens !== null) return totalTokens;
    const input = numberField(total, "inputTokens");
    const output = numberField(total, "outputTokens");
    if (input !== null || output !== null) {
      return (input ?? 0) + (output ?? 0);
    }
  }
  return numberField(tokenUsage, "usedTokens");
}

function numberField(record: Record<string, unknown>, key: string): number | null {
  const value = record[key];
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

const TOKEN_SPEED_SAMPLE_WINDOW_MS = 2_000;
const TOKEN_SPEED_PUBLISH_INTERVAL_MS = 100;
const TOKEN_SPEED_BYTES_PER_TOKEN = 4;

function startedTokenSpeedPatch(turnId: string): Pick<ThreadRuntimeSlice, "tokenSpeed" | "tokenSpeedTracker"> {
  const tracker = newTokenSpeedTracker(turnId, Date.now());
  return {
    tokenSpeed: { tokensPerSecond: 0, turnId },
    tokenSpeedTracker: tracker,
  };
}

function newTokenSpeedTracker(turnId: string, now: number): ThreadTokenSpeedTracker {
  return {
    completedDurationMs: null,
    estimatedOutputBytes: 0,
    estimatedOutputTokens: 0,
    lastLiveSpeedPublishedAtMs: null,
    latestTokenUsage: null,
    samples: [{ outputTokens: 0, timeMs: now }],
    startedAtMs: now,
    turnId,
  };
}

function updateLiveTokenSpeed(state: CodexUiState, params: Record<string, unknown>): CodexUiState {
  const threadId = stringParam(params, "threadId");
  const turnId = turnIdParam(params);
  const delta = stringParam(params, "delta");
  if (!threadId || !turnId || !delta) return state;
  const bytes = tokenSpeedDeltaBytes(delta);
  if (bytes === 0) return state;

  const runtime = selectThreadRuntime(state, threadId);
  const now = Date.now();
  const tracker = runtime.tokenSpeedTracker?.turnId === turnId
    ? { ...runtime.tokenSpeedTracker }
    : newTokenSpeedTracker(turnId, now);

  tracker.estimatedOutputBytes += bytes;
  tracker.estimatedOutputTokens = tracker.estimatedOutputBytes / TOKEN_SPEED_BYTES_PER_TOKEN;
  tracker.samples = [...tracker.samples, { outputTokens: tracker.estimatedOutputTokens, timeMs: now }];
  while (
    tracker.samples.length > 1
    && (tracker.samples[1]?.timeMs ?? 0) < now - TOKEN_SPEED_SAMPLE_WINDOW_MS
  ) {
    tracker.samples.shift();
  }

  const shouldPublish = tracker.lastLiveSpeedPublishedAtMs == null
    || now - tracker.lastLiveSpeedPublishedAtMs >= TOKEN_SPEED_PUBLISH_INTERVAL_MS;
  if (!shouldPublish) {
    return threadRuntimePatch(state, threadId, { tokenSpeedTracker: tracker });
  }

  tracker.lastLiveSpeedPublishedAtMs = now;
  const first = tracker.samples[0];
  const last = tracker.samples[tracker.samples.length - 1];
  const elapsedMs = first && last ? last.timeMs - first.timeMs : 0;
  const tokensPerSecond = elapsedMs > 0 && first && last
    ? (last.outputTokens - first.outputTokens) / (elapsedMs / 1_000)
    : fallbackTokenSpeed(tracker, now);

  return threadRuntimePatch(state, threadId, {
    tokenSpeed: { tokensPerSecond: finiteTokenSpeed(tokensPerSecond), turnId },
    tokenSpeedTracker: tracker,
  });
}

function completedTokenSpeedPatch(
  runtime: ThreadRuntimeSlice,
  turnId: string,
  turn: TurnLike | undefined,
): Partial<Pick<ThreadRuntimeSlice, "tokenSpeed" | "tokenSpeedTracker">> {
  const tracker = runtime.tokenSpeedTracker;
  if (!tracker || tracker.turnId !== turnId) return {};
  const durationMs = turnDurationMs(turn);
  const nextTracker = { ...tracker, completedDurationMs: durationMs };
  if (!nextTracker.latestTokenUsage || durationMs == null || durationMs <= 0) {
    return { tokenSpeedTracker: nextTracker };
  }
  const outputTokens = tokenUsageOutputTokens(nextTracker.latestTokenUsage);
  if (outputTokens == null) return { tokenSpeedTracker: nextTracker };
  return {
    tokenSpeed: { tokensPerSecond: finiteTokenSpeed(outputTokens / (durationMs / 1_000)), turnId },
    tokenSpeedTracker: nextTracker,
  };
}

function tokenSpeedDeltaBytes(delta: string): number {
  try {
    return new TextEncoder().encode(delta).length;
  } catch {
    return delta.length;
  }
}

function fallbackTokenSpeed(tracker: ThreadTokenSpeedTracker, now: number): number {
  const elapsedMs = now - tracker.startedAtMs;
  return elapsedMs > 0 ? tracker.estimatedOutputTokens / (elapsedMs / 1_000) : 0;
}

function finiteTokenSpeed(value: number): number {
  return Number.isFinite(value) && value >= 0 ? value : 0;
}

function turnDurationMs(turn: TurnLike | undefined): number | null {
  if (!turn) return null;
  if (typeof turn.durationMs === "number" && Number.isFinite(turn.durationMs) && turn.durationMs >= 0) {
    return turn.durationMs;
  }
  if (
    typeof turn.startedAt === "number"
    && Number.isFinite(turn.startedAt)
    && typeof turn.completedAt === "number"
    && Number.isFinite(turn.completedAt)
    && turn.completedAt >= turn.startedAt
  ) {
    return (turn.completedAt - turn.startedAt) * 1_000;
  }
  return null;
}

function tokenUsageOutputTokens(tokenUsage: Record<string, unknown>): number | null {
  const last = recordParam(tokenUsage.last);
  if (!last) return null;
  const output = numberField(last, "outputTokens") ?? 0;
  const reasoning = numberField(last, "reasoningOutputTokens") ?? 0;
  return output + reasoning;
}

function applyThreadCompactedNotification(state: CodexUiState, params: Record<string, unknown>): CodexUiState {
  const threadId = stringParam(params, "threadId");
  const turnId = stringParam(params, "turnId");
  if (!threadId) return state;

  const id = stringParam(params, "itemId")
    || stringParam(params, "id")
    || `context-compaction:${turnId || threadId}`;
  const item = {
    type: "contextCompaction",
    id,
    completed: true,
    source: "automatic",
  } as unknown as ThreadItem;
  return upsertItem(state, threadId, item, turnId || null);
}

function applyThreadGoalUpdatedNotification(state: CodexUiState, params: Record<string, unknown>): CodexUiState {
  const threadId = stringParam(params, "threadId");
  const goal = threadGoalParam(params.goal);
  if (!threadId || !goal) return state;
  const turnId = stringParam(params, "turnId") || null;
  const runtime = selectThreadRuntime(state, threadId);
  const projectedItems = projectCompletedThreadGoalOntoAssistantMessages(
    projectThreadGoalOntoUserMessages(runtime.items, goal, turnId),
    goal,
    turnId,
  );
  return threadRuntimePatch(state, threadId, {
    threadGoal: goal,
    threadGoalTurnId: turnId,
    items: projectedItems,
  });
}

function applyThreadGoalClearedNotification(state: CodexUiState, params: Record<string, unknown>): CodexUiState {
  const threadId = stringParam(params, "threadId");
  if (!threadId) return state;
  const runtime = selectThreadRuntime(state, threadId);
  return threadRuntimePatch(state, threadId, {
    threadGoal: null,
    threadGoalTurnId: null,
    items: clearThreadGoalProjection(runtime.items),
  });
}

function applyHookRunNotification(state: CodexUiState, params: Record<string, unknown>): CodexUiState {
  const threadId = stringParam(params, "threadId");
  const turnId = stringParam(params, "turnId");
  const run = recordParam(params.run);
  if (!threadId || !turnId || !run) return state;
  const runtime = selectThreadRuntime(state, threadId);
  const currentRunsByTurn = runtime.hookRunsByTurn ?? {};
  const existingRuns = currentRunsByTurn[turnId] ?? [];
  const hookRunsByTurn = {
    ...currentRunsByTurn,
    [turnId]: upsertHookRun(existingRuns, run),
  };
  return threadRuntimePatch(state, threadId, { hookRunsByTurn });
}

function applyThreadSettingsUpdatedNotification(
  state: CodexUiState,
  params: Record<string, unknown>,
): CodexUiState {
  const threadId = stringParam(params, "threadId");
  const settings = recordParam(params.threadSettings);
  if (!threadId || !settings) return state;

  const cwd = stringParam(settings, "cwd");
  const modelProvider = stringParam(settings, "modelProvider");
  const context = threadContextDefaultsFromThreadSettings(settings);
  const collaborationMode = collaborationModeParam(settings.collaborationMode);
  const runtime = selectThreadRuntime(state, threadId);
  const nextRuntime = collaborationMode === undefined
    ? runtime
    : normalizeThreadRuntime({
        ...runtime,
        latestCollaborationMode: collaborationMode,
        composerMode: null,
      });
  return withActiveComposerMode({
    ...state,
    threads: state.threads.map((thread) =>
      thread.id === threadId
        ? {
            ...thread,
            ...(cwd ? { cwd } : {}),
            ...(modelProvider ? { modelProvider } : {}),
          }
        : thread,
    ),
    threadsRuntime: collaborationMode === undefined
      ? state.threadsRuntime
      : {
          ...state.threadsRuntime,
          [threadId]: nextRuntime,
        },
    threadContextDefaults: state.activeThreadId === threadId
      ? mergeThreadContextDefaults(state.threadContextDefaults, context)
      : state.threadContextDefaults,
  });
}

function threadContextDefaultsFromThreadSettings(settings: Record<string, unknown>): ThreadContextDefaults {
  return compactThreadContext({
    model: stringParam(settings, "model"),
    modelProvider: stringParam(settings, "modelProvider"),
    serviceTier: settings.serviceTier,
    approvalPolicy: settings.approvalPolicy,
    approvalsReviewer: stringParam(settings, "approvalsReviewer"),
    sandbox: sandboxModeFromSandboxPolicy(settings.sandboxPolicy),
    permissions: permissionsFromActivePermissionProfile(settings.activePermissionProfile),
    reasoningEffort: settings.effort,
    reasoningSummary: settings.summary,
    personality: personalityParam(settings.personality),
  });
}

function mergeThreadContextDefaults(
  current: ThreadContextDefaults | null,
  settings: ThreadContextDefaults,
): ThreadContextDefaults | null {
  const preserved = compactThreadContext({
    baseInstructions: current?.baseInstructions,
    developerInstructions: current?.developerInstructions,
    environments: current?.environments,
    memories: current?.memories,
  });
  const next = compactThreadContext({ ...preserved, ...settings });
  return Object.keys(next).length > 0 ? next : null;
}

function compactThreadContext(context: ThreadContextDefaults): ThreadContextDefaults {
  return Object.fromEntries(
    Object.entries(context).filter(([, value]) => value !== undefined && value !== null && value !== ""),
  ) as ThreadContextDefaults;
}

function sandboxModeFromSandboxPolicy(value: unknown): unknown {
  const policy = recordParam(value);
  const type = stringParam(policy, "type");
  switch (type) {
    case "dangerFullAccess":
      return "danger-full-access";
    case "readOnly":
      return "read-only";
    case "workspaceWrite":
      return "workspace-write";
    case "externalSandbox":
      return policy;
    default:
      return undefined;
  }
}

function permissionsFromActivePermissionProfile(value: unknown): string | undefined {
  return stringParam(value, "id") || undefined;
}

function personalityParam(value: unknown): ThreadContextDefaults["personality"] | undefined {
  return value === "none" || value === "friendly" || value === "pragmatic" ? value : undefined;
}

function collaborationModeParam(value: unknown): CollaborationMode | null | undefined {
  if (value === null) return null;
  const mode = recordParam(value);
  if (!mode) return undefined;
  const kind = stringParam(mode, "mode");
  if (kind !== "plan" && kind !== "default") return undefined;
  if (!recordParam(mode.settings)) return undefined;
  return mode as unknown as CollaborationMode;
}

function nextActiveThreadId(activeThreadId: string | null, threads: Thread[]): string | null {
  if (activeThreadId === null) return null;
  if (activeThreadId && threads.some((thread) => thread.id === activeThreadId)) return activeThreadId;
  return threads[0]?.id ?? null;
}

function upsertThread(threads: Thread[], thread: Thread): Thread[] {
  const index = threads.findIndex((item) => item.id === thread.id);
  if (index === -1) return [thread, ...threads];
  return threads.map((item, itemIndex) => itemIndex === index ? { ...item, ...thread } : item);
}

function upsertThreadState(
  state: CodexUiState,
  thread: Thread,
  select: boolean,
): CodexUiState {
  const snapshotItems = collectThreadItems(thread);
  const runtime = selectThreadRuntime(state, thread.id);
  const currentItems = runtime.items;
  const terminalTurnIds = terminalTurnIdsForRuntime(runtime);
  const activeTurnIds = activeTurnIdsFromThread(thread);
  const staleActiveSnapshot = activeTurnIds.some((turnId) => terminalTurnIds.has(turnId));
  const activeTurns = activeTurnsFromThread(thread, terminalTurnIds);
  const nextActiveTurnId = activeTurns[thread.id] ?? (staleActiveSnapshot ? null : runtime.activeTurnId);
  const hasLiveTurn = Boolean(nextActiveTurnId);
  const hasSnapshotItems = snapshotItems.length > 0;
  const shouldMergeSnapshot = hasLiveTurn || snapshotTouchesTurnIds(snapshotItems, terminalTurnIds);
  const baseTurnOrder = thread.turns
    ? turnOrderFromThread(thread, runtime.turnOrder)
    : runtime.turnOrder;
  const nextItems = hasSnapshotItems
    ? shouldMergeSnapshot
      ? mergeLiveThreadSnapshotItems(
          currentItems,
          snapshotItems,
          staleActiveSnapshot ? terminalTurnIds : undefined,
        )
      : snapshotItems
    : undefined;
  const optimisticTurnState = hasSnapshotItems
    ? pruneUnusedOptimisticTurnState(
        baseTurnOrder ?? [],
        runtime.pendingOptimisticTurns,
        nextItems ?? [],
      )
    : {
        turnOrder: baseTurnOrder ?? [],
        pending: runtime.pendingOptimisticTurns,
      };
  const nextThreads = upsertThread(state.threads, threadWithNonRegressingStatus(
    thread,
    state.threads.find((item) => item.id === thread.id),
    staleActiveSnapshot,
    Boolean(activeTurns[thread.id]),
  ));
  const nextThreadsRuntime = enrichMultiAgentReceiverThreadsInRuntimes({
    ...state.threadsRuntime,
    [thread.id]: normalizeThreadRuntime({
      ...runtime,
      activeTurnId: nextActiveTurnId ?? null,
      turnOrder: baseTurnOrder ? optimisticTurnState.turnOrder : runtime.turnOrder,
      pendingOptimisticTurns: hasSnapshotItems ? optimisticTurnState.pending : runtime.pendingOptimisticTurns,
      items: hasSnapshotItems ? nextItems ?? [] : runtime.items,
    }),
  }, nextThreads);
  return withActiveComposerMode({
    ...state,
    threads: nextThreads,
    activeThreadId: select ? thread.id : state.activeThreadId ?? thread.id,
    threadsRuntime: nextThreadsRuntime,
  });
}

function shortThreadId(id: string): string {
  return id.length > 12 ? `${id.slice(0, 8)}...${id.slice(-4)}` : id;
}

function logNotificationIfUseful(state: CodexUiState, message: JsonRpcNotification): CodexUiState {
  const params = (message.params ?? {}) as Record<string, unknown>;
  switch (message.method) {
    case "warning":
    case "guardianWarning":
      return prependLog(state, stringParam(params, "message") || formatUnknownForLog(params), "warn");
    case "configWarning": {
      const summary = stringParam(params, "summary") || "config warning";
      const details = stringParam(params, "details");
      return prependLog(state, details ? `${summary}: ${details}` : summary, "warn");
    }
    case "model/rerouted": {
      const fromModel = stringParam(params, "fromModel");
      const toModel = stringParam(params, "toModel");
      const reason = stringParam(params, "reason");
      return prependLog(state, `model rerouted ${fromModel} -> ${toModel}${reason ? `: ${reason}` : ""}`, "warn");
    }
    case "model/verification":
      return prependLog(state, `model verification required: ${formatUnknownForLog(params.verifications)}`, "warn");
    case "mcpServer/startupStatus/updated": {
      const name = stringParam(params, "name") || "mcp server";
      const status = formatUnknownForLog(params.status);
      const error = stringParam(params, "error");
      return prependLog(state, error ? `${name} ${status}: ${error}` : `${name} ${status}`, error ? "warn" : "info");
    }
    case "account/updated": {
      const authMode = formatUnknownForLog(params.authMode);
      const planType = formatUnknownForLog(params.planType);
      return prependLog(state, `account updated: ${authMode || "unknown"}${planType ? ` / ${planType}` : ""}`);
    }
    case "account/login/completed": {
      const success = params.success === true;
      const error = stringParam(params, "error");
      return prependLog(state, success ? "account login completed" : `account login failed${error ? `: ${error}` : ""}`, success ? "info" : "error");
    }
    case "thread/realtime/error":
      return prependLog(state, stringParam(params, "message") || formatUnknownForLog(params), "error");
    case "deprecationNotice":
      return prependLog(state, stringParam(params, "message") || formatUnknownForLog(params), "warn");
    case "fs/changed":
      return prependLog(state, fsChangedLogText(params));
    case "hook/started":
      return prependLog(applyHookRunNotification(state, params), hookLogText("started", params));
    case "hook/completed": {
      const level = hookRunStatus(params) === "failed" ? "warn" : "info";
      return prependLog(applyHookRunNotification(state, params), hookLogText("completed", params), level);
    }
    case "windows/worldWritableWarning":
      return prependLog(state, `world-writable path warning: ${formatUnknownForLog(params)}`, "warn");
    default:
      return state;
  }
}

function fsChangedLogText(params: Record<string, unknown>): string {
  const watchId = stringParam(params, "watchId") || "unknown";
  const paths = Array.isArray(params.changedPaths)
    ? params.changedPaths.filter((path): path is string => typeof path === "string")
    : [];
  const preview = paths.slice(0, 3).join(", ");
  const extra = paths.length > 3 ? ` (+${paths.length - 3} more)` : "";
  return `filesystem changed for watch ${watchId}: ${preview || "no paths"}${extra}`;
}

function hookLogText(phase: "started" | "completed", params: Record<string, unknown>): string {
  const threadId = stringParam(params, "threadId");
  const turnId = stringParam(params, "turnId");
  const run = recordParam(params.run);
  const eventName = stringParam(run, "eventName") || "hook";
  const sourcePath = stringParam(run, "sourcePath");
  const status = stringParam(run, "status");
  const statusMessage = stringParam(run, "statusMessage");
  const location = [
    threadId ? `thread ${shortThreadId(threadId)}` : "",
    turnId ? `turn ${shortThreadId(turnId)}` : "",
  ].filter(Boolean).join(", ");
  const suffix = [
    location,
    sourcePath,
    status && phase === "completed" ? status : "",
    statusMessage,
  ].filter(Boolean).join(" - ");
  return `hook ${phase}: ${eventName}${suffix ? ` - ${suffix}` : ""}`;
}

function hookRunStatus(params: Record<string, unknown>): string {
  const run = recordParam(params.run);
  return stringParam(run, "status");
}

function stringParam(value: unknown, key: string): string {
  if (!value || typeof value !== "object") return "";
  const field = (value as Record<string, unknown>)[key];
  return typeof field === "string" ? field : "";
}

function formatUnknownForLog(value: unknown): string {
  if (value === null || value === undefined) return "";
  if (typeof value === "string") return value;
  if (typeof value === "number" || typeof value === "boolean") return String(value);
  try {
    return JSON.stringify(value);
  } catch {
    return String(value);
  }
}

function recordParam(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" ? value as Record<string, unknown> : null;
}

function turnErrorMessage(error: Record<string, unknown> | null | undefined): string {
  return stringParam(error, "message");
}

function streamErrorItem(
  turnId: string,
  error: Record<string, unknown> | null | undefined,
  fallbackText: string,
): AccumulatedThreadItem {
  const id = turnId ? `stream-error:${turnId}` : `stream-error:${fallbackText}`;
  return {
    id,
    type: "stream-error",
    content: turnErrorMessage(error) || fallbackText,
    additionalDetails: stringParam(error, "additionalDetails"),
    completed: true,
    ...(turnId ? { _turnId: turnId } : {}),
  };
}

type TurnLike = {
  id?: string;
  items?: ThreadItem[];
  threadId?: string;
  status?: unknown;
  error?: unknown;
  startedAt?: number | null;
  completedAt?: number | null;
  durationMs?: number | null;
};

function collectThreadItems(thread: Thread): AccumulatedThreadItem[] {
  return (thread.turns ?? []).flatMap((turn) => turnItemsWithWorkedFor(turn));
}

function turnItemsWithWorkedFor(
  turn: TurnLike | undefined,
  options: { hasExtraActivity?: boolean } = {},
): AccumulatedThreadItem[] {
  if (!turn) return [];
  const items = turn.items ?? [];
  const workedFor = workedForItemFromTurn(turn, items, options.hasExtraActivity === true);
  const normalized = normalizeWorkedForItems(items, workedFor);
  return attachTurnMetadataToAll(normalized, turn.id, turnStatusText(turn.status));
}

function workedForItemFromTurn(
  turn: TurnLike,
  items: Array<AccumulatedThreadItem | ThreadItem>,
  hasExtraActivity = false,
): AccumulatedThreadItem | null {
  if (!turn.id || items.some((item) => item.type === "worked-for")) return null;

  /*
   * Codex Desktop gates the worked-for divider on `xt = vt.length > 0` where
   * `vt` is the post-`Ew(ot)` agent activity entries (`local-conversation-thread-BX7YNcUw.js`
   * byte ~539133 in HS body): the entire `Yw` agent-body-collapsible — which
   * carries the "Worked for {time}" via `kg`/`Ng` (byte ~221500 / ~223894) —
   * is mounted only when this turn produced agent activity items. A pure-text
   * turn (`user → reasoning? → assistant`) leaves `xt` false and Codex shows
   * no divider; the assistant message sits flush against the user message.
   *
   * HiCodex previously synthesized worked-for whenever turn timing was known,
   * which produced a spurious "Worked for {time}" row for plain Q&A turns
   * (HiCodex recording 2026-05-21 at 07.57.04 t=12s). Match Codex by
   * suppressing the synthetic item when no activity-type items are present.
   *
   * `hasExtraActivity` lets callers signal that activity items will be merged
   * in AFTER worked-for synthesis (e.g. the `finishTurn` error path that
   * appends a `stream-error` item via the outer `mergeItems` call). Those
   * activity items would satisfy Codex's gate if they were already in the
   * turn payload; the flag preserves that intent without forcing the
   * synthesis logic to look at runtime state.
   */
  if (!hasExtraActivity && !hasAgentActivityItem(items)) return null;

  const startedAtMs = secondsTimestampToMs(turn.startedAt);
  const completedAtMs = secondsTimestampToMs(turn.completedAt);
  const durationMs = typeof turn.durationMs === "number" && Number.isFinite(turn.durationMs) && turn.durationMs > 0
    ? turn.durationMs
    : null;
  const status = turnStatusText(turn.status);
  const working = status === "inProgress" || status === "running" || status === "active";

  if (startedAtMs === null && durationMs === null) return null;

  return {
    id: `worked-for:${turn.id}`,
    type: "worked-for",
    status: working ? "working" : "completed",
    ...(startedAtMs !== null ? { startedAtMs } : {}),
    ...(working ? { completedAtMs: null } : completedAtMs !== null ? { completedAtMs } : {}),
    ...(durationMs !== null ? { durationMs } : {}),
  };
}

/**
 * True when `items` contains any agent-activity-type item — i.e. anything that
 * Codex Desktop's `Ke` whitelist (split-items-into-render-groups-CBI0Av9T.js
 * byte ~23017) routes into the agent body. Excludes user-message, the final
 * assistant-message, reasoning (folded into exploration), and lifecycle-only
 * items (model-changed, personality-changed, …) that Codex never collapses
 * under the worked-for header.
 */
function hasAgentActivityItem(items: Array<AccumulatedThreadItem | ThreadItem>): boolean {
  for (const item of items) {
    const type = String((item as Record<string, unknown>).type ?? "");
    if (AGENT_ACTIVITY_ITEM_TYPES.has(type)) return true;
  }
  return false;
}

/*
 * Mirror of Codex Desktop `Ke` whitelist
 * (split-items-into-render-groups-CBI0Av9T.js byte ~23017) — the set of
 * ThreadItem types that flow into Codex's `agentItems` body and therefore
 * count toward `xt = vt.length > 0` (which gates the worked-for header).
 *
 * Codex `Ke` TRUE branches: assistant-message, exec, patch, dynamic-tool-call,
 * mcp-tool-call, automatic-approval-review, multi-agent-action, stream-error,
 * system-error, context-compaction, reasoning, steered, user-input-response,
 * worked-for, web-search (with non-empty query). We exclude:
 *   - assistant-message (Codex `qe` pulls it out of agentItems as the final
 *     answer; doesn't drive the body header)
 *   - worked-for (the divider itself; would self-trigger)
 *   - reasoning (Codex `We` folds it into the exploration buffer, drops it
 *     when the buffer is empty — so reasoning alone never produces visible
 *     activity)
 *
 * Codex `Ke` FALSE branches (routed to dedicated arrays, never into
 * agentItems): todo-list, turn-diff, user-message, remote-task-created,
 * proposed-plan, plan-implementation, mcp-server-elicitation,
 * permission-request, userInput, personality-changed, forked-from-conversation,
 * model-changed, model-rerouted, auto-review-interruption-warning,
 * generated-image, automation-update — none of these count for the gate.
 *
 * HiCodex protocol uses lowerCamel `commandExecution` / `fileChange` aliases
 * for the same activity classes Codex calls `exec` / `patch`; both forms are
 * accepted so HiCodex-native payloads pass the same gate.
 */
const AGENT_ACTIVITY_ITEM_TYPES: ReadonlySet<string> = new Set([
  "exec",
  "commandExecution",
  "patch",
  "fileChange",
  "web-search",
  "mcp-tool-call",
  "dynamic-tool-call",
  "multi-agent-action",
  "automatic-approval-review",
  "stream-error",
  "system-error",
  "context-compaction",
  "steered",
  "user-input-response",
]);

function normalizeWorkedForItems(
  items: ThreadItem[],
  syntheticWorkedFor: AccumulatedThreadItem | null,
): AccumulatedThreadItem[] {
  const baseItems = items.filter((item) => !isWorkedForThreadItem(item));
  const explicitWorkedFor = items.find(isWorkedForThreadItem) as AccumulatedThreadItem | undefined;
  const workedFor = explicitWorkedFor ?? syntheticWorkedFor;
  if (baseItems.length === 0 && workedFor?.status === "working") return baseItems as AccumulatedThreadItem[];
  return insertWorkedForAfterLastUserMessage(baseItems, workedFor ?? null);
}

function insertWorkedForAfterLastUserMessage(
  items: ThreadItem[],
  workedFor: AccumulatedThreadItem | null,
): AccumulatedThreadItem[] {
  if (!workedFor) return items as AccumulatedThreadItem[];
  /*
   * Codex Desktop `Yw` (local-conversation-thread byte ~550398) renders the
   * agent-body-collapsible as `<Fragment>{HEADER}{BODY}</Fragment>` where
   * HEADER carries the "Worked for {time}" label via `Pg` followed by a
   * `w-full border-t` horizontal rule, and BODY is a `motion.div` containing
   * activity entries + the final assistant message. The header always
   * precedes the body — i.e. worked-for sits between the user message and
   * the first activity row, not interleaved with activities or appended at
   * the tail of the turn.
   *
   * HiCodex previously inserted worked-for before the LAST assistant message
   * which produced two wrong placements:
   *   1. In-progress / pure-activity turns (no assistant yet) → worked-for
   *      fell off the end of the array via `[...items, workedFor]`, which is
   *      what users saw after switching sessions: a stale snapshot replay
   *      would land the divider at the bottom of the turn instead of above
   *      the activity rows.
   *   2. Completed turns with activities → divider was between activities
   *      and the assistant message, the wrong side of the rule from Codex.
   *
   * Insert immediately AFTER the last user message of the turn so the row
   * acts as Codex's header. If there is no user message yet (early stream
   * before `item/started userMessage`), prepend to the front so the divider
   * still leads the turn segment.
   */
  const lastUserIndex = findLastIndex(items, isUserMessageThreadItem);
  if (lastUserIndex < 0) return [workedFor, ...items] as AccumulatedThreadItem[];
  return [
    ...items.slice(0, lastUserIndex + 1),
    workedFor,
    ...items.slice(lastUserIndex + 1),
  ] as AccumulatedThreadItem[];
}

function findLastIndex<T>(items: T[], predicate: (item: T) => boolean): number {
  for (let index = items.length - 1; index >= 0; index -= 1) {
    if (predicate(items[index] as T)) return index;
  }
  return -1;
}

function isWorkedForThreadItem(item: ThreadItem | AccumulatedThreadItem): boolean {
  const type = String((item as Record<string, unknown>).type ?? "");
  return type === "worked-for" || type === "workedFor";
}

function secondsTimestampToMs(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) && value > 0 ? Math.round(value * 1_000) : null;
}

function mergeLiveThreadSnapshotItems(
  current: AccumulatedThreadItem[],
  snapshot: Array<AccumulatedThreadItem | ThreadItem>,
  protectedTurnIds?: Set<string>,
): AccumulatedThreadItem[] {
  const snapshotWithLocalInputs = preserveLocalInputsInConfirmedUserMessages(current, snapshot);
  const swept = dropConfirmedOptimisticPlaceholders(current, snapshotWithLocalInputs);
  const aligned = realignSnapshotIdsToStreamedTwins(swept, snapshotWithLocalInputs);
  const protectedAligned = substituteProtectedTerminalSnapshotItems(swept, aligned, protectedTurnIds);
  return dedupeConfirmedUserMessagesByContent(mergeItemsInIncomingOrder(swept, protectedAligned));
}

function substituteProtectedTerminalSnapshotItems(
  current: AccumulatedThreadItem[],
  snapshot: Array<AccumulatedThreadItem | ThreadItem>,
  protectedTurnIds: Set<string> | undefined,
): Array<AccumulatedThreadItem | ThreadItem> {
  if (!protectedTurnIds || protectedTurnIds.size === 0) return snapshot;
  const currentByTurnId = new Map<string, AccumulatedThreadItem[]>();
  for (const item of current) {
    const turnId = turnIdOf(item);
    if (!turnId || !protectedTurnIds.has(turnId)) continue;
    let items = currentByTurnId.get(turnId);
    if (!items) {
      items = [];
      currentByTurnId.set(turnId, items);
    }
    items.push(item);
  }
  if (currentByTurnId.size === 0) return snapshot;

  const emittedTurnIds = new Set<string>();
  let changed = false;
  const next: Array<AccumulatedThreadItem | ThreadItem> = [];
  for (const item of snapshot) {
    const turnId = turnIdOf(item);
    if (!turnId) {
      next.push(item);
      continue;
    }
    const protectedItems = currentByTurnId.get(turnId);
    if (!protectedItems) {
      next.push(item);
      continue;
    }
    changed = true;
    if (emittedTurnIds.has(turnId)) continue;
    next.push(...protectedItems);
    emittedTurnIds.add(turnId);
  }
  return changed ? next : snapshot;
}

/**
 * Drop snapshot items that are rollout-replay duplicates of items already
 * present in the in-memory streamed state under their authoritative server
 * ids. The host crate's rollout reader synthesizes new ids
 * (`history-user:*`, `history-agent:*`, `history-reasoning:*`) for messages
 * it reconstructs from the rollout JSONL file. When the user switches threads
 * mid-stream and switches back, `thread/read` may not have materialized those
 * messages in `turn.items` yet, so `mergeThreadToolHistory` injects the
 * replay versions alongside whatever the server returned. Without this guard
 * the id-keyed merge would produce two bubbles (replay + streamed) for the
 * same user prompt, assistant commentary, or reasoning block — the streamed
 * one with the real server id, the replay one with the synthetic history id.
 *
 * We always trust the in-memory streamed item over the rollout synthesized
 * one because the streamed id is the authoritative server item id, while the
 * replay id is local to the host crate's rollout reader.
 */
/**
 * Rewrite snapshot rows so any duplicate of an already-streamed
 * userMessage / agentMessage / reasoning / collabAgentToolCall is renamed to
 * its streamed twin's server id. The id-keyed merge in
 * `mergeItemsInIncomingOrder` then folds
 * snapshot+streamed into a single ThreadItem at the snapshot row's position,
 * so we keep the canonical ordering carried by `thread/read.turn.items`
 * without leaving the streamed row stranded at the tail (which would render
 * "working / Explored …" above the user prompt instead of below it).
 *
 * Two duplicate sources are handled here:
 *   1. The host crate's rollout reader synthesizes `history-user:*` /
 *      `history-agent:*` / `history-reasoning:*` ids when reconstructing
 *      messages from the rollout JSONL. These rows carry `_historyReplay`.
 *   2. The app-server's own `thread/read.turn.items` for an in-progress
 *      turn may return message rows under provisional ids that don't match
 *      the ids already received via `item/started` / `item/completed`. These
 *      rows do NOT carry `_historyReplay` — content keying is required.
 *   3. Collab agent started/completed lifecycle rows can disagree on ids
 *      after rollout hydration; align by the tool call's stable semantic
 *      inputs so completed snapshots replace the live started placeholder.
 *
 * If a snapshot row has the SAME id as an in-state row, no rewrite happens
 * (id-merge already handles it). Items with no content-key match are passed
 * through untouched so genuinely-new snapshot rows still appear.
 */
function realignSnapshotIdsToStreamedTwins(
  current: AccumulatedThreadItem[],
  snapshot: Array<AccumulatedThreadItem | ThreadItem>,
): Array<AccumulatedThreadItem | ThreadItem> {
  const userIdsByKey = new Map<string, string[]>();
  const agentIdsByText = new Map<string, string[]>();
  const reasoningIdsByKey = new Map<string, string[]>();
  const collabIdsByKey = new Map<string, string[]>();
  for (const item of current) {
    if (isReplayItem(item)) continue;
    const record = item as Record<string, unknown>;
    const id = typeof record.id === "string" ? record.id : "";
    if (!id) continue;
    if (isConfirmedUserMessage(item)) {
      const key = userInputContentKey(record.content);
      if (key) pushToList(userIdsByKey, key, id);
      continue;
    }
    const itemType = String(record.type ?? "");
    if (itemType === "agentMessage") {
      const text = stringField(item, "text").trim();
      if (text) pushToList(agentIdsByText, text, id);
      continue;
    }
    if (itemType === "reasoning") {
      const key = reasoningContentKey(item);
      if (key) pushToList(reasoningIdsByKey, key, id);
      continue;
    }
    if (itemType === "collabAgentToolCall") {
      const key = collabToolCallLifecycleKey(item);
      if (key) pushToList(collabIdsByKey, key, id);
    }
  }
  if (
    userIdsByKey.size === 0
    && agentIdsByText.size === 0
    && reasoningIdsByKey.size === 0
    && collabIdsByKey.size === 0
  ) {
    return snapshot;
  }
  return snapshot.map((item) => {
    const record = item as Record<string, unknown>;
    const id = typeof record.id === "string" ? record.id : "";
    if (isConfirmedUserMessage(item)) {
      const key = userInputContentKey(record.content);
      const replacement = consumeMatchingStreamedId(userIdsByKey, key, id);
      return rewriteIdIfNeeded(item, id, replacement);
    }
    const itemType = String(record.type ?? "");
    if (itemType === "agentMessage") {
      const text = stringField(item, "text").trim();
      const replacement = consumeMatchingStreamedId(agentIdsByText, text, id);
      return rewriteIdIfNeeded(item, id, replacement);
    }
    if (itemType === "reasoning") {
      const key = reasoningContentKey(item);
      const replacement = consumeMatchingStreamedId(reasoningIdsByKey, key, id);
      return rewriteIdIfNeeded(item, id, replacement);
    }
    if (itemType === "collabAgentToolCall") {
      const key = collabToolCallLifecycleKey(item);
      const replacement = consumeMatchingStreamedId(collabIdsByKey, key, id);
      return rewriteIdIfNeeded(item, id, replacement);
    }
    return item;
  });
}

function pushToList(index: Map<string, string[]>, key: string, value: string): void {
  let bucket = index.get(key);
  if (!bucket) {
    bucket = [];
    index.set(key, bucket);
  }
  bucket.push(value);
}

function consumeMatchingStreamedId(
  index: Map<string, string[]>,
  key: string,
  currentId: string,
): string | null {
  if (!key) return null;
  const list = index.get(key);
  if (!list || list.length === 0) return null;
  // Prefer the same-id slot when the snapshot row already lines up with one
  // of the streamed twins. This keeps regular id-merge fast and means we
  // only rewrite when the ids genuinely diverge.
  const sameIdSlot = list.indexOf(currentId);
  if (sameIdSlot >= 0) {
    list.splice(sameIdSlot, 1);
    return currentId;
  }
  return list.shift() ?? null;
}

function rewriteIdIfNeeded(
  item: AccumulatedThreadItem | ThreadItem,
  currentId: string,
  replacement: string | null,
): AccumulatedThreadItem | ThreadItem {
  if (!replacement || replacement === currentId) return item;
  return { ...(item as object), id: replacement } as AccumulatedThreadItem | ThreadItem;
}


function isReplayItem(item: AccumulatedThreadItem | ThreadItem): boolean {
  return (item as Record<string, unknown>)._historyReplay === true;
}

function reasoningContentKey(item: AccumulatedThreadItem | ThreadItem): string {
  const record = item as Record<string, unknown>;
  const summary = Array.isArray(record.summary) ? record.summary.join("\n") : "";
  const content = Array.isArray(record.content) ? record.content.join("\n") : "";
  const trimmed = `${summary.trim()}\u001f${content.trim()}`;
  return trimmed === "\u001f" ? "" : trimmed;
}

function collabToolCallLifecycleKey(item: AccumulatedThreadItem | ThreadItem): string {
  const record = item as Record<string, unknown>;
  if (String(record.type ?? "") !== "collabAgentToolCall") return "";
  const tool = stringField(record, "tool") || stringField(record, "action");
  if (!tool || tool === "wait") return "";
  return [
    tool,
    stringField(record, "senderThreadId"),
    normalizeUserInputText(stringField(record, "prompt")),
    stringField(record, "model"),
    stringField(record, "reasoningEffort"),
  ].join("\u001f");
}

/**
 * Drop optimistic user placeholders that have already been confirmed by the
 * server-side snapshot. Without this, every thread re-read (for example after
 * switching threads and switching back) would leave the local placeholder
 * around alongside the server-confirmed userMessage and the transcript would
 * gain a duplicate bubble per round-trip.
 */
function dropConfirmedOptimisticPlaceholders(
  current: AccumulatedThreadItem[],
  snapshot: Array<AccumulatedThreadItem | ThreadItem>,
): AccumulatedThreadItem[] {
  const confirmedUserMessages = snapshot.filter(isConfirmedUserMessage);
  if (confirmedUserMessages.length === 0) return current;
  const optimisticUserMessages = current.filter(isLocalUserMessage);
  if (optimisticUserMessages.length === 0) return current;
  const usedOptimistic = new Set<AccumulatedThreadItem>();
  for (const confirmed of confirmedUserMessages) {
    const optimistic = matchingOptimisticUserMessage(confirmed, optimisticUserMessages, usedOptimistic);
    if (optimistic) usedOptimistic.add(optimistic);
  }
  if (usedOptimistic.size === 0) return current;
  return current.filter((item) => !usedOptimistic.has(item));
}

function pruneUnusedOptimisticTurnState(
  turnOrder: string[],
  pending: string[] | undefined,
  items: AccumulatedThreadItem[],
): { turnOrder: string[]; pending: string[] } {
  const usedTurnIds = new Set<string>();
  for (const item of items) {
    const turnId = turnIdOf(item);
    if (turnId) usedTurnIds.add(turnId);
  }
  const unusedOptimisticTurnIds = new Set(
    turnOrder.filter((turnId) => isOptimisticTurnPlaceholder(turnId) && !usedTurnIds.has(turnId)),
  );
  const currentPending = pending ?? [];
  if (unusedOptimisticTurnIds.size === 0) {
    return { turnOrder, pending: currentPending };
  }
  return {
    turnOrder: turnOrder.filter((turnId) => !unusedOptimisticTurnIds.has(turnId)),
    pending: currentPending.filter((turnId) => !unusedOptimisticTurnIds.has(turnId)),
  };
}

function activeTurnsFromThread(thread: Thread, terminalTurnIds: Set<string> = new Set()): Record<string, string> {
  let activeTurn: { id?: string } | null = null;
  for (const turn of thread.turns ?? []) {
    if (isTurnStatusInProgress(turn.status) && !terminalTurnIds.has(turn.id)) {
      activeTurn = turn;
    }
  }
  return activeTurn?.id ? { [thread.id]: activeTurn.id } : {};
}

function activeTurnIdsFromThread(thread: Thread): string[] {
  const ids: string[] = [];
  for (const turn of thread.turns ?? []) {
    if (isTurnStatusInProgress(turn.status)) ids.push(turn.id);
  }
  return ids;
}

function terminalTurnIdsForRuntime(runtime: ThreadRuntimeSlice): Set<string> {
  const ids = new Set(runtime.terminalTurnIds);
  for (const item of runtime.items) {
    const turnId = turnIdOf(item);
    if (!turnId) continue;
    if (isTerminalTurnStatus((item as Record<string, unknown>)._turnStatus)) ids.add(turnId);
  }
  return ids;
}

function snapshotTouchesTurnIds(items: AccumulatedThreadItem[], turnIds: Set<string>): boolean {
  if (turnIds.size === 0) return false;
  return items.some((item) => {
    const turnId = turnIdOf(item);
    return Boolean(turnId && turnIds.has(turnId));
  });
}

function threadWithNonRegressingStatus(
  incoming: Thread,
  current: Thread | undefined,
  staleActiveSnapshot: boolean,
  hasNonStaleActiveTurn: boolean,
): Thread {
  if (!staleActiveSnapshot || hasNonStaleActiveTurn || !isThreadStatusInProgress(incoming.status)) return incoming;
  if (current && !isThreadStatusInProgress(current.status)) {
    return { ...incoming, status: current.status };
  }
  return { ...incoming, status: { type: "idle" } };
}

function isTurnStatusInProgress(status: unknown): boolean {
  const value = turnStatusText(status);
  return value === "inProgress" || value === "running" || value === "active";
}

function isTerminalTurnStatus(status: unknown): boolean {
  const value = turnStatusText(status);
  return value === "completed"
    || value === "failed"
    || value === "interrupted"
    || value === "cancelled"
    || value === "canceled";
}

function upsertItem(
  state: CodexUiState,
  threadId: string,
  item: ThreadItem,
  turnId?: string | null,
): CodexUiState {
  const runtime = selectThreadRuntime(state, threadId);
  const current = runtime.items;
  const order = turnId
    ? ensureTurnInOrder(runtime.turnOrder, turnId)
    : runtime.turnOrder;
  const enriched = enrichMultiAgentReceiverThreads(item, state.threads);
  const stamped = turnId ? attachTurnId(enriched, turnId) : enriched;
  const next = mergeItems(current, [stamped], order);
  return threadRuntimePatch(state, threadId, {
    turnOrder: turnId ? order : runtime.turnOrder,
    items: next,
  });
}

function enrichMultiAgentReceiverThreadsInRuntimes(
  runtimes: Record<string, ThreadRuntimeSlice>,
  threads: Thread[],
): Record<string, ThreadRuntimeSlice> {
  const next: Record<string, ThreadRuntimeSlice> = {};
  for (const [threadId, runtime] of Object.entries(runtimes)) {
    next[threadId] = normalizeThreadRuntime({
      ...runtime,
      items: runtime.items.map((item) => enrichMultiAgentReceiverThreads(item, threads)),
    });
  }
  return next;
}

function enrichMultiAgentReceiverThreads<T extends AccumulatedThreadItem | ThreadItem>(
  item: T,
  threads: Thread[],
): T {
  const record = item as Record<string, unknown>;
  if (record.type !== "collabAgentToolCall") return item;
  const receiverIds = collabReceiverThreadIds(record);
  if (receiverIds.length === 0) return item;
  const threadsById = new Map(threads.map((thread) => [thread.id, thread]));
  const existingById = collabReceiverThreadsById(record);
  const receiverThreads = receiverIds.map((threadId) => {
    const existing = existingById.get(threadId);
    const thread = threadsById.get(threadId) ?? receiverThreadObject(existing);
    return {
      ...(existing ?? {}),
      threadId,
      thread: thread ?? null,
    };
  });
  return { ...(item as object), receiverThreads } as unknown as T;
}

function collabReceiverThreadIds(record: Record<string, unknown>): string[] {
  const ids = new Set<string>();
  if (Array.isArray(record.receiverThreadIds)) {
    for (const value of record.receiverThreadIds) {
      if (typeof value === "string" && value.trim()) ids.add(value.trim());
    }
  }
  if (Array.isArray(record.receiverThreads)) {
    for (const receiver of record.receiverThreads) {
      if (!receiver || typeof receiver !== "object" || Array.isArray(receiver)) continue;
      const receiverRecord = receiver as Record<string, unknown>;
      const id = stringParam(receiverRecord, "threadId") || stringParam(receiverRecord, "id");
      if (id.trim()) ids.add(id.trim());
    }
  }
  const states = record.agentsStates;
  if (states && typeof states === "object" && !Array.isArray(states)) {
    for (const id of Object.keys(states)) {
      if (id.trim()) ids.add(id.trim());
    }
  }
  return Array.from(ids);
}

function collabReceiverThreadsById(record: Record<string, unknown>): Map<string, Record<string, unknown>> {
  const byId = new Map<string, Record<string, unknown>>();
  if (!Array.isArray(record.receiverThreads)) return byId;
  for (const receiver of record.receiverThreads) {
    if (!receiver || typeof receiver !== "object" || Array.isArray(receiver)) continue;
    const receiverRecord = receiver as Record<string, unknown>;
    const id = stringParam(receiverRecord, "threadId") || stringParam(receiverRecord, "id");
    if (id.trim()) byId.set(id.trim(), receiverRecord);
  }
  return byId;
}

function receiverThreadObject(receiver: Record<string, unknown> | undefined): Thread | null {
  const thread = receiver?.thread;
  return thread && typeof thread === "object" && !Array.isArray(thread) ? thread as Thread : null;
}

/**
 * Replace the optimistic placeholder for a freshly confirmed user message in
 * the same turn segment. Replicates the asar `Jp(...)` lookup that swaps the
 * lower-quality optimistic item for the server-confirmed one.
 */
function reconcileUserMessage(
  state: CodexUiState,
  threadId: string,
  turnId: string | null,
  incoming: ThreadItem,
): CodexUiState {
  const runtime = selectThreadRuntime(state, threadId);
  const current = runtime.items;
  const optimistic = findOptimisticUserMessage(current, turnId, (incoming as Record<string, unknown>).content);
  if (!optimistic) return state;
  const order = turnId
    ? ensureTurnInOrder(runtime.turnOrder, turnId)
    : runtime.turnOrder;
  const incomingWithLocalInputs = userMessageWithPreservedLocalInputs(incoming, optimistic);
  const replacement: AccumulatedThreadItem = {
    ...optimistic,
    ...(incomingWithLocalInputs as AccumulatedThreadItem),
    _turnId: turnId ?? turnIdOf(optimistic) ?? undefined,
    _localId: undefined,
  };
  delete (replacement as Record<string, unknown>)._localId;
  const next = current.map((item) => (item === optimistic ? replacement : item));
  return threadRuntimePatch(state, threadId, {
    turnOrder: turnId ? order : runtime.turnOrder,
    items: next,
  });
}

function itemWithLifecycleTiming(item: ThreadItem, params: Record<string, unknown>): ThreadItem {
  const startedAtMs = timestampParam(params, "startedAtMs");
  const completedAtMs = timestampParam(params, "completedAtMs");
  if (startedAtMs === null && completedAtMs === null) return item;
  return {
    ...item,
    ...(startedAtMs !== null ? { startedAtMs } : {}),
    ...(completedAtMs !== null ? { completedAtMs } : {}),
  } as ThreadItem;
}

function timestampParam(params: Record<string, unknown>, key: string): number | null {
  const value = params[key];
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function mergeItems(
  current: AccumulatedThreadItem[],
  incoming: Array<AccumulatedThreadItem | ThreadItem>,
  turnOrder: string[] = [],
): AccumulatedThreadItem[] {
  let result = current;
  for (const item of incoming) {
    result = placeItemInTurn(result, item, turnOrder);
  }
  return result;
}

function mergeItemsInIncomingOrder(
  current: AccumulatedThreadItem[],
  incoming: Array<AccumulatedThreadItem | ThreadItem>,
): AccumulatedThreadItem[] {
  const currentById = new Map(current.map((item) => [item.id, item]));
  const used = new Set<string>();
  const next = incoming.map((item) => {
    used.add(item.id);
    return mergeAccumulatedItem(currentById.get(item.id), item);
  });
  for (const item of current) {
    if (!used.has(item.id)) next.push(item);
  }
  return next;
}

/**
 * Place a single item into the existing list, preserving per-turn segment order.
 * Mirrors how the shipped Codex Desktop webview keeps `n.items` partitioned by
 * `turn.id` and only appends within the matching turn segment.
 */
function placeItemInTurn(
  current: AccumulatedThreadItem[],
  incoming: AccumulatedThreadItem | ThreadItem,
  turnOrder: string[],
): AccumulatedThreadItem[] {
  const existingIndex = current.findIndex((item) => item.id === incoming.id);
  if (existingIndex >= 0) {
    const merged = mergeAccumulatedItem(current[existingIndex], incoming);
    if (merged === current[existingIndex]) return current;
    const next = current.slice();
    next[existingIndex] = merged;
    return next;
  }

  const incomingTurnId = turnIdOf(incoming);
  if (!incomingTurnId) {
    return [...current, incoming as AccumulatedThreadItem];
  }
  const incomingTurnIndex = turnOrder.indexOf(incomingTurnId);
  if (incomingTurnIndex < 0) {
    return [...current, incoming as AccumulatedThreadItem];
  }
  let insertAt = current.length;
  for (let index = 0; index < current.length; index += 1) {
    const candidateTurnId = turnIdOf(current[index] as AccumulatedThreadItem);
    if (!candidateTurnId) continue;
    const candidateTurnIndex = turnOrder.indexOf(candidateTurnId);
    if (candidateTurnIndex > incomingTurnIndex) {
      insertAt = index;
      break;
    }
  }
  return [
    ...current.slice(0, insertAt),
    incoming as AccumulatedThreadItem,
    ...current.slice(insertAt),
  ];
}

function turnIdOf(item: AccumulatedThreadItem | ThreadItem | undefined | null): string | null {
  if (!item) return null;
  const value = (item as Record<string, unknown>)._turnId;
  return typeof value === "string" && value.length > 0 ? value : null;
}

function projectThreadGoalOntoUserMessages(
  items: AccumulatedThreadItem[],
  goal: ThreadGoal,
  turnId: string | null,
): AccumulatedThreadItem[] {
  const targetIndex = threadGoalTargetUserMessageIndex(items, turnId);
  let changed = false;
  const next = items.map((item, index) => {
    const record = item as Record<string, unknown>;
    const isTarget = index === targetIndex;
    if (isTarget) {
      if (record._threadGoal === goal && record._threadGoalTurnId === turnId) return item;
      changed = true;
      return {
        ...item,
        _threadGoal: goal,
        _threadGoalTurnId: turnId,
      };
    }
    if (record._threadGoal === undefined && record._threadGoalTurnId === undefined) return item;
    const cleaned = { ...item } as AccumulatedThreadItem;
    delete (cleaned as Record<string, unknown>)._threadGoal;
    delete (cleaned as Record<string, unknown>)._threadGoalTurnId;
    changed = true;
    return cleaned;
  });
  return changed ? next : items;
}

function clearThreadGoalProjection(items: AccumulatedThreadItem[]): AccumulatedThreadItem[] {
  let changed = false;
  const next = items.map((item) => {
    const record = item as Record<string, unknown>;
    if (record._threadGoal === undefined && record._threadGoalTurnId === undefined) return item;
    const cleaned = { ...item } as AccumulatedThreadItem;
    delete (cleaned as Record<string, unknown>)._threadGoal;
    delete (cleaned as Record<string, unknown>)._threadGoalTurnId;
    changed = true;
    return cleaned;
  });
  return changed ? next : items;
}

function projectCompletedThreadGoalOntoAssistantMessages(
  items: AccumulatedThreadItem[],
  goal: ThreadGoal,
  turnId: string | null,
): AccumulatedThreadItem[] {
  const targetIndex = isCompletedThreadGoal(goal)
    ? threadGoalTargetAssistantMessageIndex(items, turnId)
    : -1;
  let changed = false;
  const next = items.map((item, index) => {
    const record = item as Record<string, unknown>;
    const isTarget = index === targetIndex;
    if (isTarget) {
      if (record._completedThreadGoal === goal && record._completedThreadGoalTurnId === turnId) return item;
      changed = true;
      return {
        ...item,
        _completedThreadGoal: goal,
        _completedThreadGoalTurnId: turnId,
      };
    }
    if (record._completedThreadGoal === undefined && record._completedThreadGoalTurnId === undefined) return item;
    const cleaned = { ...item } as AccumulatedThreadItem;
    delete (cleaned as Record<string, unknown>)._completedThreadGoal;
    delete (cleaned as Record<string, unknown>)._completedThreadGoalTurnId;
    changed = true;
    return cleaned;
  });
  return changed ? next : items;
}

function projectHookStatsOntoAssistantMessages(
  items: AccumulatedThreadItem[],
  hookRunsByTurn: Record<string, unknown[]>,
): AccumulatedThreadItem[] {
  let changed = false;
  const next = items.map((item) => {
    const record = item as Record<string, unknown>;
    if (!isAssistantMessageThreadItem(item)) {
      if (record.hookStats === undefined) return item;
      const cleaned = { ...item } as AccumulatedThreadItem;
      delete (cleaned as Record<string, unknown>).hookStats;
      changed = true;
      return cleaned;
    }
    const turnId = turnIdOf(item);
    const stats = turnId ? hookStatsFromRuns(hookRunsByTurn[turnId]) : null;
    if (!stats) {
      if (record.hookStats === undefined) return item;
      const cleaned = { ...item } as AccumulatedThreadItem;
      delete (cleaned as Record<string, unknown>).hookStats;
      changed = true;
      return cleaned;
    }
    if (hookStatsEqual(record.hookStats, stats)) return item;
    changed = true;
    return { ...item, hookStats: stats };
  });
  return changed ? next : items;
}

function upsertHookRun(existingRuns: unknown[], run: Record<string, unknown>): unknown[] {
  const runId = stringParam(run, "id") || stringParam(run, "runId");
  if (!runId) return [...existingRuns, run];
  let replaced = false;
  const next = existingRuns.map((existing) => {
    const existingRecord = recordParam(existing);
    if (!existingRecord) return existing;
    const existingId = stringParam(existingRecord, "id") || stringParam(existingRecord, "runId");
    if (existingId !== runId) return existing;
    replaced = true;
    return run;
  });
  return replaced ? next : [...existingRuns, run];
}

function hookStatsFromRuns(runs: unknown[] | undefined): Record<string, unknown> | null {
  if (!runs || runs.length === 0) return null;
  let blockedCount = 0;
  let errorCount = 0;
  const entries: Array<{ kind: string; text: string }> = [];
  for (const value of runs) {
    const run = recordParam(value);
    if (!run) continue;
    const status = stringParam(run, "status");
    if (status === "blocked") blockedCount += 1;
    if (status === "failed") errorCount += 1;
    const rawEntries = Array.isArray(run.entries) ? run.entries : [];
    for (const rawEntry of rawEntries) {
      const entry = recordParam(rawEntry);
      if (!entry) continue;
      const kind = stringParam(entry, "kind");
      if (kind !== "error" && kind !== "feedback" && kind !== "stop") continue;
      entries.push({ kind, text: stringParam(entry, "text") });
    }
  }
  return {
    count: runs.length,
    blockedCount,
    errorCount,
    entries,
  };
}

function hookStatsEqual(left: unknown, right: Record<string, unknown>): boolean {
  if (!left || typeof left !== "object" || Array.isArray(left)) return false;
  const leftRecord = left as Record<string, unknown>;
  if (leftRecord.count !== right.count) return false;
  if (leftRecord.blockedCount !== right.blockedCount) return false;
  if (leftRecord.errorCount !== right.errorCount) return false;
  const leftEntries = Array.isArray(leftRecord.entries) ? leftRecord.entries : [];
  const rightEntries = Array.isArray(right.entries) ? right.entries : [];
  if (leftEntries.length !== rightEntries.length) return false;
  for (let index = 0; index < leftEntries.length; index += 1) {
    const leftEntry = recordParam(leftEntries[index]);
    const rightEntry = recordParam(rightEntries[index]);
    if (!leftEntry || !rightEntry) return false;
    if (leftEntry.kind !== rightEntry.kind || leftEntry.text !== rightEntry.text) return false;
  }
  return true;
}

function isCompletedThreadGoal(goal: ThreadGoal): boolean {
  return goal.status === "complete";
}

function threadGoalTargetUserMessageIndex(items: AccumulatedThreadItem[], turnId: string | null): number {
  if (turnId) {
    for (let index = items.length - 1; index >= 0; index -= 1) {
      const item = items[index];
      if (item && isUserMessageThreadItem(item) && turnIdOf(item) === turnId) return index;
    }
    return -1;
  }
  for (let index = items.length - 1; index >= 0; index -= 1) {
    const item = items[index];
    if (item && isUserMessageThreadItem(item)) return index;
  }
  return -1;
}

function threadGoalTargetAssistantMessageIndex(items: AccumulatedThreadItem[], turnId: string | null): number {
  if (turnId) {
    for (let index = items.length - 1; index >= 0; index -= 1) {
      const item = items[index];
      if (item && isAssistantMessageThreadItem(item) && turnIdOf(item) === turnId) return index;
    }
    return -1;
  }
  for (let index = items.length - 1; index >= 0; index -= 1) {
    const item = items[index];
    if (item && isAssistantMessageThreadItem(item) && !isNonCompletedTurnItem(item)) return index;
  }
  return -1;
}

function threadGoalParam(value: unknown): ThreadGoal | null {
  if (!value || typeof value !== "object") return null;
  const record = value as Record<string, unknown>;
  if (typeof record.threadId !== "string" || typeof record.objective !== "string") return null;
  if (typeof record.status !== "string") return null;
  return value as ThreadGoal;
}

function localIdOf(item: AccumulatedThreadItem | ThreadItem | undefined | null): string | null {
  if (!item) return null;
  const value = (item as Record<string, unknown>)._localId;
  return typeof value === "string" && value.length > 0 ? value : null;
}

function ensureTurnInOrder(order: string[], turnId: string | null | undefined): string[] {
  if (!turnId) return order;
  if (order.includes(turnId)) return order;
  return [...order, turnId];
}

function turnOrderFromThread(thread: Thread, current: string[] = []): string[] {
  const next = [...current];
  for (const turn of thread.turns ?? []) {
    if (typeof turn.id === "string" && turn.id && !next.includes(turn.id)) {
      next.push(turn.id);
    }
  }
  return next;
}

function attachTurnId(
  item: AccumulatedThreadItem | ThreadItem,
  turnId: string | undefined | null,
): AccumulatedThreadItem {
  if (!turnId) return item as AccumulatedThreadItem;
  const current = turnIdOf(item);
  if (current === turnId) return item as AccumulatedThreadItem;
  return { ...(item as AccumulatedThreadItem), _turnId: turnId };
}

function attachTurnIdToAll(
  items: Array<AccumulatedThreadItem | ThreadItem>,
  turnId: string | undefined | null,
): AccumulatedThreadItem[] {
  if (!turnId) return items as AccumulatedThreadItem[];
  return items.map((item) => attachTurnId(item, turnId));
}

function attachTurnMetadataToAll(
  items: Array<AccumulatedThreadItem | ThreadItem>,
  turnId: string | undefined | null,
  turnStatus: string,
): AccumulatedThreadItem[] {
  const withTurnId = attachTurnIdToAll(items, turnId);
  if (!turnStatus) return withTurnId;
  return withTurnId.map((item) =>
    (item as Record<string, unknown>)._turnStatus === turnStatus
      ? item
      : { ...item, _turnStatus: turnStatus }
  );
}

/**
 * Find an optimistic user message whose textual content matches the
 * server-confirmed user message. First tries a strict same-turn match (the
 * common path right after `bindOptimisticTurn`), then falls back to any
 * optimistic placeholder in the thread — this covers the case where
 * `item/started userMessage` lands before `turn/started` so the placeholder
 * still carries an `optimistic-turn:*` id.
 */
function findOptimisticUserMessage(
  items: AccumulatedThreadItem[],
  turnId: string | null,
  content: unknown,
): AccumulatedThreadItem | null {
  const incomingContentKey = userInputContentKey(content);
  if (!incomingContentKey) return null;
  if (turnId) {
    for (const item of items) {
      if (item.type !== "userMessage") continue;
      if (!localIdOf(item)) continue;
      if (turnIdOf(item) !== turnId) continue;
      const existingContentKey = userInputContentKey((item as Record<string, unknown>).content);
      if (existingContentKey === incomingContentKey) return item;
    }
  }
  for (const item of items) {
    if (item.type !== "userMessage") continue;
    if (!localIdOf(item)) continue;
    const existingContentKey = userInputContentKey((item as Record<string, unknown>).content);
    if (existingContentKey === incomingContentKey) return item;
  }
  const incomingText = userInputContentText(content);
  if (incomingText) {
    for (const item of items) {
      if (!isLocalUserMessage(item)) continue;
      const existingText = userInputContentText((item as Record<string, unknown>).content);
      if (existingText === incomingText) return item;
    }
  }
  if (turnId) {
    const sameTurnOptimistic = items.filter((item) =>
      isLocalUserMessage(item) && turnIdOf(item) === turnId
    );
    if (sameTurnOptimistic.length === 1) return sameTurnOptimistic[0] ?? null;
  }
  return null;
}

function isLocalUserMessage(item: AccumulatedThreadItem | ThreadItem): item is AccumulatedThreadItem {
  return String((item as Record<string, unknown>).type ?? "") === "userMessage" && Boolean(localIdOf(item));
}

function isConfirmedUserMessage(item: AccumulatedThreadItem | ThreadItem): item is AccumulatedThreadItem {
  return String((item as Record<string, unknown>).type ?? "") === "userMessage" && !localIdOf(item);
}

function isUserMessageThreadItem(item: AccumulatedThreadItem | ThreadItem): boolean {
  return String((item as Record<string, unknown>).type ?? "") === "userMessage";
}

function isAssistantMessageThreadItem(item: AccumulatedThreadItem | ThreadItem): boolean {
  return String((item as Record<string, unknown>).type ?? "") === "agentMessage";
}

function isNonCompletedTurnItem(item: AccumulatedThreadItem | ThreadItem): boolean {
  const status = (item as Record<string, unknown>)._turnStatus;
  return typeof status === "string" && status.length > 0 && status !== "completed";
}

function optimisticUserMessageConfirmedBy(
  optimistic: AccumulatedThreadItem | ThreadItem,
  confirmed: AccumulatedThreadItem | ThreadItem,
): boolean {
  if (userMessagesHaveSameContent(optimistic, confirmed)) return true;
  const optimisticTurnId = turnIdOf(optimistic);
  const confirmedTurnId = turnIdOf(confirmed);
  return Boolean(
    optimisticTurnId
      && confirmedTurnId
      && optimisticTurnId === confirmedTurnId
      && !isOptimisticTurnPlaceholder(optimisticTurnId),
  );
}

function userMessagesHaveSameContent(
  left: AccumulatedThreadItem | ThreadItem,
  right: AccumulatedThreadItem | ThreadItem,
): boolean {
  const leftKey = userInputContentKey((left as Record<string, unknown>).content);
  const rightKey = userInputContentKey((right as Record<string, unknown>).content);
  return Boolean(leftKey && rightKey && leftKey === rightKey);
}

function userInputContentKey(value: unknown): string {
  if (typeof value === "string") return userInputPartKey({ type: "text", text: value });
  if (!Array.isArray(value)) return "";
  return value.map(userInputPartKey).filter(Boolean).join("\u001f");
}

function userInputPartKey(value: unknown): string {
  if (typeof value === "string") return `text:${normalizeUserInputText(value)}`;
  if (!value || typeof value !== "object") return "";
  const record = value as Record<string, unknown>;
  const type = typeof record.type === "string" ? record.type : "";
  if (type === "text" || typeof record.text === "string") {
    const text = typeof record.text === "string" ? record.text : "";
    return text ? `text:${normalizeUserInputText(text)}` : "";
  }
  if (type === "image") {
    const url = typeof record.url === "string" ? record.url.trim() : "";
    return url ? `image:${url}` : "";
  }
  if (type === "localImage") {
    const path = typeof record.path === "string" ? record.path.trim() : "";
    return path ? `localImage:${path}` : "";
  }
  if (type === "skill" || type === "mention") {
    const name = typeof record.name === "string" ? record.name.trim() : "";
    const path = typeof record.path === "string" ? record.path.trim() : "";
    return name || path ? `${type}:${name}\u001e${path}` : "";
  }
  return "";
}

function normalizeUserInputText(value: string): string {
  return value.replace(/\r\n?/g, "\n").trim();
}

function userInputContentText(value: unknown): string {
  if (typeof value === "string") return normalizeUserInputText(value);
  if (!Array.isArray(value)) return "";
  return value
    .map((part) => {
      if (typeof part === "string") return part;
      if (!part || typeof part !== "object") return "";
      const record = part as Record<string, unknown>;
      if (record.type === "text" && typeof record.text === "string") return record.text;
      return "";
    })
    .filter(Boolean)
    .join("\n")
    .trim();
}

function preserveLocalInputsInConfirmedUserMessages<T extends AccumulatedThreadItem | ThreadItem>(
  current: AccumulatedThreadItem[],
  incoming: T[],
): T[] {
  const optimisticUserMessages = current.filter(isLocalUserMessage);
  if (optimisticUserMessages.length === 0) return incoming;
  const usedOptimistic = new Set<AccumulatedThreadItem>();
  let changed = false;
  const next = incoming.map((item) => {
    if (!isConfirmedUserMessage(item)) return item;
    const optimistic = matchingOptimisticUserMessage(item, optimisticUserMessages, usedOptimistic);
    if (!optimistic) return item;
    usedOptimistic.add(optimistic);
    const merged = userMessageWithPreservedLocalInputs(item, optimistic) as T;
    if (merged !== item) changed = true;
    return merged;
  });
  return changed ? next : incoming;
}

function matchingOptimisticUserMessage(
  confirmed: AccumulatedThreadItem | ThreadItem,
  optimisticUserMessages: AccumulatedThreadItem[],
  usedOptimistic: Set<AccumulatedThreadItem>,
): AccumulatedThreadItem | null {
  for (const optimistic of optimisticUserMessages) {
    if (usedOptimistic.has(optimistic)) continue;
    if (userMessagesHaveSameContent(optimistic, confirmed)) return optimistic;
  }
  for (const optimistic of optimisticUserMessages) {
    if (usedOptimistic.has(optimistic)) continue;
    if (sameNonOptimisticTurn(optimistic, confirmed)) return optimistic;
  }
  for (const optimistic of optimisticUserMessages) {
    if (usedOptimistic.has(optimistic)) continue;
    if (userMessagesHaveSameText(optimistic, confirmed)) return optimistic;
  }
  return null;
}

function sameNonOptimisticTurn(
  left: AccumulatedThreadItem | ThreadItem,
  right: AccumulatedThreadItem | ThreadItem,
): boolean {
  const leftTurnId = turnIdOf(left);
  const rightTurnId = turnIdOf(right);
  return Boolean(leftTurnId && rightTurnId && leftTurnId === rightTurnId && !isOptimisticTurnPlaceholder(leftTurnId));
}

function userMessagesHaveSameText(
  left: AccumulatedThreadItem | ThreadItem,
  right: AccumulatedThreadItem | ThreadItem,
): boolean {
  const leftText = userInputContentText((left as Record<string, unknown>).content);
  const rightText = userInputContentText((right as Record<string, unknown>).content);
  return Boolean(leftText && rightText && leftText === rightText);
}

function userMessageWithPreservedLocalInputs<T extends AccumulatedThreadItem | ThreadItem>(
  confirmed: T,
  optimistic: AccumulatedThreadItem | ThreadItem,
): T {
  const mergedContent = userInputContentWithPreservedLocalInputs(
    (confirmed as Record<string, unknown>).content,
    (optimistic as Record<string, unknown>).content,
  );
  if (mergedContent === (confirmed as Record<string, unknown>).content) return confirmed;
  return { ...(confirmed as object), content: mergedContent } as T;
}

function userInputContentWithPreservedLocalInputs(confirmedContent: unknown, optimisticContent: unknown): unknown {
  const confirmedParts = userInputContentParts(confirmedContent);
  const optimisticParts = userInputContentParts(optimisticContent);
  if (optimisticParts.length === 0) return confirmedContent;
  const confirmedKeys = new Set(confirmedParts.map(userInputPartKey).filter(Boolean));
  const localInputs = optimisticParts.filter((part) => {
    const key = userInputPartKey(part);
    return key && !key.startsWith("text:") && !confirmedKeys.has(key);
  });
  if (localInputs.length === 0) return confirmedContent;
  return [...confirmedParts, ...localInputs];
}

function userInputContentParts(value: unknown): unknown[] {
  if (Array.isArray(value)) return value;
  if (typeof value === "string") {
    const text = normalizeUserInputText(value);
    return text ? [{ type: "text", text, text_elements: [] }] : [];
  }
  return [];
}

function rememberConfirmedWithLocalInputs(
  preservedConfirmedById: Map<string, AccumulatedThreadItem>,
  confirmed: AccumulatedThreadItem | undefined,
  optimistic: AccumulatedThreadItem,
): void {
  if (!confirmed) return;
  const rawId = (confirmed as Record<string, unknown>).id;
  const id = typeof rawId === "string" ? rawId : "";
  if (!id) return;
  preservedConfirmedById.set(id, userMessageWithPreservedLocalInputs(confirmed, optimistic));
}

function applyPreservedConfirmedUserMessages(
  items: AccumulatedThreadItem[],
  preservedConfirmedById: Map<string, AccumulatedThreadItem>,
): AccumulatedThreadItem[] {
  if (preservedConfirmedById.size === 0) return items;
  return items.map((item) => preservedConfirmedById.get(item.id) ?? item);
}

function mergeAccumulatedItem(
  existing: AccumulatedThreadItem | undefined,
  incoming: AccumulatedThreadItem | ThreadItem,
): AccumulatedThreadItem {
  if (!existing) return incoming as AccumulatedThreadItem;
  if (existing.type === "userMessage") return existing;

  const merged = { ...existing, ...incoming } as AccumulatedThreadItem;
  preserveLongerAccumulatedText(merged, existing, incoming as Record<string, unknown>, "text");
  preserveLongerAccumulatedText(merged, existing, incoming as Record<string, unknown>, "aggregatedOutput");
  preserveLongerAccumulatedText(merged, existing, incoming as Record<string, unknown>, "progress");
  return merged;
}

function preserveLongerAccumulatedText(
  target: Record<string, unknown>,
  existing: Record<string, unknown>,
  incoming: Record<string, unknown>,
  field: string,
): void {
  const existingText = typeof existing[field] === "string" ? existing[field] : null;
  const incomingText = typeof incoming[field] === "string" ? incoming[field] : null;
  if (existingText === null || incomingText === null) return;
  if (existingText.length <= incomingText.length) return;
  if (incomingText.length === 0 || existingText.startsWith(incomingText)) {
    target[field] = existingText;
  }
}

function appendItemText(
  state: CodexUiState,
  params: Record<string, unknown>,
  expectedType: string,
  field: string,
  deltaField: string,
): CodexUiState {
  const threadId = String(params.threadId ?? "");
  const itemId = String(params.itemId ?? "");
  const delta = String(params[deltaField] ?? "");
  if (!threadId || !itemId || !delta) return state;
  const runtime = selectThreadRuntime(state, threadId);
  const turnId = typeof params.turnId === "string" && params.turnId.length > 0 ? params.turnId : null;
  const order = turnId ? ensureTurnInOrder(runtime.turnOrder, turnId) : runtime.turnOrder;
  const items = runtime.items;
  let found = false;
  let next = items.map((item) => {
    if (item.id !== itemId) return item;
    found = true;
    const previous = String((item as Record<string, unknown>)[field] ?? "");
    const updated = {
      ...item,
      type: item.type || expectedType,
      ...(expectedType === "agentMessage" && (item as Record<string, unknown>).completed !== true ? { completed: false } : {}),
      [field]: previous + delta,
    };
    return turnId ? attachTurnId(updated as AccumulatedThreadItem, turnId) : updated;
  });
  if (!found) {
    const incoming = {
      id: itemId,
      type: expectedType,
      ...(expectedType === "agentMessage" ? { completed: false } : {}),
      [field]: delta,
    } as unknown as AccumulatedThreadItem;
    next = placeItemInTurn(next, turnId ? attachTurnId(incoming, turnId) : incoming, order);
  }
  return threadRuntimePatch(state, threadId, { items: next, turnOrder: order });
}

function mergeItemFields(
  state: CodexUiState,
  params: Record<string, unknown>,
  expectedType: string,
  fields: Record<string, unknown>,
): CodexUiState {
  const threadId = String(params.threadId ?? "");
  const itemId = String(params.itemId ?? "");
  if (!threadId || !itemId) return state;
  const items = selectThreadRuntime(state, threadId).items;
  let found = false;
  const next = items.map((item) => {
    if (item.id !== itemId) return item;
    found = true;
    return { ...item, type: item.type || expectedType, ...fields };
  });
  if (!found) {
    next.push({ id: itemId, type: expectedType, ...fields });
  }
  return threadRuntimePatch(state, threadId, { items: next });
}

function appendReasoningText(
  state: CodexUiState,
  params: Record<string, unknown>,
  field: "content" | "summary",
  indexField: "contentIndex" | "summaryIndex",
): CodexUiState {
  const threadId = String(params.threadId ?? "");
  const itemId = String(params.itemId ?? "");
  const delta = String(params.delta ?? "");
  if (!threadId || !itemId || !delta) return state;
  return updateReasoningParts(state, threadId, itemId, field, numberParam(params, indexField), delta, turnIdParam(params));
}

function updateReasoningParts(
  state: CodexUiState,
  threadId: string,
  itemId: string,
  field: "content" | "summary",
  index: number,
  delta: string,
  turnId: string | null,
): CodexUiState {
  const runtime = selectThreadRuntime(state, threadId);
  const order = turnId ? ensureTurnInOrder(runtime.turnOrder, turnId) : runtime.turnOrder;
  const items = runtime.items;
  let found = false;
  let next = items.map((item) => {
    if (item.id !== itemId) return item;
    found = true;
    const parts = reasoningParts(item, field);
    while (parts.length <= index) parts.push("");
    parts[index] = `${parts[index] ?? ""}${delta}`;
    const updated = { ...item, type: "reasoning", [field]: parts } as AccumulatedThreadItem;
    return turnId ? attachTurnId(updated, turnId) : updated;
  });
  if (!found) {
    const parts: string[] = [];
    while (parts.length <= index) parts.push("");
    parts[index] = delta;
    const incoming = { id: itemId, type: "reasoning", [field]: parts } as unknown as AccumulatedThreadItem;
    next = placeItemInTurn(next, turnId ? attachTurnId(incoming, turnId) : incoming, order);
  }
  return threadRuntimePatch(state, threadId, { items: next, turnOrder: order });
}

function turnIdParam(params: Record<string, unknown>): string | null {
  return typeof params.turnId === "string" && params.turnId.length > 0 ? params.turnId : null;
}

function reasoningParts(item: AccumulatedThreadItem, field: "content" | "summary"): string[] {
  const value = (item as Record<string, unknown>)[field];
  if (Array.isArray(value)) return value.map((part) => typeof part === "string" ? part : formatUnknownForLog(part));
  if (typeof value === "string") return [value];
  return [];
}

function numberParam(params: Record<string, unknown>, key: string): number {
  const value = params[key];
  return typeof value === "number" && Number.isFinite(value) && value >= 0 ? Math.floor(value) : 0;
}

function upsertTurnPlan(state: CodexUiState, params: Record<string, unknown>): CodexUiState {
  const threadId = String(params.threadId ?? "");
  const turnId = typeof params.turnId === "string" && params.turnId.length > 0 ? params.turnId : null;
  const plan = Array.isArray(params.plan) ? params.plan : [];
  if (!threadId) return state;
  return threadRuntimePatch(state, threadId, {
    turnPlan: {
      threadId,
      turnId,
      explanation: typeof params.explanation === "string" ? params.explanation : null,
      plan,
      updatedAt: Date.now(),
    },
  });
}

function finishTurn(
  state: CodexUiState,
  params: Record<string, unknown>,
  fallbackStatus: "completed" | "failed" | "interrupted",
): CodexUiState {
  const turn = params.turn as TurnLike | undefined;
  const threadId = String(params.threadId ?? turn?.threadId ?? state.activeThreadId ?? "");
  const turnId = String(params.turnId ?? turn?.id ?? "");
  if (!threadId) return state;

  const runtime = selectThreadRuntime(state, threadId);
  const nextActiveTurnId = !turnId || runtime.activeTurnId === turnId ? null : runtime.activeTurnId;

  const turnStatus = turnStatusText(turn?.status) || fallbackStatus;
  const turnError = recordParam(turn?.error);
  const errorText = turnErrorMessage(turnError);
  const order = ensureTurnInOrder(runtime.turnOrder, turnId || null);
  const terminalSegment = errorText
    ? mergeItems(
        // Tell worked-for synthesis the stream-error item is incoming —
        // satisfies the agent-activity gate (Codex aligns by mounting the
        // worked-for header for failed turns since stream-error renders
        // inside `vt`).
        turnItemsWithWorkedFor(turn, { hasExtraActivity: true }),
        [streamErrorItem(turnId, turnError, errorText)],
        order,
      )
    : turnItemsWithWorkedFor(turn);
  const currentItems = runtime.items;
  const nextItems = turnId
    ? replaceTurnSegment(currentItems, turnId, terminalSegment, order)
    : mergeItemsInIncomingOrder(currentItems, terminalSegment);
  const tokenSpeedPatch = turnId ? completedTokenSpeedPatch(runtime, turnId, turn) : {};
  return {
    ...state,
    threads: state.threads.map((thread) =>
      thread.id === threadId ? { ...thread, status: terminalThreadStatusFromTurn(turnStatus, Boolean(errorText)) } : thread,
    ),
    threadsRuntime: {
      ...state.threadsRuntime,
      [threadId]: normalizeThreadRuntime({
        ...runtime,
        ...tokenSpeedPatch,
        activeTurnId: nextActiveTurnId,
        turnOrder: order,
        terminalTurnIds: turnId
          ? dedupeStrings([...runtime.terminalTurnIds, turnId])
          : runtime.terminalTurnIds,
        items: nextItems,
      }),
    },
  };
}

/**
 * Replace the per-turn segment in-place: keep items from other turns at their
 * original positions, merge the snapshot `segment` into the existing turn slice
 * (preserving accumulated streaming text), and slot any new items from the
 * snapshot at sensible positions inside the segment.
 *
 * Insertion rules for items the live stream has not seen yet:
 *  - `worked-for`: insert right after the last user message in the segment so
 *    "user prompt → thinking → assistant/error" reads naturally, mirroring how
 *    Codex Desktop renders a finalized turn.
 *  - `assistant`: insert at the end of the segment so server replays append.
 *  - everything else: append at the end of the segment.
 */
function replaceTurnSegment(
  current: AccumulatedThreadItem[],
  turnId: string,
  segment: AccumulatedThreadItem[],
  turnOrder: string[],
): AccumulatedThreadItem[] {
  const before: AccumulatedThreadItem[] = [];
  const after: AccumulatedThreadItem[] = [];
  let inSegment: AccumulatedThreadItem[] = [];
  const turnIndex = turnOrder.indexOf(turnId);

  for (const item of current) {
    const itemTurnId = turnIdOf(item);
    if (itemTurnId === turnId) {
      inSegment.push(item);
      continue;
    }
    if (!itemTurnId) {
      before.push(item);
      continue;
    }
    const itemTurnIndex = turnOrder.indexOf(itemTurnId);
    if (turnIndex < 0 || itemTurnIndex < 0 || itemTurnIndex < turnIndex) {
      before.push(item);
    } else {
      after.push(item);
    }
  }

  const stamped = preserveLocalInputsInConfirmedUserMessages(
    inSegment,
    segment.map((item) => attachTurnId(item, turnId)),
  );
  const stampedById = new Map(stamped.map((item) => [item.id, item]));

  inSegment = inSegment.map((item) => {
    const incoming = stampedById.get(item.id);
    return incoming ? mergeAccumulatedItem(item, incoming) : item;
  });

  // Drop optimistic user placeholders confirmed by the terminal snapshot under
  // real ids. Content can differ after protocol normalization, so fall back to
  // same-turn user-message order when exact content matching is unavailable.
  const confirmedUserMessages = stamped.filter(isConfirmedUserMessage);
  if (confirmedUserMessages.length > 0) {
    const unmatchedConfirmed = [...confirmedUserMessages];
    inSegment = inSegment.filter((item) => {
      if (!isLocalUserMessage(item)) return true;
      const contentMatchIndex = unmatchedConfirmed.findIndex((confirmed) => userMessagesHaveSameContent(item, confirmed));
      if (contentMatchIndex >= 0) {
        unmatchedConfirmed.splice(contentMatchIndex, 1);
        return false;
      }
      if (unmatchedConfirmed.length === 0) return true;
      unmatchedConfirmed.shift();
      return false;
    });
  }

  const inSegmentIds = new Set(inSegment.map((item) => item.id));
  for (const item of stamped) {
    if (inSegmentIds.has(item.id)) continue;
    // Skip snapshot userMessages whose content is already confirmed in this
    // segment under a different id. Mirrors the rollout-replay protection
    // applied during live snapshot merging — without it, a `history-user:*`
    // synthesized from the rollout file would coexist with the streamed
    // server-id userMessage after `turn/completed`.
    if (isConfirmedUserMessage(item)) {
      const incomingKey = userInputContentKey((item as Record<string, unknown>).content);
      if (
        incomingKey
        && inSegment.some((existing) =>
          isConfirmedUserMessage(existing)
          && userInputContentKey((existing as Record<string, unknown>).content) === incomingKey,
        )
      ) {
        continue;
      }
    }
    if (isWorkedForThreadItem(item)) {
      const lastUserIndex = findLastIndex(inSegment, isUserMessageItem);
      const insertAt = lastUserIndex + 1;
      inSegment = [
        ...inSegment.slice(0, insertAt),
        item,
        ...inSegment.slice(insertAt),
      ];
      inSegmentIds.add(item.id);
      continue;
    }
    inSegment.push(item);
    inSegmentIds.add(item.id);
  }

  // Final guard: collapse duplicate confirmed userMessages by content key
  // within the same turn.
  // Keeps the first occurrence (closest to streaming order) so the in-memory
  // streamed item with the authoritative server id wins over any
  // rollout-replay synthesized duplicate that might have leaked into the
  // segment via earlier merges.
  inSegment = dedupeConfirmedUserMessagesByContent(inSegment);

  return [...before, ...inSegment, ...after];
}

function dedupeConfirmedUserMessagesByContent(
  items: AccumulatedThreadItem[],
): AccumulatedThreadItem[] {
  const seenKeys = new Set<string>();
  const next: AccumulatedThreadItem[] = [];
  for (const item of items) {
    if (!isConfirmedUserMessage(item)) {
      next.push(item);
      continue;
    }
    const key = userInputContentKey((item as Record<string, unknown>).content);
    if (!key) {
      next.push(item);
      continue;
    }
    const scopedKey = `${turnIdOf(item) || "__unscoped__"}\u0000${key}`;
    if (seenKeys.has(scopedKey)) continue;
    seenKeys.add(scopedKey);
    next.push(item);
  }
  return next;
}

function isUserMessageItem(item: AccumulatedThreadItem | ThreadItem): boolean {
  return String((item as Record<string, unknown>).type ?? "") === "userMessage";
}

function turnStatusText(status: unknown): string {
  if (typeof status === "string") return status;
  if (!status || typeof status !== "object") return "";
  const record = status as Record<string, unknown>;
  const type = record.type;
  if (typeof type === "string") return type;
  const value = record.status;
  return typeof value === "string" ? value : "";
}

function terminalThreadStatusFromTurn(turnStatus: string, hasTurnError = false): ThreadStatus {
  if (turnStatus === "systemError" || hasTurnError) return { type: "systemError" };
  return { type: "idle" };
}

function normalizeThreadStatus(value: unknown, fallback: unknown): ThreadStatus {
  return threadStatusFromUnknown(value)
    ?? threadStatusFromUnknown(fallback)
    ?? { type: "idle" };
}

function threadStatusFromUnknown(value: unknown): ThreadStatus | null {
  if (typeof value === "string") {
    if (value === "active" || value === "running" || value === "inProgress") {
      return { type: "active", activeFlags: [] };
    }
    if (value === "idle" || value === "completed" || value === "interrupted" || value === "failed") {
      return { type: "idle" };
    }
    if (value === "systemError") return { type: "systemError" };
    if (value === "notLoaded") return { type: "notLoaded" };
    return null;
  }
  if (!value || typeof value !== "object") return null;
  const record = value as Record<string, unknown>;
  const type = record.type;
  if (type === "active") {
    return {
      type: "active",
      activeFlags: normalizeThreadActiveFlags(record.activeFlags),
    };
  }
  if (type === "idle" || type === "systemError" || type === "notLoaded") return { type };
  return null;
}

function normalizeThreadActiveFlags(value: unknown): ThreadActiveFlag[] {
  if (!Array.isArray(value)) return [];
  return value.filter((item): item is ThreadActiveFlag =>
    item === "waitingOnApproval" || item === "waitingOnUserInput"
  );
}
