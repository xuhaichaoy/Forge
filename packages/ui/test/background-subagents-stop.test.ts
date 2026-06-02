import {
  collectBackgroundSubagentStopThreadIds,
  receiverThreadIdsFromThreadSnapshot,
} from "../src/state/background-subagents-stop";

export default async function runBackgroundSubagentsStopTests(): Promise<void> {
  extractsReceiverThreadIdsFromReadThreadSnapshots();
  await collectsStopThreadIdsBreadthFirstFromReadableDescendants();
  await keepsSeedTargetsWhenDescendantReadsFail();
}

function extractsReceiverThreadIdsFromReadThreadSnapshots(): void {
  assertDeepEqual(
    receiverThreadIdsFromThreadSnapshot({
      thread: {
        turns: [
          {
            items: [
              { type: "agentMessage", id: "message-1", text: "done" },
              { type: "collabAgentToolCall", id: "spawn-1", receiverThreadIds: [" child-1 ", "child-2", ""] },
              { type: "collabAgentToolCall", id: "wait-1", receiverThreadIds: ["child-1"] },
            ],
          },
        ],
      },
    }),
    ["child-1", "child-2"],
    "thread snapshot receiver extraction should read unique collab receiver ids",
  );
}

async function collectsStopThreadIdsBreadthFirstFromReadableDescendants(): Promise<void> {
  const snapshots = new Map<string, unknown>([
    ["child-1", threadSnapshot(["grandchild-1", "grandchild-2"])],
    ["child-2", threadSnapshot(["grandchild-3"])],
    ["grandchild-1", threadSnapshot(["great-grandchild-1"])],
    ["grandchild-2", threadSnapshot([])],
    ["grandchild-3", threadSnapshot(["active-thread"])],
    ["great-grandchild-1", threadSnapshot([])],
  ]);

  const plan = await collectBackgroundSubagentStopThreadIds({
    activeThreadId: "active-thread",
    maxThreads: 10,
    seedThreadIds: ["child-1", "child-2", "child-1", "active-thread"],
    readThread: async (threadId) => snapshots.get(threadId) ?? threadSnapshot([]),
  });

  assertDeepEqual(
    plan,
    ["child-1", "child-2", "grandchild-1", "grandchild-2", "grandchild-3", "great-grandchild-1"],
    "Stop all planner should include readable descendants without including the active parent thread",
  );
}

async function keepsSeedTargetsWhenDescendantReadsFail(): Promise<void> {
  const plan = await collectBackgroundSubagentStopThreadIds({
    seedThreadIds: ["child-1", "child-2"],
    readThread: async (threadId) => {
      if (threadId === "child-1") throw new Error("read failed");
      return threadSnapshot(["grandchild-1"]);
    },
  });

  assertDeepEqual(
    plan,
    ["child-1", "child-2", "grandchild-1"],
    "Stop all planner should keep visible seeds when one read fails",
  );
}

function threadSnapshot(receiverThreadIds: string[]): unknown {
  return {
    thread: {
      turns: [
        {
          items: [
            {
              type: "collabAgentToolCall",
              id: "spawn-1",
              receiverThreadIds,
            },
          ],
        },
      ],
    },
  };
}

function assertDeepEqual(actual: unknown, expected: unknown, message: string): void {
  const actualJson = JSON.stringify(actual);
  const expectedJson = JSON.stringify(expected);
  if (actualJson !== expectedJson) {
    throw new Error(`${message}: expected ${expectedJson}, got ${actualJson}`);
  }
}
