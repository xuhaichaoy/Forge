import {
  AtSign,
  FileImage,
  Sparkles,
  X,
} from "lucide-react";
import { useEffect, useState } from "react";
import type { ReactNode } from "react";
import { convertLocalFileSrc, isTauriRuntime } from "../lib/tauri-host";
import type { ConversationRenderUnit, UserMessageContentPart } from "../state/render-groups";
import type { FileReference } from "./message-unit";

export type UserMessageMarkdownRenderer = (
  text: string,
  onOpenFileReference?: (reference: FileReference) => void,
) => ReactNode;

export function UserMessageContentView({
  unit,
  onOpenFileReference,
  renderMarkdown,
}: {
  unit: Extract<ConversationRenderUnit, { kind: "message" }>;
  onOpenFileReference?: (reference: FileReference) => void;
  renderMarkdown: UserMessageMarkdownRenderer;
}) {
  const content = unit.userContent?.filter((part) => part.kind !== "text" || part.text.trim().length > 0) ?? [];
  if (content.length === 0) {
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

export function UserMessageAttachmentStrip({
  unit,
  onOpenFileReference,
  renderMarkdown,
}: {
  unit: Extract<ConversationRenderUnit, { kind: "message" }>;
  onOpenFileReference?: (reference: FileReference) => void;
  renderMarkdown: UserMessageMarkdownRenderer;
}) {
  const attachments = unit.userContent?.filter((part) => part.kind !== "text") ?? [];
  if (attachments.length === 0) return null;
  return (
    <div className="hc-user-message-attachments">
      {attachments.map((part, index) => (
        <UserMessageContentPartView
          key={userContentPartKey(part, index)}
          part={part}
          onOpenFileReference={onOpenFileReference}
          renderMarkdown={renderMarkdown}
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
  const textParts = unit.userContent?.filter((part) => part.kind === "text" && part.text.trim().length > 0) ?? [];
  if (textParts.length === 0) {
    return <>{renderMarkdown(unit.text, onOpenFileReference)}</>;
  }
  return (
    <>
      {textParts.map((part, index) => (
        <UserMessageContentPartView
          key={userContentPartKey(part, index)}
          part={part}
          onOpenFileReference={onOpenFileReference}
          renderMarkdown={renderMarkdown}
        />
      ))}
    </>
  );
}

function UserMessageContentPartView({
  part,
  onOpenFileReference,
  renderMarkdown,
}: {
  part: UserMessageContentPart;
  onOpenFileReference?: (reference: FileReference) => void;
  renderMarkdown: UserMessageMarkdownRenderer;
}) {
  if (part.kind === "text") {
    return (
      <div className="hc-user-message-text" data-text-elements={part.textElements.length || undefined}>
        {renderMarkdown(part.text, onOpenFileReference)}
      </div>
    );
  }
  if (part.kind === "image") {
    return <UserMessageImagePartView part={part} />;
  }
  const icon = part.chipKind === "mention" ? <AtSign size={13} /> : <Sparkles size={13} />;
  const label = `${part.chipKind === "mention" ? "@" : "$"}${part.label}`;
  if (part.chipKind === "mention" && part.path && onOpenFileReference) {
    return (
      <button
        className="hc-user-chip hc-user-chip-button"
        title={part.path}
        type="button"
        onClick={() => onOpenFileReference({ path: part.path, lineStart: 1 })}
      >
        {icon}
        <span>{label}</span>
      </button>
    );
  }
  return (
    <span className="hc-user-chip" title={part.path || part.label}>
      {icon}
      <span>{label}</span>
    </span>
  );
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
