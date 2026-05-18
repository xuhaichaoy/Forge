import { Check, ChevronDown, Copy, Download } from "lucide-react";
import { useEffect, useState } from "react";
import type { MouseEvent } from "react";

import { stringField } from "../lib/format";
import type { ConversationRenderUnit } from "../state/render-groups";
import { Markdownish } from "./message-unit";

type ThreadItemUnit = Extract<ConversationRenderUnit, { kind: "threadItem" }>;

export function PlanSummaryCard({
  unit,
}: {
  unit: ThreadItemUnit;
}) {
  const content = planSummaryContent(unit.item);
  const completed = planSummaryCompleted(unit.item);
  const canUseContentActions = completed && content.trim().length > 0;
  const [collapsed, setCollapsed] = useState(() => !completed);
  const [copied, setCopied] = useState(false);

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
        window.setTimeout(() => setCopied(false), 1500);
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

  return (
    <>
      <article
        className={`hc-plan-summary-card ${completed ? "is-complete" : "is-writing"}`}
        data-content-search-unit-key={unit.key}
        data-item-ids={unit.item.id}
        data-item-type="proposed-plan"
      >
        <header className="hc-plan-summary-header">
          <h3 className="hc-plan-summary-title">{completed ? "Plan" : "Writing plan"}</h3>
          <div className="hc-plan-summary-actions" aria-label="Plan actions">
            {canUseContentActions && (
              <>
                <button
                  aria-label="Download plan"
                  title="Download plan"
                  type="button"
                  onClick={handleDownload}
                >
                  <Download aria-hidden size={14} />
                </button>
                <button
                  aria-label={copied ? "Copied" : "Copy plan"}
                  title={copied ? "Copied" : "Copy plan"}
                  type="button"
                  onClick={handleCopy}
                >
                  {copied ? <Check aria-hidden size={14} /> : <Copy aria-hidden size={14} />}
                </button>
              </>
            )}
            <button
              aria-expanded={!collapsed}
              aria-label={collapsed ? "Expand plan" : "Collapse plan"}
              title={collapsed ? "Expand plan" : "Collapse plan"}
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
                Expand plan
              </button>
            </div>
          )}
        </div>
      </article>
      {copied && <CopyFeedbackToast />}
    </>
  );
}

export function planSummaryContent(item: ThreadItemUnit["item"]): string {
  return stringField(item, "content");
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

function CopyFeedbackToast() {
  return (
    <div className="hc-copy-toast" role="status" aria-live="polite">
      <span className="hc-copy-toast-icon" aria-hidden="true"><Check size={15} /></span>
      <span>Copied to clipboard</span>
    </div>
  );
}
