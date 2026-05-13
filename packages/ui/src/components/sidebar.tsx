import {
  AlertCircle,
  Archive,
  Calendar,
  Check,
  ChevronDown,
  ChevronRight,
  Clock,
  Folder,
  FolderPlus,
  ListFilter,
  Loader2,
  Maximize2,
  MessageSquarePlus,
  Minimize2,
  Pin,
  Plug,
  Search,
  Settings,
} from "lucide-react";
import { useState, type MouseEvent, type ReactNode } from "react";
import type { Thread } from "@hicodex/codex-protocol";
import {
  projectSidebarThreadGroups,
  sidebarThreadHasVisibleStatus,
  sidebarThreadRelativeTime,
  sidebarThreadStatusState,
  type SidebarSortKey,
  type SidebarThreadStatusState,
} from "../state/sidebar-projection";
import { threadTitle } from "../state/thread-workflow";

const threadRowClass =
  "group relative flex h-token-nav-row cursor-interaction rounded-lg px-row-x py-row-y text-sm hover:bg-token-list-hover-background focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-[-2px] focus-visible:outline-[var(--vscode-focusBorder)]";
const threadRowActiveClass = "bg-token-list-hover-background";
const threadRowContentClass =
  "flex min-w-0 flex-1 self-stretch items-center gap-2 text-base leading-5 text-token-foreground";
const threadActionGroupClass =
  "hc-thread-actions flex items-center gap-0 opacity-0 group-hover:opacity-100 group-focus-within:opacity-100";
const threadArchiveActionClass =
  "absolute right-0 top-0 z-10 flex h-full items-center justify-center mr-0.5 pr-0.5";
const threadIconButtonClass =
  "pointer-events-none flex h-5 w-5 items-center justify-center rounded-md border-0 bg-transparent p-0 text-inherit opacity-0 group-focus-within:pointer-events-auto group-focus-within:opacity-100 group-hover:pointer-events-auto group-hover:opacity-50 hover:opacity-100 focus-visible:pointer-events-auto focus-visible:opacity-100 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--vscode-focusBorder)]";
const threadConfirmArchiveButtonClass =
  "hc-thread-confirm-archive pointer-events-auto inline-flex h-auto items-center justify-center rounded-md px-3 py-0 text-sm leading-5";
const threadPinIndicatorClass = "h-5 w-5 shrink-0";
const threadPinIndicatorButtonClass =
  "hc-thread-pin-button relative flex h-5 w-5 items-center justify-center border-0 bg-transparent p-0 leading-none text-token-description-foreground hover:opacity-100 focus-visible:pointer-events-auto focus-visible:opacity-100 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--vscode-focusBorder)]";
const threadPinIndicatorButtonVisibleClass = "is-pinned";
const threadMenuClass =
  "fixed z-50 m-px flex w-[220px] select-none flex-col overflow-y-auto rounded-xl bg-token-dropdown-background px-1 py-1 text-token-foreground shadow-xl-spread ring-[0.5px] ring-token-border backdrop-blur-sm";
const threadMenuItemClass =
  "flex w-full appearance-none items-center rounded-lg border-0 bg-transparent px-row-x py-row-y text-left text-sm text-token-foreground hover:bg-token-list-hover-background disabled:cursor-default disabled:opacity-50 disabled:hover:bg-transparent";
const threadMenuSeparatorClass = "w-full px-row-x py-1";

export interface SidebarProps {
  threads: Thread[];
  activeThreadId: string | null;
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
  sortKey?: SidebarSortKey;
  onSortKeyChange?: (sortKey: SidebarSortKey) => void;
  getThreadTitle?: (thread: Thread) => string;
}

export function Sidebar({
  threads,
  activeThreadId,
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
  sortKey = "updated_at",
  onSortKeyChange,
  getThreadTitle = threadTitle,
}: SidebarProps) {
  const [openThreadMenu, setOpenThreadMenu] = useState<{
    threadId: string;
    x: number;
    y: number;
  } | null>(null);
  const openMenuThreadId = openThreadMenu?.threadId ?? null;
  const [openSectionMenu, setOpenSectionMenu] = useState<"filter" | "add-project" | null>(null);
  const [collapsedGroupKeys, setCollapsedGroupKeys] = useState<Set<string>>(() => new Set());
  const [previouslyExpandedGroupKeys, setPreviouslyExpandedGroupKeys] = useState<string[]>([]);
  const [confirmingArchiveThreadId, setConfirmingArchiveThreadId] = useState<string | null>(null);
  const threadGroups = projectSidebarThreadGroups(threads);
  const sectionCollapseAction = projectSectionCollapseAction(
    threadGroups.map((group) => group.key),
    collapsedGroupKeys,
    previouslyExpandedGroupKeys,
  );

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

  const openContextMenu = (event: MouseEvent, thread: Thread) => {
    event.preventDefault();
    event.stopPropagation();
    setConfirmingArchiveThreadId(null);
    setOpenThreadMenu({ threadId: thread.id, x: event.clientX, y: event.clientY });
  };

  const closeThreadMenu = () => {
    setOpenThreadMenu(null);
  };

  const requestArchiveConfirmation = (thread: Thread) => {
    setOpenThreadMenu(null);
    setConfirmingArchiveThreadId(thread.id);
  };

  const clearArchiveConfirmation = (thread: Thread) => {
    setConfirmingArchiveThreadId((current) => current === thread.id ? null : current);
  };

  const toggleGroup = (key: string) => {
    setCollapsedGroupKeys((current) => {
      const next = new Set(current);
      if (next.has(key)) {
        next.delete(key);
      } else {
        next.add(key);
      }
      return next;
    });
  };

  const runSectionCollapseAction = () => {
    const groupKeys = threadGroups.map((group) => group.key);
    if (sectionCollapseAction === "collapse-all") {
      const expanded = groupKeys.filter((key) => !collapsedGroupKeys.has(key));
      setCollapsedGroupKeys(new Set(groupKeys));
      setPreviouslyExpandedGroupKeys(expanded);
      return;
    }
    if (sectionCollapseAction === "reopen-previous") {
      setCollapsedGroupKeys((current) => {
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

  const useExistingFolder = () => {
    setOpenSectionMenu(null);
    void onUseExistingFolder?.();
  };

  return (
    <aside className="hc-sidebar">
      <div className="hc-sidebar-nav">
        <SidebarNavItem
          icon={connecting ? <Loader2 className="hc-spin" size={17} /> : <MessageSquarePlus size={17} />}
          label={connected ? "New chat" : "Connect"}
          onClick={() => void (connected ? onCreateThread() : onConnect())}
          disabled={connecting}
        />
        <SidebarNavItem
          icon={<Search size={17} />}
          label="Search"
          onClick={() => void onOpenSearch()}
        />
        <SidebarNavItem
          icon={<Plug size={17} />}
          label="Plugins"
          onClick={() => void onOpenPlugins?.()}
          disabled={!onOpenPlugins}
        />
        {onOpenAutomations && (
          <SidebarNavItem
            icon={<Clock size={17} />}
            label="Automations"
            onClick={() => void onOpenAutomations()}
          />
        )}
      </div>

      <div className="hc-thread-list">
        <div className={`hc-thread-section-header ${openSectionMenu ? "is-menu-open" : ""}`}>
          <div className="hc-thread-section-label">Projects</div>
          <div className="hc-thread-section-actions" aria-label="Projects actions">
            {sectionCollapseAction && (
              <button
                type="button"
                className="hc-sidebar-section-action"
                title={sectionCollapseAction === "collapse-all" ? "Collapse all" : "Reopen previous"}
                aria-label={sectionCollapseAction === "collapse-all" ? "Collapse all projects" : "Reopen previous projects"}
                onClick={runSectionCollapseAction}
              >
                {sectionCollapseAction === "collapse-all" ? <Minimize2 size={13} /> : <Maximize2 size={13} />}
              </button>
            )}
            <button
              type="button"
              className="hc-sidebar-section-action"
              title="Filter sidebar chats"
              aria-label="Filter sidebar chats"
              aria-haspopup="menu"
              aria-expanded={openSectionMenu === "filter"}
              onClick={() => setOpenSectionMenu((menu) => menu === "filter" ? null : "filter")}
            >
              <ListFilter size={13} />
            </button>
            {openSectionMenu === "filter" && (
              <div className="hc-thread-menu hc-sidebar-section-menu" role="menu">
                <div className="hc-thread-menu-title">Sort by</div>
                <button
                  type="button"
                  className="hc-thread-menu-item"
                  role="menuitem"
                  onClick={() => chooseSortKey("updated_at")}
                >
                  <Clock size={13} />
                  <span>Updated</span>
                  {sortKey === "updated_at" && <Check size={13} className="hc-thread-menu-check" />}
                </button>
                <button
                  type="button"
                  className="hc-thread-menu-item"
                  role="menuitem"
                  onClick={() => chooseSortKey("created_at")}
                >
                  <Calendar size={13} />
                  <span>Created</span>
                  {sortKey === "created_at" && <Check size={13} className="hc-thread-menu-check" />}
                </button>
              </div>
            )}
            {onUseExistingFolder && (
              <>
                <button
                  type="button"
                  className="hc-sidebar-section-action"
                  title="Add new project"
                  aria-label="Add new project"
                  aria-haspopup="menu"
                  aria-expanded={openSectionMenu === "add-project"}
                  onClick={() => setOpenSectionMenu((menu) => menu === "add-project" ? null : "add-project")}
                >
                  <FolderPlus size={13} />
                </button>
                {openSectionMenu === "add-project" && (
                  <div className="hc-thread-menu hc-sidebar-section-menu" role="menu">
                    <button
                      type="button"
                      className="hc-thread-menu-item"
                      role="menuitem"
                      onClick={useExistingFolder}
                    >
                      <Folder size={13} />
                      <span>Use an existing folder</span>
                    </button>
                  </div>
                )}
              </>
            )}
          </div>
        </div>
        {threadGroups.length === 0 && (
          <div className="hc-empty-panel">No chats yet</div>
        )}
        {threadGroups.map((group) => (
          <div className="hc-thread-group" key={group.key}>
            <button
              className="hc-project-row"
              type="button"
              aria-expanded={!collapsedGroupKeys.has(group.key)}
              onClick={() => toggleGroup(group.key)}
              title={group.path ?? group.label}
            >
              {collapsedGroupKeys.has(group.key) ? <ChevronRight size={14} /> : <ChevronDown size={14} />}
              <Folder size={16} />
              <span className="hc-project-name">{group.label}</span>
            </button>
            {!collapsedGroupKeys.has(group.key) && group.threads.map((thread) => {
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
                  <div className={cx(threadActionGroupClass, threadArchiveActionClass, isConfirmingArchive && "pl-1 opacity-100")} aria-label="Thread actions">
                    {isConfirmingArchive ? (
                      <button
                        type="button"
                        className={threadConfirmArchiveButtonClass}
                        title="Confirm"
                        aria-label="Confirm"
                        onClick={(event) => {
                          event.stopPropagation();
                          runThreadAction(thread, onArchiveThread);
                        }}
                        onPointerDown={(event) => event.stopPropagation()}
                      >
                        Confirm
                      </button>
                    ) : (
                      <button
                        type="button"
                        className={threadIconButtonClass}
                        title="Archive chat"
                        aria-label="Archive chat"
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
                  {openThreadMenu && openMenuThreadId === thread.id && (
                    <div
                      className={threadMenuClass}
                      role="menu"
                      style={{ left: openThreadMenu.x, top: openThreadMenu.y }}
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
                          {isPinned ? "Unpin chat" : "Pin chat"}
                        </button>
                      )}
                      <button
                        type="button"
                        className={threadMenuItemClass}
                        role="menuitem"
                        onClick={() => runThreadAction(thread, onRenameThread)}
                      >
                        Rename chat
                      </button>
                      <button
                        type="button"
                        className={threadMenuItemClass}
                        role="menuitem"
                        onClick={() => runThreadAction(thread, onArchiveThread)}
                      >
                        Archive chat
                      </button>
                      <button
                        type="button"
                        className={threadMenuItemClass}
                        role="menuitem"
                        disabled={isUnread || !onMarkThreadUnread}
                        onClick={() => runOptionalThreadAction(thread, onMarkThreadUnread)}
                      >
                        Mark as unread
                      </button>
                      <div className={threadMenuSeparatorClass}>
                          <div className="h-px w-full bg-token-menu-border" />
                      </div>
                      <button
                        type="button"
                        className={threadMenuItemClass}
                        role="menuitem"
                        disabled={!threadCwd || !onOpenThreadFolder}
                        onClick={() => runOptionalThreadAction(thread, onOpenThreadFolder)}
                      >
                        Open in Finder
                      </button>
                      <button
                        type="button"
                        className={threadMenuItemClass}
                        role="menuitem"
                        disabled={!threadCwd || !onCopyWorkingDirectory}
                        onClick={() => runOptionalThreadAction(thread, onCopyWorkingDirectory)}
                      >
                        Copy working directory
                      </button>
                      <button
                        type="button"
                        className={threadMenuItemClass}
                        role="menuitem"
                        disabled={!onCopySessionId}
                        onClick={() => runOptionalThreadAction(thread, onCopySessionId)}
                      >
                        Copy session ID
                      </button>
                      <button
                        type="button"
                        className={threadMenuItemClass}
                        role="menuitem"
                        disabled={!onCopyDeeplink}
                        onClick={() => runOptionalThreadAction(thread, onCopyDeeplink)}
                      >
                        Copy deeplink
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
                        Fork into local
                      </button>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        ))}
      </div>

      <div className="hc-sidebar-footer">
        <SidebarNavItem icon={<Settings size={17} />} label="Settings" onClick={onOpenSettings} />
      </div>
    </aside>
  );
}

function cx(...classes: Array<string | false | null | undefined>) {
  return classes.filter(Boolean).join(" ");
}

function projectSectionCollapseAction(
  groupKeys: string[],
  collapsedGroupKeys: Set<string>,
  previouslyExpandedGroupKeys: string[],
): "collapse-all" | "reopen-previous" | null {
  const expanded = groupKeys.filter((key) => !collapsedGroupKeys.has(key));
  if (expanded.length > 1) return "collapse-all";
  const visibleKeys = new Set(groupKeys);
  return expanded.length === 0 && previouslyExpandedGroupKeys.some((key) => visibleKeys.has(key))
    ? "reopen-previous"
    : null;
}

function ThreadStatusIndicator({ state }: { state: SidebarThreadStatusState }) {
  if (!sidebarThreadHasVisibleStatus(state)) return null;
  if (state.type === "loading") {
    return (
      <span
        className="grid h-4 w-4 place-items-center text-token-description-foreground"
        title="Chat in progress"
        aria-label="Chat in progress"
      >
        <Loader2 className="hc-spin" size={13} />
      </span>
    );
  }
  if (state.type === "error") {
    return (
      <span
        className="grid h-4 w-4 place-items-center text-[#a14335]"
        title="Chat has an error"
        aria-label="Chat has an error"
      >
        <AlertCircle size={13} />
      </span>
    );
  }
  return (
    <span
      className="grid h-4 w-4 place-items-center text-token-description-foreground"
      title="Unread chat"
      aria-label="Unread chat"
    >
      <span className="block h-1.5 w-1.5 rounded-full bg-[#2f6fed]" />
    </span>
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
  if (isUnread) {
    return <span className={threadPinIndicatorClass} aria-hidden="true" />;
  }
  return (
    <span className={threadPinIndicatorClass}>
      <button
        type="button"
        className={cx(
          threadPinIndicatorButtonClass,
          isPinned && threadPinIndicatorButtonVisibleClass,
        )}
        title={isPinned ? "Unpin chat" : "Pin chat"}
        aria-label={isPinned ? "Unpin chat" : "Pin chat"}
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
  onClick,
}: {
  active?: boolean;
  disabled?: boolean;
  icon: ReactNode;
  label: string;
  onClick: () => void;
}) {
  return (
    <button
      className={`hc-sidebar-nav-item ${active ? "is-active" : ""}`}
      disabled={disabled}
      onClick={onClick}
      type="button"
    >
      <span className="hc-sidebar-nav-icon" aria-hidden="true">{icon}</span>
      <span className="hc-sidebar-nav-label">{label}</span>
    </button>
  );
}
