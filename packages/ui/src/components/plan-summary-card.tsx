import { Check, ChevronDown, Copy, Download, ExternalLink } from "lucide-react";
import { useEffect, useState } from "react";
import type { MouseEvent } from "react";

import { stringField } from "../lib/format";
import type { ConversationRenderUnit } from "../state/render-groups";
import { useHiCodexIntl } from "./i18n-provider";
import { Markdownish } from "./message-unit";
import { TurnRatingControls, type SubmitTurnRatingEvent } from "./turn-rating-controls";

type ThreadItemUnit = Extract<ConversationRenderUnit, { kind: "threadItem" }>;

export function PlanSummaryCard({
  onSubmitTurnFeedback,
  threadId,
  unit,
}: {
  onSubmitTurnFeedback?: SubmitTurnRatingEvent;
  threadId?: string | null;
  unit: ThreadItemUnit;
}) {
  const content = planSummaryContent(unit.item);
  const completed = planSummaryCompleted(unit.item);
  const canUseContentActions = completed && content.trim().length > 0;
  const [collapsed, setCollapsed] = useState(() => !completed);
  const [copied, setCopied] = useState(false);
  const { formatMessage } = useHiCodexIntl();
  const title = completed
    ? formatMessage({ id: "localConversation.planSummary.title", defaultMessage: "Plan" })
    : formatMessage({ id: "localConversation.planSummary.titleWriting", defaultMessage: "Writing plan" });
  const downloadLabel = formatMessage({ id: "localConversation.planSummary.download", defaultMessage: "Download plan" });
  const copyLabel = copied
    ? formatMessage({ id: "copyButton.copiedAriaLabel", defaultMessage: "Copied" })
    : formatMessage({ id: "copyButton.copyAriaLabel", defaultMessage: "Copy" });
  const openLabel = formatMessage({ id: "localConversation.planSummary.openInNewWindow", defaultMessage: "Open" });
  const openTooltip = formatMessage({ id: "localConversation.planSummary.openInNewWindow.tooltip", defaultMessage: "Open in new window" });
  const toggleAriaLabel = collapsed
    ? formatMessage({ id: "localConversation.planSummary.expand", defaultMessage: "Expand plan summary" })
    : formatMessage({ id: "localConversation.planSummary.collapse", defaultMessage: "Collapse plan summary" });
  const toggleTooltip = collapsed
    ? formatMessage({ id: "localConversation.planSummary.expandTooltip", defaultMessage: "Expand" })
    : formatMessage({ id: "localConversation.planSummary.collapseTooltip", defaultMessage: "Collapse" });
  const viewPlanLabel = formatMessage({ id: "localConversation.planSummary.viewPlan", defaultMessage: "Expand plan" });

  useEffect(() => {
    setCollapsed(!completed);
    setCopied(false);
  }, [completed, unit.key]);

  const handleCopy = async (event: MouseEvent<HTMLButtonElement>) => {
    event.stopPropagation();
    if (!canUseContentActions || typeof navigator === "undefined" || !navigator.clipboard) return;
    try {
      await navigator.clipboard.writeText(content);
      setCopied(true);
      if (typeof window !== "undefined") {
        // Shared copy-button (copy-button-*.js) resets the copied state after
        // 2000ms (setTimeout … 2e3); match that dwell time here.
        window.setTimeout(() => setCopied(false), 2000);
      }
    } catch {
      setCopied(false);
    }
  };

  const handleDownload = (event: MouseEvent<HTMLButtonElement>) => {
    event.stopPropagation();
    if (!canUseContentActions) return;
    downloadPlanMarkdown(content);
  };

  /*
   * Codex Desktop renderer emits `dispatchMessage("show-plan-summary", {planContent, conversationId})`
   * (plan-summary-item-content-*.js), but Codex's Electron main
   * handler (`main-*.js` `case "show-plan-summary": break;`) is a no-op
   * stub — the action is wired in the UI but produces no user-visible effect.
   * HiCodex aligns by exposing the same button + tooltip surface while leaving
   * the click handler intentionally inert (no Tauri window/route opened).
   */
  const handleOpenInNewWindow = (event: MouseEvent<HTMLButtonElement>) => {
    event.stopPropagation();
  };

  return (
    <article
      className={`hc-plan-summary-card ${completed ? "is-complete" : "is-writing"}`}
      data-content-search-unit-key={unit.key}
      data-item-ids={unit.item.id}
      /*
       * Reflect the actual item type — thread-item-view.tsx routes both
       * `proposed-plan` and the protocol's standalone `plan` variant
       * (v2/item.rs:236) through `PlanSummaryCard`. Hardcoding
       * `"proposed-plan"` mis-tags real `plan` items in content-search and
       * any data-attribute selectors.
       */
      data-item-type={typeof unit.item.type === "string" ? unit.item.type : "proposed-plan"}
    >
      <header className="hc-plan-summary-header">
        <h3 className="hc-plan-summary-title">{title}</h3>
        <div className="hc-plan-summary-actions" aria-label="Plan actions">
          {canUseContentActions && (
            <>
              <TurnRatingControls
                hasArtifacts={unit.hasArtifacts === true}
                onSubmit={onSubmitTurnFeedback}
                threadId={threadId}
                turnId={unit.turnId}
              />
              {/*
               * Codex Desktop i18n:
               *   localConversation.planSummary.openInNewWindow         = "Open"   (button label / aria-label)
               *   localConversation.planSummary.openInNewWindow.tooltip = "Open in new window"
               * Click handler is intentionally inert — Codex main process
               * (`show-plan-summary`) is a no-op stub, so HiCodex matches.
              */}
              <button
                aria-label={downloadLabel}
                title={downloadLabel}
                type="button"
                onClick={handleDownload}
              >
                <Download aria-hidden size={14} />
              </button>
              {/*
               * Codex delegates copy to the shared copy-button component
               * (copy-button-*.js), invoked icon-only. Its aria-label swaps
               * between id copyButton.copyAriaLabel (defaultMessage "Copy")
               * and copyButton.copiedAriaLabel (defaultMessage "Copied") for
               * ~2s; there is no floating "Copied to clipboard" toast for the
               * plan card.
              */}
              <button
                aria-label={copyLabel}
                title={copyLabel}
                type="button"
                onClick={handleCopy}
              >
                {copied ? <Check aria-hidden size={14} /> : <Copy aria-hidden size={14} />}
              </button>
              <button
                aria-label={openLabel}
                className="hc-plan-summary-open"
                title={openTooltip}
                type="button"
                onClick={handleOpenInNewWindow}
              >
                <span>{openLabel}</span>
                <ExternalLink aria-hidden size={14} />
              </button>
            </>
          )}
          <button
            aria-expanded={!collapsed}
            aria-label={toggleAriaLabel}
            title={toggleTooltip}
            type="button"
            onClick={() => setCollapsed((value) => !value)}
          >
            <ChevronDown
              aria-hidden
              className={collapsed ? "" : "is-open"}
              size={15}
            />
          </button>
        </div>
      </header>
      <div className={`hc-plan-summary-body ${collapsed ? "is-collapsed" : ""}`}>
        <Markdownish fadeType={completed ? "none" : "indexed"} text={content} />
        {collapsed && (
          <div className="hc-plan-summary-fade">
            <button
              type="button"
              onClick={() => setCollapsed(false)}
            >
              {viewPlanLabel}
            </button>
          </div>
        )}
      </div>
    </article>
  );
}

export function planSummaryContent(item: ThreadItemUnit["item"]): string {
  /*
   * Protocol plan items carry `text`; older local proposed-plan fixtures used
   * `content`, so both are accepted here.
   */
  return stringField(item, "text") || stringField(item, "content");
}

export function planSummaryCompleted(item: ThreadItemUnit["item"]): boolean {
  const record = item as Record<string, unknown>;
  if (typeof record.completed === "boolean") return record.completed;
  return record.status === "completed";
}

function downloadPlanMarkdown(content: string): void {
  if (typeof document === "undefined" || typeof URL === "undefined" || typeof Blob === "undefined") return;
  const blob = new Blob([content], { type: "text/markdown;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = "PLAN.md";
  anchor.style.display = "none";
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  URL.revokeObjectURL(url);
}
