// Runtime-slice core of the Codex UI reducer (mechanically extracted from
// codex-reducer.ts, logic verbatim): initial state, runtime selectors, the
// normalize/patch pipeline shared by every domain handler, the log buffer,
// and the shared params coercion helpers.
import type { CollaborationMode } from "@forge/codex-protocol";
import { initialAccountState } from "./account-state";
import { composerModeFromCollaborationMode } from "./collaboration-modes";
import type { CodexUiState, ThreadRuntimeSlice } from "./codex-ui-types";
import type { ComposerMode } from "./composer-workflow";
import type { AccumulatedThreadItem } from "./render-group-types";
import { projectRuntimeItemStatus } from "./thread-item-status-projection";

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

export function normalizeThreadRuntime(
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

export function dedupeStrings(values: string[]): string[] {
  const next: string[] = [];
  for (const value of values) {
    if (value && !next.includes(value)) next.push(value);
  }
  return next;
}

export function pruneTerminalInputBuffersForThread(
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

export function threadRuntimePatch(
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

export function withActiveComposerMode(state: CodexUiState): CodexUiState {
  return {
    ...state,
    composerMode: selectThreadComposerMode(state, state.activeThreadId),
  };
}

/*
 * Monotonic log id: the previous `Date.now()+logs.length` scheme collided once
 * the log buffer hit its 120-entry cap (length pinned) and two logs landed in
 * the same millisecond — duplicate React keys in the toast viewport and
 * dismiss-by-id hiding both lines. Same pattern as thread-workflow's
 * optimistic id counter.
 */
let logIdCounter = 0;

export function prependLog(
  state: CodexUiState,
  text: string,
  level: "info" | "warn" | "error" | "success" = "info",
  // Structured origin tag (LogLine.source) — the toast viewport mutes by this
  // instead of matching localizable copy. Omitted (not set to undefined) on
  // untagged entries so log objects stay clean for deep-equal assertions.
  source?: string,
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
        ...(source !== undefined ? { source } : {}),
      },
      ...state.logs,
    ].slice(0, 120),
  };
}

export function recordParam(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" ? value as Record<string, unknown> : null;
}

export function timestampParam(params: Record<string, unknown>, key: string): number | null {
  const value = params[key];
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

export function turnIdParam(params: Record<string, unknown>): string | null {
  return typeof params.turnId === "string" && params.turnId.length > 0 ? params.turnId : null;
}

export function numberParam(params: Record<string, unknown>, key: string): number {
  const value = params[key];
  return typeof value === "number" && Number.isFinite(value) && value >= 0 ? Math.floor(value) : 0;
}
