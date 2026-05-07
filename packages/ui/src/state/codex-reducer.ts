import type {
  JsonRpcNotification,
  JsonRpcRequest,
  ModelConfig,
  RequestId,
  TeamSummary,
  Thread,
  ThreadActiveFlag,
  ThreadStatus,
  ThreadItem,
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
  | { type: "notification"; message: JsonRpcNotification }
  | { type: "serverRequest"; request: JsonRpcRequest }
  | { type: "resolveServerRequest"; id: RequestId }
  | { type: "log"; text: string; level?: "info" | "warn" | "error" }
  | { type: "setModels"; models: ModelConfig[] }
  | { type: "upsertModel"; model: ModelConfig }
  | { type: "setThreadContextDefaults"; context: ThreadContextDefaults | null }
  | { type: "setTeams"; teams: TeamSummary[] }
  | { type: "setActiveTeam"; teamId: string | null };

export const initialCodexUiState: CodexUiState = {
  connected: false,
  connecting: false,
  hostStatus: null,
  threads: [],
  activeThreadId: null,
  activeTurnIdsByThread: {},
  itemsByThread: {},
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
      const { [action.threadId]: _removedPlan, ...turnPlansByThread } = state.turnPlansByThread;
      const { [action.threadId]: _removedDiff, ...turnDiffsByThread } = state.turnDiffsByThread;
      return {
        ...state,
        threads: nextThreads,
        itemsByThread,
        turnPlansByThread,
        activeTurnIdsByThread,
        turnDiffsByThread,
        activeThreadId: state.activeThreadId === action.threadId ? nextThreads[0]?.id ?? null : state.activeThreadId,
      };
    }
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
    default:
      return state;
  }
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

function applyNotification(state: CodexUiState, message: JsonRpcNotification): CodexUiState {
  const params = (message.params ?? {}) as Record<string, unknown>;
  switch (message.method) {
    case "error":
      return applyErrorNotification(state, params);
    case "thread/started": {
      const thread = params.thread as Thread | undefined;
      if (!thread?.id) return state;
      return {
        ...state,
        threads: upsertThread(state.threads, thread),
        activeThreadId: state.activeThreadId ?? thread.id,
        activeTurnIdsByThread: {
          ...state.activeTurnIdsByThread,
          ...activeTurnsFromThread(thread),
        },
        itemsByThread: {
          ...state.itemsByThread,
          [thread.id]: collectThreadItems(thread),
        },
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
      const { [threadId]: _removedPlan, ...turnPlansByThread } = state.turnPlansByThread;
      const { [threadId]: _removedDiff, ...turnDiffsByThread } = state.turnDiffsByThread;
      return {
        ...state,
        threads: nextThreads,
        itemsByThread,
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
      const turn = params.turn as { id?: string; items?: ThreadItem[]; threadId?: string } | undefined;
      const threadId = String(params.threadId ?? turn?.threadId ?? state.activeThreadId ?? "");
      if (!threadId) return state;
      return {
        ...state,
        activeThreadId: state.activeThreadId ?? threadId,
        activeTurnIdsByThread: turn?.id ? {
          ...state.activeTurnIdsByThread,
          [threadId]: turn.id,
        } : state.activeTurnIdsByThread,
        itemsByThread: {
          ...state.itemsByThread,
          [threadId]: mergeItems(state.itemsByThread[threadId] ?? [], turn?.items ?? []),
        },
      };
    }
    case "item/started":
    case "item/completed": {
      const threadId = String(params.threadId ?? "");
      const item = params.item as ThreadItem | undefined;
      if (!threadId || !item?.id) return state;
      return upsertItem(state, threadId, item);
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
  return {
    ...logged,
    threads: logged.threads.map((thread) =>
      thread.id === threadId ? { ...thread, status: { type: "systemError" } } : thread,
    ),
    itemsByThread: {
      ...logged.itemsByThread,
      [threadId]: mergeItems(logged.itemsByThread[threadId] ?? [], [streamErrorItem(turnId, error, text)]),
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
  return {
    ...state,
    threads: upsertThread(state.threads, thread),
    activeThreadId: select ? thread.id : state.activeThreadId ?? thread.id,
    activeTurnIdsByThread: {
      ...state.activeTurnIdsByThread,
      ...activeTurns,
    },
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
  };
}

function collectThreadItems(thread: Thread): AccumulatedThreadItem[] {
  return (thread.turns ?? []).flatMap((turn) => turn.items ?? []);
}

function mergeLiveThreadSnapshotItems(
  current: AccumulatedThreadItem[],
  snapshot: Array<AccumulatedThreadItem | ThreadItem>,
): AccumulatedThreadItem[] {
  const byId = new Map(snapshot.map((item) => [item.id, item as AccumulatedThreadItem]));
  for (const item of current) {
    const existing = byId.get(item.id);
    byId.set(item.id, existing ? { ...existing, ...item } : item);
  }
  return Array.from(byId.values());
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

function upsertItem(state: CodexUiState, threadId: string, item: ThreadItem): CodexUiState {
  const current = state.itemsByThread[threadId] ?? [];
  return {
    ...state,
    itemsByThread: {
      ...state.itemsByThread,
      [threadId]: mergeItems(current, [item]),
    },
  };
}

function mergeItems(
  current: AccumulatedThreadItem[],
  incoming: Array<AccumulatedThreadItem | ThreadItem>,
): AccumulatedThreadItem[] {
  const byId = new Map(current.map((item) => [item.id, item]));
  for (const item of incoming) {
    const existing = byId.get(item.id);
    byId.set(item.id, existing?.type === "userMessage" ? existing : { ...(existing ?? {}), ...item });
  }
  return Array.from(byId.values());
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
    return { ...item, type: item.type || expectedType, [field]: previous + delta };
  });
  if (!found) {
    next.push({ id: itemId, type: expectedType, [field]: delta });
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
  const turn = params.turn as { id?: string; items?: ThreadItem[]; threadId?: string; status?: unknown; error?: unknown } | undefined;
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
  const terminalItems = errorText
    ? mergeItems(turn?.items ?? [], [streamErrorItem(turnId, turnError, errorText)])
    : turn?.items ?? [];
  return {
    ...state,
    activeTurnIdsByThread: nextActiveTurns,
    threads: state.threads.map((thread) =>
      thread.id === threadId ? { ...thread, status: terminalThreadStatusFromTurn(turnStatus, Boolean(errorText)) } : thread,
    ),
    itemsByThread: {
      ...state.itemsByThread,
      [threadId]: mergeItems(state.itemsByThread[threadId] ?? [], terminalItems),
    },
  };
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
