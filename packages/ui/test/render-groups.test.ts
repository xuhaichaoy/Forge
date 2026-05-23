import {
  assistantMessagePhase,
  formatItemDetail,
  itemText,
  projectConversation,
  splitTurnItems,
  stripRawThinkingMarkup,
  type AccumulatedThreadItem as ThreadItem,
} from "../src/state/render-groups";

const TEST_SKILL_PATH = "/workspace/.codex/skills/code-review";

export default function runRenderGroupsTests(): void {
  projectsUserAndAssistantMessagesAsStableMessageGroups();
  projectsHeartbeatAssistantMessagesLikeDesktop();
  projectsResponsesApiImagePartsAsUserImages();
  stripsRawThinkingMarkupFromAssistantMessages();
  marksLatestAssistantMessageAsStreamingDuringActiveTurn();
  doesNotStreamCompletedAssistantWhileToolsAreRunning();
  rendersAssistantStreamingPlaceholderFromDesktopFlag();
  rendersDesktopThinkingPlaceholderForActiveEmptyTurn();
  suppressesDesktopThinkingPlaceholderWhileToolsRun();
  groupsReasoningSummaryAndContentIntoToolActivity();
  marksIncompleteReasoningAsThinkingLikeCodexDesktop();
  showsThinkingPlaceholderWhileReasoningStreams();
  splitsReasoningFromCollapsedToolActivity();
  groupsPendingMcpCallsSeparately();
  hydratesMcpAppResourceUriFromServerStatusLikeCodexDesktop();
  keepsDesktopInlineMcpToolsOutOfPendingMcpGroups();
  suppressesPendingMcpCallCoveredByElicitation();
  projectsDesktopLifecycleEventsSemantically();
  projectsErrorDetailFieldsAsDisclosures();
  filtersNonHighRiskModelReroutesLikeCodexDesktop();
  projectsContextCompactionSnapshotStatusFromTurnState();
  projectsDiffAndGeneratedImageEventsWithRenderableFormats();
  projectsOfficialImageGenerationTurnOutputIntoGallery();
  splitsTurnItemsIntoCodexDesktopBuckets();
  projectsTurnBucketsInCodexDesktopOrder();
  injectsInProgressDiffAfterLatestUserMessage();
  rendersTurnDiffWhenNoBlockingRequestLikeCodexDesktop();
  projectsFinalAssistantArtifactsIntoMessageUnits();
  keepsFinalAssistantArtifactsOffCommentaryMessages();
  keepsPreviousArtifactsOutOfLaterAssistantMessages();
  keepsSingleCompletedExecRowsStandaloneLikeCodexDesktop();
  keepsCurrentTailExecRowsAsActivityWhileTurnIsRunning();
  projectsExplicitWorkedForItemAsCompactActivity();
  usesWorkedForAsTurnCollapseDividerBeforeAssistant();
  keepsWorkedForExpandedUntilFinalAssistantStarts();
  keepsRunningWorkedForAfterRehydratedAssistantCommentary();
  keepsTodoListInMainConversationAndProjectsProgress();
  rendersProposedPlanAsInlineCardOnly();
  keepsBlockingRequestsOutOfTranscriptButSuppressesThinking();
  hidesPendingApprovalItemsFromOrdinaryActivity();
  groupsExplorationCommandActionsLikeCodexDesktop();
  labelsSkillExplorationActionsLikeCodexDesktop();
  dedupesExplorationReadCountsByCwdLikeCodexDesktop();
  keepsReasoningInsideActiveExplorationLikeCodexDesktop();
  treatsReadOnlyCurlCommandsAsWebSearchCommandsLikeCodexDesktop();
  groupsToolActivityItemsAndPreservesSummaries();
  groupsCompletedAutoReviewWithAdjacentActivityLikeCodexDesktop();
  dropsHookThreadItemsLikeCodexDesktop();
  summarizesPatchChangeKinds();
  showsActivePatchDiffStatsLikeCodexDesktop();
  formatsExpandedToolDetailsSemantically();
  groupsWebSearchIntoActivityAndSources();
  groupsAdjacentWebSearchesLikeCodexDesktop();
  rendersActiveWebSearchLikeCodexDesktop();
  cleansWebSearchSiteFiltersLikeCodexDesktop();
  rendersInProgressMultiAgentActionsAsDesktopActivity();
  keepsInProgressMultiAgentActionsSeparateLikeCodexDesktop();
  groupsCompletedMultiAgentActionsLikeCodexDesktop();
  hidesWaitMultiAgentActionsLikeCodexDesktop();
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
      { type: "skill", name: "code-review", path: TEST_SKILL_PATH },
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
          chipKind: "file",
          label: "render-groups.ts",
          path: "packages/ui/src/state/render-groups.ts",
          fileExtension: "ts",
        },
        {
          kind: "chip",
          chipKind: "skill",
          label: "code-review",
          path: TEST_SKILL_PATH,
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

function projectsHeartbeatAssistantMessagesLikeDesktop(): void {
  const projection = projectConversation([
    {
      type: "agentMessage",
      id: "heartbeat-1",
      text: "",
      phase: "commentary",
      memoryCitation: null,
      structuredOutput: {
        type: "heartbeat",
        notificationMessage: "Still working through the files.",
      },
    } as ThreadItem,
    {
      type: "agentMessage",
      id: "heartbeat-2",
      text: "",
      phase: "commentary",
      memoryCitation: null,
      structured_output: {
        type: "heartbeat",
        decision: "DONT_NOTIFY",
      },
    } as unknown as ThreadItem,
  ]);

  assertEqual(projection.units.length, 2, "heartbeat assistant output should not disappear when content is blank");
  const notification = projection.units[0];
  const quiet = projection.units[1];
  assertEqual(notification?.kind, "message", "heartbeat notification should render as an assistant message");
  if (notification?.kind === "message") {
    assertEqual(notification.text, "Still working through the files.", "heartbeat should use notificationMessage fallback");
  }
  assertEqual(quiet?.kind, "message", "quiet heartbeat should render Desktop's fallback text");
  if (quiet?.kind === "message") {
    assertEqual(quiet.text, "Heartbeat completed quietly.", "DONT_NOTIFY heartbeat should use Desktop fallback copy");
  }
}

function projectsFinalAssistantArtifactsIntoMessageUnits(): void {
  const projection = projectConversation([
    {
      type: "userMessage",
      id: "user-artifact-request",
      content: "Generate an Excel file",
    } as ThreadItem,
    {
      type: "agentMessage",
      id: "assistant-artifact-response",
      text: "Created `beijing_weather_next_7_days.csv` for you.",
      phase: "final",
      memoryCitation: null,
      _turnStatus: "completed",
    } as ThreadItem,
  ]);

  const assistant = projection.units[1];
  assertEqual(assistant?.kind, "message", "final assistant output should stay a message unit");
  if (assistant?.kind === "message") {
    assertEqual(assistant.role, "assistant", "assistant output role");
    assertDeepEqual(
      assistant.artifacts?.map((entry) => ({ title: entry.title, meta: entry.meta })),
      [{ title: "beijing_weather_next_7_days.csv", meta: "beijing_weather_next_7_days.csv" }],
      "final assistant message units should carry their own file resources for inline rendering",
    );
  }
}

function injectsInProgressDiffAfterLatestUserMessage(): void {
  const diff = [
    "diff --git a/packages/ui/src/app.ts b/packages/ui/src/app.ts",
    "index 111..222 100644",
    "--- a/packages/ui/src/app.ts",
    "+++ b/packages/ui/src/app.ts",
    "@@ -1 +1 @@",
    "-old",
    "+new",
  ].join("\n");
  const projection = projectConversation([
    {
      type: "userMessage",
      id: "user-live-diff",
      content: "Update the app.",
      _turnId: "turn-live-diff",
    } as ThreadItem,
    {
      type: "agentMessage",
      id: "agent-live-diff",
      text: "Editing now.",
      phase: "commentary",
      memoryCitation: null,
      _turnId: "turn-live-diff",
    } as ThreadItem,
  ], {
    isThreadRunning: true,
    turnDiff: diff,
  });

  assertEqual(projection.units[0]?.kind, "message", "user message should stay first");
  const liveDiffIndex = projection.units.findIndex((unit) => unit.kind === "inProgressDiff");
  assertEqual(liveDiffIndex, 1, "live diff should be inserted immediately after the user message");
  const liveDiff = projection.units[liveDiffIndex];
  if (liveDiff?.kind !== "inProgressDiff") {
    throw new Error("live diff should render as an inProgressDiff unit");
  }
  assertEqual(liveDiff.diff, diff, "live diff unit should carry the streamed diff");
  assertEqual(liveDiff.turnId, "turn-live-diff", "live diff should stay in the active turn group");
  assertEqual(
    projection.units.some((unit) => unit.kind === "message" && unit.key === "agent-live-diff"),
    true,
    "assistant commentary should stay in the render tree",
  );
}

function keepsFinalAssistantArtifactsOffCommentaryMessages(): void {
  const savedPath = "/Users/haichao/Desktop/data/HiCodex/apps/desktop/src-tauri/report.csv";
  const projection = projectConversation([
    {
      type: "userMessage",
      id: "user-artifact-turn",
      content: "Generate a CSV",
    } as ThreadItem,
    {
      type: "agentMessage",
      id: "assistant-commentary",
      text: "I'll create the CSV now.",
      phase: "commentary",
      memoryCitation: null,
      _turnStatus: "completed",
    } as ThreadItem,
    {
      type: "fileChange",
      id: "file-change-report",
      status: "completed",
      path: savedPath,
      changes: [{ path: savedPath, kind: { type: "add" }, diff: "+a,b" }],
    } as unknown as ThreadItem,
    {
      type: "agentMessage",
      id: "assistant-final",
      text: `Created ${savedPath} for you.`,
      phase: "final_answer",
      memoryCitation: null,
      _turnStatus: "completed",
    } as ThreadItem,
  ]);

  const commentary = projection.units.find((unit) =>
    unit.kind === "message" && unit.item.id === "assistant-commentary"
  );
  const final = projection.units.find((unit) =>
    unit.kind === "message" && unit.item.id === "assistant-final"
  );

  assertDeepEqual(
    commentary?.kind === "message" ? commentary.artifacts?.map((entry) => entry.meta) ?? [] : null,
    [],
    "commentary assistant rows should not inherit later final output resources from the same turn",
  );
  assertDeepEqual(
    final?.kind === "message" ? final.artifacts?.map((entry) => entry.meta) ?? [] : null,
    [savedPath],
    "final assistant rows should still show resources created before the final response",
  );
}

function keepsPreviousArtifactsOutOfLaterAssistantMessages(): void {
  const savedPath = "/Users/haichao/Desktop/data/HiCodex/apps/desktop/src-tauri/北京未来7天天气.xlsx";
  const projection = projectConversation([
    {
      type: "userMessage",
      id: "user-generate-file",
      content: "帮我保存一个 Excel",
    } as ThreadItem,
    {
      type: "agentMessage",
      id: "assistant-generated-file",
      text: `已帮你保存为 Excel 文件:\n\n${savedPath}`,
      phase: "final",
      memoryCitation: null,
      _turnStatus: "completed",
    } as ThreadItem,
    {
      type: "userMessage",
      id: "user-hello",
      content: "你好",
    } as ThreadItem,
    {
      type: "agentMessage",
      id: "assistant-hello",
      text: "你好！有什么我可以帮你的吗？",
      phase: "final",
      memoryCitation: null,
      _turnStatus: "completed",
    } as ThreadItem,
  ]);

  const generated = projection.units.find((unit) =>
    unit.kind === "message" && unit.item.id === "assistant-generated-file"
  );
  const later = projection.units.find((unit) =>
    unit.kind === "message" && unit.item.id === "assistant-hello"
  );

  assertDeepEqual(
    projection.artifacts.map((entry) => entry.meta),
    [savedPath],
    "right rail should keep the previously generated file artifact",
  );
  assertDeepEqual(
    generated?.kind === "message" ? generated.artifacts?.map((entry) => entry.meta) ?? [] : null,
    [savedPath],
    "the generating assistant message should show its file card",
  );
  assertDeepEqual(
    later?.kind === "message" ? later.artifacts?.map((entry) => entry.meta) ?? [] : null,
    [],
    "later assistant messages should not inherit earlier generated file cards",
  );
}

function projectsResponsesApiImagePartsAsUserImages(): void {
  const userMessage: ThreadItem = {
    type: "userMessage",
    id: "user-images",
    content: [
      { type: "input_text", text: "识别一下图片内容" },
      { type: "input_image", image_url: "data:image/png;base64,abc123" },
      { type: "image_url", image_url: { url: "https://example.com/cat.png" } },
      { type: "local_image", path: "/tmp/local screenshot.png" },
    ],
  };

  const projection = projectConversation([userMessage]);
  const unit = projection.units[0];
  if (unit?.kind !== "message") {
    throw new Error("input_image content should stay in the user message unit");
  }

  assertEqual(
    unit.text,
    "识别一下图片内容",
    "Responses-style image parts should not leak image URLs or base64 into message text",
  );
  assertDeepEqual(
    unit.userContent,
    [
      { kind: "text", text: "识别一下图片内容", textElements: [] },
      { kind: "image", source: "url", src: "data:image/png;base64,abc123", label: "User attachment" },
      { kind: "image", source: "url", src: "https://example.com/cat.png", label: "cat.png" },
      { kind: "image", source: "local", src: "/tmp/local screenshot.png", label: "local screenshot.png" },
    ],
    "Responses-style image parts should project to Desktop-like image thumbnails",
  );
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
      completed: false,
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

function doesNotStreamCompletedAssistantWhileToolsAreRunning(): void {
  const projection = projectConversation([
    {
      type: "agentMessage",
      id: "agent-1",
      text: "I will inspect the renderer.",
      phase: "commentary",
      completed: true,
      memoryCitation: null,
    } as ThreadItem,
    {
      type: "commandExecution",
      id: "command-1",
      command: "rg render-groups",
      status: "inProgress",
    } as ThreadItem,
  ], { isThreadRunning: true });

  const assistant = projection.units.find((unit) => unit.kind === "message" && unit.role === "assistant");
  if (assistant?.kind !== "message") {
    throw new Error("completed assistant message should still render");
  }
  assertEqual(
    assistant.isStreaming ?? false,
    false,
    "a completed assistant message should not get a cursor while a later tool is running",
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

function rendersDesktopThinkingPlaceholderForActiveEmptyTurn(): void {
  const projection = projectConversation([
    {
      type: "userMessage",
      id: "user-1",
      content: "你好",
      _turnId: "turn-1",
    } as ThreadItem,
  ], { isThreadRunning: true });

  assertEqual(projection.units.length, 2, "active empty Desktop turn should show user message plus thinking placeholder");
  const unit = projection.units[1];
  assertEqual(unit?.kind, "toolActivity", "thinking placeholder should render through the compact activity row");
  if (unit?.kind === "toolActivity") {
    assertEqual(unit.summary.groupType, "reasoning", "Desktop thinking placeholder uses the reasoning/thinking row style");
    assertEqual(unit.summary.label, "Thinking", "active empty Desktop turn should display Thinking");
    assertEqual(unit.summary.inProgress, true, "thinking placeholder should stay in progress while the turn runs");
    assertEqual(unit.items[0]?.id, "thinking-placeholder:user-1", "placeholder key should be anchored to the active turn");
  }
}

function suppressesDesktopThinkingPlaceholderWhileToolsRun(): void {
  const projection = projectConversation([
    {
      type: "userMessage",
      id: "user-1",
      content: "Search files",
      _turnId: "turn-1",
    } as ThreadItem,
    {
      type: "commandExecution",
      id: "command-1",
      command: "rg Thinking",
      status: "inProgress",
      _turnId: "turn-1",
    } as ThreadItem,
  ], { isThreadRunning: true });

  assertEqual(projection.units.length, 2, "active tool output should suppress the separate thinking placeholder");
  const tool = projection.units[1];
  assertEqual(tool?.kind, "toolActivity", "running command should stay as the visible activity row");
  if (tool?.kind === "toolActivity") {
    assertEqual(tool.summary.groupType, "collapsed-tool-activity", "running non-exploration command should remain command activity");
    assertEqual(tool.items.length, 1, "thinking placeholder should not be folded into a running tool activity");
  }
}

function groupsReasoningSummaryAndContentIntoToolActivity(): void {
  // Codex Desktop's `Jw` agent-body renderer
  // (local-conversation-thread.pretty.js:7881) maps `entry.item.type === "reasoning"`
  // to `F2 = null` — reasoning items never produce a standalone row. They are folded
  // into the surrounding exploration buffer via `Ge` :7782, or silently dropped when
  // no mergeable bucket is active. HiCodex matches by skipping reasoning in
  // `pushActivityItem` unless the item is the synthetic `thinking-placeholder`.
  const reasoning: ThreadItem = {
    type: "reasoning",
    id: "reasoning-1",
    summary: ["Checked the projection contract"],
    content: ["Reasoning details stay on the item"],
  };

  const projection = projectConversation([reasoning]);

  assertEqual(projection.units.length, 0, "standalone reasoning should not produce a render unit (Codex Jw :7881)");
  // Reasoning text remains readable from the item itself for downstream consumers
  // (e.g. exploration group rendering that wants to surface the body in context).
  assertEqual(
    itemText(reasoning),
    "Checked the projection contract\nReasoning details stay on the item",
    "reasoning summary and content should remain readable from the item",
  );
}

function showsThinkingPlaceholderWhileReasoningStreams(): void {
  /*
   * Regression for the case where, while the assistant is reasoning (a
   * `type: "reasoning"` ThreadItem is streaming with `completed: false`) and
   * nothing else is happening yet, the user must still see a live "Thinking"
   * row. Codex `Ge` (split-items-into-render-groups-C1Yh6v3t.js) folds reasoning
   * into the active exploration buffer or drops it, and explicitly clears
   * `isAnyNonExploringAgentItemInProgress` when the last surviving agent item
   * is in-progress reasoning, so `oT` (:8000) still resolves to
   * `{ type: 'thinking', isVisible: true }`. HiCodex must inject the synthetic
   * `desktopThinkingPlaceholderItem` in this scenario — earlier code skipped it
   * because `agentItems.some(isItemInProgress)` would return true for the
   * streaming reasoning item.
   */
  const projection = projectConversation([
    {
      type: "userMessage",
      id: "user-1",
      content: "你好",
      _turnId: "turn-1",
    } as ThreadItem,
    {
      type: "reasoning",
      id: "reasoning-streaming",
      summary: ["Drafting a reply"],
      completed: false,
      _turnId: "turn-1",
    } as ThreadItem,
  ], { isThreadRunning: true });

  assertEqual(projection.units.length, 2, "user message + thinking placeholder (no real reasoning row)");
  const tail = projection.units[1];
  if (tail?.kind === "toolActivity") {
    assertEqual(tail.summary.groupType, "reasoning", "tail unit should be the reasoning placeholder bucket");
    assertEqual(tail.summary.label, "Thinking", "placeholder should render the Thinking label");
    assertEqual(tail.summary.inProgress, true, "placeholder reflects the in-progress thinking state");
    assertEqual(tail.items[0]?.id, "thinking-placeholder:user-1", "anchor placeholder to the active turn");
  } else {
    throw new Error("trailing unit must be a tool activity (the thinking placeholder)");
  }
}

function marksIncompleteReasoningAsThinkingLikeCodexDesktop(): void {
  // Real (non-synthetic) reasoning items, even when streaming, are not surfaced
  // in agent body per Codex `Jw` :7881. The live "Thinking" UX is driven instead
  // by the separate `desktopThinkingPlaceholderItem` injected by
  // `shouldRenderDesktopThinkingPlaceholder`, which carries
  // `_syntheticKind: "thinking-placeholder"`.
  const reasoning: ThreadItem = {
    type: "reasoning",
    id: "reasoning-running",
    summary: ["Checking the current turn"],
    completed: false,
  };

  const projection = projectConversation([reasoning]);
  assertEqual(projection.units.length, 0, "incomplete reasoning is dropped (Codex Jw :7881); Thinking comes from the placeholder path");
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

  // Codex `Jw` :7881 + `Ge` :7782 — reasoning is either absorbed into the active
  // mergeable bucket or silently dropped. Standalone reasoning followed by an exec
  // therefore produces just the exec row (the reasoning has no mergeable bucket to
  // join when it arrives first, so it is dropped per Codex behavior).
  assertEqual(projection.units.length, 1, "reasoning is dropped; only the exec remains");
  const only = projection.units[0];
  if (only?.kind === "threadItem") {
    assertEqual(only.item.id, "command-1", "single completed exec stays standalone");
  } else {
    throw new Error("the remaining group should be the standalone exec row");
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

function hydratesMcpAppResourceUriFromServerStatusLikeCodexDesktop(): void {
  const projection = projectConversation([
    {
      type: "mcpToolCall",
      id: "mcp-app-pending-1",
      server: "browser-use",
      tool: "open",
      status: "inProgress",
      arguments: { url: "https://example.com" },
      result: null,
      error: null,
    } as ThreadItem,
  ], {
    isThreadRunning: true,
    mcpServerStatuses: {
      data: [{
        name: "browser-use",
        tools: {
          open: {
            name: "open",
            inputSchema: {},
            _meta: { "openai/outputTemplate": "ui://browser/widget.html" },
          },
        },
        resources: [],
        resourceTemplates: [],
        authStatus: "unsupported",
      }],
    },
  });

  assertEqual(projection.units.length, 1, "MCP app calls should stay as the active tool activity");
  const unit = projection.units[0];
  if (unit?.kind !== "toolActivity") throw new Error("MCP app call should render as tool activity");
  assertEqual(unit.summary.groupType, "collapsed-tool-activity", "Desktop MCP apps should not become pending MCP groups");
  assertEqual(
    (unit.items[0] as Record<string, unknown> | undefined)?.mcpAppResourceUri,
    "ui://browser/widget.html",
    "Desktop server tool metadata should hydrate the MCP app resource URI before rendering",
  );
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
      raw_detail: "Sandbox profile denied /tmp/hicodex-write.",
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
      reason: "highRiskCyberActivity",
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
  assertEqual(streamError.format, "markdown", "stream errors with details should render through markdown disclosure");
  assertTextIncludes(streamError.text, "Connection dropped", "stream error content");
  assertTextIncludes(streamError.text, "<details><summary>Details</summary>", "stream error details should be behind disclosure");
  assertTextIncludes(streamError.text, "Retry the turn.", "stream error details");

  const systemError = eventByKey(projection, "system-error-1");
  assertEqual(systemError.tone, "error", "system errors should carry error tone");
  assertEqual(systemError.format, "markdown", "system errors with raw detail should render through markdown disclosure");
  assertTextIncludes(systemError.text, "Sandbox failed", "system error content");
  assertTextIncludes(systemError.text, "<details><summary>Details</summary>", "system error raw detail should be behind disclosure");
  assertTextIncludes(systemError.text, "Sandbox profile denied /tmp/hicodex-write.", "system error raw detail");

  const context = eventByKey(projection, "context-1");
  assertTextIncludes(context.text, "Source: auto", "context compaction source");
  assertTextIncludes(context.text, "Status: running", "context compaction status");

  assertTextIncludes(eventByKey(projection, "remote-task-1").text, "Task ID: task-123", "remote task id");
  assertTextIncludes(eventByKey(projection, "model-rerouted-1").text, "gpt-5.3 -> gpt-5.4", "model reroute transition");
  assertTextIncludes(eventByKey(projection, "model-rerouted-1").text, "Reason: highRiskCyberActivity", "model reroute reason");
}

function projectsErrorDetailFieldsAsDisclosures(): void {
  const projection = projectConversation([
    {
      type: "stream-error",
      id: "camel-stream-error",
      content: "Stream stopped",
      additionalDetails: "Camel detail",
    } as unknown as ThreadItem,
    {
      type: "stream-error",
      id: "snake-stream-error",
      message: "Stream failed",
      additional_details: "Snake detail",
    } as unknown as ThreadItem,
    {
      type: "system-error",
      id: "raw-system-error",
      message: "System failed",
      raw_detail: { code: "E_SANDBOX", path: "/tmp/hicodex-write" },
    } as unknown as ThreadItem,
  ]);

  const camel = eventByKey(projection, "camel-stream-error");
  assertEqual(camel.format, "markdown", "camel-case stream error details should use markdown disclosure");
  assertTextIncludes(camel.text, "<details><summary>Details</summary>", "camel-case stream details disclosure");
  assertTextIncludes(camel.text, "Camel detail", "camel-case stream details content");

  const snake = eventByKey(projection, "snake-stream-error");
  assertEqual(snake.format, "markdown", "snake-case stream error details should use markdown disclosure");
  assertTextIncludes(snake.text, "<details><summary>Details</summary>", "snake-case stream details disclosure");
  assertTextIncludes(snake.text, "Snake detail", "snake-case stream details content");

  const raw = eventByKey(projection, "raw-system-error");
  assertEqual(raw.format, "markdown", "raw system error details should use markdown disclosure");
  assertTextIncludes(raw.text, "<details><summary>Details</summary>", "raw system details disclosure");
  assertTextIncludes(raw.text, "\"code\": \"E_SANDBOX\"", "raw system details content");
}

function filtersNonHighRiskModelReroutesLikeCodexDesktop(): void {
  const projection = projectConversation([
    {
      type: "model-rerouted",
      id: "model-rerouted-capacity",
      fromModel: "gpt-5.3",
      toModel: "gpt-5.4",
      reason: "capacity",
    } as unknown as ThreadItem,
    {
      type: "model-rerouted",
      id: "model-rerouted-risk",
      fromModel: "gpt-5.3",
      toModel: "gpt-5.4",
      reason: "highRiskCyberActivity",
    } as unknown as ThreadItem,
  ]);

  assertDeepEqual(
    projection.units.map((unit) => unit.key),
    ["model-rerouted-risk"],
    "only high-risk cyber activity model reroutes should render in the transcript",
  );
}

function projectsContextCompactionSnapshotStatusFromTurnState(): void {
  const projection = projectConversation([
    {
      type: "contextCompaction",
      id: "context-snapshot",
      _turnStatus: "completed",
    } as unknown as ThreadItem,
  ]);

  const context = eventByKey(projection, "context-snapshot");
  assertTextIncludes(context.text, "Source: automatic", "context compaction snapshots should use Desktop's default source");
  assertTextIncludes(context.text, "Status: completed", "context compaction snapshots should inherit completed turn status");
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
      type: "imageGeneration",
      id: "official-image-result-1",
      status: "completed",
      revisedPrompt: null,
      result: "OFFICIALPNG",
    } as unknown as ThreadItem,
    {
      type: "dynamicToolCall",
      id: "hicodex-image-1",
      tool: "hicodex_generate_image",
      status: "completed",
      arguments: { prompt: "blue sky" },
      contentItems: [
        { type: "inputText", text: "Generated image for: blue sky" },
        { type: "inputImage", imageUrl: "data:image/png;base64,PNGDATA" },
      ],
      success: true,
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

  assertEqual(projection.units.length, 6, "renderable Desktop event items should stay visible");
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

  const officialImage = eventByKey(projection, "official-image-result-1");
  assertEqual(officialImage.label, "Generated image", "official image generation label");
  assertEqual(officialImage.format, "markdown", "official image generation result should render as markdown image content");
  assertTextIncludes(
    officialImage.text,
    "![Generated image](data:image/png;base64,OFFICIALPNG)",
    "official image generation should render base64 result when no saved path is available",
  );

  const hiCodexImage = eventByKey(projection, "hicodex-image-1");
  assertEqual(hiCodexImage.label, "Generated image", "HiCodex image tool output should use generated image label");
  assertEqual(hiCodexImage.format, "markdown", "HiCodex image tool output should render as markdown image content");
  assertTextIncludes(
    hiCodexImage.text,
    "![Generated image](data:image/png;base64,PNGDATA)",
    "HiCodex image tool output should render the returned inputImage",
  );

  const automation = eventByKey(projection, "automation-update-1");
  assertTextIncludes(automation.text, "Mode: recording", "automation update mode");
  assertTextIncludes(automation.text, "Automation ID: automation-123", "automation update id");

  const planImplementation = eventByKey(projection, "plan-implementation-1");
  assertTextIncludes(planImplementation.text, "Status: running", "plan implementation running status");
  assertTextIncludes(planImplementation.text, "Implement renderer parity", "plan implementation content");
}

function projectsOfficialImageGenerationTurnOutputIntoGallery(): void {
  const completed = projectConversation([
    {
      type: "userMessage",
      id: "user-1",
      _turnId: "1",
      content: [{ type: "inputText", text: "generate an image" }],
    } as unknown as ThreadItem,
    {
      type: "imageGeneration",
      id: "official-image-result-1",
      _turnId: "1",
      status: "completed",
      revisedPrompt: null,
      result: "OFFICIALPNG",
    } as unknown as ThreadItem,
  ]);

  const completedGallery = completed.units.find((unit) => unit.kind === "generatedImageGallery");
  if (completedGallery?.kind !== "generatedImageGallery") {
    throw new Error("official imageGeneration result should render as a generated image gallery");
  }
  assertEqual(completedGallery.key, "gallery:1", "official imageGeneration gallery key should use the turn id");
  assertEqual(completedGallery.turnId, "1", "official imageGeneration gallery should stay inside the turn group");
  assertEqual(completedGallery.images[0]?.id, "official-image-result-1", "official imageGeneration result should not be dropped");
  assertEqual(completedGallery.hasPending, false, "completed official imageGeneration should not keep pending state");
  assertDeepEqual(
    completed.artifacts.map((entry) => ({ title: entry.title, meta: entry.meta, status: entry.status })),
    [{ title: "Generated image", meta: "data:image/png;base64,OFFICIALPNG", status: "completed" }],
    "completed generated images should also surface in right rail Outputs like Codex Desktop resources",
  );

  const pending = projectConversation([
    {
      type: "userMessage",
      id: "user-3",
      _turnId: "3",
      content: [{ type: "inputText", text: "generate another image" }],
    } as unknown as ThreadItem,
    {
      type: "imageGeneration",
      id: "official-image-pending-1",
      _turnId: "3",
      status: "inProgress",
      revisedPrompt: null,
      result: "",
    } as unknown as ThreadItem,
  ], { isThreadRunning: true });

  const pendingGallery = pending.units.find((unit) => unit.kind === "generatedImageGallery");
  if (pendingGallery?.kind !== "generatedImageGallery") {
    throw new Error("pending official imageGeneration should render the gallery pending placeholder");
  }
  assertEqual(pendingGallery.key, "gallery:3", "pending imageGeneration gallery key should use the turn id");
  assertEqual(pendingGallery.turnId, "3", "pending imageGeneration gallery should stay inside the turn group");
  assertEqual(pendingGallery.images.length, 0, "pending imageGeneration should not add an empty completed image");
  assertEqual(pendingGallery.hasPending, true, "inProgress imageGeneration should render the pending placeholder");

  const emptyStatus = projectConversation([
    {
      type: "userMessage",
      id: "user-empty-status",
      _turnId: "empty-status",
      content: [{ type: "inputText", text: "generate another image" }],
    } as unknown as ThreadItem,
    {
      type: "imageGeneration",
      id: "official-image-empty-status",
      _turnId: "empty-status",
      status: "",
      revisedPrompt: null,
      result: "",
    } as unknown as ThreadItem,
  ], { isThreadRunning: true });
  assertEqual(
    emptyStatus.units.some((unit) => unit.kind === "generatedImageGallery"),
    false,
    "empty-status imageGeneration should not be pending without Desktop in_progress status",
  );

  const suppressedByPptx = projectConversation([
    {
      type: "userMessage",
      id: "user-pptx",
      _turnId: "pptx-turn",
      content: [{ type: "inputText", text: "generate slides" }],
    } as unknown as ThreadItem,
    {
      type: "imageGeneration",
      id: "official-image-for-deck",
      _turnId: "pptx-turn",
      status: "completed",
      revisedPrompt: null,
      result: "DECKPNG",
    } as unknown as ThreadItem,
    {
      type: "agentMessage",
      id: "assistant-pptx",
      _turnId: "pptx-turn",
      text: "Created [deck](slides/deck.pptx)",
      phase: "final",
      memoryCitation: null,
    } as unknown as ThreadItem,
  ]);
  assertEqual(
    suppressedByPptx.units.some((unit) => unit.kind === "generatedImageGallery"),
    false,
    "assistant end-resource .pptx should suppress completed generated-image gallery like Codex Desktop",
  );

  const failed = projectConversation([
    {
      type: "userMessage",
      id: "user-4",
      _turnId: "4",
      content: [{ type: "inputText", text: "generate a failing image" }],
    } as unknown as ThreadItem,
    {
      type: "imageGeneration",
      id: "official-image-failed-1",
      _turnId: "4",
      status: "failed",
      revisedPrompt: null,
      result: "",
    } as unknown as ThreadItem,
  ]);

  const failedEvent = eventByKey(failed, "official-image-failed-1");
  assertEqual(failedEvent.label, "Generated image", "failed imageGeneration should fall back to a status event");
  assertTextIncludes(failedEvent.text, "Status: failed", "failed imageGeneration status should stay visible");
}

function splitsTurnItemsIntoCodexDesktopBuckets(): void {
  const split = splitTurnItems([
    {
      type: "hook",
      id: "hook-before-user",
      status: "completed",
    } as unknown as ThreadItem,
    {
      type: "userMessage",
      id: "user-1",
      content: [{ type: "text", text: "Inspect Desktop projection" }],
    } as ThreadItem,
    {
      type: "model-changed",
      id: "model-changed-1",
      fromModel: "gpt-5.3",
      toModel: "gpt-5.4",
    } as unknown as ThreadItem,
    {
      type: "commandExecution",
      id: "command-1",
      command: "rg VT local-conversation-thread",
      status: "completed",
      exitCode: 0,
    } as ThreadItem,
    {
      type: "agentMessage",
      id: "assistant-1",
      text: "Desktop order confirmed.",
      completed: true,
    } as ThreadItem,
    {
      type: "automatic-approval-review",
      id: "auto-review-1",
      status: "completed",
    } as unknown as ThreadItem,
    {
      type: "generated-image",
      id: "generated-image-1",
      status: "completed",
      src: "https://example.com/out.png",
    } as unknown as ThreadItem,
    {
      type: "dynamicToolCall",
      id: "hicodex-image-1",
      namespace: "hicodex_image",
      tool: "generate",
      status: "completed",
      contentItems: [{ type: "inputImage", imageUrl: "data:image/png;base64,PNGDATA" }],
      success: true,
    } as unknown as ThreadItem,
    {
      type: "auto-review-interruption-warning",
      id: "warning-1",
    } as unknown as ThreadItem,
    {
      type: "proposed-plan",
      id: "plan-1",
      content: "Next patch",
      completed: true,
    } as unknown as ThreadItem,
    {
      type: "turn-diff",
      id: "diff-1",
      unifiedDiff: "+changed",
    } as unknown as ThreadItem,
    {
      type: "remote-task-created",
      id: "remote-1",
      taskId: "task-1",
    } as unknown as ThreadItem,
    {
      type: "personality-changed",
      id: "personality-1",
      personality: "pragmatic",
    } as unknown as ThreadItem,
    {
      type: "forked-from-conversation",
      id: "forked-1",
      sourceConversationId: "parent-1",
    } as unknown as ThreadItem,
  ], "completed");

  assertDeepEqual(split.userItems.map((item) => item.id), ["user-1"], "user bucket");
  assertDeepEqual(split.modelChangedItems.map((item) => item.id), ["model-changed-1"], "model-changed bucket");
  assertDeepEqual(split.agentItems.map((item) => item.id), ["command-1"], "agent bucket should exclude the final assistant");
  assertEqual(split.assistantItem?.id ?? null, "assistant-1", "final assistant bucket");
  assertDeepEqual(split.postAssistantItems.map((item) => item.id), ["warning-1", "auto-review-1"], "post-assistant bucket");
  assertDeepEqual(split.toolOutputItems.map((item) => item.id), ["generated-image-1", "hicodex-image-1"], "tool output bucket");
  assertEqual(split.proposedPlanItem?.id ?? null, "plan-1", "proposed plan bucket");
  assertEqual(split.unifiedDiffItem?.id ?? null, "diff-1", "diff bucket");
  assertDeepEqual(split.remoteTaskCreatedItems.map((item) => item.id), ["remote-1"], "remote task bucket");
  assertDeepEqual(split.personalityChangedItems.map((item) => item.id), ["personality-1"], "personality bucket");
  assertDeepEqual(split.forkedFromConversationItems.map((item) => item.id), ["forked-1"], "forked conversation bucket");
}

function projectsTurnBucketsInCodexDesktopOrder(): void {
  const projection = projectConversation([
    {
      type: "userMessage",
      id: "user-1",
      _turnId: "turn-1",
      content: [{ type: "text", text: "Patch projection" }],
    } as ThreadItem,
    {
      type: "model-changed",
      id: "model-changed-1",
      _turnId: "turn-1",
      fromModel: "gpt-5.3",
      toModel: "gpt-5.4",
    } as unknown as ThreadItem,
    {
      type: "commandExecution",
      id: "command-1",
      _turnId: "turn-1",
      command: "sed -n '1,80p' project-conversation.ts",
      status: "completed",
      exitCode: 0,
    } as ThreadItem,
    {
      type: "automation-update",
      id: "automation-1",
      _turnId: "turn-1",
      result: { mode: "recording", automationId: "automation-1" },
    } as unknown as ThreadItem,
    {
      type: "agentMessage",
      id: "assistant-1",
      _turnId: "turn-1",
      text: "Projection patched.",
      completed: true,
    } as ThreadItem,
    {
      type: "generated-image",
      id: "generated-image-1",
      _turnId: "turn-1",
      status: "completed",
      src: "https://example.com/out.png",
    } as unknown as ThreadItem,
    {
      type: "auto-review-interruption-warning",
      id: "warning-1",
      _turnId: "turn-1",
    } as unknown as ThreadItem,
    {
      type: "proposed-plan",
      id: "plan-1",
      _turnId: "turn-1",
      content: "Next patch",
      completed: true,
    } as unknown as ThreadItem,
    {
      type: "turn-diff",
      id: "diff-1",
      _turnId: "turn-1",
      unifiedDiff: "+changed",
    } as unknown as ThreadItem,
    {
      type: "remote-task-created",
      id: "remote-1",
      _turnId: "turn-1",
      taskId: "task-1",
    } as unknown as ThreadItem,
  ]);

  /*
   * Codex Desktop `JC` gallery aggregates all `generated-image` items in a
   * turn into a single `generatedImageGallery` render unit (per zC/Ut
   * pipeline at local-conversation-thread byte ~540170). HiCodex mirrors
   * this — the lone generated-image item previously emitted as
   * `event:generated-image-1` now appears as
   * `generatedImageGallery:gallery:<turnId>` regardless of count.
   */
  assertDeepEqual(
    projection.units.map((unit) => unit.kind === "message" ? `${unit.role}:${unit.key}` : `${unit.kind}:${unit.key}`),
    [
      "event:model-changed-1",
      "user:user-1",
      "threadItem:item:exec:command-1",
      "assistant:assistant-1",
      "generatedImageGallery:gallery:turn-1",
      "threadItem:item:proposed-plan:plan-1",
      "event:diff-1",
      "event:remote-1",
    ],
    "projectConversation should render split Desktop buckets in VT order",
  );
}

function rendersTurnDiffWhenNoBlockingRequestLikeCodexDesktop(): void {
  const projection = projectConversation([
    {
      type: "userMessage",
      id: "user-1",
      _turnId: "turn-1",
      content: [{ type: "text", text: "Patch projection" }],
    } as ThreadItem,
    {
      type: "turn-diff",
      id: "diff-1",
      _turnId: "turn-1",
      unifiedDiff: "+changed",
    } as unknown as ThreadItem,
    {
      type: "agentMessage",
      id: "assistant-1",
      _turnId: "turn-1",
      text: "Projection patched.",
      completed: true,
    } as ThreadItem,
  ]);

  assertDeepEqual(
    projection.units.map((unit) => unit.key),
    ["user-1", "assistant-1", "diff-1"],
    "turn-diff should render when the turn has no blocking request and is not in prose mode",
  );
}

function keepsSingleCompletedExecRowsStandaloneLikeCodexDesktop(): void {
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
  assertEqual(unit?.kind, "threadItem", "single completed exec rows should stay standalone in Desktop command detail mode");
  if (unit?.kind === "threadItem") {
    assertEqual(unit.item.id, "command-1", "standalone exec row should keep the original item");
  }
}

function keepsCurrentTailExecRowsAsActivityWhileTurnIsRunning(): void {
  const projection = projectConversation([
    {
      type: "userMessage",
      id: "user-1",
      content: [{ type: "text", text: "Run the build" }],
    } as ThreadItem,
    {
      type: "commandExecution",
      id: "command-1",
      command: "npm run build",
      status: "running",
      startedAtMs: 1_000,
    } as ThreadItem,
  ], { isThreadRunning: true });

  const unit = projection.units[1];
  assertEqual(unit?.kind, "toolActivity", "current tail exec should stay grouped while the turn is still running");
  if (unit?.kind === "toolActivity") {
    assertEqual(unit.summary.groupType, "collapsed-tool-activity", "running tail exec should keep the ordinary activity group");
    assertEqual(unit.items[0]?.id, "command-1", "running activity should preserve the command item");
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
    assertEqual(unit.key, "worked-for:worked-for-1", "worked-for key should be anchored to the bucket's first-item id (stable across re-projections during streaming)");
    assertEqual(unit.summary.groupType, "worked-for", "worked-for group type");
    assertEqual(unit.summary.label, "Worked for 1m 5s", "worked-for label should use item timestamps");
    assertEqual(unit.summary.totalDurationMs, 65_000, "worked-for duration should come from started/completed timestamps");
  }
}

function usesWorkedForAsTurnCollapseDividerBeforeAssistant(): void {
  const projection = projectConversation([
    {
      type: "userMessage",
      id: "user-1",
      content: [{ type: "text", text: "Inspect renderer" }],
    } as ThreadItem,
    {
      type: "commandExecution",
      id: "command-1",
      command: "rg latest-turn-preview",
      status: "completed",
      exitCode: 0,
      aggregatedOutput: "no matches",
    } as ThreadItem,
    {
      type: "agentMessage",
      id: "assistant-commentary-1",
      text: "I started by checking the source tree.",
      phase: "commentary",
      completed: true,
    } as ThreadItem,
    {
      type: "worked-for",
      id: "worked-for-1",
      status: "completed",
      startedAtMs: 1_000,
      completedAtMs: 21_000,
    } as ThreadItem,
    {
      type: "agentMessage",
      id: "assistant-1",
      text: "I checked the renderer.",
    } as ThreadItem,
  ]);

  assertEqual(projection.units.length, 5, "worked-for should render as the divider between agent activity and assistant output");
  assertEqual(projection.units[0]?.kind, "message", "user message should remain first");
  const activity = projection.units[1];
  assertEqual(activity?.kind, "threadItem", "single completed exec rows before commentary should stay standalone like Codex Desktop");
  if (activity?.kind === "threadItem") {
    assertEqual(activity.item.id, "command-1", "standalone exec row should keep the command item");
  }
  const commentary = projection.units[2];
  assertEqual(commentary?.kind, "message", "intermediate commentary should remain a normal assistant message");
  if (commentary?.kind === "message") {
    assertEqual(commentary.role, "assistant", "intermediate commentary should keep the assistant role");
    assertEqual(commentary.assistantPhase, "commentary", "intermediate commentary should keep the commentary phase");
  }
  const workedFor = projection.units[3];
  assertEqual(workedFor?.kind, "toolActivity", "worked-for should render before assistant as a divider source");
  if (workedFor?.kind === "toolActivity") {
    assertEqual(workedFor.summary.groupType, "worked-for", "worked-for should keep its own semantic group");
    assertEqual(workedFor.summary.label, "Worked for 20s", "divider label should use worked-for duration");
    assertEqual(workedFor.summary.defaultExpanded, false, "worked-for divider should collapse after final assistant output starts");
    assertDeepEqual(
      workedFor.items.map((item) => item.id),
      ["worked-for-1"],
      "worked-for item should not swallow the expanded agent body",
    );
  }
  assertEqual(projection.units[4]?.kind, "message", "assistant message should render after worked-for divider");
}

function keepsWorkedForExpandedUntilFinalAssistantStarts(): void {
  const projection = projectConversation([
    {
      type: "userMessage",
      id: "user-1",
      content: [{ type: "text", text: "Inspect renderer" }],
    } as ThreadItem,
    {
      type: "commandExecution",
      id: "command-1",
      command: "rg render-groups",
      status: "completed",
      exitCode: 0,
    } as ThreadItem,
    {
      type: "worked-for",
      id: "worked-for-1",
      status: "working",
      startedAtMs: 1_000,
    } as ThreadItem,
  ]);

  assertEqual(projection.units.length, 3, "running worked-for should stay separate from preceding activity");
  const activity = projection.units[1];
  assertEqual(activity?.kind, "threadItem", "single completed exec before worked-for should stay standalone once the slice is closed");
  if (activity?.kind === "threadItem") {
    assertEqual(activity.item.id, "command-1", "standalone exec row should preserve the command item");
  }
  const workedFor = projection.units[2];
  assertEqual(workedFor?.kind, "toolActivity", "running worked-for activity should render after the command");
  if (workedFor?.kind === "toolActivity") {
    assertEqual(workedFor.summary.groupType, "worked-for", "running worked-for should keep its own group");
    assertEqual(workedFor.summary.defaultExpanded, true, "worked-for should stay expanded until final assistant output starts");
  }
}

function keepsRunningWorkedForAfterRehydratedAssistantCommentary(): void {
  const projection = projectConversation([
    {
      type: "userMessage",
      id: "user-1",
      content: [{ type: "text", text: "Review current changes" }],
      _turnId: "turn-1",
      _turnStatus: "in_progress",
    } as ThreadItem,
    {
      type: "commandExecution",
      id: "command-1",
      command: "npm test",
      status: "completed",
      exitCode: 0,
      _turnId: "turn-1",
      _turnStatus: "in_progress",
    } as ThreadItem,
    {
      type: "worked-for",
      id: "worked-for-1",
      status: "completed",
      startedAtMs: 1_000,
      completedAtMs: 481_000,
      _turnId: "turn-1",
      _turnStatus: "in_progress",
    } as ThreadItem,
    {
      type: "agentMessage",
      id: "assistant-commentary-1",
      text: "Tests passed. I am checking the runtime edge case next.",
      phase: "commentary",
      completed: true,
      _turnId: "turn-1",
      _turnStatus: "in_progress",
    } as ThreadItem,
    {
      type: "reasoning",
      id: "reasoning-1",
      completed: false,
      _turnId: "turn-1",
      _turnStatus: "in_progress",
    } as unknown as ThreadItem,
  ], { isThreadRunning: true });

  assertDeepEqual(
    projection.units.map((unit) =>
      unit.kind === "message"
        ? `${unit.role}:${unit.item.id}`
        : `${unit.kind}:${unit.key}`
    ),
    [
      "user:user-1",
      "threadItem:item:exec:command-1",
      "assistant:assistant-commentary-1",
      "toolActivity:worked-for:worked-for-1",
      "toolActivity:reasoning:thinking-placeholder:user-1",
    ],
    "rehydrated running turns should keep worked-for below the latest assistant commentary",
  );
}

function keepsTodoListInMainConversationAndProjectsProgress(): void {
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

  assertEqual(projection.units.length, 2, "todo-list should render as an inline plan card plus the assistant message");
  assertEqual(projection.units[0]?.kind, "threadItem", "todo-list should render as a main conversation thread item");
  assertEqual(projection.units[1]?.kind, "message", "assistant message should remain in the main conversation");
  assertDeepEqual(
    projection.progress.map((entry) => entry.title),
    ["Inspect Codex Desktop output", "Patch HiCodex projection"],
    "todo-list should still drive Progress",
  );
}

function rendersProposedPlanAsInlineCardOnly(): void {
  const projection = projectConversation([
    {
      type: "userMessage",
      id: "user-1",
      content: [{ type: "text", text: "Draft a plan" }],
    } as ThreadItem,
    {
      type: "proposed-plan",
      id: "plan-1",
      content: "1. Inspect\n2. Patch\n3. Verify",
      completed: false,
    } as unknown as ThreadItem,
  ], { isThreadRunning: true });

  assertEqual(projection.units.length, 2, "proposed-plan should render with the user message");
  assertEqual(projection.units[1]?.kind, "threadItem", "proposed-plan should render as a dedicated thread item");
  if (projection.units[1]?.kind === "threadItem") {
    assertEqual(projection.units[1].key, "item:proposed-plan:plan-1", "proposed-plan card key");
  }
  assertDeepEqual(projection.progress, [], "proposed-plan should not drive right-rail Progress");
}

function keepsBlockingRequestsOutOfTranscriptButSuppressesThinking(): void {
  const projection = projectConversation([
    {
      type: "userMessage",
      id: "user-1",
      _turnId: "turn-1",
      content: [{ type: "text", text: "Run the build" }],
    } as ThreadItem,
    {
      type: "permission-request",
      id: "permission-1",
      _turnId: "turn-1",
      completed: false,
      reason: "Needs write access",
    } as unknown as ThreadItem,
    {
      type: "commandExecution",
      id: "command-approval-1",
      _turnId: "turn-1",
      command: "npm run build",
      status: "inProgress",
      approvalRequestId: "approval-1",
    } as unknown as ThreadItem,
    {
      type: "userInput",
      id: "user-input-1",
      _turnId: "turn-1",
      completed: false,
      questions: [{ question: "Proceed?", options: ["Yes", "No"] }],
    } as unknown as ThreadItem,
  ], { isThreadRunning: true });

  assertDeepEqual(
    projection.units.map((unit) => unit.kind === "message" ? `${unit.role}:${unit.key}` : `${unit.kind}:${unit.key}`),
    ["user:user-1"],
    "pending permission, approval, and user-input requests should stay out of transcript rows and suppress thinking",
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
    assertEqual(unit.summary.groupType, "exploration", "exploration actions should keep Desktop's exploration group type");
    assertEqual(unit.summary.icon, "search", "exploration activity icon");
    /* Codex Desktop `_v` (local-conversation-thread byte ~269682) uses
     * `intl.formatList(parts, { type: "conjunction" })` → "X, Y, and Z" with a
     * conjunction before the last segment. HiCodex matches via Intl.ListFormat
     * — see explorationSummaryLabel in tool-activity-grouping.ts. */
    assertEqual(unit.summary.label, "Explored 1 file, 1 search, and 1 list", "exploration summary label");
    assertEqual(unit.summary.counts.commands, 0, "exploration actions should not count as shell commands");
    assertEqual(unit.summary.counts.exploredFiles, 1, "read command action count");
    assertEqual(unit.summary.counts.searches, 1, "search command action count");
    assertEqual(unit.summary.counts.lists, 1, "list command action count");
    assertIncludes(unit.summary.details, "Explored 1 file", "read detail should use exploration wording");
    assertIncludes(unit.summary.details, "Explored 1 search", "search detail should use exploration wording");
    assertIncludes(unit.summary.details, "Listed files", "list-only detail should use list wording");
  }
}

function labelsSkillExplorationActionsLikeCodexDesktop(): void {
  const cwd = "/workspace/project";
  const skillDefinition = {
    type: "commandExecution",
    id: "skill-read",
    command: "sed -n '1,120p' ../.codex/skills/code-review/SKILL.md",
    cwd,
    status: "completed",
    commandActions: [
      { type: "read", path: "../.codex/skills/code-review/SKILL.md", isFinished: true },
    ],
    exitCode: 0,
  } as unknown as ThreadItem;
  const skillList = {
    type: "commandExecution",
    id: "skill-list",
    command: "rg --files /workspace/.codex/skills/code-review",
    cwd,
    status: "completed",
    commandActions: [
      { type: "list_files", path: "/workspace/.codex/skills/code-review/scripts" },
    ],
    exitCode: 0,
  } as unknown as ThreadItem;
  const skillSearch = {
    type: "commandExecution",
    id: "skill-search",
    command: "rg TODO /workspace/.codex/skills/code-review",
    cwd,
    status: "completed",
    commandActions: [
      { type: "search", query: "TODO", path: "/workspace/.codex/skills/code-review" },
    ],
    exitCode: 0,
  } as unknown as ThreadItem;
  const activeSkillRead = {
    type: "commandExecution",
    id: "skill-active-read",
    command: "sed -n '1,120p' /workspace/.codex/skills/code-review/SKILL.md",
    cwd,
    status: "running",
    commandActions: [
      { type: "read", path: "/workspace/.codex/skills/code-review/SKILL.md", isFinished: false },
    ],
  } as unknown as ThreadItem;

  assertEqual(
    formatItemDetail(skillDefinition),
    "Read Code Review skill",
    "skill definition reads should use Codex Desktop's skill exploration wording",
  );
  assertEqual(
    formatItemDetail(skillList),
    "Listed files in Code Review skill",
    "skill directory listings should use Codex Desktop's skill exploration wording",
  );
  assertEqual(
    formatItemDetail(skillSearch),
    "Searched for TODO in Code Review skill",
    "skill directory searches should use Codex Desktop's skill exploration wording",
  );

  const projection = projectConversation([activeSkillRead], { isThreadRunning: true });
  const unit = projection.units[0];
  assertEqual(unit?.kind, "toolActivity", "active skill read should render as tool activity");
  if (unit?.kind === "toolActivity") {
    assertEqual(
      unit.summary.label,
      "Reading Code Review skill",
      "active skill definition reads should use Codex Desktop's Reading skill label",
    );
  }
}

function dedupesExplorationReadCountsByCwdLikeCodexDesktop(): void {
  const projection = projectConversation([
    {
      type: "commandExecution",
      id: "read-relative",
      command: "sed -n '1,20p' src/app.ts",
      cwd: "/workspace/project",
      status: "completed",
      commandActions: [
        { type: "read", command: "sed -n '1,20p' src/app.ts", path: "./src/app.ts" },
      ],
      exitCode: 0,
    } as unknown as ThreadItem,
    {
      type: "commandExecution",
      id: "read-absolute",
      command: "sed -n '1,20p' /workspace/project/src/app.ts",
      cwd: "/workspace/project",
      status: "completed",
      commandActions: [
        { type: "read", command: "sed -n '1,20p' /workspace/project/src/app.ts", path: "/workspace/project/src/app.ts" },
      ],
      exitCode: 0,
    } as unknown as ThreadItem,
  ]);
  const unit = projection.units[0];

  assertEqual(projection.units.length, 1, "duplicate read paths should stay in one exploration group");
  if (unit?.kind !== "toolActivity") {
    throw new Error("duplicate exploration reads should render as tool activity");
  }
  assertEqual(unit.summary.groupType, "exploration", "duplicate reads should keep exploration group");
  assertEqual(unit.summary.counts.exploredFiles, 1, "cwd-normalized duplicate reads should count once");
  assertEqual(unit.summary.label, "Explored 1 file", "exploration label should use deduped read count");
}

function keepsReasoningInsideActiveExplorationLikeCodexDesktop(): void {
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
      type: "reasoning",
      id: "reasoning-1",
      summary: ["Need another file"],
      content: [],
    } as ThreadItem,
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
  ]);

  const unit = projection.units[0];
  assertEqual(projection.units.length, 1, "reasoning between exploration entries should not split the exploration accordion");
  if (unit?.kind !== "toolActivity") {
    throw new Error("exploration with reasoning should still render as tool activity");
  }
  assertEqual(unit.summary.groupType, "exploration", "reasoning should inherit the open exploration group");
  assertDeepEqual(
    unit.items.map((item) => item.id),
    ["read-1", "reasoning-1", "search-1"],
    "exploration group should retain reasoning between read/search entries",
  );
  assertEqual(unit.summary.counts.exploredFiles, 1, "read count should remain stable");
  assertEqual(unit.summary.counts.searches, 1, "search count should remain stable");
}

function treatsReadOnlyCurlCommandsAsWebSearchCommandsLikeCodexDesktop(): void {
  const completed = projectConversation([
    {
      type: "commandExecution",
      id: "curl-docs",
      command: "curl https://example.com/docs",
      status: "completed",
      output: { exitCode: 0, stdout: "ok" },
    } as unknown as ThreadItem,
  ]);
  const completedUnit = completed.units[0];
  assertEqual(completedUnit?.kind, "threadItem", "completed external curl should stay standalone in Desktop command detail mode");
  if (completedUnit?.kind === "threadItem") {
    assertEqual(completedUnit.item.id, "curl-docs", "completed external curl should keep the original exec item");
  }

  const completedProse = projectConversation([
    {
      type: "commandExecution",
      id: "curl-docs",
      command: "curl https://example.com/docs",
      status: "completed",
      output: { exitCode: 0, stdout: "ok" },
    } as unknown as ThreadItem,
  ], { conversationDetailLevel: "STEPS_PROSE" });
  const completedProseUnit = completedProse.units[0];
  assertEqual(completedProseUnit?.kind, "toolActivity", "completed external curl should still classify as activity in Desktop prose mode");
  if (completedProseUnit?.kind === "toolActivity") {
    assertEqual(completedProseUnit.summary.label, "Searched web", "completed external curl should use Desktop web-search command wording");
    assertEqual(completedProseUnit.summary.icon, "web-search", "completed external curl should use web-search icon");
    assertEqual(completedProseUnit.summary.counts.commands, 1, "web-search curl still counts as an exec command");
    assertEqual(completedProseUnit.summary.counts.webSearchCommands, 1, "web-search curl command count");
  }

  const running = projectConversation([
    {
      type: "commandExecution",
      id: "curl-running",
      command: "curl https://openai.com/news",
      status: "running",
    } as unknown as ThreadItem,
  ], { isThreadRunning: true });
  const runningUnit = running.units[0];
  if (runningUnit?.kind !== "toolActivity") {
    throw new Error("running external curl should render as activity");
  }
  assertEqual(runningUnit.summary.label, "Searching the web", "running external curl should use Desktop active web-search wording");
  assertEqual(runningUnit.summary.activeDetail, "Searching the web", "running external curl active detail");
  assertEqual(runningUnit.summary.counts.runningWebSearchCommands, 1, "running web-search command count");

  const mutating = projectConversation([
    {
      type: "commandExecution",
      id: "curl-post",
      command: "curl -X POST https://example.com/api",
      status: "completed",
      exitCode: 0,
    } as unknown as ThreadItem,
  ], { conversationDetailLevel: "STEPS_PROSE" });
  const mutatingUnit = mutating.units[0];
  if (mutatingUnit?.kind !== "toolActivity") {
    throw new Error("mutating curl should still render as activity");
  }
  assertEqual(mutatingUnit.summary.label, "Ran 1 command", "mutating curl should remain a normal command summary");
  assertEqual(mutatingUnit.summary.counts.webSearchCommands, 0, "mutating curl should not count as a web search command");

  const local = projectConversation([
    {
      type: "commandExecution",
      id: "curl-local",
      command: "curl http://127.0.0.1:3000/health",
      status: "completed",
      exitCode: 0,
    } as unknown as ThreadItem,
  ], { conversationDetailLevel: "STEPS_PROSE" });
  const localUnit = local.units[0];
  if (localUnit?.kind !== "toolActivity") {
    throw new Error("local curl should still render as activity");
  }
  assertEqual(localUnit.summary.label, "Ran 1 command", "localhost curl should remain a normal command summary");
  assertEqual(localUnit.summary.counts.webSearchCommands, 0, "localhost curl should not count as a web search command");
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

  assertEqual(projection.units.length, 2, "dynamic tool calls should not be folded into Desktop activity summaries");
  assertEqual(unit?.kind, "toolActivity", "tool-like items should render as tool activity");
  if (unit?.kind === "toolActivity") {
    assertEqual(unit.key, "collapsed-tool-activity:command-1", "tool activity key should anchor to the bucket's first item id (stable across streaming)");
    assertEqual(unit.summary.groupType, "collapsed-tool-activity", "ordinary tools should keep collapsed tool activity group type");
    assertEqual(
      unit.summary.label,
      "Created 1 file, edited 1 file, ran 1 command, called 1 tool",
      "activity summary should preserve Desktop's combined completed activity segments",
    );
    assertEqual(unit.summary.inProgress, false, "dynamic tool call progress should not mark the preceding activity group in progress");
    assertEqual(unit.summary.counts.commands, 1, "command count");
    assertEqual(unit.summary.counts.fileChanges, 1, "file change count");
    assertEqual(unit.summary.counts.mcpCalls, 1, "mcp tool call count");
    assertEqual(unit.summary.counts.dynamicCalls, 0, "dynamic tool calls should not contribute to activity summaries");
    assertIncludes(unit.summary.details, "Ran npm run test", "command title should be preserved");
    assertIncludes(unit.summary.details, "Created 1 file, edited 1 file", "file change summary should include patch kinds");
    assertIncludes(unit.summary.details, "Called github:list_prs", "mcp tool title should be preserved");
    assertEqual(unit.items.length, 3, "only Desktop activity items should stay attached to the activity group");
  }
  const dynamic = threadItemByKey(projection, "item:dynamic-tool-call:dynamic-1");
  assertEqual(dynamic.item.id, "dynamic-1", "generic dynamic tools should render as standalone Desktop rows");
  assertEqual(dynamic.item.tool, "exec_command", "dynamic tool row should preserve the tool name");
  assertEqual(dynamic.item.status, "running", "dynamic tool row should preserve the running status");

  assertEqual(projection.artifacts.length, 2, "file changes should project artifact entries");
  assertEqual(projection.artifacts[0]?.title, "render-groups.ts", "first artifact title");
  assertEqual(projection.artifacts[0]?.status, "completed", "first artifact status");
  assertEqual(projection.artifacts[1]?.title, "render-groups.test.ts", "second artifact title");
  assertEqual(projection.artifacts[1]?.status, "completed", "second artifact status");
  assertEqual(projection.sources.length, 1, "non-node MCP calls should project source entries");
  assertEqual(projection.sources[0]?.id, "mcp-server:github", "mcp source id");
  assertEqual(projection.sources[0]?.title, "GitHub", "mcp source title");
  assertEqual(projection.sources[0]?.status ?? null, null, "mcp source status should stay empty like Desktop");
}

function groupsCompletedAutoReviewWithAdjacentActivityLikeCodexDesktop(): void {
  const projection = projectConversation([
    {
      type: "commandExecution",
      id: "command-1",
      command: "npm run build",
      status: "completed",
      exitCode: 0,
    } as ThreadItem,
    {
      type: "automatic-approval-review",
      id: "auto-review-approved",
      status: "approved",
      riskLevel: "low",
      rationale: "Safe command",
    } as unknown as ThreadItem,
    {
      type: "automatic-approval-review",
      id: "auto-review-running",
      status: "inProgress",
      riskLevel: null,
      rationale: null,
    } as unknown as ThreadItem,
  ]);

  assertEqual(projection.units.length, 2, "only approved or denied auto-review rows should fold into adjacent activity");
  const activity = projection.units[0];
  assertEqual(activity?.kind, "toolActivity", "approved auto-review should join the command activity group");
  if (activity?.kind === "toolActivity") {
    assertEqual(activity.summary.label, "Approved 1 request, ran 1 command", "auto-review count should use Desktop activity summary wording");
    assertIncludes(activity.summary.details, "Approved request", "approved auto-review detail should stay visible");
    assertDeepEqual(
      activity.items.map((item) => item.id),
      ["command-1", "auto-review-approved"],
      "approved auto-review should stay attached to the adjacent activity group",
    );
  }
  const pending = threadItemByKey(projection, "item:automatic-approval-review:auto-review-running");
  assertEqual(pending.item.id, "auto-review-running", "in-progress auto-review should remain a standalone row");
  assertEqual(pending.item.status, "inProgress", "standalone auto-review should preserve status text");
}

function dropsHookThreadItemsLikeCodexDesktop(): void {
  const solo = projectConversation([
    {
      type: "hook",
      id: "hook-solo",
      key: "post-response",
      run: { status: "completed" },
    } as unknown as ThreadItem,
  ]);
  assertEqual(solo.units.length, 0, "synthetic hook ThreadItems should not render as transcript rows");

  const projection = projectConversation([
    {
      type: "commandExecution",
      id: "command-1",
      command: "npm run test",
      status: "completed",
      exitCode: 0,
    } as ThreadItem,
    {
      type: "hook",
      id: "hook-1",
      key: "post-command",
      run: { status: "completed", command: "echo ok" },
    } as unknown as ThreadItem,
  ]);

  assertEqual(projection.units.length, 1, "hook rows adjacent to tool activity should be ignored rather than grouped");
  const unit = projection.units[0];
  assertEqual(unit?.kind, "threadItem", "the completed command should keep Desktop's standalone command row");
  if (unit?.kind === "threadItem") {
    assertEqual(unit.item.id, "command-1", "hook rows should not displace the command item");
  }
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

function showsActivePatchDiffStatsLikeCodexDesktop(): void {
  const projection = projectConversation([
    {
      type: "fileChange",
      id: "patch-active",
      status: "running",
      success: null,
      changes: [
        { path: "src/app.ts", kind: { type: "update", move_path: null }, diff: "@@ -1 +1 @@\n-old\n+new" },
      ],
    } as unknown as ThreadItem,
  ], { isThreadRunning: true });

  const unit = projection.units[0];
  assertEqual(unit?.kind, "toolActivity", "active patch should render as current tool activity");
  if (unit?.kind === "toolActivity") {
    assertEqual(unit.summary.label, "Editing src/app.ts", "active patch label should follow Desktop active patch wording");
    assertDeepEqual(
      unit.summary.activeDiffStats,
      { linesAdded: 1, linesRemoved: 1 },
      "active patch summary should expose Desktop-style inline diff stats",
    );
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
  assertEqual(projection.sources[0]?.id, "webSearch", "web source id");
  assertEqual(projection.sources[0]?.title, "Web search", "web source title");
  assertEqual(projection.sources[0]?.meta ?? null, null, "web source meta should stay empty like Desktop");
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

  // Codex Desktop's `W` segment-level aggregation
  // (`split-items-into-render-groups-C1Yh6v3t.js`) merges adjacent web-search +
  // exec + exploration / patch / hook / mcp-tool-call items into a single
  // `collapsed-tool-activity` bucket so the agent body shows one cross-type
  // count summary instead of a row per item. Two adjacent webSearch + an exec
  // therefore collapse into one toolActivity unit, not two.
  assertEqual(projection.units.length, 1, "adjacent web searches + command should collapse into one activity");
  const search = projection.units[0];
  assertEqual(search?.kind, "toolActivity", "adjacent web searches + command should render as one activity");
  if (search?.kind === "toolActivity") {
    assertEqual(search.summary.groupType, "collapsed-tool-activity", "cross-type bucket uses collapsed-tool-activity");
    assertEqual(search.summary.counts.webSearches, 2, "web search count is preserved in cross-type bucket");
    assertEqual(search.summary.counts.commands, 1, "command count is preserved in cross-type bucket");
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

function cleansWebSearchSiteFiltersLikeCodexDesktop(): void {
  const projection = projectConversation([
    {
      type: "webSearch",
      id: "web-search-site",
      query: "fallback",
      action: { type: "search", query: "Codex OR HiCodex site:openai.com site:www.github.com" },
      completed: false,
    } as unknown as ThreadItem,
  ]);
  const unit = projection.units[0];
  if (unit?.kind !== "toolActivity") {
    throw new Error("site-filtered web search should render as tool activity");
  }
  assertEqual(
    unit.summary.label,
    "Searching the web for Codex HiCodex | openai.com · github.com",
    "web search label should strip site filters into Desktop-style domain suffix",
  );
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

function keepsInProgressMultiAgentActionsSeparateLikeCodexDesktop(): void {
  // Codex Desktop's `K` rollup does not group in-progress multi-agent rows;
  // it only groups terminal completed/failed rows.
  const projection = projectConversation([
    {
      type: "collabAgentToolCall",
      id: "spawn-a",
      tool: "spawnAgent",
      status: "inProgress",
      senderThreadId: "parent",
      receiverThreadIds: [],
      prompt: "first",
      model: null,
      reasoningEffort: null,
      agentsStates: {},
    } as ThreadItem,
    {
      type: "collabAgentToolCall",
      id: "spawn-b",
      tool: "spawnAgent",
      status: "inProgress",
      senderThreadId: "parent",
      receiverThreadIds: [],
      prompt: "second",
      model: null,
      reasoningEffort: null,
      agentsStates: {},
    } as ThreadItem,
    {
      type: "collabAgentToolCall",
      id: "spawn-c",
      tool: "spawnAgent",
      status: "inProgress",
      senderThreadId: "parent",
      receiverThreadIds: [],
      prompt: "third",
      model: null,
      reasoningEffort: null,
      agentsStates: {},
    } as ThreadItem,
  ]);

  assertEqual(projection.units.length, 3, "in-progress multi-agent rows should remain item-scoped");
  const keys = projection.units.map((unit) => unit.key);
  assertDeepEqual(
    keys,
    [
      "multi-agent-group:spawnAgent:inProgress:spawn-a",
      "multi-agent-group:spawnAgent:inProgress:spawn-b",
      "multi-agent-group:spawnAgent:inProgress:spawn-c",
    ],
    "in-progress multi-agent keys should include the item id",
  );
  for (const unit of projection.units) {
    if (unit.kind !== "toolActivity" || unit.summary.groupType !== "multi-agent-group") {
      throw new Error("in-progress multi-agent rows must surface as individual multi-agent toolActivity units");
    }
    assertEqual(unit.summary.label, "Spawning 1 agent", "each in-progress row should keep its own header");
    assertEqual(unit.items.length, 1, "each in-progress unit should retain one source item");
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

function hidesWaitMultiAgentActionsLikeCodexDesktop(): void {
  const projection = projectConversation([
    {
      type: "collabAgentToolCall",
      id: "wait-1",
      tool: "wait",
      status: "completed",
      senderThreadId: "parent",
      receiverThreadIds: ["agent-1234567890abcdef"],
      prompt: null,
      model: null,
      reasoningEffort: null,
      agentsStates: {
        "agent-1234567890abcdef": { status: "completed", message: null },
      },
    } as ThreadItem,
  ]);

  assertEqual(projection.units.length, 0, "wait collab tool calls should not render in the conversation");
}

function returnsEmptyProjectionForEmptyItems(): void {
  const projection = projectConversation([]);

  assertEqual(projection.units.length, 0, "empty items should produce no render units");
  assertEqual(projection.progress.length, 0, "empty items should produce no progress entries");
  assertEqual(projection.artifacts.length, 0, "empty items should produce no artifacts");
  assertEqual(projection.backgroundAgents.length, 0, "empty items should produce no background agents");
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

function threadItemByKey(
  projection: ReturnType<typeof projectConversation>,
  key: string,
): Extract<ReturnType<typeof projectConversation>["units"][number], { kind: "threadItem" }> {
  const unit = projection.units.find((candidate) => candidate.kind === "threadItem" && candidate.key === key);
  if (unit?.kind !== "threadItem") {
    throw new Error(`expected ${key} to be a threadItem unit`);
  }
  return unit;
}

function assertTextIncludes(actual: string, expected: string, message: string): void {
  if (!actual.includes(expected)) {
    throw new Error(`${message}: expected ${JSON.stringify(actual)} to include ${JSON.stringify(expected)}`);
  }
}
