import type { Thread, ThreadItem } from "@hicodex/codex-protocol";
import { stringField } from "../lib/format";
import type { AccumulatedThreadItem } from "./render-groups";

export function enrichMultiAgentReceiverThreads<T extends AccumulatedThreadItem | ThreadItem>(
  item: T,
  threads: Thread[],
): T {
  const record = item as Record<string, unknown>;
  if (record.type !== "collabAgentToolCall") return item;
  const receiverIds = collabReceiverThreadIds(record);
  if (receiverIds.length === 0) return item;
  const threadsById = new Map(threads.map((thread) => [thread.id, thread]));
  const existingById = collabReceiverThreadsById(record);
  const receiverThreads = receiverIds.map((threadId) => {
    const existing = existingById.get(threadId);
    const thread = threadsById.get(threadId) ?? receiverThreadObject(existing);
    return {
      ...existing,
      threadId,
      thread: thread ?? null,
    };
  });
  return { ...(item as object), receiverThreads } as unknown as T;
}

function collabReceiverThreadIds(record: Record<string, unknown>): string[] {
  const ids = new Set<string>();
  if (Array.isArray(record.receiverThreadIds)) {
    for (const value of record.receiverThreadIds) {
      if (typeof value === "string" && value.trim()) ids.add(value.trim());
    }
  }
  if (Array.isArray(record.receiverThreads)) {
    for (const receiver of record.receiverThreads) {
      if (!receiver || typeof receiver !== "object" || Array.isArray(receiver)) continue;
      const receiverRecord = receiver as Record<string, unknown>;
      const id = stringField(receiverRecord, "threadId") || stringField(receiverRecord, "id");
      if (id.trim()) ids.add(id.trim());
    }
  }
  const states = record.agentsStates;
  if (states && typeof states === "object" && !Array.isArray(states)) {
    for (const id of Object.keys(states)) {
      if (id.trim()) ids.add(id.trim());
    }
  }
  return Array.from(ids);
}

function collabReceiverThreadsById(record: Record<string, unknown>): Map<string, Record<string, unknown>> {
  const byId = new Map<string, Record<string, unknown>>();
  if (!Array.isArray(record.receiverThreads)) return byId;
  for (const receiver of record.receiverThreads) {
    if (!receiver || typeof receiver !== "object" || Array.isArray(receiver)) continue;
    const receiverRecord = receiver as Record<string, unknown>;
    const id = stringField(receiverRecord, "threadId") || stringField(receiverRecord, "id");
    if (id.trim()) byId.set(id.trim(), receiverRecord);
  }
  return byId;
}

function receiverThreadObject(receiver: Record<string, unknown> | undefined): Thread | null {
  const thread = receiver?.thread;
  return thread && typeof thread === "object" && !Array.isArray(thread) ? thread as Thread : null;
}
