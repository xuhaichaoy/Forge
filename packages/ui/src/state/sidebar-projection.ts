import type { Thread } from "@hicodex/codex-protocol";

/**
 * Codex Desktop's `local-environments-BnGVEzfq.js` keys per-thread sort time
 * by `(updatedAt ?? createdAt) * 1000`, then sorts descending. Empty groups
 * collapse and never appear in the rail. We mirror that here at the data
 * layer so the sidebar component stays a dumb renderer.
 */

export type SidebarSortKey = "updated_at" | "created_at";

/**
 * Codex Desktop's `is-subagent-conversation-Ce7kusa7.js` returns true when
 * the conversation has a parent thread id. The shipped backend exposes that
 * through `threadSource === "subagent"` (see `ThreadSource.ts`); both
 * `agentNickname` and `agentRole` also light up when a thread was spawned
 * via the AgentControl multi-agent flow. We treat any of those signals as
 * "this is a child agent" so the main sidebar can hide it the same way the
 * Desktop chrome does behind the `BACKGROUND_SUBAGENTS_GATE` flag.
 */
export function isSubagentThread(thread: Thread): boolean {
  if (thread.threadSource === "subagent") return true;
  if (threadHasSubagentParentSource(thread)) return true;
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

export interface SidebarThreadGroup {
  key: string;
  label: string;
  path: string | null;
  threads: Thread[];
}

export interface SidebarWorkspaceRootOption {
  root: string;
  label: string;
}

export interface SidebarThreadStatusState {
  type: "idle" | "loading" | "error";
  unread: boolean;
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

/**
 * Desktop groups sidebar entries by connection/project. HiCodex only has local
 * app-server threads today, so we mirror the local project half by cwd while
 * preserving the already sorted thread order inside each group.
 */
export function projectSidebarThreadGroups(threads: Thread[]): SidebarThreadGroup[] {
  const groups: SidebarThreadGroup[] = [];
  const byKey = new Map<string, SidebarThreadGroup>();
  for (const thread of threads) {
    const key = threadProjectKey(thread);
    let group = byKey.get(key);
    if (!group) {
      group = { key, label: threadProjectLabel(thread), path: threadProjectPath(thread), threads: [] };
      byKey.set(key, group);
      groups.push(group);
    }
    group.threads.push(thread);
  }
  return groups;
}

/**
 * Desktop's composer project dropdown (`composer-*.js::Db/Mb`) is fed by the
 * same project groups as the sidebar and selects local projects by root path.
 * HiCodex only has local app-server threads for now, so expose the cwd-backed
 * roots that already exist in the thread list.
 */
export function projectSidebarWorkspaceRootOptions(threads: Thread[]): SidebarWorkspaceRootOption[] {
  const options: SidebarWorkspaceRootOption[] = [];
  const seen = new Set<string>();
  for (const thread of projectSidebarThreads(threads)) {
    const root = threadProjectPath(thread);
    if (!root || root === "~") continue;
    const normalized = root.replace(/[\\/]+$/, "") || root;
    if (seen.has(normalized)) continue;
    seen.add(normalized);
    options.push({ root: normalized, label: threadProjectLabel(thread) });
  }
  return options;
}

export function threadProjectLabel(thread: Thread): string {
  const cwd = threadProjectPath(thread) ?? "";
  if (!cwd || cwd === "~" || cwd === "/") return "Local";
  const normalized = cwd.replace(/[\\/]+$/, "");
  return normalized.split(/[\\/]+/).filter(Boolean).pop() || cwd;
}

export function sidebarThreadRelativeTime(thread: Thread, nowMs = Date.now()): string {
  const at = threadSortAt(thread, "updated_at");
  if (at <= 0) return "";
  const elapsed = Math.max(0, nowMs - at);
  const minute = 60_000;
  const hour = 60 * minute;
  const day = 24 * hour;
  const week = 7 * day;
  const month = 30 * day;
  const year = 365 * day;
  if (elapsed < minute) return "1m";
  if (elapsed < hour) return `${Math.floor(elapsed / minute)}m`;
  if (elapsed < day) return `${Math.floor(elapsed / hour)}h`;
  if (elapsed < week) return `${Math.floor(elapsed / day)}d`;
  if (elapsed < month) return `${Math.floor(elapsed / week)}w`;
  if (elapsed < year) return `${Math.floor(elapsed / month)}mo`;
  return `${Math.floor(elapsed / year)}y`;
}

/**
 * Codex Desktop's `local-conversation-thread-*.js` projects local rows through
 * `Eu -> tu -> Yl`: `xu` maps active work to `loading`, system errors to
 * `error`, and `hasUnreadTurn` to the unread dot. The generated app-server
 * `Thread` type does not expose every Desktop local-conversation field, so we
 * prefer stable protocol fields and only read Desktop-named loose fields when
 * they are present on the payload.
 */
export function sidebarThreadStatusState(thread: Thread): SidebarThreadStatusState {
  const unread = threadHasUnreadTurn(thread);
  if (threadHasSystemError(thread)) return { type: "error", unread };
  if (threadHasActiveWork(thread)) return { type: "loading", unread };
  return { type: "idle", unread };
}

export function sidebarThreadHasVisibleStatus(state: SidebarThreadStatusState): boolean {
  return state.type !== "idle" || state.unread;
}

function threadProjectKey(thread: Thread): string {
  const cwd = threadProjectPath(thread) ?? "";
  if (!cwd || cwd === "~" || cwd === "/") return "local";
  return cwd.replace(/[\\/]+$/, "");
}

function threadProjectPath(thread: Thread): string | null {
  const cwd = typeof thread.cwd === "string" ? thread.cwd.trim() : "";
  return cwd || null;
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

function threadHasActiveWork(thread: Thread): boolean {
  if (thread.status?.type === "active") return true;
  const explicit = looseBooleanField(thread, "isInProgress");
  if (explicit != null) return explicit;
  const resumeState = looseStringField(thread, "resumeState");
  if (resumeState === "needs_resume") return false;
  if (resumeState === "resuming") return true;
  const latestTurn = thread.turns.at(-1);
  return latestTurn?.status === "inProgress";
}

function threadHasSystemError(thread: Thread): boolean {
  return thread.status?.type === "systemError";
}

function threadHasUnreadTurn(thread: Thread): boolean {
  return looseBooleanField(thread, "hasUnreadTurn") === true || looseBooleanField(thread, "has_unread_turn") === true;
}

function looseBooleanField(thread: Thread, key: string): boolean | null {
  const value = (thread as Record<string, unknown>)[key];
  return typeof value === "boolean" ? value : null;
}

function looseStringField(thread: Thread, key: string): string | null {
  const value = (thread as Record<string, unknown>)[key];
  return typeof value === "string" ? value : null;
}

function threadHasSubagentParentSource(thread: Thread): boolean {
  const source = (thread as { source?: unknown }).source;
  if (!source || typeof source !== "object") return false;
  const sourceRecord = source as Record<string, unknown>;
  if (typeof sourceRecord.parentThreadId === "string" && sourceRecord.parentThreadId.length > 0) return true;
  const subAgent = sourceRecord.subAgent;
  if (!subAgent || typeof subAgent !== "object") return false;
  const subAgentRecord = subAgent as Record<string, unknown>;
  const threadSpawn = subAgentRecord.thread_spawn;
  if (threadSpawn && typeof threadSpawn === "object") {
    const parentThreadId = (threadSpawn as Record<string, unknown>).parent_thread_id;
    return typeof parentThreadId === "string" && parentThreadId.length > 0;
  }
  return false;
}
