import type { UserInput } from "@hicodex/codex-protocol";

export type ComposerEnterResult =
  | { action: "none"; preventDefault: false }
  | { action: "newline"; preventDefault: false }
  | { action: "send"; preventDefault: true };

export interface ComposerKeyEventLike {
  key?: string;
  shiftKey?: boolean;
  metaKey?: boolean;
  ctrlKey?: boolean;
  isComposing?: boolean;
  nativeEvent?: {
    isComposing?: boolean;
  };
}

export interface SlashCommand {
  id: string;
  title: string;
  description: string;
  category: SlashCommandCategory;
  aliases?: string[];
  inlineArgs?: string;
  hidden?: boolean;
  supported: "direct" | "prompt" | "panel" | "pending" | "desktop";
}

export type SlashCommandCategory =
  | "model"
  | "thread"
  | "workspace"
  | "tools"
  | "mcp"
  | "team"
  | "settings"
  | "debug";

export type SettingsPanelId =
  | "models"
  | "mcp"
  | "approvals"
  | "permissions"
  | "skills"
  | "hooks"
  | "plugins"
  | "apps"
  | "experimental"
  | "team"
  | "general";

export type SlashCommandRequest =
  | "resumeThread"
  | "compactThread"
  | "startReview"
  | "showDiff"
  | "showStatus"
  | "forkThread"
  | "renameThread"
  | "reloadMcp"
  | "listMcp"
  | "listSkills"
  | "listHooks"
  | "listApps"
  | "listPlugins"
  | "logout"
  | "exitApp"
  | "copyLastAnswer"
  | "cleanBackgroundTerminals"
  | "approveGuardianDeniedAction"
  | "showFastMode"
  | "showIde"
  | "showVim"
  | "showKeymap"
  | "showSandbox"
  | "showExperimental"
  | "showMemories"
  | "showCollaborationModes"
  | "showAgents"
  | "showSideConversation"
  | "showGoal"
  | "showPlanMode"
  | "showMentionPicker"
  | "showDebugConfig"
  | "showTitle"
  | "showStatusline"
  | "showTheme"
  | "showFeedback"
  | "showRolloutPath"
  | "showProcesses"
  | "showPersonality"
  | "showRealtime"
  | "showRealtimeSettings"
  | "testApproval"
  | "memoryDebugDrop"
  | "memoryDebugUpdate";

export type SlashCommandAction =
  | { action: "openSettings"; panel: SettingsPanelId; clearInput: true }
  | { action: "createThread"; clearInput: true }
  | { action: "clearInput" }
  | { action: "insertText"; text: string }
  | { action: "request"; request: SlashCommandRequest; clearInput: true; payload?: Record<string, unknown> }
  | { action: "log"; level: "info" | "warn" | "error"; message: string };

export interface SlashCommandContext {
  input: string;
}

export interface AttachAction {
  id: AttachActionId;
  title: string;
  description: string;
  placeholder: string;
}

export type AttachActionId =
  | "mention"
  | "localImage"
  | "imageUrl"
  | "skill"
  | "plainText"
  | "filePath";

export type ComposerAttachment =
  | { type: "mention"; name: string; path: string }
  | { type: "localImage"; path: string }
  | { type: "image"; url: string }
  | { type: "skill"; name: string; path: string }
  | { type: "plainText"; text: string }
  | { type: "filePath"; path: string };

export const DEFAULT_SLASH_COMMANDS: SlashCommand[] = [
  command("model", "Model", "Choose the model and reasoning effort.", "model", "panel", ["provider", "engine"]),
  command("fast", "Fast mode", "Toggle or inspect fast response mode.", "model", "pending", ["service-tier"], "on | off | status"),
  command("ide", "IDE context", "Attach IDE context to this conversation.", "workspace", "pending", ["editor"]),
  command("permissions", "Permissions", "Choose the approval and sandbox profile.", "settings", "panel", ["approvals", "sandbox"]),
  command("keymap", "Keymap", "Inspect keyboard shortcuts.", "settings", "pending", ["shortcuts"], "debug"),
  command("vim", "Vim mode", "Toggle Vim-style composer editing.", "settings", "pending", ["modal"]),
  command("setup-default-sandbox", "Setup sandbox", "Configure the default sandbox on supported platforms.", "settings", "pending", ["sandbox"]),
  command("sandbox-add-read-dir", "Add sandbox read dir", "Allow Codex to read another directory.", "settings", "pending", ["read-dir"], "path"),
  command("experimental", "Experimental", "Open experimental feature toggles.", "settings", "panel", ["features", "labs"]),
  command("approve", "Approve retry", "Approve a blocked auto-review retry for this thread.", "tools", "direct", ["auto-review"]),
  command("approvals", "Approvals", "Open pending approval and permission controls.", "settings", "panel", ["permission", "requests"]),
  command("memories", "Memories", "Inspect or configure memory behavior.", "tools", "pending", ["memory"]),
  command("skills", "Skills", "List available Codex skills.", "tools", "direct", ["skill"]),
  command("hooks", "Hooks", "List configured lifecycle hooks.", "tools", "direct", ["hook"]),
  command("review", "Review", "Review the current working tree or custom instructions.", "workspace", "direct", ["inspect", "code review"], "instructions"),
  command("rename", "Rename", "Rename the active thread.", "thread", "direct", ["title"], "name"),
  command("new", "New thread", "Start a new thread.", "thread", "direct", ["chat"]),
  command("resume", "Resume", "Resume an existing thread.", "thread", "pending", ["history", "open"], "thread id"),
  command("fork", "Fork", "Fork the active thread.", "thread", "direct", ["branch"]),
  command("init", "Init", "Insert the Codex workspace initialization prompt.", "workspace", "prompt", ["agents", "bootstrap"]),
  command("compact", "Compact", "Compact the active thread context.", "thread", "direct", ["summarize", "ctx"]),
  command("plan", "Plan", "Switch the next message into planning mode.", "thread", "prompt", ["planner"], "prompt"),
  command("goal", "Goal", "Create, inspect, or clear the long-running goal.", "thread", "pending", ["objective"], "objective | clear"),
  command("collab", "Collaboration", "Choose the collaboration mode.", "team", "pending", ["mode"]),
  command("agent", "Agents", "Switch or manage agent threads.", "team", "pending", ["subagent", "multiagent"]),
  command("subagents", "Subagents", "Open multi-agent controls.", "team", "pending", ["agent", "multiagents"]),
  command("side", "Side conversation", "Start an ephemeral side conversation.", "thread", "pending", ["sidecar"], "prompt"),
  command("copy", "Copy answer", "Copy the last assistant answer as markdown.", "thread", "desktop", ["clipboard"]),
  command("raw", "Raw mode", "Toggle raw transcript mode.", "debug", "pending", ["scrollback"], "on | off"),
  command("diff", "Diff", "Show the current git diff.", "workspace", "direct", ["changes"]),
  command("mention", "Mention", "Add a file mention to the composer.", "workspace", "pending", ["file", "@"]),
  command("status", "Status", "Show active thread, workspace, model, and sidecar status.", "workspace", "direct", ["session"]),
  command("debug-config", "Debug config", "Inspect effective Codex config layers.", "debug", "pending", ["config"]),
  command("title", "Terminal title", "Configure terminal title behavior.", "settings", "pending", ["terminal"]),
  command("statusline", "Status line", "Configure status-line behavior.", "settings", "pending", ["status"]),
  command("theme", "Theme", "Choose the UI or syntax theme.", "settings", "pending", ["appearance"]),
  command("mcp", "MCP", "Reload and list MCP servers and tools.", "mcp", "direct", ["tools", "server"], "verbose"),
  command("apps", "Apps", "List connected apps and connectors.", "tools", "direct", ["connectors"]),
  command("plugins", "Plugins", "List installed and marketplace plugins.", "tools", "direct", ["plugin"]),
  command("logout", "Logout", "Sign out from the current Codex account.", "settings", "direct", ["account"]),
  command("quit", "Quit", "Quit HiCodex.", "settings", "desktop", ["exit"], undefined, true),
  command("exit", "Exit", "Quit HiCodex.", "settings", "desktop", ["quit"]),
  command("feedback", "Feedback", "Prepare a feedback upload.", "tools", "pending", ["logs"]),
  command("rollout", "Rollout path", "Show the current rollout path when available.", "debug", "pending", ["debug"]),
  command("ps", "Background terminals", "List background terminal processes.", "tools", "pending", ["processes"]),
  command("stop", "Stop terminals", "Stop all background terminals for this thread.", "tools", "pending", ["clean"]),
  command("clean", "Clean terminals", "Stop all background terminals for this thread.", "tools", "pending", ["stop"], undefined, true),
  command("clear", "Clear", "Clear composer input.", "thread", "direct", ["reset"]),
  command("personality", "Personality", "Choose assistant communication style.", "settings", "pending", ["style"]),
  command("realtime", "Realtime", "Start or configure realtime voice.", "tools", "pending", ["voice", "audio"]),
  command("settings", "Settings", "Open settings.", "settings", "panel", ["config", "preferences"]),
  command("test-approval", "Test approval", "Trigger a development approval request.", "debug", "pending", ["debug"]),
  command("debug-m-drop", "Memory debug drop", "Debug memory maintenance drop flow.", "debug", "pending", ["memory"], undefined, true),
  command("debug-m-update", "Memory debug update", "Debug memory maintenance update flow.", "debug", "pending", ["memory"], undefined, true),
  command("help", "Help", "Show available composer commands.", "settings", "desktop", ["commands", "?"]),
];

export const DEFAULT_ATTACH_ACTIONS: AttachAction[] = [
  {
    id: "mention",
    title: "Mention file",
    description: "Reference a file or folder in the workspace.",
    placeholder: "packages/ui/src/HiCodexApp.tsx",
  },
  {
    id: "localImage",
    title: "Local image",
    description: "Attach an image from disk.",
    placeholder: "/Users/haichao/Desktop/screenshot.png",
  },
  {
    id: "imageUrl",
    title: "Image URL",
    description: "Attach an image from a URL.",
    placeholder: "https://example.com/image.png",
  },
  {
    id: "skill",
    title: "Skill",
    description: "Attach a Codex skill by path.",
    placeholder: "/Users/haichao/.codex/skills/name/SKILL.md",
  },
  {
    id: "plainText",
    title: "Text context",
    description: "Add pasted text as message context.",
    placeholder: "Paste context",
  },
  {
    id: "filePath",
    title: "File path",
    description: "Add a path as text context.",
    placeholder: "packages/ui/src/components/composer.tsx",
  },
];

export function composerEnterAction(input: string, event: ComposerKeyEventLike): ComposerEnterResult {
  if (event.key !== "Enter") return { action: "none", preventDefault: false };
  if (event.isComposing || event.nativeEvent?.isComposing) return { action: "none", preventDefault: false };
  if (event.shiftKey) return { action: "newline", preventDefault: false };
  if (!input.trim()) return { action: "none", preventDefault: false };
  return { action: "send", preventDefault: true };
}

export function filterSlashCommands(
  query: string,
): SlashCommand[];
export function filterSlashCommands<T extends Pick<SlashCommand, "id" | "title"> & { aliases?: string[]; description?: string }>(
  query: string,
  commands: T[],
): T[];
export function filterSlashCommands<T extends Pick<SlashCommand, "id" | "title"> & { aliases?: string[]; description?: string }>(
  query: string,
  commands: T[] = DEFAULT_SLASH_COMMANDS as unknown as T[],
) {
  const normalized = normalizeSlashQuery(query);
  if (!normalized) return commands;
  return commands.filter((command) => {
    const haystack = [
      command.id,
      command.title,
      command.description,
      ...(command.aliases ?? []),
    ].join(" ").toLowerCase();
    return haystack.includes(normalized);
  });
}

export function applySlashCommand(commandId: string, context: SlashCommandContext): SlashCommandAction {
  const id = commandId.toLowerCase();
  const args = slashArgs(id, context.input);

  switch (id) {
    case "model":
      return { action: "openSettings", panel: "models", clearInput: true };
    case "mcp":
      return args
        ? { action: "request", request: "listMcp", clearInput: true, payload: { detail: args } }
        : { action: "openSettings", panel: "mcp", clearInput: true };
    case "settings":
      return { action: "openSettings", panel: "general", clearInput: true };
    case "permissions":
      return { action: "openSettings", panel: "permissions", clearInput: true };
    case "approvals":
      return { action: "openSettings", panel: "approvals", clearInput: true };
    case "experimental":
      return { action: "openSettings", panel: "experimental", clearInput: true };
    case "new":
      return { action: "createThread", clearInput: true };
    case "clear":
      return { action: "clearInput" };
    case "resume":
      return { action: "request", request: "resumeThread", clearInput: true, payload: optionalPayload("threadId", args) };
    case "fork":
      return { action: "request", request: "forkThread", clearInput: true };
    case "rename":
      return { action: "request", request: "renameThread", clearInput: true, payload: optionalPayload("name", args) };
    case "init":
      return { action: "insertText", text: "Initialize this workspace for Codex." };
    case "compact":
      return { action: "request", request: "compactThread", clearInput: true };
    case "review":
      return { action: "request", request: "startReview", clearInput: true, payload: optionalPayload("instructions", args) };
    case "diff":
      return { action: "request", request: "showDiff", clearInput: true };
    case "status":
      return { action: "request", request: "showStatus", clearInput: true };
    case "help":
      return { action: "log", level: "info", message: "Show available composer commands." };
    case "skills":
      return { action: "request", request: "listSkills", clearInput: true };
    case "hooks":
      return { action: "request", request: "listHooks", clearInput: true };
    case "apps":
      return { action: "request", request: "listApps", clearInput: true };
    case "plugins":
      return { action: "request", request: "listPlugins", clearInput: true };
    case "logout":
      return { action: "request", request: "logout", clearInput: true };
    case "quit":
    case "exit":
      return { action: "request", request: "exitApp", clearInput: true };
    case "approve":
      return { action: "request", request: "approveGuardianDeniedAction", clearInput: true };
    case "fast":
      return { action: "request", request: "showFastMode", clearInput: true, payload: optionalPayload("mode", args) };
    case "ide":
      return { action: "request", request: "showIde", clearInput: true, payload: optionalPayload("args", args) };
    case "vim":
      return { action: "request", request: "showVim", clearInput: true };
    case "keymap":
      return { action: "request", request: "showKeymap", clearInput: true, payload: optionalPayload("args", args) };
    case "setup-default-sandbox":
      return { action: "request", request: "showSandbox", clearInput: true, payload: { action: "setupDefault" } };
    case "sandbox-add-read-dir":
      return { action: "request", request: "showSandbox", clearInput: true, payload: optionalPayload("path", args) };
    case "memories":
      return { action: "request", request: "showMemories", clearInput: true };
    case "plan":
      return args
        ? { action: "insertText", text: `Plan before making changes: ${args}` }
        : { action: "request", request: "showPlanMode", clearInput: true };
    case "goal":
      return { action: "request", request: "showGoal", clearInput: true, payload: optionalPayload("objective", args) };
    case "collab":
      return { action: "request", request: "showCollaborationModes", clearInput: true };
    case "agent":
    case "subagents":
      return { action: "request", request: "showAgents", clearInput: true, payload: optionalPayload("args", args) };
    case "side":
      return { action: "request", request: "showSideConversation", clearInput: true, payload: optionalPayload("prompt", args) };
    case "copy":
      return { action: "request", request: "copyLastAnswer", clearInput: true };
    case "raw":
      return { action: "log", level: "info", message: "Raw transcript mode is a TUI-only command; HiCodex keeps rendered ThreadItems visible." };
    case "mention":
      return { action: "request", request: "showMentionPicker", clearInput: true, payload: optionalPayload("query", args) };
    case "debug-config":
      return { action: "request", request: "showDebugConfig", clearInput: true };
    case "title":
      return { action: "request", request: "showTitle", clearInput: true };
    case "statusline":
      return { action: "request", request: "showStatusline", clearInput: true };
    case "theme":
      return { action: "request", request: "showTheme", clearInput: true };
    case "feedback":
      return { action: "request", request: "showFeedback", clearInput: true };
    case "rollout":
      return { action: "request", request: "showRolloutPath", clearInput: true };
    case "ps":
      return { action: "request", request: "showProcesses", clearInput: true };
    case "stop":
    case "clean":
      return { action: "request", request: "cleanBackgroundTerminals", clearInput: true };
    case "personality":
      return { action: "request", request: "showPersonality", clearInput: true };
    case "realtime":
      return { action: "request", request: "showRealtime", clearInput: true };
    case "test-approval":
      return { action: "request", request: "testApproval", clearInput: true };
    case "debug-m-drop":
      return { action: "request", request: "memoryDebugDrop", clearInput: true };
    case "debug-m-update":
      return { action: "request", request: "memoryDebugUpdate", clearInput: true };
    default:
      return { action: "log", level: "warn", message: `Unknown composer command: /${commandId}` };
  }
}

export function buildUserInputFromComposer(
  input: string,
  attachments: ComposerAttachment[] = [],
): UserInput[] {
  const textParts = [input.trim()];
  const structuredInputs: UserInput[] = [];

  for (const attachment of attachments) {
    switch (attachment.type) {
      case "plainText":
        if (attachment.text.trim()) textParts.push(attachment.text.trim());
        break;
      case "filePath":
        if (attachment.path.trim()) textParts.push(attachment.path.trim());
        break;
      case "image":
        if (attachment.url.trim()) structuredInputs.push({ type: "image", url: attachment.url.trim() });
        break;
      case "localImage":
        if (attachment.path.trim()) structuredInputs.push({ type: "localImage", path: attachment.path.trim() });
        break;
      case "skill":
        if (attachment.path.trim()) {
          structuredInputs.push({
            type: "skill",
            name: attachment.name.trim() || inferNameFromPath(attachment.path),
            path: attachment.path.trim(),
          });
        }
        break;
      case "mention":
        if (attachment.path.trim()) {
          structuredInputs.push({
            type: "mention",
            name: attachment.name.trim() || inferNameFromPath(attachment.path),
            path: attachment.path.trim(),
          });
        }
        break;
    }
  }

  const text = textParts.filter(Boolean).join("\n");
  return [
    ...(text ? [{ type: "text" as const, text, text_elements: [] }] : []),
    ...structuredInputs,
  ];
}

export function createAttachmentFromInput(actionId: AttachActionId, value: string): ComposerAttachment | null {
  const trimmed = value.trim();
  if (!trimmed) return null;
  switch (actionId) {
    case "mention":
      return { type: "mention", name: inferNameFromPath(trimmed), path: trimmed };
    case "localImage":
      return { type: "localImage", path: trimmed };
    case "imageUrl":
      return { type: "image", url: trimmed };
    case "skill":
      return { type: "skill", name: inferNameFromPath(trimmed).replace(/\.md$/i, ""), path: trimmed };
    case "plainText":
      return { type: "plainText", text: trimmed };
    case "filePath":
      return { type: "filePath", path: trimmed };
  }
}

export function attachmentLabel(attachment: ComposerAttachment): string {
  switch (attachment.type) {
    case "mention":
      return `@ ${attachment.name || inferNameFromPath(attachment.path)}`;
    case "localImage":
      return `image ${inferNameFromPath(attachment.path)}`;
    case "image":
      return `url ${attachment.url}`;
    case "skill":
      return `skill ${attachment.name || inferNameFromPath(attachment.path)}`;
    case "plainText":
      return `text ${firstLine(attachment.text)}`;
    case "filePath":
      return `path ${attachment.path}`;
  }
}

function command(
  id: string,
  title: string,
  description: string,
  category: SlashCommandCategory,
  supported: SlashCommand["supported"],
  aliases?: string[],
  inlineArgs?: string,
  hidden = false,
): SlashCommand {
  return { id, title, description, category, supported, aliases, inlineArgs, hidden };
}

function normalizeSlashQuery(query: string): string {
  return query.trim().replace(/^\/+/, "").toLowerCase();
}

function slashArgs(commandId: string, input: string): string {
  const match = input.trim().match(/^\/(\S+)\s*([\s\S]*)$/);
  if (!match) return "";
  return match[1].toLowerCase() === commandId ? match[2].trim() : "";
}

function optionalPayload(key: string, value: string): Record<string, unknown> | undefined {
  return value ? { [key]: value } : undefined;
}

function inferNameFromPath(path: string): string {
  const normalized = path.trim().replace(/\/+$/, "");
  return normalized.split(/[\\/]/).filter(Boolean).pop() || normalized;
}

function firstLine(value: string): string {
  const line = value.trim().split(/\r?\n/, 1)[0] ?? "";
  return line.length > 42 ? `${line.slice(0, 39)}...` : line;
}
