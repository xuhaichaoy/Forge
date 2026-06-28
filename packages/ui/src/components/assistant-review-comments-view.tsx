import { ChevronRight, FileText } from "lucide-react";
import { useState } from "react";
import type { AssistantReviewComment, ConversationRenderUnit } from "../state/render-groups";
import type { FileReference } from "./file-reference-types";
import { useForgeIntl, type ForgeIntlContextValue } from "./i18n-provider";

type MessageRenderUnit = Extract<ConversationRenderUnit, { kind: "message" }>;
type FormatMessage = ForgeIntlContextValue["formatMessage"];

export function AssistantAfterReviewComments({
  units,
  onOpenFileReference,
}: {
  units: NonNullable<MessageRenderUnit["assistantAfter"]>;
  onOpenFileReference?: (reference: FileReference) => void;
}) {
  const { formatMessage } = useForgeIntl();
  const reviewUnits = units.filter((unit) => unit.kind === "assistantReviewComments");
  const comments = reviewUnits.flatMap((unit) => unit.comments).sort(compareReviewCommentsByPriority);
  const [expanded, setExpanded] = useState(false);
  if (comments.length === 0) return null;

  const visibleComments = expanded ? comments : comments.slice(0, 3);
  const hiddenCount = comments.length - visibleComments.length;
  const countLabel = formatMessage({
    id: "localConversation.reviewComments.count",
    defaultMessage: "{count, plural, one {# comment} other {# comments}}",
    description: "Title for the turn-end card summarizing model-authored code review comments",
  }, { count: comments.length });

  return (
    <div className="hc-assistant-review-comments">
      <div className="hc-assistant-review-comments-header">
        <span className="hc-assistant-review-comments-icon">
          <FileText size={16} />
        </span>
        <span>{countLabel}</span>
      </div>
      <div className="hc-assistant-review-comments-list">
        {visibleComments.map((comment, index) => (
          <AssistantReviewCommentRow
            comment={comment}
            index={index}
            key={`${comment.path}:${comment.startLine ?? comment.line}:${comment.line}:${comment.title}:${index}`}
            onOpenFileReference={onOpenFileReference}
            formatMessage={formatMessage}
          />
        ))}
        {hiddenCount > 0 && (
          <button
            type="button"
            aria-expanded={false}
            className="hc-assistant-review-comments-toggle"
            onClick={() => setExpanded(true)}
          >
            <span>{formatMessage({
              id: "localConversation.reviewComments.showMore",
              defaultMessage: "{count, plural, one {Show # more comment} other {Show # more comments}}",
              description: "Button label that expands hidden model-authored code review comments",
            }, { count: hiddenCount })}</span>
            <ChevronRight size={13} />
          </button>
        )}
        {expanded && comments.length > 3 && (
          <button
            type="button"
            aria-expanded
            className="hc-assistant-review-comments-toggle"
            onClick={() => setExpanded(false)}
          >
            <span>{formatMessage({
              id: "localConversation.reviewComments.collapse",
              defaultMessage: "Collapse comments",
              description: "Button label that collapses expanded model-authored code review comments",
            })}</span>
            <ChevronRight className="is-open" size={13} />
          </button>
        )}
      </div>
    </div>
  );
}

function AssistantReviewCommentRow({
  comment,
  formatMessage,
  index,
  onOpenFileReference,
}: {
  comment: AssistantReviewComment;
  formatMessage: FormatMessage;
  index: number;
  onOpenFileReference?: (reference: FileReference) => void;
}) {
  const location = reviewCommentLocation(comment);
  const tooltipBody = comment.body.trim();
  const openReference = onOpenFileReference
    ? () => onOpenFileReference(reviewCommentFileReference(comment))
    : undefined;
  const openLabel = formatMessage({
    id: "localConversation.reviewComments.openComment",
    defaultMessage: "View {title} in {location}",
    description: "Accessible label for opening one model-authored code review comment from a conversation turn",
  }, { title: comment.title, location });
  const content = (
    <span className="hc-assistant-review-comment-row-content">
      <span className="hc-assistant-review-comment-priority-slot">
        {comment.priority && (
          <span className="hc-assistant-review-comment-priority">{comment.priority}</span>
        )}
      </span>
      <span className="hc-assistant-review-comment-title">{comment.title}</span>
      <span className="hc-assistant-review-comment-location" title={location}>
        <span dir="ltr">{location}</span>
      </span>
    </span>
  );
  const row = !onOpenFileReference ? (
    <div className="hc-assistant-review-comment-row" data-index={index}>
      {content}
    </div>
  ) : (
    <button
      type="button"
      aria-label={openLabel}
      className="hc-assistant-review-comment-row"
      data-index={index}
      onClick={openReference}
    >
      {content}
    </button>
  );
  if (!tooltipBody) return row;
  const tooltipOpenRowContent = (
    <>
      {comment.priority ? (
        <span className="hc-assistant-review-comment-priority">{comment.priority}</span>
      ) : null}
      <span className="hc-assistant-review-comment-tooltip-location" dir="ltr">{location}</span>
    </>
  );
  return (
    <div className="hc-assistant-review-comment-tooltip-wrap">
      {row}
      <div className="hc-assistant-review-comment-tooltip" role="tooltip">
        {openReference ? (
          <button
            type="button"
            aria-label={openLabel}
            className="hc-assistant-review-comment-tooltip-open-row"
            onClick={openReference}
          >
            {tooltipOpenRowContent}
          </button>
        ) : (
          <div className="hc-assistant-review-comment-tooltip-open-row">
            {tooltipOpenRowContent}
          </div>
        )}
        <div className="hc-assistant-review-comment-tooltip-body">
          <div className="hc-assistant-review-comment-tooltip-title">{comment.title}</div>
          <div className="hc-assistant-review-comment-tooltip-copy">{tooltipBody}</div>
        </div>
      </div>
    </div>
  );
}

function compareReviewCommentsByPriority(a: AssistantReviewComment, b: AssistantReviewComment): number {
  return reviewCommentPrioritySortValue(a) - reviewCommentPrioritySortValue(b);
}

function reviewCommentPrioritySortValue(comment: AssistantReviewComment): number {
  const value = comment.priority?.match(/^P(\d)$/i)?.[1];
  return value ? Number(value) : Number.MAX_SAFE_INTEGER;
}

function reviewCommentLocation(comment: AssistantReviewComment): string {
  return `${comment.path}:${comment.line}`;
}

function reviewCommentFileReference(comment: AssistantReviewComment): FileReference {
  const lineStart = comment.startLine ?? comment.line;
  return {
    path: comment.path,
    lineStart,
    ...(comment.startLine && comment.line !== comment.startLine ? { lineEnd: comment.line } : {}),
  };
}
