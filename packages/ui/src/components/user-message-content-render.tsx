import type { ReactNode } from "react";
import type { ConversationRenderUnit, UserMessageContentPart } from "../state/render-groups";
import type { FileReference } from "./file-reference-types";
import {
  UserMessageAttachmentPartView,
  UserMessageContentPartView,
  userContentPartKey,
} from "./user-message-content-parts";

export { userImageSrc } from "./user-message-image-source";
export {
  userMessageInlineMarkdownSegmentsForTest,
} from "./user-message-inline-markdown";
export type {
  UserMessageInlineMarkdownSegment,
} from "./user-message-inline-markdown";

export type UserMessageMarkdownRenderer = (
  text: string,
  onOpenFileReference?: (reference: FileReference) => void,
) => ReactNode;

/*
 * Codex Desktop renders a user message as one bubble whose body is a single
 * pre-wrap text flow with inline prompt chips. Standalone attachments/images
 * render in a separate strip above that bubble.
 */

export function UserMessageAttachmentStrip({
  unit,
  onOpenFileReference,
}: {
  unit: Extract<ConversationRenderUnit, { kind: "message" }>;
  onOpenFileReference?: (reference: FileReference) => void;
}) {
  const attachments = userMessageAttachmentParts(unit);
  if (attachments.length === 0) return null;
  return (
    <div className="hc-user-message-attachments">
      {attachments.map((part, index) => (
        <UserMessageAttachmentPartView
          key={userContentPartKey(part, index)}
          part={part}
          onOpenFileReference={onOpenFileReference}
        />
      ))}
    </div>
  );
}

export function UserMessageTextContentView({
  unit,
  onOpenFileReference,
  renderMarkdown,
}: {
  unit: Extract<ConversationRenderUnit, { kind: "message" }>;
  onOpenFileReference?: (reference: FileReference) => void;
  renderMarkdown: UserMessageMarkdownRenderer;
}) {
  const content = unit.userContent ?? [];
  const inlineParts = userMessageInlineParts(content);
  if (inlineParts.length === 0) {
    if (content.length > 0) return null;
    return <>{renderMarkdown(unit.text, onOpenFileReference)}</>;
  }
  return (
    <div className="hc-user-message-inline">
      {inlineParts.map((part, index) => (
        <UserMessageContentPartView
          key={userContentPartKey(part, index)}
          part={part}
          onOpenFileReference={onOpenFileReference}
        />
      ))}
    </div>
  );
}

export function hasInlineUserMessageContent(
  unit: Extract<ConversationRenderUnit, { kind: "message" }>,
): boolean {
  const content = unit.userContent ?? [];
  if (content.length === 0) return unit.text.trim().length > 0;
  return userMessageInlineParts(content).length > 0;
}

export function hasUserMessageAttachments(
  unit: Extract<ConversationRenderUnit, { kind: "message" }>,
): boolean {
  return userMessageAttachmentParts(unit).length > 0;
}

export function userMessageAttachmentPartsForTest(
  parts: UserMessageContentPart[],
): UserMessageContentPart[] {
  return userMessageAttachmentParts({ userContent: parts });
}

export function userMessageInlinePartsForTest(
  parts: UserMessageContentPart[],
): UserMessageContentPart[] {
  return userMessageInlineParts(parts);
}

function userMessageAttachmentParts(
  unit: Pick<Extract<ConversationRenderUnit, { kind: "message" }>, "userContent">,
): UserMessageContentPart[] {
  return (unit.userContent ?? []).filter(isUserMessageAttachmentPart);
}

function userMessageInlineParts(parts: UserMessageContentPart[]): UserMessageContentPart[] {
  return parts.filter((part) => {
    if (isUserMessageAttachmentPart(part)) return false;
    if (part.kind === "text") return part.text.trim().length > 0;
    return true;
  });
}

function isUserMessageAttachmentPart(part: UserMessageContentPart): boolean {
  if (part.kind === "image") return true;
  return part.kind === "chip" && part.chipKind === "file" && part.presentation !== "inline";
}
