import { FileImage, X } from "lucide-react";
import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import type { UserMessageContentPart } from "../state/render-groups";
import { useHiCodexIntl } from "./i18n-provider";
import { userImageSrc } from "./user-message-image-source";

export function UserMessageImagePartView({
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
   * The preview modal must escape the message render tree because
   * `.hc-thread-scroll-content` uses transform, which otherwise creates a
   * containing block for the fixed-position backdrop.
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
