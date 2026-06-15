import type { ThreadItem } from "@forge/codex-protocol";
import type { AccumulatedThreadItem } from "./render-groups";

export function mergeItemsInIncomingOrder(
  current: AccumulatedThreadItem[],
  incoming: Array<AccumulatedThreadItem | ThreadItem>,
): AccumulatedThreadItem[] {
  const currentById = new Map(current.map((item) => [item.id, item]));
  const used = new Set<string>();
  const next = incoming.map((item) => {
    used.add(item.id);
    return mergeAccumulatedItem(currentById.get(item.id), item);
  });
  for (const item of current) {
    if (!used.has(item.id)) next.push(item);
  }
  return next;
}

export function mergeAccumulatedItem(
  existing: AccumulatedThreadItem | undefined,
  incoming: AccumulatedThreadItem | ThreadItem,
): AccumulatedThreadItem {
  if (!existing) return incoming as AccumulatedThreadItem;
  if (existing.type === "userMessage") return existing;

  const merged = { ...existing, ...incoming } as AccumulatedThreadItem;
  preserveLongerAccumulatedText(merged, existing, incoming as Record<string, unknown>, "text");
  preserveLongerAccumulatedText(merged, existing, incoming as Record<string, unknown>, "aggregatedOutput");
  preserveLongerAccumulatedText(merged, existing, incoming as Record<string, unknown>, "progress");
  return merged;
}

function preserveLongerAccumulatedText(
  target: Record<string, unknown>,
  existing: Record<string, unknown>,
  incoming: Record<string, unknown>,
  field: string,
): void {
  const existingText = typeof existing[field] === "string" ? existing[field] : null;
  const incomingText = typeof incoming[field] === "string" ? incoming[field] : null;
  if (existingText === null || incomingText === null) return;
  if (existingText.length <= incomingText.length) return;
  if (incomingText.length === 0 || existingText.startsWith(incomingText)) {
    target[field] = existingText;
  }
}
