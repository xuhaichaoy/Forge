import type { Thread, ThreadItem, UserInput } from "@forge/codex-protocol";
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

    // Only inject tool replay items when the server snapshot lacks them.
    // userMessage / agentMessage / reasoning have authoritative protocol
    // sources (`item/started`, `turn/started`, and `thread/read.turn.items`),
    // so the rollout reader's synthesized `history-user:*` / `history-agent:*`
    // / `history-reasoning:*` ids must never coexist alongside the streamed
    // server-id versions during a live turn — that double-injection produced
    // the visible "phantom prefix" duplicate of commentary + tool block above
    // the user prompt when the user switched away mid-stream and back.
    if (isRecoveredToolItem(replayItem)) {
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
    case "collabAgentToolCall":
      return collabToolCallKey(existing) === collabToolCallKey(replayItem);
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
    || item.type === "collabAgentToolCall"
    || item.type === "webSearch"
    || item.type === "imageView"
    || item.type === "imageGeneration";
}

function collabToolCallKey(item: ThreadItem): string {
  const record = item as ItemRecord;
  if (record.type !== "collabAgentToolCall") return "";
  return [
    fieldText(record, "tool") || fieldText(record, "action"),
    fieldText(record, "senderThreadId"),
    normalizeText(fieldText(record, "prompt")),
    fieldText(record, "model"),
    fieldText(record, "reasoningEffort"),
  ].join("\u001f");
}

function fieldText(record: Record<string, unknown>, key: string): string {
  const value = record[key];
  return typeof value === "string" ? value.trim() : "";
}

function normalizeText(value: string): string {
  return value.replace(/\r\n?/g, "\n").trim();
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
