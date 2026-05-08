import type {
  CollaborationMode,
  JsonRpcNotification,
  JsonRpcRequest,
  ModelConfig,
  RequestId,
  TeamSummary,
  Thread,
  ThreadActiveFlag,
  ThreadStatus,
  ThreadItem,
  UserInput,
} from "@hicodex/codex-protocol";
import type { HostStatus } from "../lib/tauri-host";
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

export interface CodexUiState {
  connected: boolean;
  connecting: boolean;
  hostStatus: HostStatus | null;
  threads: Thread[];
  activeThreadId: string | null;
  activeTurnIdsByThread: Record<string, string>;
  itemsByThread: Record<string, AccumulatedThreadItem[]>;
  /**
   * Per-thread ordered list of turn ids. Mirrors the per-turn `turn.items` model used
   * by the shipped Codex Desktop webview (see asar `app-server-manager-signals` /
   * `local-conversation-thread`). New items are placed inside their turn segment
   * instead of being blindly appended to a flat array.
   */
  turnOrderByThread: Record<string, string[]>;
  /**
   * FIFO queue of optimistic local turn ids per thread. The head is bound to the
   * real `turnId` reported by the next `turn/started` notification on that thread.
   */
  pendingOptimisticTurnsByThread: Record<string, string[]>;
  latestCollaborationModesByThread: Record<string, CollaborationMode>;
  turnPlansByThread: Record<string, TurnPlanSnapshot>;
  turnDiffsByThread: Record<string, string>;
  pendingRequests: PendingServerRequest[];
  logs: LogLine[];
  models: ModelConfig[];
  teams: TeamSummary[];
  activeTeamId: string | null;
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
  | { type: "notification"; message: JsonRpcNotification }
  | { type: "serverRequest"; request: JsonRpcRequest }
  | { type: "resolveServerRequest"; id: RequestId }
  | { type: "log"; text: string; level?: "info" | "warn" | "error" }
  | { type: "setModels"; models: ModelConfig[] }
  | { type: "upsertModel"; model: ModelConfig }
  | { type: "setThreadContextDefaults"; context: ThreadContextDefaults | null }
  | { type: "setTeams"; teams: TeamSummary[] }
  | { type: "setActiveTeam"; teamId: string | null }
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
  activeTurnIdsByThread: {},
  itemsByThread: {},
  turnOrderByThread: {},
  pendingOptimisticTurnsByThread: {},
  latestCollaborationModesByThread: {},
  turnPlansByThread: {},
  turnDiffsByThread: {},
  pendingRequests: [],
  logs: [],
  models: [],
  teams: [],
  activeTeamId: null,
  threadContextDefaults: null,
};

export function codexUiReducer(state: CodexUiState, action: CodexUiAction): CodexUiState {
  switch (action.type) {
    case "connecting":
      return { ...state, connecting: action.value };
    case "connected":
      return { ...state, connected: action.value, connecting: false };
    case "hostStatus":
      return { ...state, hostStatus: action.status, connected: action.status.running };
    case "setThreads":
      return {
        ...state,
        threads: action.threads,
        activeThreadId: nextActiveThreadId(state.activeThreadId, action.threads),
      };
    case "upsertThread":
      return upsertThreadState(state, action.thread, action.select === true);
    case "setActiveThread":
      return { ...state, activeThreadId: action.threadId };
    case "removeThread": {
      const nextThreads = state.threads.filter((thread) => thread.id !== action.threadId);
      const { [action.threadId]: _removed, ...itemsByThread } = state.itemsByThread;
      const { [action.threadId]: _removedTurn, ...activeTurnIdsByThread } = state.activeTurnIdsByThread;
      const { [action.threadId]: _removedOrder, ...turnOrderByThread } = state.turnOrderByThread;
      const { [action.threadId]: _removedPending, ...pendingOptimisticTurnsByThread } = state.pendingOptimisticTurnsByThread;
      const { [action.threadId]: _removedCollaborationMode, ...latestCollaborationModesByThread } =
        state.latestCollaborationModesByThread;
      const { [action.threadId]: _removedPlan, ...turnPlansByThread } = state.turnPlansByThread;
      const { [action.threadId]: _removedDiff, ...turnDiffsByThread } = state.turnDiffsByThread;
      return {
        ...state,
        threads: nextThreads,
        itemsByThread,
        turnOrderByThread,
        pendingOptimisticTurnsByThread,
        latestCollaborationModesByThread,
        turnPlansByThread,
        activeTurnIdsByThread,
        turnDiffsByThread,
        activeThreadId: state.activeThreadId === action.threadId ? nextThreads[0]?.id ?? null : state.activeThreadId,
      };
    }
    case "setLatestCollaborationMode":
      return setLatestCollaborationModeState(state, action.threadId, action.collaborationMode);
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
    case "setTeams":
      return { ...state, teams: action.teams, activeTeamId: state.activeTeamId ?? action.teams[0]?.id ?? null };
    case "setActiveTeam":
      return { ...state, activeTeamId: action.teamId };
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

function applyOptimisticUserMessage(
  state: CodexUiState,
  action: Extract<CodexUiAction, { type: "optimisticUserMessage" }>,
): CodexUiState {
  const { threadId, localTurnId, localId, content } = action;
  if (!threadId || !localTurnId || !localId) return state;

  // Idempotency guard: don't add a second optimistic bubble for the same text
  // when one is already pending in this thread. Protects against quick
  // double-submits, retries, or redundant workflow paths re-dispatching.
  const existingItems = state.itemsByThread[threadId] ?? [];
  const incomingText = userInputContentText(content);
  if (incomingText) {
    for (const existing of existingItems) {
      if (existing.type !== "userMessage") continue;
      if (!localIdOf(existing)) continue;
      const existingText = userInputContentText((existing as Record<string, unknown>).content);
      if (existingText === incomingText) return state;
    }
  }

  const order = ensureTurnInOrder(state.turnOrderByThread[threadId] ?? [], localTurnId);
  const needsBinding = isOptimisticTurnPlaceholder(localTurnId);
  const pending = state.pendingOptimisticTurnsByThread[threadId] ?? [];
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
  const items = state.itemsByThread[threadId] ?? [];
  return {
    ...state,
    turnOrderByThread: { ...state.turnOrderByThread, [threadId]: order },
    pendingOptimisticTurnsByThread: {
      ...state.pendingOptimisticTurnsByThread,
      [threadId]: nextPending,
    },
    itemsByThread: {
      ...state.itemsByThread,
      [threadId]: placeItemInTurn(items, item, order),
    },
  };
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
  const queue = state.pendingOptimisticTurnsByThread[threadId];
  if (!queue || queue.length === 0) return state;
  const head = queue[0];
  if (!head || head === turnId) {
    return {
      ...state,
      pendingOptimisticTurnsByThread: {
        ...state.pendingOptimisticTurnsByThread,
        [threadId]: queue.slice(1),
      },
    };
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
  const order = state.turnOrderByThread[threadId];
  if (!order || !order.includes(localTurnId)) {
    const pendingQueue = (state.pendingOptimisticTurnsByThread[threadId] ?? []).filter((id) => id !== localTurnId);
    return {
      ...state,
      pendingOptimisticTurnsByThread: {
        ...state.pendingOptimisticTurnsByThread,
        [threadId]: pendingQueue,
      },
    };
  }
  const rebound = order.map((id) => (id === localTurnId ? turnId : id));
  const dedup: string[] = [];
  for (const id of rebound) if (!dedup.includes(id)) dedup.push(id);
  const items = state.itemsByThread[threadId] ?? [];
  // If the target turn already has a confirmed userMessage with the same
  // content, drop the placeholder instead of rebinding to avoid duplicate
  // bubbles when the server echoed the user message before this binding ran.
  const confirmedTextsInTurn = new Set<string>();
  for (const item of items) {
    if (item.type !== "userMessage") continue;
    if (turnIdOf(item) !== turnId) continue;
    if (localIdOf(item)) continue;
    const text = userInputContentText((item as Record<string, unknown>).content);
    if (text) confirmedTextsInTurn.add(text);
  }
  const next: AccumulatedThreadItem[] = [];
  for (const item of items) {
    if (turnIdOf(item) !== localTurnId) {
      next.push(item);
      continue;
    }
    if (item.type === "userMessage" && localIdOf(item)) {
      const text = userInputContentText((item as Record<string, unknown>).content);
      if (text && confirmedTextsInTurn.has(text)) continue;
    }
    next.push({ ...item, _turnId: turnId });
  }
  const pending = (state.pendingOptimisticTurnsByThread[threadId] ?? []).filter((id) => id !== localTurnId);
  return {
    ...state,
    turnOrderByThread: { ...state.turnOrderByThread, [threadId]: dedup },
    pendingOptimisticTurnsByThread: {
      ...state.pendingOptimisticTurnsByThread,
      [threadId]: pending,
    },
    itemsByThread: { ...state.itemsByThread, [threadId]: next },
  };
}

function applyDropOptimisticUserMessage(
  state: CodexUiState,
  action: Extract<CodexUiAction, { type: "dropOptimisticUserMessage" }>,
): CodexUiState {
  const { threadId, localId } = action;
  if (!threadId || !localId) return state;
  const items = state.itemsByThread[threadId] ?? [];
  const target = items.find((item) => localIdOf(item) === localId);
  if (!target) return state;
  const filtered = items.filter((item) => item !== target);
  const turnId = turnIdOf(target);
  const order = state.turnOrderByThread[threadId] ?? [];
  const stillUsesTurn = turnId
    ? filtered.some((item) => turnIdOf(item) === turnId)
    : false;
  const nextOrder = turnId && !stillUsesTurn ? order.filter((id) => id !== turnId) : order;
  const pending = turnId && !stillUsesTurn
    ? (state.pendingOptimisticTurnsByThread[threadId] ?? []).filter((id) => id !== turnId)
    : (state.pendingOptimisticTurnsByThread[threadId] ?? []);
  return {
    ...state,
    turnOrderByThread: { ...state.turnOrderByThread, [threadId]: nextOrder },
    pendingOptimisticTurnsByThread: {
      ...state.pendingOptimisticTurnsByThread,
      [threadId]: pending,
    },
    itemsByThread: { ...state.itemsByThread, [threadId]: filtered },
  };
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
  if (!collaborationMode) {
    const { [threadId]: _removed, ...latestCollaborationModesByThread } = state.latestCollaborationModesByThread;
    return { ...state, latestCollaborationModesByThread };
  }
  return {
    ...state,
    latestCollaborationModesByThread: {
      ...state.latestCollaborationModesByThread,
      [threadId]: collaborationMode,
    },
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
      const currentItems = state.itemsByThread[thread.id] ?? [];
      const activeTurns = activeTurnsFromThread(thread);
      const hasLiveTurn = Boolean(state.activeTurnIdsByThread[thread.id] ?? activeTurns[thread.id]);
      return {
        ...state,
        threads: upsertThread(state.threads, thread),
        activeThreadId: state.activeThreadId ?? thread.id,
        activeTurnIdsByThread: {
          ...state.activeTurnIdsByThread,
          ...activeTurns,
        },
        turnOrderByThread: {
          ...state.turnOrderByThread,
          [thread.id]: turnOrderFromThread(thread, state.turnOrderByThread[thread.id]),
        },
        itemsByThread: snapshotItems.length > 0
          ? {
              ...state.itemsByThread,
              [thread.id]: hasLiveTurn
                ? mergeLiveThreadSnapshotItems(currentItems, snapshotItems)
                : snapshotItems,
            }
          : state.itemsByThread,
      };
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
      const { [threadId]: _removed, ...itemsByThread } = state.itemsByThread;
      const { [threadId]: _removedTurn, ...activeTurnIdsByThread } = state.activeTurnIdsByThread;
      const { [threadId]: _removedOrder, ...turnOrderByThread } = state.turnOrderByThread;
      const { [threadId]: _removedPending, ...pendingOptimisticTurnsByThread } = state.pendingOptimisticTurnsByThread;
      const { [threadId]: _removedCollaborationMode, ...latestCollaborationModesByThread } =
        state.latestCollaborationModesByThread;
      const { [threadId]: _removedPlan, ...turnPlansByThread } = state.turnPlansByThread;
      const { [threadId]: _removedDiff, ...turnDiffsByThread } = state.turnDiffsByThread;
      return {
        ...state,
        threads: nextThreads,
        itemsByThread,
        turnOrderByThread,
        pendingOptimisticTurnsByThread,
        latestCollaborationModesByThread,
        turnPlansByThread,
        activeTurnIdsByThread,
        turnDiffsByThread,
        activeThreadId: state.activeThreadId === threadId ? nextThreads[0]?.id ?? null : state.activeThreadId,
      };
    }
    case "thread/unarchived": {
      const threadId = String(params.threadId ?? "");
      if (!threadId) return state;
      return prependLog(state, `thread unarchived: ${shortThreadId(threadId)}`);
    }
    case "thread/tokenUsage/updated":
      return state;
    case "turn/started": {
      const turn = params.turn as TurnLike | undefined;
      const threadId = String(params.threadId ?? turn?.threadId ?? state.activeThreadId ?? "");
      if (!threadId) return state;
      const baseState: CodexUiState = turn?.id
        ? bindNextOptimisticTurn(state, threadId, turn.id)
        : state;
      const order = ensureTurnInOrder(baseState.turnOrderByThread[threadId] ?? [], turn?.id ?? null);
      return {
        ...baseState,
        activeThreadId: baseState.activeThreadId ?? threadId,
        activeTurnIdsByThread: turn?.id ? {
          ...baseState.activeTurnIdsByThread,
          [threadId]: turn.id,
        } : baseState.activeTurnIdsByThread,
        turnOrderByThread: { ...baseState.turnOrderByThread, [threadId]: order },
        itemsByThread: {
          ...baseState.itemsByThread,
          [threadId]: mergeItems(baseState.itemsByThread[threadId] ?? [], turnItemsWithWorkedFor(turn), order),
        },
      };
    }
    case "item/started":
    case "item/completed": {
      const threadId = String(params.threadId ?? "");
      const turnIdParam = typeof params.turnId === "string" && params.turnId.length > 0 ? params.turnId : null;
      const item = params.item as ThreadItem | undefined;
      if (!threadId || !item?.id) return state;
      const itemWithStatus = message.method === "item/completed"
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
      return {
        ...state,
        turnDiffsByThread: {
          ...state.turnDiffsByThread,
          [threadId]: diff,
        },
      };
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
  const order = ensureTurnInOrder(logged.turnOrderByThread[threadId] ?? [], turnId || null);
  return {
    ...logged,
    turnOrderByThread: { ...logged.turnOrderByThread, [threadId]: order },
    threads: logged.threads.map((thread) =>
      thread.id === threadId ? { ...thread, status: { type: "systemError" } } : thread,
    ),
    itemsByThread: {
      ...logged.itemsByThread,
      [threadId]: mergeItems(logged.itemsByThread[threadId] ?? [], [streamErrorItem(turnId, error, text)], order),
    },
  };
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
  const currentItems = state.itemsByThread[thread.id] ?? [];
  const activeTurns = activeTurnsFromThread(thread);
  const hasLiveTurn = Boolean(state.activeTurnIdsByThread[thread.id] ?? activeTurns[thread.id]);
  const nextTurnOrder = thread.turns
    ? turnOrderFromThread(thread, state.turnOrderByThread[thread.id])
    : state.turnOrderByThread[thread.id];
  return {
    ...state,
    threads: upsertThread(state.threads, thread),
    activeThreadId: select ? thread.id : state.activeThreadId ?? thread.id,
    activeTurnIdsByThread: {
      ...state.activeTurnIdsByThread,
      ...activeTurns,
    },
    turnOrderByThread: nextTurnOrder
      ? { ...state.turnOrderByThread, [thread.id]: nextTurnOrder }
      : state.turnOrderByThread,
    itemsByThread: thread.turns
      ? {
          ...state.itemsByThread,
          [thread.id]: hasLiveTurn
            ? mergeLiveThreadSnapshotItems(currentItems, snapshotItems)
            : snapshotItems,
        }
      : state.itemsByThread,
  };
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
  return attachTurnIdToAll(normalized, turn.id);
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
  return mergeItemsInIncomingOrder(swept, snapshot);
}

/**
 * Drop optimistic user placeholders whose content has already been confirmed by
 * the server-side snapshot. Without this, every thread re-read (for example
 * after switching threads and switching back) would leave the local
 * placeholder around alongside the server-confirmed userMessage and the
 * transcript would gain a duplicate bubble per round-trip.
 */
function dropConfirmedOptimisticPlaceholders(
  current: AccumulatedThreadItem[],
  snapshot: Array<AccumulatedThreadItem | ThreadItem>,
): AccumulatedThreadItem[] {
  const confirmedTexts = new Set<string>();
  for (const item of snapshot) {
    if ((item as Record<string, unknown>).type !== "userMessage") continue;
    if (localIdOf(item)) continue;
    const text = userInputContentText((item as Record<string, unknown>).content);
    if (text) confirmedTexts.add(text);
  }
  if (confirmedTexts.size === 0) return current;
  return current.filter((item) => {
    if (item.type !== "userMessage") return true;
    if (!localIdOf(item)) return true;
    const text = userInputContentText((item as Record<string, unknown>).content);
    return !confirmedTexts.has(text);
  });
}

function activeTurnsFromThread(thread: Thread): Record<string, string> {
  let activeTurn: { id?: string } | null = null;
  for (const turn of thread.turns ?? []) {
    const status = turn.status;
    if (typeof status === "string" && status === "inProgress") {
      activeTurn = turn;
      continue;
    }
    if (!status || typeof status !== "object") continue;
    const record = status as Record<string, unknown>;
    if (record.type === "inProgress" || record.status === "inProgress") {
      activeTurn = turn;
    }
  }
  return activeTurn?.id ? { [thread.id]: activeTurn.id } : {};
}

function upsertItem(
  state: CodexUiState,
  threadId: string,
  item: ThreadItem,
  turnId?: string | null,
): CodexUiState {
  const current = state.itemsByThread[threadId] ?? [];
  const order = turnId
    ? ensureTurnInOrder(state.turnOrderByThread[threadId] ?? [], turnId)
    : (state.turnOrderByThread[threadId] ?? []);
  const stamped = turnId ? attachTurnId(item, turnId) : item;
  const next = mergeItems(current, [stamped], order);
  return {
    ...state,
    turnOrderByThread: turnId
      ? { ...state.turnOrderByThread, [threadId]: order }
      : state.turnOrderByThread,
    itemsByThread: { ...state.itemsByThread, [threadId]: next },
  };
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
  const current = state.itemsByThread[threadId] ?? [];
  const optimistic = findOptimisticUserMessage(current, turnId, (incoming as Record<string, unknown>).content);
  if (!optimistic) return state;
  const order = turnId
    ? ensureTurnInOrder(state.turnOrderByThread[threadId] ?? [], turnId)
    : (state.turnOrderByThread[threadId] ?? []);
  const replacement: AccumulatedThreadItem = {
    ...optimistic,
    ...(incoming as AccumulatedThreadItem),
    _turnId: turnId ?? turnIdOf(optimistic) ?? undefined,
    _localId: undefined,
  };
  delete (replacement as Record<string, unknown>)._localId;
  const next = current.map((item) => (item === optimistic ? replacement : item));
  return {
    ...state,
    turnOrderByThread: turnId
      ? { ...state.turnOrderByThread, [threadId]: order }
      : state.turnOrderByThread,
    itemsByThread: { ...state.itemsByThread, [threadId]: next },
  };
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
  const incomingText = userInputContentText(content);
  if (!incomingText) return null;
  if (turnId) {
    for (const item of items) {
      if (item.type !== "userMessage") continue;
      if (!localIdOf(item)) continue;
      if (turnIdOf(item) !== turnId) continue;
      const existingText = userInputContentText((item as Record<string, unknown>).content);
      if (existingText === incomingText) return item;
    }
  }
  for (const item of items) {
    if (item.type !== "userMessage") continue;
    if (!localIdOf(item)) continue;
    const existingText = userInputContentText((item as Record<string, unknown>).content);
    if (existingText === incomingText) return item;
  }
  return null;
}

function userInputContentText(value: unknown): string {
  if (!Array.isArray(value)) return "";
  return value
    .map((part) => {
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
  const items = state.itemsByThread[threadId] ?? [];
  let found = false;
  const next = items.map((item) => {
    if (item.id !== itemId) return item;
    found = true;
    const previous = String((item as Record<string, unknown>)[field] ?? "");
    return {
      ...item,
      type: item.type || expectedType,
      ...(expectedType === "agentMessage" && (item as Record<string, unknown>).completed !== true ? { completed: false } : {}),
      [field]: previous + delta,
    };
  });
  if (!found) {
    next.push({
      id: itemId,
      type: expectedType,
      ...(expectedType === "agentMessage" ? { completed: false } : {}),
      [field]: delta,
    });
  }
  return { ...state, itemsByThread: { ...state.itemsByThread, [threadId]: next } };
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
  const items = state.itemsByThread[threadId] ?? [];
  let found = false;
  const next = items.map((item) => {
    if (item.id !== itemId) return item;
    found = true;
    return { ...item, type: item.type || expectedType, ...fields };
  });
  if (!found) {
    next.push({ id: itemId, type: expectedType, ...fields });
  }
  return { ...state, itemsByThread: { ...state.itemsByThread, [threadId]: next } };
}

function appendCommandTerminalInteraction(state: CodexUiState, params: Record<string, unknown>): CodexUiState {
  const threadId = String(params.threadId ?? "");
  const itemId = String(params.itemId ?? "");
  const stdin = String(params.stdin ?? "");
  if (!threadId || !itemId || !stdin) return state;
  const items = state.itemsByThread[threadId] ?? [];
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
  return { ...state, itemsByThread: { ...state.itemsByThread, [threadId]: next } };
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
  return updateReasoningParts(state, threadId, itemId, field, numberParam(params, indexField), delta);
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
  return updateReasoningParts(state, threadId, itemId, field, numberParam(params, indexField), "");
}

function updateReasoningParts(
  state: CodexUiState,
  threadId: string,
  itemId: string,
  field: "content" | "summary",
  index: number,
  delta: string,
): CodexUiState {
  const items = state.itemsByThread[threadId] ?? [];
  let found = false;
  const next = items.map((item) => {
    if (item.id !== itemId) return item;
    found = true;
    const parts = reasoningParts(item, field);
    while (parts.length <= index) parts.push("");
    parts[index] = `${parts[index] ?? ""}${delta}`;
    return { ...item, type: "reasoning", [field]: parts };
  });
  if (!found) {
    const parts: string[] = [];
    while (parts.length <= index) parts.push("");
    parts[index] = delta;
    next.push({ id: itemId, type: "reasoning", [field]: parts });
  }
  return { ...state, itemsByThread: { ...state.itemsByThread, [threadId]: next } };
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
  return {
    ...state,
    turnPlansByThread: {
      ...state.turnPlansByThread,
      [threadId]: {
        threadId,
        turnId,
        explanation: typeof params.explanation === "string" ? params.explanation : null,
        plan,
        updatedAt: Date.now(),
      },
    },
  };
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

  const nextActiveTurns = { ...state.activeTurnIdsByThread };
  if (!turnId || nextActiveTurns[threadId] === turnId) {
    delete nextActiveTurns[threadId];
  }

  const turnStatus = turnStatusText(turn?.status) || fallbackStatus;
  const turnError = recordParam(turn?.error);
  const errorText = turnErrorMessage(turnError);
  const order = ensureTurnInOrder(state.turnOrderByThread[threadId] ?? [], turnId || null);
  const terminalSegment = errorText
    ? mergeItems(turnItemsWithWorkedFor(turn), [streamErrorItem(turnId, turnError, errorText)], order)
    : turnItemsWithWorkedFor(turn);
  const currentItems = state.itemsByThread[threadId] ?? [];
  const nextItems = turnId
    ? replaceTurnSegment(currentItems, turnId, terminalSegment, order)
    : mergeItemsInIncomingOrder(currentItems, terminalSegment);
  return {
    ...state,
    activeTurnIdsByThread: nextActiveTurns,
    turnOrderByThread: { ...state.turnOrderByThread, [threadId]: order },
    threads: state.threads.map((thread) =>
      thread.id === threadId ? { ...thread, status: terminalThreadStatusFromTurn(turnStatus, Boolean(errorText)) } : thread,
    ),
    itemsByThread: {
      ...state.itemsByThread,
      [threadId]: nextItems,
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

  // Drop optimistic user placeholders whose content was confirmed by the
  // snapshot under a real id, otherwise both the placeholder and the real
  // userMessage would coexist in the same turn segment.
  const confirmedTexts = new Set<string>();
  for (const item of stamped) {
    if ((item as Record<string, unknown>).type !== "userMessage") continue;
    if (localIdOf(item)) continue;
    const text = userInputContentText((item as Record<string, unknown>).content);
    if (text) confirmedTexts.add(text);
  }
  if (confirmedTexts.size > 0) {
    inSegment = inSegment.filter((item) => {
      if (item.type !== "userMessage") return true;
      if (!localIdOf(item)) return true;
      const text = userInputContentText((item as Record<string, unknown>).content);
      return !confirmedTexts.has(text);
    });
  }

  const inSegmentIds = new Set(inSegment.map((item) => item.id));
  for (const item of stamped) {
    if (inSegmentIds.has(item.id)) continue;
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

  return [...before, ...inSegment, ...after];
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
