import { forwardRef, useEffect, useImperativeHandle, useLayoutEffect, useRef } from "react";
import {
  promptEditorViewFromElement,
  safeFocusEditorView,
  safeFocusElement,
} from "./prompt-editor-stale-guards";
import { docToPromptText } from "./prompt-editor-serialization";
import {
  isPromptText,
} from "./prompt-editor-insertion";
import {
  PromptEditorController,
  type PromptEditorEnterBehavior,
} from "./prompt-editor-controller";

export {
  PromptEditorController,
  type PromptEditorEnterBehavior,
} from "./prompt-editor-controller";

export {
  installPromptEditorViewStaleGuardsForTest,
  isStalePromptEditorViewError,
  setPromptEditorViewDetachedForTest,
} from "./prompt-editor-stale-guards";
export {
  splitPromptEditorPasteFiles,
  type PromptEditorPasteFileLike,
} from "./prompt-editor-paste";
export {
  replacePromptEditorTextRangeWithMention,
  type PromptEditorMentionInput,
} from "./prompt-editor-mention-transaction";
export {
  insertPromptEditorText,
  movePromptEditorCursorToEnd,
} from "./prompt-editor-insertion";
export {
  promptEditorBackspaceAtEndForTest,
  promptEditorInlineNodesForTest,
  promptEditorPasteInlineNodesForTest,
  promptEditorPromptTextRoundTripForTest,
} from "./prompt-editor-test-helpers";

export interface PromptEditorProps {
  value: string;
  placeholder: string;
  singleLine?: boolean;
  ariaLabel?: string;
  className?: string;
  minHeight?: string;
  enterBehavior?: PromptEditorEnterBehavior;
  onChange: (value: string) => void;
  onKeyDown?: (event: KeyboardEvent) => boolean | void;
  onSubmit?: () => void;
  onPastedFiles?: (files: File[]) => void;
  onPastedImages?: (files: File[]) => void;
}

export const PromptEditor = forwardRef<HTMLDivElement, PromptEditorProps>(function PromptEditor({
  value,
  placeholder,
  singleLine = false,
  ariaLabel = "Prompt",
  className,
  minHeight,
  enterBehavior = "enter",
  onChange,
  onKeyDown,
  onSubmit,
  onPastedFiles,
  onPastedImages,
}, forwardedRef) {
  const rootRef = useRef<HTMLDivElement | null>(null);
  const syncingRef = useRef(false);
  const latestOnChangeRef = useRef(onChange);
  const latestOnKeyDownRef = useRef(onKeyDown);
  const latestOnSubmitRef = useRef(onSubmit);
  const latestOnPastedFilesRef = useRef(onPastedFiles);
  const latestOnPastedImagesRef = useRef(onPastedImages);
  latestOnChangeRef.current = onChange;
  latestOnKeyDownRef.current = onKeyDown;
  latestOnSubmitRef.current = onSubmit;
  latestOnPastedFilesRef.current = onPastedFiles;
  latestOnPastedImagesRef.current = onPastedImages;

  const controllerRef = useRef<PromptEditorController | null>(null);
  const destroyTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  if ((controllerRef.current == null || controllerRef.current.isDestroyed) && typeof document !== "undefined") {
    controllerRef.current = new PromptEditorController({
      defaultText: value,
      defaultTextKind: isPromptText(value) ? "prompt" : "plain",
      enterBehavior,
      onBeforeKeyDown: (event) => latestOnKeyDownRef.current?.(event),
      onChange: (nextValue) => {
        if (!syncingRef.current) latestOnChangeRef.current(nextValue);
      },
    });
  }
  const controller = controllerRef.current;

  useImperativeHandle(forwardedRef, () => {
    if (!controller) throw new Error("Prompt editor is not mounted");
    return controller.view.dom as HTMLDivElement;
  }, [controller]);

  useLayoutEffect(() => {
    if (!controller) return;
    if (destroyTimerRef.current !== null) {
      clearTimeout(destroyTimerRef.current);
      destroyTimerRef.current = null;
    }
    if (controller.isDestroyed) return;
    controller.resume();
    const root = rootRef.current;
    if (!root) throw new Error("Prompt editor root is not mounted");
    const dom = controller.view.dom as HTMLDivElement;
    if (dom.parentElement !== root) root.appendChild(dom);
    dom.dataset.virtualkeyboard = "true";
    dom.dataset.codexComposer = "true";
    dom.style.fontSize = "var(--codex-chat-font-size, 14px)";
    dom.style.height = "auto";
    dom.style.resize = "none";
    return () => {
      if (!controller.isDestroyed) dom.blur();
      controller.suspend();
      if (dom.parentElement === root) root.removeChild(dom);
      destroyTimerRef.current = setTimeout(() => {
        controller.destroy();
        if (controllerRef.current === controller) controllerRef.current = null;
        destroyTimerRef.current = null;
      }, 0);
    };
  }, [controller]);

  useEffect(() => {
    if (!controller) return;
    const submit = () => latestOnSubmitRef.current?.();
    controller.addSubmitHandler(submit);
    return () => controller.removeSubmitHandler(submit);
  }, [controller]);

  useEffect(() => {
    if (!controller) return;
    const pastedFiles = (files: File[]) => latestOnPastedFilesRef.current?.(files);
    const pastedImages = (files: File[]) => latestOnPastedImagesRef.current?.(files);
    controller.addPastedFilesHandler(pastedFiles);
    controller.addPastedImagesHandler(pastedImages);
    return () => {
      controller.removePastedFilesHandler(pastedFiles);
      controller.removePastedImagesHandler(pastedImages);
    };
  }, [controller]);

  useLayoutEffect(() => {
    controller?.setEnterBehavior(enterBehavior);
  }, [controller, enterBehavior]);

  useLayoutEffect(() => {
    if (!controller) return;
    const current = controller.getText();
    if (current === value) return;
    syncingRef.current = true;
    if (isPromptText(value)) controller.setPromptText(value);
    else controller.setText(value);
    syncingRef.current = false;
  }, [controller, value]);

  useLayoutEffect(() => {
    controller?.setPlaceholder(placeholder);
  }, [controller, placeholder]);

  useLayoutEffect(() => {
    if (!controller || controller.isDestroyed) return;
    const dom = controller.view.dom;
    if (ariaLabel) dom.setAttribute("aria-label", ariaLabel);
    else dom.removeAttribute("aria-label");
    dom.setAttribute("role", "textbox");
    dom.setAttribute("aria-multiline", singleLine ? "false" : "true");
    dom.style.minHeight = minHeight ?? (singleLine ? "1.25rem" : "2.75rem");
  }, [ariaLabel, controller, minHeight, singleLine]);

  return (
    <div
      ref={rootRef}
      className={["hc-prompt-editor", className].filter(Boolean).join(" ")}
      data-single-line={singleLine}
      onMouseDown={(event) => {
        if (controller?.isDestroyed) return;
        const editor = controller?.view.dom;
        if (!editor) return;
        if (event.target instanceof Node && editor.contains(event.target)) return;
        event.preventDefault();
        safeFocusEditorView(controller.view);
      }}
    />
  );
});

export function focusPromptEditorElement(element: HTMLElement | null): void {
  const view = promptEditorViewFromElement(element);
  if (view) {
    safeFocusEditorView(view);
    return;
  }
  safeFocusElement(element);
}

export function readPromptEditorText(element: HTMLElement | null): string {
  const view = promptEditorViewFromElement(element);
  if (view) return docToPromptText(view.state.doc).content;
  return (element?.textContent ?? "").replace(/\u00a0/g, " ");
}
