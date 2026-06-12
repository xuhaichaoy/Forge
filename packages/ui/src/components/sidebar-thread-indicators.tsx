import type { Thread } from "@hicodex/codex-protocol";
import { Loader2, Pin } from "lucide-react";
import type { SidebarThreadStatusState } from "../state/sidebar-projection";
import { useHiCodexIntl } from "./i18n-provider";

const threadPinIndicatorClass = "h-5 w-5 shrink-0";
const threadPinIndicatorButtonClass =
  "hc-thread-pin-button relative flex h-5 w-5 items-center justify-center border-0 bg-transparent p-0 leading-none text-token-description-foreground hover:opacity-100 focus-visible:pointer-events-auto focus-visible:opacity-100 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--vscode-focusBorder)]";
const threadPinIndicatorButtonVisibleClass = "is-pinned";

/*
 * codex local-task-row-*.js inline status slot. Priority order is
 * unreadCount badge -> loading spinner -> unread dot -> nothing. There is NO
 * inline `error` branch in Codex (the system-error state is conveyed by the
 * row's text color, not an icon), so HiCodex no longer paints the red
 * AlertCircle that used to live here.
 */
export function ThreadStatusIndicator({ state }: { state: SidebarThreadStatusState }) {
  const { formatMessage } = useHiCodexIntl();
  // codex `Ee`: numeric unread badge, count>99 -> "99+", textLink-tinted fill
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

export function ThreadPinIndicator({
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

function cx(...classes: Array<string | false | null | undefined>) {
  return classes.filter(Boolean).join(" ");
}
