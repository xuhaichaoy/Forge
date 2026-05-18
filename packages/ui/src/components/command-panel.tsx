import {
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
  X,
} from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import type { CommandPanelEntry, CommandPanelEntryAction, CommandPanelState } from "../state/command-panel";

export interface CommandPanelProps {
  panel: CommandPanelState;
  onClose: () => void;
  onSelectEntry?: (entry: CommandPanelEntry) => void;
  onSelectAction?: (action: CommandPanelEntryAction, entry: CommandPanelEntry) => void;
  onSearchQueryChange?: (query: string) => void;
}

export function CommandPanel({ panel, onClose, onSelectEntry, onSelectAction, onSearchQueryChange }: CommandPanelProps) {
  const [query, setQuery] = useState("");
  const visibleEntries = useMemo(
    () => panel.panel === "files" ? panel.entries : filterCommandEntries(panel.entries, query),
    [panel.entries, panel.panel, query],
  );
  const showSearchInput = panel.entries.length > 0 || panel.panel === "files";
  useEffect(() => {
    setQuery("");
  }, [panel.panel, panel.title]);
  return (
    <div className="hc-settings-backdrop" role="presentation" onMouseDown={onClose}>
      <section
        className="hc-command-panel"
        role="dialog"
        aria-modal="true"
        aria-label={panel.title}
        onMouseDown={(event) => event.stopPropagation()}
      >
        <header>
          <div>
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
            <span>Search</span>
            <input
              autoFocus
              placeholder={commandPanelSearchPlaceholder(panel)}
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
            <span>{panel.panel === "files" ? "No matching files." : "No matching commands or chats."}</span>
          </div>
        )}

        <CommandPanelEntryList
          entries={visibleEntries}
          onSelectAction={onSelectAction}
          onSelectEntry={onSelectEntry}
        />
      </section>
    </div>
  );
}

function commandPanelSearchPlaceholder(panel: CommandPanelState): string {
  if (panel.panel === "files") return "Search files";
  if (panel.title.toLowerCase().includes("chat")) return "Search chats";
  if (panel.title.toLowerCase().includes("command")) return "Search commands and chats";
  return "Search";
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
}: {
  entries: CommandPanelEntry[];
  onSelectEntry?: (entry: CommandPanelEntry) => void;
  onSelectAction?: (action: CommandPanelEntryAction, entry: CommandPanelEntry) => void;
}) {
  if (entries.length === 0) return null;
  return (
    <div className="hc-command-panel-list">
      {entries.map((entry) => (
        <CommandPanelRow
          entry={entry}
          key={entry.id}
          onSelectAction={onSelectAction}
          onSelectEntry={onSelectEntry}
        />
      ))}
    </div>
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
  const content = (
    <>
      <div className="hc-command-panel-row-main">
        <div>
          <h3>{entry.title}</h3>
          {entry.meta && <p>{entry.meta}</p>}
        </div>
        <div className="hc-command-panel-row-trailing">
          {entry.status && <span className="hc-command-status">{entry.status}</span>}
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
