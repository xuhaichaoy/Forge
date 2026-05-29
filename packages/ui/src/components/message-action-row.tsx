import {
  Check,
  Copy,
} from "lucide-react";
import { useState } from "react";
import { createPortal } from "react-dom";
import type { MouseEvent, ReactNode } from "react";

/*
 * CODEX-REF: copy-button-*.js — Codex Desktop's copy affordance.
 *
 * Aligned with Codex:
 *   - aria-label strings ("Copy" / "Copied") match Codex's i18n
 *     `copyButton.copyAriaLabel` / `copyButton.copiedAriaLabel` defaultMessages
 *   - timeout standardized to 2000ms (Codex's `2e3`, this file previously used 1500ms)
 *   - icon swap (Copy → Check) mirrors Codex's dual-state render
 *
 * Diverged from Codex (intentional, no Codex source to override):
 *   - HiCodex keeps the createPortal escape for the "Copied" feedback because
 *     `.hc-thread-scroll-body` has `transform: translateX(...)` which re-roots
 *     a `position: fixed` descendant to the transformed ancestor, trapping
 *     the toast behind the message bubble (regression captured in HiCodex
 *     screenshot 2026-05-21 "复制提示被盖住"). Codex Desktop's scroll body
 *     isn't transformed so an inline-only swap suffices there.
 *   - HiCodex renders an inline timestamp span; Codex's copy-button + thread-
 *     actions chunks contain no per-message timestamp affordance.
 */

const COPIED_RESET_TIMEOUT_MS = 2000;

/*
 * Codex Desktop's message action row renders a per-message timestamp as its
 * LAST child (after copy / artifacts / fork / etc.), revealed on hover/focus
 * alongside the other action affordances. Re-verified vs Codex Desktop
 * v26.519.81530: the assistant action row component appends a trailing
 * timestamp span (sentAtMs) inside the same hover-revealed actions container.
 * It lives inside `.hc-message-actions`, which is itself a hover/focus
 * affordance, so the timestamp inherits the same reveal behavior.
 */
export function MessageActionRow({
  children,
  copyText,
  hasActionChildren = false,
  persistent = false,
  sentAtMs = null,
}: {
  children?: ReactNode;
  copyText: string;
  hasActionChildren?: boolean;
  persistent?: boolean;
  sentAtMs?: number | null;
}) {
  const trimmedCopyText = copyText.trim();
  const [copied, setCopied] = useState(false);
  if (!shouldRenderMessageActionRow({ copyText, hasActionChildren })) return null;
  const handleCopy = async (event: MouseEvent<HTMLButtonElement>) => {
    event.stopPropagation();
    if (trimmedCopyText.length === 0) return;
    await navigator.clipboard.writeText(trimmedCopyText);
    setCopied(true);
    window.setTimeout(() => setCopied(false), COPIED_RESET_TIMEOUT_MS);
  };
  return (
    <>
      <div className="hc-message-actions" data-persistent={persistent || undefined}>
        {trimmedCopyText.length > 0 && (
          /*
           * CODEX-REF: copy-button-*.js — aria-label swaps between
           * "Copy" (copyButton.copyAriaLabel) and "Copied" (copyButton.copiedAriaLabel).
           * Tooltip text (`title`) uses the same pair; Codex's CopyButton
           * wraps the button in a <Tooltip tooltipContent={...}/> for the
           * same effect (HiCodex relies on the native `title` attribute,
           * which is simpler and accessible enough for this case).
           */
          <button aria-label={copied ? "Copied" : "Copy"} title={copied ? "Copied" : "Copy"} type="button" onClick={handleCopy}>
            {copied ? <Check size={13} /> : <Copy size={13} />}
          </button>
        )}
        {children}
        {sentAtMs !== null && (
          <span className="hc-message-time">{formatMessageSentAt(sentAtMs)}</span>
        )}
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
  // CODEX-REF: copy-button-*.js — the inline-swap label is just
  // "Copied" (defaultMessage of `copyButton.copied`); HiCodex's toast uses
  // the same single word so terminology stays consistent with the button
  // aria-label swap above.
  const toast = (
    <div className="hc-copy-toast" role="status" aria-live="polite">
      <span className="hc-copy-toast-icon" aria-hidden="true"><Check size={15} /></span>
      <span>Copied</span>
    </div>
  );
  if (typeof document === "undefined") return toast;
  return createPortal(toast, document.body);
}

/*
 * Per-message timestamp formatter — three calendar buckets matching Codex
 * Desktop (re-verified vs v26.519.81530): same day → time only; within the
 * prior 6 days → weekday + time; otherwise → month/day + time. Uses the
 * locale's Intl.DateTimeFormat so it follows the user's 12/24h preference.
 */
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
