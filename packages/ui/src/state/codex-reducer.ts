import type {
  JsonRpcNotification,
  JsonRpcRequest,
  ModelConfig,
  RequestId,
  TeamSummary,
  Thread,
  ThreadItem,
} from "@hicodex/codex-protocol";
import type { HostStatus } from "../lib/tauri-host";

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

export interface CodexUiState {
  connected: boolean;
  connecting: boolean;
  hostStatus: HostStatus | null;
  threads: Thread[];
  activeThreadId: string | null;
  activeTurnIdsByThread: Record<string, string>;
  itemsByThread: Record<string, ThreadItem[]>;
  turnDiffsByThread: Record<string, string>;
  pendingRequests: PendingServerRequest[];
  logs: LogLine[];
  models: ModelConfig[];
  teams: TeamSummary[];
  activeTeamId: string | null;
}

export type CodexUiAction =
  | { type: "connecting"; value: boolean }
  | { type: "connected"; value: boolean }
  | { type: "hostStatus"; status: HostStatus }
  | { type: "setThreads"; threads: Thread[] }
  | { type: "setActiveThread"; threadId: string | null }
  | { type: "removeThread"; threadId: string }
  | { type: "notification"; message: JsonRpcNotification }
  | { type: "serverRequest"; request: JsonRpcRequest }
  | { type: "resolveServerRequest"; id: RequestId }
  | { type: "log"; text: string; level?: "info" | "warn" | "error" }
  | { type: "setModels"; models: ModelConfig[] }
  | { type: "upsertModel"; model: ModelConfig }
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
  turnDiffsByThread: {},
  pendingRequests: [],
  logs: [],
  models: [],
  teams: [],
  activeTeamId: null,
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
        activeThreadId: state.activeThreadId ?? action.threads[0]?.id ?? null,
      };
    case "setActiveThread":
      return { ...state, activeThreadId: action.threadId };
    case "removeThread": {
      const nextThreads = state.threads.filter((thread) => thread.id !== action.threadId);
      const { [action.threadId]: _removed, ...itemsByThread } = state.itemsByThread;
      const { [action.threadId]: _removedTurn, ...activeTurnIdsByThread } = state.activeTurnIdsByThread;
      const { [action.threadId]: _removedDiff, ...turnDiffsByThread } = state.turnDiffsByThread;
      return {
        ...state,
        threads: nextThreads,
        itemsByThread,
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
          ...state.pendingRequests,
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
    case "thread/started": {
      const thread = params.thread as Thread | undefined;
      if (!thread?.id) return state;
      return {
        ...state,
        threads: upsertThread(state.threads, thread),
        activeThreadId: thread.id,
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
          thread.id === threadId ? { ...thread, status: params.status ?? thread.status } : thread,
        ),
      };
    }
    case "thread/name/updated": {
      const threadId = String(params.threadId ?? "");
      if (!threadId) return state;
      return {
        ...state,
        threads: state.threads.map((thread) =>
          thread.id === threadId ? { ...thread, name: stringParam(params, "threadName") || thread.name } : thread,
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
      const { [threadId]: _removedDiff, ...turnDiffsByThread } = state.turnDiffsByThread;
      return {
        ...state,
        threads: nextThreads,
        itemsByThread,
        activeTurnIdsByThread,
        turnDiffsByThread,
        activeThreadId: state.activeThreadId === threadId ? nextThreads[0]?.id ?? null : state.activeThreadId,
      };
    }
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

function upsertThread(threads: Thread[], thread: Thread): Thread[] {
  return [thread, ...threads.filter((item) => item.id !== thread.id)];
}

function logNotificationIfUseful(state: CodexUiState, message: JsonRpcNotification): CodexUiState {
  const params = (message.params ?? {}) as Record<string, unknown>;
  switch (message.method) {
    case "error": {
      const error = params.error as Record<string, unknown> | undefined;
      const text = stringParam(error, "message") || formatUnknownForLog(params);
      const retryText = params.willRetry === true ? " (will retry)" : "";
      return prependLog(state, `${text}${retryText}`, "error");
    }
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

function collectThreadItems(thread: Thread): ThreadItem[] {
  return (thread.turns ?? []).flatMap((turn) => turn.items ?? []);
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

function mergeItems(current: ThreadItem[], incoming: ThreadItem[]): ThreadItem[] {
  const byId = new Map(current.map((item) => [item.id, item]));
  for (const item of incoming) {
    const existing = byId.get(item.id);
    byId.set(item.id, existing?.type === "userMessage" ? existing : { ...(existing ?? {}), ...item } as ThreadItem);
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
    return { ...item, type: item.type || expectedType, [field]: previous + delta } as ThreadItem;
  });
  if (!found) {
    next.push({ id: itemId, type: expectedType, [field]: delta } as ThreadItem);
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
    return { ...item, type: item.type || expectedType, ...fields } as ThreadItem;
  });
  if (!found) {
    next.push({ id: itemId, type: expectedType, ...fields } as ThreadItem);
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
    } as ThreadItem;
  });
  if (!found) {
    next.push({
      id: itemId,
      type: "commandExecution",
      command: "command",
      terminalInteractions: [{ processId: String(params.processId ?? ""), stdin }],
    } as ThreadItem);
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
    return { ...item, type: "reasoning", [field]: parts } as ThreadItem;
  });
  if (!found) {
    const parts: string[] = [];
    while (parts.length <= index) parts.push("");
    parts[index] = delta;
    next.push({ id: itemId, type: "reasoning", [field]: parts } as ThreadItem);
  }
  return { ...state, itemsByThread: { ...state.itemsByThread, [threadId]: next } };
}

function reasoningParts(item: ThreadItem, field: "content" | "summary"): string[] {
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
  const turnId = String(params.turnId ?? "");
  const plan = Array.isArray(params.plan) ? params.plan : [];
  if (!threadId || !turnId) return state;
  return upsertItem(state, threadId, {
    id: `todo-list:${turnId}`,
    type: "todo-list",
    turnId,
    explanation: typeof params.explanation === "string" ? params.explanation : null,
    plan,
  } as ThreadItem);
}

function finishTurn(
  state: CodexUiState,
  params: Record<string, unknown>,
  fallbackStatus: "completed" | "failed" | "interrupted",
): CodexUiState {
  const turn = params.turn as { id?: string; items?: ThreadItem[]; threadId?: string; status?: unknown } | undefined;
  const threadId = String(params.threadId ?? turn?.threadId ?? state.activeThreadId ?? "");
  const turnId = String(params.turnId ?? turn?.id ?? "");
  if (!threadId) return state;

  const nextActiveTurns = { ...state.activeTurnIdsByThread };
  if (!turnId || nextActiveTurns[threadId] === turnId) {
    delete nextActiveTurns[threadId];
  }

  const turnStatus = turnStatusText(turn?.status) || fallbackStatus;
  return {
    ...state,
    activeTurnIdsByThread: nextActiveTurns,
    threads: state.threads.map((thread) =>
      thread.id === threadId ? { ...thread, status: threadStatusToThreadStatus(turnStatus) } : thread,
    ),
    itemsByThread: {
      ...state.itemsByThread,
      [threadId]: mergeItems(state.itemsByThread[threadId] ?? [], turn?.items ?? []),
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

function threadStatusToThreadStatus(turnStatus: string): unknown {
  if (turnStatus === "failed") return "failed";
  if (turnStatus === "interrupted") return "interrupted";
  return "idle";
}
