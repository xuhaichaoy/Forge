import { projectBackgroundTerminalEntries } from "../src/state/background-terminals";
import type { AccumulatedThreadItem as ThreadItem } from "../src/state/render-groups";

export default function runBackgroundTerminalTests(): void {
  projectsRunningUnifiedExecItemsAsBackgroundTerminals();
  ignoresCompletedOrOrdinaryCommands();
}

function projectsRunningUnifiedExecItemsAsBackgroundTerminals(): void {
  const entries = projectBackgroundTerminalEntries([
    {
      type: "commandExecution",
      id: "cmd-1",
      command: "/bin/zsh -lc npm run dev",
      cwd: "/workspace",
      processId: "proc-1",
      source: "unifiedExecStartup",
      status: "inProgress",
      aggregatedOutput: "ready\nlistening\ncompiled",
    } as ThreadItem,
  ]);

  assertDeepEqual(
    entries,
    [{
      id: "background-terminal:proc-1",
      title: "/bin/zsh -lc npm run dev",
      kind: "status",
      status: "running",
      meta: "/workspace",
      details: ["Process: proc-1", "Output: ready", "Output: listening", "Output: compiled"],
    }],
    "running unified exec command should become a /ps panel entry",
  );
}

function ignoresCompletedOrOrdinaryCommands(): void {
  const entries = projectBackgroundTerminalEntries([
    {
      type: "commandExecution",
      id: "cmd-completed",
      command: "npm test",
      source: "unifiedExecStartup",
      status: "completed",
    } as ThreadItem,
    {
      type: "commandExecution",
      id: "cmd-agent",
      command: "rg TODO",
      source: "agent",
      status: "inProgress",
    } as ThreadItem,
  ]);

  assertDeepEqual(entries, [], "/ps should only list running unified exec terminals");
}

function assertDeepEqual(actual: unknown, expected: unknown, message: string): void {
  const actualJson = JSON.stringify(actual);
  const expectedJson = JSON.stringify(expected);
  if (actualJson !== expectedJson) {
    throw new Error(`${message}: expected ${expectedJson}, got ${actualJson}`);
  }
}
