import {
  isSubagentThread,
  projectSidebarThreads,
  threadSortAt,
} from "../src/state/sidebar-projection";
import type { Thread } from "@hicodex/codex-protocol";

const assert = (condition: unknown, message: string): void => {
  if (!condition) throw new Error(message);
};

export default function runSidebarProjectionTests(): void {
  sortsThreadsByUpdatedAtDescending();
  hidesSpawnedSubagentThreadsByDefault();
  treatsAgentNicknameAsSubagentSignal();
  fallsBackToCreatedAtWhenUpdatedAtMissing();
}

function makeThread(overrides: Partial<Thread>): Thread {
  return {
    id: overrides.id ?? "thread-x",
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

function fallsBackToCreatedAtWhenUpdatedAtMissing(): void {
  const thread = makeThread({ id: "fresh", updatedAt: 0, createdAt: 50 });
  assert(threadSortAt(thread, "updated_at") === 50_000, "fallback to createdAt when updatedAt is zero");
}
