// Item-domain handlers of the Codex UI reducer (mechanically extracted from
// codex-reducer.ts, logic verbatim): optimistic user messages and turn
// binding, item lifecycle/approval/tool notifications, client-synthesized
// timeline items (model reroute, auto-approval review), and the streaming
// text/reasoning delta appenders.
import type { JsonRpcNotification, ThreadItem } from "@forge/codex-protocol";
import { stringField } from "../lib/format";
import { enrichMultiAgentReceiverThreads } from "./collab-receiver-projection";
import {
  applyPreservedConfirmedUserMessages,
  attachTurnId,
  ensureTurnInOrder,
  isConfirmedUserMessage,
  isLocalUserMessage,
  isOptimisticTurnPlaceholder,
  localIdOf,
  mergeItems,
  placeItemInTurn,
  rememberConfirmedWithLocalInputs,
  turnIdOf,
  userInputContentKey,
  userInputContentText,
  userMessageWithPreservedLocalInputs,
  userMessagesHaveSameContent,
} from "./codex-reducer-item-helpers";
import {
  numberParam,
  prependLog,
  recordParam,
  selectThreadRuntime,
  threadRuntimePatch,
  timestampParam,
  turnIdParam,
} from "./codex-reducer-runtime";
import type { CodexUiAction, CodexUiState } from "./codex-ui-types";
import { formatUnknownForLog } from "./notification-log-format";
import type { AccumulatedThreadItem } from "./render-group-types";
import {
  appendTerminalCommandActions,
  parseTerminalInteractionInput,
  terminalInputBuffersWithInput,
} from "./terminal-interaction";

export function applyOptimisticUserMessage(
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

export function applyBindOptimisticTurn(
  state: CodexUiState,
  action: Extract<CodexUiAction, { type: "bindOptimisticTurn" }>,
): CodexUiState {
  return bindOptimisticTurn(state, action.threadId, action.localTurnId, action.turnId);
}

export function bindNextOptimisticTurn(state: CodexUiState, threadId: string, turnId: string): CodexUiState {
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

export function applyDropOptimisticUserMessage(
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

// --- item-domain notification handlers ---------------------------------------

// Handles the 9-method item-lifecycle fall-through group. Reads `message.method`
// to derive the per-event completion bias (any `/completed` suffix is terminal),
// matching Codex Desktop's app-server-manager-signals.
export function handleItemLifecycleNotification(
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

export function handleModelReroutedNotification(state: CodexUiState, params: Record<string, unknown>): CodexUiState {
  /*
   * Codex Desktop's app-server-manager onNotification handler for
   * `model/rerouted` synthesizes a client-side timeline item
   * ({ type:"modelRerouted", fromModel, toModel, reason }) and pushes it
   * into the active turn; the renderer only surfaces reroutes whose reason
   * is "highRiskCyberActivity" (see event-unit.tsx). Forge previously
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

export function handleAutoApprovalReviewNotification(
  state: CodexUiState,
  params: Record<string, unknown>,
): CodexUiState {
  /*
   * Codex Desktop's app-server-manager routes
   * `item/autoApprovalReview/started|completed` to a dedicated synthesizer
   * (bundle `gy`/`hy`): the notification payload IS the review
   * ({ threadId, turnId, startedAtMs, reviewId, targetItemId, review, action }
   * — there is NO `params.item`), so it builds a client-side timeline item and
   * pushes it into the active turn. Forge previously folded both kinds into
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

export function upsertItem(
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

export function appendItemText(
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
    // Turn ownership lives on `_turnId` (attachTurnId / turnIdOf); reading the
    // bare `turnId` here always saw undefined, so this fast-path guard never
    // fired and every streamed token still ran the full projection.
    const projectionSafe = Boolean(record.type)
      && (!turnId || turnIdOf(item) === turnId)
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

export function applyCommandExecutionTerminalInteraction(
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

export function mergeItemFields(
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

export function appendReasoningText(
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

function reasoningParts(item: AccumulatedThreadItem, field: "content" | "summary"): string[] {
  const value = (item as Record<string, unknown>)[field];
  if (Array.isArray(value)) return value.map((part) => typeof part === "string" ? part : formatUnknownForLog(part));
  if (typeof value === "string") return [value];
  return [];
}
