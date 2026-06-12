import {
  AtSign,
  FileText,
  Sparkles,
  X,
} from "lucide-react";
import { createPortal } from "react-dom";
import { convertLocalFileSrc } from "../lib/tauri-host";
import {
  attachmentLabel,
  compactAttachmentLabel,
  composerAttachmentKindLabel,
  composerAttachmentPreviewSrc,
  type ComposerAttachment,
} from "../state/composer-workflow";
import { useHiCodexIntl } from "./i18n-provider";

export interface ComposerImagePreview {
  src: string;
  label: string;
}

/*
 * codex composer-CwxGJF3C.js - the drop overlay has TWO mutually-exclusive
 * states (not a stacked card):
 *   - composer.dropOverlay.holdShift   = "Hold {key} to drop" ({key}=Shift
 *     keycap) - while an image is dragged WITHOUT Shift held.
 *   - composer.dropOverlay.dropToAttach = "Drop to attach" - when the drag can
 *     be dropped to attach.
 * HiCodex only tracks a single `dropActive` boolean (droppable) and has no
 * drag-modifier state to drive the Shift-held variant, so it renders just the
 * "Drop to attach" state. The self-made "Hold"/"to drop" fragment strings are
 * removed; the holdShift {key} ICU is registered for parity but not shown until
 * the drag-modifier data flow exists.
 */
export function ComposerDropOverlay() {
  const { formatMessage } = useHiCodexIntl();
  return (
    <div className="hc-composer-drop-overlay" aria-hidden="true">
      <div className="hc-composer-drop-card">
        <span className="hc-composer-drop-action">
          {formatMessage({ id: "composer.dropOverlay.dropToAttach", defaultMessage: "Drop to attach" })}
        </span>
      </div>
    </div>
  );
}

export function ComposerAttachmentStrip({
  attachments,
  onPreviewImage,
  onRemoveAttachment,
}: {
  attachments: ComposerAttachment[];
  onPreviewImage: (preview: ComposerImagePreview) => void;
  onRemoveAttachment: (index: number) => void;
}) {
  const { formatMessage } = useHiCodexIntl();
  if (attachments.length === 0) return null;
  return (
    <div className="hc-attachment-strip">
      {attachments.map((attachment, index) => {
        const label = attachmentLabel(attachment);
        const displayLabel = compactAttachmentLabel(label);
        const kindLabel = composerAttachmentKindLabel(attachment);
        const previewSrc = resolveAttachmentPreviewSrc(attachment);
        const chipTitle = `${kindLabel}: ${label}`;
        return (
          <div
            className="hc-attachment-chip"
            key={`${attachment.type}-${index}-${label}`}
            title={chipTitle}
            data-attachment-kind={attachment.type}
          >
            {previewSrc ? (
              <button
                className="hc-attachment-chip-main"
                type="button"
                aria-label={formatMessage(
                  { id: "hc.composer.attach.previewChip", defaultMessage: "Preview {label}" },
                  { label: chipTitle },
                )}
                onClick={() => onPreviewImage({ src: previewSrc, label })}
              >
                <AttachmentPreview src={previewSrc} />
                {/*
                 * codex composer-CwxGJF3C.js - file chips show the filename
                 * (and, where available, "{extension} · {lineInfo}"), never a
                 * synthetic "Mention/Image/File" category word. The kind is
                 * conveyed by the icon alone; kindLabel is kept for hover title.
                 */}
                <span className="hc-attachment-label">{displayLabel}</span>
              </button>
            ) : (
              <span className="hc-attachment-chip-main static">
                <AttachmentStaticIcon attachment={attachment} />
                <span className="hc-attachment-label">{displayLabel}</span>
              </span>
            )}
            <button
              className="hc-attachment-remove"
              type="button"
              title={formatMessage({ id: "hc.composer.attach.removeAttachment", defaultMessage: "Remove attachment" })}
              aria-label={formatMessage(
                { id: "appshotAttachment.removeAriaLabel", defaultMessage: "Remove {title}" },
                { title: chipTitle },
              )}
              onClick={() => onRemoveAttachment(index)}
            >
              <X size={13} />
            </button>
          </div>
        );
      })}
    </div>
  );
}

export function ComposerImagePreviewPortal({
  onClose,
  preview,
}: {
  onClose: () => void;
  preview: ComposerImagePreview | null;
}) {
  const { formatMessage } = useHiCodexIntl();
  if (!preview) return null;

  /*
   * Must escape the composer's render tree: the composer mounts in the thread
   * scroll footer, inside `.hc-thread-scroll-content` whose permanent
   * `transform` re-anchors `position: fixed` and lets the scroll container
   * clip the backdrop. Same portal fix as user-message-content-render.tsx.
   */
  const overlay = (
    <div
      className="hc-image-preview-backdrop"
      role="presentation"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
    >
      <div
        className="hc-image-preview-dialog"
        role="dialog"
        aria-modal="true"
        aria-label={preview.label}
        data-state="open"
      >
        <div className="hc-image-preview-header">
          <span title={preview.label}>{preview.label}</span>
          <button
            type="button"
            aria-label={formatMessage({
              id: "codex.localConversation.closeGeneratedImagePreview",
              defaultMessage: "Close preview",
            })}
            title={formatMessage({ id: "hc.composer.preview.close", defaultMessage: "Close" })}
            onClick={onClose}
          >
            <X size={16} />
          </button>
        </div>
        <img alt={preview.label} src={preview.src} />
      </div>
    </div>
  );

  return typeof document !== "undefined"
    ? createPortal(overlay, document.body)
    : overlay;
}

export function isImageAttachment(attachment: ComposerAttachment): boolean {
  return attachment.type === "image" || attachment.type === "localImage";
}

export function AttachmentPreview({ src }: { src: string }) {
  return <img className="hc-attachment-thumb" alt="" src={src} draggable={false} />;
}

export function AttachmentStaticIcon({ attachment }: { attachment: ComposerAttachment }) {
  const className = "hc-attachment-file-icon";
  if (attachment.type === "mention") return <AtSign aria-hidden="true" className={className} size={14} />;
  if (attachment.type === "skill") return <Sparkles aria-hidden="true" className={className} size={14} />;
  return <FileText aria-hidden="true" className={className} size={14} />;
}

export function resolveAttachmentPreviewSrc(attachment: ComposerAttachment): string | null {
  const src = composerAttachmentPreviewSrc(attachment);
  if (!src) return null;
  if (attachment.type === "localImage") {
    const path = attachment.path.trim();
    if (path && !/^(?:data|blob|https?|file):/i.test(path)) {
      try {
        return convertLocalFileSrc(path);
      } catch {
        return src;
      }
    }
  }
  return src;
}

export function hasAttachmentTransfer(dataTransfer: DataTransfer | null): boolean {
  if (!dataTransfer) return false;
  if (dataTransfer.files.length > 0) return true;
  const types = Array.from(dataTransfer.types);
  if (types.some((type) => type === "Files" || type === "public.file-url" || type === "text/uri-list")) return true;
  return Array.from(dataTransfer.items).some((item) => item.kind === "file");
}

export function droppedAttachmentPaths(dataTransfer: DataTransfer): string[] {
  const values = [
    dataTransfer.getData("text/uri-list"),
    dataTransfer.getData("text/plain"),
  ];
  const paths: string[] = [];
  for (const value of values) {
    for (const line of value.split(/\r?\n/)) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith("#")) continue;
      if (isLikelyDroppedFilePath(trimmed)) paths.push(trimmed);
    }
  }
  return Array.from(new Set(paths));
}

export function isDomDropInsideElement(
  element: HTMLElement | null,
  event: { clientX: number; clientY: number },
): boolean {
  if (!element) return false;
  return isPointInsideRect(event.clientX, event.clientY, element.getBoundingClientRect());
}

export function isNativeDropInsideElement(
  element: HTMLElement | null,
  position: { x: number; y: number },
): boolean {
  if (!element || typeof window === "undefined") return false;
  /*
   * Tauri 2.x labels `onDragDropEvent`'s position as `PhysicalPosition`, but
   * the underlying wry value is platform-dependent:
   *   - macOS (wkwebview): `NSDraggingInfo.draggingLocation()` is in NSView
   *     local points = CSS pixels. Tauri still wraps it as PhysicalPosition,
   *     so dividing by devicePixelRatio on Retina halves the y coordinate and
   *     the composer hit-test silently fails.
   *   - Windows (webview2): `ScreenToClient` returns physical pixels under
   *     HiDPI awareness, so DPR division is required.
   * Detect macOS and skip the scale.
   */
  const scale = isMacOSPlatform() ? 1 : (window.devicePixelRatio || 1);
  return isPointInsideRect(position.x / scale, position.y / scale, element.getBoundingClientRect());
}

export function readImageFileAttachment(file: File): Promise<ComposerAttachment | null> {
  return new Promise((resolve) => {
    const reader = new FileReader();
    reader.onerror = () => resolve(null);
    reader.onload = () => {
      const result = reader.result;
      if (typeof result === "string" && result.startsWith("data:")) {
        resolve({ type: "image", url: result, name: file.name || undefined });
        return;
      }
      resolve(null);
    };
    reader.readAsDataURL(file);
  });
}

function isLikelyDroppedFilePath(value: string): boolean {
  return /^file:/i.test(value) || value.startsWith("/") || /^[A-Za-z]:[\\/]/.test(value);
}

function isMacOSPlatform(): boolean {
  if (typeof navigator === "undefined") return false;
  const platform = navigator.platform ?? "";
  if (platform.startsWith("Mac")) return true;
  const ua = navigator.userAgent ?? "";
  return /Mac|iPhone|iPad|iPod/.test(ua);
}

function isPointInsideRect(x: number, y: number, rect: DOMRect): boolean {
  return x >= rect.left && x <= rect.right && y >= rect.top && y <= rect.bottom;
}
