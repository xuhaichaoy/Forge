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
import {
  applyAccountNotification,
  initialAccountState,
  type AccountState,
} from "./account-state";
import { enrichMultiAgentReceiverThreads } from "./collab-receiver-projection";
import { composerModeFromCollaborationMode } from "./collaboration-modes";
import type { ComposerMode } from "./composer-workflow";
import type { McpServerStartupStatus } from "./mcp-skills-management";
import { applyInvalidation } from "./notification-invalidation";
import {
  formatUnknownForLog,
  fsChangedLogText,
  hookLogText,
  hookRunStatus,
  shortThreadId,
} from "./notification-log-format";
import type { AccumulatedThreadItem } from "./render-groups";
import {
  mergeAccumulatedItem,
  mergeItemsInIncomingOrder,
} from "./thread-item-merge";
import {
  canNavigateBackInHistory,
  canNavigateForwardInHistory,
  pushThreadHistoryEntry,
} from "./thread-history";
import { isThreadStatusInProgress } from "./thread-item-fields";
import {
  collaborationModeParam,
  mergeThreadContextDefaults,
  threadContextDefaultsFromThreadSettings,
} from "./thread-settings-projection";
import {
  appendTerminalCommandActions,
  parseTerminalInteractionInput,
  terminalInputBuffersWithInput,
} from "./terminal-interaction";
import {
  clearThreadGoalProjection,
  projectRuntimeItemStatus,
} from "./thread-item-status-projection";
import {
  reconnectStreamErrorItem,
  streamErrorItem,
  turnErrorMessage,
} from "./thread-stream-error";
import {
  completedTokenSpeedPatch,
  liveTokenSpeedRuntimePatch,
  startedTokenSpeedPatch,
  tokenUsageRuntimePatch,
  type ThreadTokenSpeedSnapshot,
  type ThreadTokenSpeedTracker,
  type ThreadTokenUsageSnapshot,
} from "./thread-token-usage";
import { turnPatchBatchesFromItems, unifiedDiffFromPatchBatches } from "./turn-diff-from-patches";
import { workedForItemFromTurn } from "./worked-for-item-projection";

export type { ThreadTokenSpeedSnapshot, ThreadTokenUsageSnapshot } from "./thread-token-usage";

export interface PendingServerRequest {
  id: RequestId;
  method: string;
  params?: unknown;
  createdAt: number;
}

export interface LogLine {
  id: string;
  // codex toast-signal-CTz_x1Qc.js exposes info/success/warning/danger; HiCodex maps
  // warn≈warning and error≈danger, and adds `success` (the previously-missing green level).
  level: "info" | "warn" | "error" | "success";
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
  // codex Jd/Qd/$d: a sandbox policy whose details deviate from the named-mode
  // defaults (read-only with network, or workspace-write with network /
  // exclude_slash_tmp / exclude_tmpdir_env_var) resolves to the `custom`
  // permission mode. The collapsed `sandbox` string can't carry these, so we
  // flag it here from the structured policy.
  sandboxIsNonDefault?: boolean;
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
  // codex: app-server-manager-signals-*.js — `turn/diff/updated` carries a
  // `turnId` and Codex stores the diff *on that turn* (`e.diff = t` inside
  // `updateTurnState(i, e, ...)`). The runtime keeps a flat string, so pair it
  // with the owning turn id so finishTurn can apply the ES priority
  // `e.diff ?? lS(patchBatches)` only to the matching turn.
  turnDiffTurnId: string | null;
  composerMode: ComposerMode | null;
  threadGoal: ThreadGoal | null;
  threadGoalTurnId: string | null;
  hookRunsByTurn?: Record<string, unknown[]>;
  terminalTurnIds: string[];
  // codex: local-conversation-thread-*.js — populated by the
  // `thread/tokenUsage/updated` notification; absent until the server emits
  // the first counter for this thread. Optional so older fixtures that do
  // not need the footer continue to type-check.
  tokenUsage?: ThreadTokenUsageSnapshot | null;
  tokenSpeed?: ThreadTokenSpeedSnapshot | null;
  tokenSpeedTracker?: ThreadTokenSpeedTracker | null;
  /**
   * The (model, modelProvider) the runtime reported for this thread on the
   * last thread/start / thread/resume response. The Thread protocol type only
   * carries modelProvider, so this is the client's only per-thread record of
   * the model actually in use — the model picker checkmark and the composer
   * model chip read it for active chats.
   */
  resolvedModel?: { model: string | null; modelProvider: string | null } | null;
}

export interface NotificationInvalidationState {
  appList: number;
  appListMessage: string;
  skills: number;
  hooks: number;
  mcpStatus: number;
  mcpStatusMessage: string;
  accountRefresh: number;
  authRefresh: number;
}

export interface CodexUiState {
  connected: boolean;
  connecting: boolean;
  hostStatus: HostStatus | null;
  threads: Thread[];
  activeThreadId: string | null;
  threadsRuntime: Record<string, ThreadRuntimeSlice>;
  terminalInputBuffers?: Record<string, string>;
  composerMode: ComposerMode;
  pendingRequests: PendingServerRequest[];
  logs: LogLine[];
  models: ModelConfig[];
  threadContextDefaults: ThreadContextDefaults | null;
  mcpServerStartupStatuses: Record<string, McpServerStartupStatus>;
  // Notification-driven invalidation counters: a notification of the given
  // method bumps the counter so panels re-fetch. Folded out of HiCodexApp's
  // ad-hoc nonce useStates so features decouple from the onNotification closure.
  invalidation: NotificationInvalidationState;
  // Account/auth projection (signed-in account + rate limits). Folded out of
  // HiCodexApp's accountState useState so notification-driven account updates
  // run in the reducer (via the pure applyAccountNotification) instead of an
  // ad-hoc shadow reducer inside the onNotification closure.
  account: AccountState;
  // codex: electron-menu-shortcuts-*.js#navigateBack/Forward —
  // in-app thread history stack (browser-style back/forward over the
  // sequence of activated threads). See `./thread-history.ts`.
  threadHistoryStack: string[];
  threadHistoryIndex: number;
}

export type CodexUiAction =
  | { type: "connecting"; value: boolean }
  | { type: "connected"; value: boolean }
  | { type: "invalidateAppList"; message: string }
  | { type: "setAccount"; account: AccountState }
  | { type: "invalidateAuth" }
  | { type: "hostStatus"; status: HostStatus }
  | { type: "setThreads"; threads: Thread[] }
  | { type: "upsertThread"; thread: Thread; select?: boolean }
  | { type: "renameThread"; threadId: string; name: string }
  | { type: "setActiveThread"; threadId: string | null }
  | { type: "removeThread"; threadId: string }
  | { type: "markThreadsNeedResumeAfterReconnect" }
  | { type: "setLatestCollaborationMode"; threadId: string; collaborationMode: CollaborationMode | null }
  | { type: "setActiveComposerMode"; mode: ComposerMode }
  | { type: "resetThreadComposerMode"; threadId: string }
  | { type: "notification"; message: JsonRpcNotification }
  | { type: "serverRequest"; request: JsonRpcRequest }
  | { type: "resolveServerRequest"; id: RequestId }
  | { type: "log"; text: string; level?: "info" | "warn" | "error" | "success" }
  | { type: "setModels"; models: ModelConfig[] }
  | { type: "upsertModel"; model: ModelConfig }
  | { type: "setThreadContextDefaults"; context: ThreadContextDefaults | null }
  | { type: "setThreadResolvedModel"; threadId: string; model: string | null; modelProvider: string | null }
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
  // codex: electron-menu-shortcuts-*.js#navigateBack/Forward —
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
  terminalInputBuffers: {},
  composerMode: "default",
  pendingRequests: [],
  logs: [],
  models: [],
  threadContextDefaults: null,
  mcpServerStartupStatuses: {},
  invalidation: { appList: 0, appListMessage: "App list changed.", skills: 0, hooks: 0, mcpStatus: 0, mcpStatusMessage: "MCP startup status changed.", accountRefresh: 0, authRefresh: 0 },
  account: initialAccountState,
  // codex: electron-menu-shortcuts-*.js#navigateBack/Forward —
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
  turnDiffTurnId: null,
  composerMode: null,
  threadGoal: null,
  threadGoalTurnId: null,
  hookRunsByTurn: {},
  terminalTurnIds: [],
  // codex: composer-*.js `/status` panel — null until the first
  // `thread/tokenUsage/updated` notification lands.
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
      // status.running means the sidecar PROCESS exists, not that this client
      // is attached to it. The 5s status poll must never resurrect `connected`
      // after a transport closure (that starved the backoff reconnect loop
      // forever); it may only downgrade when the process is gone.
      return { ...state, hostStatus: action.status, connected: state.connected && action.status.running };
    case "setThreads":
      return withActiveComposerMode({
        ...state,
        threads: action.threads,
        threadsRuntime: enrichMultiAgentReceiverThreadsInRuntimes(state.threadsRuntime, action.threads),
        activeThreadId: nextActiveThreadId(state.activeThreadId, action.threads),
      });
    case "upsertThread":
      return upsertThreadState(state, action.thread, action.select === true);
    case "renameThread":
      // Narrow patch on purpose: callers hold a render-time thread snapshot,
      // and merging that whole object back would roll back concurrent updates.
      return {
        ...state,
        threads: state.threads.map((thread) =>
          thread.id === action.threadId ? { ...thread, name: action.name } : thread),
      };
    case "setActiveThread": {
      // codex: electron-menu-shortcuts-*.js#navigateBack/Forward —
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
      // codex: electron-menu-shortcuts-*.js#navigateBack — separate
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
      // codex: electron-menu-shortcuts-*.js#navigateForward — mirror
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
      const terminalInputBuffers = pruneTerminalInputBuffersForThread(state.terminalInputBuffers, action.threadId);
      return withActiveComposerMode({
        ...state,
        threads: nextThreads,
        threadsRuntime,
        terminalInputBuffers,
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
    case "invalidateAppList":
      return {
        ...state,
        invalidation: {
          ...state.invalidation,
          appList: state.invalidation.appList + 1,
          appListMessage: action.message,
        },
      };
    case "setAccount":
      return action.account === state.account ? state : { ...state, account: action.account };
    case "invalidateAuth":
      return {
        ...state,
        invalidation: { ...state.invalidation, authRefresh: state.invalidation.authRefresh + 1 },
      };
    case "notification": {
      const next = applyNotification(state, action.message);
      const invalidation = applyInvalidation(next.invalidation, action.message);
      const account = applyAccountNotification(next.account, action.message);
      if (invalidation === next.invalidation && account === next.account) return next;
      return { ...next, invalidation, account };
    }
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
    case "setThreadResolvedModel":
      return threadRuntimePatch(state, action.threadId, {
        resolvedModel: { model: action.model, modelProvider: action.modelProvider },
      });
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

function normalizeThreadRuntime(
  runtime: Partial<ThreadRuntimeSlice> | undefined,
  options?: { reuseProjectedItems?: boolean },
): ThreadRuntimeSlice {
  const threadGoal = runtime?.threadGoal ?? null;
  const threadGoalTurnId = runtime?.threadGoalTurnId ?? null;
  const hookRunsByTurn = runtime?.hookRunsByTurn ?? {};
  const rawItems = runtime?.items ?? [];
  // Hot-path projection skip: the four item projections below depend only on
  // `items`, `hookRunsByTurn`, `threadGoal`, and `threadGoalTurnId`. When a
  // patch touches none of those (e.g. a `tokenSpeed` tick or `turnDiff` update),
  // the already-projected `runtime.items` are still projection-consistent — the
  // projections are idempotent on their own output — so we reuse them verbatim
  // and skip 2–4 full-transcript `items.map()` passes. Every other field below
  // is normalized identically to the full path, so the output shape is unchanged.
  const items = options?.reuseProjectedItems
    ? rawItems
    : projectRuntimeItemStatus({
        items: rawItems,
        hookRunsByTurn,
        threadGoal,
        threadGoalTurnId,
      });
  const terminalTurnIds = dedupeStrings(runtime?.terminalTurnIds ?? []);
  return {
    activeTurnId: runtime?.activeTurnId ?? null,
    items,
    turnOrder: runtime?.turnOrder ?? [],
    pendingOptimisticTurns: runtime?.pendingOptimisticTurns ?? [],
    latestCollaborationMode: runtime?.latestCollaborationMode ?? null,
    turnPlan: runtime?.turnPlan ?? null,
    turnDiff: runtime?.turnDiff ?? "",
    turnDiffTurnId: runtime?.turnDiffTurnId ?? null,
    composerMode: runtime?.composerMode ?? null,
    threadGoal,
    threadGoalTurnId,
    hookRunsByTurn,
    terminalTurnIds,
    // codex: local-conversation-thread-*.js — preserve the latest
    // token-usage snapshot across patch cycles; the reducer rewrites it only
    // when `thread/tokenUsage/updated` arrives.
    tokenUsage: runtime?.tokenUsage ?? null,
    tokenSpeed: runtime?.tokenSpeed ?? { tokensPerSecond: 0, turnId: null },
    tokenSpeedTracker: runtime?.tokenSpeedTracker ?? null,
    resolvedModel: runtime?.resolvedModel ?? null,
  };
}

function dedupeStrings(values: string[]): string[] {
  const next: string[] = [];
  for (const value of values) {
    if (value && !next.includes(value)) next.push(value);
  }
  return next;
}

function pruneTerminalInputBuffersForThread(
  buffers: Record<string, string> | undefined,
  threadId: string,
): Record<string, string> | undefined {
  if (!buffers) return buffers;
  const prefix = `${threadId}:`;
  let changed = false;
  const next: Record<string, string> = {};
  for (const [key, value] of Object.entries(buffers)) {
    if (key.startsWith(prefix)) {
      changed = true;
      continue;
    }
    next[key] = value;
  }
  return changed ? next : buffers;
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

// The item projections in `normalizeThreadRuntime` consume exactly these four
// fields. A patch that sets none of them cannot change the projected `items`,
// so the projection pipeline can be skipped for it. `in` is used (rather than a
// truthiness check) so an explicit `threadGoal: null` / `hookRunsByTurn: {}`
// reset still takes the full projection path, matching the unoptimized reducer.
const ITEM_PROJECTION_PATCH_KEYS: ReadonlyArray<keyof ThreadRuntimeSlice> = [
  "items",
  "hookRunsByTurn",
  "threadGoal",
  "threadGoalTurnId",
];

function patchAffectsItemProjection(patch: Partial<ThreadRuntimeSlice>): boolean {
  return ITEM_PROJECTION_PATCH_KEYS.some((key) => key in patch);
}

function threadRuntimePatch(
  state: CodexUiState,
  threadId: string,
  patch: Partial<ThreadRuntimeSlice>,
  options?: { reuseProjectedItems?: boolean },
): CodexUiState {
  // Callers may force-reuse when they can prove the patch leaves projection
  // inputs untouched even though it carries `items` (text-append deltas).
  const reuseProjectedItems = options?.reuseProjectedItems ?? !patchAffectsItemProjection(patch);
  return updateThreadRuntime(state, threadId, (runtime) =>
    normalizeThreadRuntime({ ...runtime, ...patch }, { reuseProjectedItems }),
  );
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

/*
 * Monotonic log id: the previous `Date.now()+logs.length` scheme collided once
 * the log buffer hit its 120-entry cap (length pinned) and two logs landed in
 * the same millisecond — duplicate React keys in the toast viewport and
 * dismiss-by-id hiding both lines. Same pattern as thread-workflow's
 * optimistic id counter.
 */
let logIdCounter = 0;

function prependLog(
  state: CodexUiState,
  text: string,
  level: "info" | "warn" | "error" | "success" = "info",
): CodexUiState {
  logIdCounter += 1;
  return {
    ...state,
    logs: [
      {
        id: `log-${logIdCounter}`,
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

/*
 * `applyNotification` is a thin per-method dispatcher: it does the shared
 * `params` extraction once, then routes each method (or fall-through group) to a
 * domain handler below. Handlers are grouped by domain — thread lifecycle, turn
 * lifecycle, item lifecycle/deltas, model, plan/diff — and each is a pure
 * `(state, params[, message]) => state` slice of the original switch body, moved
 * verbatim. The item-lifecycle fall-through group (9 methods that shared one
 * case body) is preserved by routing all 9 labels to a single handler that
 * still derives its completion bias from `message.method`.
 */
function applyNotification(state: CodexUiState, message: JsonRpcNotification): CodexUiState {
  const params = (message.params ?? {}) as Record<string, unknown>;
  switch (message.method) {
    case "error":
      return applyErrorNotification(state, params);
    case "thread/started":
      return handleThreadStartedNotification(state, params);
    case "thread/status/changed":
      return handleThreadStatusChangedNotification(state, params);
    case "thread/name/updated":
      return handleThreadNameUpdatedNotification(state, params);
    case "thread/settings/updated":
      return applyThreadSettingsUpdatedNotification(state, params);
    case "thread/archived":
    case "thread/closed":
      return handleThreadRemovedNotification(state, params);
    case "thread/unarchived":
      return handleThreadUnarchivedNotification(state, params);
    case "thread/tokenUsage/updated":
      // codex: composer-*.js `/status` panel — projects the
      // `ThreadTokenUsage` payload (last-turn breakdown + `modelContextWindow`)
      // into `ThreadRuntimeSlice.tokenUsage` so the composer status panel can
      // render the context usage row.
      return applyThreadTokenUsageUpdatedNotification(state, params);
    case "thread/compacted":
      return applyThreadCompactedNotification(state, params);
    case "thread/goal/updated":
      return applyThreadGoalUpdatedNotification(state, params);
    case "thread/goal/cleared":
      return applyThreadGoalClearedNotification(state, params);
    case "turn/started":
      return handleTurnStartedNotification(state, params);
    case "item/started":
    case "item/completed":
    case "item/commandExecution/requestApproval":
    case "item/fileChange/requestApproval":
    case "item/permissions/requestApproval":
    case "item/tool/call":
    case "item/tool/requestUserInput":
      return handleItemLifecycleNotification(state, params, message);
    /*
     * Codex Desktop's `remote-conversation-page` dispatcher consumes 5 visible
     * item-level delta channels (docs §26.4). HiCodex used to subscribe to 3
     * extra protocol-defined channels — none of which had a downstream
     * consumer in the renderer:
     *
     *   - `item/reasoning/summaryPartAdded` — `appendReasoningText` already
     *     auto-expands the summary array via `updateReasoningParts`, making
     *     a separate "pre-allocate slot" channel redundant. Matches Codex's
     *     `Tn(arr, idx, default)` helper which expands on first delta arrival.
     *   - `item/fileChange/outputDelta` — flagged deprecated in the v2
     *     protocol; modern app-server does not send it.
     *   - `item/mcpToolCall/progress` — Desktop currently logs and ignores
     *     this progress message instead of projecting a renderer field.
     *
     * The 5 channels HiCodex now consumes match Codex exactly. The single
     * non-text channel here is `item/commandExecution/terminalInteraction`,
     * which Codex handles in app-server-manager by parsing stdin into
     * commandActions. The single intentional divergence is
     * `item/fileChange/patchUpdated` below, kept because HiCodex renders
     * `changes[]` incrementally via `tool-activity-detail.tsx:334` (Codex
     * waits for `item/completed`).
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
    case "item/commandExecution/terminalInteraction":
      return applyCommandExecutionTerminalInteraction(state, params);
    case "item/fileChange/patchUpdated":
      // HiCodex extension (not in Codex Desktop's 5-channel set).
      return mergeItemFields(state, params, "fileChange", { changes: params.changes });
    case "item/autoApprovalReview/started":
    case "item/autoApprovalReview/completed":
      // Codex synthesizes a client-side automatic-approval-review timeline item
      // from these notifications (payload is the review itself, no params.item).
      return handleAutoApprovalReviewNotification(state, params);
    case "model/rerouted":
      return handleModelReroutedNotification(state, params);
    case "turn/plan/updated":
      return upsertTurnPlan(state, params);
    case "turn/diff/updated":
      return handleTurnDiffUpdatedNotification(state, params);
    case "turn/completed":
      return finishTurn(state, params, "completed");
    case "turn/failed":
      return finishTurn(state, params, "failed");
    case "turn/interrupted":
    case "turn/cancelled":
      return finishTurn(state, params, "interrupted");
    case "serverRequest/resolved":
      return handleServerRequestResolvedNotification(state, params);
    case "mcpServer/startupStatus/updated":
      return applyMcpServerStartupStatusNotification(state, params, message);
    default:
      return logNotificationIfUseful(state, message);
  }
}

// --- thread-domain notification handlers -------------------------------------

function handleThreadStartedNotification(state: CodexUiState, params: Record<string, unknown>): CodexUiState {
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

function handleThreadStatusChangedNotification(state: CodexUiState, params: Record<string, unknown>): CodexUiState {
  const threadId = String(params.threadId ?? "");
  if (!threadId) return state;
  return {
    ...state,
    threads: state.threads.map((thread) =>
      thread.id === threadId ? { ...thread, status: normalizeThreadStatus(params.status, thread.status) } : thread,
    ),
  };
}

function handleThreadNameUpdatedNotification(state: CodexUiState, params: Record<string, unknown>): CodexUiState {
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
function handleThreadRemovedNotification(state: CodexUiState, params: Record<string, unknown>): CodexUiState {
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

function handleThreadUnarchivedNotification(state: CodexUiState, params: Record<string, unknown>): CodexUiState {
  const threadId = String(params.threadId ?? "");
  if (!threadId) return state;
  return prependLog(state, `thread unarchived: ${shortThreadId(threadId)}`);
}

// --- turn-domain notification handlers ---------------------------------------

function handleTurnStartedNotification(state: CodexUiState, params: Record<string, unknown>): CodexUiState {
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

function handleTurnDiffUpdatedNotification(state: CodexUiState, params: Record<string, unknown>): CodexUiState {
  const threadId = String(params.threadId ?? "");
  const diff = typeof params.diff === "string" ? params.diff : "";
  if (!threadId) return state;
  // codex: `case `turn/diff/updated``  — `let { turnId: e, diff: t } = r.params;
  // this.updateTurnState(i, e, (e) => { e.diff = t })` (app-server-manager-
  // signals-SKi6YePu.js :13076). Keep the owning turn id alongside the diff.
  const turnId = String(params.turnId ?? "");
  return threadRuntimePatch(state, threadId, { turnDiff: diff, turnDiffTurnId: turnId || null });
}

// --- item-domain notification handlers ---------------------------------------

// Handles the 9-method item-lifecycle fall-through group. Reads `message.method`
// to derive the per-event completion bias (any `/completed` suffix is terminal),
// matching Codex Desktop's app-server-manager-signals.
function handleItemLifecycleNotification(
  state: CodexUiState,
  params: Record<string, unknown>,
  message: JsonRpcNotification,
): CodexUiState {
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

function handleModelReroutedNotification(state: CodexUiState, params: Record<string, unknown>): CodexUiState {
  /*
   * Codex Desktop's app-server-manager onNotification handler for
   * `model/rerouted` synthesizes a client-side timeline item
   * ({ type:"modelRerouted", fromModel, toModel, reason }) and pushes it
   * into the active turn; the renderer only surfaces reroutes whose reason
   * is "highRiskCyberActivity" (see event-unit.tsx). HiCodex previously
   * only logged the notification, so a live reroute never reached the
   * transcript — it appeared only when a thread/read snapshot already held
   * the item. Re-verified vs Codex Desktop v26.519.81530.
   */
  const threadId = String(params.threadId ?? "");
  if (!threadId) return state;
  const turnIdParam = typeof params.turnId === "string" && params.turnId.length > 0 ? params.turnId : null;
  const fromModel = stringField(params, "fromModel");
  const toModel = stringField(params, "toModel");
  const reason = stringField(params, "reason");
  const id = stringField(params, "itemId") || `model-rerouted:${turnIdParam || threadId}`;
  const item = {
    type: "modelRerouted",
    id,
    fromModel,
    toModel,
    reason,
    completed: true,
  } as unknown as ThreadItem;
  const logged = prependLog(state, `model rerouted ${fromModel} -> ${toModel}${reason ? `: ${reason}` : ""}`, "warn");
  return upsertItem(logged, threadId, item, turnIdParam);
}

function handleAutoApprovalReviewNotification(
  state: CodexUiState,
  params: Record<string, unknown>,
): CodexUiState {
  /*
   * Codex Desktop's app-server-manager routes
   * `item/autoApprovalReview/started|completed` to a dedicated synthesizer
   * (bundle `gy`/`hy`): the notification payload IS the review
   * ({ threadId, turnId, startedAtMs, reviewId, targetItemId, review, action }
   * — there is NO `params.item`), so it builds a client-side timeline item and
   * pushes it into the active turn. HiCodex previously folded both kinds into
   * handleItemLifecycleNotification, whose `params.item?.id` guard dropped
   * every one — so the Auto-review entry never appeared mid-turn (it surfaced
   * only from a later thread/read snapshot). This mirrors the modelRerouted
   * synthesis above. The item is stored with the kebab
   * `automatic-approval-review` type the renderer + grouping already consume;
   * the v2 ThreadItem union has no `automaticApprovalReview` member (it is
   * purely client-synthesized) so itemType() needs no new case. Re-verified vs
   * Codex Desktop 26.602.40724 (app-server-manager-signals hy()/gy()).
   */
  const threadId = String(params.threadId ?? "");
  if (!threadId) return state;
  const turnIdParam = typeof params.turnId === "string" && params.turnId.length > 0 ? params.turnId : null;
  const reviewId = stringField(params, "reviewId");
  if (!reviewId) return state;
  const review = recordParam(params.review) ?? {};
  const status = stringField(review, "status") || "inProgress";
  const startedAtMs = numberParam(params, "startedAtMs");
  const item = {
    type: "automatic-approval-review",
    id: `automatic-approval-review:${reviewId}`,
    targetItemId: stringField(params, "targetItemId") || null,
    action: params.action ?? null,
    startedAtMs: startedAtMs || null,
    completedAtMs: status === "inProgress" ? null : numberParam(params, "completedAtMs") || Date.now(),
    status,
    riskLevel: review.riskLevel ?? null,
    userAuthorization: review.userAuthorization ?? null,
    rationale: review.rationale ?? null,
  } as unknown as ThreadItem;
  return upsertItem(state, threadId, item, turnIdParam);
}

// --- server-request notification handlers ------------------------------------

function handleServerRequestResolvedNotification(state: CodexUiState, params: Record<string, unknown>): CodexUiState {
  return {
    ...state,
    pendingRequests: state.pendingRequests.filter((request) => request.id !== params.requestId),
  };
}

function applyMcpServerStartupStatusNotification(
  state: CodexUiState,
  params: Record<string, unknown>,
  message: JsonRpcNotification,
): CodexUiState {
  const name = stringField(params, "name");
  if (!name) return logNotificationIfUseful(state, message);
  const startup: McpServerStartupStatus = {
    status: formatUnknownForLog(params.status) || "unknown",
    error: stringField(params, "error") || null,
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
  const willRetry = params.willRetry === true;
  const retryText = willRetry ? " (will retry)" : "";
  const logged = text ? prependLog(state, `${text}${retryText}`, "error") : state;

  const threadId = String(params.threadId ?? "");
  if (!threadId || !text) return logged;
  const turnId = String(params.turnId ?? "");
  const runtime = selectThreadRuntime(logged, threadId);
  const order = ensureTurnInOrder(runtime.turnOrder, turnId || null);

  /*
   * Codex projects the `error` notification by `willRetry`
   * (app-server-manager-signals :20244-20264): a retrying/reconnect error
   * becomes a low-key `stream-error` row carrying a "Reconnecting N/M" progress
   * when the message encodes it. HiCodex previously DROPPED willRetry errors
   * entirely (log-only early return), so reconnect attempts were invisible in
   * the transcript — fixed here.
   *
   * Codex renders a FATAL error as a `system-error` block (vs `stream-error`).
   * HiCodex keeps fatal errors on `stream-error` for now: the fatal `error`
   * notification and the `turn/failed` path both surface the same error and
   * unify on `stream-error:${turnId}` (one row); reclassifying to system-error
   * would also require reclassifying the turn/failed path, which this audit did
   * not verify against the bundle. Tracked as a follow-up.
   */
  if (willRetry) {
    return {
      ...logged,
      threadsRuntime: {
        ...logged.threadsRuntime,
        [threadId]: normalizeThreadRuntime({
          ...runtime,
          turnOrder: order,
          items: mergeItems(runtime.items, [reconnectStreamErrorItem(turnId, error, text)], order),
        }),
      },
    };
  }

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

// codex: composer-*.js `/status` panel — context usage is calculated from
// `last.totalTokens` and
// `modelContextWindow`. The cumulative `total` object is not the number Desktop
// shows in the status panel.
function applyThreadTokenUsageUpdatedNotification(
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

function updateLiveTokenSpeed(state: CodexUiState, params: Record<string, unknown>): CodexUiState {
  const threadId = stringField(params, "threadId");
  const turnId = turnIdParam(params);
  const delta = stringField(params, "delta");
  if (!threadId || !turnId || !delta) return state;
  const runtime = selectThreadRuntime(state, threadId);
  const patch = liveTokenSpeedRuntimePatch(runtime, turnId, delta);
  return patch ? threadRuntimePatch(state, threadId, patch) : state;
}

function applyThreadCompactedNotification(state: CodexUiState, params: Record<string, unknown>): CodexUiState {
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

function applyThreadGoalUpdatedNotification(state: CodexUiState, params: Record<string, unknown>): CodexUiState {
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

function applyThreadGoalClearedNotification(state: CodexUiState, params: Record<string, unknown>): CodexUiState {
  const threadId = stringField(params, "threadId");
  if (!threadId) return state;
  const runtime = selectThreadRuntime(state, threadId);
  return threadRuntimePatch(state, threadId, {
    threadGoal: null,
    threadGoalTurnId: null,
    items: clearThreadGoalProjection(runtime.items),
  });
}

function applyHookRunNotification(state: CodexUiState, params: Record<string, unknown>): CodexUiState {
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

function applyThreadSettingsUpdatedNotification(
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

function logNotificationIfUseful(state: CodexUiState, message: JsonRpcNotification): CodexUiState {
  const params = (message.params ?? {}) as Record<string, unknown>;
  switch (message.method) {
    case "warning":
    case "guardianWarning":
      return prependLog(state, stringField(params, "message") || formatUnknownForLog(params), "warn");
    case "configWarning": {
      const summary = stringField(params, "summary") || "config warning";
      const details = stringField(params, "details");
      return prependLog(state, details ? `${summary}: ${details}` : summary, "warn");
    }
    // `model/rerouted` is intercepted by applyNotification (synthesizes a
    // modelRerouted timeline item); it no longer falls through to logging here.
    case "model/verification":
      return prependLog(state, `model verification required: ${formatUnknownForLog(params.verifications)}`, "warn");
    case "mcpServer/startupStatus/updated": {
      const name = stringField(params, "name") || "mcp server";
      const status = formatUnknownForLog(params.status);
      const error = stringField(params, "error");
      return prependLog(state, error ? `${name} ${status}: ${error}` : `${name} ${status}`, error ? "warn" : "info");
    }
    case "account/updated": {
      const authMode = formatUnknownForLog(params.authMode);
      const planType = formatUnknownForLog(params.planType);
      return prependLog(state, `account updated: ${authMode || "unknown"}${planType ? ` / ${planType}` : ""}`);
    }
    case "account/login/completed": {
      const success = params.success === true;
      const error = stringField(params, "error");
      return prependLog(state, success ? "account login completed" : `account login failed${error ? `: ${error}` : ""}`, success ? "info" : "error");
    }
    case "thread/realtime/error":
      return prependLog(state, stringField(params, "message") || formatUnknownForLog(params), "error");
    case "deprecationNotice":
      return prependLog(state, stringField(params, "message") || formatUnknownForLog(params), "warn");
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

function recordParam(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" ? value as Record<string, unknown> : null;
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
  const turns = thread.turns ?? [];
  let items = turns.flatMap((turn) => turnItemsWithWorkedFor(turn));
  // Snapshot / reload path: this never runs through finishTurn, so synthesize the
  // per-turn diff card here too. Operate on the full assembled list so each turn's
  // file-change items are visible regardless of segment ordering.
  for (const turn of turns) {
    // Snapshot turns carry no live diff (Codex rebuilds them with `diff: null`,
    // app-server-manager-signals :7236) — always rebuild from patches.
    items = synthesizeTurnDiffForTurn(items, turn?.id ? String(turn.id) : "");
  }
  return items;
}

function turnItemsWithWorkedFor(
  turn: TurnLike | undefined,
  options: { hasExtraActivity?: boolean } = {},
): AccumulatedThreadItem[] {
  if (!turn) return [];
  const items = turn.items ?? [];
  const turnStatus = turnStatusText(turn.status);
  const workedFor = workedForItemFromTurn(turn, items, options.hasExtraActivity === true, turnStatus);
  const normalized = normalizeWorkedForItems(items, workedFor);
  return attachTurnMetadataToAll(normalized, turn.id, turnStatus);
}

// Codex keeps the turn-level diff out of the ThreadItem protocol stream — the
// webview synthesizes a `turn-diff` item itself at the tail of every turn's
// projection so the static "Edited N files +X -Y / Undo / Review" card shows
// after the live diff portal disappears, and on snapshot reload too.
//
// codex: app-server-manager-signals-SKi6YePu.js (26.602.40724, beautified) —
// turn projection `ES` (:15149):
//   let g = lS(m),                                  // rebuild from patch batches
//       _ = e.diff != null && e.diff.length > 0 ? e.diff : g;
//   _.length > 0 && o.push({ type: `turn-diff`, unifiedDiff: _,
//       ...(m.length > 0 ? { patchBatches: m } : {}), cwd: m[0]?.cwd ?? ... });
// Notes pinned to that source:
//   - NO turn-status filter — interrupted/failed turns with applied patches
//     still get the card; the render side hides it only while the turn is
//     `in_progress` (`fn = !G && ...`, local-conversation-thread :28619).
//   - `e.diff` is only ever populated by a live `turn/diff/updated`
//     notification (:13076); snapshot turns are rebuilt with `diff: null`
//     (:7236), so the reopen path always rebuilds from patches.
//
// IMPORTANT: this operates on the *full accumulated* items array (not a single
// turn's snapshot), because live turns stream their file-change items into the
// running list — `turn.items` from the completion notification can be
// incomplete. finishTurn calls it with the thread's live `turn/diff/updated`
// payload when it belongs to this turn; collectThreadItems calls it per turn
// for snapshot loads (no live diff, like Codex's `diff: null` snapshot turns).
const TURN_DIFF_SYNTHESIZED_ID_PREFIX = "turn-diff:";

function synthesizeTurnDiffForTurn(
  items: AccumulatedThreadItem[],
  turnId: string,
  liveTurnDiff?: string,
): AccumulatedThreadItem[] {
  if (!turnId) return items;
  // Idempotent: never add a second turn-diff for this turn. (Codex re-projects
  // turns from scratch each pass; the accumulated model adds the item once.)
  if (items.some((item) => (item as { type?: unknown }).type === "turn-diff" && turnIdOf(item) === turnId)) {
    return items;
  }
  const turnItems = items.filter((item) => turnIdOf(item) === turnId);
  const patchBatches = turnPatchBatchesFromItems(turnItems);
  // codex ES: `_ = e.diff != null && e.diff.length > 0 ? e.diff : lS(m)`.
  const unifiedDiff = liveTurnDiff != null && liveTurnDiff.length > 0
    ? liveTurnDiff
    : unifiedDiffFromPatchBatches(patchBatches);
  if (unifiedDiff.length === 0) return items;
  const synthesized: AccumulatedThreadItem = {
    id: `${TURN_DIFF_SYNTHESIZED_ID_PREFIX}${turnId}`,
    type: "turn-diff",
    turnId,
    unifiedDiff,
    // codex ES item shape: `{ type, unifiedDiff, ...(m.length > 0 ?
    // { patchBatches: m } : {}), cwd: m[0]?.cwd ?? (e.params.cwd ...) }`.
    // The accumulated view has no turn params, so the cwd fallback stays null.
    ...(patchBatches.length > 0 ? { patchBatches } : {}),
    cwd: patchBatches[0]?.cwd ?? null,
    _turnId: turnId,
  };
  // Insert at the tail of this turn's segment (after its last item).
  const lastTurnIndex = findLastIndex(items, (item) => turnIdOf(item) === turnId);
  if (lastTurnIndex < 0) return [...items, synthesized];
  return [...items.slice(0, lastTurnIndex + 1), synthesized, ...items.slice(lastTurnIndex + 1)];
}

/*
 * Post-merge worked-for synthesis for the live completion path.
 *
 * Wire fact (probed against the sidecar app-server, 2026-06-06): the
 * `turn/completed` notification carries `startedAt`/`completedAt`/`durationMs`
 * but its `turn.items` is EMPTY (`itemsView: "notLoaded"`) — the activity items
 * only exist in the accumulated runtime list, having streamed in via `item/*`
 * notifications. `turnItemsWithWorkedFor(turn)` therefore never sees agent
 * activity on this path and the divider starves, leaving the collapse header on
 * the previous-messages fallback ("上 N 条消息") even though Codex shows
 * "Worked for {time}" (qh branch ② via turn.durationMs,
 * local-conversation-thread-CNXrCEaG :8381).
 *
 * Same lesson as synthesizeTurnDiffForTurn: gate on the MERGED segment.
 * Idempotent — workedForItemFromTurn bails when the segment already has a
 * worked-for item (snapshot reloads keep working through collectThreadItems).
 */
function synthesizeWorkedForForTurn(
  items: AccumulatedThreadItem[],
  turnId: string,
  turn: TurnLike | undefined,
  options: { hasExtraActivity?: boolean } = {},
): AccumulatedThreadItem[] {
  if (!turnId || !turn) return items;
  const first = items.findIndex((item) => turnIdOf(item) === turnId);
  if (first < 0) return items;
  const last = findLastIndex(items, (item) => turnIdOf(item) === turnId);
  const segment = items.slice(first, last + 1).filter((item) => turnIdOf(item) === turnId);
  const turnWithId: TurnLike = turn.id ? turn : { ...turn, id: turnId };
  const turnStatus = turnStatusText(turn.status);
  const workedFor = workedForItemFromTurn(turnWithId, segment, options.hasExtraActivity === true, turnStatus);
  if (!workedFor) return items;
  const [stamped] = attachTurnMetadataToAll([workedFor], turnId, turnStatus);
  if (!stamped) return items;
  // Codex places the divider between the user message and the first activity
  // row (see insertWorkedForAfterLastUserMessage) — after the segment's last
  // user message, else at the segment head.
  let insertAt = first;
  for (let index = first; index <= last; index += 1) {
    const item = items[index];
    if (turnIdOf(item) !== turnId) continue;
    if (String((item as Record<string, unknown>).type ?? "") === "userMessage") insertAt = index + 1;
  }
  return [...items.slice(0, insertAt), stamped, ...items.slice(insertAt)];
}

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
   * codex: local-conversation-thread-*.js — Codex Desktop renders the
   * agent-body-collapsible as `<Fragment>{HEADER}{BODY}</Fragment>` where
   * HEADER carries the "Worked for {time}" label followed by a
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
  // Hot-path guard: the item projections key off item identity, `type`,
  // `turnId`, and `completed` — never off message text. A delta that only
  // appends to an already-typed, already-turn-attached item cannot change any
  // projection input, so re-running the pipeline is a provable no-op that
  // costs 2–6 full-transcript passes per streamed token. The first delta of an
  // item (creation, or stamping type/turnId/completed) still takes the full
  // projection path.
  let projectionInputsChanged = false;
  let next = items.map((item) => {
    if (item.id !== itemId) return item;
    found = true;
    const record = item as Record<string, unknown>;
    const projectionSafe = Boolean(record.type)
      && (!turnId || record.turnId === turnId)
      && (expectedType !== "agentMessage" || record.completed !== undefined);
    if (!projectionSafe) projectionInputsChanged = true;
    const previous = String(record[field] ?? "");
    const updated = {
      ...item,
      type: item.type || expectedType,
      ...(expectedType === "agentMessage" && record.completed !== true ? { completed: false } : {}),
      [field]: previous + delta,
    };
    return turnId ? attachTurnId(updated as AccumulatedThreadItem, turnId) : updated;
  });
  if (!found) {
    projectionInputsChanged = true;
    const incoming = {
      id: itemId,
      type: expectedType,
      ...(expectedType === "agentMessage" ? { completed: false } : {}),
      [field]: delta,
    } as unknown as AccumulatedThreadItem;
    next = placeItemInTurn(next, turnId ? attachTurnId(incoming, turnId) : incoming, order);
  }
  return threadRuntimePatch(
    state,
    threadId,
    { items: next, turnOrder: order },
    { reuseProjectedItems: !projectionInputsChanged },
  );
}

function applyCommandExecutionTerminalInteraction(
  state: CodexUiState,
  params: Record<string, unknown>,
): CodexUiState {
  const threadId = String(params.threadId ?? "");
  const itemId = String(params.itemId ?? "");
  const stdin = String(params.stdin ?? "");
  if (!threadId || !itemId || !stdin) return state;

  const bufferKey = `${threadId}:${itemId}`;
  const previousBuffer = state.terminalInputBuffers?.[bufferKey] ?? "";
  const parsed = parseTerminalInteractionInput(previousBuffer, stdin);
  const nextTerminalInputBuffers = terminalInputBuffersWithInput(
    state.terminalInputBuffers,
    bufferKey,
    parsed.inputBuffer,
  );
  const stateWithBuffer = nextTerminalInputBuffers === state.terminalInputBuffers
    ? state
    : { ...state, terminalInputBuffers: nextTerminalInputBuffers };
  if (parsed.commands.length === 0) return stateWithBuffer;

  const runtime = selectThreadRuntime(stateWithBuffer, threadId);
  const { found, items } = appendTerminalCommandActions(runtime.items, itemId, parsed.commands);
  if (!found) return stateWithBuffer;
  return threadRuntimePatch(stateWithBuffer, threadId, { items });
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

// Codex never sends a `planImplementation` thread item over the wire — its
// webview synthesizes one client-side when a turn completes. The Codex bundle's
// app-server-manager (`B_`) scans the just-completed turn for the proposed-plan
// item (raw wire type "plan") and, when it carries text, appends a
// `planImplementation` UI item holding that text; `planImplementationPendingRequest`
// (HiCodexApp.tsx) then derives the "Implement this plan?" composer prompt from
// it. HiCodex already had every downstream half (itemType mapping, the
// `item/plan/requestImplementation` method, the accept handler) but never
// synthesized the item, so a finished plan turn left no way to act on the plan
// and plan mode appeared to stop silently. This restores that synthesis.
const PLAN_IMPLEMENTATION_SYNTHESIZED_ID_PREFIX = "implement-plan:";

function withSynthesizedPlanImplementation(
  items: AccumulatedThreadItem[],
  turnId: string,
  turnStatus: string,
): AccumulatedThreadItem[] {
  // Gate exactly like Codex: only a normally completed turn proposes
  // implementation — failed/interrupted/cancelled turns must not.
  if (turnStatus !== "completed" || !turnId) return items;
  const planItem = items.find(
    (item) => turnIdOf(item) === turnId && (item as { type?: unknown }).type === "plan",
  );
  const planText = planItem ? (planItem as { text?: unknown }).text : undefined;
  const planContent = typeof planText === "string" ? planText.trim() : "";
  if (!planContent) return items;
  // Idempotent: drop any prior synthesized item for this turn before re-adding.
  const withoutStale = items.filter(
    (item) => !((item as { type?: unknown }).type === "planImplementation" && turnIdOf(item) === turnId),
  );
  const synthesized: AccumulatedThreadItem = {
    id: `${PLAN_IMPLEMENTATION_SYNTHESIZED_ID_PREFIX}${turnId}`,
    type: "planImplementation",
    turnId,
    planContent,
    isCompleted: false,
    _turnId: turnId,
  };
  // Append at the tail of this turn's segment (Codex pushes to turn.items end).
  const lastTurnIndex = findLastIndex(withoutStale, (item) => turnIdOf(item) === turnId);
  if (lastTurnIndex < 0) return [...withoutStale, synthesized];
  return [
    ...withoutStale.slice(0, lastTurnIndex + 1),
    synthesized,
    ...withoutStale.slice(lastTurnIndex + 1),
  ];
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
  const mergedItems = turnId
    ? replaceTurnSegment(currentItems, turnId, terminalSegment, order)
    : mergeItemsInIncomingOrder(currentItems, terminalSegment);
  // Codex synthesizes the plan-implementation affordance on the client at turn
  // completion (see withSynthesizedPlanImplementation); replicate it so a
  // finished plan turn surfaces "Implement this plan?" instead of stopping.
  const withPlan = withSynthesizedPlanImplementation(mergedItems, turnId, turnStatus);
  // Operate on the merged items (not turn.items): live turns stream their
  // activity/patch items into the running list, so the completion snapshot
  // alone can miss them — `turn/completed` even arrives with EMPTY items
  // (`itemsView: "notLoaded"`, probed 2026-06-06). Both syntheses below gate
  // on the merged segment for that reason.
  const withWorkedFor = synthesizeWorkedForForTurn(withPlan, turnId, turn, {
    hasExtraActivity: Boolean(errorText),
  });
  // codex ES prefers the live `turn/diff/updated` payload (`e.diff`) over the
  // patch rebuild — but only when it belongs to this turn.
  const liveTurnDiff = turnId && runtime.turnDiffTurnId === turnId ? runtime.turnDiff : undefined;
  const nextItems = synthesizeTurnDiffForTurn(withWorkedFor, turnId, liveTurnDiff);
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
      const lastUserIndex = findLastIndex(inSegment, isUserMessageThreadItem);
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
