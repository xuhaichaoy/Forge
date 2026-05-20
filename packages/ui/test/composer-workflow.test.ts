import type { UserInput } from "@hicodex/codex-protocol";
import {
  DEFAULT_ATTACH_ACTIONS,
  CLOSED_ATTACHMENT_PICKER_STATE,
  DEFAULT_SLASH_COMMANDS,
  applySlashCommand,
  attachActionsForComposerMode,
  attachmentLabel,
  buildUserInputFromComposer,
  compactAttachmentLabel,
  composerAttachmentKindLabel,
  composerAttachmentPreviewSrc,
  composerAttachmentsFromPaths,
  composerFilePath,
  composerEnterAction,
  composerPlaceholderText,
  composerSubmitTooltip,
  confirmAttachmentInput,
  findActiveMentionTrigger,
  filterSlashCommands,
  mergeComposerAttachments,
  moveAttachmentPickerSelection,
  openAttachmentPicker,
  projectComposerSubmitState,
  removeMentionTriggerText,
  removeComposerAttachment,
  selectAttachmentInputMode,
  slashCommandsForComposerMode,
  splitComposerTransferFiles,
  updateAttachmentInputDraft,
} from "../src/state/composer-workflow";

function assert(condition: boolean, message: string): void {
  if (!condition) {
    throw new Error(message);
  }
}

function assertDeepEqual(actual: unknown, expected: unknown, message: string): void {
  const actualJson = JSON.stringify(actual);
  const expectedJson = JSON.stringify(expected);
  if (actualJson !== expectedJson) {
    throw new Error(`${message}: expected ${expectedJson}, got ${actualJson}`);
  }
}

function assertHasIds(items: Array<{ id: string }>, ids: string[], message: string): void {
  const actualIds = new Set(items.map((item) => item.id));
  for (const id of ids) {
    assert(actualIds.has(id), `${message}: missing ${id}`);
  }
}

export default function runComposerWorkflowTests(): void {
  detectsEnterComposerActions();
  projectsCodexDesktopComposerPlaceholders();
  projectsCodexDesktopComposerSubmitState();
  projectsCodexDesktopSubmitTooltips();
  exposesCodexCliSlashCommands();
  filtersSlashCommandsByIdTitleAndAliases();
  updatesPlanCommandTextForComposerMode();
  appliesSlashCommandsAsDeclarativeActions();
  exposesAttachActions();
  projectsAttachmentKindLabelsWithoutProtocolDrift();
  detectsActiveMentionTriggers();
  drivesAttachmentPickerWithoutWindowPrompt();
  projectsDroppedAndPastedFilesIntoAttachments();
  buildsUserInputFromComposerTextAndAttachments();
}

function projectsCodexDesktopComposerPlaceholders(): void {
  assertDeepEqual(
    [
      composerPlaceholderText({ hasConversation: false }),
      composerPlaceholderText({ hasConversation: true }),
      composerPlaceholderText({ hasConversation: true, hasBackgroundAgentsPanel: true }),
    ],
    [
      "Ask Codex anything. @ to use plugins or mention files",
      "Ask for follow-up changes",
      "Ask for follow-up changes or @ to tag an agent",
    ],
    "composer placeholders should follow Desktop new-task and local follow-up wording",
  );
}

function projectsCodexDesktopSubmitTooltips(): void {
  assertDeepEqual(
    [
      composerSubmitTooltip(projectComposerSubmitState({
        input: "inspect this",
        attachmentCount: 0,
        connecting: false,
        threadRunning: false,
        activeTurnId: null,
        pendingRequestCount: 0,
      })),
      composerSubmitTooltip(projectComposerSubmitState({
        input: "",
        attachmentCount: 0,
        connecting: false,
        threadRunning: true,
        activeTurnId: "turn-1",
        pendingRequestCount: 0,
      })),
      composerSubmitTooltip(projectComposerSubmitState({
        input: "follow up",
        attachmentCount: 0,
        connecting: false,
        threadRunning: true,
        activeTurnId: "turn-1",
        pendingRequestCount: 0,
      })),
      composerSubmitTooltip(projectComposerSubmitState({
        input: "follow up",
        attachmentCount: 0,
        connecting: false,
        threadRunning: true,
        activeTurnId: "turn-1",
        pendingRequestCount: 0,
        queueingEnabled: false,
      })),
      composerSubmitTooltip(projectComposerSubmitState({
        input: "blocked",
        attachmentCount: 0,
        connecting: false,
        threadRunning: true,
        activeTurnId: "turn-1",
        pendingRequestCount: 1,
      })),
    ],
    [
      "Send message (Enter)",
      "Stop response (Esc)",
      "Queue (Enter)\nSteer (Cmd+Enter)",
      "Steer (Enter)\nQueue (Cmd+Enter)",
      "Resolve the pending request before sending more input",
    ],
    "submit tooltip should distinguish send, stop, queue, and blocked states",
  );
}

function projectsAttachmentKindLabelsWithoutProtocolDrift(): void {
  const attachments = [
    { type: "mention" as const, name: "composer.tsx", path: "packages/ui/src/components/composer.tsx" },
    { type: "localImage" as const, path: "/tmp/screenshot.png" },
    { type: "image" as const, url: "https://example.com/diagram.png" },
    { type: "skill" as const, name: "review", path: "/skills/review.md" },
    { type: "plainText" as const, text: "inline context" },
    { type: "filePath" as const, path: "/workspace/package.json" },
  ];

  assertDeepEqual(
    attachments.map(composerAttachmentKindLabel),
    ["Mention", "Image", "Image URL", "Skill", "Text", "File"],
    "attachment chips should expose each existing ComposerAttachment kind",
  );

  assertDeepEqual(
    buildUserInputFromComposer("inspect", attachments).map((item) => item.type),
    ["text", "localImage", "image"],
    "attachment kind labels should not invent durable UserInput types",
  );
}

function projectsCodexDesktopComposerSubmitState(): void {
  assertDeepEqual(
    projectComposerSubmitState({
      input: "inspect this",
      attachmentCount: 0,
      connecting: false,
      threadRunning: false,
      activeTurnId: null,
      pendingRequestCount: 0,
    }),
    {
      submitButtonMode: "send",
      threadRuntimeStatus: "idle",
      hasContent: true,
      disabled: false,
      canStopFromEscape: false,
      isQueueingEnabled: false,
      requestCount: 0,
    },
    "idle composer with text should send",
  );

  assertDeepEqual(
    projectComposerSubmitState({
      input: "",
      attachmentCount: 1,
      connecting: false,
      threadRunning: false,
      activeTurnId: null,
      pendingRequestCount: 0,
    }),
    {
      submitButtonMode: "send",
      threadRuntimeStatus: "idle",
      hasContent: true,
      disabled: false,
      canStopFromEscape: false,
      isQueueingEnabled: false,
      requestCount: 0,
    },
    "idle composer with attachment should send",
  );

  assertDeepEqual(
    projectComposerSubmitState({
      input: "   ",
      attachmentCount: 0,
      connecting: false,
      threadRunning: false,
      activeTurnId: null,
      pendingRequestCount: 0,
    }),
    {
      submitButtonMode: "send",
      threadRuntimeStatus: "idle",
      hasContent: false,
      disabled: true,
      disabledReason: "Enter a prompt or add context",
      submitBlockReason: "empty",
      canStopFromEscape: false,
      isQueueingEnabled: false,
      requestCount: 0,
    },
    "idle empty composer should be disabled",
  );

  assertDeepEqual(
    projectComposerSubmitState({
      input: "",
      attachmentCount: 0,
      connecting: false,
      threadRunning: true,
      activeTurnId: "turn-1",
      pendingRequestCount: 0,
    }),
    {
      submitButtonMode: "stop",
      threadRuntimeStatus: "running",
      hasContent: false,
      disabled: false,
      canStopFromEscape: true,
      isQueueingEnabled: false,
      requestCount: 0,
    },
    "running thread without draft should stop",
  );

  assertDeepEqual(
    projectComposerSubmitState({
      input: "one more thing",
      attachmentCount: 0,
      connecting: false,
      threadRunning: true,
      activeTurnId: "turn-1",
      pendingRequestCount: 0,
    }),
    {
      submitButtonMode: "queue",
      threadRuntimeStatus: "running",
      hasContent: true,
      disabled: false,
      canStopFromEscape: false,
      isQueueingEnabled: true,
      requestCount: 0,
    },
    "running thread with draft should queue a follow-up through the active turn",
  );

  assertDeepEqual(
    projectComposerSubmitState({
      input: "one more thing",
      attachmentCount: 0,
      connecting: false,
      threadRunning: true,
      activeTurnId: null,
      pendingRequestCount: 0,
    }),
    {
      submitButtonMode: "queue",
      threadRuntimeStatus: "running",
      hasContent: true,
      disabled: true,
      disabledReason: "Waiting for active turn before queueing a follow-up",
      submitBlockReason: "missingActiveTurn",
      canStopFromEscape: false,
      isQueueingEnabled: false,
      requestCount: 0,
    },
    "running thread without active turn should not submit a follow-up",
  );

  assertDeepEqual(
    projectComposerSubmitState({
      input: "send after approval",
      attachmentCount: 0,
      connecting: false,
      threadRunning: true,
      activeTurnId: "turn-1",
      pendingRequestCount: 2,
    }),
    {
      submitButtonMode: "queue",
      threadRuntimeStatus: "waitingForRequest",
      hasContent: true,
      disabled: true,
      disabledReason: "Resolve 2 pending requests before sending more input",
      submitBlockReason: "pendingRequest",
      canStopFromEscape: false,
      isQueueingEnabled: false,
      requestCount: 2,
    },
    "pending server requests should block follow-up submit without creating a queue RPC",
  );

  assertDeepEqual(
    projectComposerSubmitState({
      input: "hello",
      attachmentCount: 0,
      connecting: true,
      threadRunning: false,
      activeTurnId: null,
      pendingRequestCount: 0,
    }),
    {
      submitButtonMode: "send",
      threadRuntimeStatus: "connecting",
      hasContent: true,
      disabled: true,
      disabledReason: "Connecting to Codex app-server",
      submitBlockReason: "connecting",
      canStopFromEscape: false,
      isQueueingEnabled: false,
      requestCount: 0,
    },
    "connecting composer should be disabled before runtime actions",
  );
}

function detectsEnterComposerActions(): void {
  assertDeepEqual(
    composerEnterAction("send this", { key: "Enter" }),
    { action: "send", preventDefault: true },
    "plain Enter should send composer input",
  );
  assertDeepEqual(
    composerEnterAction("line one", { key: "Enter", shiftKey: true }),
    { action: "newline", preventDefault: false },
    "Shift+Enter should keep multiline editing behavior",
  );
  assertDeepEqual(
    composerEnterAction("line one", { key: "Enter", altKey: true }),
    { action: "newline", preventDefault: false },
    "Alt+Enter should keep multiline editing behavior",
  );
  assertDeepEqual(
    composerEnterAction("send shortcut", { key: "Enter", metaKey: true }),
    { action: "send", preventDefault: true },
    "Meta+Enter should send composer input",
  );
  assertDeepEqual(
    composerEnterAction("send shortcut", { key: "Enter", ctrlKey: true }),
    { action: "send", preventDefault: true },
    "Ctrl+Enter should send composer input",
  );
  assertDeepEqual(
    composerEnterAction("ime composing", { key: "Enter", isComposing: true }),
    { action: "none", preventDefault: false },
    "IME composing Enter should not send",
  );
  assertDeepEqual(
    composerEnterAction("ime composing", { key: "Enter", nativeEvent: { isComposing: true } }),
    { action: "none", preventDefault: false },
    "IME composing from nativeEvent should not send",
  );
  assertDeepEqual(
    composerEnterAction("   ", { key: "Enter" }),
    { action: "none", preventDefault: false },
    "blank input should not send",
  );
  assertDeepEqual(
    composerEnterAction("send this", { key: "a" }),
    { action: "none", preventDefault: false },
    "non-Enter keys should not send",
  );
}

function exposesCodexCliSlashCommands(): void {
  assertHasIds(
    DEFAULT_SLASH_COMMANDS,
    [
      "model",
      "fast",
      "ide",
      "permissions",
      "keymap",
      "vim",
      "setup-default-sandbox",
      "sandbox-add-read-dir",
      "experimental",
      "approve",
      "memories",
      "skills",
      "hooks",
      "review",
      "rename",
      "new",
      "resume",
      "fork",
      "init",
      "compact",
      "plan",
      "goal",
      "collab",
      "agent",
      "subagents",
      "side",
      "copy",
      "raw",
      "diff",
      "mention",
      "status",
      "debug-config",
      "rpc",
      "title",
      "statusline",
      "theme",
      "mcp",
      "apps",
      "plugins",
      "worktrees",
      "logout",
      "quit",
      "exit",
      "feedback",
      "rollout",
      "ps",
      "stop",
      "clean",
      "clear",
      "personality",
      "realtime",
      "settings",
      "test-approval",
      "debug-m-drop",
      "debug-m-update",
    ],
    "DEFAULT_SLASH_COMMANDS should include the local Codex CLI slash command set",
  );
  assertHasIds(
    DEFAULT_SLASH_COMMANDS,
    [
      "model",
      "mcp",
      "init",
      "compact",
      "review",
      "diff",
      "status",
      "approvals",
      "new",
      "clear",
      "resume",
      "help",
    ],
    "DEFAULT_SLASH_COMMANDS should include common Codex CLI commands",
  );

  const visibleCommands = slashCommandsForComposerMode("default").filter((command) => !command.hidden);
  assertHasIds(
    visibleCommands,
    [
      "model",
      "permissions",
      "experimental",
      "review",
      "resume",
      "goal",
      "collab",
      "side",
      "memories",
      "mention",
      "debug-config",
      "rpc",
      "personality",
      "worktrees",
      "ps",
      "stop",
    ],
    "visible slash commands should keep wired commands available",
  );
  for (const command of visibleCommands) {
    assert(command.supported !== "pending", `visible slash command /${command.id} should not be pending`);
  }
  const visibleIds = new Set(visibleCommands.map((command) => command.id));
  for (const id of ["fast", "ide", "agent"]) {
    assert(!visibleIds.has(id), `unwired slash command /${id} should stay hidden by default`);
  }
}

function filtersSlashCommandsByIdTitleAndAliases(): void {
  const commands = [
    { id: "model", title: "Model settings", aliases: ["provider", "engine"] },
    { id: "compact", title: "Compact context", aliases: ["ctx", "summarize"] },
    { id: "review", title: "Code review", aliases: ["inspect"] },
  ];

  assertDeepEqual(
    filterSlashCommands("/", commands).map((command) => command.id),
    commands.map((command) => command.id),
    "bare slash query should return all commands",
  );
  assertDeepEqual(
    filterSlashCommands("mod", commands).map((command) => command.id),
    ["model"],
    "slash filtering should match command ids",
  );
  assertDeepEqual(
    filterSlashCommands("code", commands).map((command) => command.id),
    ["review"],
    "slash filtering should match command titles",
  );
  assertDeepEqual(
    filterSlashCommands("provider", commands).map((command) => command.id),
    ["model"],
    "slash filtering should match aliases",
  );
  assertDeepEqual(
    filterSlashCommands("/ctx", commands).map((command) => command.id),
    ["compact"],
    "slash filtering should ignore the leading slash and match aliases",
  );
  assertDeepEqual(
    filterSlashCommands("does-not-exist", commands),
    [],
    "slash filtering should return an empty list when nothing matches",
  );
}

function updatesPlanCommandTextForComposerMode(): void {
  const defaultPlan = slashCommandsForComposerMode("default").find((command) => command.id === "plan");
  const activePlan = slashCommandsForComposerMode("plan").find((command) => command.id === "plan");
  const defaultAttachPlan = attachActionsForComposerMode("default").find((action) => action.id === "plan");
  const activeAttachPlan = attachActionsForComposerMode("plan").find((action) => action.id === "plan");

  assert(defaultPlan?.description.includes("Turn on") === true, "default slash plan command should enable plan mode");
  assert(activePlan?.description.includes("Turn off") === true, "active slash plan command should disable plan mode");
  assert(
    defaultAttachPlan?.description.includes("Create a plan") === true,
    "default attach plan action should describe creating a plan",
  );
  assert(
    activeAttachPlan?.description.includes("Turn off") === true,
    "active attach plan action should disable plan mode",
  );
}

function appliesSlashCommandsAsDeclarativeActions(): void {
  assertDeepEqual(
    applySlashCommand("model", { input: "/model" }),
    { action: "openSettings", panel: "models", clearInput: true },
    "model should open model settings",
  );
  assertDeepEqual(
    applySlashCommand("mcp", { input: "/mcp" }),
    { action: "openSettings", panel: "mcp", clearInput: true },
    "mcp should open MCP settings",
  );
  assertDeepEqual(
    applySlashCommand("skills", { input: "/skills reload" }),
    { action: "request", request: "listSkills", clearInput: true, payload: { detail: "reload" } },
    "skills should pass reload through to the skills list request",
  );
  assertDeepEqual(
    applySlashCommand("approvals", { input: "/approvals" }),
    { action: "openSettings", panel: "approvals", clearInput: true },
    "approvals should open approval settings",
  );
  assertDeepEqual(
    applySlashCommand("worktrees", { input: "/worktrees" }),
    { action: "openSettings", panel: "worktrees", clearInput: true },
    "worktrees should open worktree settings",
  );
  assertDeepEqual(
    applySlashCommand("new", { input: "/new" }),
    { action: "createThread", clearInput: true },
    "new should create a fresh thread",
  );
  assertDeepEqual(
    applySlashCommand("clear", { input: "/clear" }),
    { action: "clearInput" },
    "clear should clear composer input",
  );
  assertDeepEqual(
    applySlashCommand("resume", { input: "/resume" }),
    { action: "request", request: "resumeThread", clearInput: true },
    "resume should request thread resume UI",
  );
  assertDeepEqual(
    applySlashCommand("init", { input: "/init" }),
    { action: "insertText", text: "Initialize this workspace for Codex." },
    "init should insert an actionable prompt",
  );
  assertDeepEqual(
    applySlashCommand("compact", { input: "/compact" }),
    { action: "request", request: "compactThread", clearInput: true },
    "compact should request app-server compaction",
  );
  assertDeepEqual(
    applySlashCommand("plan", { input: "/plan inspect first" }),
    { action: "setComposerMode", mode: "plan", text: "inspect first" },
    "plan should enable Desktop-style plan mode instead of rewriting the prompt",
  );
  assertDeepEqual(
    applySlashCommand("plan", { input: "/plan", mode: "plan" }),
    { action: "setComposerMode", mode: "default" },
    "plan should toggle off when planning mode is already active",
  );
  assertDeepEqual(
    applySlashCommand("review", { input: "/review" }),
    { action: "request", request: "startReview", clearInput: true },
    "review should request a review flow",
  );
  assertDeepEqual(
    applySlashCommand("diff", { input: "/diff" }),
    { action: "request", request: "showDiff", clearInput: true },
    "diff should request the current git diff",
  );
  assertDeepEqual(
    applySlashCommand("status", { input: "/status" }),
    { action: "request", request: "showStatus", clearInput: true },
    "status should request current workspace status",
  );
  assertDeepEqual(
    applySlashCommand("ps", { input: "/ps" }),
    { action: "request", request: "showProcesses", clearInput: true },
    "ps should list background terminals instead of cleaning them",
  );
  assertDeepEqual(
    applySlashCommand("help", { input: "/help" }),
    { action: "showCommands", clearInput: true },
    "help should open the command list",
  );
}

function exposesAttachActions(): void {
  assertDeepEqual(
    DEFAULT_ATTACH_ACTIONS.map((action) => action.title),
    ["Add photos & files", "Plan mode", "Plugins"],
    "DEFAULT_ATTACH_ACTIONS should match the Codex Desktop plus menu",
  );
}

function detectsActiveMentionTriggers(): void {
  assertDeepEqual(
    findActiveMentionTrigger("@"),
    { marker: "@", query: "", from: 0, to: 1 },
    "bare @ should open the inline mention picker",
  );
  assertDeepEqual(
    findActiveMentionTrigger("inspect @packages/ui"),
    { marker: "@", query: "packages/ui", from: 8, to: 20 },
    "@ file query should be detected at the end of the draft",
  );
  assertDeepEqual(
    findActiveMentionTrigger("line one\n@composer"),
    { marker: "@", query: "composer", from: 9, to: 18 },
    "mention trigger should work on the active line",
  );
  assertDeepEqual(
    findActiveMentionTrigger("$"),
    { marker: "$", query: "", from: 0, to: 1 },
    "bare $ should open the inline skill/app picker",
  );
  assertDeepEqual(
    findActiveMentionTrigger("使用 $标书"),
    { marker: "$", query: "标书", from: 3, to: 6 },
    "$ skill query should be detected at the end of the draft",
  );
  assertDeepEqual(
    findActiveMentionTrigger("cost$10"),
    null,
    "$ should not open skill autocomplete in the middle of a word",
  );
  assertDeepEqual(
    findActiveMentionTrigger("email a@b"),
    null,
    "email-like text should not open mention autocomplete",
  );
  assertDeepEqual(
    findActiveMentionTrigger("inspect @composer then continue"),
    { marker: "@", query: "composer then continue", from: 8, to: 31 },
    "Desktop-style @ mentions should keep spaces inside the active query",
  );
  assertDeepEqual(
    removeMentionTriggerText("inspect @composer", { marker: "@", query: "composer", from: 8, to: 17 }),
    "inspect",
    "selecting a mention should remove the typed @ query from the prompt",
  );
}

function drivesAttachmentPickerWithoutWindowPrompt(): void {
  const opened = openAttachmentPicker();
  assertDeepEqual(
    opened,
    {
      status: "menu",
      activeIndex: 0,
      inputMode: null,
      draft: "",
      error: null,
    },
    "attachment picker should open in menu mode",
  );

  const moved = moveAttachmentPickerSelection(opened, 1);
  assertDeepEqual(
    moved.activeIndex,
    1,
    "attachment picker should move selection by keyboard direction",
  );

  const filePathInput = selectAttachmentInputMode(moved, "filePath");
  assertDeepEqual(
    filePathInput,
    {
      status: "input",
      activeIndex: 0,
      inputMode: "filePath",
      draft: "",
      error: null,
    },
    "file path input mode should remain available as the picker fallback",
  );

  assertDeepEqual(
    confirmAttachmentInput(filePathInput),
    {
      state: {
        ...filePathInput,
        error: "Enter a value before adding context",
      },
      attachment: null,
    },
    "empty attachment input should stay open with a validation error",
  );

  const filledFilePath = updateAttachmentInputDraft(filePathInput, "packages/ui/src/components/composer.tsx");
  assertDeepEqual(
    confirmAttachmentInput(filledFilePath),
    {
      state: CLOSED_ATTACHMENT_PICKER_STATE,
      attachment: {
        type: "filePath",
        path: "packages/ui/src/components/composer.tsx",
      },
    },
    "file path input should create a file attachment chip",
  );

  assertDeepEqual(
    confirmAttachmentInput(updateAttachmentInputDraft(selectAttachmentInputMode(opened, "plan"), "ignored")).attachment,
    null,
    "plan menu action should not create a manual attachment",
  );

  assertDeepEqual(
    removeComposerAttachment(
      [
        { type: "filePath", path: "a.ts" },
        { type: "localImage", path: "b.png" },
      ],
      0,
    ),
    [{ type: "localImage", path: "b.png" }],
    "removeComposerAttachment should remove the requested chip",
  );
}

function projectsDroppedAndPastedFilesIntoAttachments(): void {
  const files = [
    { name: "screen.PNG", type: "image/png" },
    { name: "report.pdf", type: "application/pdf", path: "/tmp/report.pdf" },
    { name: "diagram.webp", type: "", path: "/tmp/diagram.webp" },
  ];
  const split = splitComposerTransferFiles(files);

  assertDeepEqual(
    split,
    {
      imageFiles: [files[0], files[2]],
      otherFiles: [files[1]],
    },
    "transfer files should be split into image and non-image groups like Desktop composer paste/drop handling",
  );
  assertDeepEqual(
    composerFilePath(files[1]),
    "/tmp/report.pdf",
    "non-standard file path should be read when the desktop host exposes it",
  );
  assertDeepEqual(
    composerFilePath({ name: "report.pdf", type: "application/pdf" }),
    null,
    "bare File.name should not be treated as a readable local file path",
  );
  assertDeepEqual(
    composerAttachmentsFromPaths(["/tmp/screenshot.png", "/tmp/report.pdf", " /tmp/screenshot.png "]),
    [
      { type: "localImage", path: "/tmp/screenshot.png" },
      { type: "filePath", path: "/tmp/report.pdf" },
    ],
    "dropped paths should become local image or file chips and dedupe repeated paths",
  );
  assertDeepEqual(
    composerAttachmentsFromPaths(["file:///tmp/screen%20shot.png", "file:///tmp/report%20final.pdf"]),
    [
      { type: "localImage", path: "/tmp/screen shot.png" },
      { type: "filePath", path: "/tmp/report final.pdf" },
    ],
    "file URLs should decode to local paths before becoming attachments",
  );
  assertDeepEqual(
    mergeComposerAttachments(
      [{ type: "mention", name: "report.pdf", path: "/tmp/report.pdf" }],
      [
        { type: "mention", name: "report.pdf", path: "/tmp/report.pdf" },
        { type: "image", url: "data:image/png;base64,AAA", name: "pasted.png" },
      ],
    ),
    [
      { type: "mention", name: "report.pdf", path: "/tmp/report.pdf" },
      { type: "image", url: "data:image/png;base64,AAA", name: "pasted.png" },
    ],
    "attachment merge should keep existing chips and append only new ones",
  );
  assertDeepEqual(
    composerAttachmentPreviewSrc({ type: "image", url: "data:image/png;base64,AAA", name: "pasted.png" }),
    "data:image/png;base64,AAA",
    "pasted images should preview from their data URL",
  );
  assertDeepEqual(
    composerAttachmentPreviewSrc({ type: "localImage", path: "/tmp/screen shot.png" }),
    "file:///tmp/screen%20shot.png",
    "local image attachments should preview from file URLs",
  );
  assertDeepEqual(
    composerAttachmentPreviewSrc({ type: "mention", name: "report.pdf", path: "/tmp/report.pdf" }),
    null,
    "non-image attachments should not render an image preview",
  );
  assertDeepEqual(
    attachmentLabel({ type: "image", url: "data:image/png;base64,AAA", name: "image.png" }),
    "image.png",
    "pasted image labels should not duplicate the image prefix",
  );
  assertDeepEqual(
    attachmentLabel({ type: "localImage", path: "/tmp/screen.png" }),
    "screen.png",
    "local image labels should use the filename only",
  );
  assertDeepEqual(
    attachmentLabel({ type: "filePath", path: "/tmp/report final.pdf" }),
    "report final.pdf",
    "document attachment labels should use the filename only",
  );
  assertDeepEqual(
    compactAttachmentLabel("very-long-image-name.png"),
    "very-lo...",
    "attachment labels should be capped to ten visible characters",
  );
}

function buildsUserInputFromComposerTextAndAttachments(): void {
  const input = buildUserInputFromComposer("  summarize this  ", [
    {
      type: "mention",
      name: "composer-workflow.ts",
      path: "packages/ui/src/state/composer-workflow.ts",
    },
    { type: "localImage", path: "/tmp/screenshot.png" },
    { type: "image", url: "https://example.test/diagram.png" },
    { type: "image", url: "data:image/png;base64,AAA", name: "pasted.png" },
    { type: "skill", name: "code-review", path: "/skills/code-review/SKILL.md" },
  ]);

  assertDeepEqual(
    input,
    [
      {
        type: "text",
        text: "summarize this\n[composer-workflow.ts](packages/ui/src/state/composer-workflow.ts)\n[$code-review](/skills/code-review/SKILL.md)",
        text_elements: [],
      },
      { type: "localImage", path: "/tmp/screenshot.png" },
      { type: "image", url: "https://example.test/diagram.png" },
      { type: "image", url: "data:image/png;base64,AAA" },
    ] satisfies UserInput[],
    "buildUserInputFromComposer should preserve text and serialize skill chips as Desktop prompt links",
  );

  assertDeepEqual(
    buildUserInputFromComposer("[$code-review](/skills/code-review/SKILL.md) summarize this", [
      { type: "skill", name: "code-review", path: "/skills/code-review/SKILL.md" },
    ]),
    [
      {
        type: "text",
        text: "[$code-review](/skills/code-review/SKILL.md) summarize this",
        text_elements: [],
      },
    ] satisfies UserInput[],
    "skill attachments should not emit a duplicate structured skill input",
  );

  assertDeepEqual(
    buildUserInputFromComposer("", [
      { type: "plainText", text: "Use this pasted context." },
      { type: "filePath", path: "packages/ui/src/HiCodexApp.tsx" },
    ]),
    [
      {
        type: "text",
        text: "Use this pasted context.\n[HiCodexApp.tsx](packages/ui/src/HiCodexApp.tsx)",
        text_elements: [],
      },
    ] satisfies UserInput[],
    "plain text attachments fold into text while file paths stay visible to the model as prompt links (projection extracts them into chips for display)",
  );

  assertDeepEqual(
    buildUserInputFromComposer("看一下文件内容", [
      { type: "filePath", path: "/tmp/report final.pdf" },
    ]),
    [
      {
        type: "text",
        text: "看一下文件内容\n[report final.pdf](</tmp/report final.pdf>)",
        text_elements: [],
      },
    ] satisfies UserInput[],
    "local file attachments keep the path in text links so the agent can read them (projection upgrades the link to a file chip for display); paths with spaces are angle-bracket escaped for markdown",
  );

  assertDeepEqual(
    buildUserInputFromComposer("use plugin", [
      { type: "mention", name: "search", path: "plugin://search" },
    ]),
    [
      {
        type: "text",
        text: "use plugin",
        text_elements: [],
      },
      {
        type: "mention",
        name: "search",
        path: "plugin://search",
      },
    ] satisfies UserInput[],
    "non-file mentions should remain structured without leaking protocol references into prompt text",
  );

  assertDeepEqual(
    buildUserInputFromComposer("", [
      { type: "localImage", path: "file:///tmp/screen%20shot.png", detail: "original" },
      { type: "image", url: "file:///tmp/diagram.png" },
      { type: "image", url: "data:image/png;base64,AAA", name: "pasted.png", detail: "high" },
    ]),
    [
      { type: "localImage", path: "/tmp/screen shot.png", detail: "original" },
      { type: "localImage", path: "/tmp/diagram.png" },
      { type: "image", url: "data:image/png;base64,AAA", detail: "high" },
    ] satisfies UserInput[],
    "image attachments should use Desktop-compatible localImage path or data URL user inputs",
  );
}
