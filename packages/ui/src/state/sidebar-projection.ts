import type { Thread } from "@hicodex/codex-protocol";

/**
 * Codex Desktop's `local-environments-*.js` keys per-thread sort time
 * by `(updatedAt ?? createdAt) * 1000`, then sorts descending. Empty groups
 * collapse and never appear in the rail. We mirror that here at the data
 * layer so the sidebar component stays a dumb renderer.
 */

export type SidebarSortKey = "updated_at" | "created_at";
export type SidebarOrganizeMode = "project" | "recent" | "current_workspace";

export const DEFAULT_SIDEBAR_SORT_KEY: SidebarSortKey = "updated_at";
export const DEFAULT_SIDEBAR_ORGANIZE_MODE: SidebarOrganizeMode = "project";

/**
 * Codex Desktop's `is-subagent-conversation-*.js` returns true when
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

export interface SidebarThreadGroupContext {
  organizeMode?: SidebarOrganizeMode;
  currentWorkspaceRoot?: string | null;
  /**
   * Workspace roots the user has selected (via "Use an existing folder" or
   * prior session restore) that should appear in the project list even when
   * no thread has been created in them yet.
   *
   * Mirrors Codex Desktop `sidebar-project-groups-*.js`, whose group builder
   * seeds local project groups from `e?.roots ?? []` with empty
   * `threadKeys` before assigning threads. Without this seed, a
   * freshly-selected workspace stays invisible in the sidebar until the
   * first thread is created.
   */
  selectedWorkspaceRoots?: string[];
}

export interface SidebarThreadGroup {
  key: string;
  label: string;
  path: string | null;
  threads: Thread[];
}

export interface SidebarPinnedThreadSplit {
  pinnedThreads: Thread[];
  unpinnedThreads: Thread[];
}

export interface SidebarWorkspaceRootOption {
  root: string;
  label: string;
}

export interface SidebarThreadStatusState {
  type: "idle" | "loading" | "error";
  unread: boolean;
  /**
   * Number of unread turns. Codex Desktop's `local-task-row-*.js` status slot
   * renders a numeric badge (`Ee`, "3" / "99+") when `unreadCount > 0`, taking
   * priority over the spinner and the plain unread dot. The generated app-server
   * `Thread` type does not expose a count, so we read the Desktop-named loose
   * `unreadCount`/`unread_count` field when present and otherwise fall back to 0
   * (the boolean `unread` dot still covers the common case).
   */
  unreadCount: number;
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
  const sortKey = context.sortKey ?? DEFAULT_SIDEBAR_SORT_KEY;
  const hide = context.hideSubagents ?? !BACKGROUND_SUBAGENTS_GATE;
  const visible = hide ? threads.filter((thread) => !isSubagentThread(thread)) : [...threads];
  visible.sort((left, right) => threadSortAt(right, sortKey) - threadSortAt(left, sortKey));
  return visible;
}

export function splitSidebarThreadsByPinned(
  threads: Thread[],
  pinnedThreadIds: ReadonlySet<string> | null | undefined,
): SidebarPinnedThreadSplit {
  if (!pinnedThreadIds || pinnedThreadIds.size === 0) {
    return { pinnedThreads: [], unpinnedThreads: [...threads] };
  }
  const byId = new Map(threads.map((thread) => [thread.id, thread]));
  const pinnedThreads: Thread[] = [];
  for (const threadId of pinnedThreadIds) {
    const thread = byId.get(threadId);
    if (thread) pinnedThreads.push(thread);
  }
  return {
    pinnedThreads,
    unpinnedThreads: threads.filter((thread) => !pinnedThreadIds.has(thread.id)),
  };
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
export function projectSidebarThreadGroups(
  threads: Thread[],
  context: SidebarThreadGroupContext = {},
): SidebarThreadGroup[] {
  const organizeMode = context.organizeMode ?? DEFAULT_SIDEBAR_ORGANIZE_MODE;
  if (organizeMode === "recent") {
    // codex app-main `sidebarElectron.recentThreads` = "Recent chats" (description
    // "List label for threads in recent section"). Matches HiCodex's own command-panel
    // "Recent chats" group label; the bare "Recent" was an internal inconsistency.
    return threads.length === 0
      ? []
      : [{ key: "recent", label: "Recent chats", path: null, threads: [...threads] }];
  }
  const seedRoots = normalizeSeedWorkspaceRoots(context.selectedWorkspaceRoots);
  if (organizeMode === "current_workspace") {
    const currentRoot = normalizeSidebarWorkspaceRoot(context.currentWorkspaceRoot);
    if (currentRoot) {
      return projectCurrentWorkspaceThreadGroups(threads, currentRoot, seedRoots);
    }
  }
  return projectLocalWorkspaceThreadGroups(threads, seedRoots);
}

function projectLocalWorkspaceThreadGroups(
  threads: Thread[],
  seedRoots: string[] = [],
): SidebarThreadGroup[] {
  const groups: SidebarThreadGroup[] = [];
  const byKey = new Map<string, SidebarThreadGroup>();
  // Seed empty groups from selected workspace roots first, mirroring
  // Codex Desktop's group builder `(e?.roots ?? []).map(...)` in
  // sidebar-project-groups-*.js.
  for (const root of seedRoots) {
    const key = threadProjectKeyForRoot(root);
    if (byKey.has(key)) continue;
    const group: SidebarThreadGroup = {
      key,
      label: workspaceRootLabel(root),
      path: root,
      threads: [],
    };
    byKey.set(key, group);
    groups.push(group);
  }
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

function projectCurrentWorkspaceThreadGroups(
  threads: Thread[],
  currentRoot: string,
  seedRoots: string[] = [],
): SidebarThreadGroup[] {
  const currentThreads: Thread[] = [];
  const otherThreads: Thread[] = [];
  for (const thread of threads) {
    if (threadBelongsToWorkspace(thread, currentRoot)) currentThreads.push(thread);
    else otherThreads.push(thread);
  }
  const groups: SidebarThreadGroup[] = [];
  if (currentThreads.length > 0 || seedRoots.some((root) => threadProjectKeyForRoot(root) === currentRoot)) {
    groups.push({
      key: `current:${currentRoot}`,
      label: "Current workspace",
      path: currentRoot,
      threads: currentThreads,
    });
  }
  const remainingSeedRoots = seedRoots.filter((root) => threadProjectKeyForRoot(root) !== currentRoot);
  groups.push(...projectLocalWorkspaceThreadGroups(otherThreads, remainingSeedRoots));
  return groups;
}

function normalizeSeedWorkspaceRoots(roots: string[] | undefined): string[] {
  if (!roots || roots.length === 0) return [];
  const seen = new Set<string>();
  const out: string[] = [];
  for (const raw of roots) {
    const normalized = normalizeSidebarWorkspaceRoot(raw);
    if (!normalized) continue;
    if (seen.has(normalized)) continue;
    seen.add(normalized);
    out.push(raw.trim());
  }
  return out;
}

function threadProjectKeyForRoot(root: string): string {
  return normalizeSidebarWorkspaceRoot(root) ?? root;
}

export function workspaceRootLabel(root: string): string {
  const trimmed = root?.trim() ?? "";
  if (!trimmed || trimmed === "~" || trimmed === "/") return "Local";
  const normalized = trimmed.replace(/[\\/]+$/, "");
  return normalized.split(/[\\/]+/).filter(Boolean).pop() || trimmed;
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
  const unreadCount = threadUnreadCount(thread);
  const unread = unreadCount > 0 || threadHasUnreadTurn(thread);
  if (threadHasSystemError(thread)) return { type: "error", unread, unreadCount };
  if (threadHasActiveWork(thread)) return { type: "loading", unread, unreadCount };
  return { type: "idle", unread, unreadCount };
}

export function sidebarThreadHasVisibleStatus(state: SidebarThreadStatusState): boolean {
  return state.type !== "idle" || state.unread || state.unreadCount > 0;
}

function threadProjectKey(thread: Thread): string {
  const cwd = threadProjectPath(thread) ?? "";
  if (!cwd || cwd === "~" || cwd === "/") return "local";
  return normalizeSidebarWorkspaceRoot(cwd) ?? cwd;
}

function threadProjectPath(thread: Thread): string | null {
  const cwd = typeof thread.cwd === "string" ? thread.cwd.trim() : "";
  return cwd || null;
}

function normalizeSidebarWorkspaceRoot(value: string | null | undefined): string | null {
  const trimmed = value?.trim() ?? "";
  if (!trimmed || trimmed === "~") return null;
  return trimmed.replace(/[\\/]+$/, "") || trimmed;
}

function threadBelongsToWorkspace(thread: Thread, workspaceRoot: string): boolean {
  const cwd = normalizeSidebarWorkspaceRoot(threadProjectPath(thread));
  if (!cwd) return false;
  if (cwd === workspaceRoot) return true;
  const separator = workspaceRoot.includes("\\") ? "\\" : "/";
  return cwd.startsWith(`${workspaceRoot}${separator}`);
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

/*
 * CODEX-REF: app-server-manager-signals-*.js — Codex sidebar 判断
 * thread 是否活动**只看** `m.thread.status.type !== "active"` 一处（明确的
 * server-pushed status 是 truth source）。`finishTurn` (state/codex-reducer.ts:3042)
 * 已经把 thread.status 切到 `{ type: "idle" }` 当 turn/completed 通知到达，
 * 所以只要信任 thread.status.type，spinner 就会随 thread 结束立即停。
 *
 * HiCodex 之前 4 个 fallback 检查（isInProgress / resumeState / turns[-1].status）
 * 让 idle thread 仍可能被判为 active——因为 `thread.turns` 数组里 latest turn
 * 的 status 字段从未被 turn/completed 通知更新（finishTurn 只改 thread.status，
 * 不动 turns）。结果 sidebar 圆圈动画在 thread 完成后不停。
 *
 * 修复：thread.status.type 存在时**信任它**，不再 fallback；仅当 status 字段
 * 完全缺失（极旧 payload）才走 loose-field 兜底。
 */
function threadHasActiveWork(thread: Thread): boolean {
  const statusType = thread.status?.type;
  if (statusType === "active") return true;
  if (statusType) return false;
  // status 字段完全缺失：兜底走 loose fields（极旧 payload 防御）。
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

function threadUnreadCount(thread: Thread): number {
  const value = looseNumberField(thread, "unreadCount") ?? looseNumberField(thread, "unread_count");
  if (value == null) return 0;
  return value > 0 ? Math.floor(value) : 0;
}

function looseNumberField(thread: Thread, key: string): number | null {
  const value = (thread as Record<string, unknown>)[key];
  return typeof value === "number" && Number.isFinite(value) ? value : null;
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
