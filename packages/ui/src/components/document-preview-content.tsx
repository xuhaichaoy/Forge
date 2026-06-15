import { useForgeIntl } from "./i18n-provider";
import type { DocumentPreview } from "../lib/tauri-host";

export function DocumentPreviewContent({
  preview,
  className,
  paragraphClassName,
  paragraphKeyPrefix = "",
  truncationClassName,
  truncatedMessageId,
  truncationPlacement = "inside",
  emptyClassName,
  emptyMessageId = "artifactTab.previewError",
}: {
  preview: DocumentPreview;
  className: string;
  paragraphClassName?: string;
  paragraphKeyPrefix?: string;
  truncationClassName: string;
  truncatedMessageId: string;
  /*
   * "inside" renders the truncation notice as the last child of the scroll
   * container (file-preview layout); "after" renders it as a sibling so it
   * stays visible as a fixed footer when the container itself scrolls
   * (artifact card layout, where the container is height-capped).
   */
  truncationPlacement?: "inside" | "after";
  emptyClassName?: string;
  emptyMessageId?: string;
}) {
  const { formatMessage } = useForgeIntl();
  if (preview.paragraphs.length === 0) {
    return (
      <div className={emptyClassName ?? className}>
        {formatMessage({ id: emptyMessageId, defaultMessage: "Couldn’t load this preview" })}
      </div>
    );
  }
  const truncation = preview.truncated ? (
    <div className={truncationClassName}>
      {formatMessage({ id: truncatedMessageId, defaultMessage: "Preview truncated" })}
    </div>
  ) : null;
  return (
    <>
      <div className={className}>
        {preview.paragraphs.map((paragraph, index) => (
          <p className={paragraphClassName} key={`${paragraphKeyPrefix}${index}:${paragraph.slice(0, 24)}`}>{paragraph}</p>
        ))}
        {truncationPlacement === "inside" && truncation}
      </div>
      {truncationPlacement === "after" && truncation}
    </>
  );
}
