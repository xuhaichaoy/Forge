import { ChevronRight, TriangleAlert } from "lucide-react";
import { useState } from "react";
import { AnimatedDisclosure } from "./animated-disclosure";
import type { ToolActivityDetailViewModel } from "./tool-activity-detail";

export function AutoReviewDetail({ detail }: { detail: Extract<ToolActivityDetailViewModel, { kind: "autoReview" }> }) {
  const [expanded, setExpanded] = useState(false);
  return (
    <section className={`hc-tool-detail-stack auto-review ${detail.running ? "is-running" : ""}`}>
      <button
        aria-expanded={expanded}
        className="group/collapsed-tool-activity group/summary inline-flex w-fit max-w-full cursor-interaction items-center gap-1 self-start text-left"
        type="button"
        onClick={() => setExpanded((value) => !value)}
      >
        <span className="inline-flex min-w-0 items-center gap-1.5">
          {detail.highRiskDenied && (
            <TriangleAlert aria-hidden className="icon-xs shrink-0 text-token-editor-warning-foreground" />
          )}
          <span
            className={`block min-w-0 max-w-full truncate ${
              detail.highRiskDenied
                ? "text-token-editor-warning-foreground"
                : "text-token-foreground/30 group-hover/collapsed-tool-activity:text-token-foreground"
            } ${detail.running ? "hc-status-event-shimmer" : ""}`}
          >
            {detail.title}
          </span>
        </span>
        <span
          className={`inline-chevron flex-shrink-0 text-token-input-placeholder-foreground opacity-0 group-hover/summary:opacity-100 ${
            expanded ? "opacity-100" : ""
          }`}
        >
          <ChevronRight aria-hidden className={`icon-2xs text-current transition-transform duration-300 ${expanded ? "rotate-90" : ""}`} />
        </span>
      </button>
      <AnimatedDisclosure
        className="hc-tool-details-motion"
        innerClassName="hc-tool-details"
        open={expanded}
      >
        <p className="hc-tool-detail-prose max-w-[80ch] whitespace-pre-wrap pt-1 text-size-chat leading-relaxed">
          {detail.body}
        </p>
      </AnimatedDisclosure>
    </section>
  );
}
