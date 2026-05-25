import { ArrowLeft, ArrowRight, PanelLeftClose, PanelLeftOpen, PanelRightClose, PanelRightOpen } from "lucide-react";
import type { Thread } from "@hicodex/codex-protocol";
// codex: electron-menu-shortcuts-DQYPVyfu.js — Codex header buttons surface
// the accelerator in their tooltip. HiCodex mirrors that on sidebar toggle.
import { COMMAND_IDS, descriptorAcceleratorLabel } from "../state/commands";

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
  /*
   * codex: app-shell-Bh-lgoQk.js#cn — sidebar trigger group renders
   * navigateBack / navigateForward arrow buttons next to the sidebar toggle.
   * Codex reads `on` / `sn` history atoms (`canGoBack` / `canGoForward`) to
   * compute disabled state. HiCodex passes through the same booleans from
   * `state.threadHistoryStack` + `state.threadHistoryIndex`.
   */
  canNavigateBack?: boolean;
  canNavigateForward?: boolean;
  onNavigateBack?: () => void;
  onNavigateForward?: () => void;
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
  canNavigateBack = false,
  canNavigateForward = false,
  onNavigateBack,
  onNavigateForward,
}: ConversationChromeProps) {
  const displayTitle = title.replace(/\s+/g, " ").trim() || (activeThread ? "Untitled chat" : "New chat");
  const sidebarLabel = sidebarOpen ? "Hide sidebar" : "Show sidebar";
  // codex: electron-menu-shortcuts-DQYPVyfu.js#toggleSidebar — ⌘B hint in tooltip.
  const sidebarAccelerator = descriptorAcceleratorLabel(COMMAND_IDS.toggleSidebar);
  const sidebarTitle = sidebarAccelerator ? `Toggle sidebar (${sidebarAccelerator})` : "Toggle sidebar";
  // codex: electron-menu-shortcuts-DQYPVyfu.js#navigateBack / #navigateForward — ⌘[/] hints.
  const backAccelerator = descriptorAcceleratorLabel(COMMAND_IDS.navigateBack);
  const forwardAccelerator = descriptorAcceleratorLabel(COMMAND_IDS.navigateForward);
  const backTitle = backAccelerator ? `Back (${backAccelerator})` : "Back";
  const forwardTitle = forwardAccelerator ? `Forward (${forwardAccelerator})` : "Forward";
  const SidebarIcon = sidebarOpen ? PanelLeftClose : PanelLeftOpen;
  const showRightRailToggle = rightRailToggleAvailable
    && canPinRightRail
    && Boolean(onToggleRightRailPinned);
  const RightRailIcon = rightRailPinned ? PanelRightClose : PanelRightOpen;
  const showNavButtons = Boolean(onNavigateBack) || Boolean(onNavigateForward);
  return (
    <header className="hc-topbar">
      <div className="hc-topbar-main">
        {onToggleSidebar && (
          <button
            type="button"
            className="hc-sidebar-trigger"
            aria-controls="hc-sidebar"
            aria-label={sidebarLabel}
            title={sidebarTitle}
            onClick={onToggleSidebar}
          >
            <SidebarIcon size={16} aria-hidden="true" />
          </button>
        )}
        {showNavButtons && (
          // codex: app-shell-Bh-lgoQk.js#cn — back/forward arrows in sidebar trigger group.
          <div className="hc-topbar-nav-group" role="group" aria-label="Navigation history">
            <button
              type="button"
              className="hc-topbar-nav-button"
              aria-label={backTitle}
              title={backTitle}
              disabled={!canNavigateBack || !onNavigateBack}
              onClick={onNavigateBack}
            >
              <ArrowLeft size={14} aria-hidden="true" />
            </button>
            <button
              type="button"
              className="hc-topbar-nav-button"
              aria-label={forwardTitle}
              title={forwardTitle}
              disabled={!canNavigateForward || !onNavigateForward}
              onClick={onNavigateForward}
            >
              <ArrowRight size={14} aria-hidden="true" />
            </button>
          </div>
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
