import { createPortal } from "react-dom";
import {
  Archive,
  Calendar,
  Check,
  ChevronDown,
  ChevronRight,
  Clock,
  Folder,
  FolderPlus,
  Gauge,
  ListFilter,
  Loader2,
  LogOut,
  Maximize2,
  MessageSquarePlus,
  Minimize2,
  Pin,
  Plug,
  Search,
  Settings,
  X,
} from "lucide-react";
import { useCallback, useRef, useState, type MouseEvent, type ReactNode } from "react";
import type { Thread } from "@hicodex/codex-protocol";
import { useDismissibleLayer } from "../hooks/use-dismissible-layer";
import { useHiCodexIntl } from "./i18n-provider";
import {
  projectAccountMenuItems,
  type AccountMenuItem,
  type AccountUsageAlert,
  type AccountViewModel,
} from "../state/account-state";
import {
  compactWindowLabel,
  type RateLimitCompactSummary,
} from "../state/rate-limit-summary";
import {
  DEFAULT_SIDEBAR_ORGANIZE_MODE,
  projectSidebarThreadGroups,
  sidebarThreadHasVisibleStatus,
  sidebarThreadRelativeTime,
  sidebarThreadStatusState,
  splitSidebarThreadsByPinned,
  type SidebarOrganizeMode,
  type SidebarSortKey,
  type SidebarThreadStatusState,
} from "../state/sidebar-projection";
import { threadTitle } from "../state/thread-workflow";
// codex: electron-menu-shortcuts-*.js — sidebar nav entries surface
// the accelerator next to the label (matches Desktop tooltip + menu format).
import { COMMAND_IDS, descriptorAcceleratorLabel } from "../state/commands";
// codex sidebar-thread-section `gt(platform)` — the reveal label is platform-switched.
import { osRevealLabel } from "../state/command-registry";

const threadRowClass =
  "group relative flex h-token-nav-row cursor-interaction rounded-[var(--hc-radius-lg)] px-row-x py-row-y text-sm hover:bg-token-list-hover-background focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-[-2px] focus-visible:outline-[var(--vscode-focusBorder)]";
const threadRowActiveClass = "bg-token-list-hover-background";
const threadRowContentClass =
  "flex min-w-0 flex-1 self-stretch items-center gap-2 text-base leading-5 text-token-foreground";
const threadActionGroupClass =
  "hc-thread-actions flex items-center gap-0 opacity-0 group-hover:opacity-100 group-focus-within:opacity-100";
const threadArchiveActionClass =
  "absolute right-0 top-0 z-10 flex h-full items-center justify-center mr-0.5 pr-0.5";
const threadIconButtonClass =
  "pointer-events-none flex h-5 w-5 items-center justify-center rounded-[var(--hc-radius-md)] border-0 bg-transparent p-0 text-inherit opacity-0 group-focus-within:pointer-events-auto group-focus-within:opacity-100 group-hover:pointer-events-auto group-hover:opacity-50 hover:opacity-100 focus-visible:pointer-events-auto focus-visible:opacity-100 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--vscode-focusBorder)]";
const threadConfirmArchiveButtonClass =
  "hc-thread-confirm-archive pointer-events-auto inline-flex h-auto items-center justify-center rounded-md px-3 py-0 text-sm leading-5";
const threadPinIndicatorClass = "h-5 w-5 shrink-0";
const threadPinIndicatorButtonClass =
  "hc-thread-pin-button relative flex h-5 w-5 items-center justify-center border-0 bg-transparent p-0 leading-none text-token-description-foreground hover:opacity-100 focus-visible:pointer-events-auto focus-visible:opacity-100 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--vscode-focusBorder)]";
const threadPinIndicatorButtonVisibleClass = "is-pinned";
const threadMenuWidthPx = 220;
const threadMenuEstimatedHeightPx = 360;
const threadMenuViewportMarginPx = 8;
const threadMenuClass =
  "hc-app-popover-menu fixed z-50 m-px flex w-[220px] select-none flex-col overflow-y-auto rounded-xl bg-token-dropdown-background px-1 py-1 text-token-foreground shadow-xl-spread ring-[0.5px] ring-token-border backdrop-blur-sm";
const threadMenuItemClass =
  "flex w-full appearance-none items-center rounded-lg border-0 bg-transparent px-row-x py-row-y text-left text-sm text-token-foreground hover:bg-token-list-hover-background disabled:cursor-default disabled:opacity-50 disabled:hover:bg-transparent";
const threadMenuSeparatorClass = "w-full px-row-x py-1";

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
  /** Click handler for the appearance toggle (sidebar footer). */
  onToggleTheme?: () => void;
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
  onToggleTheme,
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
  const [openThreadMenu, setOpenThreadMenu] = useState<{
    threadId: string;
    x: number;
    y: number;
  } | null>(null);
  const openMenuThreadId = openThreadMenu?.threadId ?? null;
  const [openSectionMenu, setOpenSectionMenu] = useState<"filter" | "add-project" | null>(null);
  const sectionActionsRef = useRef<HTMLDivElement | null>(null);
  const threadMenuRef = useRef<HTMLDivElement | null>(null);
  const [internalOrganizeMode, setInternalOrganizeMode] = useState<SidebarOrganizeMode>(DEFAULT_SIDEBAR_ORGANIZE_MODE);
  const [internalCollapsedGroupKeys, setInternalCollapsedGroupKeys] = useState<Set<string>>(() => new Set());
  const [previouslyExpandedGroupKeys, setPreviouslyExpandedGroupKeys] = useState<string[]>([]);
  const [confirmingArchiveThreadId, setConfirmingArchiveThreadId] = useState<string | null>(null);
  const [dismissedUsageAlertKeys, setDismissedUsageAlertKeys] = useState<Set<string>>(() => new Set());
  const { formatMessage } = useHiCodexIntl();
  const effectiveOrganizeMode = organizeMode ?? internalOrganizeMode;
  const effectiveCollapsedGroupKeys = collapsedGroupKeys ?? internalCollapsedGroupKeys;
  const { pinnedThreads, unpinnedThreads } = splitSidebarThreadsByPinned(threads, pinnedThreadIds);
  const pinnedGroupKey = "pinned";
  const pinnedGroupCollapsed = effectiveCollapsedGroupKeys.has(pinnedGroupKey);
  const threadGroups = projectSidebarThreadGroups(unpinnedThreads, {
    organizeMode: effectiveOrganizeMode,
    currentWorkspaceRoot,
    selectedWorkspaceRoots,
  });
  // codex app-main chats-section-header: the projectless (recent) group uses the
  // "Chats" label (sidebarElectron.recentChats); project modes use the "Projects"
  // heading (sidebarElectron.projectsNavLink → "Projects" / "项目", the project
  // section's nav label in the bundle). Folder rows carry the per-project grouping
  // under this heading.
  const sectionLabel =
    effectiveOrganizeMode === "recent"
      ? formatMessage({ id: "sidebarElectron.recentChats", defaultMessage: "Chats" })
      : formatMessage({ id: "sidebarElectron.projectsNavLink", defaultMessage: "Projects" });
  const sectionCollapseAction = projectSectionCollapseAction(
    threadGroups.map((group) => group.key),
    effectiveCollapsedGroupKeys,
    previouslyExpandedGroupKeys,
  );
  const showProjectSection = threadGroups.length > 0 || Boolean(onUseExistingFolder);
  const usageAlert = accountView?.usageAlert ?? null;
  const showUsageAlert = usageAlert != null && !dismissedUsageAlertKeys.has(usageAlert.dismissalKey);

  const runThreadAction = (thread: Thread, action: (thread: Thread) => void | Promise<void>) => {
    setOpenThreadMenu(null);
    setConfirmingArchiveThreadId(null);
    void action(thread);
  };

  const runOptionalThreadAction = (
    thread: Thread,
    action: ((thread: Thread) => void | Promise<void>) | undefined,
  ) => {
    if (!action) return;
    runThreadAction(thread, action);
  };

  const closeThreadMenu = useCallback(() => {
    setOpenThreadMenu(null);
  }, []);

  const closeSectionMenu = useCallback(() => {
    setOpenSectionMenu(null);
  }, []);

  useDismissibleLayer(openThreadMenu != null, threadMenuRef, closeThreadMenu);
  useDismissibleLayer(openSectionMenu != null, sectionActionsRef, closeSectionMenu);

  const openContextMenu = (event: MouseEvent, thread: Thread) => {
    event.preventDefault();
    event.stopPropagation();
    setOpenSectionMenu(null);
    setConfirmingArchiveThreadId(null);
    const position = sidebarContextMenuPosition(
      { x: event.clientX, y: event.clientY },
      browserViewportSize(),
    );
    setOpenThreadMenu({ threadId: thread.id, x: position.left, y: position.top });
  };

  const requestArchiveConfirmation = (thread: Thread) => {
    setOpenThreadMenu(null);
    setConfirmingArchiveThreadId(thread.id);
  };

  const clearArchiveConfirmation = (thread: Thread) => {
    setConfirmingArchiveThreadId((current) => current === thread.id ? null : current);
  };

  const updateCollapsedGroupKeys = (updater: (current: ReadonlySet<string>) => Set<string>) => {
    const next = updater(effectiveCollapsedGroupKeys);
    if (onCollapsedGroupKeysChange) {
      onCollapsedGroupKeysChange([...next]);
      return;
    }
    setInternalCollapsedGroupKeys(next);
  };

  const toggleGroup = (key: string) => {
    updateCollapsedGroupKeys((current) => {
      const next = new Set(current);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  };

  const runSectionCollapseAction = () => {
    setOpenSectionMenu(null);
    const groupKeys = threadGroups.map((group) => group.key);
    if (sectionCollapseAction === "collapse-all") {
      const expanded = groupKeys.filter((key) => !effectiveCollapsedGroupKeys.has(key));
      updateCollapsedGroupKeys(() => new Set(groupKeys));
      setPreviouslyExpandedGroupKeys(expanded);
      return;
    }
    if (sectionCollapseAction === "reopen-previous") {
      updateCollapsedGroupKeys((current) => {
        const next = new Set(current);
        const visible = new Set(groupKeys);
        for (const key of previouslyExpandedGroupKeys) {
          if (visible.has(key)) next.delete(key);
        }
        return next;
      });
      setPreviouslyExpandedGroupKeys([]);
    }
  };

  const chooseSortKey = (nextSortKey: SidebarSortKey) => {
    setOpenSectionMenu(null);
    onSortKeyChange?.(nextSortKey);
  };

  const chooseOrganizeMode = (nextOrganizeMode: SidebarOrganizeMode) => {
    setOpenSectionMenu(null);
    if (onOrganizeModeChange) {
      onOrganizeModeChange(nextOrganizeMode);
      return;
    }
    setInternalOrganizeMode(nextOrganizeMode);
  };

  const useExistingFolder = () => {
    setOpenSectionMenu(null);
    void onUseExistingFolder?.();
  };

  const dismissUsageAlert = () => {
    if (!usageAlert) return;
    setDismissedUsageAlertKeys((current) => new Set(current).add(usageAlert.dismissalKey));
  };

  const signOut = () => {
    if (!accountView?.signedIn || accountView.signOutAction.disabled) return;
    void onSignOut?.();
  };

  const renderUpdateBadge = () => {
    if (!updateAvailable) return null;
    const downloading = typeof updateAvailable.progress === "number";
    const pct = downloading ? Math.round((updateAvailable.progress ?? 0) * 100) : null;
    const label = updateAvailable.error
      ? formatMessage({ id: "hc.sidebar.update.failed", defaultMessage: "Update failed" })
      : downloading
      ? formatMessage({ id: "hc.sidebar.update.downloading", defaultMessage: "Updating {pct}%" }, { pct })
      : formatMessage({ id: "hc.sidebar.update.available", defaultMessage: "Update v{version}" }, { version: updateAvailable.version });
    return (
      <button
        type="button"
        className="hc-sidebar-update-badge"
        title={updateAvailable.error ?? formatMessage({ id: "hc.sidebar.update.installTooltip", defaultMessage: "Install v{version} and restart" }, { version: updateAvailable.version })}
        disabled={downloading}
        onClick={() => { void onApplyUpdate?.(); }}
      >
        <span className="hc-sidebar-update-dot" aria-hidden />
        <span className="hc-sidebar-update-label">{label}</span>
      </button>
    );
  };

  const renderThreadRows = (rows: Thread[]) => rows.map((thread) => {
    const relativeTime = sidebarThreadRelativeTime(thread);
    const statusState = sidebarThreadStatusState(thread);
    const isPinned = pinnedThreadIds?.has(thread.id) ?? false;
    const isUnread = statusState.unread;
    const threadCwd = typeof thread.cwd === "string" ? thread.cwd.trim() : "";
    const title = getThreadTitle(thread);
    const isActive = thread.id === activeThreadId;
    const isConfirmingArchive = confirmingArchiveThreadId === thread.id;
    return (
      <div
        key={thread.id}
        className={cx("hc-sidebar-thread-row", threadRowClass, isActive && threadRowActiveClass)}
        data-confirming-archive={isConfirmingArchive ? "true" : undefined}
        onContextMenu={(event) => openContextMenu(event, thread)}
        onPointerLeave={() => clearArchiveConfirmation(thread)}
        onClick={(event) => {
          if (isConfirmingArchive) {
            event.preventDefault();
            event.stopPropagation();
            return;
          }
          closeThreadMenu();
          setConfirmingArchiveThreadId(null);
          void onSelectThread(thread);
        }}
        onKeyDown={(event) => {
          if (event.currentTarget !== event.target) return;
          if (event.key !== "Enter" && event.key !== " ") return;
          event.preventDefault();
          if (isConfirmingArchive) {
            event.stopPropagation();
            return;
          }
          closeThreadMenu();
          setConfirmingArchiveThreadId(null);
          void onSelectThread(thread);
        }}
        role="button"
        tabIndex={0}
        aria-current={isActive ? "page" : undefined}
        title={title}
      >
        <div className={cx(
          "flex h-full w-full items-center text-sm leading-4",
          isConfirmingArchive && "[mask-image:linear-gradient(to_left,transparent_0,transparent_72px,black_80px)]",
        )}>
          <div className="flex min-w-0 flex-1 items-center gap-2 pl-0.5">
            {onToggleThreadPinned && (
              <ThreadPinIndicator
                isPinned={isPinned}
                isUnread={isUnread}
                onToggleThreadPinned={onToggleThreadPinned}
                thread={thread}
              />
            )}
            <div
              className={threadRowContentClass}
              data-thread-title-trigger
            >
              <span className="min-w-0 flex-1 truncate select-none" data-thread-title>
                {title}
              </span>
            </div>
          </div>
          <div className={cx(
            "ml-[3px] flex items-center justify-end gap-1",
            (sidebarThreadHasVisibleStatus(statusState) || relativeTime) && "min-w-[26px]",
          )}>
            {(sidebarThreadHasVisibleStatus(statusState) || relativeTime) ? (
              <div className="flex items-center gap-1 text-right text-sm leading-4 text-token-description-foreground tabular-nums group-focus-within:opacity-0 group-hover:opacity-0">
                <ThreadStatusIndicator state={statusState} />
                {relativeTime && <span className="truncate">{relativeTime}</span>}
              </div>
            ) : (
              <span className="group-focus-within:w-5 group-hover:w-5" />
            )}
          </div>
        </div>
        <div className={cx(threadActionGroupClass, threadArchiveActionClass, isConfirmingArchive && "pl-1 opacity-100")} aria-label={formatMessage({ id: "hc.sidebar.thread.actions", defaultMessage: "Chat actions" })}>
          {isConfirmingArchive ? (
            <button
              type="button"
              className={threadConfirmArchiveButtonClass}
              title={formatMessage({ id: "codex.cloudTaskRow.confirmArchiveTask", defaultMessage: "Confirm" })}
              aria-label={formatMessage({ id: "codex.cloudTaskRow.confirmArchiveTask", defaultMessage: "Confirm" })}
              onClick={(event) => {
                event.stopPropagation();
                runThreadAction(thread, onArchiveThread);
              }}
              onPointerDown={(event) => event.stopPropagation()}
            >
              {formatMessage({ id: "codex.cloudTaskRow.confirmArchiveTask", defaultMessage: "Confirm" })}
            </button>
          ) : (
            <button
              type="button"
              className={threadIconButtonClass}
              title={formatMessage({ id: "codex.command.archiveThread", defaultMessage: "Archive chat" })}
              aria-label={formatMessage({ id: "codex.command.archiveThread", defaultMessage: "Archive chat" })}
              onClick={(event) => {
                event.stopPropagation();
                requestArchiveConfirmation(thread);
              }}
              onPointerDown={(event) => event.stopPropagation()}
            >
              <Archive size={14} />
            </button>
          )}
        </div>
        {openThreadMenu && openMenuThreadId === thread.id && createPortal(
          <div
            className={threadMenuClass}
            ref={threadMenuRef}
            role="menu"
            /*
             * `data-state="open"` so HiCodex's global type-to-focus selector
             * (`HiCodexApp.tsx::focusComposerFromPlainTextKey`,
             * `[role="menu"][data-state="open"]`) treats this popover as
             * active. Mirrors the Radix-style marker Codex Desktop uses on
             * every interactive popover. Mount equals open here.
             */
            data-state="open"
            style={{
              left: openThreadMenu.x,
              maxHeight: `calc(100vh - ${threadMenuViewportMarginPx * 2}px)`,
              top: openThreadMenu.y,
            }}
            onClick={(event) => event.stopPropagation()}
          >
            {onToggleThreadPinned && (
              <button
                type="button"
                className={threadMenuItemClass}
                role="menuitem"
                onClick={() => {
                  closeThreadMenu();
                  void onToggleThreadPinned(thread, !isPinned);
                }}
              >
                {isPinned
                  ? formatMessage({ id: "sidebarElectron.unpinThread", defaultMessage: "Unpin chat" })
                  : formatMessage({ id: "sidebarElectron.pinThread", defaultMessage: "Pin chat" })}
              </button>
            )}
            <button
              type="button"
              className={threadMenuItemClass}
              role="menuitem"
              onClick={() => runThreadAction(thread, onRenameThread)}
            >
              {formatMessage({ id: "sidebarElectron.renameThread", defaultMessage: "Rename chat" })}
            </button>
            <button
              type="button"
              className={threadMenuItemClass}
              role="menuitem"
              onClick={() => runThreadAction(thread, onArchiveThread)}
            >
              {formatMessage({ id: "codex.command.archiveThread", defaultMessage: "Archive chat" })}
            </button>
            <button
              type="button"
              className={threadMenuItemClass}
              role="menuitem"
              disabled={isUnread || !onMarkThreadUnread}
              onClick={() => runOptionalThreadAction(thread, onMarkThreadUnread)}
            >
              {formatMessage({ id: "sidebarElectron.markThreadUnread", defaultMessage: "Mark as unread" })}
            </button>
            <div className={threadMenuSeparatorClass}>
                <div className="h-px w-full bg-token-menu-border" />
            </div>
            {onOpenThreadWindow && (
              // codex threadHeader.openInNewWindow — open this thread in a second app window.
              <button
                type="button"
                className={threadMenuItemClass}
                role="menuitem"
                onClick={() => runOptionalThreadAction(thread, onOpenThreadWindow)}
              >
                {formatMessage({ id: "threadHeader.openInNewWindow", defaultMessage: "Open in new window" })}
              </button>
            )}
            <button
              type="button"
              className={threadMenuItemClass}
              role="menuitem"
              disabled={!threadCwd || !onOpenThreadFolder}
              onClick={() => runOptionalThreadAction(thread, onOpenThreadFolder)}
            >
              {osRevealLabel()}
            </button>
            <button
              type="button"
              className={threadMenuItemClass}
              role="menuitem"
              disabled={!threadCwd || !onCopyWorkingDirectory}
              onClick={() => runOptionalThreadAction(thread, onCopyWorkingDirectory)}
            >
              {formatMessage({ id: "threadHeader.copyWorkingDirectory", defaultMessage: "Copy working directory" })}
            </button>
            <button
              type="button"
              className={threadMenuItemClass}
              role="menuitem"
              disabled={!onCopySessionId}
              onClick={() => runOptionalThreadAction(thread, onCopySessionId)}
            >
              {formatMessage({ id: "threadHeader.copySessionId", defaultMessage: "Copy session ID" })}
            </button>
            <button
              type="button"
              className={threadMenuItemClass}
              role="menuitem"
              disabled={!onCopyDeeplink}
              onClick={() => runOptionalThreadAction(thread, onCopyDeeplink)}
            >
              {formatMessage({ id: "threadHeader.copyAppLink", defaultMessage: "Copy deeplink" })}
            </button>
            <div className={threadMenuSeparatorClass}>
                <div className="h-px w-full bg-token-menu-border" />
            </div>
            <button
              type="button"
              className={threadMenuItemClass}
              role="menuitem"
              onClick={() => runThreadAction(thread, onForkThread)}
            >
              {/* codex `ht ? forkIntoSameWorktree : forkIntoLocal` */}
              {isActive && activeThreadIsWorktree
                ? formatMessage({ id: "threadHeader.forkIntoSameWorktree", defaultMessage: "Fork into same worktree" })
                : formatMessage({ id: "threadHeader.forkIntoLocal", defaultMessage: "Fork into local" })}
            </button>
            {onForkThreadIntoWorktree && (
              <button
                type="button"
                className={threadMenuItemClass}
                role="menuitem"
                disabled={!threadCwd}
                onClick={() => runOptionalThreadAction(thread, onForkThreadIntoWorktree)}
              >
                {formatMessage({ id: "threadHeader.forkIntoWorktree", defaultMessage: "Fork into new worktree" })}
              </button>
            )}
          </div>,
          document.body,
        )}
      </div>
    );
  });

  return (
    <aside className="hc-sidebar" id="hc-sidebar">
      {renderUpdateBadge()}
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
        {pinnedThreads.length === 0 && threadGroups.length === 0 && (
          <div className="hc-empty-panel">{formatMessage({ id: "sidebarElectron.noRecentChats", defaultMessage: "No chats" })}</div>
        )}
        {showProjectSection && (
          <>
            <div className={`hc-thread-section-header ${openSectionMenu ? "is-menu-open" : ""}`}>
              {sectionLabel
                ? <div className="hc-thread-section-label">{sectionLabel}</div>
                : <div className="hc-thread-section-label" aria-hidden="true" />}
              <div className="hc-thread-section-actions" aria-label={formatMessage({ id: "hc.sidebar.section.actions", defaultMessage: "Projects actions" })} ref={sectionActionsRef}>
                {sectionCollapseAction && (
              <button
                type="button"
                className="hc-sidebar-section-action"
                title={sectionCollapseAction === "collapse-all"
                  ? formatMessage({ id: "sidebarElectron.collapseAllGroups", defaultMessage: "Collapse all" })
                  : formatMessage({ id: "sidebarElectron.reopenPreviousGroups", defaultMessage: "Reopen previous" })}
                aria-label={sectionCollapseAction === "collapse-all"
                  ? formatMessage({ id: "hc.sidebar.section.collapseAllProjects", defaultMessage: "Collapse all projects" })
                  : formatMessage({ id: "hc.sidebar.section.reopenPreviousProjects", defaultMessage: "Reopen previous projects" })}
                onClick={runSectionCollapseAction}
              >
                {sectionCollapseAction === "collapse-all" ? <Minimize2 size={13} /> : <Maximize2 size={13} />}
              </button>
                )}
                <button
                  type="button"
                  className="hc-sidebar-section-action"
                  title={formatMessage({ id: "sidebarElectron.showMenu.trigger", defaultMessage: "Filter sidebar chats" })}
                  aria-label={formatMessage({ id: "sidebarElectron.showMenu.trigger", defaultMessage: "Filter sidebar chats" })}
                  aria-haspopup="menu"
                  aria-expanded={openSectionMenu === "filter"}
                  onClick={() => {
                    setOpenThreadMenu(null);
                    setOpenSectionMenu((menu) => menu === "filter" ? null : "filter");
                  }}
                >
                  <ListFilter size={13} />
                </button>
                {openSectionMenu === "filter" && (
                  <div className="hc-thread-menu hc-sidebar-section-menu hc-app-popover-menu" role="menu" data-state="open">
                    {/* codex app-main groupByMenu: submenuTitle "Organize sidebar",
                        options "By project" (workspace) and "Chronological list" (recency).
                        HiCodex surfaces only the two organize modes it actually implements;
                        the self-invented "Current workspace first" item had no Codex basis. */}
                    <div className="hc-thread-menu-title">{formatMessage({ id: "sidebarElectron.groupByMenu.submenuTitle", defaultMessage: "Organize sidebar" })}</div>
                    <button
                      type="button"
                      className="hc-thread-menu-item"
                      role="menuitemradio"
                      aria-checked={effectiveOrganizeMode === "project"}
                      onClick={() => chooseOrganizeMode("project")}
                    >
                      <Folder size={13} />
                      <span>{formatMessage({ id: "sidebarElectron.groupByMenu.workspace", defaultMessage: "By project" })}</span>
                      {effectiveOrganizeMode === "project" && <Check size={13} className="hc-thread-menu-check" />}
                    </button>
                    <button
                      type="button"
                      className="hc-thread-menu-item"
                      role="menuitemradio"
                      aria-checked={effectiveOrganizeMode === "recent"}
                      onClick={() => chooseOrganizeMode("recent")}
                    >
                      <Clock size={13} />
                      <span>{formatMessage({ id: "sidebarElectron.groupByMenu.recency", defaultMessage: "Chronological list" })}</span>
                      {effectiveOrganizeMode === "recent" && <Check size={13} className="hc-thread-menu-check" />}
                    </button>
                    <div className={threadMenuSeparatorClass}>
                      <div className="h-px w-full bg-token-menu-border" />
                    </div>
                    <div className="hc-thread-menu-title">{formatMessage({ id: "sidebarElectron.sortMenu.title", defaultMessage: "Sort by" })}</div>
                    <button
                      type="button"
                      className="hc-thread-menu-item"
                      role="menuitemradio"
                      aria-checked={sortKey === "updated_at"}
                      onClick={() => chooseSortKey("updated_at")}
                    >
                      <Clock size={13} />
                      <span>{formatMessage({ id: "hc.sidebar.sort.updated", defaultMessage: "Updated" })}</span>
                      {sortKey === "updated_at" && <Check size={13} className="hc-thread-menu-check" />}
                    </button>
                    <button
                      type="button"
                      className="hc-thread-menu-item"
                      role="menuitemradio"
                      aria-checked={sortKey === "created_at"}
                      onClick={() => chooseSortKey("created_at")}
                    >
                      <Calendar size={13} />
                      <span>{formatMessage({ id: "hc.sidebar.sort.created", defaultMessage: "Created" })}</span>
                      {sortKey === "created_at" && <Check size={13} className="hc-thread-menu-check" />}
                    </button>
                  </div>
                )}
                {onUseExistingFolder && (
              <>
                <button
                  type="button"
                  className="hc-sidebar-section-action"
                  title={formatMessage({ id: "sidebarElectron.addGenericWorkspaceRoot", defaultMessage: "Add new project" })}
                  aria-label={formatMessage({ id: "sidebarElectron.addGenericWorkspaceRoot", defaultMessage: "Add new project" })}
                  aria-haspopup="menu"
                  aria-expanded={openSectionMenu === "add-project"}
                  onClick={() => {
                    setOpenThreadMenu(null);
                    setOpenSectionMenu((menu) => menu === "add-project" ? null : "add-project");
                  }}
                >
                  <FolderPlus size={13} />
                </button>
                {openSectionMenu === "add-project" && (
                  <div className="hc-thread-menu hc-sidebar-section-menu hc-app-popover-menu" role="menu" data-state="open">
                    <button
                      type="button"
                      className="hc-thread-menu-item"
                      role="menuitem"
                      onClick={useExistingFolder}
                    >
                      <Folder size={13} />
                      <span>{formatMessage({ id: "projectSetup.addProjectMenu.useExistingFolder", defaultMessage: "Use an existing folder" })}</span>
                    </button>
                  </div>
                )}
              </>
                )}
              </div>
            </div>
            {threadGroups.map((group) => (
          <div className="hc-thread-group" key={group.key}>
            <button
              className="hc-project-row"
              type="button"
              aria-expanded={!effectiveCollapsedGroupKeys.has(group.key)}
              onClick={() => toggleGroup(group.key)}
              title={group.path ?? group.label}
            >
              {effectiveCollapsedGroupKeys.has(group.key) ? <ChevronRight size={14} className="hc-sidebar-group-chevron" /> : <ChevronDown size={14} className="hc-sidebar-group-chevron" />}
              <Folder size={16} />
              <span className="hc-project-name">{
                group.key === "recent"
                  ? formatMessage({ id: "sidebarElectron.recentThreads", defaultMessage: group.label })
                  : group.label === "Local"
                    ? formatMessage({ id: "sidebarElectron.connectionGroup.local", defaultMessage: "Local" })
                    : group.label
              }</span>
            </button>
            {!effectiveCollapsedGroupKeys.has(group.key) && group.threads.length === 0 && (
              <div className="hc-empty-group">{formatMessage({ id: "hc.sidebar.noChats", defaultMessage: "No chats" })}</div>
            )}
            {!effectiveCollapsedGroupKeys.has(group.key) && renderThreadRows(group.threads)}
          </div>
            ))}
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

function cx(...classes: Array<string | false | null | undefined>) {
  return classes.filter(Boolean).join(" ");
}

function projectSectionCollapseAction(
  groupKeys: string[],
  collapsedGroupKeys: ReadonlySet<string>,
  previouslyExpandedGroupKeys: string[],
): "collapse-all" | "reopen-previous" | null {
  const expanded = groupKeys.filter((key) => !collapsedGroupKeys.has(key));
  if (expanded.length > 1) return "collapse-all";
  const visibleKeys = new Set(groupKeys);
  return expanded.length === 0 && previouslyExpandedGroupKeys.some((key) => visibleKeys.has(key))
    ? "reopen-previous"
    : null;
}

/*
 * codex local-task-row-*.js inline status slot. Priority order is
 * unreadCount badge → loading spinner → unread dot → nothing. There is NO
 * inline `error` branch in Codex (the system-error state is conveyed by the
 * row's text color, not an icon), so HiCodex no longer paints the red
 * AlertCircle that used to live here.
 */
function ThreadStatusIndicator({ state }: { state: SidebarThreadStatusState }) {
  const { formatMessage } = useHiCodexIntl();
  // codex `Ee`: numeric unread badge, count>99 → "99+", textLink-tinted fill
  // with a 72% inset ring. Takes priority over the spinner and the plain dot.
  if (state.unreadCount > 0) {
    const unreadLabel = formatMessage({ id: "hc.sidebar.thread.status.unread", defaultMessage: "Unread chat" });
    const count = state.unreadCount > 99 ? "99+" : String(state.unreadCount);
    return (
      <span
        className="relative flex h-5 min-w-5 shrink-0 items-center justify-center"
        title={unreadLabel}
        aria-label={unreadLabel}
      >
        <span
          className="flex h-5 min-w-5 items-center justify-center rounded-full px-1.5 text-[11px] font-semibold leading-none"
          style={{
            backgroundColor: "color-mix(in srgb, var(--vscode-textLink-foreground) 18%, transparent)",
            boxShadow: "inset 0 0 0 1px color-mix(in srgb, var(--vscode-textLink-foreground) 72%, transparent)",
            color: "var(--vscode-textLink-foreground)",
          }}
        >
          {count}
        </span>
      </span>
    );
  }
  if (state.type === "loading") {
    const progressLabel = formatMessage({ id: "hc.sidebar.thread.status.inProgress", defaultMessage: "Chat in progress" });
    return (
      <span
        className="relative flex size-5 shrink-0 items-center justify-center text-token-foreground/70"
        title={progressLabel}
        aria-label={progressLabel}
      >
        <Loader2 className="hc-spin" size={16} />
      </span>
    );
  }
  // codex `q`: unread dot = textLink-token fill, geometry is a 50%-scaled
  // 16px box inside a size-5 (20px) container so it stays token-driven in dark.
  if (state.unread) {
    const unreadLabel = formatMessage({ id: "hc.sidebar.thread.status.unread", defaultMessage: "Unread chat" });
    return (
      <span
        className="relative flex size-5 shrink-0 items-center justify-center text-token-description-foreground"
        title={unreadLabel}
        aria-label={unreadLabel}
      >
        <span className="relative block size-4 scale-50">
          <span
            className="absolute inset-0 rounded-full"
            style={{ backgroundColor: "var(--vscode-textLink-foreground)" }}
          />
        </span>
      </span>
    );
  }
  return null;
}

export function sidebarContextMenuPosition(
  point: { x: number; y: number },
  viewport: { width: number; height: number },
): { left: number; top: number } {
  const maxLeft = Math.max(
    threadMenuViewportMarginPx,
    viewport.width - threadMenuWidthPx - threadMenuViewportMarginPx,
  );
  const maxTop = Math.max(
    threadMenuViewportMarginPx,
    viewport.height - threadMenuEstimatedHeightPx - threadMenuViewportMarginPx,
  );
  return {
    left: clamp(point.x, threadMenuViewportMarginPx, maxLeft),
    top: clamp(point.y, threadMenuViewportMarginPx, maxTop),
  };
}

function browserViewportSize(): { width: number; height: number } {
  return {
    width: window.innerWidth || threadMenuWidthPx + threadMenuViewportMarginPx * 2,
    height: window.innerHeight || threadMenuEstimatedHeightPx + threadMenuViewportMarginPx * 2,
  };
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), max);
}

function SidebarUsageAlert({
  alert,
  onDismiss,
}: {
  alert: AccountUsageAlert;
  onDismiss: () => void;
}) {
  const { formatMessage } = useHiCodexIntl();
  const reset = usageAlertResetLabel(alert, formatMessage);
  return (
    <div className="hc-sidebar-usage-alert">
      <div className="hc-sidebar-usage-alert-copy">
        <div className="hc-sidebar-usage-alert-heading">
          <span>
            {formatMessage(
              {
                id: "sidebarElectron.usageAlert.title",
                defaultMessage: "{remaining}% usage remaining",
              },
              { remaining: alert.remainingPercent },
            )}
          </span>
          <button
            type="button"
            className="hc-sidebar-usage-alert-dismiss"
            aria-label={formatMessage({
              id: "sidebarElectron.usageAlert.dismiss",
              defaultMessage: "Dismiss usage alert",
            })}
            onClick={onDismiss}
          >
            <X size={12} />
          </button>
        </div>
        {reset && <div className="hc-sidebar-usage-alert-reset">{reset}</div>}
      </div>
      <progress
        aria-label={formatMessage({
          id: "sidebarElectron.usageAlert.progress.ariaLabel",
          defaultMessage: "Usage consumed",
        })}
        className="hc-sidebar-usage-alert-progress"
        max={100}
        value={alert.usedPercent}
      />
    </div>
  );
}

type UsageAlertFormatMessage = (
  descriptor: { id: string; defaultMessage: string },
  values?: Record<string, string | number | boolean | null | undefined>,
) => string;

/*
 * codex app-main sidebar usage-alert reset line. Codex renders one of two
 * localized messages instead of hand-built English:
 *   - no cadence: `sidebarElectron.usageAlert.resetAt` = "Resets {time}"
 *   - with cadence: `sidebarElectron.usageAlert.resetAtWithCadence`
 *        = "Resets {cadence} · Next reset is {time}"
 * where {cadence} is a pluralized `cadence.{minute|hour|day|week|month|year}`
 * label derived from the window duration. The old HiCodex code wrote a raw
 * "Resets …"/"Window 2h" English string that never localized — replaced here.
 */
function usageAlertResetLabel(alert: AccountUsageAlert, formatMessage: UsageAlertFormatMessage): string | null {
  const time = usageAlertResetTime(alert.resetAt);
  const cadence = usageAlertCadenceLabel(alert.windowDurationMins, formatMessage);
  if (time && cadence) {
    return formatMessage(
      { id: "sidebarElectron.usageAlert.resetAtWithCadence", defaultMessage: "Resets {cadence} · Next reset is {time}" },
      { cadence, time },
    );
  }
  if (time) {
    return formatMessage(
      { id: "sidebarElectron.usageAlert.resetAt", defaultMessage: "Resets {time}" },
      { time },
    );
  }
  return null;
}

function usageAlertResetTime(resetAt: number | null): string | null {
  if (!resetAt) return null;
  const millis = resetAt > 10_000_000_000 ? resetAt : resetAt * 1_000;
  const date = new Date(millis);
  if (Number.isNaN(date.getTime())) return null;
  return date.toLocaleString([], { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" });
}

/*
 * Maps a window duration (minutes) to the largest natural cadence unit, mirroring
 * Codex's threshold ladder (year ≥ ~525600, month ≥ ~43800, week ≥ 10080,
 * day ≥ 1440, hour ≥ 60, else minute) with its ±5% rounding tolerance for the
 * coarse units. Cadence strings use HiCodex's simple-plural form (`#`) because
 * the bundled ICU formatter does not support nested-brace plural arguments.
 */
function usageAlertCadenceLabel(
  minutes: number | null,
  formatMessage: UsageAlertFormatMessage,
): string | null {
  if (minutes == null || !Number.isFinite(minutes) || minutes <= 0) return null;
  const year = approxCadenceCount(minutes, 525_600);
  if (year != null) {
    return formatMessage(
      { id: "sidebarElectron.usageAlert.cadence.year", defaultMessage: "{years, plural, one {every year} other {every # years}}" },
      { years: year },
    );
  }
  const month = approxCadenceCount(minutes, 43_800);
  if (month != null) {
    return formatMessage(
      { id: "sidebarElectron.usageAlert.cadence.month", defaultMessage: "{months, plural, one {every month} other {every # months}}" },
      { months: month },
    );
  }
  if (minutes >= 10_079) {
    return formatMessage(
      { id: "sidebarElectron.usageAlert.cadence.week", defaultMessage: "{weeks, plural, one {every week} other {every # weeks}}" },
      { weeks: Math.ceil(minutes / 10_080) },
    );
  }
  if (minutes >= 1_439) {
    return formatMessage(
      { id: "sidebarElectron.usageAlert.cadence.day", defaultMessage: "{days, plural, one {every day} other {every # days}}" },
      { days: Math.ceil(minutes / 1_440) },
    );
  }
  if (minutes >= 60) {
    return formatMessage(
      { id: "sidebarElectron.usageAlert.cadence.hour", defaultMessage: "{hours, plural, one {every hour} other {every # hours}}" },
      { hours: Math.ceil(minutes / 60) },
    );
  }
  return formatMessage(
    { id: "sidebarElectron.usageAlert.cadence.minute", defaultMessage: "{minutes, plural, one {every minute} other {every # minutes}}" },
    { minutes: Math.ceil(minutes) },
  );
}

function approxCadenceCount(minutes: number, unitMinutes: number): number | null {
  const count = Math.max(1, Math.round(minutes / unitMinutes));
  const target = count * unitMinutes;
  return minutes >= target * 0.95 && minutes <= target * 1.05 ? count : null;
}

function SidebarAccountSummary({
  accountView,
  resolvedUiTheme,
  onSignOut,
  onOpenSettings,
}: {
  accountView: AccountViewModel;
  resolvedUiTheme: "light" | "dark";
  onSignOut: () => void;
  onOpenSettings: () => void;
}) {
  const [open, setOpen] = useState(false);
  const [confirmingSignOut, setConfirmingSignOut] = useState(false);
  const layerRef = useRef<HTMLDivElement | null>(null);
  const close = useCallback(() => setOpen(false), []);
  useDismissibleLayer(open, layerRef, close);
  const { formatMessage } = useHiCodexIntl();
  const title = [
    accountView.email,
    accountView.authLabel,
    accountView.planLabel,
    accountView.quotaLabel,
    accountView.quotaDetail,
    accountView.error,
  ].filter(Boolean).join("\n");
  const items = projectAccountMenuItems(accountView);
  const actionItems = items.filter((item) => item.action);
  const infoItems = items.filter((item) => !item.action);
  const runMenuItem = (item: AccountMenuItem) => {
    if (item.action === "account/signOut") {
      if (item.disabled) return;
      // codex profile-dropdown: "Log out" opens a confirmation dialog instead of
      // signing out immediately (logOutConfirmation.*). Close the menu, ask first.
      setOpen(false);
      setConfirmingSignOut(true);
    }
  };
  const confirmSignOut = useCallback(() => {
    setConfirmingSignOut(false);
    onSignOut();
  }, [onSignOut]);
  const cancelSignOut = useCallback(() => setConfirmingSignOut(false), []);
  return (
    <div
      className="hc-sidebar-account"
      data-quota-tone={accountView.quotaTone}
      title={title || undefined}
      ref={layerRef}
    >
      <button
        aria-expanded={open}
        aria-haspopup="menu"
        className="hc-sidebar-account-trigger"
        type="button"
        onClick={() => setOpen((current) => !current)}
      >
        <span className="hc-sidebar-account-avatar" aria-hidden="true">
          {accountView.avatarInitials}
        </span>
        {/* codex profileFooter `lp`: avatar + "Settings" label (codex.profileFooter.signedInFallback);
            the account name / plan / usage live in the dropdown below, not inline. */}
        <span className="hc-sidebar-account-label">{formatMessage({ id: "codex.profileFooter.signedInFallback", defaultMessage: "Settings" })}</span>
      </button>
      {open && (
        <div className="hc-sidebar-account-menu" role="menu" data-state="open">
          {/* codex profile dropdown exposes Settings here (the footer no longer has a
              standalone Settings row); sign-out stays in `items` below. */}
          <button
            className="hc-sidebar-account-menu-item"
            role="menuitem"
            type="button"
            onClick={() => { setOpen(false); onOpenSettings(); }}
          >
            <Settings size={14} aria-hidden="true" />
            <span>{formatMessage({ id: "hc.sidebar.settings", defaultMessage: "Settings" })}</span>
          </button>
          {infoItems.map((item) => (
            <div
              className="hc-sidebar-account-menu-item"
              data-tone={item.tone}
              key={item.id}
              role="menuitem"
            >
              <span>{item.label}</span>
              {item.value && <strong>{item.value}</strong>}
            </div>
          ))}
          {accountView.rateLimitSummary && (
            <SidebarRateLimitSummary summary={accountView.rateLimitSummary} />
          )}
          {actionItems.map((item) => (
            <button
              key={item.id}
              className="hc-sidebar-account-menu-item"
              data-tone={item.tone}
              disabled={item.disabled}
              role="menuitem"
              type="button"
              onClick={() => runMenuItem(item)}
            >
              <LogOut size={14} aria-hidden="true" />
              <span>{item.label}</span>
              {item.value && <small>{item.value}</small>}
            </button>
          ))}
        </div>
      )}
      {confirmingSignOut && createPortal(
        <LogOutConfirmDialog
          resolvedUiTheme={resolvedUiTheme}
          onCancel={cancelSignOut}
          onConfirm={confirmSignOut}
        />,
        document.body,
      )}
    </div>
  );
}

/*
 * codex profile-dropdown logOutConfirmation dialog. Clean-room confirmation
 * gate shown before signing out (Codex pops the same Log out? / "You'll need to
 * sign in again…" / Log out · Cancel dialog). Reuses HiCodex's existing
 * settings-backdrop + thread-dialog-panel chrome and i18n ids that mirror
 * codex.profileDropdown.logOutConfirmation.*.
 */
function LogOutConfirmDialog({
  resolvedUiTheme,
  onCancel,
  onConfirm,
}: {
  resolvedUiTheme: "light" | "dark";
  onCancel: () => void;
  onConfirm: () => void;
}) {
  const { formatMessage } = useHiCodexIntl();
  const title = formatMessage({ id: "codex.profileDropdown.logOutConfirmation.title", defaultMessage: "Log out?" });
  return (
    <div className="hc-settings-backdrop hc-log-out-confirm-backdrop" data-theme={resolvedUiTheme} role="presentation" onMouseDown={onCancel}>
      <section
        className="hc-thread-dialog-panel hc-log-out-confirm-dialog"
        role="dialog"
        data-state="open"
        aria-modal="true"
        aria-label={title}
        onMouseDown={(event) => event.stopPropagation()}
        onKeyDown={(event) => {
          if (event.key === "Escape") onCancel();
        }}
      >
        <header>
          <div><LogOut size={16} /> {title}</div>
          <button type="button" aria-label={formatMessage({ id: "common.close", defaultMessage: "Close" })} onClick={onCancel}><X size={16} /></button>
        </header>
        <div className="hc-thread-dialog-body">
          <span>{formatMessage({ id: "codex.profileDropdown.logOutConfirmation.subtitle", defaultMessage: "You’ll need to sign in again to keep using Codex" })}</span>
        </div>
        <footer>
          <button type="button" className="hc-mini-button ghost" onClick={onCancel}>{formatMessage({ id: "codex.profileDropdown.logOutConfirmation.cancel", defaultMessage: "Cancel" })}</button>
          <button type="button" className="hc-mini-button decline" autoFocus onClick={onConfirm}>
            {formatMessage({ id: "codex.profileDropdown.logOutConfirmation.confirm", defaultMessage: "Log out" })}
          </button>
        </footer>
      </section>
    </div>
  );
}

function SidebarRateLimitSummary({ summary }: { summary: RateLimitCompactSummary }) {
  return (
    <div className="hc-sidebar-rate-limit-summary" role="group" aria-label={summary.heading}>
      <div className="hc-sidebar-rate-limit-summary-heading">
        <Gauge size={14} aria-hidden="true" />
        <span>{summary.heading}</span>
        {summary.remainingText && <small>{summary.remainingText}</small>}
      </div>
      <div className="hc-sidebar-rate-limit-summary-rows">
        {summary.sections.map((section) => (
          <div className="hc-sidebar-rate-limit-section" key={section.id}>
            {section.label && <div className="hc-sidebar-rate-limit-section-label">{section.label}</div>}
            {section.windows.map((window) => (
              <div className="hc-sidebar-rate-limit-row" key={`${section.id}:${window.id}`}>
                <span className="hc-sidebar-rate-limit-window">{compactWindowLabel(window.label)}</span>
                <span className="hc-sidebar-rate-limit-remaining">{window.remainingText}</span>
                {window.resetText && <small>{window.resetText}</small>}
              </div>
            ))}
          </div>
        ))}
      </div>
    </div>
  );
}

function ThreadPinIndicator({
  isPinned,
  isUnread,
  onToggleThreadPinned,
  thread,
}: {
  isPinned: boolean;
  isUnread: boolean;
  onToggleThreadPinned: (thread: Thread, pinned: boolean) => void | Promise<void>;
  thread: Thread;
}) {
  const { formatMessage } = useHiCodexIntl();
  if (isUnread) {
    return <span className={threadPinIndicatorClass} aria-hidden="true" />;
  }
  const pinLabel = isPinned
    ? formatMessage({ id: "sidebarElectron.unpinThread", defaultMessage: "Unpin chat" })
    : formatMessage({ id: "sidebarElectron.pinThread", defaultMessage: "Pin chat" });
  return (
    <span className={threadPinIndicatorClass}>
      <button
        type="button"
        className={cx(
          threadPinIndicatorButtonClass,
          isPinned && threadPinIndicatorButtonVisibleClass,
        )}
        title={pinLabel}
        aria-label={pinLabel}
        onClick={(event) => {
          event.stopPropagation();
          void onToggleThreadPinned(thread, !isPinned);
        }}
        onPointerDown={(event) => event.stopPropagation()}
      >
        <Pin size={14} />
      </button>
    </span>
  );
}

function SidebarNavItem({
  active = false,
  disabled = false,
  icon,
  label,
  // codex: electron-menu-shortcuts-*.js — Codex Desktop sidebar nav entries
  // render the platform-formatted accelerator alongside the label (matching the
  // tooltip surfaced in its command menu).
  accelerator,
  onClick,
}: {
  active?: boolean;
  disabled?: boolean;
  icon: ReactNode;
  label: string;
  accelerator?: string | null;
  onClick: () => void;
}) {
  const acceleratorHint = typeof accelerator === "string" && accelerator.length > 0 ? accelerator : null;
  return (
    <button
      className={`hc-sidebar-nav-item ${active ? "is-active" : ""}`}
      disabled={disabled}
      onClick={onClick}
      type="button"
      title={acceleratorHint ? `${label} (${acceleratorHint})` : label}
    >
      <span className="hc-sidebar-nav-icon" aria-hidden="true">{icon}</span>
      <span className="hc-sidebar-nav-label">{label}</span>
      {acceleratorHint && (
        <kbd className="hc-sidebar-nav-accelerator" aria-hidden="true">
          {acceleratorHint}
        </kbd>
      )}
    </button>
  );
}
