import type { ClipboardEvent, DragEvent, MutableRefObject } from "react";
import { useCallback, useEffect, useState } from "react";
import { listenNativeFileDropEvents } from "../lib/tauri-host";
import {
  composerAttachmentsFromPaths,
  composerFilePath,
  mergeComposerAttachments,
  splitComposerTransferFiles,
  type ComposerAttachment,
} from "../state/composer-workflow";
import {
  droppedAttachmentPaths,
  hasAttachmentTransfer,
  isDomDropInsideElement,
  isNativeDropInsideElement,
  readImageFileAttachment,
} from "./composer-attachments";

export interface ComposerAttachmentTransferHandlers {
  onDragEnter: (event: DragEvent<HTMLFormElement>) => void;
  onDragLeave: (event: DragEvent<HTMLFormElement>) => void;
  onDragOver: (event: DragEvent<HTMLFormElement>) => void;
  onDrop: (event: DragEvent<HTMLFormElement>) => void;
  onPaste: (event: ClipboardEvent<HTMLFormElement>) => void;
}

export interface UseComposerAttachmentTransferResult {
  addAttachments: (incoming: ComposerAttachment[]) => void;
  addAttachmentPaths: (paths: string[]) => void;
  addTransferFiles: (
    files: FileList | File[],
    options?: { warnUnavailablePaths?: boolean },
  ) => boolean;
  dropActive: boolean;
  transferHandlers: ComposerAttachmentTransferHandlers;
}

export function useComposerAttachmentTransfer({
  attachmentsRef,
  changeAttachments,
  closeComposerPopovers,
  composerFieldRef,
  formatMessage,
  input,
  onAttachmentError,
  onInputChange,
  requestPromptFocus,
  supportsImageInput,
}: {
  attachmentsRef: MutableRefObject<ComposerAttachment[]>;
  changeAttachments: (next: ComposerAttachment[]) => void;
  closeComposerPopovers: () => void;
  composerFieldRef: MutableRefObject<HTMLDivElement | null>;
  formatMessage: (descriptor: { id: string; defaultMessage: string }) => string;
  input: string;
  onAttachmentError?: (message: string) => void;
  onInputChange: (value: string) => void;
  requestPromptFocus: () => void;
  supportsImageInput: boolean;
}): UseComposerAttachmentTransferResult {
  const [dropActive, setDropActive] = useState(false);

  const addAttachments = useCallback((incoming: ComposerAttachment[]) => {
    if (incoming.length === 0) return;
    const merged = mergeComposerAttachments(attachmentsRef.current, incoming);
    if (merged.length === attachmentsRef.current.length) return;
    changeAttachments(merged);
    if (input.trim() === "+") onInputChange("");
    closeComposerPopovers();
    requestPromptFocus();
  }, [attachmentsRef, changeAttachments, closeComposerPopovers, input, onInputChange, requestPromptFocus]);

  const addAttachmentPaths = useCallback((paths: string[]) => {
    addAttachments(composerAttachmentsFromPaths(paths));
  }, [addAttachments]);

  const addImageFilesAsDataUrls = useCallback((files: File[]) => {
    if (files.length === 0) return;
    if (!supportsImageInput) {
      onAttachmentError?.(formatMessage({
        id: "composer.imageInputsUnsupported",
        defaultMessage: "This model does not support image inputs. Try a different model.",
      }));
      return;
    }
    void Promise.all(files.map(readImageFileAttachment)).then((items) => {
      addAttachments(items.filter((item): item is ComposerAttachment => item != null));
    });
  }, [addAttachments, formatMessage, onAttachmentError, supportsImageInput]);

  const addTransferFiles = useCallback((
    files: FileList | File[],
    options: { warnUnavailablePaths?: boolean } = {},
  ) => {
    const { imageFiles, otherFiles } = splitComposerTransferFiles(files);
    const pathAttachments: ComposerAttachment[] = [];
    const imageFilesWithoutPath: File[] = [];
    let unavailablePathCount = 0;

    if (imageFiles.length > 0 && !supportsImageInput) {
      onAttachmentError?.(formatMessage({
        id: "composer.imageInputsUnsupported",
        defaultMessage: "This model does not support image inputs. Try a different model.",
      }));
    } else {
      for (const file of imageFiles) {
        const path = composerFilePath(file);
        if (path) pathAttachments.push(...composerAttachmentsFromPaths([path]));
        else imageFilesWithoutPath.push(file);
      }
    }
    for (const file of otherFiles) {
      const path = composerFilePath(file);
      if (path) pathAttachments.push(...composerAttachmentsFromPaths([path]));
      else unavailablePathCount += 1;
    }
    if (unavailablePathCount > 0 && options.warnUnavailablePaths !== false) {
      onAttachmentError?.(formatMessage({
        id: "hc.composer.attach.filePathUnavailable",
        defaultMessage: "File path is unavailable. Use the + file picker or drag the file from Finder.",
      }));
    }

    addAttachments(pathAttachments);
    addImageFilesAsDataUrls(imageFilesWithoutPath);
    return pathAttachments.length > 0
      || imageFilesWithoutPath.length > 0
      || imageFiles.length > 0
      || unavailablePathCount > 0;
  }, [addAttachments, addImageFilesAsDataUrls, formatMessage, onAttachmentError, supportsImageInput]);

  useEffect(() => {
    let cancelled = false;
    let unlisten: (() => void) | null = null;

    void listenNativeFileDropEvents((event) => {
      if (event.type === "leave") {
        setDropActive(false);
        return;
      }

      /*
       * Codex Desktop scopes file drag/drop to the composer drop target:
       * `composer-*.js` registers drag/drop listeners on the composer element
       * and inner surface, not the whole conversation window. Tauri native
       * file-drop events arrive at the webview level, so HiCodex keeps this
       * listener but applies the same composer hit-test before showing active
       * state or accepting paths.
       */
      const insideComposer = event.position
        ? isNativeDropInsideElement(composerFieldRef.current, event.position)
        : false;
      if (event.type === "enter" || event.type === "over") {
        setDropActive(insideComposer);
        return;
      }

      if (event.type === "drop") {
        setDropActive(false);
        if (event.paths.length === 0) return;
        if (!insideComposer) return;
        addAttachmentPaths(event.paths);
        requestPromptFocus();
      }
    }).then((nextUnlisten) => {
      if (cancelled) {
        nextUnlisten?.();
      } else {
        unlisten = nextUnlisten;
      }
    }).catch(() => {
      // Browser/dev fallbacks still handle regular HTML paste and drop events.
    });

    return () => {
      cancelled = true;
      unlisten?.();
    };
  }, [addAttachmentPaths, composerFieldRef, requestPromptFocus]);

  const onPaste = useCallback((event: ClipboardEvent<HTMLFormElement>) => {
    if (event.defaultPrevented) return;
    const pastedPaths = droppedAttachmentPaths(event.clipboardData);
    if (pastedPaths.length > 0) addAttachmentPaths(pastedPaths);
    const handled = addTransferFiles(event.clipboardData.files, {
      warnUnavailablePaths: pastedPaths.length === 0,
    });
    if (handled || pastedPaths.length > 0) event.preventDefault();
  }, [addAttachmentPaths, addTransferFiles]);

  const onDragEnter = useCallback((event: DragEvent<HTMLFormElement>) => {
    if (!hasAttachmentTransfer(event.dataTransfer)) return;
    if (!isDomDropInsideElement(composerFieldRef.current, event)) {
      setDropActive(false);
      return;
    }
    event.preventDefault();
    event.stopPropagation();
    event.dataTransfer.dropEffect = "copy";
    setDropActive(true);
  }, [composerFieldRef]);

  const onDragOver = useCallback((event: DragEvent<HTMLFormElement>) => {
    if (!hasAttachmentTransfer(event.dataTransfer)) return;
    if (!isDomDropInsideElement(composerFieldRef.current, event)) {
      setDropActive(false);
      return;
    }
    event.preventDefault();
    event.stopPropagation();
    event.dataTransfer.dropEffect = "copy";
    setDropActive(true);
  }, [composerFieldRef]);

  const onDragLeave = useCallback((event: DragEvent<HTMLFormElement>) => {
    const nextTarget = event.relatedTarget;
    if (nextTarget instanceof Node && event.currentTarget.contains(nextTarget)) return;
    setDropActive(false);
  }, []);

  const onDrop = useCallback((event: DragEvent<HTMLFormElement>) => {
    if (!isDomDropInsideElement(composerFieldRef.current, event)) {
      setDropActive(false);
      return;
    }
    if (!hasAttachmentTransfer(event.dataTransfer)) {
      setDropActive(false);
      return;
    }
    event.preventDefault();
    event.stopPropagation();
    const droppedPaths = droppedAttachmentPaths(event.dataTransfer);
    const handled = addTransferFiles(event.dataTransfer.files, {
      warnUnavailablePaths: droppedPaths.length === 0,
    });
    if (droppedPaths.length > 0) addAttachmentPaths(droppedPaths);
    if (!handled && droppedPaths.length === 0) requestPromptFocus();
    setDropActive(false);
  }, [addAttachmentPaths, addTransferFiles, composerFieldRef, requestPromptFocus]);

  return {
    addAttachments,
    addAttachmentPaths,
    addTransferFiles,
    dropActive,
    transferHandlers: {
      onDragEnter,
      onDragLeave,
      onDragOver,
      onDrop,
      onPaste,
    },
  };
}
