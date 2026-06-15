import { createPortal } from "react-dom";
import type { RefObject } from "react";
import type { Thread } from "@forge/codex-protocol";
import { osRevealLabel } from "../state/command-registry";
import { useForgeIntl } from "./i18n-provider";

const threadMenuWidthPx = 220;
const threadMenuEstimatedHeightPx = 360;
const threadMenuViewportMarginPx = 8;
const threadMenuClass =
  "hc-app-popover-menu fixed z-50 m-px flex w-[220px] select-none flex-col overflow-y-auto rounded-xl bg-token-dropdown-background px-1 py-1 text-token-foreground shadow-xl-spread ring-[0.5px] ring-token-border backdrop-blur-sm";
const threadMenuItemClass =
  "flex w-full appearance-none items-center rounded-lg border-0 bg-transparent px-row-x py-row-y text-left text-sm text-token-foreground hover:bg-token-list-hover-background disabled:cursor-default disabled:opacity-50 disabled:hover:bg-transparent";
const threadMenuSeparatorClass = "w-full px-row-x py-1";

export interface SidebarThreadMenuState {
  threadId: string;
  x: number;
  y: number;
}

interface SidebarThreadMenuProps {
  activeThreadIsWorktree: boolean;
  isActive: boolean;
  isPinned: boolean;
  isUnread: boolean;
  menuRef: RefObject<HTMLDivElement | null>;
  menuState: SidebarThreadMenuState;
  onArchiveThread: (thread: Thread) => void | Promise<void>;
  onCloseThreadMenu: () => void;
  onCopyDeeplink?: (thread: Thread) => void | Promise<void>;
  onCopySessionId?: (thread: Thread) => void | Promise<void>;
  onCopyWorkingDirectory?: (thread: Thread) => void | Promise<void>;
  onForkThread: (thread: Thread) => void | Promise<void>;
  onForkThreadIntoWorktree?: (thread: Thread) => void | Promise<void>;
  onMarkThreadUnread?: (thread: Thread) => void | Promise<void>;
  onOpenThreadFolder?: (thread: Thread) => void | Promise<void>;
  onOpenThreadWindow?: (thread: Thread) => void | Promise<void>;
  onRenameThread: (thread: Thread) => void | Promise<void>;
  onRunThreadAction: (action: (thread: Thread) => void | Promise<void>) => void;
  onRunOptionalThreadAction: (action: ((thread: Thread) => void | Promise<void>) | undefined) => void;
  onToggleThreadPinned?: (thread: Thread, pinned: boolean) => void | Promise<void>;
  thread: Thread;
  threadCwd: string;
}

export function SidebarThreadMenu({
  activeThreadIsWorktree,
  isActive,
  isPinned,
  isUnread,
  menuRef,
  menuState,
  onArchiveThread,
  onCloseThreadMenu,
  onCopyDeeplink,
  onCopySessionId,
  onCopyWorkingDirectory,
  onForkThread,
  onForkThreadIntoWorktree,
  onMarkThreadUnread,
  onOpenThreadFolder,
  onOpenThreadWindow,
  onRenameThread,
  onRunThreadAction,
  onRunOptionalThreadAction,
  onToggleThreadPinned,
  thread,
  threadCwd,
}: SidebarThreadMenuProps) {
  const { formatMessage } = useForgeIntl();

  return createPortal(
    <div
      className={threadMenuClass}
      ref={menuRef}
      role="menu"
      /*
       * `data-state="open"` so Forge's global type-to-focus selector
       * (`ForgeApp.tsx::focusComposerFromPlainTextKey`,
       * `[role="menu"][data-state="open"]`) treats this popover as
       * active. Mirrors the Radix-style marker Codex Desktop uses on
       * every interactive popover. Mount equals open here.
       */
      data-state="open"
      style={{
        left: menuState.x,
        maxHeight: `calc(100vh - ${threadMenuViewportMarginPx * 2}px)`,
        top: menuState.y,
      }}
      onClick={(event) => event.stopPropagation()}
    >
      {onToggleThreadPinned && (
        <button
          type="button"
          className={threadMenuItemClass}
          role="menuitem"
          onClick={() => {
            onCloseThreadMenu();
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
        onClick={() => onRunThreadAction(onRenameThread)}
      >
        {formatMessage({ id: "sidebarElectron.renameThread", defaultMessage: "Rename chat" })}
      </button>
      <button
        type="button"
        className={threadMenuItemClass}
        role="menuitem"
        onClick={() => onRunThreadAction(onArchiveThread)}
      >
        {formatMessage({ id: "codex.command.archiveThread", defaultMessage: "Archive chat" })}
      </button>
      <button
        type="button"
        className={threadMenuItemClass}
        role="menuitem"
        disabled={isUnread || !onMarkThreadUnread}
        onClick={() => onRunOptionalThreadAction(onMarkThreadUnread)}
      >
        {formatMessage({ id: "sidebarElectron.markThreadUnread", defaultMessage: "Mark as unread" })}
      </button>
      <SidebarThreadMenuSeparator />
      {onOpenThreadWindow && (
        // codex threadHeader.openInNewWindow — open this thread in a second app window.
        <button
          type="button"
          className={threadMenuItemClass}
          role="menuitem"
          onClick={() => onRunOptionalThreadAction(onOpenThreadWindow)}
        >
          {formatMessage({ id: "threadHeader.openInNewWindow", defaultMessage: "Open in new window" })}
        </button>
      )}
      <button
        type="button"
        className={threadMenuItemClass}
        role="menuitem"
        disabled={!threadCwd || !onOpenThreadFolder}
        onClick={() => onRunOptionalThreadAction(onOpenThreadFolder)}
      >
        {osRevealLabel()}
      </button>
      <button
        type="button"
        className={threadMenuItemClass}
        role="menuitem"
        disabled={!threadCwd || !onCopyWorkingDirectory}
        onClick={() => onRunOptionalThreadAction(onCopyWorkingDirectory)}
      >
        {formatMessage({ id: "threadHeader.copyWorkingDirectory", defaultMessage: "Copy working directory" })}
      </button>
      <button
        type="button"
        className={threadMenuItemClass}
        role="menuitem"
        disabled={!onCopySessionId}
        onClick={() => onRunOptionalThreadAction(onCopySessionId)}
      >
        {formatMessage({ id: "threadHeader.copySessionId", defaultMessage: "Copy session ID" })}
      </button>
      <button
        type="button"
        className={threadMenuItemClass}
        role="menuitem"
        disabled={!onCopyDeeplink}
        onClick={() => onRunOptionalThreadAction(onCopyDeeplink)}
      >
        {formatMessage({ id: "threadHeader.copyAppLink", defaultMessage: "Copy deeplink" })}
      </button>
      <SidebarThreadMenuSeparator />
      <button
        type="button"
        className={threadMenuItemClass}
        role="menuitem"
        onClick={() => onRunThreadAction(onForkThread)}
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
          onClick={() => onRunOptionalThreadAction(onForkThreadIntoWorktree)}
        >
          {formatMessage({ id: "threadHeader.forkIntoWorktree", defaultMessage: "Fork into new worktree" })}
        </button>
      )}
    </div>,
    document.body,
  );
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

export function sidebarBrowserViewportSize(): { width: number; height: number } {
  return {
    width: window.innerWidth || threadMenuWidthPx + threadMenuViewportMarginPx * 2,
    height: window.innerHeight || threadMenuEstimatedHeightPx + threadMenuViewportMarginPx * 2,
  };
}

function SidebarThreadMenuSeparator() {
  return (
    <div className={threadMenuSeparatorClass}>
      <div className="h-px w-full bg-token-menu-border" />
    </div>
  );
}

function clamp(value: number, min: number, max: number) {
  return Math.min(Math.max(value, min), max);
}
