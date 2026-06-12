import {
  ArrowLeft,
  Loader2,
  X,
} from "lucide-react";
import { useEffect, useMemo, useState, type KeyboardEvent as ReactKeyboardEvent } from "react";
import { CommandPanelEntryList } from "./command-panel-entry-list";
import {
  CommandPanelChatCreateEmptyState,
  filterCommandEntries,
  panelIcon,
} from "./command-panel-shell";
import { useHiCodexIntl } from "./i18n-provider";
import {
  commandPanelChatCreateEntry,
  commandPanelHandleEscape,
  commandPanelHasSearchInput,
  commandPanelShouldShowChatCreateEmptyState,
  commandPanelSubModeFromPanel,
  commandPanelSubModePlaceholder,
  type CommandPanelEntry,
  type CommandPanelEntryAction,
  type CommandPanelState,
} from "../state/command-panel";

export { CommandPanelEntryList } from "./command-panel-entry-list";

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
