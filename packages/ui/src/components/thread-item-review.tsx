import { ChevronRight, TriangleAlert } from "lucide-react";
import { useEffect, useState } from "react";
import { stringField } from "../lib/format";
import { autoReviewBody, autoReviewTitle } from "./auto-review-view-model";
import { AnimatedDisclosure } from "./animated-disclosure";
import { useHiCodexIntl } from "./i18n-provider";
import type { ThreadItemUnit } from "./thread-item-types";

export function McpServerElicitationThreadItemView({
  unit,
}: {
  unit: ThreadItemUnit;
}) {
  const { formatMessage } = useHiCodexIntl();
  return (
    <div
      className="hc-thread-item-row group"
      data-content-search-unit-key={unit.key}
      data-item-ids={stringField(unit.item as Record<string, unknown>, "id") || stringField(unit.item as Record<string, unknown>, "requestId")}
      data-item-type="mcp-server-elicitation"
    >
      <div className="hc-thread-item-inline text-[13px] leading-5 text-stone-500">
        <span className="hc-thinking-shimmer-text truncate">{formatMessage({ id: "localConversation.approvalRequest.inProgress", defaultMessage: "Awaiting approval" })}</span>
      </div>
    </div>
  );
}

export function AutoReviewThreadItemView({
  unit,
}: {
  unit: ThreadItemUnit;
}) {
  const { formatMessage } = useHiCodexIntl();
  const record = unit.item as Record<string, unknown>;
  const title = autoReviewTitle(record, formatMessage);
  const body = autoReviewBody(record, formatMessage);
  const running = stringField(record, "status") === "inProgress";
  const highRiskDenied = stringField(record, "status") === "denied" && stringField(record, "riskLevel") === "high";
  const canExpand = body.length > 0;
  const [expanded, setExpanded] = useState(false);

  useEffect(() => {
    setExpanded(false);
  }, [unit.key]);

  const toneClass = highRiskDenied ? "text-amber-700" : "text-stone-500 group-hover:text-slate-700";
  const titleNode = (
    <>
      {highRiskDenied && (
        <TriangleAlert aria-hidden className="shrink-0 text-amber-700" size={14} />
      )}
      <span className={`min-w-0 truncate ${toneClass} ${running ? "animate-pulse" : ""}`}>
        {title}
      </span>
      {canExpand && (
        <ChevronRight
          aria-hidden
          className={`shrink-0 text-stone-400 transition-[opacity,transform] duration-300 ${
            expanded ? "rotate-90 opacity-100" : "opacity-0 group-hover:opacity-100"
          }`}
          size={14}
        />
      )}
    </>
  );

  return (
    <div
      className="hc-thread-item-row group"
      data-content-search-unit-key={unit.key}
      data-item-ids={unit.item.id}
      data-item-type="automatic-approval-review"
    >
      {canExpand ? (
        <button
          type="button"
          aria-expanded={expanded}
          className="group flex w-fit max-w-full min-w-0 items-center gap-1.5 px-0 py-0 text-left text-[13px] leading-5"
          onClick={() => setExpanded((value) => !value)}
        >
          {titleNode}
        </button>
      ) : (
        <div className="hc-thread-item-inline text-[13px] leading-5">
          {titleNode}
        </div>
      )}
      {canExpand && (
        <AnimatedDisclosure
          className="hc-thread-item-disclosure"
          innerClassName="hc-thread-item-body"
          open={expanded}
        >
          <p className="hc-thread-item-copy max-w-[80ch] whitespace-pre-wrap pt-1 text-[13px] leading-6 text-stone-500">
            {body}
          </p>
        </AnimatedDisclosure>
      )}
    </div>
  );
}

export { autoReviewBody, autoReviewTitle } from "./auto-review-view-model";
