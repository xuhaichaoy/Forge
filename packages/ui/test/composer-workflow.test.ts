import type { UserInput } from "@hicodex/codex-protocol";
import {
  DEFAULT_ATTACH_ACTIONS,
  CLOSED_ATTACHMENT_PICKER_STATE,
  DEFAULT_SLASH_COMMANDS,
  applySlashCommand,
  attachmentLabel,
  buildUserInputFromComposer,
  compactAttachmentLabel,
  composerAttachmentPreviewSrc,
  composerAttachmentsFromPaths,
  composerFilePath,
  composerEnterAction,
  composerSubmitTooltip,
  confirmAttachmentInput,
  filterSlashCommands,
  mergeComposerAttachments,
  moveAttachmentPickerSelection,
  openAttachmentPicker,
  projectComposerSubmitState,
  removeComposerAttachment,
  selectAttachmentInputMode,
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
  projectsCodexDesktopComposerSubmitState();
  projectsCodexDesktopSubmitTooltips();
  exposesCodexCliSlashCommands();
  filtersSlashCommandsByIdTitleAndAliases();
  appliesSlashCommandsAsDeclarativeActions();
  exposesAttachActions();
  drivesAttachmentPickerWithoutWindowPrompt();
  projectsDroppedAndPastedFilesIntoAttachments();
  buildsUserInputFromComposerTextAndAttachments();
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
      "Queue follow-up (Enter)",
      "Resolve the pending request before sending more input",
    ],
    "submit tooltip should distinguish send, stop, queue, and blocked states",
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
      "title",
      "statusline",
      "theme",
      "mcp",
      "apps",
      "plugins",
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
    applySlashCommand("approvals", { input: "/approvals" }),
    { action: "openSettings", panel: "approvals", clearInput: true },
    "approvals should open approval settings",
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
    applySlashCommand("help", { input: "/help" }),
    { action: "showCommands", clearInput: true },
    "help should open the command list",
  );
}

function exposesAttachActions(): void {
  assertHasIds(
    DEFAULT_ATTACH_ACTIONS,
    ["mention", "localImage", "imageUrl", "skill", "plainText", "filePath"],
    "DEFAULT_ATTACH_ACTIONS should include supported + menu actions",
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

  const mentionInput = selectAttachmentInputMode(moved, "mention");
  assertDeepEqual(
    mentionInput,
    {
      status: "input",
      activeIndex: 0,
      inputMode: "mention",
      draft: "",
      error: null,
    },
    "attachment picker should enter an explicit mention input mode",
  );

  assertDeepEqual(
    confirmAttachmentInput(mentionInput),
    {
      state: {
        ...mentionInput,
        error: "Enter a value before adding context",
      },
      attachment: null,
    },
    "empty attachment input should stay open with a validation error",
  );

  const filledMention = updateAttachmentInputDraft(mentionInput, "packages/ui/src/components/composer.tsx");
  assertDeepEqual(
    confirmAttachmentInput(filledMention),
    {
      state: CLOSED_ATTACHMENT_PICKER_STATE,
      attachment: {
        type: "mention",
        name: "composer.tsx",
        path: "packages/ui/src/components/composer.tsx",
      },
    },
    "mention input should create a structured mention attachment",
  );

  assertDeepEqual(
    confirmAttachmentInput(updateAttachmentInputDraft(selectAttachmentInputMode(opened, "localImage"), "/tmp/image.png")).attachment,
    { type: "localImage", path: "/tmp/image.png" },
    "local image input should create a localImage attachment",
  );

  assertDeepEqual(
    confirmAttachmentInput(updateAttachmentInputDraft(selectAttachmentInputMode(opened, "skill"), "/skills/review/SKILL.md")).attachment,
    { type: "skill", name: "SKILL", path: "/skills/review/SKILL.md" },
    "skill input should create a skill attachment with an inferred name",
  );

  assertDeepEqual(
    confirmAttachmentInput(updateAttachmentInputDraft(selectAttachmentInputMode(opened, "filePath"), "packages/ui/src/styles.css")).attachment,
    { type: "filePath", path: "packages/ui/src/styles.css" },
    "file path input should create a text-folded path attachment",
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
    composerAttachmentsFromPaths(["/tmp/screenshot.png", "/tmp/report.pdf", " /tmp/screenshot.png "]),
    [
      { type: "localImage", path: "/tmp/screenshot.png" },
      { type: "mention", name: "report.pdf", path: "/tmp/report.pdf" },
    ],
    "dropped paths should become local images or file mentions and dedupe repeated paths",
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
      { type: "text", text: "summarize this", text_elements: [] },
      {
        type: "mention",
        name: "composer-workflow.ts",
        path: "packages/ui/src/state/composer-workflow.ts",
      },
      { type: "localImage", path: "/tmp/screenshot.png" },
      { type: "image", url: "https://example.test/diagram.png" },
      { type: "image", url: "data:image/png;base64,AAA" },
      { type: "skill", name: "code-review", path: "/skills/code-review/SKILL.md" },
    ] satisfies UserInput[],
    "buildUserInputFromComposer should preserve text and structured attachments",
  );

  assertDeepEqual(
    buildUserInputFromComposer("", [
      { type: "plainText", text: "Use this pasted context." },
      { type: "filePath", path: "packages/ui/src/HiCodexApp.tsx" },
    ]),
    [
      {
        type: "text",
        text: "Use this pasted context.\npackages/ui/src/HiCodexApp.tsx",
        text_elements: [],
      },
    ] satisfies UserInput[],
    "plain text and file path attachments should be folded into text input",
  );
}
