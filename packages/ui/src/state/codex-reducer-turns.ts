// Turn-domain handlers of the Codex UI reducer (mechanically extracted from
// codex-reducer.ts, logic verbatim): turn start/finish lifecycle, per-turn
// segment replacement, turn plan + live diff projection, the client-side
// turn-diff / worked-for / plan-implementation syntheses, and token-speed
// bookkeeping.
import type { Thread, ThreadItem, ThreadStatus } from "@forge/codex-protocol";
import { stringField } from "../lib/format";
import {
  attachTurnId,
  attachTurnMetadataToAll,
  dedupeConfirmedUserMessagesByContent,
  ensureTurnInOrder,
  findLastIndex,
  isConfirmedUserMessage,
  isLocalUserMessage,
  isUserMessageThreadItem,
  isWorkedForThreadItem,
  mergeItems,
  preserveLocalInputsInConfirmedUserMessages,
  turnIdOf,
  userInputContentKey,
  userMessagesHaveSameContent,
} from "./codex-reducer-item-helpers";
import { bindNextOptimisticTurn, upsertItem } from "./codex-reducer-items";
import {
  dedupeStrings,
  normalizeThreadRuntime,
  recordParam,
  selectThreadRuntime,
  threadRuntimePatch,
  turnIdParam,
  withActiveComposerMode,
} from "./codex-reducer-runtime";
import type { CodexUiState } from "./codex-ui-types";
import type { AccumulatedThreadItem } from "./render-group-types";
import { mergeAccumulatedItem, mergeItemsInIncomingOrder } from "./thread-item-merge";
import { streamErrorItem, turnErrorMessage } from "./thread-stream-error";
import {
  completedTokenSpeedPatch,
  liveTokenSpeedRuntimePatch,
  startedTokenSpeedPatch,
} from "./thread-token-usage";
import { turnPatchBatchesFromItems, unifiedDiffFromPatchBatches } from "./turn-diff-from-patches";
import { workedForItemFromTurn } from "./worked-for-item-projection";

// --- turn-domain notification handlers ---------------------------------------

export function handleTurnStartedNotification(state: CodexUiState, params: Record<string, unknown>): CodexUiState {
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

export function handleTurnDiffUpdatedNotification(state: CodexUiState, params: Record<string, unknown>): CodexUiState {
  const threadId = String(params.threadId ?? "");
  const diff = typeof params.diff === "string" ? params.diff : "";
  if (!threadId) return state;
  // codex: `case `turn/diff/updated``  — `let { turnId: e, diff: t } = r.params;
  // this.updateTurnState(i, e, (e) => { e.diff = t })` (app-server-manager-
  // signals-SKi6YePu.js :13076). Keep the owning turn id alongside the diff.
  const turnId = String(params.turnId ?? "");
  return threadRuntimePatch(state, threadId, { turnDiff: diff, turnDiffTurnId: turnId || null });
}

export function updateLiveTokenSpeed(state: CodexUiState, params: Record<string, unknown>): CodexUiState {
  const threadId = stringField(params, "threadId");
  const turnId = turnIdParam(params);
  const delta = stringField(params, "delta");
  if (!threadId || !turnId || !delta) return state;
  const runtime = selectThreadRuntime(state, threadId);
  const patch = liveTokenSpeedRuntimePatch(runtime, turnId, delta);
  return patch ? threadRuntimePatch(state, threadId, patch) : state;
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

export function collectThreadItems(thread: Thread): AccumulatedThreadItem[] {
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
   * Forge previously inserted worked-for before the LAST assistant message
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

export function isTurnStatusInProgress(status: unknown): boolean {
  const value = turnStatusText(status);
  return value === "inProgress" || value === "running" || value === "active";
}

export function isTerminalTurnStatus(status: unknown): boolean {
  const value = turnStatusText(status);
  return value === "completed"
    || value === "failed"
    || value === "interrupted"
    || value === "cancelled"
    || value === "canceled";
}

export function upsertTurnPlan(state: CodexUiState, params: Record<string, unknown>): CodexUiState {
  const threadId = String(params.threadId ?? "");
  const turnId = typeof params.turnId === "string" && params.turnId.length > 0 ? params.turnId : null;
  const plan = Array.isArray(params.plan) ? params.plan : [];
  if (!threadId) return state;
  const explanation = typeof params.explanation === "string" ? params.explanation : null;
  const stateWithProjectionCache = threadRuntimePatch(state, threadId, {
    turnPlan: {
      threadId,
      turnId,
      explanation,
      plan,
      updatedAt: Date.now(),
    },
  });
  const runtime = selectThreadRuntime(stateWithProjectionCache, threadId);
  const item = {
    id: nextTurnPlanTodoListItemId(runtime.items, threadId, turnId),
    type: "todo-list",
    explanation,
    plan,
  } as unknown as ThreadItem;
  return upsertItem(stateWithProjectionCache, threadId, item, turnId);
}

function nextTurnPlanTodoListItemId(
  items: AccumulatedThreadItem[],
  threadId: string,
  turnId: string | null,
): string {
  const prefix = `turn-plan:${threadId}:${turnId ?? "unknown"}:`;
  let max = 0;
  for (const item of items) {
    const id = typeof item.id === "string" ? item.id : "";
    if (!id.startsWith(prefix)) continue;
    const index = Number(id.slice(prefix.length));
    if (Number.isFinite(index) && index > max) max = index;
  }
  return `${prefix}${max + 1}`;
}

// Codex never sends a `planImplementation` thread item over the wire — its
// webview synthesizes one client-side when a turn completes. The Codex bundle's
// app-server-manager (`B_`) scans the just-completed turn for the proposed-plan
// item (raw wire type "plan") and, when it carries text, appends a
// `planImplementation` UI item holding that text; `planImplementationPendingRequest`
// (ForgeApp.tsx) then derives the "Implement this plan?" composer prompt from
// it. Forge already had every downstream half (itemType mapping, the
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

export function finishTurn(
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
  const latestTerminalTurn = {
    turnId: turnId || null,
    status: terminalTurnSnapshotStatus(turnStatus, fallbackStatus),
  };
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
        latestTerminalTurn,
        items: nextItems,
      }),
    },
  };
}

function terminalTurnSnapshotStatus(
  turnStatus: string,
  fallbackStatus: "completed" | "failed" | "interrupted",
): "completed" | "failed" | "interrupted" {
  if (turnStatus === "failed" || turnStatus === "systemError") return "failed";
  if (turnStatus === "interrupted" || turnStatus === "cancelled" || turnStatus === "canceled") return "interrupted";
  return fallbackStatus;
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
