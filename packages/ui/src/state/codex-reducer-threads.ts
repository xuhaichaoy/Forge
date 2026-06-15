// Thread-domain handlers of the Codex UI reducer (mechanically extracted from
// codex-reducer.ts, logic verbatim): thread lifecycle/snapshot upserts,
// per-thread composer-mode state, thread settings/goal/hook/token-usage
// notifications, and thread-status normalization.
import type {
  CollaborationMode,
  Thread,
  ThreadActiveFlag,
  ThreadGoal,
  ThreadItem,
  ThreadStatus,
} from "@forge/codex-protocol";
import { stringField } from "../lib/format";
import { enrichMultiAgentReceiverThreads } from "./collab-receiver-projection";
import { turnIdOf } from "./codex-reducer-item-helpers";
import { upsertItem } from "./codex-reducer-items";
import {
  normalizeThreadRuntime,
  prependLog,
  pruneTerminalInputBuffersForThread,
  recordParam,
  selectThreadRuntime,
  threadRuntimePatch,
  turnIdParam,
  withActiveComposerMode,
} from "./codex-reducer-runtime";
import {
  mergeLiveThreadSnapshotItems,
  pruneUnusedOptimisticTurnState,
} from "./codex-reducer-snapshot-merge";
import {
  collectThreadItems,
  isTerminalTurnStatus,
  isTurnStatusInProgress,
} from "./codex-reducer-turns";
import type { CodexUiState, ThreadRuntimeSlice } from "./codex-ui-types";
import type { ComposerMode } from "./composer-workflow";
import { shortThreadId } from "./notification-log-format";
import type { AccumulatedThreadItem } from "./render-group-types";
import { isThreadStatusInProgress } from "./thread-item-fields";
import { clearThreadGoalProjection } from "./thread-item-status-projection";
import {
  collaborationModeParam,
  mergeThreadContextDefaults,
  threadContextDefaultsFromThreadSettings,
} from "./thread-settings-projection";
import { tokenUsageRuntimePatch } from "./thread-token-usage";

export function setLatestCollaborationModeState(
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

export function setActiveComposerModeState(state: CodexUiState, mode: ComposerMode): CodexUiState {
  if (!state.activeThreadId) return { ...state, composerMode: mode };
  return {
    ...threadRuntimePatch(state, state.activeThreadId, { composerMode: mode }),
    composerMode: mode,
  };
}

export function resetThreadComposerModeState(state: CodexUiState, threadId: string): CodexUiState {
  if (!threadId.trim()) return state;
  const next = threadRuntimePatch(state, threadId, { composerMode: "default" });
  return state.activeThreadId === threadId ? { ...next, composerMode: "default" } : next;
}

export function markThreadsNeedResumeAfterReconnectState(state: CodexUiState): CodexUiState {
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

// --- thread-domain notification handlers -------------------------------------

export function handleThreadStartedNotification(state: CodexUiState, params: Record<string, unknown>): CodexUiState {
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

export function handleThreadStatusChangedNotification(state: CodexUiState, params: Record<string, unknown>): CodexUiState {
  const threadId = String(params.threadId ?? "");
  if (!threadId) return state;
  return {
    ...state,
    threads: state.threads.map((thread) =>
      thread.id === threadId ? { ...thread, status: normalizeThreadStatus(params.status, thread.status) } : thread,
    ),
  };
}

export function handleThreadNameUpdatedNotification(state: CodexUiState, params: Record<string, unknown>): CodexUiState {
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

// Shared by `thread/archived` and `thread/closed`: drop the thread + its runtime
// slice and re-home the active selection.
export function handleThreadRemovedNotification(state: CodexUiState, params: Record<string, unknown>): CodexUiState {
  const threadId = String(params.threadId ?? "");
  if (!threadId) return state;
  const nextThreads = state.threads.filter((thread) => thread.id !== threadId);
  const { [threadId]: _removed, ...threadsRuntime } = state.threadsRuntime;
  // Mirror the `removeThread` action: drop the thread's terminal input buffers
  // too, otherwise archiving/closing a thread leaks them (the action path
  // prunes; this notification path used to skip it).
  const terminalInputBuffers = pruneTerminalInputBuffersForThread(state.terminalInputBuffers, threadId);
  return withActiveComposerMode({
    ...state,
    threads: nextThreads,
    threadsRuntime,
    terminalInputBuffers,
    activeThreadId: state.activeThreadId === threadId ? nextThreads[0]?.id ?? null : state.activeThreadId,
  });
}

export function handleThreadUnarchivedNotification(state: CodexUiState, params: Record<string, unknown>): CodexUiState {
  const threadId = String(params.threadId ?? "");
  if (!threadId) return state;
  return prependLog(state, `thread unarchived: ${shortThreadId(threadId)}`);
}

// codex: composer-*.js `/status` panel — context usage is calculated from
// `last.totalTokens` and
// `modelContextWindow`. The cumulative `total` object is not the number Desktop
// shows in the status panel.
export function applyThreadTokenUsageUpdatedNotification(
  state: CodexUiState,
  params: Record<string, unknown>,
): CodexUiState {
  const threadId = stringField(params, "threadId");
  if (!threadId) return state;
  const tokenUsage = recordParam(params.tokenUsage);
  if (!tokenUsage) return state;
  const turnId = turnIdParam(params);
  const runtime = selectThreadRuntime(state, threadId);
  const patch = tokenUsageRuntimePatch(tokenUsage, runtime, turnId);
  return patch ? threadRuntimePatch(state, threadId, patch) : state;
}

export function applyThreadCompactedNotification(state: CodexUiState, params: Record<string, unknown>): CodexUiState {
  const threadId = stringField(params, "threadId");
  const turnId = stringField(params, "turnId");
  if (!threadId) return state;

  const id = stringField(params, "itemId")
    || stringField(params, "id")
    || `context-compaction:${turnId || threadId}`;
  const item = {
    type: "contextCompaction",
    id,
    completed: true,
    source: "automatic",
  } as unknown as ThreadItem;
  return upsertItem(state, threadId, item, turnId || null);
}

export function applyThreadGoalUpdatedNotification(state: CodexUiState, params: Record<string, unknown>): CodexUiState {
  const threadId = stringField(params, "threadId");
  const goal = threadGoalParam(params.goal);
  if (!threadId || !goal) return state;
  const turnId = stringField(params, "turnId") || null;
  // No manual pre-projection here: the patch carries `threadGoal`, so
  // `threadRuntimePatch` already runs the full projection pipeline over the
  // runtime items — projecting first just did the same work twice.
  return threadRuntimePatch(state, threadId, {
    threadGoal: goal,
    threadGoalTurnId: turnId,
  });
}

export function applyThreadGoalClearedNotification(state: CodexUiState, params: Record<string, unknown>): CodexUiState {
  const threadId = stringField(params, "threadId");
  if (!threadId) return state;
  const runtime = selectThreadRuntime(state, threadId);
  return threadRuntimePatch(state, threadId, {
    threadGoal: null,
    threadGoalTurnId: null,
    items: clearThreadGoalProjection(runtime.items),
  });
}

export function applyHookRunNotification(state: CodexUiState, params: Record<string, unknown>): CodexUiState {
  const threadId = stringField(params, "threadId");
  const turnId = stringField(params, "turnId");
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

function threadGoalParam(value: unknown): ThreadGoal | null {
  if (!value || typeof value !== "object") return null;
  const record = value as Record<string, unknown>;
  if (typeof record.threadId !== "string" || typeof record.objective !== "string") return null;
  if (typeof record.status !== "string") return null;
  return value as ThreadGoal;
}

function upsertHookRun(existingRuns: unknown[], run: Record<string, unknown>): unknown[] {
  const runId = stringField(run, "id") || stringField(run, "runId");
  if (!runId) return [...existingRuns, run];
  let replaced = false;
  const next = existingRuns.map((existing) => {
    const existingRecord = recordParam(existing);
    if (!existingRecord) return existing;
    const existingId = stringField(existingRecord, "id") || stringField(existingRecord, "runId");
    if (existingId !== runId) return existing;
    replaced = true;
    return run;
  });
  return replaced ? next : [...existingRuns, run];
}

export function applyThreadSettingsUpdatedNotification(
  state: CodexUiState,
  params: Record<string, unknown>,
): CodexUiState {
  const threadId = stringField(params, "threadId");
  const settings = recordParam(params.threadSettings);
  if (!threadId || !settings) return state;

  const cwd = stringField(settings, "cwd");
  const modelProvider = stringField(settings, "modelProvider");
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

export function nextActiveThreadId(activeThreadId: string | null, threads: Thread[]): string | null {
  if (activeThreadId === null) return null;
  if (activeThreadId && threads.some((thread) => thread.id === activeThreadId)) return activeThreadId;
  return threads[0]?.id ?? null;
}

function upsertThread(threads: Thread[], thread: Thread): Thread[] {
  const index = threads.findIndex((item) => item.id === thread.id);
  if (index === -1) return [thread, ...threads];
  return threads.map((item, itemIndex) => itemIndex === index ? { ...item, ...thread } : item);
}

export function upsertThreadState(
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

export function enrichMultiAgentReceiverThreadsInRuntimes(
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

function turnOrderFromThread(thread: Thread, current: string[] = []): string[] {
  const next = [...current];
  for (const turn of thread.turns ?? []) {
    if (typeof turn.id === "string" && turn.id && !next.includes(turn.id)) {
      next.push(turn.id);
    }
  }
  return next;
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
