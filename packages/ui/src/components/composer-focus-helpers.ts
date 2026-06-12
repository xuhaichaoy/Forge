import { focusPromptEditorElement } from "./prompt-editor";

export function requestComposerFocus(element: HTMLElement | null): void {
  window.requestAnimationFrame(() => {
    focusPromptEditorElement(element);
  });
}

export function requestAttachmentInputFocus(element: HTMLTextAreaElement | HTMLInputElement | null): void {
  window.requestAnimationFrame(() => {
    if (element?.isConnected) element.focus();
  });
}

export function attachmentBrowseError(error: unknown): string {
  if (error instanceof Error) return error.message;
  return typeof error === "string" ? error : "Unable to attach selected files";
}

export function mentionSearchError(error: unknown): string {
  if (error instanceof Error) return error.message;
  return typeof error === "string" ? error : "Unable to search mentions";
}
