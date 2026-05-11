import {
  Check,
  Copy,
} from "lucide-react";
import { useState } from "react";
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
  return (
    <div className="hc-copy-toast" role="status" aria-live="polite">
      <span className="hc-copy-toast-icon" aria-hidden="true"><Check size={15} /></span>
      <span>Copied to clipboard</span>
    </div>
  );
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
