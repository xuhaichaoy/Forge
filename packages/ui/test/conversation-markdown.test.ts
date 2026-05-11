import { buildConversationMarkdown } from "../src/state/conversation-markdown";
import type { ConversationRenderUnit } from "../src/state/render-groups";

export default function runConversationMarkdownTests(): void {
  exportsUserAssistantAndToolActivity();
  exportsStandaloneThreadItems();
  escapesNestedDetailsInToolBodies();
}

function exportsUserAssistantAndToolActivity(): void {
  const units: ConversationRenderUnit[] = [
    {
      kind: "message",
      key: "user-1",
      role: "user",
      item: { id: "user-1", type: "userMessage" },
      text: "Fix the sidebar",
    },
    {
      kind: "toolActivity",
      key: "tool-1",
      items: [
        {
          id: "cmd-1",
          type: "commandExecution",
          command: "npm test",
          aggregatedOutput: "ok",
          status: "completed",
        },
      ],
      summary: {
        groupType: "collapsed-tool-activity",
        icon: "terminal",
        label: "Ran 1 command",
        activeDetail: null,
        details: ["Ran npm test"],
        inProgress: false,
        totalDurationMs: null,
        counts: {
          commands: 1,
          webSearchCommands: 0,
          runningWebSearchCommands: 0,
          runningFolderCreationCommands: 0,
          exploredFiles: 0,
          searches: 0,
          lists: 0,
          fileChanges: 0,
          createdFiles: 0,
          editedFiles: 0,
          deletedFiles: 0,
          mcpCalls: 0,
          dynamicCalls: 0,
          webSearches: 0,
          reasoning: 0,
          plans: 0,
          other: 0,
        },
      },
    },
    {
      kind: "message",
      key: "agent-1",
      role: "assistant",
      item: { id: "agent-1", type: "agentMessage" },
      text: "Done.",
    },
  ];

  assertEqual(
    buildConversationMarkdown({ title: " Thread #1 ", units }),
    [
      "# Thread \\#1",
      "",
      "## User",
      "",
      "> Fix the sidebar",
      "",
      "<details><summary>Ran 1 command</summary>",
      "",
      "$ npm test",
      "ok",
      "",
      "</details>",
      "",
      "## Assistant",
      "",
      "Done.",
      "",
    ].join("\n"),
    "markdown export should preserve user, activity, and assistant order",
  );
}

function escapesNestedDetailsInToolBodies(): void {
  const markdown = buildConversationMarkdown({
    title: "Codex",
    units: [
      {
        kind: "event",
        key: "event-1",
        item: { id: "event-1", type: "other" },
        label: "System",
        text: "<details><summary>inner</summary></details>",
      },
    ],
  });

  assertEqual(
    markdown.includes("&lt;details&gt;"),
    true,
    "details tags inside bodies should be escaped",
  );
}

function exportsStandaloneThreadItems(): void {
  const markdown = buildConversationMarkdown({
    title: "Codex",
    units: [
      {
        kind: "threadItem",
        key: "item:dynamic-tool-call:dynamic-1",
        item: {
          id: "dynamic-1",
          type: "dynamicToolCall",
          namespace: "functions",
          tool: "exec_command",
          status: "running",
          arguments: { cmd: "git status --short" },
        },
      },
    ],
  });

  assertEqual(
    markdown.includes("<details><summary>Tool call</summary>"),
    true,
    "markdown export should keep standalone thread items as expandable activity sections",
  );
  assertEqual(
    markdown.includes("functions.exec_command"),
    true,
    "standalone thread item markdown should preserve dynamic tool details",
  );
}

function assertEqual<T>(actual: T, expected: T, message: string): void {
  if (actual !== expected) {
    throw new Error(`${message}: expected ${String(expected)}, got ${String(actual)}`);
  }
}
