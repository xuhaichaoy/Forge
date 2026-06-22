// Item-identity and user-message reconciliation helpers of the Codex UI
// reducer (mechanically extracted from codex-reducer.ts, logic verbatim):
// turn stamping, segment-aware item placement/merge, optimistic-vs-confirmed
// user-message content keying, and local-input preservation.
import type { ThreadItem } from "@forge/codex-protocol";
import { OPTIMISTIC_TURN_PLACEHOLDER_PREFIX } from "./codex-ui-types";
import type { AccumulatedThreadItem } from "./render-group-types";
import { mergeAccumulatedItem } from "./thread-item-merge";

export function isOptimisticTurnPlaceholder(turnId: string): boolean {
  return turnId.startsWith(OPTIMISTIC_TURN_PLACEHOLDER_PREFIX);
}

export function findLastIndex<T>(items: T[], predicate: (item: T) => boolean): number {
  for (let index = items.length - 1; index >= 0; index -= 1) {
    if (predicate(items[index] as T)) return index;
  }
  return -1;
}

export function isWorkedForThreadItem(item: ThreadItem | AccumulatedThreadItem): boolean {
  const type = String((item as Record<string, unknown>).type ?? "");
  return type === "worked-for" || type === "workedFor";
}

export function mergeItems(
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
export function placeItemInTurn(
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

export function turnIdOf(item: AccumulatedThreadItem | ThreadItem | undefined | null): string | null {
  if (!item) return null;
  const value = (item as Record<string, unknown>)._turnId;
  return typeof value === "string" && value.length > 0 ? value : null;
}

export function localIdOf(item: AccumulatedThreadItem | ThreadItem | undefined | null): string | null {
  if (!item) return null;
  const value = (item as Record<string, unknown>)._localId;
  return typeof value === "string" && value.length > 0 ? value : null;
}

export function ensureTurnInOrder(order: string[], turnId: string | null | undefined): string[] {
  if (!turnId) return order;
  if (order.includes(turnId)) return order;
  return [...order, turnId];
}

export function attachTurnId(
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

export function attachTurnMetadataToAll(
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

export function isLocalUserMessage(item: AccumulatedThreadItem | ThreadItem): item is AccumulatedThreadItem {
  return String((item as Record<string, unknown>).type ?? "") === "userMessage" && Boolean(localIdOf(item));
}

export function isConfirmedUserMessage(item: AccumulatedThreadItem | ThreadItem): item is AccumulatedThreadItem {
  return String((item as Record<string, unknown>).type ?? "") === "userMessage" && !localIdOf(item);
}

export function isUserMessageThreadItem(item: AccumulatedThreadItem | ThreadItem): boolean {
  return String((item as Record<string, unknown>).type ?? "") === "userMessage";
}

export function userMessagesHaveSameContent(
  left: AccumulatedThreadItem | ThreadItem,
  right: AccumulatedThreadItem | ThreadItem,
): boolean {
  const leftKey = userInputContentKey((left as Record<string, unknown>).content);
  const rightKey = userInputContentKey((right as Record<string, unknown>).content);
  return Boolean(leftKey && rightKey && leftKey === rightKey);
}

export function userInputContentKey(value: unknown): string {
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

export function normalizeUserInputText(value: string): string {
  return value.replace(/\r\n?/g, "\n").trim();
}

export function userInputContentText(value: unknown): string {
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

export function preserveLocalInputsInConfirmedUserMessages<T extends AccumulatedThreadItem | ThreadItem>(
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

export function matchingOptimisticUserMessage(
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

export function userMessageWithPreservedLocalInputs<T extends AccumulatedThreadItem | ThreadItem>(
  confirmed: T,
  optimistic: AccumulatedThreadItem | ThreadItem,
): T {
  const mergedContent = userInputContentWithPreservedLocalInputs(
    (confirmed as Record<string, unknown>).content,
    (optimistic as Record<string, unknown>).content,
  );
  const withContent = mergedContent === (confirmed as Record<string, unknown>).content
    ? confirmed
    : { ...(confirmed as object), content: mergedContent } as T;
  return userMessageWithPreservedSteeringStatus(withContent, optimistic);
}

function userMessageWithPreservedSteeringStatus<T extends AccumulatedThreadItem | ThreadItem>(
  confirmed: T,
  optimistic: AccumulatedThreadItem | ThreadItem,
): T {
  const confirmedStatus = (confirmed as Record<string, unknown>).steeringStatus;
  if (typeof confirmedStatus === "string" && confirmedStatus.length > 0) return confirmed;
  const optimisticStatus = (optimistic as Record<string, unknown>).steeringStatus;
  if (typeof optimisticStatus !== "string" || optimisticStatus.length === 0) return confirmed;
  return { ...(confirmed as object), steeringStatus: "accepted" } as unknown as T;
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

export function rememberConfirmedWithLocalInputs(
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

export function applyPreservedConfirmedUserMessages(
  items: AccumulatedThreadItem[],
  preservedConfirmedById: Map<string, AccumulatedThreadItem>,
): AccumulatedThreadItem[] {
  if (preservedConfirmedById.size === 0) return items;
  return items.map((item) => preservedConfirmedById.get(item.id) ?? item);
}

export function dedupeConfirmedUserMessagesByContent(
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
