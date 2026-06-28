import {
  Check,
  Copy,
} from "lucide-react";
import { useState } from "react";
import type { MouseEvent, ReactNode } from "react";
// codex copy-button-*.js wraps the action button in <Tooltip tooltipContent={...}/>.
import { Tooltip } from "./tooltip";
import { useForgeIntl } from "./i18n-provider";
import {
  writeMarkdownClipboard,
  type MarkdownRichCopyPayload,
} from "./message-markdown-copy";

/*
 * CODEX-REF: copy-button-*.js — Codex Desktop's copy affordance.
 *
 * Aligned with Codex:
 *   - aria-label strings ("Copy" / "Copied") match Codex's i18n
 *     `copyButton.copyAriaLabel` / `copyButton.copiedAriaLabel` defaultMessages
 *   - default copied-state reset is 1500ms for the user-message copy path.
 *     Assistant/common CopyButton paths in the current Desktop bundle use
 *     2000ms, so callers that mirror that path pass `copiedResetTimeoutMs`.
 *   - icon swap (Copy → Check) mirrors Codex's dual-state render
 *
 * Diverged from Codex (intentional, no Codex source to override):
 *   - Forge renders an inline timestamp span; Codex's copy-button + thread-
 *     actions chunks contain no per-message timestamp affordance.
 */

const COPIED_RESET_TIMEOUT_MS = 1500;

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
  copiedResetTimeoutMs = COPIED_RESET_TIMEOUT_MS,
  copiedText,
  copyTextLabel,
  copyRichPayload,
  copyText,
  hasActionChildren = false,
  iconSize = 12,
  persistent = false,
  sentAtMs = null,
  showTimestampWithoutActions = false,
}: {
  children?: ReactNode;
  copiedResetTimeoutMs?: number;
  copiedText?: string;
  copyTextLabel?: string;
  copyRichPayload?: (() => MarkdownRichCopyPayload | null) | null;
  copyText: string;
  hasActionChildren?: boolean;
  iconSize?: number;
  persistent?: boolean;
  sentAtMs?: number | null;
  showTimestampWithoutActions?: boolean;
}) {
  const trimmedCopyText = copyText.trim();
  const [copied, setCopied] = useState(false);
  const { formatMessage } = useForgeIntl();
  // codex copy-button-*.js — aria-label/tooltip swap localized via copyButton.*.
  const copyLabel = copied
    ? copiedText ?? formatMessage({ id: "copyButton.copiedAriaLabel", defaultMessage: "Copied" })
    : copyTextLabel ?? formatMessage({ id: "copyButton.copyAriaLabel", defaultMessage: "Copy" });
  if (!shouldRenderMessageActionRow({ copyText, hasActionChildren, sentAtMs, showTimestampWithoutActions })) return null;
  const handleCopy = async (event: MouseEvent<HTMLButtonElement>) => {
    event.stopPropagation();
    if (trimmedCopyText.length === 0) return;
    const copiedToClipboard = await writeMarkdownClipboard(
      copyRichPayload?.() ?? trimmedCopyText,
      event.currentTarget,
    );
    if (!copiedToClipboard) return;
    setCopied(true);
    window.setTimeout(() => setCopied(false), copiedResetTimeoutMs);
  };
  return (
    <div className="hc-message-actions" data-persistent={persistent || undefined}>
      {trimmedCopyText.length > 0 && (
        /*
         * CODEX-REF: copy-button-*.js — aria-label swaps between "Copy"
         * (copyButton.copyAriaLabel) and "Copied" (copyButton.copiedAriaLabel); Codex's
         * CopyButton wraps the button in <Tooltip tooltipContent={...}/>, so Forge now
         * does the same via the shared Tooltip (the aria-label stays for a11y).
         */
        <Tooltip content={copyLabel}>
          <button aria-label={copyLabel} type="button" onClick={handleCopy}>
            {copied ? <Check size={iconSize} /> : <Copy size={iconSize} />}
          </button>
        </Tooltip>
      )}
      {children}
      {sentAtMs !== null && (
        <span className="hc-message-time">{formatMessageSentAt(sentAtMs)}</span>
      )}
    </div>
  );
}

export function shouldRenderMessageActionRow({
  copyText,
  hasActionChildren = false,
  sentAtMs = null,
  showTimestampWithoutActions = false,
}: {
  copyText: string;
  hasActionChildren?: boolean;
  sentAtMs?: number | null;
  showTimestampWithoutActions?: boolean;
}): boolean {
  return copyText.trim().length > 0 || hasActionChildren || (showTimestampWithoutActions && sentAtMs !== null);
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
    <Tooltip content={title}>
      <button
        aria-label={ariaLabel}
        type="button"
        onClick={(event) => {
          event.stopPropagation();
          onClick();
        }}
      >
        {children}
      </button>
    </Tooltip>
  );
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
