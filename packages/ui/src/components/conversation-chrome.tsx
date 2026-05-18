import { PanelLeftClose, PanelLeftOpen } from "lucide-react";
import type { Thread } from "@hicodex/codex-protocol";

export interface ConversationChromeProps {
  title: string;
  activeThread?: Thread | null;
  sidebarOpen?: boolean;
  onToggleSidebar?: () => void;
}

export function ConversationChrome({
  title,
  activeThread = null,
  sidebarOpen = true,
  onToggleSidebar,
}: ConversationChromeProps) {
  const displayTitle = title.replace(/\s+/g, " ").trim() || (activeThread ? "Untitled chat" : "New chat");
  const sidebarLabel = sidebarOpen ? "Hide sidebar" : "Show sidebar";
  const SidebarIcon = sidebarOpen ? PanelLeftClose : PanelLeftOpen;
  return (
    <header className="hc-topbar">
      <div className="hc-topbar-main">
        {onToggleSidebar && (
          <button
            type="button"
            className="hc-sidebar-trigger"
            aria-controls="hc-sidebar"
            aria-label={sidebarLabel}
            title="Toggle sidebar"
            onClick={onToggleSidebar}
          >
            <SidebarIcon size={16} aria-hidden="true" />
          </button>
        )}
        <div className="hc-top-title" title={displayTitle}>{displayTitle}</div>
      </div>
    </header>
  );
}
