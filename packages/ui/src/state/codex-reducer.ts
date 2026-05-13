import type {
  CollaborationMode,
  JsonRpcNotification,
  JsonRpcRequest,
  ModelConfig,
  RequestId,
  Thread,
  ThreadActiveFlag,
  ThreadStatus,
  ThreadItem,
  UserInput,
} from "@hicodex/codex-protocol";
import { stringField } from "../lib/format";
import type { HostStatus } from "../lib/tauri-host";
import { composerModeFromCollaborationMode } from "./collaboration-modes";
import type { ComposerMode } from "./composer-workflow";
import type { AccumulatedThreadItem } from "./render-groups";

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
  baseInstructions?: string;
  developerInstructions?: string;
  personality?: "none" | "friendly" | "pragmatic";
  reasoningEffort?: unknown;
  reasoningSummary?: unknown;
}

export interface TurnPlanSnapshot {
  threadId: string;
  turnId: string | null;
  explanation: string | null;
  plan: unknown[];
  updatedAt: number;
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
}

export type CodexUiAction =
  | { type: "connecting"; value: boolean }
  | { type: "connected"; value: boolean }
  | { type: "hostStatus"; status: HostStatus }
  | { type: "setThreads"; threads: Thread[] }
  | { type: "upsertThread"; thread: Thread; select?: boolean }
  | { type: "setActiveThread"; threadId: string | null }
  | { type: "removeThread"; threadId: string }
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
  | { type: "dropOptimisticUserMessage"; threadId: string; localId: string };

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
        activeThreadId: nextActiveThreadId(state.activeThreadId, action.threads),
      });
    case "upsertThread":
      return upsertThreadState(state, action.thread, action.select === true);
    case "setActiveThread":
      return withActiveComposerMode({ ...state, activeThreadId: action.threadId });
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
  return {
    activeTurnId: runtime?.activeTurnId ?? null,
    items: runtime?.items ?? [],
    turnOrder: runtime?.turnOrder ?? [],
    pendingOptimisticTurns: runtime?.pendingOptimisticTurns ?? [],
    latestCollaborationMode: runtime?.latestCollaborationMode ?? null,
    turnPlan: runtime?.turnPlan ?? null,
    turnDiff: runtime?.turnDiff ?? "",
    composerMode: runtime?.composerMode ?? null,
  };
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
  const next: AccumulatedThreadItem[] = [];
  for (const item of items) {
    if (turnIdOf(item) !== localTurnId) {
      next.push(item);
      continue;
    }
    if (item.type === "userMessage" && localIdOf(item)) {
      if (confirmedUserMessagesInTurn.some((confirmed) => userMessagesHaveSameContent(item, confirmed))) continue;
      if (confirmedUserMessagesInTurn.length > 0) continue;
    }
    next.push({ ...item, _turnId: turnId });
  }
  const pending = runtime.pendingOptimisticTurns.filter((id) => id !== localTurnId);
  return threadRuntimePatch(state, threadId, {
    turnOrder: dedup,
    pendingOptimisticTurns: pending,
    items: next,
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
      const activeTurns = activeTurnsFromThread(thread);
      const nextActiveTurnId = activeTurns[thread.id] ?? runtime.activeTurnId;
      const hasLiveTurn = Boolean(nextActiveTurnId);
      const nextTurnOrder = turnOrderFromThread(thread, runtime.turnOrder);
      const nextItems = snapshotItems.length > 0
        ? hasLiveTurn
          ? mergeLiveThreadSnapshotItems(currentItems, snapshotItems)
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
      return withActiveComposerMode({
        ...state,
        threads: upsertThread(state.threads, thread),
        activeThreadId: state.activeThreadId ?? thread.id,
        threadsRuntime: {
          ...state.threadsRuntime,
          [thread.id]: normalizeThreadRuntime({
            ...runtime,
            activeTurnId: nextActiveTurnId ?? null,
            turnOrder: optimisticTurnState.turnOrder,
            pendingOptimisticTurns: optimisticTurnState.pending,
            items: snapshotItems.length > 0 ? nextItems ?? [] : runtime.items,
          }),
        },
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
      return state;
    case "thread/compacted":
      return applyThreadCompactedNotification(state, params);
    case "thread/goal/updated":
    case "thread/goal/cleared":
      return state;
    case "turn/started": {
      const turn = params.turn as TurnLike | undefined;
      const threadId = String(params.threadId ?? turn?.threadId ?? state.activeThreadId ?? "");
      if (!threadId) return state;
      const baseState: CodexUiState = turn?.id
        ? bindNextOptimisticTurn(state, threadId, turn.id)
        : state;
      const runtime = selectThreadRuntime(baseState, threadId);
      const order = ensureTurnInOrder(runtime.turnOrder, turn?.id ?? null);
      return withActiveComposerMode({
        ...baseState,
        activeThreadId: baseState.activeThreadId ?? threadId,
        threadsRuntime: {
          ...baseState.threadsRuntime,
          [threadId]: normalizeThreadRuntime({
            ...runtime,
            activeTurnId: turn?.id ?? runtime.activeTurnId,
            turnOrder: order,
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
    case "item/agentMessage/delta":
      return appendItemText(state, params, "agentMessage", "text", "delta");
    case "item/plan/delta":
      return appendItemText(state, params, "plan", "text", "delta");
    case "item/reasoning/textDelta":
      return appendReasoningText(state, params, "content", "contentIndex");
    case "item/reasoning/summaryTextDelta":
      return appendReasoningText(state, params, "summary", "summaryIndex");
    case "item/reasoning/summaryPartAdded":
      return ensureReasoningPart(state, params, "summary", "summaryIndex");
    case "item/commandExecution/outputDelta":
      return appendItemText(state, params, "commandExecution", "aggregatedOutput", "delta");
    case "item/commandExecution/terminalInteraction":
      return appendCommandTerminalInteraction(state, params);
    case "item/fileChange/outputDelta":
      return appendItemText(state, params, "fileChange", "aggregatedOutput", "delta");
    case "item/fileChange/patchUpdated":
      return mergeItemFields(state, params, "fileChange", { changes: params.changes });
    case "item/mcpToolCall/progress":
      return appendItemText(state, params, "mcpToolCall", "progress", "message");
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
    default:
      return logNotificationIfUseful(state, message);
  }
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
  const activeTurns = activeTurnsFromThread(thread);
  const nextActiveTurnId = activeTurns[thread.id] ?? runtime.activeTurnId;
  const hasLiveTurn = Boolean(nextActiveTurnId);
  const hasSnapshotItems = snapshotItems.length > 0;
  const baseTurnOrder = thread.turns
    ? turnOrderFromThread(thread, runtime.turnOrder)
    : runtime.turnOrder;
  const nextItems = hasSnapshotItems
    ? hasLiveTurn
      ? mergeLiveThreadSnapshotItems(currentItems, snapshotItems)
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
  return withActiveComposerMode({
    ...state,
    threads: upsertThread(state.threads, thread),
    activeThreadId: select ? thread.id : state.activeThreadId ?? thread.id,
    threadsRuntime: {
      ...state.threadsRuntime,
      [thread.id]: normalizeThreadRuntime({
        ...runtime,
        activeTurnId: nextActiveTurnId ?? null,
        turnOrder: baseTurnOrder ? optimisticTurnState.turnOrder : runtime.turnOrder,
        pendingOptimisticTurns: hasSnapshotItems ? optimisticTurnState.pending : runtime.pendingOptimisticTurns,
        items: hasSnapshotItems ? nextItems ?? [] : runtime.items,
      }),
    },
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
    case "windows/worldWritableWarning":
      return prependLog(state, `world-writable path warning: ${formatUnknownForLog(params)}`, "warn");
    default:
      return state;
  }
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

function turnItemsWithWorkedFor(turn: TurnLike | undefined): AccumulatedThreadItem[] {
  if (!turn) return [];
  const items = turn.items ?? [];
  const workedFor = workedForItemFromTurn(turn, items);
  const normalized = normalizeWorkedForItems(items, workedFor);
  return attachTurnMetadataToAll(normalized, turn.id, turnStatusText(turn.status));
}

function workedForItemFromTurn(
  turn: TurnLike,
  items: Array<AccumulatedThreadItem | ThreadItem>,
): AccumulatedThreadItem | null {
  if (!turn.id || items.some((item) => item.type === "worked-for")) return null;

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

function normalizeWorkedForItems(
  items: ThreadItem[],
  syntheticWorkedFor: AccumulatedThreadItem | null,
): AccumulatedThreadItem[] {
  const baseItems = items.filter((item) => !isWorkedForThreadItem(item));
  const explicitWorkedFor = items.find(isWorkedForThreadItem) as AccumulatedThreadItem | undefined;
  const workedFor = explicitWorkedFor ?? syntheticWorkedFor;
  if (baseItems.length === 0 && workedFor?.status === "working") return baseItems as AccumulatedThreadItem[];
  return insertWorkedForBeforeAssistant(baseItems, workedFor ?? null);
}

function insertWorkedForBeforeAssistant(
  items: ThreadItem[],
  workedFor: AccumulatedThreadItem | null,
): AccumulatedThreadItem[] {
  if (!workedFor) return items as AccumulatedThreadItem[];
  const assistantIndex = findLastIndex(items, isAssistantThreadItem);
  if (assistantIndex < 0) return [...items, workedFor] as AccumulatedThreadItem[];
  return [
    ...items.slice(0, assistantIndex),
    workedFor,
    ...items.slice(assistantIndex),
  ] as AccumulatedThreadItem[];
}

function findLastIndex<T>(items: T[], predicate: (item: T) => boolean): number {
  for (let index = items.length - 1; index >= 0; index -= 1) {
    if (predicate(items[index] as T)) return index;
  }
  return -1;
}

function isAssistantThreadItem(item: ThreadItem | AccumulatedThreadItem): boolean {
  const type = String((item as Record<string, unknown>).type ?? "");
  return type === "agentMessage" || type === "assistant-message";
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
): AccumulatedThreadItem[] {
  const swept = dropConfirmedOptimisticPlaceholders(current, snapshot);
  const aligned = realignSnapshotIdsToStreamedTwins(swept, snapshot);
  return dedupeConfirmedUserMessagesByContent(mergeItemsInIncomingOrder(swept, aligned));
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
  return current.filter((item) => {
    if (!isLocalUserMessage(item)) return true;
    return !confirmedUserMessages.some((confirmed) => optimisticUserMessageConfirmedBy(item, confirmed));
  });
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

function activeTurnsFromThread(thread: Thread): Record<string, string> {
  let activeTurn: { id?: string } | null = null;
  for (const turn of thread.turns ?? []) {
    if (isTurnStatusInProgress(turn.status)) {
      activeTurn = turn;
    }
  }
  return activeTurn?.id ? { [thread.id]: activeTurn.id } : {};
}

function isTurnStatusInProgress(status: unknown): boolean {
  const value = turnStatusText(status);
  return value === "inProgress" || value === "running" || value === "active";
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
  const stamped = turnId ? attachTurnId(item, turnId) : item;
  const next = mergeItems(current, [stamped], order);
  return threadRuntimePatch(state, threadId, {
    turnOrder: turnId ? order : runtime.turnOrder,
    items: next,
  });
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
  const replacement: AccumulatedThreadItem = {
    ...optimistic,
    ...(incoming as AccumulatedThreadItem),
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

function appendCommandTerminalInteraction(state: CodexUiState, params: Record<string, unknown>): CodexUiState {
  const threadId = String(params.threadId ?? "");
  const itemId = String(params.itemId ?? "");
  const stdin = String(params.stdin ?? "");
  if (!threadId || !itemId || !stdin) return state;
  const items = selectThreadRuntime(state, threadId).items;
  let found = false;
  const next = items.map((item) => {
    if (item.id !== itemId) return item;
    found = true;
    const terminalInteractions = (item as Record<string, unknown>).terminalInteractions;
    const previous = Array.isArray(terminalInteractions)
      ? terminalInteractions
      : [];
    return {
      ...item,
      type: item.type || "commandExecution",
      terminalInteractions: [
        ...previous,
        {
          processId: String(params.processId ?? ""),
          stdin,
        },
      ],
    };
  });
  if (!found) {
    next.push({
      id: itemId,
      type: "commandExecution",
      command: "command",
      terminalInteractions: [{ processId: String(params.processId ?? ""), stdin }],
    });
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

function ensureReasoningPart(
  state: CodexUiState,
  params: Record<string, unknown>,
  field: "content" | "summary",
  indexField: "contentIndex" | "summaryIndex",
): CodexUiState {
  const threadId = String(params.threadId ?? "");
  const itemId = String(params.itemId ?? "");
  if (!threadId || !itemId) return state;
  return updateReasoningParts(state, threadId, itemId, field, numberParam(params, indexField), "", turnIdParam(params));
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
    ? mergeItems(turnItemsWithWorkedFor(turn), [streamErrorItem(turnId, turnError, errorText)], order)
    : turnItemsWithWorkedFor(turn);
  const currentItems = runtime.items;
  const nextItems = turnId
    ? replaceTurnSegment(currentItems, turnId, terminalSegment, order)
    : mergeItemsInIncomingOrder(currentItems, terminalSegment);
  return {
    ...state,
    threads: state.threads.map((thread) =>
      thread.id === threadId ? { ...thread, status: terminalThreadStatusFromTurn(turnStatus, Boolean(errorText)) } : thread,
    ),
    threadsRuntime: {
      ...state.threadsRuntime,
      [threadId]: normalizeThreadRuntime({
        ...runtime,
        activeTurnId: nextActiveTurnId,
        turnOrder: order,
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

  const stamped = segment.map((item) => attachTurnId(item, turnId));
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

  // Final guard: collapse duplicate confirmed userMessages by content key.
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
    if (seenKeys.has(key)) continue;
    seenKeys.add(key);
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
