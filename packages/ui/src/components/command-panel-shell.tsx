import {
  Boxes,
  CheckCircle2,
  FileText,
  Server,
  Sun,
  TerminalSquare,
} from "lucide-react";
import type { CommandPanelEntry, CommandPanelState } from "../state/command-panel";
import { useHiCodexIntl } from "./i18n-provider";

export function CommandPanelChatCreateEmptyState({ onCreate }: { onCreate?: () => void }) {
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

export function filterCommandEntries(entries: CommandPanelEntry[], query: string): CommandPanelEntry[] {
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

export function panelIcon(panel: CommandPanelState["panel"]) {
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
