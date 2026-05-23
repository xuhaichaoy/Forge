import {
  Check,
  Copy,
} from "lucide-react";
import { useState } from "react";
import { createPortal } from "react-dom";
import type { MouseEvent, ReactNode } from "react";

export function MessageActionRow({
  children,
  copyText,
  hasActionChildren = false,
  persistent = false,
  sentAtMs,
}: {
  children?: ReactNode;
  copyText: string;
  hasActionChildren?: boolean;
  persistent?: boolean;
  sentAtMs: number | null;
}) {
  const trimmedCopyText = copyText.trim();
  const [copied, setCopied] = useState(false);
  if (!shouldRenderMessageActionRow({ copyText, hasActionChildren })) return null;
  const handleCopy = async (event: MouseEvent<HTMLButtonElement>) => {
    event.stopPropagation();
    if (trimmedCopyText.length === 0) return;
    await navigator.clipboard.writeText(trimmedCopyText);
    setCopied(true);
    window.setTimeout(() => setCopied(false), 1500);
  };
  return (
    <>
      <div className="hc-message-actions" data-persistent={persistent || undefined}>
        {trimmedCopyText.length > 0 && (
          <button aria-label={copied ? "Copied" : "Copy message"} title={copied ? "Copied" : "Copy"} type="button" onClick={handleCopy}>
            {copied ? <Check size={13} /> : <Copy size={13} />}
          </button>
        )}
        {children}
        {sentAtMs !== null && <span className="hc-message-time">{formatMessageSentAt(sentAtMs)}</span>}
      </div>
      {copied && <CopyFeedbackToast />}
    </>
  );
}

export function shouldRenderMessageActionRow({
  copyText,
  hasActionChildren = false,
}: {
  copyText: string;
  hasActionChildren?: boolean;
}): boolean {
  return copyText.trim().length > 0 || hasActionChildren;
}

export function IconActionButton({
  ariaLabel,
  children,
  onClick,
  title,
}: {
  ariaLabel: string;
  children: ReactNode;
  onClick: () => void;
  title: string;
}) {
  return (
    <button
      aria-label={ariaLabel}
      title={title}
      type="button"
      onClick={(event) => {
        event.stopPropagation();
        onClick();
      }}
    >
      {children}
    </button>
  );
}

function CopyFeedbackToast() {
  /*
   * `.hc-copy-toast` uses `position: fixed`, but the conversation scroll
   * container (`hc-thread-scroll-body` in conversation.css:46) has
   * `transform: translateX(...)` for inline-side-panel offsets. When a fixed
   * descendant lives under a transformed ancestor, the CSS spec re-roots its
   * coordinate system to that ancestor instead of the viewport — so the
   * toast ended up trapped behind the user message bubble (HiCodex screenshot
   * 2026-05-21 "复制提示被盖住"). Render into `document.body` via a portal so
   * the toast escapes any transformed scroll container and stays anchored at
   * the top of the actual viewport.
   *
   * SSR / non-browser fallback: returns the bare node so React can still
   * render to string without portal infrastructure.
   */
  const toast = (
    <div className="hc-copy-toast" role="status" aria-live="polite">
      <span className="hc-copy-toast-icon" aria-hidden="true"><Check size={15} /></span>
      <span>Copied to clipboard</span>
    </div>
  );
  if (typeof document === "undefined") return toast;
  return createPortal(toast, document.body);
}

function formatMessageSentAt(sentAtMs: number): string {
  const date = new Date(sentAtMs);
  if (!Number.isFinite(date.getTime())) return "";
  const now = new Date();
  const dayDelta = calendarDayDelta(date, now);
  if (dayDelta < 0 && dayDelta > -7) {
    return new Intl.DateTimeFormat(undefined, {
      weekday: "long",
      hour: "numeric",
      minute: "2-digit",
    }).format(date);
  }
  if (dayDelta !== 0) {
    return new Intl.DateTimeFormat(undefined, {
      month: "short",
      day: "numeric",
      hour: "numeric",
      minute: "2-digit",
    }).format(date);
  }
  return new Intl.DateTimeFormat(undefined, {
    hour: "numeric",
    minute: "2-digit",
  }).format(date);
}

function calendarDayDelta(left: Date, right: Date): number {
  const leftDay = new Date(left.getFullYear(), left.getMonth(), left.getDate()).getTime();
  const rightDay = new Date(right.getFullYear(), right.getMonth(), right.getDate()).getTime();
  return Math.round((leftDay - rightDay) / 86_400_000);
}
