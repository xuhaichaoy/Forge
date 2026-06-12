import {
  ChevronDown,
  ChevronRight,
  Clock,
  Folder,
  Loader2,
  MessageSquarePlus,
  Pin,
  Plug,
  Search,
  Settings,
} from "lucide-react";
import type { Thread } from "@hicodex/codex-protocol";
import { useHiCodexIntl } from "./i18n-provider";
import type { AccountViewModel } from "../state/account-state";
import {
  type SidebarOrganizeMode,
  type SidebarSortKey,
  type SidebarThreadGroup,
} from "../state/sidebar-projection";
import { threadTitle } from "../state/thread-workflow";
// codex: electron-menu-shortcuts-*.js — sidebar nav entries surface
// the accelerator next to the label (matches Desktop tooltip + menu format).
import { COMMAND_IDS, descriptorAcceleratorLabel } from "../state/commands";
import { SidebarAccountSummary } from "./sidebar-account-summary";
import { SidebarNavItem } from "./sidebar-nav-item";
import {
  SidebarProjectSection,
} from "./sidebar-project-section";
import {
  SidebarThreadRow,
} from "./sidebar-thread-row";
import { useSidebarInteractions } from "./sidebar-interactions";
import { SidebarUpdateBadge } from "./sidebar-update-badge";
import { SidebarUsageAlert } from "./sidebar-usage-alert";

export { sidebarContextMenuPosition } from "./sidebar-thread-row";

export interface SidebarProps {
  threads: Thread[];
  activeThreadId: string | null;
  // codex sidebar-thread-section `ht` — the active thread's linked-worktree status;
  // swaps the fork label to "Fork into same worktree" (forking reuses the worktree).
  activeThreadIsWorktree?: boolean;
  connected: boolean;
  connecting: boolean;
  onConnect: () => void | Promise<void>;
  onCreateThread: () => void | Promise<void>;
  onOpenSearch: () => void | Promise<void>;
  onOpenPlugins?: () => void | Promise<void>;
  onOpenAutomations?: () => void | Promise<void>;
  onUseExistingFolder?: () => void | Promise<void>;
  onSelectThread: (thread: Thread) => void | Promise<void>;
  onForkThread: (thread: Thread) => void | Promise<void>;
  // codex sidebar-thread-section `fork-into-worktree` — fork into a fresh git worktree.
  onForkThreadIntoWorktree?: (thread: Thread) => void | Promise<void>;
  // codex threadHeader.openInNewWindow — open the thread in a second app window.
  onOpenThreadWindow?: (thread: Thread) => void | Promise<void>;
  onRenameThread: (thread: Thread) => void | Promise<void>;
  onArchiveThread: (thread: Thread) => void | Promise<void>;
  pinnedThreadIds?: ReadonlySet<string>;
  onToggleThreadPinned?: (thread: Thread, pinned: boolean) => void | Promise<void>;
  onMarkThreadUnread?: (thread: Thread) => void | Promise<void>;
  onOpenThreadFolder?: (thread: Thread) => void | Promise<void>;
  onCopyWorkingDirectory?: (thread: Thread) => void | Promise<void>;
  onCopySessionId?: (thread: Thread) => void | Promise<void>;
  onCopyDeeplink?: (thread: Thread) => void | Promise<void>;
  onOpenSettings: () => void;
  /** "light" | "dark" — the currently applied theme; used to pick the toggle icon. */
  resolvedUiTheme?: "light" | "dark";
  accountView?: AccountViewModel | null;
  onSignOut?: () => void | Promise<void>;
  sortKey?: SidebarSortKey;
  onSortKeyChange?: (sortKey: SidebarSortKey) => void;
  organizeMode?: SidebarOrganizeMode;
  currentWorkspaceRoot?: string | null;
  /**
   * Workspace roots the user has selected; surfaced so freshly-picked folders
   * appear as empty Project groups before the first thread is created
   * (Codex Desktop sidebar-project-groups-*.js project-grouping parity).
   */
  selectedWorkspaceRoots?: string[];
  onOrganizeModeChange?: (organizeMode: SidebarOrganizeMode) => void;
  collapsedGroupKeys?: ReadonlySet<string>;
  onCollapsedGroupKeysChange?: (collapsedGroupKeys: string[]) => void;
  getThreadTitle?: (thread: Thread) => string;
  /**
   * Update banner state. When set, sidebar shows a small "Update v0.1.1"
   * button at the top. Click → onApplyUpdate(). Cleared by parent when
   * download starts / completes / errors.
   */
  updateAvailable?: {
    version: string;
    progress?: number | null;     // 0-1 during download; null when idle
    error?: string | null;
  } | null;
  onApplyUpdate?: () => void | Promise<void>;
}

export function Sidebar({
  threads,
  activeThreadId,
  activeThreadIsWorktree = false,
  connected,
  connecting,
  onConnect,
  onCreateThread,
  onOpenSearch,
  onOpenPlugins,
  onOpenAutomations,
  onUseExistingFolder,
  onSelectThread,
  onForkThread,
  onForkThreadIntoWorktree,
  onOpenThreadWindow,
  onRenameThread,
  onArchiveThread,
  pinnedThreadIds,
  onToggleThreadPinned,
  onMarkThreadUnread,
  onOpenThreadFolder,
  onCopyWorkingDirectory,
  onCopySessionId,
  onCopyDeeplink,
  onOpenSettings,
  resolvedUiTheme,
  accountView,
  onSignOut,
  sortKey = "updated_at",
  onSortKeyChange,
  organizeMode,
  currentWorkspaceRoot,
  selectedWorkspaceRoots,
  onOrganizeModeChange,
  collapsedGroupKeys,
  onCollapsedGroupKeysChange,
  getThreadTitle = threadTitle,
  updateAvailable,
  onApplyUpdate,
}: SidebarProps) {
  const { formatMessage } = useHiCodexIntl();
  // codex renders TWO peer sidebar sections in the order ND = ['threads','chats']
  // (app-main bundle): the per-project "Projects" section FIRST, then the
  // projectless "Chats" section BELOW. Projectless threads are excluded from the
  // project groups and listed flat under "Chats".
  const {
    chatsThreads,
    closeThreadMenu,
    openContextMenu,
    requestArchiveConfirmation,
    clearArchiveConfirmation,
    clearAnyArchiveConfirmation,
    chooseOrganizeMode,
    chooseSortKey,
    confirmingArchiveThreadId,
    dismissUsageAlert,
    dismissedUsageAlertKeys,
    effectiveCollapsedGroupKeys,
    effectiveOrganizeMode,
    openSectionMenu,
    openThreadMenu,
    pinnedThreads,
    projectGroups,
    runSectionCollapseAction,
    sectionActionsRef,
    sectionCollapseAction,
    threadMenuRef,
    toggleGroup,
    toggleSectionMenu,
    closeSectionMenu,
  } = useSidebarInteractions({
    collapsedGroupKeys,
    onCollapsedGroupKeysChange,
    onOrganizeModeChange,
    onSortKeyChange,
    organizeMode,
    pinnedThreadIds,
    selectedWorkspaceRoots,
    threads,
    currentWorkspaceRoot,
    usageAlertKey: accountView?.usageAlert?.dismissalKey ?? null,
  });
  const pinnedGroupKey = "pinned";
  const pinnedGroupCollapsed = effectiveCollapsedGroupKeys.has(pinnedGroupKey);
  // codex project section header (sidebarElectron.projectsNavLink → "Projects" /
  // "项目"); the chronological ("recent") mode reuses the "Chats" label for its
  // single flat group. The standalone Chats section header below uses recentChats.
  const sectionLabel =
    effectiveOrganizeMode === "recent"
      ? formatMessage({ id: "sidebarElectron.recentChats", defaultMessage: "Chats" })
      : formatMessage({ id: "sidebarElectron.projectsNavLink", defaultMessage: "Projects" });
  // codex scopes the Projects "collapse all" + the section collapse state to the
  // per-project groups only; the flat Chats list is not part of it.
  const showProjectSection = projectGroups.length > 0 || Boolean(onUseExistingFolder);
  const usageAlert = accountView?.usageAlert ?? null;
  const showUsageAlert = usageAlert != null && !dismissedUsageAlertKeys.has(usageAlert.dismissalKey);

  const useExistingFolder = () => {
    closeSectionMenu();
    void onUseExistingFolder?.();
  };

  const signOut = () => {
    if (!accountView?.signedIn || accountView.signOutAction.disabled) return;
    void onSignOut?.();
  };

  const renderThreadRows = (rows: Thread[]) => rows.map((thread) => (
    <SidebarThreadRow
      activeThreadIsWorktree={activeThreadIsWorktree}
      isActive={thread.id === activeThreadId}
      isConfirmingArchive={confirmingArchiveThreadId === thread.id}
      isPinned={pinnedThreadIds?.has(thread.id) ?? false}
      key={thread.id}
      menuState={openThreadMenu}
      menuRef={threadMenuRef}
      onArchiveThread={onArchiveThread}
      onClearAnyArchiveConfirmation={clearAnyArchiveConfirmation}
      onClearArchiveConfirmation={clearArchiveConfirmation}
      onCloseThreadMenu={closeThreadMenu}
      onContextMenu={openContextMenu}
      onCopyDeeplink={onCopyDeeplink}
      onCopySessionId={onCopySessionId}
      onCopyWorkingDirectory={onCopyWorkingDirectory}
      onForkThread={onForkThread}
      onForkThreadIntoWorktree={onForkThreadIntoWorktree}
      onMarkThreadUnread={onMarkThreadUnread}
      onOpenThreadFolder={onOpenThreadFolder}
      onOpenThreadWindow={onOpenThreadWindow}
      onRenameThread={onRenameThread}
      onRequestArchiveConfirmation={requestArchiveConfirmation}
      onSelectThread={onSelectThread}
      onToggleThreadPinned={onToggleThreadPinned}
      thread={thread}
      title={getThreadTitle(thread)}
    />
  ));

  // codex per-project sidebar group row: folder glyph + project name, collapsible.
  // (The projectless "Chats" section is rendered separately as a flat list below
  // the Projects section — see the render body — not through this helper.)
  const renderThreadGroup = (group: SidebarThreadGroup) => {
    const collapsed = effectiveCollapsedGroupKeys.has(group.key);
    return (
      <div className="hc-thread-group" key={group.key}>
        <button
          className="hc-project-row"
          type="button"
          aria-expanded={!collapsed}
          onClick={() => toggleGroup(group.key)}
          title={group.path ?? group.label}
        >
          {collapsed ? <ChevronRight size={14} className="hc-sidebar-group-chevron" /> : <ChevronDown size={14} className="hc-sidebar-group-chevron" />}
          <Folder size={16} />
          <span className="hc-project-name">{
            group.key === "recent"
              ? formatMessage({ id: "sidebarElectron.recentThreads", defaultMessage: group.label })
              : group.label === "Local"
                ? formatMessage({ id: "sidebarElectron.connectionGroup.local", defaultMessage: "Local" })
                : group.label
          }</span>
        </button>
        {!collapsed && group.threads.length === 0 && (
          <div className="hc-empty-group">{formatMessage({ id: "hc.sidebar.noChats", defaultMessage: "No chats" })}</div>
        )}
        {!collapsed && renderThreadRows(group.threads)}
      </div>
    );
  };

  return (
    <aside className="hc-sidebar" id="hc-sidebar">
      <SidebarUpdateBadge
        formatMessage={formatMessage}
        onApplyUpdate={onApplyUpdate}
        updateAvailable={updateAvailable}
      />
      <div className="hc-sidebar-nav">
        {/* codex: electron-menu-shortcuts-*.js (newThread / searchChats) — */}
        {/* sidebar nav entries surface their command accelerator alongside the label. */}
        <SidebarNavItem
          icon={connecting ? <Loader2 className="hc-spin" size={16} /> : <MessageSquarePlus size={16} />}
          label={connected ? formatMessage({ id: "hc.sidebar.newChat", defaultMessage: "New chat" }) : formatMessage({ id: "hc.sidebar.connect", defaultMessage: "Connect" })}
          accelerator={connected ? descriptorAcceleratorLabel(COMMAND_IDS.newThread) : null}
          onClick={() => void (connected ? onCreateThread() : onConnect())}
          disabled={connecting}
        />
        <SidebarNavItem
          icon={<Search size={16} />}
          label={formatMessage({ id: "hc.sidebar.search", defaultMessage: "Search" })}
          accelerator={descriptorAcceleratorLabel(COMMAND_IDS.searchChats)}
          onClick={() => void onOpenSearch()}
        />
        <SidebarNavItem
          icon={<Plug size={16} />}
          label={formatMessage({ id: "hc.sidebar.plugins", defaultMessage: "Plugins" })}
          onClick={() => void onOpenPlugins?.()}
          disabled={!onOpenPlugins}
        />
        {onOpenAutomations && (
          <SidebarNavItem
            icon={<Clock size={16} />}
            label={formatMessage({ id: "hc.sidebar.automations", defaultMessage: "Automations" })}
            onClick={() => void onOpenAutomations()}
          />
        )}
      </div>

      {showUsageAlert && usageAlert && (
        <SidebarUsageAlert
          alert={usageAlert}
          onDismiss={dismissUsageAlert}
        />
      )}

      <div className="hc-thread-list">
        {pinnedThreads.length > 0 && (
          <div className="hc-thread-group hc-thread-pinned-group">
            <button
              className="hc-project-row"
              type="button"
              aria-expanded={!pinnedGroupCollapsed}
              onClick={() => toggleGroup(pinnedGroupKey)}
              title={formatMessage({ id: "sidebarElectron.pinnedThreads", defaultMessage: "Pinned" })}
            >
              {pinnedGroupCollapsed ? <ChevronRight size={14} className="hc-sidebar-group-chevron" /> : <ChevronDown size={14} className="hc-sidebar-group-chevron" />}
              <Pin size={16} />
              <span className="hc-project-name">{formatMessage({ id: "sidebarElectron.pinnedThreads", defaultMessage: "Pinned" })}</span>
            </button>
            {!pinnedGroupCollapsed && renderThreadRows(pinnedThreads)}
          </div>
        )}
        {pinnedThreads.length === 0 && projectGroups.length === 0 && chatsThreads.length === 0 && (
          <div className="hc-empty-panel">{formatMessage({ id: "sidebarElectron.noRecentChats", defaultMessage: "No chats" })}</div>
        )}
        {showProjectSection && (
          <SidebarProjectSection
            canUseExistingFolder={Boolean(onUseExistingFolder)}
            openSectionMenu={openSectionMenu}
            organizeMode={effectiveOrganizeMode}
            sectionActionsRef={sectionActionsRef}
            sectionCollapseAction={sectionCollapseAction}
            sectionLabel={sectionLabel}
            sortKey={sortKey}
            onChooseOrganizeMode={chooseOrganizeMode}
            onChooseSortKey={chooseSortKey}
            onRunSectionCollapseAction={runSectionCollapseAction}
            onToggleSectionMenu={toggleSectionMenu}
            onUseExistingFolder={useExistingFolder}
          >
            {projectGroups.map(renderThreadGroup)}
          </SidebarProjectSection>
        )}
        {chatsThreads.length > 0 && (
          <>
            {/* codex 'chats' section (default order ND = ['threads','chats']): a peer
                section BELOW Projects that lists every projectless thread FLAT — never
                as a per-cwd "new-chat" project folder. Header uses recentChats; the
                section toggle carries no leading glyph in Codex Desktop. */}
            <div className="hc-thread-section-header">
              <div className="hc-thread-section-label">{formatMessage({ id: "sidebarElectron.recentChats", defaultMessage: "Chats" })}</div>
            </div>
            <div className="hc-thread-group">
              {renderThreadRows(chatsThreads)}
            </div>
          </>
        )}
      </div>

      {/*
       * codex profile footer (app-main-c6M_ecgT `lp` in the `Uh` profile dropdown): a
       * SINGLE row = avatar + "Settings" label, opening a dropdown that holds the
       * account info + Settings + sign-out. No separate theme-toggle row (theme lives
       * in Settings → Appearance) and no separate Settings row (merged into the
       * dropdown). When signed out we keep a plain Settings row so settings stays
       * reachable.
       */}
      <div className="hc-sidebar-footer">
        {accountView ? (
          <SidebarAccountSummary
            accountView={accountView}
            resolvedUiTheme={resolvedUiTheme ?? "light"}
            onSignOut={signOut}
            onOpenSettings={onOpenSettings}
          />
        ) : (
          <SidebarNavItem
            icon={<Settings size={16} />}
            label={formatMessage({ id: "hc.sidebar.settings", defaultMessage: "Settings" })}
            accelerator={descriptorAcceleratorLabel(COMMAND_IDS.settings)}
            onClick={onOpenSettings}
          />
        )}
      </div>
    </aside>
  );
}
