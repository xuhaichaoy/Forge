import type { Thread, ThreadItem } from "@hicodex/codex-protocol";
import { mergeThreadToolHistory } from "../src/state/thread-history-tools";

export default function runThreadHistoryToolTests(): void {
  restoresPersistedExecCommandBetweenCommentaryMessages();
  stampsRecoveredItemsWithTurnIdSoTheyStayInTurnSegment();
}

function restoresPersistedExecCommandBetweenCommentaryMessages(): void {
  const thread = threadWithTurn([
    userMessage("user-1", "read source"),
    agentMessage("agent-1", "I will inspect the file.", "commentary"),
    agentMessage("agent-2", "The file says done.", "final_answer"),
  ]);

  const merged = mergeThreadToolHistory(thread, {
    threadId: "thread-1",
    turns: [{
      turnId: "turn-1",
      items: [
        replayUserMessage("read source"),
        replayAgentMessage("I will inspect the file.", "commentary"),
        {
          type: "commandExecution",
          id: "call-exec",
          command: "/bin/zsh -lc 'cat docs/DEVELOPMENT.md'",
          cwd: "/workspace",
          processId: "123",
          source: "unifiedExecStartup",
          status: "completed",
          commandActions: [{
            type: "read",
            command: "cat docs/DEVELOPMENT.md",
            name: "DEVELOPMENT.md",
            path: "/workspace/docs/DEVELOPMENT.md",
          }],
          aggregatedOutput: "ok",
          exitCode: 0,
          durationMs: 12,
          _historyReplay: true,
        } as unknown as ThreadItem,
        replayAgentMessage("The file says done.", "final_answer"),
      ],
    }],
  });

  const items = merged.turns[0].items;
  assertEqual(items.length, 4, "merge should add the recovered command without duplicating messages");
  assertEqual(items[0]?.id, "user-1", "existing user item should be preserved");
  assertEqual(items[1]?.id, "agent-1", "existing commentary item should be preserved");
  assertEqual(items[2]?.id, "call-exec", "recovered command should keep replay order");
  assertEqual(items[3]?.id, "agent-2", "existing final answer should stay last");
}

function stampsRecoveredItemsWithTurnIdSoTheyStayInTurnSegment(): void {
  const thread = threadWithTurn([
    userMessage("user-1", "read source"),
    agentMessage("agent-1", "I will inspect the file.", "commentary"),
    agentMessage("agent-2", "The file says done.", "final_answer"),
  ]);

  const merged = mergeThreadToolHistory(thread, {
    threadId: "thread-1",
    turns: [{
      turnId: "turn-1",
      items: [
        replayUserMessage("read source"),
        replayAgentMessage("I will inspect the file.", "commentary"),
        {
          type: "commandExecution",
          id: "call-exec",
          command: "/bin/zsh -lc 'cat docs/DEVELOPMENT.md'",
          cwd: "/workspace",
          processId: "123",
          source: "unifiedExecStartup",
          status: "completed",
          aggregatedOutput: "ok",
          exitCode: 0,
          durationMs: 12,
          _historyReplay: true,
        } as unknown as ThreadItem,
        replayAgentMessage("The file says done.", "final_answer"),
      ],
    }],
  });

  for (const item of merged.turns[0].items) {
    const turnId = (item as Record<string, unknown>)._turnId;
    assertEqual(
      turnId,
      "turn-1",
      `merged item ${item.id} should be tagged with the owning turn id so the reducer keeps it inside the turn segment`,
    );
  }
}

function threadWithTurn(items: ThreadItem[]): Thread {
  return {
    id: "thread-1",
    name: null,
    preview: null,
    status: { type: "idle" },
    createdAt: 1,
    updatedAt: 1,
    cwd: "/workspace",
    path: null,
    branch: null,
    commitHash: null,
    origin: null,
    archived: false,
    ephemeral: false,
    turns: [{
      id: "turn-1",
      threadId: "thread-1",
      status: "completed",
      items,
      startedAt: 1,
      completedAt: 2,
      durationMs: 1000,
      error: null,
    }],
  } as unknown as Thread;
}

function userMessage(id: string, text: string): ThreadItem {
  return {
    type: "userMessage",
    id,
    content: [{ type: "text", text, text_elements: [] }],
  };
}

function agentMessage(id: string, text: string, phase: "commentary" | "final_answer"): ThreadItem {
  return {
    type: "agentMessage",
    id,
    text,
    phase,
    memoryCitation: null,
  };
}

function replayUserMessage(text: string): ThreadItem {
  return {
    ...userMessage(`history-user:${text}`, text),
    _historyReplay: true,
  } as unknown as ThreadItem;
}

function replayAgentMessage(text: string, phase: "commentary" | "final_answer"): ThreadItem {
  return {
    ...agentMessage(`history-agent:${text}`, text, phase),
    _historyReplay: true,
  } as unknown as ThreadItem;
}

function assertEqual<T>(actual: T, expected: T, message: string): void {
  if (actual !== expected) {
    throw new Error(`${message}: expected ${String(expected)}, got ${String(actual)}`);
  }
}
