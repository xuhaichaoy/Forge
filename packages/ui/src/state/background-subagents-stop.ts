import type { PendingServerRequest } from "./codex-reducer";
import { pendingRequestOwnerThreadId } from "./pending-request-scope";
import type { RailEntry } from "./render-groups";

export interface BackgroundSubagentStopPlanOptions {
  activeThreadId?: string | null;
  maxThreads?: number;
  readThread: (threadId: string) => Promise<unknown>;
  seedThreadIds: Iterable<string>;
}

const DEFAULT_MAX_STOP_THREADS = 50;

export async function collectBackgroundSubagentStopThreadIds({
  activeThreadId,
  maxThreads = DEFAULT_MAX_STOP_THREADS,
  readThread,
  seedThreadIds,
}: BackgroundSubagentStopPlanOptions): Promise<string[]> {
  const activeId = normalizedId(activeThreadId);
  const visited = new Set<string>();
  const ordered: string[] = [];
  const queue: string[] = [];

  const addThreadId = (value: unknown) => {
    const threadId = normalizedId(value);
    if (!threadId || threadId === activeId || visited.has(threadId) || ordered.length + queue.length >= maxThreads) {
      return;
    }
    visited.add(threadId);
    ordered.push(threadId);
    queue.push(threadId);
  };

  for (const threadId of seedThreadIds) addThreadId(threadId);

  while (queue.length > 0) {
    const threadId = queue.shift();
    if (!threadId) continue;
    try {
      const snapshot = await readThread(threadId);
      for (const receiverThreadId of receiverThreadIdsFromThreadSnapshot(snapshot)) {
        addThreadId(receiverThreadId);
      }
    } catch {
      // Best effort: keep visible/readable targets even when one descendant read fails.
    }
  }

  return ordered;
}

export function receiverThreadIdsFromThreadSnapshot(snapshot: unknown): string[] {
  const thread = threadRecordFromSnapshot(snapshot);
  const turns = Array.isArray(thread?.turns) ? thread.turns : [];
  const receiverThreadIds = new Set<string>();
  for (const turn of turns) {
    const turnRecord = recordObject(turn);
    const items = Array.isArray(turnRecord?.items) ? turnRecord.items : [];
    for (const item of items) {
      const itemRecord = recordObject(item);
      if (itemRecord?.type !== "collabAgentToolCall") continue;
      for (const threadId of arrayStringIds(itemRecord.receiverThreadIds)) {
        receiverThreadIds.add(threadId);
      }
    }
  }
  return Array.from(receiverThreadIds);
}

function threadRecordFromSnapshot(snapshot: unknown): Record<string, unknown> | null {
  const record = recordObject(snapshot);
  const nestedThread = recordObject(record?.thread);
  return nestedThread ?? record;
}

function recordObject(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : null;
}

function arrayStringIds(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  const ids = new Set<string>();
  for (const item of value) {
    const id = normalizedId(item);
    if (id) ids.add(id);
  }
  return Array.from(ids);
}

function normalizedId(value: unknown): string | null {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

export function activeBackgroundSubagentThreadIds(entries: RailEntry[], activeThreadId: string | null): string[] {
  const ids = new Set<string>();
  for (const entry of entries) {
    if (entry.status !== "active" || entry.action?.kind !== "thread") continue;
    const threadId = entry.action.threadId.trim();
    if (!threadId || threadId === activeThreadId || ids.has(threadId)) continue;
    ids.add(threadId);
  }
  return Array.from(ids);
}

export function mergeBackgroundSubagentStopThreadIds(
  activeThreadIds: string[],
  pendingRequests: PendingServerRequest[],
  itemsByThread: Record<string, Array<{ id?: string }>>,
): string[] {
  const ids = new Set(activeThreadIds);
  for (const request of pendingRequests) {
    const threadId = pendingRequestOwnerThreadId(request, { itemsByThread });
    if (!threadId || ids.has(threadId)) continue;
    ids.add(threadId);
  }
  return Array.from(ids);
}
