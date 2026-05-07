import {
  assistantMessagePhase,
  formatItemDetail,
  itemText,
  projectConversation,
  stripRawThinkingMarkup,
  type AccumulatedThreadItem as ThreadItem,
} from "../src/state/render-groups";

export default function runRenderGroupsTests(): void {
  projectsUserAndAssistantMessagesAsStableMessageGroups();
  stripsRawThinkingMarkupFromAssistantMessages();
  marksLatestAssistantMessageAsStreamingDuringActiveTurn();
  rendersAssistantStreamingPlaceholderFromDesktopFlag();
  groupsReasoningSummaryAndContentIntoToolActivity();
  splitsReasoningFromCollapsedToolActivity();
  groupsPendingMcpCallsSeparately();
  keepsDesktopInlineMcpToolsOutOfPendingMcpGroups();
  suppressesPendingMcpCallCoveredByElicitation();
  projectsDesktopLifecycleEventsSemantically();
  projectsDiffAndGeneratedImageEventsWithRenderableFormats();
  keepsDurationBackedCommandsAsToolActivity();
  projectsExplicitWorkedForItemAsCompactActivity();
  keepsTodoListOutOfMainConversationButProjectsProgress();
  hidesPendingApprovalItemsFromOrdinaryActivity();
  groupsExplorationCommandActionsLikeCodexDesktop();
  groupsToolActivityItemsAndPreservesSummaries();
  summarizesPatchChangeKinds();
  formatsExpandedToolDetailsSemantically();
  groupsWebSearchIntoActivityAndSources();
  groupsAdjacentWebSearchesLikeCodexDesktop();
  rendersActiveWebSearchLikeCodexDesktop();
  rendersInProgressMultiAgentActionsAsDesktopActivity();
  groupsCompletedMultiAgentActionsLikeCodexDesktop();
  returnsEmptyProjectionForEmptyItems();
}

function projectsUserAndAssistantMessagesAsStableMessageGroups(): void {
  const userMessage: ThreadItem = {
    type: "userMessage",
    id: "user-1",
    content: [
      {
        type: "text",
        text: "Add render group tests @render-groups",
        text_elements: [{ byteRange: { start: 23, end: 37 }, placeholder: "@render-groups" }],
      },
      { type: "mention", name: "render-groups.ts", path: "packages/ui/src/state/render-groups.ts" },
      { type: "skill", name: "code-review", path: "/Users/haichao/.codex/skills/code-review" },
      { type: "image", url: "https://example.com/diagram.png" },
      { type: "image", url: "data:image/png;base64,mXlu4jLxTLYBhEGAQVwmLhOY52IAxAMI" },
      { type: "localImage", path: "/tmp/screenshot 1.png" },
    ],
  };
  const assistantMessage: ThreadItem = {
    type: "agentMessage",
    id: "agent-1",
    text: "Done.",
    phase: "final",
    memoryCitation: null,
  };

  const projection = projectConversation([userMessage, assistantMessage]);

  assertEqual(projection.units.length, 2, "message projection should keep two groups");
  const first = projection.units[0];
  const second = projection.units[1];
  assertEqual(first?.kind, "message", "user message should render as a message group");
  if (first?.kind === "message") {
    assertEqual(first.key, "user-1", "user message key should use the item id");
    assertEqual(first.role, "user", "user message role should be stable");
    assertEqual(
      first.text,
      [
        "Add render group tests @render-groups",
        "@render-groups.ts",
        "$code-review",
      ].join("\n"),
      "user message text should flatten only textual input",
    );
    assertDeepEqual(
      first.userContent,
      [
        {
          kind: "text",
          text: "Add render group tests @render-groups",
          textElements: [{ start: 23, end: 37, placeholder: "@render-groups" }],
        },
        {
          kind: "chip",
          chipKind: "mention",
          label: "render-groups.ts",
          path: "packages/ui/src/state/render-groups.ts",
        },
        {
          kind: "chip",
          chipKind: "skill",
          label: "code-review",
          path: "/Users/haichao/.codex/skills/code-review",
        },
        {
          kind: "image",
          source: "url",
          src: "https://example.com/diagram.png",
          label: "diagram.png",
        },
        {
          kind: "image",
          source: "url",
          src: "data:image/png;base64,mXlu4jLxTLYBhEGAQVwmLhOY52IAxAMI",
          label: "User attachment",
        },
        {
          kind: "image",
          source: "local",
          src: "/tmp/screenshot 1.png",
          label: "screenshot 1.png",
        },
      ],
      "user message should preserve structured content for Desktop-like rendering",
    );
  }
  assertEqual(second?.kind, "message", "assistant message should render as a message group");
  if (second?.kind === "message") {
    assertEqual(second.key, "agent-1", "assistant message key should use the item id");
    assertEqual(second.role, "assistant", "assistant message role should be stable");
    assertEqual(second.text, "Done.", "assistant message text should be preserved");
    assertEqual(second.assistantPhase, "final_answer", "legacy final phase should normalize to final_answer");
    assertEqual(second.isStreaming ?? false, false, "completed assistant message should not be streaming by default");
  }
}

function stripsRawThinkingMarkupFromAssistantMessages(): void {
  const projection = projectConversation([
    {
      type: "agentMessage",
      id: "agent-1",
      text: "private notes</think>\n\nVisible answer",
      phase: "commentary",
      memoryCitation: null,
    } as ThreadItem,
    {
      type: "agentMessage",
      id: "agent-empty",
      text: "<think>still thinking",
      phase: "commentary",
      memoryCitation: null,
    } as ThreadItem,
    {
      type: "agentMessage",
      id: "agent-2",
      text: "<think>hidden</think>\n\nFinal answer",
      phase: "final_answer",
      memoryCitation: null,
    } as ThreadItem,
  ]);

  assertEqual(projection.units.length, 2, "empty thinking-only assistant messages should not render blank rows");
  const first = projection.units[0];
  const second = projection.units[1];
  if (first?.kind !== "message" || second?.kind !== "message") {
    throw new Error("visible assistant messages should remain message units");
  }
  assertEqual(first.text, "Visible answer", "dangling closing think tag should drop preceding hidden text");
  assertEqual(second.text, "Final answer", "paired think tags should be removed");
  assertEqual(
    stripRawThinkingMarkup("before\n<think>hidden</think>\nafter"),
    "before\nafter",
    "non-thinking visible text around a paired tag should be preserved",
  );
}

function marksLatestAssistantMessageAsStreamingDuringActiveTurn(): void {
  const projection = projectConversation([
    {
      type: "agentMessage",
      id: "commentary-1",
      text: "I will inspect the renderer.",
      phase: "commentary",
      memoryCitation: null,
    } as ThreadItem,
    {
      type: "agentMessage",
      id: "final-1",
      text: "Still writing",
      phase: "final_answer",
      memoryCitation: null,
    } as ThreadItem,
  ], { isThreadRunning: true });

  assertEqual(projection.units.length, 2, "assistant phase projection should preserve message count");
  const first = projection.units[0];
  const second = projection.units[1];
  if (first?.kind !== "message" || second?.kind !== "message") {
    throw new Error("assistant messages should remain message units");
  }
  assertEqual(first.assistantPhase, "commentary", "commentary phase should be preserved");
  assertEqual(first.isStreaming ?? false, false, "only the latest assistant message should stream");
  assertEqual(second.assistantPhase, "final_answer", "final_answer phase should be preserved");
  assertEqual(second.isStreaming ?? false, true, "latest assistant message should stream while the turn is active");
  assertEqual(
    assistantMessagePhase({ type: "agentMessage", id: "agent-unknown", text: "legacy", phase: null, memoryCitation: null } as ThreadItem),
    "unknown",
    "missing phase should remain unknown for legacy model output",
  );
}

function rendersAssistantStreamingPlaceholderFromDesktopFlag(): void {
  const projection = projectConversation([
    {
      type: "agentMessage",
      id: "placeholder-1",
      text: "",
      phase: "commentary",
      memoryCitation: null,
      renderPlaceholderWhileStreaming: true,
      completed: false,
    } as ThreadItem,
    {
      type: "agentMessage",
      id: "placeholder-complete",
      text: "",
      phase: "commentary",
      memoryCitation: null,
      renderPlaceholderWhileStreaming: true,
      completed: true,
    } as ThreadItem,
  ]);

  assertEqual(projection.units.length, 1, "only active Desktop placeholder assistant messages should render");
  const unit = projection.units[0];
  if (unit?.kind !== "message") {
    throw new Error("placeholder assistant item should remain a message unit");
  }
  assertEqual(unit.key, "placeholder-1", "placeholder unit should use the assistant item id");
  assertEqual(unit.text, "", "placeholder unit should not synthesize assistant text");
  assertEqual(unit.renderPlaceholder ?? false, true, "placeholder flag should reach the view layer");
}

function groupsReasoningSummaryAndContentIntoToolActivity(): void {
  const reasoning: ThreadItem = {
    type: "reasoning",
    id: "reasoning-1",
    summary: ["Checked the projection contract"],
    content: ["Reasoning details stay on the item"],
  };

  const projection = projectConversation([reasoning]);
  const unit = projection.units[0];

  assertEqual(projection.units.length, 1, "reasoning should produce one render group");
  assertEqual(unit?.kind, "toolActivity", "reasoning should be grouped as tool activity");
  if (unit?.kind === "toolActivity") {
    assertEqual(unit.key, "reasoning:reasoning-1:reasoning-1", "reasoning activity key should include semantic group type");
    assertEqual(unit.summary.groupType, "reasoning", "reasoning activity should keep Codex Desktop group type");
    assertEqual(unit.summary.label, "Thought", "reasoning activity label");
    assertEqual(unit.summary.counts.reasoning, 1, "reasoning activity count");
    assertDeepEqual(unit.summary.details, ["Thought"], "reasoning activity detail");
    assertEqual(unit.items[0], reasoning, "reasoning item should stay attached to the activity group");
  }
  assertEqual(
    itemText(reasoning),
    "Checked the projection contract\nReasoning details stay on the item",
    "reasoning summary and content should remain readable from the item",
  );
}

function splitsReasoningFromCollapsedToolActivity(): void {
  const projection = projectConversation([
    {
      type: "reasoning",
      id: "reasoning-1",
      summary: ["Inspecting"],
      content: [],
    } as ThreadItem,
    {
      type: "commandExecution",
      id: "command-1",
      command: "git status --short",
      status: "completed",
      aggregatedOutput: "M file",
      exitCode: 0,
    } as ThreadItem,
  ]);

  assertEqual(projection.units.length, 2, "reasoning should not be mixed into collapsed tool activity");
  const first = projection.units[0];
  const second = projection.units[1];
  if (first?.kind === "toolActivity") {
    assertEqual(first.summary.groupType, "reasoning", "first group should be reasoning");
  } else {
    throw new Error("first group should be tool activity");
  }
  if (second?.kind === "toolActivity") {
    assertEqual(second.summary.groupType, "collapsed-tool-activity", "second group should be collapsed tool activity");
  } else {
    throw new Error("second group should be tool activity");
  }
}

function groupsPendingMcpCallsSeparately(): void {
  const projection = projectConversation([
    {
      type: "mcpToolCall",
      id: "mcp-pending-1",
      server: "github",
      tool: "list_prs",
      status: "inProgress",
      arguments: { state: "open" },
      result: null,
      error: null,
    } as ThreadItem,
    {
      type: "commandExecution",
      id: "command-1",
      command: "npm test",
      status: "completed",
      aggregatedOutput: "ok",
      exitCode: 0,
    } as ThreadItem,
  ]);

  assertEqual(projection.units.length, 2, "pending MCP calls should be split from ordinary activity");
  const pending = projection.units[0];
  if (pending?.kind === "toolActivity") {
    assertEqual(pending.summary.groupType, "pending-mcp-tool-calls", "pending MCP group type");
    assertEqual(pending.summary.label, "Calling github:list_prs", "pending MCP label should use active tool");
    assertEqual(pending.summary.inProgress, true, "pending MCP should be marked in progress");
  } else {
    throw new Error("pending MCP should render as tool activity");
  }
}

function keepsDesktopInlineMcpToolsOutOfPendingMcpGroups(): void {
  const projection = projectConversation([
    {
      type: "mcpToolCall",
      id: "computer-use-1",
      invocation: { server: "computer-use", tool: "click", arguments: { x: 1, y: 2 } },
      status: "inProgress",
      result: null,
      error: null,
    } as unknown as ThreadItem,
    {
      type: "mcpToolCall",
      id: "node-repl-1",
      invocation: { server: "node_repl", tool: "js", arguments: { code: "1 + 1" } },
      status: "inProgress",
      result: null,
      error: null,
    } as unknown as ThreadItem,
  ]);

  const unit = projection.units[0];
  assertEqual(projection.units.length, 1, "Desktop inline MCP tools should remain in ordinary activity");
  assertEqual(unit?.kind, "toolActivity", "inline MCP tools should still render as tool activity");
  if (unit?.kind === "toolActivity") {
    assertEqual(
      unit.summary.groupType,
      "collapsed-tool-activity",
      "computer-use and node_repl js should not become pending MCP groups",
    );
    assertEqual(unit.summary.label, "Calling node_repl:js", "nested invocation labels should be preserved");
  }
}

function suppressesPendingMcpCallCoveredByElicitation(): void {
  const projection = projectConversation([
    {
      type: "mcp-server-elicitation",
      id: "elicitation-1",
      completed: false,
      elicitation: { kind: "generic", serverName: "github" },
    } as unknown as ThreadItem,
    {
      type: "mcpToolCall",
      id: "mcp-pending-1",
      server: "github",
      tool: "list_prs",
      status: "inProgress",
      arguments: { state: "open" },
      result: null,
      error: null,
    } as ThreadItem,
  ]);

  assertEqual(
    projection.units.length,
    0,
    "pending MCP call covered by an elicitation should not duplicate the composer-level request",
  );
  assertEqual(
    projection.sources.length,
    0,
    "suppressed pending MCP call should not create a source entry",
  );
}

function projectsDesktopLifecycleEventsSemantically(): void {
  const projection = projectConversation([
    {
      type: "permission-request",
      id: "permission-pending-1",
      completed: false,
      reason: "Needs write access",
      response: null,
    } as unknown as ThreadItem,
    {
      type: "mcp-server-elicitation",
      id: "elicitation-completed-1",
      completed: true,
      action: "allow",
    } as unknown as ThreadItem,
    {
      type: "permission-request",
      id: "permission-completed-1",
      completed: true,
      reason: "Needs write access",
      response: { decision: "approved" },
    } as unknown as ThreadItem,
    {
      type: "user-input-response",
      id: "user-input-response-1",
      questionsAndAnswers: [
        { question: "Proceed?", answers: ["Yes", "Use current thread"] },
      ],
    } as unknown as ThreadItem,
    {
      type: "stream-error",
      id: "stream-error-1",
      content: "Connection dropped",
      additionalDetails: "Retry the turn.",
    } as unknown as ThreadItem,
    {
      type: "system-error",
      id: "system-error-1",
      content: "Sandbox failed",
    } as unknown as ThreadItem,
    {
      type: "contextCompaction",
      id: "context-1",
      source: "auto",
      completed: false,
    } as unknown as ThreadItem,
    {
      type: "remote-task-created",
      id: "remote-task-1",
      taskId: "task-123",
    } as unknown as ThreadItem,
    {
      type: "model-rerouted",
      id: "model-rerouted-1",
      fromModel: "gpt-5.3",
      toModel: "gpt-5.4",
      reason: "capacity",
    } as unknown as ThreadItem,
  ]);

  assertEqual(projection.units.length, 8, "pending permission request should stay out of the transcript");
  assertDeepEqual(
    projection.units.map((unit) => unit.kind === "event" ? unit.label : unit.kind),
    [
      "MCP server elicitation",
      "Permission request",
      "User input response",
      "Stream error",
      "System error",
      "Context compaction",
      "Remote task created",
      "Model rerouted",
    ],
    "Desktop lifecycle item labels should be semantic",
  );

  const elicitation = eventByKey(projection, "elicitation-completed-1");
  assertTextIncludes(elicitation.text, "Status: completed", "completed MCP elicitation status");
  assertTextIncludes(elicitation.text, "Action: allow", "completed MCP elicitation action");

  const permission = eventByKey(projection, "permission-completed-1");
  assertTextIncludes(permission.text, "Reason: Needs write access", "permission reason");
  assertTextIncludes(permission.text, "Response: granted", "permission response should match Desktop markdown semantics");

  const userInput = eventByKey(projection, "user-input-response-1");
  assertTextIncludes(userInput.text, "- Proceed?", "user input response question");
  assertTextIncludes(userInput.text, "  - Use current thread", "user input response answer");

  const streamError = eventByKey(projection, "stream-error-1");
  assertEqual(streamError.tone, "error", "stream errors should carry error tone");
  assertTextIncludes(streamError.text, "Connection dropped", "stream error content");
  assertTextIncludes(streamError.text, "Retry the turn.", "stream error details");

  const systemError = eventByKey(projection, "system-error-1");
  assertEqual(systemError.tone, "error", "system errors should carry error tone");
  assertTextIncludes(systemError.text, "Sandbox failed", "system error content");

  const context = eventByKey(projection, "context-1");
  assertTextIncludes(context.text, "Source: auto", "context compaction source");
  assertTextIncludes(context.text, "Status: running", "context compaction status");

  assertTextIncludes(eventByKey(projection, "remote-task-1").text, "Task ID: task-123", "remote task id");
  assertTextIncludes(eventByKey(projection, "model-rerouted-1").text, "gpt-5.3 -> gpt-5.4", "model reroute transition");
  assertTextIncludes(eventByKey(projection, "model-rerouted-1").text, "Reason: capacity", "model reroute reason");
}

function projectsDiffAndGeneratedImageEventsWithRenderableFormats(): void {
  const projection = projectConversation([
    {
      type: "turn-diff",
      id: "turn-diff-1",
      unifiedDiff: "@@ -1 +1 @@\n-old\n+new",
    } as unknown as ThreadItem,
    {
      type: "generated-image",
      id: "generated-image-1",
      status: "completed",
      src: "https://example.com/generated image.png",
    } as unknown as ThreadItem,
    {
      type: "automation-update",
      id: "automation-update-1",
      result: {
        mode: "recording",
        automationId: "automation-123",
      },
    } as unknown as ThreadItem,
    {
      type: "plan-implementation",
      id: "plan-implementation-1",
      isCompleted: false,
      planContent: "Implement renderer parity",
    } as unknown as ThreadItem,
  ]);

  assertEqual(projection.units.length, 4, "renderable Desktop event items should stay visible");
  const diff = eventByKey(projection, "turn-diff-1");
  assertEqual(diff.label, "Diff", "turn diff label");
  assertEqual(diff.format, "diff", "turn diff should use diff rendering");
  assertTextIncludes(diff.text, "+new", "turn diff text");

  const image = eventByKey(projection, "generated-image-1");
  assertEqual(image.label, "Generated image", "generated image label");
  assertEqual(image.format, "markdown", "generated images with a source should render as markdown image content");
  assertTextIncludes(
    image.text,
    "![Generated image](<https://example.com/generated image.png>)",
    "generated image should preserve source as a markdown image",
  );

  const automation = eventByKey(projection, "automation-update-1");
  assertTextIncludes(automation.text, "Mode: recording", "automation update mode");
  assertTextIncludes(automation.text, "Automation ID: automation-123", "automation update id");

  const planImplementation = eventByKey(projection, "plan-implementation-1");
  assertTextIncludes(planImplementation.text, "Status: running", "plan implementation running status");
  assertTextIncludes(planImplementation.text, "Implement renderer parity", "plan implementation content");
}

function keepsDurationBackedCommandsAsToolActivity(): void {
  const projection = projectConversation([
    {
      type: "commandExecution",
      id: "command-1",
      command: "npm run build",
      status: "completed",
      aggregatedOutput: "built",
      exitCode: 0,
      durationMs: 65_000,
    } as ThreadItem,
  ]);

  const unit = projection.units[0];
  assertEqual(unit?.kind, "toolActivity", "duration backed command should render as tool activity");
  if (unit?.kind === "toolActivity") {
    assertEqual(unit.summary.groupType, "collapsed-tool-activity", "command activity should keep its semantic group");
    assertEqual(unit.summary.label, "Ran npm run build", "single command activity should use the item-level command label");
    assertEqual(unit.summary.totalDurationMs, 65_000, "duration should be preserved in summary");
  }
}

function projectsExplicitWorkedForItemAsCompactActivity(): void {
  const projection = projectConversation([
    {
      type: "worked-for",
      id: "worked-for-1",
      status: "completed",
      startedAtMs: 1_000,
      completedAtMs: 66_000,
    } as ThreadItem,
  ]);

  const unit = projection.units[0];
  assertEqual(projection.units.length, 1, "worked-for should stay as a compact transcript activity");
  assertEqual(unit?.kind, "toolActivity", "worked-for should not render as a generic event block");
  if (unit?.kind === "toolActivity") {
    assertEqual(unit.key, "worked-for:worked-for-1:worked-for-1", "worked-for key should keep Desktop group type");
    assertEqual(unit.summary.groupType, "worked-for", "worked-for group type");
    assertEqual(unit.summary.label, "Worked for 1m 5s", "worked-for label should use item timestamps");
    assertEqual(unit.summary.totalDurationMs, 65_000, "worked-for duration should come from started/completed timestamps");
  }
}

function keepsTodoListOutOfMainConversationButProjectsProgress(): void {
  const projection = projectConversation([
    {
      type: "todo-list",
      id: "todo-1",
      plan: [
        { step: "Inspect Codex Desktop output", status: "completed" },
        { step: "Patch HiCodex projection", status: "in_progress" },
      ],
    } as ThreadItem,
    {
      type: "agentMessage",
      id: "assistant-1",
      text: "Projection updated.",
      phase: "final",
      memoryCitation: null,
    } as ThreadItem,
  ]);

  assertEqual(projection.units.length, 1, "todo-list should not render as a main conversation activity");
  assertEqual(projection.units[0]?.kind, "message", "assistant message should remain in the main conversation");
  assertDeepEqual(
    projection.progress.map((entry) => entry.title),
    ["Inspect Codex Desktop output", "Patch HiCodex projection"],
    "todo-list should still drive Progress",
  );
}

function hidesPendingApprovalItemsFromOrdinaryActivity(): void {
  const projection = projectConversation([
    {
      type: "commandExecution",
      id: "command-approval-1",
      command: "npm run build",
      status: "inProgress",
      aggregatedOutput: null,
      exitCode: null,
      approvalRequestId: "approval-1",
    } as unknown as ThreadItem,
    {
      type: "fileChange",
      id: "patch-approval-1",
      status: "inProgress",
      approvalRequestId: "approval-2",
      changes: [{ path: "src/app.ts", kind: "update", diff: "@@ -1 +1 @@" }],
    } as unknown as ThreadItem,
  ]);

  assertEqual(
    projection.units.length,
    0,
    "pending approval-backed exec/patch items should not render as ordinary tool activity",
  );
  assertEqual(
    projection.artifacts.length,
    0,
    "pending approval-backed patch should not project artifacts before approval is resolved",
  );
}

function groupsExplorationCommandActionsLikeCodexDesktop(): void {
  const projection = projectConversation([
    {
      type: "commandExecution",
      id: "read-1",
      command: "sed -n '1,20p' src/app.ts",
      status: "completed",
      commandActions: [
        { type: "read", command: "sed -n '1,20p' src/app.ts", name: "app.ts", path: "src/app.ts" },
      ],
      aggregatedOutput: "export {}",
      exitCode: 0,
    } as unknown as ThreadItem,
    {
      type: "commandExecution",
      id: "search-1",
      command: "rg Button packages/ui",
      status: "completed",
      commandActions: [
        { type: "search", command: "rg Button packages/ui", query: "Button", path: "packages/ui" },
      ],
      aggregatedOutput: "packages/ui/src/button.tsx",
      exitCode: 0,
    } as unknown as ThreadItem,
    {
      type: "commandExecution",
      id: "list-1",
      command: "rg --files packages/ui",
      status: "completed",
      commandActions: [
        { type: "listFiles", command: "rg --files packages/ui", path: "packages/ui" },
      ],
      aggregatedOutput: "packages/ui/src/index.ts",
      exitCode: 0,
    } as unknown as ThreadItem,
  ]);

  const unit = projection.units[0];
  assertEqual(projection.units.length, 1, "adjacent exploration command actions should collapse together");
  assertEqual(unit?.kind, "toolActivity", "exploration actions should render as tool activity");
  if (unit?.kind === "toolActivity") {
    assertEqual(unit.summary.icon, "search", "exploration activity icon");
    assertEqual(unit.summary.label, "Explored 1 file, 1 search, 1 list", "exploration summary label");
    assertEqual(unit.summary.counts.commands, 0, "exploration actions should not count as shell commands");
    assertEqual(unit.summary.counts.exploredFiles, 1, "read command action count");
    assertEqual(unit.summary.counts.searches, 1, "search command action count");
    assertEqual(unit.summary.counts.lists, 1, "list command action count");
    assertIncludes(unit.summary.details, "Explored 1 file", "read detail should use exploration wording");
    assertIncludes(unit.summary.details, "Explored 1 search", "search detail should use exploration wording");
    assertIncludes(unit.summary.details, "Listed files", "list-only detail should use list wording");
  }
}

function groupsToolActivityItemsAndPreservesSummaries(): void {
  const items: ThreadItem[] = [
    {
      type: "commandExecution",
      id: "command-1",
      command: "npm run test",
      cwd: "/workspace",
      status: "completed",
      aggregatedOutput: "ok",
      exitCode: 0,
    },
    {
      type: "fileChange",
      id: "file-change-1",
      status: "completed",
      changes: [
        { path: "packages/ui/src/state/render-groups.ts", kind: "update" },
        { newPath: "packages/ui/test/render-groups.test.ts", kind: "add" },
      ],
    },
    {
      type: "mcpToolCall",
      id: "mcp-1",
      server: "github",
      tool: "list_prs",
      status: "completed",
      arguments: { state: "open" },
      result: { count: 2 },
      error: null,
    },
    {
      type: "dynamicToolCall",
      id: "dynamic-1",
      namespace: "functions",
      tool: "exec_command",
      status: "running",
      arguments: { cmd: "git status --short" },
      contentItems: null,
      success: null,
    },
  ];

  const projection = projectConversation(items);
  const unit = projection.units[0];

  assertEqual(projection.units.length, 1, "adjacent tool-like items should collapse into one activity group");
  assertEqual(unit?.kind, "toolActivity", "tool-like items should render as tool activity");
  if (unit?.kind === "toolActivity") {
    assertEqual(unit.key, "collapsed-tool-activity:command-1:dynamic-1", "tool activity key should include semantic group type plus first and last item id");
    assertEqual(unit.summary.groupType, "collapsed-tool-activity", "ordinary tools should keep collapsed tool activity group type");
    assertEqual(unit.summary.label, "Calling functions.exec_command", "running tool activity should use the active tool label");
    assertEqual(unit.summary.inProgress, true, "running dynamic tool call should mark activity in progress");
    assertEqual(unit.summary.counts.commands, 1, "command count");
    assertEqual(unit.summary.counts.fileChanges, 1, "file change count");
    assertEqual(unit.summary.counts.mcpCalls, 1, "mcp tool call count");
    assertEqual(unit.summary.counts.dynamicCalls, 1, "dynamic tool call count");
    assertIncludes(unit.summary.details, "Ran npm run test", "command title should be preserved");
    assertIncludes(unit.summary.details, "Created 1 file, edited 1 file", "file change summary should include patch kinds");
    assertIncludes(unit.summary.details, "Called github:list_prs", "mcp tool title should be preserved");
    assertIncludes(
      unit.summary.details,
      "Called functions.exec_command",
      "dynamic tool title should be preserved",
    );
    assertEqual(unit.items.length, 4, "all activity items should stay attached to the activity group");
  }

  assertEqual(projection.artifacts.length, 2, "file changes should project artifact entries");
  assertEqual(projection.artifacts[0]?.title, "render-groups.ts", "first artifact title");
  assertEqual(projection.artifacts[0]?.status, "completed", "first artifact status");
  assertEqual(projection.artifacts[1]?.title, "render-groups.test.ts", "second artifact title");
  assertEqual(projection.artifacts[1]?.status, "completed", "second artifact status");
  assertEqual(projection.sources.length, 1, "non-node MCP calls should project source entries");
  assertEqual(projection.sources[0]?.title, "github:list_prs", "mcp source title");
  assertEqual(projection.sources[0]?.status, "completed", "mcp source status");
}

function summarizesPatchChangeKinds(): void {
  const projection = projectConversation([
    {
      type: "fileChange",
      id: "patch-1",
      status: "completed",
      changes: [
        { path: "src/new.ts", kind: { type: "add" }, diff: "+new" },
        { path: "src/old.ts", kind: { type: "delete" }, diff: "-old" },
        { path: "src/app.ts", kind: { type: "update", move_path: null }, diff: "@@ -1 +1 @@" },
      ],
    } as unknown as ThreadItem,
  ]);

  const unit = projection.units[0];
  assertEqual(unit?.kind, "toolActivity", "patch should render as tool activity");
  if (unit?.kind === "toolActivity") {
    assertEqual(unit.summary.icon, "edit", "patch summary icon");
    assertEqual(unit.summary.label, "Created 1 file, edited 1 file, deleted 1 file", "patch summary should keep change kinds");
    assertEqual(unit.summary.counts.createdFiles, 1, "created file count");
    assertEqual(unit.summary.counts.editedFiles, 1, "edited file count");
    assertEqual(unit.summary.counts.deletedFiles, 1, "deleted file count");
  }
}

function formatsExpandedToolDetailsSemantically(): void {
  const exploration = {
    type: "commandExecution",
    id: "read-1",
    command: "sed -n '1,20p' src/app.ts",
    status: "completed",
    commandActions: [
      { type: "read", command: "sed -n '1,20p' src/app.ts", name: "app.ts", path: "src/app.ts" },
    ],
    aggregatedOutput: "export {}",
    exitCode: 0,
  } as unknown as ThreadItem;
  const patch = {
    type: "fileChange",
    id: "patch-1",
    status: "completed",
    changes: [
      { path: "src/app.ts", kind: { type: "update", move_path: null }, diff: "@@ -1 +1 @@\n-old\n+new" },
    ],
  } as unknown as ThreadItem;

  assertEqual(
    formatItemDetail(exploration),
    "Read src/app.ts",
    "expanded exploration detail should use semantic read wording",
  );
  assertEqual(
    formatItemDetail(patch),
    "Edited src/app.ts\n@@ -1 +1 @@\n-old\n+new",
    "expanded patch detail should include action and diff",
  );
}

function groupsWebSearchIntoActivityAndSources(): void {
  const projection = projectConversation([
    {
      type: "webSearch",
      id: "web-search-1",
      query: "Codex app-server protocol",
      status: "completed",
    } as ThreadItem,
  ]);
  const unit = projection.units[0];

  assertEqual(unit?.kind, "toolActivity", "web search should render as tool activity");
  if (unit?.kind === "toolActivity") {
    assertEqual(unit.summary.groupType, "web-search-group", "web search should use the Desktop web search group type");
    assertEqual(unit.summary.label, "Searched web", "web search activity label");
    assertEqual(unit.summary.counts.webSearches, 1, "web search count");
    assertDeepEqual(
      unit.summary.details,
      ["Searched web for Codex app-server protocol"],
      "web search detail should include query",
    );
  }
  assertEqual(projection.sources.length, 1, "web search should project one source");
  assertEqual(projection.sources[0]?.id, "web:Codex app-server protocol", "web source id");
  assertEqual(projection.sources[0]?.meta, "Web search", "web source meta");
}

function groupsAdjacentWebSearchesLikeCodexDesktop(): void {
  const projection = projectConversation([
    {
      type: "webSearch",
      id: "web-search-1",
      query: "Codex Desktop render groups",
      status: "completed",
    } as ThreadItem,
    {
      type: "webSearch",
      id: "web-search-2",
      query: "Codex Desktop multi agent UI",
      status: "completed",
    } as ThreadItem,
    {
      type: "commandExecution",
      id: "command-1",
      command: "npm test",
      status: "completed",
      aggregatedOutput: "ok",
      exitCode: 0,
    } as ThreadItem,
  ]);

  assertEqual(projection.units.length, 2, "web search group should split from following command activity");
  const search = projection.units[0];
  assertEqual(search?.kind, "toolActivity", "adjacent web searches should render as one activity");
  if (search?.kind === "toolActivity") {
    assertEqual(search.key, "web-search-group:Codex Desktop render groups:0", "web search group key should follow Desktop query/index shape");
    assertEqual(search.summary.groupType, "web-search-group", "adjacent web searches should keep Desktop group type");
    assertEqual(search.summary.label, "Searched web", "web search group label");
    assertEqual(search.summary.counts.webSearches, 2, "web search group count");
    assertDeepEqual(
      search.summary.details,
      [
        "Searched web for Codex Desktop render groups",
        "Searched web for Codex Desktop multi agent UI",
      ],
      "web search group should preserve individual query rows",
    );
  }
}

function rendersActiveWebSearchLikeCodexDesktop(): void {
  const projection = projectConversation([
    {
      type: "webSearch",
      id: "web-search-active",
      query: "fallback",
      action: { type: "search", queries: ["Codex Desktop", "HiCodex"] },
      completed: false,
    } as unknown as ThreadItem,
  ]);
  const unit = projection.units[0];

  assertEqual(unit?.kind, "toolActivity", "active web search should render as tool activity");
  if (unit?.kind === "toolActivity") {
    assertEqual(unit.summary.groupType, "web-search-group", "active web search group type");
    assertEqual(unit.summary.inProgress, true, "completed=false should mark web search active");
    assertEqual(unit.summary.label, "Searching the web for Codex Desktop ...", "active web search label should use action detail");
    assertDeepEqual(
      unit.summary.details,
      ["Searched web for Codex Desktop ..."],
      "active web search rows should preserve action detail",
    );
  }
}

function rendersInProgressMultiAgentActionsAsDesktopActivity(): void {
  const projection = projectConversation([
    {
      type: "collabAgentToolCall",
      id: "spawn-active",
      tool: "spawnAgent",
      status: "inProgress",
      senderThreadId: "parent",
      receiverThreadIds: ["agent-active-123456"],
      prompt: "Inspect active rendering",
      model: null,
      reasoningEffort: null,
      agentsStates: {},
    } as ThreadItem,
  ]);
  const unit = projection.units[0];

  assertEqual(unit?.kind, "toolActivity", "in-progress multi-agent actions should not fall back to plain events");
  if (unit?.kind === "toolActivity") {
    assertEqual(unit.key, "multi-agent-group:spawnAgent:inProgress:spawn-active", "in-progress multi-agent action key");
    assertEqual(unit.summary.groupType, "multi-agent-group", "in-progress multi-agent group type");
    assertEqual(unit.summary.inProgress, true, "in-progress multi-agent group should stay active");
    assertEqual(unit.summary.label, "Spawning 1 agent", "in-progress multi-agent header");
    assertDeepEqual(
      unit.summary.details,
      ["Spawning agent-ac...3456"],
      "in-progress multi-agent rows should use Desktop row verbs",
    );
  }
}

function groupsCompletedMultiAgentActionsLikeCodexDesktop(): void {
  const projection = projectConversation([
    {
      type: "collabAgentToolCall",
      id: "spawn-1",
      tool: "spawnAgent",
      status: "completed",
      senderThreadId: "parent",
      receiverThreadIds: ["agent-1234567890abcdef"],
      prompt: "Inspect render groups",
      model: null,
      reasoningEffort: null,
      agentsStates: {},
    } as ThreadItem,
    {
      type: "collabAgentToolCall",
      id: "spawn-2",
      tool: "spawnAgent",
      status: "completed",
      senderThreadId: "parent",
      receiverThreadIds: ["agent-fedcba0987654321"],
      prompt: "Inspect composer",
      model: null,
      reasoningEffort: null,
      agentsStates: {},
    } as ThreadItem,
    {
      type: "collabAgentToolCall",
      id: "message-1",
      tool: "sendInput",
      status: "completed",
      senderThreadId: "parent",
      receiverThreadIds: ["agent-1234567890abcdef"],
      prompt: "Continue",
      model: null,
      reasoningEffort: null,
      agentsStates: {},
    } as ThreadItem,
  ]);

  assertEqual(projection.units.length, 2, "multi-agent groups should split when action changes");
  const spawned = projection.units[0];
  assertEqual(spawned?.kind, "toolActivity", "completed spawn actions should render as a grouped activity");
  if (spawned?.kind === "toolActivity") {
    assertEqual(spawned.key, "multi-agent-group:spawnAgent:completed:spawn-1", "spawn group key should follow Desktop action/status/id shape");
    assertEqual(spawned.summary.groupType, "multi-agent-group", "spawn group type");
    assertEqual(spawned.summary.label, "Spawned 2 agents", "spawn group label");
    assertDeepEqual(
      spawned.summary.details,
      [
        "Created agent-12...cdef with the instructions: Inspect render groups",
        "Created agent-fe...4321 with the instructions: Inspect composer",
      ],
      "spawn group rows should preserve per-agent instructions",
    );
  }
  const messaged = projection.units[1];
  assertEqual(messaged?.kind, "toolActivity", "completed sendInput should render as its own grouped activity");
  if (messaged?.kind === "toolActivity") {
    assertEqual(messaged.summary.label, "Messaged 1 agent", "sendInput group label");
    assertDeepEqual(
      messaged.summary.details,
      ["Messaged agent-12...cdef: Continue"],
      "sendInput group should include the prompt row",
    );
  }
}

function returnsEmptyProjectionForEmptyItems(): void {
  const projection = projectConversation([]);

  assertEqual(projection.units.length, 0, "empty items should produce no render units");
  assertEqual(projection.progress.length, 0, "empty items should produce no progress entries");
  assertEqual(projection.artifacts.length, 0, "empty items should produce no artifacts");
  assertEqual(projection.sources.length, 0, "empty items should produce no sources");
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

function assertIncludes(actual: string[], expected: string, message: string): void {
  if (!actual.includes(expected)) {
    throw new Error(`${message}: expected ${JSON.stringify(actual)} to include ${JSON.stringify(expected)}`);
  }
}

function eventByKey(
  projection: ReturnType<typeof projectConversation>,
  key: string,
): Extract<ReturnType<typeof projectConversation>["units"][number], { kind: "event" }> {
  const unit = projection.units.find((candidate) => candidate.kind === "event" && candidate.key === key);
  if (unit?.kind !== "event") {
    throw new Error(`expected ${key} to be an event unit`);
  }
  return unit;
}

function assertTextIncludes(actual: string, expected: string, message: string): void {
  if (!actual.includes(expected)) {
    throw new Error(`${message}: expected ${JSON.stringify(actual)} to include ${JSON.stringify(expected)}`);
  }
}
