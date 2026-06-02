import { projectBackgroundAgentRailEntries } from "../src/state/background-agents";
import type { AccumulatedThreadItem as ThreadItem } from "../src/state/render-groups";

export default function runBackgroundAgentTests(): void {
  projectsReceiverThreadsAsClickableRailEntries();
  projectsDiffStatsFromReceiverThreadLatestTurn();
  updatesExistingAgentStatusFromLaterActions();
  hidesDesktopHiddenAgentStatesAndClosedAgents();
  ignoresNonCollabItemsAndRowsWithoutReceivers();
}

function projectsReceiverThreadsAsClickableRailEntries(): void {
  const entries = projectBackgroundAgentRailEntries([
    {
      type: "collabAgentToolCall",
      id: "spawn-1",
      tool: "spawnAgent",
      status: "completed",
      receiverThreadIds: ["agent-ui-123456"],
      receiverThreads: [
        {
          threadId: "agent-ui-123456",
          thread: {
            agentNickname: "@Explorer",
            agentRole: "explorer",
          },
        },
      ],
      prompt: "Inspect UI",
      model: "gpt-5.4",
      agentsStates: {
        "agent-ui-123456": { status: "running", message: null },
      },
    } as ThreadItem,
  ]);

  assertDeepEqual(
    entries,
    [{
      id: "background-agent:agent-ui-123456",
      title: "Explorer (explorer)",
      status: "active",
      meta: "Uses gpt-5.4",
      details: ["Action: spawnAgent", "Model: gpt-5.4", "Prompt: Inspect UI"],
      action: {
        kind: "thread",
        threadId: "agent-ui-123456",
        displayName: "Explorer",
        model: "gpt-5.4",
        role: "explorer",
      },
    }],
    "receiver thread metadata should become a clickable Background agents rail row",
  );
}

function projectsDiffStatsFromReceiverThreadLatestTurn(): void {
  const entries = projectBackgroundAgentRailEntries([
    {
      type: "collabAgentToolCall",
      id: "spawn-with-diff",
      tool: "spawnAgent",
      status: "completed",
      receiverThreadIds: ["agent-diff-123"],
      receiverThreads: [
        {
          threadId: "agent-diff-123",
          thread: {
            agentNickname: "Builder",
            turns: [
              {
                id: "turn-1",
                diff: [
                  "diff --git a/src/app.ts b/src/app.ts",
                  "--- a/src/app.ts",
                  "+++ b/src/app.ts",
                  "@@ -1,2 +1,3 @@",
                  "-old",
                  "+new",
                  "+next",
                ].join("\n"),
              },
            ],
          },
        },
      ],
      agentsStates: {
        "agent-diff-123": { status: "completed", message: null },
      },
    } as ThreadItem,
  ]);

  assertDeepEqual(
    entries[0]?.diffStats,
    { linesAdded: 2, linesRemoved: 1 },
    "receiver thread latest diff should project Desktop-style background agent diff stats",
  );
}

function updatesExistingAgentStatusFromLaterActions(): void {
  const entries = projectBackgroundAgentRailEntries([
    {
      type: "collabAgentToolCall",
      id: "spawn-1",
      tool: "spawnAgent",
      status: "completed",
      receiverThreadIds: ["agent-1234567890abcdef"],
      prompt: "Inspect",
      model: "gpt-5.5",
      agentsStates: {
        "agent-1234567890abcdef": { status: "running", message: null },
      },
    } as ThreadItem,
    {
      type: "collabAgentToolCall",
      id: "wait-1",
      tool: "wait",
      status: "completed",
      receiverThreadIds: ["agent-1234567890abcdef"],
      prompt: null,
      model: null,
      agentsStates: {
        "agent-1234567890abcdef": { status: "completed", message: "done" },
      },
    } as ThreadItem,
  ]);

  assertEqual(entries.length, 1, "later multi-agent rows should update the same agent entry");
  assertEqual(entries[0]?.title, "agent-agent-12", "agent row should keep Desktop's stable fallback title");
  assertEqual(entries[0]?.status, "done", "Desktop completed agent state should project to done");
  assertDeepEqual(
    entries[0]?.details,
    ["Action: wait", "Model: gpt-5.5", "State: done"],
    "latest action details should keep earlier model metadata when available",
  );
}

function hidesDesktopHiddenAgentStatesAndClosedAgents(): void {
  const hiddenByState = projectBackgroundAgentRailEntries([
    {
      type: "collabAgentToolCall",
      id: "spawn-1",
      tool: "spawnAgent",
      status: "completed",
      receiverThreadIds: ["agent-hidden"],
      agentsStates: {
        "agent-hidden": { status: "running", message: null },
      },
    } as ThreadItem,
    {
      type: "collabAgentToolCall",
      id: "wait-1",
      tool: "wait",
      status: "completed",
      receiverThreadIds: ["agent-hidden"],
      agentsStates: {
        "agent-hidden": { status: "errored", message: "failed" },
      },
    } as ThreadItem,
  ]);

  assertDeepEqual(hiddenByState, [], "Desktop hidden agent states should remove background-agent rows");

  const hiddenByClose = projectBackgroundAgentRailEntries([
    {
      type: "collabAgentToolCall",
      id: "spawn-2",
      tool: "spawnAgent",
      status: "completed",
      receiverThreadIds: ["agent-closed"],
      agentsStates: {
        "agent-closed": { status: "running", message: null },
      },
    } as ThreadItem,
    {
      type: "collabAgentToolCall",
      id: "close-1",
      tool: "closeAgent",
      status: "completed",
      receiverThreadIds: ["agent-closed"],
      agentsStates: {
        "agent-closed": { status: "completed", message: "closed" },
      },
    } as ThreadItem,
  ]);

  assertDeepEqual(hiddenByClose, [], "Desktop closeAgent references should remove background-agent rows");
}

function ignoresNonCollabItemsAndRowsWithoutReceivers(): void {
  const entries = projectBackgroundAgentRailEntries([
    {
      type: "agentMessage",
      id: "assistant-1",
      text: "done",
    } as ThreadItem,
    {
      type: "collabAgentToolCall",
      id: "spawn-empty",
      tool: "spawnAgent",
      status: "failed",
      receiverThreadIds: [],
      prompt: "try",
      model: "gpt-5.5",
      agentsStates: {},
    } as ThreadItem,
  ]);

  assertDeepEqual(entries, [], "Background agents rail should only use real receiver thread ids");
}

function assertEqual<T>(actual: T, expected: T, message: string): void {
  if (actual !== expected) {
    throw new Error(`${message}: expected ${String(expected)}, got ${String(actual)}`);
  }
}

function assertDeepEqual(actual: unknown, expected: unknown, message: string): void {
  const actualJson = JSON.stringify(actual);
  const expectedJson = JSON.stringify(expected);
  if (actualJson !== expectedJson) {
    throw new Error(`${message}: expected ${expectedJson}, got ${actualJson}`);
  }
}
