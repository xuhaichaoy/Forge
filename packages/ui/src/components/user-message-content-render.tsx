import {
  AppWindow,
  AtSign,
  Bot,
  FileImage,
  PlugZap,
  Sparkles,
  X,
} from "lucide-react";
import { useEffect, useState } from "react";
import type { ReactNode } from "react";
import { convertLocalFileSrc, isTauriRuntime } from "../lib/tauri-host";
import { fileIconFor } from "../lib/file-icon";
import type { ConversationRenderUnit, UserMessageContentPart } from "../state/render-groups";
import type { FileReference } from "./file-reference-types";

export type UserMessageMarkdownRenderer = (
  text: string,
  onOpenFileReference?: (reference: FileReference) => void,
) => ReactNode;

/*
 * Codex Desktop renders a user message as ONE bubble (`Lc`/`Oe` in
 * `user-message-attachments-C4kFKr_t.js:10408`) whose body is a single
 * `whitespace-pre-wrap` div (`T`/`ke` in `reply-pigVihi-.js:14212`) that
 * inlines `$skill` and `@path` chips alongside the prose. Only the
 * standalone `n.attachments` and `n.images` arrays escape the bubble into
 * a sibling strip.
 *
 * HiCodex's protocol surfaces chips as their own `userContent` parts
 * (skill/file/mention/agent/plugin/app), so we don't re-parse them out of
 * the text. Instead the views below split content into two channels:
 *
 *   - `UserMessageAttachmentStrip` — images only (mirrors `n.images`).
 *   - `UserMessageTextContentView` — text parts and every non-image chip,
 *     rendered in original order so chips flow inline with the surrounding
 *     prose (mirrors `T`/`ke`).
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
 * Mirrors Codex's `n.images` strip — only image parts escape the bubble
 * into the standalone attachment row. Every other chip kind flows inline
 * inside the bubble via `UserMessageTextContentView`.
 */
export function UserMessageAttachmentStrip({
  unit,
}: {
  unit: Extract<ConversationRenderUnit, { kind: "message" }>;
  /*
   * `onOpenFileReference` / `renderMarkdown` are still accepted for the
   * legacy `UserMessageContentView` call signature but the strip only
   * renders image parts; both props are intentionally unused here.
   */
  onOpenFileReference?: (reference: FileReference) => void;
  renderMarkdown?: UserMessageMarkdownRenderer;
}) {
  const images = (unit.userContent ?? []).filter((part) => part.kind === "image");
  if (images.length === 0) return null;
  return (
    <div className="hc-user-message-attachments">
      {images.map((part, index) => (
        <UserMessageImagePartView
          key={userContentPartKey(part, index)}
          part={part as Extract<UserMessageContentPart, { kind: "image" }>}
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
  const inlineParts = (unit.userContent ?? []).filter((part) => {
    if (part.kind === "image") return false;
    if (part.kind === "text") return part.text.trim().length > 0;
    return true;
  });
  if (inlineParts.length === 0) {
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

function UserMessageContentPartView({
  part,
  onOpenFileReference,
}: {
  part: UserMessageContentPart;
  onOpenFileReference?: (reference: FileReference) => void;
}) {
  if (part.kind === "text") {
    /*
     * Codex's `T`/`ke` (`reply-pigVihi-.js:14212`) renders text inside a
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
}: {
  part: Extract<UserMessageContentPart, { kind: "chip" }>;
  onOpenFileReference?: (reference: FileReference) => void;
}) {
  const { icon, label, prefix } = chipVisual(part);
  const displayLabel = `${prefix}${label}`;
  const style = part.brandColor ? { color: part.brandColor } : undefined;
  const className = `hc-user-chip hc-user-chip-${part.chipKind}`;

  // 可点击：file / mention 类带 path 且提供了 onOpenFileReference
  const isInteractive = (part.chipKind === "mention" || part.chipKind === "file") && Boolean(part.path) && Boolean(onOpenFileReference);
  if (isInteractive) {
    return (
      <button
        className={`${className} hc-user-chip-button`}
        title={part.path}
        type="button"
        style={style}
        onClick={() => onOpenFileReference?.({ path: part.path, lineStart: 1 })}
      >
        {icon}
        <span>{displayLabel}</span>
      </button>
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
      return { icon: iconImg ?? <Sparkles size={13} />, label, prefix: "$" };
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

function UserMessageImagePartView({
  part,
}: {
  part: Extract<UserMessageContentPart, { kind: "image" }>;
}) {
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
      {previewOpen && (
        <div
          className="hc-image-preview-backdrop"
          onMouseDown={(event) => {
            if (event.currentTarget === event.target) setPreviewOpen(false);
          }}
        >
          <div aria-label={part.label} aria-modal="true" className="hc-image-preview-dialog" role="dialog">
            <div className="hc-image-preview-header">
              <span>{part.label}</span>
              <button aria-label="Close image preview" type="button" onClick={() => setPreviewOpen(false)}>
                <X size={16} />
              </button>
            </div>
            <img alt={part.label} referrerPolicy="no-referrer" src={src} />
          </div>
        </div>
      )}
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
