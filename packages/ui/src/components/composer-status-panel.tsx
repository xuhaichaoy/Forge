import { useMemo, useState, type ReactElement } from "react";
import type { RateLimitSnapshot } from "@forge/codex-protocol/generated/v2/RateLimitSnapshot";
import {
  formatRateLimitProgress,
  projectRateLimitSections,
} from "../state/rate-limit-summary";
import { useForgeIntl, type ForgeIntlContextValue } from "./i18n-provider";

type FormatMessage = ForgeIntlContextValue["formatMessage"];

export interface ComposerStatusPanelProps {
  threadId: string | null;
  tokensUsed?: number | null;
  contextWindow?: number | null;
  rateLimits?: RateLimitSnapshot | null;
  rateLimitsByLimitId?: Record<string, RateLimitSnapshot> | null;
  onClose: () => void;
}

export type ComposerStatusRow =
  | { id: string; label: string; value: string; section?: false; rateLimitPercent?: number }
  | { id: string; label: string; value: null; section: true };

export function ComposerStatusPanel({
  threadId,
  tokensUsed,
  contextWindow,
  rateLimits,
  rateLimitsByLimitId,
  onClose,
}: ComposerStatusPanelProps): ReactElement {
  const { formatMessage } = useForgeIntl();
  const [copied, setCopied] = useState(false);
  const rows = useMemo(() => composerStatusRows({
    threadId,
    tokensUsed,
    contextWindow,
    rateLimits,
    rateLimitsByLimitId,
  }, formatMessage), [contextWindow, formatMessage, rateLimits, rateLimitsByLimitId, threadId, tokensUsed]);

  const copyThreadId = () => {
    if (!threadId || typeof navigator === "undefined" || !navigator.clipboard) return;
    void navigator.clipboard.writeText(threadId).then(() => {
      setCopied(true);
      // codex composer-B7sGHJVq.js (session copy, anchored on
      // composer.statusPlain.sessionCopyAriaLabel): setTimeout(()=>{h(!1)},2e3).
      window.setTimeout(() => setCopied(false), 2_000);
    }).catch(() => undefined);
  };

  return (
    <div className="hc-composer-status-panel">
      <div className="hc-composer-status-panel-card">
        <div className="hc-composer-status-panel-header">
          <strong>{formatMessage({ id: "composer.statusPlain.heading", defaultMessage: "Status" })}</strong>
          <button
            type="button"
            className="hc-composer-status-panel-close"
            onClick={onClose}
          >
            {formatMessage({ id: "composer.status.close", defaultMessage: "Close" })}
          </button>
        </div>
        <div className="hc-composer-status-panel-grid">
          {rows.map((row) => (
            row.section ? (
              <div className="hc-composer-status-panel-section" key={row.id}>{row.label}</div>
            ) : (
              <div className="hc-composer-status-panel-row" key={row.id}>
                <div className="hc-composer-status-panel-label">{row.label}</div>
                {row.id === "session" && threadId ? (
                  <button
                    type="button"
                    className="hc-composer-status-panel-session"
                    aria-label={copied
                      ? formatMessage({ id: "composer.statusPlain.sessionCopiedAriaLabel", defaultMessage: "Copied session id" })
                      : formatMessage({ id: "composer.statusPlain.sessionCopyAriaLabel", defaultMessage: "Copy session id" })}
                    title={copied
                      ? formatMessage({ id: "composer.statusPlain.sessionCopiedTooltip", defaultMessage: "Copied ID" })
                      : formatMessage({ id: "composer.statusPlain.sessionCopyTooltip", defaultMessage: "Copy ID" })}
                    onClick={copyThreadId}
                  >
                    {row.value}
                  </button>
                ) : (
                  <div
                    className={`hc-composer-status-panel-value ${row.rateLimitPercent == null ? "is-wide" : ""}`}
                  >
                    {row.value}
                  </div>
                )}
                {row.rateLimitPercent != null && (
                  <div className="hc-composer-status-panel-progress" aria-hidden="true">
                    {formatRateLimitProgress(row.rateLimitPercent)}
                  </div>
                )}
              </div>
            )
          ))}
        </div>
      </div>
    </div>
  );
}

interface ComposerStatusRowsInput {
  threadId: string | null;
  tokensUsed?: number | null;
  contextWindow?: number | null;
  rateLimits?: RateLimitSnapshot | null;
  rateLimitsByLimitId?: Record<string, RateLimitSnapshot> | null;
}

// codex composer.statusPlain.* — formatMessage is optional so the locale-free
// callers (and the deep-equal projection test, which runs under the default
// en-US locale) keep the English row labels unchanged.
export function composerStatusRows(input: ComposerStatusRowsInput, formatMessage?: FormatMessage): ComposerStatusRow[] {
  const rows: ComposerStatusRow[] = [];

  if (input.threadId) {
    rows.push({
      id: "session",
      label: formatMessage
        ? formatMessage({ id: "composer.statusPlain.sessionLabel", defaultMessage: "Session:" })
        : "Session:",
      value: input.threadId,
    });
  }

  const contextUsage = contextUsageLabel(input.tokensUsed, input.contextWindow, formatMessage);
  if (contextUsage) {
    rows.push({
      id: "context",
      label: formatMessage
        ? formatMessage({ id: "composer.statusPlain.contextLabel", defaultMessage: "Context:" })
        : "Context:",
      value: contextUsage,
    });
  }

  const rateLimitRows = rateLimitStatusRows(input.rateLimits, input.rateLimitsByLimitId);
  if (rateLimitRows.length === 0) {
    rows.push({
      id: "rate-limit",
      label: formatMessage
        ? formatMessage({ id: "composer.statusPlain.rateLimitFallbackLabel", defaultMessage: "Rate limit:" })
        : "Rate limit:",
      value: formatMessage
        ? formatMessage({ id: "composer.statusPlain.rateLimitUnavailable", defaultMessage: "Unavailable" })
        : "Unavailable",
    });
  } else {
    rows.push(...rateLimitRows);
  }

  return rows;
}

function contextUsageLabel(
  tokensUsed: number | null | undefined,
  contextWindow: number | null | undefined,
  formatMessage?: FormatMessage,
): string | null {
  if (!Number.isFinite(tokensUsed) || !Number.isFinite(contextWindow) || !contextWindow || contextWindow <= 0) {
    return null;
  }
  const used = Math.max(0, Math.round(tokensUsed ?? 0));
  const total = Math.max(0, Math.round(contextWindow));
  const remaining = Math.max(0, Math.round(100 - (used / total) * 100));
  const remainingPart = formatMessage
    ? formatMessage({ id: "composer.statusPlain.contextValueRemaining", defaultMessage: "{remaining}% left" }, { remaining: String(remaining) })
    : `${remaining}% left`;
  const metadataPart = formatMessage
    ? formatMessage(
        { id: "composer.statusPlain.contextValueMetadata", defaultMessage: "({used} used / {total})" },
        { used: formatStatusNumber(used), total: formatContextWindow(total) },
      )
    : `(${formatStatusNumber(used)} used / ${formatContextWindow(total)})`;
  return `${remainingPart} ${metadataPart}`;
}

function rateLimitStatusRows(
  fallback: RateLimitSnapshot | null | undefined,
  snapshotsByLimitId: Record<string, RateLimitSnapshot> | null | undefined,
): ComposerStatusRow[] {
  const sections = projectRateLimitSections(snapshotsByLimitId, fallback);
  if (sections.length === 0) return [];
  const rows: ComposerStatusRow[] = [];
  for (const section of sections) {
    if (section.label) {
      rows.push({
        id: `rate-limit-section:${section.id}`,
        label: section.label,
        value: null,
        section: true,
      });
    }
    for (const window of section.windows) {
      rows.push({
        id: `rate-limit:${section.id}:${window.id}`,
        label: window.label,
        value: `${window.remainingText} ${window.resetMetadata}`,
        rateLimitPercent: window.remainingPercent,
      });
    }
  }
  return rows;
}

function formatContextWindow(value: number): string {
  return value >= 1_000 ? `${formatStatusNumber(Math.round(value / 1_000))}K` : formatStatusNumber(value);
}

function formatStatusNumber(value: number): string {
  return new Intl.NumberFormat(undefined, { maximumFractionDigits: 0 }).format(value);
}
