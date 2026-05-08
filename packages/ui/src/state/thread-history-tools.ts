import type { Thread, ThreadItem, UserInput } from "@hicodex/codex-protocol";
import type { ThreadToolHistory } from "../lib/tauri-host";

type ThreadTurn = Thread["turns"][number];
type ItemRecord = ThreadItem & Record<string, unknown>;

export function mergeThreadToolHistory(thread: Thread, history: ThreadToolHistory | null | undefined): Thread {
  if (!history || history.threadId !== thread.id || history.turns.length === 0) return thread;
  const turns = thread.turns.map((turn) => {
    const historyTurn = history.turns.find((item) => item.turnId === turn.id);
    if (!historyTurn || historyTurn.items.length === 0) return turn;
    const replayItems = historyTurn.items.filter(isThreadItemLike) as ThreadItem[];
    if (!replayItems.some(isRecoveredToolItem)) return turn;
    return {
      ...turn,
      items: mergeReplayItems(turn.items, replayItems, turn.id),
    } satisfies ThreadTurn;
  });
  return { ...thread, turns };
}

function mergeReplayItems(existing: ThreadItem[], replayItems: ThreadItem[], turnId: string): ThreadItem[] {
  const merged: ThreadItem[] = [];
  const usedExisting = new Set<number>();
  let searchStart = 0;

  for (const replayItem of replayItems) {
    const existingIndex = findMatchingExisting(existing, replayItem, usedExisting, searchStart);
    if (existingIndex >= 0) {
      merged.push(existing[existingIndex] as ThreadItem);
      usedExisting.add(existingIndex);
      searchStart = existingIndex + 1;
      continue;
    }

    if (isRecoveredToolItem(replayItem) || isRenderableReplayMessage(replayItem)) {
      merged.push(replayItem);
    }
  }

  const mergedIds = new Set(merged.map((item) => item.id));
  const unusedExisting = existing.filter((item, index) => !usedExisting.has(index) && !mergedIds.has(item.id));
  const arranged = unusedExisting.length === 0
    ? dedupeItems(merged)
    : (() => {
        const assistantIndex = findLastIndex(merged, isAssistantMessage);
        return assistantIndex < 0
          ? dedupeItems([...merged, ...unusedExisting])
          : dedupeItems([
              ...merged.slice(0, assistantIndex),
              ...unusedExisting,
              ...merged.slice(assistantIndex),
            ]);
      })();
  return arranged.map((item) => attachTurnIdToReplayItem(item, turnId));
}

function attachTurnIdToReplayItem(item: ThreadItem, turnId: string): ThreadItem {
  if (!turnId) return item;
  const record = item as Record<string, unknown>;
  if (typeof record._turnId === "string" && record._turnId === turnId) return item;
  return { ...(item as object), _turnId: turnId } as unknown as ThreadItem;
}

function findMatchingExisting(
  existing: ThreadItem[],
  replayItem: ThreadItem,
  usedExisting: Set<number>,
  searchStart: number,
): number {
  const idIndex = existing.findIndex((item, index) => !usedExisting.has(index) && item.id === replayItem.id);
  if (idIndex >= 0) return idIndex;

  for (let index = Math.max(0, searchStart); index < existing.length; index += 1) {
    if (usedExisting.has(index)) continue;
    if (sameRenderableItem(existing[index] as ThreadItem, replayItem)) return index;
  }
  for (let index = 0; index < Math.max(0, searchStart); index += 1) {
    if (usedExisting.has(index)) continue;
    if (sameRenderableItem(existing[index] as ThreadItem, replayItem)) return index;
  }
  return -1;
}

function sameRenderableItem(existing: ThreadItem, replayItem: ThreadItem): boolean {
  if (existing.type !== replayItem.type) return false;
  switch (replayItem.type) {
    case "userMessage":
      return existing.type === "userMessage"
        && userInputText(existing.content) === userInputText(replayItem.content);
    case "agentMessage":
      return existing.type === "agentMessage" && existing.text === replayItem.text;
    case "reasoning":
      return existing.type === "reasoning"
        && existing.summary.join("\n") === replayItem.summary.join("\n")
        && existing.content.join("\n") === replayItem.content.join("\n");
    case "webSearch":
      return existing.type === "webSearch" && existing.query === replayItem.query;
    default:
      return false;
  }
}

function userInputText(content: UserInput[]): string {
  return content
    .map((part) => part.type === "text" ? part.text : "")
    .filter(Boolean)
    .join("\n")
    .trim();
}

function isRecoveredToolItem(item: ThreadItem): boolean {
  const record = item as ItemRecord;
  if (record._historyReplay !== true) return false;
  return item.type === "commandExecution"
    || item.type === "fileChange"
    || item.type === "mcpToolCall"
    || item.type === "dynamicToolCall"
    || item.type === "webSearch"
    || item.type === "imageView"
    || item.type === "imageGeneration";
}

function isRenderableReplayMessage(item: ThreadItem): boolean {
  const record = item as ItemRecord;
  if (record._historyReplay !== true) return false;
  return item.type === "userMessage" || item.type === "agentMessage" || item.type === "reasoning";
}

function isThreadItemLike(value: unknown): value is ThreadItem {
  return Boolean(value && typeof value === "object" && typeof (value as { type?: unknown }).type === "string");
}

function isAssistantMessage(item: ThreadItem): boolean {
  return item.type === "agentMessage";
}

function findLastIndex<T>(items: T[], predicate: (item: T) => boolean): number {
  for (let index = items.length - 1; index >= 0; index -= 1) {
    if (predicate(items[index] as T)) return index;
  }
  return -1;
}

function dedupeItems(items: ThreadItem[]): ThreadItem[] {
  const seen = new Set<string>();
  const next: ThreadItem[] = [];
  for (const item of items) {
    if (seen.has(item.id)) continue;
    seen.add(item.id);
    next.push(item);
  }
  return next;
}
