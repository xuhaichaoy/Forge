import { MessageSquare } from "lucide-react";
import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { createPortal } from "react-dom";
import { fileIconFor } from "../lib/file-icon";
import type { FileReference } from "./file-reference-types";
import { useForgeIntl } from "./i18n-provider";
import { Markdownish } from "./message-markdown-renderer";
import type { UserMessageMetaChip } from "./user-message-meta";
import type {
  UserMessageCommentAttachmentPreview,
  UserMessageDesignTweakChange,
} from "../state/user-message-comment-attachments";

const COMMENT_ATTACHMENT_POPOVER_DELAY_MS = 100;
const VIEWPORT_MARGIN_PX = 8;
const SIDE_OFFSET_PX = 4;

export function UserMessageCommentAttachmentChip({
  attachments,
  chip,
  onOpenFileReference,
}: {
  attachments: readonly UserMessageCommentAttachmentPreview[];
  chip: UserMessageMetaChip;
  onOpenFileReference?: (reference: FileReference) => void;
}) {
  const { formatMessage } = useForgeIntl();
  const [open, setOpen] = useState(false);
  const [position, setPosition] = useState<{ top: number; left: number } | null>(null);
  const triggerRef = useRef<HTMLButtonElement | null>(null);
  const popoverRef = useRef<HTMLDivElement | null>(null);
  const timerRef = useRef<number | undefined>(undefined);

  const clearTimer = useCallback(() => {
    if (typeof window !== "undefined") window.clearTimeout(timerRef.current);
  }, []);
  const scheduleOpen = useCallback(() => {
    clearTimer();
    setOpen(true);
  }, [clearTimer]);
  const scheduleClose = useCallback(() => {
    if (typeof window === "undefined") return;
    clearTimer();
    timerRef.current = window.setTimeout(() => {
      setOpen(false);
      setPosition(null);
    }, COMMENT_ATTACHMENT_POPOVER_DELAY_MS);
  }, [clearTimer]);

  useEffect(() => () => clearTimer(), [clearTimer]);

  const updatePosition = useCallback(() => {
    const trigger = triggerRef.current;
    const popover = popoverRef.current;
    if (!trigger || !popover || typeof window === "undefined") return;
    const triggerRect = trigger.getBoundingClientRect();
    const popoverRect = popover.getBoundingClientRect();
    const topCandidate = triggerRect.top - popoverRect.height - SIDE_OFFSET_PX;
    const bottomCandidate = triggerRect.bottom + SIDE_OFFSET_PX;
    const top = topCandidate >= VIEWPORT_MARGIN_PX
      ? topCandidate
      : Math.min(
          Math.max(VIEWPORT_MARGIN_PX, bottomCandidate),
          window.innerHeight - popoverRect.height - VIEWPORT_MARGIN_PX,
        );
    const left = Math.max(
      VIEWPORT_MARGIN_PX,
      Math.min(triggerRect.left, window.innerWidth - popoverRect.width - VIEWPORT_MARGIN_PX),
    );
    setPosition({ top, left });
  }, []);

  useLayoutEffect(() => {
    if (!open) return;
    updatePosition();
    window.addEventListener("resize", updatePosition);
    window.addEventListener("scroll", updatePosition, true);
    return () => {
      window.removeEventListener("resize", updatePosition);
      window.removeEventListener("scroll", updatePosition, true);
    };
  }, [open, attachments, updatePosition]);

  const label = formatMessage({ id: chip.id, defaultMessage: chip.defaultMessage }, chip.values);
  const showPopover = open && attachments.length > 0 && typeof document !== "undefined";
  return (
    <>
      <button
        ref={triggerRef}
        aria-expanded={showPopover}
        aria-haspopup="dialog"
        className="hc-user-comment-attachment-chip hc-user-attachment-pill"
        data-composer-attachment-pill="true"
        tabIndex={0}
        title={label}
        type="button"
        onBlur={scheduleClose}
        onFocus={scheduleOpen}
        onMouseEnter={scheduleOpen}
        onMouseLeave={scheduleClose}
      >
        <MessageSquare aria-hidden size={13} />
        {label}
      </button>
      {showPopover
        && createPortal(
          <div
            ref={popoverRef}
            className="hc-user-comment-attachment-popover"
            role="tooltip"
            style={{
              left: position?.left ?? -9999,
              top: position?.top ?? -9999,
              visibility: position == null ? "hidden" : undefined,
            }}
            onBlur={scheduleClose}
            onFocus={scheduleOpen}
            onMouseEnter={scheduleOpen}
            onMouseLeave={scheduleClose}
          >
            {attachments.map((attachment) => (
              <UserMessageCommentAttachmentRow
                attachment={attachment}
                key={attachment.key}
                onOpenFileReference={onOpenFileReference}
              />
            ))}
          </div>,
          document.body,
        )}
    </>
  );
}

function UserMessageCommentAttachmentRow({
  attachment,
  onOpenFileReference,
}: {
  attachment: UserMessageCommentAttachmentPreview;
  onOpenFileReference?: (reference: FileReference) => void;
}) {
  return (
    <div
      className="hc-user-comment-attachment-row"
      data-has-preview={attachment.previewSrc ? "true" : undefined}
    >
      <div className="hc-user-comment-attachment-main">
        <div className="hc-user-comment-attachment-meta">
          <CommentAttachmentSource attachment={attachment} onOpenFileReference={onOpenFileReference} />
          {attachment.side && (
            <span className="hc-user-comment-attachment-side">
              {attachment.side === "left" ? "L" : "R"}
            </span>
          )}
          {attachment.lineRange && <span>{attachment.lineRange}</span>}
          {attachment.artifactRangeLabel && (
            <span className="hc-user-comment-attachment-range">
              {`Range: ${attachment.artifactRangeLabel}`}
            </span>
          )}
        </div>
        {attachment.browserElementPreview && (
          <div className="hc-user-comment-attachment-browser-element">
            <span>{attachment.browserElementPreview.tagName}</span>
            {attachment.browserElementPreview.immediateText && (
              <small>{attachment.browserElementPreview.immediateText}</small>
            )}
          </div>
        )}
        {attachment.contentPreviewText && (
          <div className="hc-user-comment-attachment-content-preview" title={attachment.contentPreviewText}>
            {attachment.contentPreviewText}
          </div>
        )}
        <CommentAttachmentBody attachment={attachment} onOpenFileReference={onOpenFileReference} />
      </div>
      {attachment.previewSrc && (
        <img
          alt={attachment.previewAlt || "Selected annotation content"}
          className="hc-user-comment-attachment-thumb"
          src={attachment.previewSrc}
        />
      )}
    </div>
  );
}

function CommentAttachmentBody({
  attachment,
  onOpenFileReference,
}: {
  attachment: UserMessageCommentAttachmentPreview;
  onOpenFileReference?: (reference: FileReference) => void;
}) {
  if (!attachment.body) return null;
  if (attachment.designTweak && attachment.designTweakChanges.length > 0) {
    return (
      <div className="hc-user-comment-attachment-body is-design-tweak">
        {designTweakBodyParts(attachment.body, attachment.designTweakChanges)}
      </div>
    );
  }
  return (
    <div className="hc-user-comment-attachment-body">
      <Markdownish text={attachment.body} onOpenFileReference={onOpenFileReference} />
    </div>
  );
}

function designTweakBodyParts(
  body: string,
  changes: readonly UserMessageDesignTweakChange[],
): ReactNode[] {
  const byLine = new Map(changes.map((change) => [designTweakLineKey(change), change]));
  return body.split("\n").flatMap((line, index) => {
    const change = byLine.get(line);
    const lineBreak = index === 0 ? [] : [<br key={`br-${index}`} />];
    if (!change) return [...lineBreak, <span key={`line-${index}`}>{line}</span>];
    return [
      ...lineBreak,
      <span
        aria-label={`${change.property}: ${change.previousValue} -> ${change.nextValue}`}
        className="hc-user-comment-attachment-design-change"
        key={`line-${index}`}
      >
        <span className="property">{`${change.property}: `}</span>
        <span>{change.previousValue}</span>
        <span aria-hidden className="arrow">{" -> "}</span>
        <span>{change.nextValue}</span>
      </span>,
    ];
  });
}

function designTweakLineKey(change: UserMessageDesignTweakChange): string {
  return `${change.property}: ${change.previousValue} -> ${change.nextValue}`;
}

function CommentAttachmentSource({
  attachment,
  onOpenFileReference,
}: {
  attachment: UserMessageCommentAttachmentPreview;
  onOpenFileReference?: (reference: FileReference) => void;
}): ReactNode {
  const content = (
    <>
      {attachment.reference && (
        <span className="hc-user-comment-attachment-source-icon" aria-hidden>
          {fileIconFor({ path: attachment.reference.path, size: 14 })}
        </span>
      )}
      <span>{attachment.label}</span>
    </>
  );
  if (attachment.reference && onOpenFileReference) {
    const openReference = () => {
      if (attachment.reference) onOpenFileReference(attachment.reference);
    };
    return (
      <button
        className="hc-user-comment-attachment-source"
        data-file-reference="true"
        title={attachment.label}
        onClick={openReference}
        type="button"
      >
        {content}
      </button>
    );
  }
  return <span className="hc-user-comment-attachment-source is-static">{content}</span>;
}
