import type {
  CommandPanelEntry,
  CommandPanelKind,
  CommandPanelState,
  CommandPanelStatus,
  CommandPanelSubMode,
} from "./command-panel-types";
import type { I18nMessageDescriptor, I18nValues } from "./i18n";

type FormatMessage = (descriptor: I18nMessageDescriptor, values?: I18nValues) => string;

export interface CommandPanelOptions {
  status?: CommandPanelStatus;
  entries?: CommandPanelEntry[];
  error?: string;
  message?: string;
  title?: string;
  searchable?: boolean;
}

export function createCommandPanelState(
  panel: CommandPanelKind,
  options: CommandPanelOptions = {},
): CommandPanelState {
  const entries = options.entries ?? [];
  const requestedStatus = options.status ?? "idle";
  const status = requestedStatus === "ready" && entries.length === 0 ? "empty" : requestedStatus;
  return {
    panel,
    status,
    title: options.title ?? panelTitle(panel),
    entries,
    message: options.message ?? panelMessage(panel, status, options.error),
    ...(options.searchable ? { searchable: true } : {}),
  };
}

export function commandPanelHasSearchInput(panel: CommandPanelState): boolean {
  return panel.searchable === true || panel.entries.length > 0 || panel.panel === "files";
}

export function commandPanelShouldShowChatCreateEmptyState(panel: CommandPanelState, query: string): boolean {
  return panel.searchable === true
    && panel.title === "Search chats"
    && panel.entries.length === 0
    && query.trim().length === 0;
}

// codex: app-main-*.js - cmdk Hd atom (root/chats/files modes).
// Maps a CommandPanelKind to the Codex sub-mode used by the upstream dialog.
// `files` always maps to the file picker; every other kind starts in `root`
// because chat picking is tracked via the searchable "Search chats" title
// rather than a dedicated CommandPanelKind value.
export function commandPanelSubModeFromKind(kind: CommandPanelKind | null): CommandPanelSubMode {
  if (kind === "files") return "files";
  return "root";
}

// codex: app-main-*.js - derive the cmdk Hd value from a live
// CommandPanelState. We treat the dedicated "Search chats" panel (used by
// openChatSearchPanel) as the `chats` sub-mode so the placeholder, Esc, and
// back-button behaviors match Codex without adding a new field to
// CommandPanelState.
export function commandPanelSubModeFromPanel(panel: CommandPanelState | null): CommandPanelSubMode {
  if (!panel) return "root";
  if (panel.panel === "files") return "files";
  if (panel.title === "Search chats") return "chats";
  return "root";
}

// codex: app-main-*.js - three placeholders that ride with the Hd
// atom: root -> "Type command", chats -> "Search chats", files -> "Search files".
export function commandPanelSubModePlaceholder(subMode: CommandPanelSubMode, formatMessage?: FormatMessage): string {
  const fm = (id: string, defaultMessage: string): string =>
    formatMessage ? formatMessage({ id, defaultMessage }) : defaultMessage;
  switch (subMode) {
    case "files":
      return fm("codex.commandMenu.fileSearchPlaceholder", "Search files");
    case "chats":
      return fm("codex.commandMenu.chatSearchPlaceholder", "Search chats");
    case "root":
    default:
      return fm("codex.commandMenu.searchPlaceholder", "Type command");
  }
}

// codex: app-main-*.js - command-dialog Esc handler. First Esc
// clears any query and/or steps the sub-mode back to root; second Esc closes
// the dialog. The caller owns the local query state (CommandPanel manages
// its own input), so we return the next-state intent and let the component
// apply it.
export interface CommandPanelEscapeInput {
  subMode: CommandPanelSubMode;
  query: string;
}

export interface CommandPanelEscapeResult {
  shouldClose: boolean;
  // Whether the caller should clear its local query string. Together with the
  // sub-mode reset this matches Codex's first-Esc behavior.
  clearQuery: boolean;
  // The sub-mode the panel should land in after the keystroke (only meaningful
  // when shouldClose is false).
  nextSubMode: CommandPanelSubMode;
}

export function commandPanelHandleEscape(input: CommandPanelEscapeInput): CommandPanelEscapeResult {
  const hasQuery = input.query.length > 0;
  const inSubMode = input.subMode !== "root";
  if (inSubMode || hasQuery) {
    return { shouldClose: false, clearQuery: hasQuery, nextSubMode: "root" };
  }
  return { shouldClose: true, clearQuery: false, nextSubMode: "root" };
}

export function commandPanelChatCreateEntry(): CommandPanelEntry {
  return {
    id: "chat:create",
    title: "Create chat",
    kind: "thread",
    meta: "Create a chat to get started!",
    action: { type: "runSlashCommand", title: "Create chat", commandId: "new" },
  };
}

function panelTitle(panel: CommandPanelKind): string {
  switch (panel) {
    case "mcp":
      return "MCP servers";
    case "skills":
      return "Skills";
    case "hooks":
      return "Hooks";
    case "apps":
      return "Apps";
    case "plugins":
      return "Plugins";
    case "experimental":
      // codex: settings.general.experimentalFeatures defaultMessage
      // `Experimental features (Beta)` (verified in asar chunks).
      return "Experimental features (Beta)";
    case "collaboration":
      return "Collaboration modes";
    case "status":
      return "Status";
    case "theme":
      return "Theme";
    case "files":
      return "Files";
    case "diff":
      return "Diff";
    default:
      return "Command";
  }
}

const PANEL_MESSAGE_OVERRIDES: Partial<Record<CommandPanelKind, { loading?: string; empty?: string }>> = {
  experimental: { loading: "Loading experimental features…", empty: "No beta experimental features available" },
  skills: { loading: "Loading skills…", empty: "No skills found" },
  apps: { loading: "Loading apps…" },
  plugins: { loading: "Loading plugins…" },
  hooks: { loading: "Loading hooks…" },
  // codex settings.mcp.empty - fixes the generic builder's lowercased "mcp" acronym.
  mcp: { empty: "No MCP servers connected" },
};

function panelMessage(panel: CommandPanelKind, status: CommandPanelStatus, error?: string): string {
  if (status === "error") return error || `${panelTitle(panel)} failed.`;
  const override = PANEL_MESSAGE_OVERRIDES[panel];
  if (status === "loading") return override?.loading ?? `Loading ${panelTitle(panel)}…`;
  // codex command-panel empties have no trailing period (e.g. `No apps found`,
  // `No skills found`) - match that convention for every panel's generic empty.
  if (status === "empty") return override?.empty ?? `No ${panelTitle(panel).toLowerCase()} found`;
  return "";
}
