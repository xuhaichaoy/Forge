import { Archive } from "lucide-react";
import type { MouseEvent, RefObject } from "react";
import type { Thread } from "@hicodex/codex-protocol";
import {
  sidebarThreadHasVisibleStatus,
  sidebarThreadRelativeTime,
  sidebarThreadStatusState,
} from "../state/sidebar-projection";
import { useHiCodexIntl } from "./i18n-provider";
import { ThreadPinIndicator, ThreadStatusIndicator } from "./sidebar-thread-indicators";
import {
  SidebarThreadMenu,
  type SidebarThreadMenuState,
} from "./sidebar-thread-menu";
export {
  sidebarBrowserViewportSize,
  sidebarContextMenuPosition,
  type SidebarThreadMenuState,
} from "./sidebar-thread-menu";

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
export interface SidebarThreadRowProps {
  activeThreadIsWorktree: boolean;
  isActive: boolean;
  isConfirmingArchive: boolean;
  isPinned: boolean;
  menuState: SidebarThreadMenuState | null;
  menuRef: RefObject<HTMLDivElement | null>;
  onArchiveThread: (thread: Thread) => void | Promise<void>;
  /** Clears a pending confirmation on ANY row — used before row actions. */
  onClearAnyArchiveConfirmation: () => void;
  /** Clears the confirmation only when it belongs to THIS row (pointer-leave). */
  onClearArchiveConfirmation: (thread: Thread) => void;
  onCloseThreadMenu: () => void;
  onContextMenu: (event: MouseEvent, thread: Thread) => void;
  onCopyDeeplink?: (thread: Thread) => void | Promise<void>;
  onCopySessionId?: (thread: Thread) => void | Promise<void>;
  onCopyWorkingDirectory?: (thread: Thread) => void | Promise<void>;
  onForkThread: (thread: Thread) => void | Promise<void>;
  onForkThreadIntoWorktree?: (thread: Thread) => void | Promise<void>;
  onMarkThreadUnread?: (thread: Thread) => void | Promise<void>;
  onOpenThreadFolder?: (thread: Thread) => void | Promise<void>;
  onOpenThreadWindow?: (thread: Thread) => void | Promise<void>;
  onRenameThread: (thread: Thread) => void | Promise<void>;
  onRequestArchiveConfirmation: (thread: Thread) => void;
  onSelectThread: (thread: Thread) => void | Promise<void>;
  onToggleThreadPinned?: (thread: Thread, pinned: boolean) => void | Promise<void>;
  thread: Thread;
  title: string;
}

export function SidebarThreadRow({
  activeThreadIsWorktree,
  isActive,
  isConfirmingArchive,
  isPinned,
  menuState,
  menuRef,
  onArchiveThread,
  onClearAnyArchiveConfirmation,
  onClearArchiveConfirmation,
  onCloseThreadMenu,
  onContextMenu,
  onCopyDeeplink,
  onCopySessionId,
  onCopyWorkingDirectory,
  onForkThread,
  onForkThreadIntoWorktree,
  onMarkThreadUnread,
  onOpenThreadFolder,
  onOpenThreadWindow,
  onRenameThread,
  onRequestArchiveConfirmation,
  onSelectThread,
  onToggleThreadPinned,
  thread,
  title,
}: SidebarThreadRowProps) {
  const { formatMessage } = useHiCodexIntl();
  const relativeTime = sidebarThreadRelativeTime(thread);
  const statusState = sidebarThreadStatusState(thread);
  const isUnread = statusState.unread;
  const threadCwd = typeof thread.cwd === "string" ? thread.cwd.trim() : "";
  const menuOpen = menuState?.threadId === thread.id;

  const runThreadAction = (action: (thread: Thread) => void | Promise<void>) => {
    onCloseThreadMenu();
    onClearAnyArchiveConfirmation();
    void action(thread);
  };

  const runOptionalThreadAction = (
    action: ((thread: Thread) => void | Promise<void>) | undefined,
  ) => {
    if (!action) return;
    runThreadAction(action);
  };

  return (
    <div
      key={thread.id}
      className={cx("hc-sidebar-thread-row", threadRowClass, isActive && threadRowActiveClass)}
      data-confirming-archive={isConfirmingArchive ? "true" : undefined}
      onContextMenu={(event) => onContextMenu(event, thread)}
      onPointerLeave={() => onClearArchiveConfirmation(thread)}
      onClick={(event) => {
        if (isConfirmingArchive) {
          event.preventDefault();
          event.stopPropagation();
          return;
        }
        onCloseThreadMenu();
        onClearAnyArchiveConfirmation();
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
        onCloseThreadMenu();
        onClearAnyArchiveConfirmation();
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
              runThreadAction(onArchiveThread);
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
              onRequestArchiveConfirmation(thread);
            }}
            onPointerDown={(event) => event.stopPropagation()}
          >
            <Archive size={14} />
          </button>
        )}
      </div>
      {menuOpen && menuState && (
        <SidebarThreadMenu
          activeThreadIsWorktree={activeThreadIsWorktree}
          isActive={isActive}
          isPinned={isPinned}
          isUnread={isUnread}
          menuRef={menuRef}
          menuState={menuState}
          onArchiveThread={onArchiveThread}
          onCloseThreadMenu={onCloseThreadMenu}
          onCopyDeeplink={onCopyDeeplink}
          onCopySessionId={onCopySessionId}
          onCopyWorkingDirectory={onCopyWorkingDirectory}
          onForkThread={onForkThread}
          onForkThreadIntoWorktree={onForkThreadIntoWorktree}
          onMarkThreadUnread={onMarkThreadUnread}
          onOpenThreadFolder={onOpenThreadFolder}
          onOpenThreadWindow={onOpenThreadWindow}
          onRenameThread={onRenameThread}
          onRunThreadAction={runThreadAction}
          onRunOptionalThreadAction={runOptionalThreadAction}
          onToggleThreadPinned={onToggleThreadPinned}
          thread={thread}
          threadCwd={threadCwd}
        />
      )}
    </div>
  );
}

function cx(...classes: Array<string | false | null | undefined>) {
  return classes.filter(Boolean).join(" ");
}
