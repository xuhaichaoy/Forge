// Live-thread snapshot merging for the Codex UI reducer (mechanically
// extracted from codex-reducer.ts, logic verbatim): folding `thread/read` /
// `thread/started` snapshots into the streamed in-memory items without
// duplicating rollout-replay rows or losing optimistic local input.
import type { ThreadItem } from "@forge/codex-protocol";
import { stringField } from "../lib/format";
import {
  dedupeConfirmedUserMessagesByContent,
  isConfirmedUserMessage,
  isLocalUserMessage,
  isOptimisticTurnPlaceholder,
  matchingOptimisticUserMessage,
  normalizeUserInputText,
  preserveLocalInputsInConfirmedUserMessages,
  turnIdOf,
  userInputContentKey,
} from "./codex-reducer-item-helpers";
import type { AccumulatedThreadItem } from "./render-group-types";
import { mergeItemsInIncomingOrder } from "./thread-item-merge";

export function mergeLiveThreadSnapshotItems(
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

export function pruneUnusedOptimisticTurnState(
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
