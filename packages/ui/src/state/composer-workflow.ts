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
  altKey?: boolean;
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
  | "images"
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
  | { action: "setComposerMode"; mode: ComposerMode; text?: string }
  | { action: "request"; request: SlashCommandRequest; clearInput: true; payload?: Record<string, unknown> }
  | { action: "showCommands"; clearInput: true }
  | { action: "log"; level: "info" | "warn" | "error"; message: string };

export interface SlashCommandContext {
  input: string;
  mode?: ComposerMode;
}

export type ComposerMode = "default" | "plan";
export type FollowUpSubmitAction = "queue" | "steer";

export interface ComposerSendOptions {
  followUpSubmitAction?: FollowUpSubmitAction;
}

export function composerPlaceholderText(input: {
  hasConversation: boolean;
  hasBackgroundAgentsPanel?: boolean;
}): string {
  if (!input.hasConversation) return "Ask Codex anything. @ to use plugins or mention files";
  return input.hasBackgroundAgentsPanel
    ? "Ask for follow-up changes or @ to tag an agent"
    : "Ask for follow-up changes";
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
  | "filePath"
  | "plan"
  | "plugins";

export type ComposerAttachment =
  | { type: "mention"; name: string; path: string }
  | { type: "localImage"; path: string }
  | { type: "image"; url: string; name?: string }
  | { type: "skill"; name: string; path: string }
  | { type: "plainText"; text: string }
  | { type: "filePath"; path: string };

export interface ComposerMentionOption {
  kind?: "file" | "skill" | "app" | "plugin";
  name: string;
  path: string;
  detail?: string;
  promptText?: string;
  score?: number;
}

export interface ComposerMentionTrigger {
  query: string;
  from: number;
  to: number;
}

export interface ComposerTransferFileLike {
  name?: string;
  type?: string;
  path?: string;
  webkitRelativePath?: string;
}

export interface ComposerTransferFileSplit<T extends ComposerTransferFileLike> {
  imageFiles: T[];
  otherFiles: T[];
}

export type ComposerAttachmentPickerStatus = "closed" | "menu" | "input";

export interface ComposerAttachmentPickerState {
  status: ComposerAttachmentPickerStatus;
  activeIndex: number;
  inputMode: AttachActionId | null;
  draft: string;
  error: string | null;
}

export interface ComposerAttachmentConfirmResult {
  state: ComposerAttachmentPickerState;
  attachment: ComposerAttachment | null;
}

export const CLOSED_ATTACHMENT_PICKER_STATE: ComposerAttachmentPickerState = {
  status: "closed",
  activeIndex: 0,
  inputMode: null,
  draft: "",
  error: null,
};

export type ComposerSubmitButtonMode = "send" | "queue" | "stop";

export type ComposerThreadRuntimeStatus =
  | "idle"
  | "running"
  | "waitingForRequest"
  | "connecting";

export interface ComposerSubmitStateInput {
  input: string;
  attachmentCount: number;
  connecting: boolean;
  threadRunning: boolean;
  activeTurnId: string | null;
  pendingRequestCount: number;
  queueingEnabled?: boolean;
}

export interface ComposerSubmitState {
  submitButtonMode: ComposerSubmitButtonMode;
  threadRuntimeStatus: ComposerThreadRuntimeStatus;
  hasContent: boolean;
  disabled: boolean;
  disabledReason?: string;
  submitBlockReason?: "empty" | "connecting" | "pendingRequest" | "missingActiveTurn";
  canStopFromEscape: boolean;
  isQueueingEnabled: boolean;
  requestCount: number;
}

export function projectComposerSubmitState(input: ComposerSubmitStateInput): ComposerSubmitState {
  const hasContent = input.input.trim().length > 0 || input.attachmentCount > 0;
  const hasActiveTurn = Boolean(input.activeTurnId);
  const requestCount = Math.max(0, input.pendingRequestCount);
  const threadRuntimeStatus = input.connecting
    ? "connecting"
    : requestCount > 0
      ? "waitingForRequest"
      : input.threadRunning
        ? "running"
        : "idle";

  if (input.connecting) {
    return {
      submitButtonMode: "send",
      threadRuntimeStatus,
      hasContent,
      disabled: true,
      disabledReason: "Connecting to Codex app-server",
      submitBlockReason: "connecting",
      canStopFromEscape: false,
      isQueueingEnabled: false,
      requestCount,
    };
  }

  if (input.threadRunning && !hasContent) {
    return {
      submitButtonMode: "stop",
      threadRuntimeStatus,
      hasContent,
      disabled: !hasActiveTurn,
      disabledReason: hasActiveTurn ? undefined : "Waiting for active turn before stopping",
      submitBlockReason: hasActiveTurn ? undefined : "missingActiveTurn",
      canStopFromEscape: hasActiveTurn,
      isQueueingEnabled: false,
      requestCount,
    };
  }

  if (requestCount > 0) {
    return {
      submitButtonMode: input.threadRunning ? "queue" : "send",
      threadRuntimeStatus,
      hasContent,
      disabled: true,
      disabledReason: requestCount === 1
        ? "Resolve the pending request before sending more input"
        : `Resolve ${requestCount} pending requests before sending more input`,
      submitBlockReason: "pendingRequest",
      canStopFromEscape: false,
      isQueueingEnabled: false,
      requestCount,
    };
  }

  if (input.threadRunning) {
    const isQueueingEnabled = hasActiveTurn && input.queueingEnabled !== false;
    return {
      submitButtonMode: "queue",
      threadRuntimeStatus,
      hasContent,
      disabled: !hasActiveTurn,
      disabledReason: hasActiveTurn ? undefined : "Waiting for active turn before queueing a follow-up",
      submitBlockReason: hasActiveTurn ? undefined : "missingActiveTurn",
      canStopFromEscape: false,
      isQueueingEnabled,
      requestCount,
    };
  }

  return {
    submitButtonMode: "send",
    threadRuntimeStatus,
    hasContent,
    disabled: !hasContent,
    disabledReason: hasContent ? undefined : "Enter a prompt or add context",
    submitBlockReason: hasContent ? undefined : "empty",
    canStopFromEscape: false,
    isQueueingEnabled: false,
    requestCount,
  };
}

export function composerSubmitTooltip(state: ComposerSubmitState): string {
  if (state.disabledReason) return state.disabledReason;

  if (state.submitButtonMode === "stop") {
    return state.canStopFromEscape ? "Stop response (Esc)" : "Stop response";
  }

  if (state.submitButtonMode === "queue") {
    if (state.isQueueingEnabled) return "Queue (Enter)\nSteer (Cmd+Enter)";
    return "Steer (Enter)\nQueue (Cmd+Enter)";
  }

  if (state.hasContent) return "Send message (Enter)";
  return "Send";
}

export const DEFAULT_SLASH_COMMANDS: SlashCommand[] = [
  command("model", "Model", "Choose the model and reasoning effort.", "model", "panel", ["provider", "engine"]),
  command("fast", "Fast mode", "Toggle or inspect fast response mode.", "model", "pending", ["service-tier"], "on | off | status", true),
  command("ide", "IDE context", "Attach IDE context to this conversation.", "workspace", "pending", ["editor"], undefined, true),
  command("permissions", "Permissions", "Choose the approval and sandbox profile.", "settings", "panel", ["approvals", "sandbox"]),
  command("keymap", "Keymap", "Inspect keyboard shortcuts.", "settings", "pending", ["shortcuts"], "debug", true),
  command("vim", "Vim mode", "Toggle Vim-style composer editing.", "settings", "pending", ["modal"], undefined, true),
  command("setup-default-sandbox", "Setup sandbox", "Configure the default sandbox on supported platforms.", "settings", "pending", ["sandbox"], undefined, true),
  command("sandbox-add-read-dir", "Add sandbox read dir", "Allow Codex to read another directory.", "settings", "pending", ["read-dir"], "path", true),
  command("experimental", "Experimental", "Open experimental feature toggles.", "settings", "panel", ["features", "labs"]),
  command("approve", "Approve retry", "Approve a blocked auto-review retry for this thread.", "tools", "direct", ["auto-review"]),
  command("approvals", "Approvals", "Open pending approval and permission controls.", "settings", "panel", ["permission", "requests"]),
  command("memories", "Memories", "Inspect or configure memory behavior.", "tools", "pending", ["memory"], undefined, true),
  command("skills", "Skills", "List available Codex skills.", "tools", "direct", ["skill"], "reload"),
  command("hooks", "Hooks", "List configured lifecycle hooks.", "tools", "direct", ["hook"]),
  command("review", "Review", "Review the current working tree or custom instructions.", "workspace", "direct", ["inspect", "code review"], "instructions"),
  command("rename", "Rename", "Rename the active thread.", "thread", "direct", ["title"], "name"),
  command("new", "New thread", "Start a new thread.", "thread", "direct", ["chat"]),
  command("resume", "Resume", "Resume an existing thread.", "thread", "direct", ["history", "open"], "thread id"),
  command("fork", "Fork", "Fork the active thread.", "thread", "direct", ["branch"]),
  command("init", "Init", "Insert the Codex workspace initialization prompt.", "workspace", "prompt", ["agents", "bootstrap"]),
  command("compact", "Compact", "Compact the active thread context.", "thread", "direct", ["summarize", "ctx"]),
  command("plan", "Plan mode", "Switch the composer into planning mode.", "thread", "direct", ["planner"], "prompt"),
  command("goal", "Goal", "Create, inspect, or clear the long-running goal.", "thread", "direct", ["objective"], "objective | clear"),
  command("collab", "Collaboration", "Choose the collaboration mode.", "team", "direct", ["mode"]),
  command("agent", "Agents", "Switch or manage agent threads.", "team", "pending", ["subagent", "multiagent"], undefined, true),
  command("subagents", "Subagents", "Open multi-agent controls.", "team", "pending", ["agent", "multiagents"], undefined, true),
  command("side", "Side conversation", "Start an ephemeral side conversation.", "thread", "direct", ["sidecar"], "prompt"),
  command("copy", "Copy answer", "Copy the last assistant answer as markdown.", "thread", "desktop", ["clipboard"]),
  command("raw", "Raw mode", "Toggle raw transcript mode.", "debug", "pending", ["scrollback"], "on | off", true),
  command("diff", "Diff", "Show the current git diff.", "workspace", "direct", ["changes"]),
  command("mention", "Mention", "Add a file mention to the composer.", "workspace", "direct", ["file", "@"]),
  command("status", "Status", "Show active thread, workspace, model, and sidecar status.", "workspace", "direct", ["session"]),
  command("debug-config", "Debug config", "Inspect effective Codex config layers.", "debug", "pending", ["config"], undefined, true),
  command("title", "Terminal title", "Configure terminal title behavior.", "settings", "pending", ["terminal"], undefined, true),
  command("statusline", "Status line", "Configure status-line behavior.", "settings", "pending", ["status"], undefined, true),
  command("theme", "Theme", "Choose the UI or syntax theme.", "settings", "pending", ["appearance"], undefined, true),
  command("mcp", "MCP", "Reload and list MCP servers and tools.", "mcp", "direct", ["tools", "server"], "verbose"),
  command("apps", "Apps", "List connected apps and connectors.", "tools", "direct", ["connectors"]),
  command("plugins", "Plugins", "List installed and marketplace plugins.", "tools", "direct", ["plugin"]),
  command("logout", "Logout", "Sign out from the current Codex account.", "settings", "direct", ["account"]),
  command("quit", "Quit", "Quit HiCodex.", "settings", "desktop", ["exit"], undefined, true),
  command("exit", "Exit", "Quit HiCodex.", "settings", "desktop", ["quit"]),
  command("feedback", "Feedback", "Prepare a feedback upload.", "tools", "pending", ["logs"], undefined, true),
  command("rollout", "Rollout path", "Show the current rollout path when available.", "debug", "pending", ["debug"], undefined, true),
  command("ps", "Background terminals", "List background terminal processes.", "tools", "direct", ["processes"]),
  command("stop", "Stop terminals", "Stop all background terminals for this thread.", "tools", "direct", ["clean"]),
  command("clean", "Clean terminals", "Stop all background terminals for this thread.", "tools", "direct", ["stop"], undefined, true),
  command("clear", "Clear", "Clear composer input.", "thread", "direct", ["reset"]),
  command("personality", "Personality", "Choose assistant communication style.", "settings", "direct", ["style"]),
  command("realtime", "Realtime", "Start or configure realtime voice.", "tools", "pending", ["voice", "audio"], undefined, true),
  command("settings", "Settings", "Open settings.", "settings", "panel", ["config", "preferences"]),
  command("test-approval", "Test approval", "Trigger a development approval request.", "debug", "pending", ["debug"], undefined, true),
  command("debug-m-drop", "Memory debug drop", "Debug memory maintenance drop flow.", "debug", "pending", ["memory"], undefined, true),
  command("debug-m-update", "Memory debug update", "Debug memory maintenance update flow.", "debug", "pending", ["memory"], undefined, true),
  command("help", "Help", "Show available composer commands.", "settings", "desktop", ["commands", "?"]),
];

export const DEFAULT_ATTACH_ACTIONS: AttachAction[] = [
  {
    id: "filePath",
    title: "Add photos & files",
    description: "Attach local images or files.",
    placeholder: "",
  },
  {
    id: "plan",
    title: "Plan mode",
    description: "Create a plan before making changes.",
    placeholder: "",
  },
  {
    id: "plugins",
    title: "Plugins",
    description: "Browse available plugins.",
    placeholder: "",
  },
];

export function openAttachmentPicker(
  state: ComposerAttachmentPickerState = CLOSED_ATTACHMENT_PICKER_STATE,
): ComposerAttachmentPickerState {
  return {
    status: "menu",
    activeIndex: clampAttachmentIndex(state.activeIndex),
    inputMode: null,
    draft: "",
    error: null,
  };
}

export function closeAttachmentPicker(): ComposerAttachmentPickerState {
  return { ...CLOSED_ATTACHMENT_PICKER_STATE };
}

export function moveAttachmentPickerSelection(
  state: ComposerAttachmentPickerState,
  direction: 1 | -1,
  actionCount = DEFAULT_ATTACH_ACTIONS.length,
): ComposerAttachmentPickerState {
  if (state.status !== "menu" || actionCount <= 0) return state;
  return {
    ...state,
    activeIndex: (state.activeIndex + direction + actionCount) % actionCount,
  };
}

export function selectAttachmentInputMode(
  state: ComposerAttachmentPickerState,
  mode: AttachActionId,
): ComposerAttachmentPickerState {
  const index = DEFAULT_ATTACH_ACTIONS.findIndex((action) => action.id === mode);
  return {
    status: "input",
    activeIndex: index >= 0 ? index : state.activeIndex,
    inputMode: mode,
    draft: "",
    error: null,
  };
}

export function updateAttachmentInputDraft(
  state: ComposerAttachmentPickerState,
  draft: string,
): ComposerAttachmentPickerState {
  if (state.status !== "input") return state;
  return {
    ...state,
    draft,
    error: draft.trim() ? null : state.error,
  };
}

export function confirmAttachmentInput(
  state: ComposerAttachmentPickerState,
): ComposerAttachmentConfirmResult {
  if (state.status !== "input" || state.inputMode == null) {
    return { state, attachment: null };
  }

  const attachment = createAttachmentFromInput(state.inputMode, state.draft);
  if (!attachment) {
    return {
      state: {
        ...state,
        error: "Enter a value before adding context",
      },
      attachment: null,
    };
  }

  return {
    state: closeAttachmentPicker(),
    attachment,
  };
}

export function removeComposerAttachment(
  attachments: ComposerAttachment[],
  index: number,
): ComposerAttachment[] {
  if (index < 0 || index >= attachments.length) return attachments;
  return attachments.filter((_, itemIndex) => itemIndex !== index);
}

export function mergeComposerAttachments(
  current: ComposerAttachment[],
  incoming: ComposerAttachment[],
): ComposerAttachment[] {
  if (incoming.length === 0) return current;
  const seen = new Set(current.map(composerAttachmentKey));
  const merged = [...current];
  for (const attachment of incoming) {
    const key = composerAttachmentKey(attachment);
    if (seen.has(key)) continue;
    seen.add(key);
    merged.push(attachment);
  }
  return merged;
}

export function splitComposerTransferFiles<T extends ComposerTransferFileLike>(
  files: ArrayLike<T> | null | undefined,
): ComposerTransferFileSplit<T> {
  const imageFiles: T[] = [];
  const otherFiles: T[] = [];
  for (const file of Array.from(files ?? [])) {
    if (isImageFileLike(file)) imageFiles.push(file);
    else otherFiles.push(file);
  }
  return { imageFiles, otherFiles };
}

export function composerAttachmentsFromPaths(paths: string[]): ComposerAttachment[] {
  const attachments: ComposerAttachment[] = [];
  for (const path of paths) {
    const attachment = composerAttachmentFromPath(path);
    if (attachment) attachments.push(attachment);
  }
  return mergeComposerAttachments([], attachments);
}

export function composerAttachmentFromPath(path: string): ComposerAttachment | null {
  const trimmed = normalizeAttachmentPath(path);
  if (!trimmed) return null;
  if (isImagePath(trimmed)) return { type: "localImage", path: trimmed };
  return { type: "filePath", path: trimmed };
}

export function composerFilePath(file: ComposerTransferFileLike): string | null {
  for (const key of ["path", "webkitRelativePath"] as const) {
    const value = file[key];
    if (typeof value === "string" && value.trim()) return value.trim();
  }
  return null;
}

export function composerAttachmentPreviewSrc(attachment: ComposerAttachment): string | null {
  if (attachment.type === "image") return attachment.url.trim() || null;
  if (attachment.type !== "localImage") return null;
  const path = normalizeAttachmentPath(attachment.path);
  if (!path) return null;
  if (/^(?:data|blob|https?|file):/i.test(path)) return path;
  const normalizedPath = path.startsWith("/") ? path : `/${path}`;
  return `file://${encodeURI(normalizedPath)}`;
}

export function compactAttachmentLabel(label: string, maxLength = 10): string {
  const trimmed = label.trim();
  if (trimmed.length <= maxLength) return trimmed;
  if (maxLength <= 3) return trimmed.slice(0, maxLength);
  return `${trimmed.slice(0, maxLength - 3)}...`;
}

export function isImageFileLike(file: ComposerTransferFileLike): boolean {
  const mime = file.type?.trim().toLowerCase();
  if (mime?.startsWith("image/")) return true;
  return isImagePath(file.name ?? "");
}

export function composerHasImageAttachments(attachments: ComposerAttachment[]): boolean {
  return attachments.some((attachment) => attachment.type === "image" || attachment.type === "localImage");
}

export function imageAttachmentToUserInput(
  attachment: Extract<ComposerAttachment, { type: "image" | "localImage" }>,
): Extract<UserInput, { type: "image" | "localImage" }> | null {
  const value = attachment.type === "image" ? attachment.url.trim() : normalizeAttachmentPath(attachment.path);
  if (!value) return null;
  if (/^file:/i.test(value)) {
    const path = fileUrlToPath(value);
    return path ? { type: "localImage", path } : null;
  }
  if (/^(?:data:image\/|blob:|https?:)/i.test(value)) return { type: "image", url: value };
  return { type: "localImage", path: value };
}

export function normalizeAttachmentPath(value: string): string {
  const trimmed = value.trim();
  return /^file:/i.test(trimmed) ? fileUrlToPath(trimmed) || trimmed : trimmed;
}

export function findActiveMentionTrigger(input: string): ComposerMentionTrigger | null {
  const cursor = input.length;
  const lineStart = input.lastIndexOf("\n", cursor - 1) + 1;
  const linePrefix = input.slice(lineStart, cursor);
  const match = linePrefix.match(/(?:^|[\s([{])@([^\s@]*)$/);
  if (!match || match.index == null) return null;
  const matchedText = match[0] ?? "";
  const atOffset = matchedText.lastIndexOf("@");
  if (atOffset < 0) return null;
  const from = lineStart + match.index + atOffset;
  const query = match[1] ?? "";
  if (query.length > 120) return null;
  return { query, from, to: cursor };
}

export function removeMentionTriggerText(input: string, trigger: ComposerMentionTrigger): string {
  if (trigger.from < 0 || trigger.to < trigger.from || trigger.to > input.length) return input;
  const prefix = input.slice(0, trigger.from);
  const suffix = input.slice(trigger.to);
  return suffix ? `${prefix}${suffix}` : prefix.trimEnd();
}

export function composerEnterAction(input: string, event: ComposerKeyEventLike): ComposerEnterResult {
  if (event.key !== "Enter") return { action: "none", preventDefault: false };
  if (event.isComposing || event.nativeEvent?.isComposing) return { action: "none", preventDefault: false };
  if (event.shiftKey || event.altKey) return { action: "newline", preventDefault: false };
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

export function slashCommandsForComposerMode(
  mode: ComposerMode,
  commands: SlashCommand[] = DEFAULT_SLASH_COMMANDS,
): SlashCommand[] {
  return commands.map((command) => {
    if (command.id !== "plan") return command;
    return {
      ...command,
      description: mode === "plan" ? "Turn off planning mode." : "Turn on planning mode.",
    };
  });
}

export function attachActionsForComposerMode(
  mode: ComposerMode,
  actions: AttachAction[] = DEFAULT_ATTACH_ACTIONS,
): AttachAction[] {
  return actions.map((action) => {
    if (action.id !== "plan") return action;
    return {
      ...action,
      description: mode === "plan" ? "Turn off planning mode." : "Create a plan before making changes.",
    };
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
      return { action: "showCommands", clearInput: true };
    case "skills":
      return { action: "request", request: "listSkills", clearInput: true, payload: optionalPayload("detail", args) };
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
      return {
        action: "setComposerMode",
        mode: args || context.mode !== "plan" ? "plan" : "default",
        ...(args ? { text: args } : {}),
      };
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
        if (attachment.path.trim()) {
          structuredInputs.push({
            type: "mention",
            name: inferNameFromPath(attachment.path),
            path: normalizeAttachmentPath(attachment.path),
          });
        }
        break;
      case "image":
        {
          const imageInput = imageAttachmentToUserInput(attachment);
          if (imageInput) structuredInputs.push(imageInput);
        }
        break;
      case "localImage":
        {
          const imageInput = imageAttachmentToUserInput(attachment);
          if (imageInput) structuredInputs.push(imageInput);
        }
        break;
      case "skill":
        // Codex Desktop serializes skills as prompt-link text, not structured UserInput.
        break;
      case "mention":
        if (attachment.path.trim()) {
          structuredInputs.push({
            type: "mention",
            name: attachment.name.trim() || inferNameFromPath(attachment.path),
            path: normalizeAttachmentPath(attachment.path),
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
      return { type: "mention", name: inferNameFromPath(trimmed), path: normalizeAttachmentPath(trimmed) };
    case "localImage":
      return { type: "localImage", path: normalizeAttachmentPath(trimmed) };
    case "imageUrl":
      return { type: "image", url: trimmed };
    case "skill":
      return { type: "skill", name: inferNameFromPath(trimmed).replace(/\.md$/i, ""), path: normalizeAttachmentPath(trimmed) };
    case "plainText":
      return { type: "plainText", text: trimmed };
    case "filePath":
      return { type: "filePath", path: normalizeAttachmentPath(trimmed) };
    case "plan":
    case "plugins":
      return null;
  }
}

export function attachmentLabel(attachment: ComposerAttachment): string {
  switch (attachment.type) {
    case "mention":
      return `@ ${attachment.name || inferNameFromPath(attachment.path)}`;
    case "localImage":
      return inferNameFromPath(attachment.path);
    case "image":
      return attachment.name?.trim()
        ? attachment.name.trim()
        : attachment.url.startsWith("data:")
          ? "pasted image"
          : inferNameFromPath(attachment.url) || attachment.url;
    case "skill":
      return `skill ${attachment.name || inferNameFromPath(attachment.path)}`;
    case "plainText":
      return `text ${firstLine(attachment.text)}`;
    case "filePath":
      return inferNameFromPath(attachment.path);
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
  const normalized = normalizeAttachmentPath(path).replace(/\/+$/, "");
  return normalized.split(/[\\/]/).filter(Boolean).pop() || normalized;
}

function firstLine(value: string): string {
  const line = value.trim().split(/\r?\n/, 1)[0] ?? "";
  return line.length > 42 ? `${line.slice(0, 39)}...` : line;
}

function clampAttachmentIndex(index: number): number {
  return Math.max(0, Math.min(DEFAULT_ATTACH_ACTIONS.length - 1, index));
}

function isImagePath(path: string): boolean {
  const normalized = path.trim().toLowerCase();
  return /\.(avif|bmp|gif|heic|heif|jpeg|jpg|png|svg|tif|tiff|webp)$/.test(normalized);
}

function fileUrlToPath(value: string): string | null {
  try {
    const url = new URL(value);
    if (url.protocol !== "file:") return null;
    return decodeURIComponent(url.pathname);
  } catch {
    return null;
  }
}

function composerAttachmentKey(attachment: ComposerAttachment): string {
  switch (attachment.type) {
    case "mention":
      return `mention:${normalizeAttachmentPath(attachment.path)}`;
    case "localImage":
      return `localImage:${normalizeAttachmentPath(attachment.path)}`;
    case "image":
      return `image:${attachment.url.trim()}`;
    case "skill":
      return `skill:${normalizeAttachmentPath(attachment.path)}`;
    case "plainText":
      return `plainText:${attachment.text.trim()}`;
    case "filePath":
      return `filePath:${normalizeAttachmentPath(attachment.path)}`;
  }
}
