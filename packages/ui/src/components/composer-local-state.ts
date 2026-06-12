import { useCallback, useEffect, useRef, useState } from "react";
import type { ComposerAttachment, ComposerMode } from "../state/composer-workflow";
import type { ComposerImagePreview } from "./composer-attachments";

export function shouldUseComposerSingleLineLayout(
  layoutMode: "multiline" | "auto-single-line",
  pendingRequestContent: unknown,
  mode: ComposerMode,
  attachmentCount: number,
  input: string,
  measuredSingleLine: boolean,
): boolean {
  return layoutMode === "auto-single-line"
    && !pendingRequestContent
    && mode === "default"
    && attachmentCount === 0
    && !input.includes("\n")
    && measuredSingleLine;
}

export function useComposerAttachmentState(
  attachments: ComposerAttachment[],
  onAttachmentsChange: (value: ComposerAttachment[]) => void,
) {
  const attachmentsRef = useRef<ComposerAttachment[]>(attachments);

  useEffect(() => {
    attachmentsRef.current = attachments;
  }, [attachments]);

  const changeAttachments = useCallback((next: ComposerAttachment[]) => {
    attachmentsRef.current = next;
    onAttachmentsChange(next);
  }, [onAttachmentsChange]);

  return {
    attachmentsRef,
    changeAttachments,
  };
}

export function useComposerImagePreviewState() {
  const [imagePreview, setImagePreview] = useState<ComposerImagePreview | null>(null);

  useEffect(() => {
    if (!imagePreview) return;
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") setImagePreview(null);
    };
    window.addEventListener("keydown", closeOnEscape);
    return () => window.removeEventListener("keydown", closeOnEscape);
  }, [imagePreview]);

  return {
    imagePreview,
    setImagePreview,
  };
}
