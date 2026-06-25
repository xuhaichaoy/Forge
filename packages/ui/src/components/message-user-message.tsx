import { GitFork, Pencil } from "lucide-react";
import { useEffect, useState } from "react";
import type { ReactNode } from "react";
import { useForgeIntl } from "./i18n-provider";
import type { FileReference } from "./file-reference-types";
import { UserEditForm } from "./user-message-edit-form";
import { CollapsedUserText } from "./user-message-collapsed-text";
import {
  IconActionButton,
  MessageActionRow,
  shouldRenderMessageActionRow,
} from "./message-action-row";
import {
  UserMessageAttachmentStrip,
  hasInlineUserMessageContent,
  hasUserMessageAttachments,
} from "./user-message-content-render";
import {
  userMessageMetaChips,
  type UserMessageMetaChip,
} from "./user-message-meta";
import type {
  MessageRenderUnit,
  UserMarkdownRenderer,
} from "./user-message-types";
import type { OpenThreadHandler } from "./open-thread";

export function UserMessageUnit({
  unit,
  onEdit,
  onOpenFileReference,
  onOpenThreadId,
  renderMarkdown,
}: {
  unit: MessageRenderUnit;
  onEdit?: (message: string) => void | Promise<void>;
  onOpenFileReference?: (reference: FileReference) => void;
  onOpenThreadId?: OpenThreadHandler;
  renderMarkdown: UserMarkdownRenderer;
}) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(unit.text);
  const [submitting, setSubmitting] = useState(false);
  /*
   * Previously, `editLastUserTurn` (state/thread-workflow.ts:448) could throw
   * with a clear message: "Only the most recent message can be edited." /
   * "Cannot edit a message while a turn is in progress." / rollback errors.
   * The error propagated up into `use-thread-actions.ts`, was dispatched into
   * the silent log channel, and `setEditing(false)` never ran. The user saw the
   * edit form sit there after pressing Send with no feedback. Capture the error
   * here so we can surface it inside the form.
   */
  const [submitError, setSubmitError] = useState<string | null>(null);
  useEffect(() => {
    if (!editing) setDraft(unit.text);
  }, [editing, unit.text]);
  useEffect(() => {
    if (!editing) setSubmitError(null);
  }, [editing]);

  if (editing && onEdit) {
    return (
      <div className="hc-user-edit-shell">
        <UserEditForm
          draft={draft}
          disabled={submitting}
          errorMessage={submitError}
          onCancel={() => {
            setDraft(unit.text);
            setEditing(false);
          }}
          onDraftChange={(next) => {
            if (submitError) setSubmitError(null);
            setDraft(next);
          }}
          onSubmit={async (message) => {
            setSubmitting(true);
            setSubmitError(null);
            try {
              await onEdit(message);
              setEditing(false);
            } catch (error) {
              setSubmitError(error instanceof Error ? error.message : String(error));
            } finally {
              setSubmitting(false);
            }
          }}
        />
      </div>
    );
  }

  return (
    <>
      {unit.parentThreadAttachment && (
        <ParentThreadAttachmentChip
          sourceConversationId={unit.parentThreadAttachment.sourceConversationId}
          onOpenThreadId={onOpenThreadId}
        />
      )}
      <UserMessageAttachmentStrip
        unit={unit}
        onOpenFileReference={onOpenFileReference}
      />
      {shouldRenderUserMessageBubble(unit) && (
        <UserMessageBubble onBeginEdit={onEdit ? () => setEditing(true) : undefined}>
          <CollapsedUserText
            unit={unit}
            onOpenFileReference={onOpenFileReference}
            renderMarkdown={renderMarkdown}
          />
        </UserMessageBubble>
      )}
      {!shouldRenderUserMessageBubble(unit) && hasUserMessageAttachments(unit) && (
        <UserMessageNoContent />
      )}
      <UserMessageActions
        copyText={unit.copyText ?? unit.text}
        meta={userMessageMetaChips(unit.item)}
        onEdit={onEdit ? () => setEditing(true) : undefined}
        sentAtMs={messageSentAtMs(unit.item)}
      />
    </>
  );
}

function ParentThreadAttachmentChip({
  sourceConversationId,
  onOpenThreadId,
}: {
  sourceConversationId: string;
  onOpenThreadId?: OpenThreadHandler;
}) {
  const { formatMessage } = useForgeIntl();
  const content = (
    <>
      <GitFork aria-hidden size={14} />
      <span>{formatMessage({ id: "localConversation.parentThread", defaultMessage: "Parent chat" })}</span>
    </>
  );
  if (!onOpenThreadId) {
    return <div className="hc-parent-thread-attachment">{content}</div>;
  }
  return (
    <button
      className="hc-parent-thread-attachment"
      type="button"
      onClick={() => onOpenThreadId(sourceConversationId)}
    >
      {content}
    </button>
  );
}

// codex user-message-attachments-*.js - the most recent editable user bubble is
// itself interactive: role="button" tabIndex=0, double-click or Enter/Space enters
// edit mode, with a focus-visible ring and aria-label. Uses a div (not <button>) so
// nested prompt chips / file links / the Show more toggle keep their own clicks.
function UserMessageBubble({
  children,
  onBeginEdit,
}: {
  children: ReactNode;
  onBeginEdit?: () => void;
}) {
  const { formatMessage } = useForgeIntl();
  if (!onBeginEdit) {
    return <div className="hc-user-message-bubble">{children}</div>;
  }
  return (
    <div
      className="hc-user-message-bubble is-editable"
      role="button"
      tabIndex={0}
      aria-label={formatMessage({
        id: "codex.userMessage.editBubbleAriaLabel",
        defaultMessage: "Edit user message",
        description: "Aria label for an editable user message bubble",
      })}
      onDoubleClick={() => onBeginEdit()}
      onKeyDown={(event) => {
        // Only act when the bubble itself is focused; nested buttons/links keep
        // their own Enter/Space behavior.
        if (event.target !== event.currentTarget) return;
        if (event.key === "Enter" || event.key === " ") {
          event.preventDefault();
          onBeginEdit();
        }
      }}
    >
      {children}
    </div>
  );
}

// codex user-message-attachments-*.js - when a user message has only
// attachments/images and no visible body, the bubble slot shows a faded
// "(No content)" line (text-size-chat text-token-description-foreground).
function UserMessageNoContent() {
  const { formatMessage } = useForgeIntl();
  return (
    <div className="hc-user-message-no-content">
      {formatMessage({
        id: "codex.userMessage.noContent",
        defaultMessage: "(No content)",
        description: "Text for when a user message has no content",
      })}
    </div>
  );
}

function shouldRenderUserMessageBubble(unit: MessageRenderUnit): boolean {
  /*
   * Codex puts prose plus inline prompt chips (`$skill` / `@path`) inside
   * the bubble. File attachments and images live in the sibling strip
   * above it, so pure attachment messages do not create an empty bubble.
   */
  return hasInlineUserMessageContent(unit);
}

function UserMessageActions({
  copyText,
  meta,
  onEdit,
  sentAtMs,
}: {
  copyText: string;
  meta: UserMessageMetaChip[];
  onEdit?: () => void;
  sentAtMs?: number | null;
}) {
  const { formatMessage } = useForgeIntl();
  const hasActionChildren = Boolean(onEdit);
  const shouldRenderActionRow = shouldRenderMessageActionRow({ copyText, hasActionChildren });
  const copyMessageLabel = formatMessage({
    id: "codex.userMessage.copyAriaLabel",
    defaultMessage: "Copy message",
    description: "Aria label for the button that copies the user's message",
  });
  const actionRow = shouldRenderActionRow
    ? (
        <MessageActionRow
          copyText={copyText}
          copyTextLabel={copyMessageLabel}
          hasActionChildren={hasActionChildren}
          sentAtMs={sentAtMs}
        >
          {onEdit && (
            <IconActionButton ariaLabel={formatMessage({ id: "codex.userMessage.editAriaLabel", defaultMessage: "Edit message" })} title={formatMessage({ id: "codex.userMessage.editTooltip", defaultMessage: "Edit" })} onClick={onEdit}>
              {/* Forge divergence: 12px (Codex action icon-xs = 16px), per product preference */}
              <Pencil size={12} />
            </IconActionButton>
          )}
        </MessageActionRow>
      )
    : null;
  if (!shouldRenderUserMessageActionStrip({ copyText, hasEditAction: hasActionChildren, metaCount: meta.length })) return null;
  if (meta.length === 0) return actionRow;
  return (
    <div className="hc-user-message-action-strip">
      {meta.map((chip) => (
        <span className="hc-message-action-status meta" key={chip.id}>
          {formatMessage({ id: chip.id, defaultMessage: chip.defaultMessage }, chip.values)}
        </span>
      ))}
      {actionRow}
    </div>
  );
}

function messageSentAtMs(item: Record<string, unknown>): number | null {
  const candidates: unknown[] = [
    item.sentAtMs,
    item.startedAtMs,
    item.createdAtMs,
    item.createdAt,
    item.completedAtMs,
  ];
  for (const value of candidates) {
    if (typeof value === "number" && Number.isFinite(value) && value > 0) return value;
  }
  return null;
}

export function shouldRenderUserMessageActionStrip({
  copyText,
  hasEditAction = false,
  metaCount = 0,
}: {
  copyText: string;
  hasEditAction?: boolean;
  metaCount?: number;
}): boolean {
  return metaCount > 0 || shouldRenderMessageActionRow({ copyText, hasActionChildren: hasEditAction });
}
