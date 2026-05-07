import type { UserInput } from "@hicodex/codex-protocol";
import {
  DEFAULT_ATTACH_ACTIONS,
  DEFAULT_SLASH_COMMANDS,
  applySlashCommand,
  buildUserInputFromComposer,
  composerEnterAction,
  filterSlashCommands,
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
  exposesCodexCliSlashCommands();
  filtersSlashCommandsByIdTitleAndAliases();
  appliesSlashCommandsAsDeclarativeActions();
  exposesAttachActions();
  buildsUserInputFromComposerTextAndAttachments();
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
    { action: "log", level: "info", message: "Show available composer commands." },
    "help should return a loggable info action",
  );
}

function exposesAttachActions(): void {
  assertHasIds(
    DEFAULT_ATTACH_ACTIONS,
    ["mention", "localImage", "imageUrl", "skill", "plainText", "filePath"],
    "DEFAULT_ATTACH_ACTIONS should include supported + menu actions",
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
