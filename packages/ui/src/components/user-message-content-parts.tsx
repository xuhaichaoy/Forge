import type { UserMessageContentPart } from "../state/render-groups";
import type { FileReference } from "./file-reference-types";
import { UserMessageChipView } from "./user-message-chip";
import { UserMessageImagePartView } from "./user-message-image-part";
import { renderUserMessageInlineMarkdown } from "./user-message-inline-markdown";

export function UserMessageContentPartView({
  part,
  onOpenFileReference,
}: {
  part: UserMessageContentPart;
  onOpenFileReference?: (reference: FileReference) => void;
}) {
  if (part.kind === "text") {
    /*
     * Codex's user-message text node (`reply-*.js`) renders text inside a
     * `whitespace-pre-wrap` container and still parses inline code/links
     * before flowing sibling chips. We keep the wrapper inline so chips
     * preserve their original order.
     */
    return (
      <span
        className="hc-user-message-text"
        data-text-elements={part.textElements.length || undefined}
      >
        {renderUserMessageInlineMarkdown(part.text)}
      </span>
    );
  }
  if (part.kind === "image") {
    return <UserMessageImagePartView part={part} />;
  }
  return <UserMessageChipView part={part} onOpenFileReference={onOpenFileReference} />;
}

export function UserMessageAttachmentPartView({
  part,
  onOpenFileReference,
}: {
  part: UserMessageContentPart;
  onOpenFileReference?: (reference: FileReference) => void;
}) {
  if (part.kind === "image") {
    return <UserMessageImagePartView part={part} />;
  }
  if (part.kind === "chip" && part.chipKind === "file") {
    return (
      <UserMessageChipView
        part={part}
        onOpenFileReference={onOpenFileReference}
        variant="attachment"
      />
    );
  }
  return null;
}

export function userContentPartKey(part: UserMessageContentPart, index: number): string {
  if (part.kind === "text") return `text:${index}:${part.text.slice(0, 32)}`;
  if (part.kind === "image") return `image:${index}:${part.src}`;
  return `chip:${index}:${part.chipKind}:${part.path || part.label}`;
}
