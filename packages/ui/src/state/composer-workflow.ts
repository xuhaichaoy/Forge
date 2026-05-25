import type { ImageDetail, UserInput } from "@hicodex/codex-protocol";

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
  | "agent"
  | "appshots"
  | "appearance"
  | "connections"
  | "data-controls"
  | "git-settings"
  | "local-environments"
  | "models"
  | "images"
  | "keyboard-shortcuts"
  | "usage"
  | "computer-use"
  | "browser-use"
  | "mcp"
  | "approvals"
  | "permissions"
  | "skills"
  | "hooks"
  | "plugins"
  | "worktrees"
  | "apps"
  | "experimental"
  | "personalization"
  | "team"
  | "general";

export type SlashCommandRequest =
  | "resumeThread"
  | "compactThread"
  | "startReview"
  | "showDiff"
  | "showStatus"
  | "toggleStatusFooter"
  | "forkThread"
  | "renameThread"
  | "reloadMcp"
  | "listMcp"
  | "listSkills"
  | "listHooks"
  | "listApps"
  | "listPlugins"
  | "loginChatgpt"
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
  | "showRpcInspector"
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

export const PLAN_KEYWORD_SUGGESTION_ID = "keyword-plan-mode";
const PLAN_KEYWORD_PATTERN = /\bplan\b/i;

export function shouldShowPlanKeywordSuggestion(input: {
  composerText: string;
  hasPlanMode: boolean;
  isPlanMode: boolean;
  isDismissed: boolean;
  showPlanKeywordSuggestion?: boolean;
}): boolean {
  if (!input.showPlanKeywordSuggestion) return false;
  if (!input.hasPlanMode || input.isPlanMode || input.isDismissed) return false;
  return PLAN_KEYWORD_PATTERN.test(input.composerText);
}

export interface ComposerSendOptions {
  followUpSubmitAction?: FollowUpSubmitAction;
  input?: string;
  attachments?: ComposerAttachment[];
}

export function composerPlaceholderText(input: {
  hasConversation: boolean;
  hasBackgroundAgentsPanel?: boolean;
}): string {
  // codex: placeholder strings align verbatim to upstream ICU defaults —
  //   composer.placeholder.newTask.locally.v2              = "Ask Codex anything. @ to use plugins or mention files"
  //   composer.placeholder.localFollowUp.locallyWithAgents = "Ask for follow up changes or @ to tag an agent"
  //   composer.placeholder.localFollowUp.locally           = "Ask for follow-up changes"
  // (Upstream intentionally drops the hyphen in the with-agents variant.)
  if (!input.hasConversation) return "Ask Codex anything. @ to use plugins or mention files";
  return input.hasBackgroundAgentsPanel
    ? "Ask for follow up changes or @ to tag an agent"
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

/*
 * UI attachment state. buildUserInputFromComposer maps it back to the protocol
 * UserInput surface: text/image/localImage/skill/mention.
 */
export type ComposerAttachment =
  | { type: "mention"; name: string; path: string }
  | { type: "localImage"; path: string; detail?: ImageDetail }
  | { type: "image"; url: string; name?: string; detail?: ImageDetail }
  | { type: "skill"; name: string; path: string }
  | { type: "plainText"; text: string }
  | { type: "filePath"; path: string };

export interface ComposerMentionOption {
  /* UI mention category. Protocol serialization still uses skill/mention. */
  kind?: "file" | "skill" | "app" | "plugin" | "agent";
  name: string;
  displayName?: string;
  description?: string;
  scopeLabel?: string;
  path: string;
  detail?: string;
  promptText?: string;
  score?: number;
  /** Current-session registry metadata for editor chip rendering. */
  iconSmall?: string | null;
  brandColor?: string | null;
}

export type ComposerMentionMarker = "@" | "$";

export interface ComposerMentionTrigger {
  marker: ComposerMentionMarker;
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
  command("memories", "Memories", "Inspect or configure memory behavior.", "tools", "direct", ["memory"]),
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
  command("status", "Status", "Toggle context usage.", "workspace", "direct", ["session"]),
  command("debug-config", "Debug config", "Inspect effective Codex config layers.", "debug", "direct", ["config"]),
  command("rpc", "RPC inspector", "Inspect recent JSON-RPC and host events.", "debug", "direct", ["json-rpc", "inspector"]),
  command("title", "Terminal title", "Configure terminal title behavior.", "settings", "pending", ["terminal"], undefined, true),
  command("statusline", "Status line", "Configure status-line behavior.", "settings", "pending", ["status"], undefined, true),
  command("theme", "Theme", "Choose the UI appearance.", "settings", "direct", ["appearance", "dark", "light"]),
  command("mcp", "MCP", "Reload and list MCP servers and tools.", "mcp", "direct", ["tools", "server"], "verbose"),
  command("apps", "Apps", "List connected apps and connectors.", "tools", "direct", ["connectors"]),
  command("plugins", "Plugins", "List installed and marketplace plugins.", "tools", "direct", ["plugin"]),
  command("worktrees", "Worktrees", "Inspect local, worktree, and cloud work modes.", "workspace", "panel", ["git", "branch", "cloud"]),
  command("login", "Login", "Sign in to ChatGPT (OpenAI subscription).", "settings", "direct", ["account", "oauth", "signin"]),
  command("logout", "Logout", "Sign out from the current Codex account.", "settings", "direct", ["account"]),
  command("quit", "Quit", "Quit HiCodex.", "settings", "desktop", ["exit"], undefined, true),
  command("exit", "Exit", "Quit HiCodex.", "settings", "desktop", ["quit"]),
  command("feedback", "Feedback", "Prepare a feedback report with diagnostics.", "tools", "direct", ["logs", "bug"]),
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

/*
 * codex: composer-D0cvMZjq.js — composer attach menu lists ~6 entries
 * (file picker, mention, plain text, image URL, plan toggle, plugins). Codex
 * orders frequently-used attachment entries before mode toggles. HiCodex
 * mirrors the order; `localImage` is intentionally absent because it is
 * already covered by paste/drag-drop in the composer field itself
 * (HiCodex `composer.tsx` `onPaste` + `onDrop` listeners), matching Codex's
 * implicit local-image path.
 */
export const DEFAULT_ATTACH_ACTIONS: AttachAction[] = [
  {
    id: "filePath",
    title: "Add photos & files",
    description: "Attach local images or files.",
    placeholder: "",
  },
  {
    id: "mention",
    title: "Mention a file or app",
    description: "Insert an @-mention reference.",
    placeholder: "Type to search for files, agents, skills, apps, or plugins",
  },
  {
    id: "plainText",
    title: "Add plain text",
    description: "Paste plain text as a separate attachment.",
    placeholder: "Paste or type text…",
  },
  {
    id: "imageUrl",
    title: "Add image from URL",
    description: "Reference an image hosted online.",
    placeholder: "https://…",
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

export function composerAttachmentKindLabel(attachment: ComposerAttachment): string {
  switch (attachment.type) {
    case "mention":
      return "Mention";
    case "localImage":
      return "Image";
    case "image":
      return attachment.url.trim().startsWith("data:") ? "Image" : "Image URL";
    case "skill":
      return "Skill";
    case "plainText":
      return "Text";
    case "filePath":
      return "File";
  }
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
    return path ? imageUserInputWithDetail({ type: "localImage", path }, attachment.detail) : null;
  }
  if (/^(?:data:image\/|blob:|https?:)/i.test(value)) {
    return imageUserInputWithDetail({ type: "image", url: value }, attachment.detail);
  }
  return imageUserInputWithDetail({ type: "localImage", path: value }, attachment.detail);
}

function imageUserInputWithDetail<T extends Extract<UserInput, { type: "image" | "localImage" }>>(
  input: T,
  detail: ImageDetail | undefined,
): T {
  return detail === undefined ? input : { ...input, detail };
}

export function normalizeAttachmentPath(value: string): string {
  const trimmed = value.trim();
  return /^file:/i.test(trimmed) ? fileUrlToPath(trimmed) || trimmed : trimmed;
}

export function findActiveMentionTrigger(input: string): ComposerMentionTrigger | null {
  const cursor = input.length;
  const lineStart = input.lastIndexOf("\n", cursor - 1) + 1;
  const linePrefix = input.slice(lineStart, cursor);
  return findMarkerMentionTrigger({
    marker: "@",
    linePrefix,
    lineStart,
    cursor,
    pattern: /(^|\s)(@[^@]*)$/,
  }) ?? findMarkerMentionTrigger({
    marker: "$",
    linePrefix,
    lineStart,
    cursor,
    pattern: /(^|\s)(\$[^$]*)$/,
  });
}

function findMarkerMentionTrigger(input: {
  marker: ComposerMentionMarker;
  linePrefix: string;
  lineStart: number;
  cursor: number;
  pattern: RegExp;
}): ComposerMentionTrigger | null {
  const match = input.linePrefix.match(input.pattern);
  if (!match || match.index == null) return null;
  const matchedText = match[0] ?? "";
  const markerOffset = matchedText.lastIndexOf(input.marker);
  if (markerOffset < 0) return null;
  const from = input.lineStart + match.index + markerOffset;
  const query = matchedText.slice(markerOffset + input.marker.length);
  if (query.length > 120) return null;
  return { marker: input.marker, query, from, to: input.cursor };
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
  /*
   * codex: slash-command-item-BG_2m44T.js — Codex Desktop ranks slash matches
   * via a score function (sourced from `dist-BzssiQ2D.js` / `score-query-match`).
   * Plain substring filtering misses typos / split-token queries and returns
   * results in arbitrary registration order. We mirror Codex's behaviour with
   * a weighted scorer: exact id > prefix > substring > subsequence (fuzzy).
   */
  const scored: Array<{ command: T; score: number; index: number }> = [];
  for (let index = 0; index < commands.length; index++) {
    const command = commands[index]!;
    const score = scoreSlashCommandMatch(normalized, command);
    if (score > 0) scored.push({ command, score, index });
  }
  scored.sort((a, b) => {
    if (b.score !== a.score) return b.score - a.score;
    return a.index - b.index;
  });
  return scored.map((entry) => entry.command);
}

/*
 * codex: slash-command-item-BG_2m44T.js — per-field score with weights.
 * Returns 0 when no haystack field has any match. Field weights mirror Codex's
 * priority: id > title > alias > description.
 */
function scoreSlashCommandMatch(
  needle: string,
  command: Pick<SlashCommand, "id" | "title"> & { aliases?: string[]; description?: string },
): number {
  const fields: Array<{ value: string; weight: number }> = [
    { value: command.id, weight: 3 },
    { value: command.title, weight: 2.5 },
    ...((command.aliases ?? []).map((alias) => ({ value: alias, weight: 2 }))),
    { value: command.description ?? "", weight: 1 },
  ];
  let best = 0;
  for (const { value, weight } of fields) {
    if (!value) continue;
    const fieldScore = scoreFuzzyField(needle, value) * weight;
    if (fieldScore > best) best = fieldScore;
  }
  return best;
}

/*
 * codex: dist-BzssiQ2D.js — `score-query-match` style ranker.
 *
 * Tiers (higher is better):
 *   exact equality          : 1000
 *   prefix match            : 800 - (haystack.length - needle.length)
 *   substring match         : 500 - matchIndex
 *   subsequence (fuzzy) hit : 200 - totalGap, clamped to [50, ...]
 * Returns 0 when the needle is not even a subsequence of haystack.
 */
function scoreFuzzyField(needle: string, haystack: string): number {
  const n = needle.toLowerCase();
  const h = haystack.toLowerCase();
  if (h === n) return 1000;
  if (h.startsWith(n)) return 800 - Math.max(0, h.length - n.length);
  const idx = h.indexOf(n);
  if (idx >= 0) return 500 - idx;
  // Subsequence: scan needle chars left-to-right; bail when a char is missing.
  let hi = 0;
  let gaps = 0;
  for (let i = 0; i < n.length; i++) {
    const c = n.charCodeAt(i);
    let found = -1;
    while (hi < h.length) {
      if (h.charCodeAt(hi) === c) {
        found = hi;
        hi++;
        break;
      }
      hi++;
    }
    if (found < 0) return 0;
    gaps += found - (i === 0 ? found : hi - 1);
  }
  return Math.max(50, 200 - gaps);
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
      return { action: "request", request: "toggleStatusFooter", clearInput: true };
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
    case "worktrees":
      return { action: "openSettings", panel: "worktrees", clearInput: true };
    case "login":
      return { action: "request", request: "loginChatgpt", clearInput: true };
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
    case "rpc":
      return { action: "request", request: "showRpcInspector", clearInput: true };
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
  const leadingPromptLinks: string[] = [];
  const structuredInputs: UserInput[] = [];

  for (const attachment of attachments) {
    switch (attachment.type) {
      case "plainText":
        appendComposerTextPart(textParts, attachment.text);
        break;
      case "filePath":
        {
          const path = normalizeAttachmentPath(attachment.path);
          // Keep local files inline as `[name](path)` so the model can `cat`/`rg`
          // the file directly. The projection layer extracts these links into
          // chip parts so the user message still renders a file chip above the
          // bubble instead of a raw markdown link inside it.
          appendLocalFileReference(textParts, path);
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
        {
          const promptLink = skillAttachmentPromptLink(attachment);
          if (
            promptLink
            && !textParts.some((part) => part.includes(promptLink))
            && !leadingPromptLinks.includes(promptLink)
          ) {
            leadingPromptLinks.push(promptLink);
          }
        }
        break;
      case "mention":
        {
          const path = normalizeAttachmentPath(attachment.path);
          if (!path) break;
          if (isLocalFileReference(path)) {
            // Local files stay inline so the model can read the path directly;
            // the projection layer upgrades them to file chips for display.
            appendLocalFileReference(textParts, path, attachment.name);
            break;
          }
          structuredInputs.push({
            type: "mention",
            name: attachment.name.trim() || inferNameFromPath(path),
            path,
          });
        }
        break;
    }
  }

  const text = [...leadingPromptLinks, ...textParts].filter(Boolean).join("\n");
  return [
    ...(text ? [{ type: "text" as const, text, text_elements: [] }] : []),
    ...structuredInputs,
  ];
}

function appendComposerTextPart(textParts: string[], value: string): void {
  const text = value.trim();
  if (!text) return;
  if (textParts.some((part) => part.includes(text))) return;
  textParts.push(text);
}

function appendLocalFileReference(textParts: string[], path: string, label?: string): void {
  const normalized = normalizeAttachmentPath(path);
  if (!isLocalFileReference(normalized)) return;
  const promptLink = localFilePromptLink(normalized, label);
  if (textParts.some((part) => part.includes(promptLink) || part.includes(normalized))) return;
  textParts.push(promptLink);
}

function isLocalFileReference(path: string): boolean {
  const normalized = normalizeAttachmentPath(path);
  if (!normalized) return false;
  if (/^(?:app|plugin|skill|agent|http|https|mailto|tel|data|blob):/i.test(normalized)) return false;
  if (/^[a-z][a-z0-9+.-]*:/i.test(normalized)) return false;
  return true;
}

function localFilePromptLink(path: string, label?: string): string {
  const name = label?.trim() || inferNameFromPath(path) || path;
  return `[${escapePromptLinkLabel(name)}](${escapePromptLinkPath(path)})`;
}

function skillAttachmentPromptLink(attachment: Extract<ComposerAttachment, { type: "skill" }>): string | null {
  const path = normalizeAttachmentPath(attachment.path);
  if (!path) return null;
  const rawName = attachment.name.trim() || inferNameFromPath(path).replace(/\.md$/i, "");
  const name = rawName.replace(/^\$+/, "").trim();
  if (!name) return null;
  return `[$${name}](${escapePromptLinkPath(path)})`;
}

function escapePromptLinkPath(value: string): string {
  if (/[\s()<>]/.test(value)) {
    return `<${value.replace(/\\/g, "\\\\").replace(/>/g, "\\>")}>`;
  }
  return value.replace(/\\/g, "\\\\").replace(/\)/g, "\\)");
}

function escapePromptLinkLabel(value: string): string {
  return value.replace(/\\/g, "\\\\").replace(/\]/g, "\\]");
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
