import {
  CHATS_GROUP_KEY,
  isProjectlessThreadCwd,
  isSubagentThread,
  projectSidebarThreadGroups,
  projectSidebarThreads,
  projectSidebarWorkspaceRootOptions,
  sidebarThreadHasVisibleStatus,
  sidebarThreadRelativeTime,
  sidebarThreadStatusState,
  splitSidebarThreadsByPinned,
  threadProjectLabel,
  threadSortAt,
} from "../src/state/sidebar-projection";
import type { Thread } from "@forge/codex-protocol";

const assert = (condition: unknown, message: string): void => {
  if (!condition) throw new Error(message);
};

export default function runSidebarProjectionTests(): void {
  sortsThreadsByUpdatedAtDescending();
  sortsThreadsByCreatedAtDescendingWhenRequested();
  hidesSpawnedSubagentThreadsByDefault();
  treatsAgentNicknameAsSubagentSignal();
  treatsSubagentSourceParentAsSubagentSignal();
  fallsBackToCreatedAtWhenUpdatedAtMissing();
  formatsCompactUpdatedAtTimeLikeDesktopSidebar();
  projectsActiveThreadStatusLikeDesktopSidebar();
  projectsUnreadThreadStatusLikeDesktopSidebar();
  projectsSystemErrorThreadStatusLikeDesktopSidebar();
  projectsThreadProjectLabelFromCwd();
  projectsWorkspaceRootOptionsFromVisibleLocalThreads();
  splitsPinnedThreadsBeforeProjectGrouping();
  groupsThreadsByLocalProjectWithoutReordering();
  groupsThreadsAsRecentWhenOrganizeModeRequestsRecent();
  groupsCurrentWorkspaceThreadsBeforeOtherLocalProjects();
  collapsesProjectlessThreadsIntoOneChatsGroup();
  detectsProjectlessThreadCwdUnderDocumentsCodex();
  excludesProjectlessThreadsFromWorkspaceRootOptions();
}

function makeThread(overrides: Partial<Thread> & Record<string, unknown>): Thread {
  return {
    id: overrides.id ?? "thread-x",
    sessionId: String(overrides.sessionId ?? overrides.id ?? "thread-x"),
    forkedFromId: null,
    preview: "",
    ephemeral: false,
    modelProvider: "openai",
    createdAt: overrides.createdAt ?? 0,
    updatedAt: overrides.updatedAt ?? 0,
    status: ({ type: "completed" } as unknown) as Thread["status"],
    path: null,
    cwd: ("/tmp/project" as unknown) as Thread["cwd"],
    cliVersion: "0.0.0",
    source: ("appServer" as unknown) as Thread["source"],
    threadSource: overrides.threadSource ?? null,
    agentNickname: overrides.agentNickname ?? null,
    agentRole: overrides.agentRole ?? null,
    gitInfo: null,
    name: overrides.name ?? null,
    turns: [],
    ...overrides,
  };
}

function sortsThreadsByUpdatedAtDescending(): void {
  const threads = [
    makeThread({ id: "old", updatedAt: 100 }),
    makeThread({ id: "newest", updatedAt: 300 }),
    makeThread({ id: "mid", updatedAt: 200 }),
  ];
  const projected = projectSidebarThreads(threads);
  assert(
    projected.map((thread) => thread.id).join(",") === "newest,mid,old",
    `expected updated_at desc, got ${projected.map((thread) => thread.id).join(",")}`,
  );
}

function sortsThreadsByCreatedAtDescendingWhenRequested(): void {
  const threads = [
    makeThread({ id: "old", createdAt: 100, updatedAt: 900 }),
    makeThread({ id: "newest-created", createdAt: 300, updatedAt: 100 }),
    makeThread({ id: "mid", createdAt: 200, updatedAt: 800 }),
  ];
  const projected = projectSidebarThreads(threads, { sortKey: "created_at" });
  assert(
    projected.map((thread) => thread.id).join(",") === "newest-created,mid,old",
    `expected created_at desc, got ${projected.map((thread) => thread.id).join(",")}`,
  );
}

function hidesSpawnedSubagentThreadsByDefault(): void {
  const threads = [
    makeThread({ id: "user", updatedAt: 200 }),
    makeThread({ id: "subagent", updatedAt: 300, threadSource: "subagent" }),
  ];
  const projected = projectSidebarThreads(threads);
  assert(projected.length === 1, `expected to drop subagent thread, got ${projected.length}`);
  assert(projected[0]?.id === "user", "user thread must remain visible");
}

function treatsAgentNicknameAsSubagentSignal(): void {
  const subagent = makeThread({ id: "spawned", agentNickname: "scout", updatedAt: 100 });
  assert(isSubagentThread(subagent), "agentNickname presence should classify thread as subagent");
}

function treatsSubagentSourceParentAsSubagentSignal(): void {
  const subagent = makeThread({
    id: "spawned-source",
    source: ({ subAgent: { thread_spawn: { parent_thread_id: "parent", depth: 1, agent_path: null, agent_nickname: null, agent_role: null } } } as unknown) as Thread["source"],
    updatedAt: 100,
  });
  assert(isSubagentThread(subagent), "source.subAgent.thread_spawn.parent_thread_id should classify thread as subagent");
}

function fallsBackToCreatedAtWhenUpdatedAtMissing(): void {
  const thread = makeThread({ id: "fresh", updatedAt: 0, createdAt: 50 });
  assert(threadSortAt(thread, "updated_at") === 50_000, "fallback to createdAt when updatedAt is zero");
}

function formatsCompactUpdatedAtTimeLikeDesktopSidebar(): void {
  const now = 1_700_000_000_000;
  assert(
    sidebarThreadRelativeTime(makeThread({ updatedAt: (now - 10_000) / 1000 }), now) === "1m",
    "sub-minute times should use Desktop's minimum one-minute compact form",
  );
  assert(
    sidebarThreadRelativeTime(makeThread({ updatedAt: (now - 9 * 60_000) / 1000 }), now) === "9m",
    "minutes should use compact sidebar form",
  );
  assert(
    sidebarThreadRelativeTime(makeThread({ updatedAt: (now - 10 * 60 * 60_000) / 1000 }), now) === "10h",
    "hours should use compact sidebar form",
  );
  assert(
    sidebarThreadRelativeTime(makeThread({ updatedAt: (now - 2 * 24 * 60 * 60_000) / 1000 }), now) === "2d",
    "days should use compact sidebar form",
  );
  // codex format-relative-date-time-*.js derives days from CALENDAR-day diff, not
  // elapsed ms: 27h spanning two calendar dates reads "2d" (elapsed-ms math gives
  // "1d"). Built from local Date parts so the calendar diff is timezone-stable.
  const calNow = new Date(2026, 5, 7, 2, 0, 0).getTime();
  const calThen = new Date(2026, 5, 5, 23, 0, 0).getTime();
  assert(
    sidebarThreadRelativeTime(makeThread({ updatedAt: calThen / 1000 }), calNow) === "2d",
    "27h spanning two calendar dates should read 2d like Codex (calendar-day, not elapsed-ms)",
  );
}

function projectsActiveThreadStatusLikeDesktopSidebar(): void {
  const status = sidebarThreadStatusState(makeThread({ status: { type: "active", activeFlags: [] } }));
  assert(status.type === "loading", `active protocol status should render loading, got ${status.type}`);
  assert(sidebarThreadHasVisibleStatus(status), "active thread status should be visible");

  // CODEX-REF: app-server-manager-signals-Csopz8aM.js — sidebar 只看 thread.status.type === "active"。
  // thread.status 是 server-pushed truth；当 thread.status 已是 terminal (completed/idle/systemError)
  // 即使 latestTurn 仍 inProgress（数组未被 finishTurn 更新），sidebar 也不应再显示 loading。
  const terminalWithInProgressTurn = sidebarThreadStatusState(makeThread({
    status: ({ type: "completed" } as unknown) as Thread["status"],
    turns: [{
      id: "turn-1",
      items: [],
      itemsView: "full",
      status: "inProgress",
      error: null,
      startedAt: null,
      completedAt: null,
      durationMs: null,
    }],
  }));
  assert(
    terminalWithInProgressTurn.type !== "loading",
    `terminal thread.status must NOT render loading even with stale inProgress turn, got ${terminalWithInProgressTurn.type}`,
  );

  // 仅当 thread.status 缺失时，才走 turns[-1].status === "inProgress" 兜底。
  const fallbackTurn = sidebarThreadStatusState(makeThread({
    status: (undefined as unknown) as Thread["status"],
    turns: [{
      id: "turn-1",
      items: [],
      itemsView: "full",
      status: "inProgress",
      error: null,
      startedAt: null,
      completedAt: null,
      durationMs: null,
    }],
  }));
  assert(
    fallbackTurn.type === "loading",
    `missing thread.status with inProgress turn should fallback to loading, got ${fallbackTurn.type}`,
  );
}

function projectsUnreadThreadStatusLikeDesktopSidebar(): void {
  const status = sidebarThreadStatusState(makeThread({ hasUnreadTurn: true }));
  assert(status.unread === true, "hasUnreadTurn loose payload should set unread state");
  assert(status.type === "idle", `unread idle thread should keep idle type, got ${status.type}`);
  assert(sidebarThreadHasVisibleStatus(status), "unread status should be visible");
}

function projectsSystemErrorThreadStatusLikeDesktopSidebar(): void {
  const status = sidebarThreadStatusState(makeThread({ status: { type: "systemError" } }));
  assert(status.type === "error", `systemError protocol status should render error, got ${status.type}`);
}

function projectsThreadProjectLabelFromCwd(): void {
  assert(
    threadProjectLabel(makeThread({ cwd: ("/Users/haichao/Desktop/data/HiCodex/" as unknown) as Thread["cwd"] })) === "HiCodex",
    "project label should use cwd basename",
  );
  assert(threadProjectLabel(makeThread({ cwd: ("~" as unknown) as Thread["cwd"] })) === "Local", "home cwd should render Local");
  assert(threadProjectLabel(makeThread({ cwd: ("/" as unknown) as Thread["cwd"] })) === "Local", "root cwd should render Local");
}

function projectsWorkspaceRootOptionsFromVisibleLocalThreads(): void {
  const options = projectSidebarWorkspaceRootOptions([
    makeThread({ id: "hidden-subagent", cwd: ("/workspace/agent" as unknown) as Thread["cwd"], threadSource: "subagent", updatedAt: 300 }),
    makeThread({ id: "newer", cwd: ("/workspace/app/" as unknown) as Thread["cwd"], updatedAt: 200 }),
    makeThread({ id: "older-duplicate", cwd: ("/workspace/app" as unknown) as Thread["cwd"], updatedAt: 100 }),
    makeThread({ id: "projectless", cwd: ("~" as unknown) as Thread["cwd"], updatedAt: 50 }),
  ]);
  assert(options.length === 1, `expected one local workspace root, got ${options.length}`);
  assert(options[0]?.root === "/workspace/app", `expected normalized root, got ${options[0]?.root}`);
  assert(options[0]?.label === "app", `expected cwd basename label, got ${options[0]?.label}`);
}

function splitsPinnedThreadsBeforeProjectGrouping(): void {
  const threads = [
    makeThread({ id: "newer", cwd: ("/work/a" as unknown) as Thread["cwd"], updatedAt: 300 }),
    makeThread({ id: "older-pinned", cwd: ("/work/b" as unknown) as Thread["cwd"], updatedAt: 100 }),
    makeThread({ id: "newer-pinned", cwd: ("/work/c" as unknown) as Thread["cwd"], updatedAt: 200 }),
  ];
  const split = splitSidebarThreadsByPinned(threads, new Set(["newer-pinned", "missing", "older-pinned"]));
  assert(
    split.pinnedThreads.map((thread) => thread.id).join(",") === "newer-pinned,older-pinned",
    `expected pinned section to follow pinned id order, got ${split.pinnedThreads.map((thread) => thread.id).join(",")}`,
  );
  assert(
    split.unpinnedThreads.map((thread) => thread.id).join(",") === "newer",
    `expected unpinned section to preserve caller order, got ${split.unpinnedThreads.map((thread) => thread.id).join(",")}`,
  );
}

function groupsThreadsByLocalProjectWithoutReordering(): void {
  const groups = projectSidebarThreadGroups([
    makeThread({ id: "a-new", cwd: ("/work/a" as unknown) as Thread["cwd"] }),
    makeThread({ id: "b", cwd: ("/work/b" as unknown) as Thread["cwd"] }),
    makeThread({ id: "a-old", cwd: ("/work/a/" as unknown) as Thread["cwd"] }),
  ]);
  assert(groups.length === 2, `expected two project groups, got ${groups.length}`);
  assert(groups[0]?.label === "a", `expected first project label a, got ${groups[0]?.label}`);
  assert(
    groups[0]?.threads.map((thread) => thread.id).join(",") === "a-new,a-old",
    `expected project group to preserve thread order, got ${groups[0]?.threads.map((thread) => thread.id).join(",")}`,
  );
  assert(groups[1]?.label === "b", `expected second project label b, got ${groups[1]?.label}`);
}

function groupsThreadsAsRecentWhenOrganizeModeRequestsRecent(): void {
  const groups = projectSidebarThreadGroups([
    makeThread({ id: "a", cwd: ("/work/a" as unknown) as Thread["cwd"] }),
    makeThread({ id: "b", cwd: ("/work/b" as unknown) as Thread["cwd"] }),
  ], { organizeMode: "recent" });
  assert(groups.length === 1, `expected one recent group, got ${groups.length}`);
  assert(groups[0]?.key === "recent", `expected recent group key, got ${groups[0]?.key}`);
  assert(
    groups[0]?.threads.map((thread) => thread.id).join(",") === "a,b",
    `expected recent group to preserve caller sort order, got ${groups[0]?.threads.map((thread) => thread.id).join(",")}`,
  );
}

function groupsCurrentWorkspaceThreadsBeforeOtherLocalProjects(): void {
  const groups = projectSidebarThreadGroups([
    makeThread({ id: "outside", cwd: ("/work/other" as unknown) as Thread["cwd"] }),
    makeThread({ id: "inside-child", cwd: ("/work/app/packages/ui" as unknown) as Thread["cwd"] }),
    makeThread({ id: "inside-root", cwd: ("/work/app/" as unknown) as Thread["cwd"] }),
  ], { organizeMode: "current_workspace", currentWorkspaceRoot: "/work/app/" });
  assert(groups.length === 2, `expected current workspace plus other project, got ${groups.length}`);
  assert(groups[0]?.key === "current:/work/app", `expected current workspace key, got ${groups[0]?.key}`);
  assert(groups[0]?.label === "Current workspace", `expected current workspace label, got ${groups[0]?.label}`);
  assert(
    groups[0]?.threads.map((thread) => thread.id).join(",") === "inside-child,inside-root",
    `expected current workspace group to preserve matching thread order, got ${groups[0]?.threads.map((thread) => thread.id).join(",")}`,
  );
  assert(groups[1]?.label === "other", `expected remaining local project group, got ${groups[1]?.label}`);
}

function collapsesProjectlessThreadsIntoOneChatsGroup(): void {
  // codex: projectless threads (generated working dirs under ~/Documents/Codex) do
  // NOT each become a `new-chat`/`new-chat-2` project folder — they all collapse
  // into a single "chats" group rendered ahead of the real project groups.
  const groups = projectSidebarThreadGroups([
    makeThread({ id: "real", cwd: ("/work/app" as unknown) as Thread["cwd"], updatedAt: 300 }),
    makeThread({ id: "chat-a", cwd: ("/Users/me/Documents/Codex/2026-06-08/new-chat" as unknown) as Thread["cwd"], updatedAt: 200 }),
    makeThread({ id: "chat-b", cwd: ("/Users/me/Documents/Codex/2026-06-08/new-chat-2" as unknown) as Thread["cwd"], updatedAt: 100 }),
  ]);
  assert(groups.length === 2, `expected one project group plus the chats group, got ${groups.length}`);
  // codex default section order ND = ['threads','chats']: the real project group is FIRST.
  assert(groups[0]?.label === "app", `expected the real workspace project group first, got ${groups[0]?.label}`);
  assert(groups[0]?.kind === "project", `expected project kind, got ${groups[0]?.kind}`);
  // both projectless new-chat dirs collapse into ONE chats group, rendered LAST.
  assert(groups[1]?.key === CHATS_GROUP_KEY, `expected chats group last, got ${groups[1]?.key}`);
  assert(groups[1]?.kind === "chats", `expected chats kind, got ${groups[1]?.kind}`);
  assert(
    groups[1]?.threads.map((thread) => thread.id).join(",") === "chat-a,chat-b",
    `expected both projectless threads in the chats group, got ${groups[1]?.threads.map((thread) => thread.id).join(",")}`,
  );
}

function detectsProjectlessThreadCwdUnderDocumentsCodex(): void {
  assert(
    isProjectlessThreadCwd("/Users/me/Documents/Codex/2026-06-08/new-chat") === true,
    "nested Documents/Codex/<date>/<slug> cwd should be projectless",
  );
  assert(
    isProjectlessThreadCwd("/Users/me/Documents/Codex/2026-04-22-new-chat") === true,
    "flat Documents/Codex/<date-slug> cwd should be projectless",
  );
  assert(isProjectlessThreadCwd("/work/app") === false, "a real workspace cwd is not projectless");
  assert(isProjectlessThreadCwd("~") === false, "bare home stays the existing Local group, not chats");
  assert(isProjectlessThreadCwd(null) === false, "missing cwd is not projectless");
  // codex's matcher is anchored, so the host-created outputs/ + work/ sub-dirs and a
  // real project that merely lives under Documents/Codex are NOT projectless.
  assert(
    isProjectlessThreadCwd("/Users/me/Documents/Codex/2026-06-08/new-chat/outputs") === false,
    "a sub-directory of a projectless slug dir is not itself projectless",
  );
  assert(
    isProjectlessThreadCwd("/Users/me/Documents/Codex/my-real-project") === false,
    "a non-date folder directly under Documents/Codex is not projectless",
  );
}

function excludesProjectlessThreadsFromWorkspaceRootOptions(): void {
  // codex excludes projectless threads from the composer's project dropdown the
  // same way it excludes them from the sidebar project groups.
  const options = projectSidebarWorkspaceRootOptions([
    makeThread({ id: "real", cwd: ("/work/app" as unknown) as Thread["cwd"], updatedAt: 300 }),
    makeThread({ id: "chat", cwd: ("/Users/me/Documents/Codex/2026-06-08/new-chat" as unknown) as Thread["cwd"], updatedAt: 200 }),
  ]);
  assert(options.length === 1, `expected the projectless cwd excluded from project options, got ${options.length}`);
  assert(options[0]?.root === "/work/app", `expected only the real workspace root, got ${options[0]?.root}`);
}
