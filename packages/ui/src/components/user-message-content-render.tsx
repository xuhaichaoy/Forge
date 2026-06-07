import {
  AppWindow,
  AtSign,
  Bot,
  FileImage,
  PlugZap,
  X,
} from "lucide-react";
import { useContext, useEffect, useState } from "react";
import { createPortal } from "react-dom";
import type { ReactNode } from "react";
import { convertLocalFileSrc, isTauriRuntime } from "../lib/tauri-host";
import { fileIconFor } from "../lib/file-icon";
import type { ConversationRenderUnit, UserMessageContentPart } from "../state/render-groups";
import type { FileReference } from "./file-reference-types";
// codex user-message-attachments-*.js wraps attachment/file pills with the same
// workspace-file context menu as inline refs (shared via ./file-citation-menu).
import { ContextMenu } from "./context-menu";
import { FileCitationMenuContext, fileReferenceContextMenuItems } from "./file-citation-menu";
import { useHiCodexIntl } from "./i18n-provider";

export type UserMessageMarkdownRenderer = (
  text: string,
  onOpenFileReference?: (reference: FileReference) => void,
) => ReactNode;

/*
 * Codex Desktop renders a user message as ONE bubble (in
 * `user-message-attachments-*.js`) whose body is a single
 * `whitespace-pre-wrap` div (in `reply-*.js`) that
 * inlines `$skill` and `@path` chips alongside the prose. Only the
 * standalone `n.attachments` and `n.images` arrays escape the bubble into
 * one sibling strip.
 *
 * HiCodex's protocol surfaces chips as their own `userContent` parts
 * (skill/file/mention/agent/plugin/app), so we don't re-parse them out of
 * the text. Instead the views below split content into two channels:
 *
 *   - `UserMessageAttachmentStrip` — images plus file attachment pills
 *     (mirrors Desktop's unified n.attachments/n.images strip).
 *   - `UserMessageTextContentView` — text parts and inline prompt chips,
 *     rendered in original order so $skill / @path chips flow with the
 *     surrounding prose (mirrors the Desktop pre-wrap text div).
 *
 * `UserMessageContentView` keeps the legacy wrapper that pairs both, but
 * the live call site (`message-unit.tsx`) places the image strip OUTSIDE
 * the bubble and the text view INSIDE so the layout matches Codex.
 */

export function UserMessageContentView({
  unit,
  onOpenFileReference,
  renderMarkdown,
}: {
  unit: Extract<ConversationRenderUnit, { kind: "message" }>;
  onOpenFileReference?: (reference: FileReference) => void;
  renderMarkdown: UserMessageMarkdownRenderer;
}) {
  const hasContent = (unit.userContent?.length ?? 0) > 0;
  if (!hasContent) {
    return <>{renderMarkdown(unit.text, onOpenFileReference)}</>;
  }
  return (
    <div className="hc-user-message-content">
      <UserMessageAttachmentStrip
        unit={unit}
        onOpenFileReference={onOpenFileReference}
        renderMarkdown={renderMarkdown}
      />
      <UserMessageTextContentView
        unit={unit}
        onOpenFileReference={onOpenFileReference}
        renderMarkdown={renderMarkdown}
      />
    </div>
  );
}

/*
 * Mirrors Codex's unified user attachment strip: file attachment pills and
 * images share the same right-aligned row above the text bubble.
 */
export function UserMessageAttachmentStrip({
  unit,
  onOpenFileReference,
}: {
  unit: Extract<ConversationRenderUnit, { kind: "message" }>;
  onOpenFileReference?: (reference: FileReference) => void;
  /*
   * `renderMarkdown` is still accepted for the legacy
   * `UserMessageContentView` call signature but the strip renders only
   * structured attachment parts.
   */
  renderMarkdown?: UserMessageMarkdownRenderer;
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

// codex user-message-attachments-*.js — the strip above the bubble holds the
// standalone attachment/image parts. Used to decide whether a body-less user
// message still has a visible surface (and thus warrants the "(No content)"
// placeholder in the bubble slot).
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

function UserMessageContentPartView({
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
     * preserve their original order, but parse the text content instead of
     * emitting raw markdown.
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

function UserMessageAttachmentPartView({
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

export type UserMessageInlineMarkdownSegment =
  | { kind: "text"; text: string }
  | { kind: "code"; text: string }
  | { kind: "link"; label: string; href: string };

export function userMessageInlineMarkdownSegmentsForTest(text: string): UserMessageInlineMarkdownSegment[] {
  return userMessageInlineMarkdownSegments(text);
}

function userMessageInlineMarkdownSegments(text: string): UserMessageInlineMarkdownSegment[] {
  const segments: UserMessageInlineMarkdownSegment[] = [];
  let index = 0;
  const pushText = (value: string) => {
    if (!value) return;
    const previous = segments[segments.length - 1];
    if (previous?.kind === "text") previous.text += value;
    else segments.push({ kind: "text", text: value });
  };

  while (index < text.length) {
    const codeIndex = text.indexOf("`", index);
    const linkIndex = text.indexOf("[", index);
    const candidates = [codeIndex, linkIndex].filter((value) => value >= 0);
    const next = candidates.length > 0 ? Math.min(...candidates) : -1;
    if (next < 0) {
      pushText(text.slice(index));
      break;
    }
    pushText(text.slice(index, next));

    if (next === codeIndex) {
      const end = text.indexOf("`", next + 1);
      if (end < 0) {
        pushText(text.slice(next));
        break;
      }
      segments.push({ kind: "code", text: text.slice(next + 1, end) });
      index = end + 1;
      continue;
    }

    const link = parseUserMessageMarkdownLink(text, next);
    if (!link) {
      pushText(text.slice(next, next + 1));
      index = next + 1;
      continue;
    }
    if (isUnsafeUserMessageHref(link.href)) {
      pushText(text.slice(next, link.endIndex));
    } else {
      segments.push({ kind: "link", label: link.label, href: link.href });
    }
    index = link.endIndex;
  }

  return segments;
}

function renderUserMessageInlineMarkdown(text: string): ReactNode[] {
  return userMessageInlineMarkdownSegments(text).map((segment, index) => {
    if (segment.kind === "code") {
      return <code key={index}>{segment.text}</code>;
    }
    if (segment.kind === "link") {
      return (
        <a
          className={isExternalUserMessageHref(segment.href) ? "hc-markdown-link is-external" : "hc-markdown-link"}
          href={segment.href}
          key={index}
          rel={isExternalUserMessageHref(segment.href) ? "noreferrer" : undefined}
          target={isExternalUserMessageHref(segment.href) ? "_blank" : undefined}
          title={segment.href}
        >
          <span className="hc-markdown-link-label">{segment.label}</span>
        </a>
      );
    }
    return segment.text;
  });
}

function parseUserMessageMarkdownLink(
  text: string,
  startIndex: number,
): { label: string; href: string; endIndex: number } | null {
  const labelEnd = text.indexOf("]", startIndex + 1);
  if (labelEnd <= startIndex + 1 || text[labelEnd + 1] !== "(") return null;
  let cursor = labelEnd + 2;
  let href = "";
  while (cursor < text.length) {
    const char = text[cursor];
    if (char === "\\") {
      const next = text[cursor + 1];
      if (!next) return null;
      href += next;
      cursor += 2;
      continue;
    }
    if (char === ")") {
      return {
        label: text.slice(startIndex + 1, labelEnd),
        href,
        endIndex: cursor + 1,
      };
    }
    href += char;
    cursor += 1;
  }
  return null;
}

function isUnsafeUserMessageHref(value: string): boolean {
  return /^\s*(?:javascript|data):/i.test(value);
}

function isExternalUserMessageHref(value: string): boolean {
  return /^https?:\/\//i.test(value);
}

function UserMessageChipView({
  part,
  onOpenFileReference,
  variant = "inline",
}: {
  part: Extract<UserMessageContentPart, { kind: "chip" }>;
  onOpenFileReference?: (reference: FileReference) => void;
  variant?: "inline" | "attachment";
}) {
  // codex: file/attachment chips carry the shared workspace-file context menu;
  // reveal + copy-contents arrive via context (provided above the conversation).
  const menuActions = useContext(FileCitationMenuContext);
  const { formatMessage } = useHiCodexIntl();
  const [menu, setMenu] = useState<{ x: number; y: number } | null>(null);
  const { icon, label, prefix } = chipVisual(part);
  const displayLabel = `${prefix}${label}`;
  const style = part.brandColor && part.chipKind !== "skill" ? { color: part.brandColor } : undefined;
  const className = `hc-user-chip hc-user-chip-${part.chipKind}${variant === "attachment" ? " hc-user-attachment-pill" : ""}`;

  if (part.chipKind === "skill") {
    return (
      <span className={className} title={part.path || label}>
        <span className="hc-user-chip-skill-icon-slot">{icon}</span>
        <span className="hc-user-chip-skill-label">{displayLabel}</span>
      </span>
    );
  }

  // 可点击：file / mention 类带 path 且提供了 onOpenFileReference
  const isInteractive = (part.chipKind === "mention" || part.chipKind === "file") && Boolean(part.path) && Boolean(onOpenFileReference);
  if (isInteractive) {
    const reference = { path: part.path, lineStart: 1 };
    const items = fileReferenceContextMenuItems({ reference, onOpenFileReference, menuActions, formatMessage });
    return (
      <>
        <button
          className={`${className} hc-user-chip-button`}
          title={part.path}
          type="button"
          style={style}
          onClick={() => onOpenFileReference?.(reference)}
          onContextMenu={(event) => {
            event.preventDefault();
            setMenu({ x: event.clientX, y: event.clientY });
          }}
        >
          {icon}
          <span>{displayLabel}</span>
        </button>
        {menu != null && <ContextMenu items={items} x={menu.x} y={menu.y} onClose={() => setMenu(null)} />}
      </>
    );
  }
  return (
    <span className={className} title={part.path || label} style={style}>
      {icon}
      <span>{displayLabel}</span>
    </span>
  );
}

function chipVisual(
  part: Extract<UserMessageContentPart, { kind: "chip" }>,
): { icon: ReactNode; label: string; prefix: string } {
  const label = part.displayName ?? part.label;

  const iconImg = part.iconSmall
    ? <img alt="" className="hc-user-chip-icon-img" src={part.iconSmall} />
    : null;

  switch (part.chipKind) {
    case "file":
      return {
        icon: iconImg ?? fileIconFor({ path: part.path || part.label, size: 13 }),
        label,
        prefix: "",
      };
    case "skill":
      return { icon: iconImg ?? <SkillMentionIcon />, label, prefix: "" };
    case "app":
      return { icon: iconImg ?? <AppWindow size={13} />, label, prefix: "$" };
    case "plugin":
      return { icon: iconImg ?? <PlugZap size={13} />, label, prefix: "@" };
    case "agent":
      return { icon: iconImg ?? <Bot size={13} />, label, prefix: "@" };
    case "mention":
    default:
      return { icon: iconImg ?? <AtSign size={13} />, label, prefix: "@" };
  }
}

function SkillMentionIcon() {
  return (
    <svg
      aria-hidden="true"
      className="hc-user-chip-skill-icon"
      fill="none"
      viewBox="0 0 20 20"
      xmlns="http://www.w3.org/2000/svg"
    >
      <path
        d="M10.1 1.8 15.1 4.9c.55.34.9.96.9 1.62v6.86c0 .68-.36 1.31-.94 1.66l-5.17 3.18c-.61.37-1.38.35-1.97-.06l-3.12-2.13A1.9 1.9 0 0 1 4 14.46V6.58c0-.67.35-1.29.92-1.64l4.02-2.48c.35-.22.78-.46 1.16-.66Z"
        stroke="currentColor"
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth="1.35"
      />
      <path
        d="M4.9 6.15 8.6 8.65l6.46-3.74M8.6 8.65v8.66M15.1 8.15l-5.06 3.1"
        stroke="currentColor"
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth="1.35"
      />
    </svg>
  );
}

function UserMessageImagePartView({
  part,
}: {
  part: Extract<UserMessageContentPart, { kind: "image" }>;
}) {
  const { formatMessage } = useHiCodexIntl();
  const [previewOpen, setPreviewOpen] = useState(false);
  const [imageFailed, setImageFailed] = useState(false);
  const src = userImageSrc(part);
  useEffect(() => {
    if (!previewOpen) return;
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") setPreviewOpen(false);
    };
    window.addEventListener("keydown", closeOnEscape);
    return () => window.removeEventListener("keydown", closeOnEscape);
  }, [previewOpen]);

  /*
   * The preview modal must escape the message's render tree because the thread
   * scroll content wrapper (`.hc-thread-scroll-content` in conversation.css)
   * carries `transform: translateX(...)` — even when the variable is `0`, the
   * `transform` value (not `none`) creates a containing block for fixed-position
   * descendants. Rendered inline, our `position: fixed` backdrop would re-anchor
   * to the transformed wrapper and then be clipped by the scroll container's
   * `overflow-y: auto`, showing only the slice intersecting the visible scroll
   * area (the "image opens completely truncated" bug). The same fix is already
   * applied in `image-preview-lightbox.tsx:239-244`.
   */
  const overlay = previewOpen ? (
    <div
      className="hc-image-preview-backdrop"
      onMouseDown={(event) => {
        if (event.currentTarget === event.target) setPreviewOpen(false);
      }}
    >
      <div aria-label={part.label} aria-modal="true" className="hc-image-preview-dialog" role="dialog" data-state="open">
        <div className="hc-image-preview-header">
          <span>{part.label}</span>
          <button aria-label={formatMessage({ id: "imagePreviewDialog.close", defaultMessage: "Close image preview" })} type="button" onClick={() => setPreviewOpen(false)}>
            <X size={16} />
          </button>
        </div>
        <img alt={part.label} referrerPolicy="no-referrer" src={src} />
      </div>
    </div>
  ) : null;

  return (
    <>
      <button
        aria-label={part.label}
        className="hc-user-image-card"
        title={part.label}
        type="button"
        onClick={() => setPreviewOpen(true)}
      >
        {imageFailed
          ? (
              <span className="hc-user-image-fallback">
                <FileImage size={18} />
                <span>{part.label}</span>
              </span>
            )
          : (
              <img
                alt={part.label}
                referrerPolicy="no-referrer"
                src={src}
                onError={() => setImageFailed(true)}
              />
            )}
      </button>
      {overlay && (typeof document !== "undefined" ? createPortal(overlay, document.body) : overlay)}
    </>
  );
}

function userContentPartKey(part: UserMessageContentPart, index: number): string {
  if (part.kind === "text") return `text:${index}:${part.text.slice(0, 32)}`;
  if (part.kind === "image") return `image:${index}:${part.src}`;
  return `chip:${index}:${part.chipKind}:${part.path || part.label}`;
}

export function userImageSrc(part: Extract<UserMessageContentPart, { kind: "image" }>): string {
  if (part.source !== "local") return part.src;
  if (/^file:/i.test(part.src)) {
    const path = fileUrlToPath(part.src);
    if (path && isTauriRuntime()) return convertLocalFileSrc(path);
    return part.src;
  }
  if (/^(?:data|blob|https?):/i.test(part.src)) return part.src;
  if (isTauriRuntime()) return convertLocalFileSrc(part.src);
  const normalizedPath = part.src.startsWith("/") ? part.src : `/${part.src}`;
  return `file://${encodeURI(normalizedPath)}`;
}

function fileUrlToPath(value: string): string | null {
  try {
    const url = new URL(value);
    if (url.protocol !== "file:") return null;
    return decodeURIComponent(url.pathname);
  } catch {
    return null;
  }
}
