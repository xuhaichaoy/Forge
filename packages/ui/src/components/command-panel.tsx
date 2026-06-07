import {
  ArrowLeft,
  Bell,
  Boxes,
  CheckCircle2,
  Download,
  Edit3,
  ExternalLink,
  FileText,
  LogIn,
  Loader2,
  Monitor,
  Moon,
  Power,
  PowerOff,
  RefreshCw,
  Server,
  Sun,
  TerminalSquare,
  Trash2,
  Wrench,
  X,
} from "lucide-react";
import { useEffect, useMemo, useState, type KeyboardEvent as ReactKeyboardEvent } from "react";
import { useHiCodexIntl } from "./i18n-provider";
import {
  commandPanelChatCreateEntry,
  commandPanelHandleEscape,
  commandPanelHasSearchInput,
  commandPanelShouldShowChatCreateEmptyState,
  commandPanelSubModeFromPanel,
  commandPanelSubModePlaceholder,
  groupCommandPanelEntries,
  groupCommandPanelEntriesForRendering,
  type CommandPanelEntry,
  type CommandPanelEntryAction,
  type CommandPanelState,
  type CommandPanelSubMode,
} from "../state/command-panel";
// codex: app-main-DG-Mf4Wj.js — cmdk Ym.Item right-side shortcut.
// Used by CommandPanelRow to resolve the trailing <kbd> hint when the entry
// does not carry a pre-baked acceleratorLabel (callers in HiCodexApp emit
// raw entry IDs and let the panel derive the label).
import { commandPanelEntryAcceleratorLabel } from "../state/commands";

export interface CommandPanelProps {
  panel: CommandPanelState;
  onClose: () => void;
  onSelectEntry?: (entry: CommandPanelEntry) => void;
  onSelectAction?: (action: CommandPanelEntryAction, entry: CommandPanelEntry) => void;
  onSearchQueryChange?: (query: string) => void;
}

export function CommandPanel({ panel, onClose, onSelectEntry, onSelectAction, onSearchQueryChange }: CommandPanelProps) {
  const { formatMessage } = useHiCodexIntl();
  const [query, setQuery] = useState("");
  const visibleEntries = useMemo(
    () => panel.panel === "files" ? panel.entries : filterCommandEntries(panel.entries, query),
    [panel.entries, panel.panel, query],
  );
  const showSearchInput = commandPanelHasSearchInput(panel);
  const showChatCreateEmptyState = commandPanelShouldShowChatCreateEmptyState(panel, query);
  // codex: app-main-DG-Mf4Wj.js — cmdk Hd atom (root/chats/files). The
  // CommandPanel is the sole consumer; we derive the sub-mode from the live
  // panel state so existing call sites (openChatSearchPanel / openFileSearchPanel)
  // automatically participate without touching their factories.
  const subMode = commandPanelSubModeFromPanel(panel);
  useEffect(() => {
    setQuery("");
  }, [panel.panel, panel.title]);
  // codex: app-main-DG-Mf4Wj.js — Esc XD(t),t.set(eu,!1) 两段式。First Esc
  // clears the active query / drops out of a sub-mode (Codex closes any
  // active list filter and returns to root). Second Esc closes the dialog.
  // Implemented as a key handler on the dialog so it intercepts before the
  // host-level Esc listeners (e.g. thread find bar) react.
  const handleDialogKeyDown = (event: ReactKeyboardEvent<HTMLElement>) => {
    if (event.key !== "Escape") return;
    const result = commandPanelHandleEscape({ subMode, query });
    event.preventDefault();
    event.stopPropagation();
    if (result.shouldClose) {
      onClose();
      return;
    }
    if (result.clearQuery) {
      setQuery("");
      onSearchQueryChange?.("");
    }
    // Returning to root is implicit when sub-mode is derived from panel
    // state: callers like searchChats/searchFiles install a sub-mode panel,
    // and Codex (`searchChats:close`/`searchFiles:close` in app-main) flips
    // Hd back to root by re-opening the root command menu. We surface the
    // intent via onSelectAction({ type: "runSlashCommand" }) callers if
    // needed; the immediate clear above is enough to match the visible
    // first-Esc behavior.
  };
  return (
    <div className="hc-settings-backdrop" role="presentation" onMouseDown={onClose}>
      <section
        className="hc-command-panel"
        role="dialog"
        data-state="open"
        aria-modal="true"
        aria-label={panel.title}
        onMouseDown={(event) => event.stopPropagation()}
        onKeyDown={handleDialogKeyDown}
      >
        <header>
          <div>
            {subMode !== "root" && (
              // codex: app-main-DG-Mf4Wj.js — back affordance for sub-mode
              // panels (chats/files). Clicking it asks the host to drop the
              // sub-mode panel; the host typically closes the panel so the
              // user can reopen the root command menu via ⌘K.
              <button
                aria-label="Back to command menu"
                className="hc-icon-button"
                type="button"
                onClick={(event) => {
                  event.stopPropagation();
                  onClose();
                }}
              >
                <ArrowLeft size={16} />
              </button>
            )}
            {panelIcon(panel.panel)}
            <span>{panel.title}</span>
          </div>
          <button className="hc-icon-button" type="button" onClick={onClose} aria-label="Close command panel">
            <X size={16} />
          </button>
        </header>

        {panel.message && (
          <div className="hc-command-panel-message" data-status={panel.status}>
            {panel.status === "loading" && <Loader2 className="hc-spin" size={14} />}
            <span>{panel.message}</span>
          </div>
        )}

        {showSearchInput && (
          <label className="hc-command-panel-search">
            <span>{formatMessage({ id: "hc.sidebar.search", defaultMessage: "Search" })}</span>
            <input
              autoFocus
              placeholder={commandPanelSubModePlaceholder(subMode, formatMessage)}
              value={query}
              onChange={(event) => {
                const nextQuery = event.target.value;
                setQuery(nextQuery);
                onSearchQueryChange?.(nextQuery);
              }}
            />
          </label>
        )}

        {panel.entries.length > 0 && visibleEntries.length === 0 && (
          <div className="hc-command-panel-message" data-status="empty">
            <span>{panel.panel === "files" ? formatMessage({ id: "thread.fileTreePanel.noMatchingFiles", defaultMessage: "No matching files" }) : formatMessage({ id: "codex.commandMenu.noResults", defaultMessage: "No matches" })}</span>
          </div>
        )}

        {showChatCreateEmptyState && (
          <CommandPanelChatCreateEmptyState
            onCreate={() => onSelectEntry?.(commandPanelChatCreateEntry())}
          />
        )}

        <CommandPanelEntryList
          entries={visibleEntries}
          onSelectAction={onSelectAction}
          onSelectEntry={onSelectEntry}
          subMode={subMode}
        />
      </section>
    </div>
  );
}

function CommandPanelChatCreateEmptyState({ onCreate }: { onCreate?: () => void }) {
  const { formatMessage } = useHiCodexIntl();
  return (
    <div className="hc-command-panel-chat-empty" data-command-menu-empty-state="true">
      <span>{formatMessage({ id: "codex.commandMenu.noChatsEmptyState", defaultMessage: "Create a chat to get started!" })}</span>
      <button
        type="button"
        onClick={(event) => {
          event.stopPropagation();
          onCreate?.();
        }}
      >
        {formatMessage({ id: "codex.commandMenu.createChat", defaultMessage: "Create chat" })}
      </button>
    </div>
  );
}

function filterCommandEntries(entries: CommandPanelEntry[], query: string): CommandPanelEntry[] {
  const normalized = query.trim().toLowerCase();
  if (!normalized) return entries;
  return entries.filter((entry) => commandEntrySearchText(entry).includes(normalized));
}

function commandEntrySearchText(entry: CommandPanelEntry): string {
  return [
    entry.title,
    entry.meta,
    entry.status,
    ...(entry.details ?? []),
  ].filter(Boolean).join("\n").toLowerCase();
}

export function CommandPanelEntryList({
  entries,
  onSelectEntry,
  onSelectAction,
  showSections = true,
  subMode = "root",
}: {
  entries: CommandPanelEntry[];
  onSelectEntry?: (entry: CommandPanelEntry) => void;
  onSelectAction?: (action: CommandPanelEntryAction, entry: CommandPanelEntry) => void;
  showSections?: boolean;
  subMode?: CommandPanelSubMode;
}) {
  const { formatMessage } = useHiCodexIntl();
  if (entries.length === 0) return null;
  // codex: app-main-DG-Mf4Wj.js — chats / files sub-modes only render their
  // flat result list; section headings (Thread / Panels / ...) are gated on
  // the root command menu, matching Codex's cmdk Hd atom behavior.
  if (subMode !== "root") {
    return (
      <div className="hc-command-panel-list">
        <CommandPanelGroupedEntries
          entries={entries}
          onSelectAction={onSelectAction}
          onSelectEntry={onSelectEntry}
        />
      </div>
    );
  }
  if (!showSections) {
    return (
      <div className="hc-command-panel-list">
        <CommandPanelGroupedEntries
          entries={entries}
          onSelectAction={onSelectAction}
          onSelectEntry={onSelectEntry}
        />
      </div>
    );
  }
  // codex: app-main-DG-Mf4Wj.js — command menu top-level taxonomy. Section
  // titles come from GROUP_TITLE_ORDER inside groupCommandPanelEntries; the
  // existing per-entry group headers (Pinned chats / Recent chats) are
  // emitted inside each section by groupCommandPanelEntriesForRendering.
  const sections = groupCommandPanelEntries(entries, formatMessage);
  return (
    <div className="hc-command-panel-list">
      {sections.map((section) => (
        <div className="hc-command-panel-section" key={`section:${section.groupKey}`}>
          {section.groupKey !== "other" && (
            <div className="hc-command-panel-section-title" role="presentation">
              <span>{section.title}</span>
            </div>
          )}
          <CommandPanelGroupedEntries
            entries={section.entries}
            onSelectAction={onSelectAction}
            onSelectEntry={onSelectEntry}
          />
        </div>
      ))}
    </div>
  );
}

function CommandPanelGroupedEntries({
  entries,
  onSelectEntry,
  onSelectAction,
}: {
  entries: CommandPanelEntry[];
  onSelectEntry?: (entry: CommandPanelEntry) => void;
  onSelectAction?: (action: CommandPanelEntryAction, entry: CommandPanelEntry) => void;
}) {
  const renderedItems = groupCommandPanelEntriesForRendering(entries);
  return (
    <>
      {renderedItems.map((item) => item.type === "group" ? (
        <div className="hc-command-panel-group" key={item.key} role="presentation">
          {item.label}
        </div>
      ) : (
        <CommandPanelRow
          entry={item.entry}
          key={item.key}
          onSelectAction={onSelectAction}
          onSelectEntry={onSelectEntry}
        />
      ))}
    </>
  );
}

function CommandPanelRow({
  entry,
  onSelectEntry,
  onSelectAction,
}: {
  entry: CommandPanelEntry;
  onSelectEntry?: (entry: CommandPanelEntry) => void;
  onSelectAction?: (action: CommandPanelEntryAction, entry: CommandPanelEntry) => void;
}) {
  const actionable = Boolean(entry.action && !entry.disabled && onSelectEntry);
  // codex: app-main-DG-Mf4Wj.js — cmdk Ym.Item right-side shortcut. Prefer a
  // caller-supplied label; otherwise derive it from the entry id so existing
  // call sites (slashCommandEntries / commandMenuEntries) automatically
  // surface accelerators for known shortcuts without changes.
  const acceleratorLabel = entry.acceleratorLabel ?? commandPanelEntryAcceleratorLabel(entry.id);
  const content = (
    <>
      <div className="hc-command-panel-row-main">
        <div>
          <h3>{entry.title}</h3>
          {entry.meta && <p>{entry.meta}</p>}
        </div>
        <div className="hc-command-panel-row-trailing">
          {entry.status && <span className="hc-command-status">{entry.status}</span>}
          {acceleratorLabel && (
            // codex: app-main-DG-Mf4Wj.js — cmdk Ym.Item right-side shortcut.
            // Trailing keyboard hint mirrors Codex's command palette layout
            // (status pill / kbd / secondary action stack share the trailing
            // flex column). Aria-hidden because the host already exposes the
            // shortcut via the command registry and macOS VoiceOver reads
            // the unicode glyphs awkwardly.
            <kbd className="hc-command-panel-row-accelerator" aria-hidden="true">
              {acceleratorLabel}
            </kbd>
          )}
          {entry.secondaryActions && entry.secondaryActions.length > 0 && (
            <div className="hc-command-secondary-actions">
              {entry.secondaryActions.map((secondary) => (
                <button
                  aria-label={secondary.title ?? secondary.label}
                  className="hc-command-secondary-action"
                  data-tone={secondary.tone ?? "default"}
                  key={secondary.id}
                  title={secondary.title}
                  type="button"
                  onClick={(event) => {
                    event.stopPropagation();
                    onSelectAction?.(secondary.action, entry);
                  }}
                  onKeyDown={(event) => event.stopPropagation()}
                >
                  {secondaryActionIcon(secondary.action)}
                  <span>{secondary.label}</span>
                </button>
              ))}
            </div>
          )}
        </div>
      </div>
      {entry.details && entry.details.length > 0 && (
        <ul className="hc-command-details">
          {entry.details.slice(0, 8).map((detail) => (
            <li key={detail}>{detail}</li>
          ))}
        </ul>
      )}
    </>
  );
  if (actionable) {
    return (
      <article
        className="hc-command-panel-row"
        data-actionable="true"
        data-disabled="false"
        role="button"
        tabIndex={0}
        onClick={() => onSelectEntry?.(entry)}
        onKeyDown={(event) => {
          if (event.key !== "Enter" && event.key !== " ") return;
          event.preventDefault();
          onSelectEntry?.(entry);
        }}
      >
        {content}
      </article>
    );
  }
  return (
    <article className="hc-command-panel-row" data-actionable="false" data-disabled={entry.disabled ? "true" : "false"}>
      {content}
    </article>
  );
}

function secondaryActionIcon(action: CommandPanelEntryAction) {
  if (action.type === "writeSkillConfig") {
    return action.enabled ? <Power size={13} /> : <PowerOff size={13} />;
  }
  if (action.type === "readSkillFile") {
    return <FileText size={13} />;
  }
  if (action.type === "reloadMcpServers") {
    return <RefreshCw size={13} />;
  }
  if (action.type === "loginMcpServer") {
    return <LogIn size={13} />;
  }
  if (action.type === "openMcpServerForm") {
    return <Edit3 size={13} />;
  }
  if (action.type === "removeMcpServer") {
    return <Trash2 size={13} />;
  }
  if (action.type === "writeAppConfig" || action.type === "writePluginConfig") {
    return action.enabled ? <Power size={13} /> : <PowerOff size={13} />;
  }
  if (action.type === "setThreadMemoryMode") {
    return action.mode === "enabled" ? <Power size={13} /> : <PowerOff size={13} />;
  }
  if (action.type === "setUiTheme") {
    if (action.mode === "dark") return <Moon size={13} />;
    if (action.mode === "light") return <Sun size={13} />;
    return <Monitor size={13} />;
  }
  if (action.type === "setNotificationPreferences") {
    return <Bell size={13} />;
  }
  if (action.type === "installPlugin") {
    return <Download size={13} />;
  }
  if (action.type === "uninstallPlugin") {
    return <Trash2 size={13} />;
  }
  if (action.type === "openExternalUrl") {
    return <ExternalLink size={13} />;
  }
  if (action.type === "openBrowserRuntime") {
    return <Monitor size={13} />;
  }
  if (action.type === "openComputerUseSetup") {
    return <ExternalLink size={13} />;
  }
  if (action.type === "probeComputerUseMcp") {
    return <CheckCircle2 size={13} />;
  }
  if (action.type === "repairComputerUseBundle") {
    return <Wrench size={13} />;
  }
  if (action.type === "connectRequiredApp") {
    return <ExternalLink size={13} />;
  }
  if (action.type === "copyText") {
    return <FileText size={13} />;
  }
  if (action.type === "openFileSearch") {
    return <FileText size={13} />;
  }
  return null;
}

function panelIcon(panel: CommandPanelState["panel"]) {
  switch (panel) {
    case "mcp":
      return <Server size={17} />;
    case "plugins":
    case "skills":
    case "apps":
      return <Boxes size={17} />;
    case "status":
      return <CheckCircle2 size={17} />;
    case "theme":
      return <Sun size={17} />;
    case "files":
      return <FileText size={17} />;
    default:
      return <TerminalSquare size={17} />;
  }
}
