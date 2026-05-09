import type { Thread } from "@hicodex/codex-protocol";

/**
 * Codex Desktop's `local-environments-Bg3IFzx3.js` keys per-thread sort time
 * by `(updatedAt ?? createdAt) * 1000`, then sorts descending. Empty groups
 * collapse and never appear in the rail. We mirror that here at the data
 * layer so the sidebar component stays a dumb renderer.
 */

export type SidebarSortKey = "updated_at" | "created_at";

/**
 * Codex Desktop's `is-subagent-conversation-CE49qtiB.js` returns true when
 * the conversation has a parent thread id. The shipped backend exposes that
 * through `threadSource === "subagent"` (see `ThreadSource.ts`); both
 * `agentNickname` and `agentRole` also light up when a thread was spawned
 * via the AgentControl multi-agent flow. We treat any of those signals as
 * "this is a child agent" so the main sidebar can hide it the same way the
 * Desktop chrome does behind the `BACKGROUND_SUBAGENTS_GATE` flag.
 */
export function isSubagentThread(thread: Thread): boolean {
  if (thread.threadSource === "subagent") return true;
  return Boolean(thread.agentNickname) || Boolean(thread.agentRole);
}

/**
 * Same shape as Codex Desktop's `BACKGROUND_SUBAGENTS_ENABLED`. Until we
 * ship a real settings panel, we mirror the Desktop default which keeps
 * spawned sub-agents OUT of the primary sidebar list.
 */
export const BACKGROUND_SUBAGENTS_GATE = false;

export interface ThreadSortContext {
  sortKey?: SidebarSortKey;
  hideSubagents?: boolean;
}

/**
 * Convert the live thread set into the ordered list the sidebar renders.
 * Sort is `updated_at desc` by default (Codex Desktop's `getThreadAt`),
 * with `created_at` available as a secondary mode for parity. Sub-agent
 * threads are filtered out unless the gate is open or explicitly disabled.
 */
export function projectSidebarThreads(
  threads: Thread[],
  context: ThreadSortContext = {},
): Thread[] {
  const sortKey = context.sortKey ?? "updated_at";
  const hide = context.hideSubagents ?? !BACKGROUND_SUBAGENTS_GATE;
  const visible = hide ? threads.filter((thread) => !isSubagentThread(thread)) : [...threads];
  visible.sort((left, right) => threadSortAt(right, sortKey) - threadSortAt(left, sortKey));
  return visible;
}

export function threadSortAt(thread: Thread, sortKey: SidebarSortKey): number {
  const seconds = sortKey === "created_at"
    ? threadCreatedSeconds(thread)
    : threadUpdatedSeconds(thread);
  return seconds * 1000;
}

function threadUpdatedSeconds(thread: Thread): number {
  const updated = numericField(thread, "updatedAt");
  if (updated > 0) return updated;
  return numericField(thread, "createdAt");
}

function threadCreatedSeconds(thread: Thread): number {
  return numericField(thread, "createdAt");
}

function numericField(thread: Thread, key: "createdAt" | "updatedAt"): number {
  const value = (thread as Record<string, unknown>)[key];
  return typeof value === "number" && Number.isFinite(value) && value > 0 ? value : 0;
}
