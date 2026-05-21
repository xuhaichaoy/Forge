import { PanelLeftClose, PanelLeftOpen, PanelRightClose, PanelRightOpen } from "lucide-react";
import type { Thread } from "@hicodex/codex-protocol";

export interface ConversationChromeProps {
  title: string;
  activeThread?: Thread | null;
  sidebarOpen?: boolean;
  onToggleSidebar?: () => void;
  /*
   * Codex Desktop `an` (local-conversation-page-Bt6RhPKI.js byte ~3500):
   * header carries a `Toggle pinned summary` button at `order: 250`
   * (actionId `local-thread-summary-panel-toggle`), which flips
   * `isPinned`. Without this button HiCodex users have no way to re-show the
   * Summary Rail after pinning it off — Codex `cp` hides the rail entirely
   * when `isPinned` is false, so the pin toggle must live OUTSIDE the rail.
   *
   * When `rightRailToggleAvailable` is true and the viewport is non-overlay
   * (`canPinRightRail`), the button reflects pinned state. In overlay mode
   * (small viewport) Codex shows a separate `Toggle summary` button — HiCodex
   * leaves the rail hidden in that mode so the button is also hidden.
   */
  rightRailToggleAvailable?: boolean;
  rightRailPinned?: boolean;
  canPinRightRail?: boolean;
  onToggleRightRailPinned?: () => void;
}

export function ConversationChrome({
  title,
  activeThread = null,
  sidebarOpen = true,
  onToggleSidebar,
  rightRailToggleAvailable = false,
  rightRailPinned = false,
  canPinRightRail = false,
  onToggleRightRailPinned,
}: ConversationChromeProps) {
  const displayTitle = title.replace(/\s+/g, " ").trim() || (activeThread ? "Untitled chat" : "New chat");
  const sidebarLabel = sidebarOpen ? "Hide sidebar" : "Show sidebar";
  const SidebarIcon = sidebarOpen ? PanelLeftClose : PanelLeftOpen;
  const showRightRailToggle = rightRailToggleAvailable
    && canPinRightRail
    && Boolean(onToggleRightRailPinned);
  const RightRailIcon = rightRailPinned ? PanelRightClose : PanelRightOpen;
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
      {showRightRailToggle && (
        <div className="hc-topbar-actions">
          <button
            type="button"
            className="hc-rail-trigger"
            aria-pressed={rightRailPinned}
            aria-label="Toggle pinned summary"
            title="Toggle pinned summary"
            onClick={onToggleRightRailPinned}
          >
            <RightRailIcon size={16} aria-hidden="true" />
          </button>
        </div>
      )}
    </header>
  );
}
