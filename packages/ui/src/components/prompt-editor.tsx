import { forwardRef, useEffect, useImperativeHandle, useLayoutEffect, useRef } from "react";
import { chainCommands, deleteSelection, selectAll, splitBlock } from "prosemirror-commands";
import { history, redo, undo } from "prosemirror-history";
import { keymap } from "prosemirror-keymap";
import { Fragment, Schema, Slice } from "prosemirror-model";
import type { Node as ProseMirrorNode, NodeSpec } from "prosemirror-model";
import { EditorState, Plugin, PluginKey, TextSelection } from "prosemirror-state";
import { Decoration, DecorationSet, EditorView } from "prosemirror-view";

export type PromptEditorEnterBehavior = "enter" | "newline" | "cmdIfMultiline";

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

type PromptEditorEventName = "submit" | "change" | "pasted-files" | "pasted-images";
type PromptEditorEventListener = (() => void) | ((files: File[]) => void);

export interface PromptEditorPasteFileLike {
  readonly name?: string;
  readonly type?: string;
}

export interface PromptEditorMentionInput {
  kind?: "file" | "skill" | "app" | "plugin" | "agent";
  name: string;
  displayName?: string;
  path: string;
  description?: string;
  /**
   * Current-session registry metadata used only by the editor chip render path.
   * It is not part of the app-server UserInput transcript payload.
   */
  iconSmall?: string;
  brandColor?: string;
}

class PromptEditorEmitter {
  private readonly listeners = new Map<PromptEditorEventName, Set<PromptEditorEventListener>>();

  emit(name: PromptEditorEventName, payload?: File[]): void {
    this.listeners.get(name)?.forEach((listener) => {
      if (payload) (listener as (files: File[]) => void)(payload);
      else (listener as () => void)();
    });
  }

  addListener(name: PromptEditorEventName, listener: PromptEditorEventListener): void {
    const listeners = this.listeners.get(name) ?? new Set();
    listeners.add(listener);
    this.listeners.set(name, listeners);
  }

  removeListener(name: PromptEditorEventName, listener: PromptEditorEventListener): void {
    this.listeners.get(name)?.delete(listener);
  }

  clear(): void {
    this.listeners.clear();
  }
}

export class PromptEditorController {
  readonly eventEmitter: PromptEditorEmitter;
  readonly view: EditorView;
  private enterBehavior: PromptEditorEnterBehavior;
  private destroyed = false;
  private suspended = false;

  constructor({
    defaultText,
    defaultTextKind,
    enterBehavior = "enter",
    onBeforeKeyDown,
    onChange,
  }: {
    defaultText: string;
    defaultTextKind: "plain" | "prompt";
    enterBehavior?: PromptEditorEnterBehavior;
    onBeforeKeyDown?: (event: KeyboardEvent) => boolean | void;
    onChange?: (value: string) => void;
  }) {
    this.eventEmitter = new PromptEditorEmitter();
    this.enterBehavior = enterBehavior;
    const schema = promptEditorSchema;
    let view!: EditorView;
    const emitSubmit = () => {
      this.eventEmitter.emit("submit");
      return true;
    };
    const insertLineBreak = (state: EditorState, dispatch?: (tr: EditorState["tr"]) => void, editorView?: EditorView) =>
      chainCommands(splitBlock, (nextState, nextDispatch) => {
        nextDispatch?.(nextState.tr.insertText("\n"));
        return true;
      })(state, dispatch, editorView);

    view = new EditorView(null, {
      state: EditorState.create({
        schema,
        doc: defaultTextKind === "prompt"
          ? promptTextToDoc({ schema, text: defaultText })
          : plainTextToDoc({ schema, text: defaultText }),
        plugins: [
          history(),
          placeholderPlugin(""),
          keymap({
            ArrowDown: (state) => {
              const first = state.doc.firstChild;
              return state.doc.childCount === 1 && Boolean(first?.isTextblock) && first?.content.size === 0;
            },
            "Shift-Enter": insertLineBreak,
            "Alt-Enter": insertLineBreak,
            Enter: (state, dispatch, editorView) => {
              if (this.enterBehavior === "newline") return insertLineBreak(state, dispatch, editorView);
              if (this.enterBehavior === "cmdIfMultiline" && state.doc.childCount > 1) {
                return insertLineBreak(state, dispatch, editorView);
              }
              return emitSubmit();
            },
            "Mod-Enter": emitSubmit,
            "Mod-a": selectAll,
            Backspace: deleteSelection,
            Delete: deleteSelection,
            "Mod-z": undo,
            "Mod-y": redo,
            "Mod-Shift-z": redo,
          }),
        ],
      }),
      dispatchTransaction: (transaction) => {
        if (!this.isLiveView()) return;
        const nextState = view.state.apply(transaction);
        if (!this.isLiveView()) return;
        if (!safeUpdateEditorState(view, nextState)) return;
        onChange?.(docToPromptText(nextState.doc).content);
        this.eventEmitter.emit("change");
      },
      handleKeyDown: (_view, event) => onBeforeKeyDown?.(event) === true,
      handlePaste: (editorView, event) => {
        if (event.defaultPrevented) return true;
        const pastedFiles = splitPromptEditorPasteFiles(event.clipboardData?.files);
        if (pastedFiles.imageFiles.length > 0) this.eventEmitter.emit("pasted-images", pastedFiles.imageFiles);
        if (pastedFiles.otherFiles.length > 0) this.eventEmitter.emit("pasted-files", pastedFiles.otherFiles);
        if (pastedFiles.imageFiles.length > 0 || pastedFiles.otherFiles.length > 0) return true;
        const text = event.clipboardData?.getData("text/plain");
        if (text == null || text.length === 0) return false;
        insertPlainTextAtSelection(editorView, text);
        return true;
      },
      handleDrop: (_view, event) => {
        const transfer = event.dataTransfer;
        return Boolean(transfer?.files.length || Array.from(transfer?.items ?? []).some((item) => item.kind === "file"));
      },
      clipboardTextSerializer: (slice) => docFragmentToPromptText(slice.content).content,
    });
    installEditorViewStaleGuards(view);
    this.view = view;
    if (defaultText.length > 0) this.moveCursorToEnd();
  }

  get isDestroyed(): boolean {
    return this.destroyed || isEditorViewDestroyed(this.view);
  }

  getText(): string {
    if (this.isDestroyed) return "";
    return docToPromptText(this.view.state.doc).content;
  }

  hasText(): boolean {
    return this.getText().trim() !== "";
  }

  setText(value: string): void {
    if (this.isDestroyed) return;
    const doc = plainTextToDoc({ schema: this.view.state.schema, text: value });
    this.replaceDocument(doc);
  }

  setPromptText(value: string): void {
    if (this.isDestroyed) return;
    const doc = promptTextToDoc({ schema: this.view.state.schema, text: value });
    this.replaceDocument(doc);
  }

  appendText(value: string): void {
    if (this.isDestroyed) return;
    const text = value.trim();
    if (!text) return;
    const existing = this.getText();
    const inserted = existing.length > 0 && !/\s$/.test(existing) ? ` ${text}` : text;
    const { state } = this.view;
    const transaction = state.tr.setSelection(TextSelection.atEnd(state.doc)).insertText(inserted);
    transaction.setSelection(TextSelection.atEnd(transaction.doc));
    safeDispatchEditorTransaction(this.view, transaction);
    this.focus();
  }

  insertTextAtSelection(value: string): void {
    if (this.isDestroyed) return;
    if (!value) return;
    const { state } = this.view;
    const { from, to } = state.selection;
    const transaction = state.tr.insertText(value, from, to);
    transaction.setSelection(TextSelection.create(transaction.doc, from + value.length));
    safeDispatchEditorTransaction(this.view, transaction);
    this.focus();
  }

  setPlaceholder(value: string): void {
    if (this.isDestroyed) return;
    safeDispatchEditorTransaction(this.view, this.view.state.tr.setMeta(placeholderPluginKey, { placeholder: value }));
  }

  setEnterBehavior(value: PromptEditorEnterBehavior): void {
    this.enterBehavior = value;
  }

  addSubmitHandler(listener: () => void): void {
    this.eventEmitter.addListener("submit", listener);
  }

  removeSubmitHandler(listener: () => void): void {
    this.eventEmitter.removeListener("submit", listener);
  }

  addPastedFilesHandler(listener: (files: File[]) => void): void {
    this.eventEmitter.addListener("pasted-files", listener);
  }

  removePastedFilesHandler(listener: (files: File[]) => void): void {
    this.eventEmitter.removeListener("pasted-files", listener);
  }

  addPastedImagesHandler(listener: (files: File[]) => void): void {
    this.eventEmitter.addListener("pasted-images", listener);
  }

  removePastedImagesHandler(listener: (files: File[]) => void): void {
    this.eventEmitter.removeListener("pasted-images", listener);
  }

  focus(): void {
    safeFocusEditorView(this.view);
  }

  suspend(): void {
    if (this.isDestroyed || this.suspended) return;
    this.suspended = true;
    stopEditorDomObserver(this.view);
    markEditorViewDetached(this.view, true);
  }

  resume(): void {
    if (this.isDestroyed || !this.suspended) return;
    this.suspended = false;
    markEditorViewDetached(this.view, false);
    startEditorDomObserver(this.view);
  }

  destroy(): void {
    if (this.destroyed) return;
    this.destroyed = true;
    this.suspended = false;
    markEditorViewDetached(this.view, false);
    this.eventEmitter.clear();
    if (!isEditorViewDestroyed(this.view)) this.view.destroy();
  }

  private replaceDocument(doc: ProseMirrorNode): void {
    if (this.isDestroyed) return;
    const transaction = this.view.state.tr.replaceWith(0, this.view.state.doc.content.size, doc.content);
    transaction.setSelection(TextSelection.atEnd(transaction.doc));
    safeDispatchEditorTransaction(this.view, transaction);
  }

  private moveCursorToEnd(): void {
    if (this.isDestroyed) return;
    safeDispatchEditorTransaction(this.view, this.view.state.tr.setSelection(TextSelection.atEnd(this.view.state.doc)));
  }

  private isLiveView(): boolean {
    return !this.destroyed && !this.suspended && !isEditorViewUnavailable(this.view);
  }
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

export function insertPromptEditorText(element: HTMLElement | null, text: string): void {
  const view = promptEditorViewFromElement(element);
  if (view) {
    insertPlainTextAtSelection(view, text);
    safeFocusEditorView(view);
    return;
  }
  if (!element || !element.isConnected || text.length === 0) return;
  safeFocusElement(element);
  const selection = element.ownerDocument.getSelection();
  if (!selection || selection.rangeCount === 0 || !selectionInside(element, selection)) {
    element.appendChild(element.ownerDocument.createTextNode(text));
    movePromptEditorCursorToEnd(element);
    return;
  }

  const range = selection.getRangeAt(0);
  range.deleteContents();
  const textNode = element.ownerDocument.createTextNode(text);
  range.insertNode(textNode);
  range.setStartAfter(textNode);
  range.collapse(true);
  selection.removeAllRanges();
  selection.addRange(range);
}

export function replacePromptEditorTextRangeWithMention(
  element: HTMLElement | null,
  mention: PromptEditorMentionInput,
  range: { from: number; to: number },
): boolean {
  const view = promptEditorViewFromElement(element);
  if (!view || range.from < 0 || range.to < range.from) return false;
  const node = promptMentionNodeFromInput(view.state.schema, mention);
  if (!node) return false;
  const from = promptTextOffsetToDocPos(view.state.doc, range.from);
  const to = promptTextOffsetToDocPos(view.state.doc, range.to);
  const { transaction, selectionPos } = insertMentionNodeTransaction(view.state, node, from, to);
  const dispatched = safeDispatchEditorTransaction(view, transaction.scrollIntoView());
  safeFocusEditorView(view);
  return dispatched && selectionPos >= 0;
}

export function movePromptEditorCursorToEnd(element: HTMLElement | null): void {
  const view = promptEditorViewFromElement(element);
  if (view) {
    safeDispatchEditorTransaction(view, view.state.tr.setSelection(TextSelection.atEnd(view.state.doc)));
    safeFocusEditorView(view);
    return;
  }
  if (!element || !element.isConnected) return;
  const document = element.ownerDocument;
  const selection = document.getSelection();
  if (!selection) return;
  const range = document.createRange();
  range.selectNodeContents(element);
  range.collapse(false);
  selection.removeAllRanges();
  selection.addRange(range);
}

/*
 * 通用 mention NodeSpec — 复用给 5 种 mention 节点（atMention / agentMention /
 * skillMention / appMention / pluginMention）。
 *
 * attrs 含 {name, displayName, path, fsPath, conversationId, description, iconSmall, brandColor}。
 * iconSmall/brandColor 在 toDOM 中通过 data-icon-small / data-brand-color 序列化，
 * parseDOM 反序列化时读回；style="color: …" 让 chip 带品牌色。
 */
const mentionNodeSpec: NodeSpec = {
  inline: true,
  group: "inline",
  atom: true,
  selectable: false,
  attrs: {
    label: { default: "" },
    name: { default: "" },
    displayName: { default: "" },
    path: { default: "" },
    fsPath: { default: "" },
    conversationId: { default: "" },
    description: { default: "" },
    iconSmall: { default: "" },
    brandColor: { default: "" },
  },
  parseDOM: [{
    tag: "span[data-prompt-mention]",
    getAttrs: (node) => {
      if (!(node instanceof HTMLElement)) return false;
      return {
        label: node.getAttribute("data-label") ?? "",
        name: node.getAttribute("data-name") ?? "",
        displayName: node.getAttribute("data-display-name") ?? "",
        path: node.getAttribute("data-path") ?? "",
        fsPath: node.getAttribute("data-fs-path") ?? "",
        conversationId: node.getAttribute("data-conversation-id") ?? "",
        description: node.getAttribute("data-description") ?? "",
        iconSmall: node.getAttribute("data-icon-small") ?? "",
        brandColor: node.getAttribute("data-brand-color") ?? "",
      };
    },
  }],
  toDOM: (node) => [
    "span",
    {
      "data-prompt-mention": "true",
      "data-label": node.attrs.label,
      "data-name": node.attrs.name,
      "data-display-name": node.attrs.displayName,
      "data-path": node.attrs.path,
      ...(node.attrs.fsPath ? { "data-fs-path": node.attrs.fsPath } : {}),
      ...(node.attrs.conversationId ? { "data-conversation-id": node.attrs.conversationId } : {}),
      ...(node.attrs.description ? { "data-description": node.attrs.description } : {}),
      ...(node.attrs.iconSmall ? { "data-icon-small": node.attrs.iconSmall } : {}),
      ...(node.attrs.brandColor ? { "data-brand-color": node.attrs.brandColor } : {}),
      class: "hc-prompt-mention",
      "data-prompt-mention-kind": node.type.name,
      ...(node.attrs.description ? { title: node.attrs.description } : {}),
      ...(node.attrs.brandColor ? { style: `color: ${node.attrs.brandColor}` } : {}),
    },
    promptMentionDisplayText(node),
  ],
};

/*
 * Codex `pp` (prosemirror-PI_17HLA.js byte ~453826) — richLink NodeSpec.
 * External markdown links like `[label](https://example.com)` become an
 * inline chip carrying displayText + href, rendered as non-clickable text
 * with a tooltip showing the full URL.
 *
 *   pp = {
 *     attrs: {
 *       displayText: { validate: "string" },
 *       href: { validate: "string" },
 *       sourceAppId: { validate: "string" },
 *     },
 *     atom: true,
 *     draggable: false,
 *     group: "inline",
 *     inline: true,
 *     selectable: false,
 *     toDOM: e => up({
 *       dataAttributes: {
 *         "rich-link-display-text": ...,
 *         "rich-link-href": ...,
 *         "rich-link-source-app-id": ...,
 *       },
 *       icon: Ie(sourceAppId) ?? se,
 *       text: displayText,
 *       tooltipText: href,
 *     }),
 *     ...
 *   }
 *
 * Codex only builds this chip for http/https URLs whose host maps to a known
 * external app source. Unsupported URL-like paths stay as literal markdown text.
 */
const richLinkNodeSpec: NodeSpec = {
  inline: true,
  group: "inline",
  atom: true,
  draggable: false,
  selectable: false,
  attrs: {
    displayText: { default: "" },
    href: { default: "" },
    sourceAppId: { default: "" },
  },
  parseDOM: [{
    tag: "span[data-prompt-rich-link]",
    getAttrs: (node) => {
      if (!(node instanceof HTMLElement)) return false;
      return {
        displayText: node.getAttribute("rich-link-display-text") ?? "",
        href: node.getAttribute("rich-link-href") ?? "",
        sourceAppId: node.getAttribute("rich-link-source-app-id") ?? "",
      };
    },
  }],
  toDOM: (node) => [
    "span",
    {
      "data-prompt-rich-link": "true",
      "rich-link-display-text": node.attrs.displayText,
      "rich-link-href": node.attrs.href,
      "rich-link-source-app-id": node.attrs.sourceAppId,
      class: "hc-prompt-mention hc-prompt-rich-link",
      // Tooltip = full URL (matches Codex `tooltipText: e.attrs.href`).
      title: node.attrs.href,
    },
    node.attrs.displayText || node.attrs.href,
  ],
};

const promptEditorSchema = new Schema({
  nodes: {
    doc: { content: "paragraph+" },
    paragraph: {
      content: "inline*",
      group: "block",
      parseDOM: [{ tag: "p" }],
      toDOM: () => ["p", 0],
    },
    text: { group: "inline" },
    atMention: mentionNodeSpec,
    agentMention: mentionNodeSpec,
    skillMention: mentionNodeSpec,
    appMention: mentionNodeSpec,
    pluginMention: mentionNodeSpec,
    richLink: richLinkNodeSpec,
  },
  marks: {},
});

const placeholderPluginKey = new PluginKey<{ placeholder: string }>("prompt-placeholder");

const EXTERNAL_LINK_SOURCE_HOSTS: Array<{ appId: string; hostnames: string[] }> = [
  { appId: "google-calendar", hostnames: ["calendar.google.com"] },
  { appId: "google-drive", hostnames: ["docs.google.com", "drive.google.com", "sheets.google.com", "slides.google.com"] },
  { appId: "figma", hostnames: ["figma.com"] },
  { appId: "github", hostnames: ["github.com"] },
  { appId: "linear", hostnames: ["linear.app"] },
  { appId: "gmail", hostnames: ["mail.google.com"] },
  { appId: "notion", hostnames: ["notion.so"] },
  { appId: "slack", hostnames: ["slack.com"] },
];

const URL_LIKE_PROMPT_PATH = /^(?:[A-Za-z][A-Za-z0-9+.-]*:\/\/|www\.|mailto:|tel:)/;

function placeholderPlugin(placeholder: string): Plugin<{ placeholder: string }> {
  return new Plugin({
    key: placeholderPluginKey,
    state: {
      init: () => ({ placeholder }),
      apply: (transaction, state) => transaction.getMeta(placeholderPluginKey) ?? state,
    },
    props: {
      decorations(state) {
        const { doc } = state;
        if (doc.childCount !== 1 || doc.firstChild?.isTextblock !== true || doc.firstChild.content.size !== 0) {
          return null;
        }
        const { placeholder: currentPlaceholder } = placeholderPluginKey.getState(state) ?? { placeholder: "" };
        const decorations: Decoration[] = [];
        doc.descendants((node, pos) => {
          if (node.isTextblock) {
            decorations.push(Decoration.node(pos, pos + node.nodeSize, {
              class: "placeholder",
              "data-placeholder": currentPlaceholder,
            }));
          }
        });
        return DecorationSet.create(doc, decorations);
      },
    },
  });
}

function plainTextToDoc({ schema, text }: { schema: Schema; text: string }): ProseMirrorNode {
  const paragraph = schema.nodes.paragraph;
  const lines = text.split("\n");
  return schema.nodes.doc.create(null, lines.length
    ? lines.map((line) => paragraph.create(null, line ? schema.text(line) : null))
    : [paragraph.create()]);
}

function promptTextToDoc({ schema, text }: { schema: Schema; text: string }): ProseMirrorNode {
  const paragraph = schema.nodes.paragraph;
  const lines = text.split("\n");
  return schema.nodes.doc.create(null, lines.length
    ? lines.map((line) => paragraph.create(null, promptInlineNodes(schema, line)))
    : [paragraph.create()]);
}

export function promptEditorInlineNodesForTest(text: string): Array<{ type: string; attrs: Record<string, unknown>; text?: string }> {
  const doc = promptTextToDoc({ schema: promptEditorSchema, text });
  const nodes: Array<{ type: string; attrs: Record<string, unknown>; text?: string }> = [];
  doc.descendants((node) => {
    if (node.type.name === "paragraph") return true;
    if (node.isText) {
      nodes.push({ type: "text", attrs: {}, text: node.text ?? "" });
      return false;
    }
    if (node.isInline) {
      nodes.push({ type: node.type.name, attrs: { ...node.attrs } });
      return false;
    }
    return true;
  });
  return nodes;
}

export function promptEditorPromptTextRoundTripForTest(text: string): string {
  return docToPromptText(promptTextToDoc({ schema: promptEditorSchema, text })).content;
}

function promptInlineNodes(schema: Schema, line: string): Fragment | null {
  const nodes: ProseMirrorNode[] = [];
  const markdownLink = /\[([^\]]+)\]\(((?:\\.|[^)])+)\)/g;
  let cursor = 0;
  for (let match = markdownLink.exec(line); match != null; match = markdownLink.exec(line)) {
    const [fullMatch, label, rawPath] = match;
    if (match.index > cursor) nodes.push(schema.text(line.slice(cursor, match.index)));
    const path = unescapePromptPath(rawPath);
    const mention = promptMentionNode(schema, label, path);
    nodes.push(mention ?? schema.text(fullMatch));
    cursor = match.index + fullMatch.length;
  }
  if (cursor < line.length) nodes.push(schema.text(line.slice(cursor)));
  return nodes.length > 0 ? Fragment.fromArray(nodes) : null;
}

function promptMentionNode(schema: Schema, label: string, path: string): ProseMirrorNode | null {
  const name = label.replace(/^[@$]/, "");
  if (path.startsWith("plugin://")) {
    return schema.nodes.pluginMention.create({ label: `@${name}`, name, displayName: name, path });
  }
  if (path.startsWith("app://")) {
    return schema.nodes.appMention.create({ label: `$${name}`, name, displayName: name, path });
  }
  if (path.startsWith("skill://")) {
    return schema.nodes.skillMention.create({ label: `$${name}`, name, displayName: name, path });
  }
  if (isAgentMentionPath(path)) {
    return schema.nodes.agentMention.create({
      label,
      name,
      displayName: name,
      path,
      conversationId: conversationIdFromAgentPath(path),
    });
  }
  const sourceAppId = externalLinkSourceAppId(path);
  if (sourceAppId) {
    return schema.nodes.richLink.create({
      displayText: label,
      href: path,
      sourceAppId,
    });
  }
  if (URL_LIKE_PROMPT_PATH.test(path)) return null;
  if (label.startsWith("$")) {
    return schema.nodes.skillMention.create({ label: `$${name}`, name, displayName: name, path });
  }
  return schema.nodes.atMention.create({ label, name: label, displayName: label, path, fsPath: path });
}

function externalLinkSourceAppId(href: string): string | null {
  let url: URL;
  try {
    url = new URL(href);
  } catch {
    return null;
  }
  if (url.protocol !== "http:" && url.protocol !== "https:") return null;
  const hostname = url.hostname.toLowerCase();
  for (const source of EXTERNAL_LINK_SOURCE_HOSTS) {
    if (source.hostnames.some((candidate) => hostname === candidate || hostname.endsWith(`.${candidate}`))) {
      return source.appId;
    }
  }
  return null;
}

function isAgentMentionPath(path: string): boolean {
  return /^(?:agent|subagent):\/\//i.test(path) || /(?:^|[?&#])(?:conversationId|conversation_id|threadId)=/i.test(path);
}

function conversationIdFromAgentPath(path: string): string {
  try {
    const url = new URL(path);
    const fromQuery = url.searchParams.get("conversationId")
      ?? url.searchParams.get("conversation_id")
      ?? url.searchParams.get("threadId");
    if (fromQuery) return fromQuery;
    if (/^(?:agent|subagent):$/i.test(url.protocol)) {
      const pathId = url.pathname.replace(/^\/+/, "").split("/", 1)[0] ?? "";
      return url.hostname || pathId;
    }
  } catch {
    const queryId = path.match(/(?:^|[?&#])(?:conversationId|conversation_id|threadId)=([^&#]+)/i)?.[1];
    if (queryId) return decodeURIComponent(queryId);
  }
  return "";
}

function docToPromptText(doc: ProseMirrorNode): { content: string; metadata: Record<string, never> } {
  return docFragmentToPromptText(doc.content);
}

function docFragmentToPromptText(fragment: Fragment): { content: string; metadata: Record<string, never> } {
  let text = "";
  let endedWithParagraph = false;
  fragment.descendants((node) => {
    endedWithParagraph = false;
    if (node.type.name === "paragraph") {
      node.descendants((child) => serializeNode(child));
      text += "\n";
      endedWithParagraph = true;
      return false;
    }
    serializeNode(node);
    return true;
  });
  if (endedWithParagraph && text.endsWith("\n")) text = text.slice(0, -1);
  return { content: text, metadata: {} };

  function serializeNode(node: ProseMirrorNode): void {
    if (node.isText && node.text) {
      text += node.text;
      return;
    }
    if (node.type.name === "richLink") {
      text += promptRichLinkSerializedText(node);
      return;
    }
    if (isMentionNode(node)) {
      const path = String(node.attrs.path || "");
      const label = promptMentionSerializedLabel(node);
      if (label && path) text += `[${label}](${escapePromptPath(path)})`;
    }
  }
}

function promptMentionNodeFromInput(schema: Schema, mention: PromptEditorMentionInput): ProseMirrorNode | null {
  const kind = mention.kind ?? "file";
  const path = mention.path.trim();
  const name = mention.name.trim() || inferMentionNameFromPath(path);
  if (!path || !name) return null;
  const displayName = mention.displayName?.trim() || name;
  const description = mention.description?.trim() || "";
  const iconSmall = mention.iconSmall?.trim() || "";
  const brandColor = mention.brandColor?.trim() || "";
  /*
   * Keep editor-only registry metadata on the ProseMirror node so a live chip
   * can round-trip through toDOM/parseDOM during the current edit session.
   */
  switch (kind) {
    case "skill":
      return schema.nodes.skillMention.create({ label: `$${name}`, name, displayName, path, description, iconSmall, brandColor });
    case "app":
      return schema.nodes.appMention.create({ label: `$${name}`, name, displayName, path, description, iconSmall, brandColor });
    case "plugin":
      return schema.nodes.pluginMention.create({ label: `@${name}`, name, displayName, path, description, iconSmall, brandColor });
    case "agent":
      return schema.nodes.agentMention.create({
        label: `@${name}`,
        name,
        displayName,
        path,
        conversationId: conversationIdFromAgentPath(path),
        description,
        iconSmall,
        brandColor,
      });
    case "file":
      return schema.nodes.atMention.create({ label: displayName || name, name, displayName, path, fsPath: path, description, iconSmall, brandColor });
  }
}

function insertMentionNodeTransaction(
  state: EditorState,
  node: ProseMirrorNode,
  from: number,
  to: number,
): { transaction: EditorState["tr"]; selectionPos: number } {
  let transaction = state.tr.replaceRangeWith(from, to, node);
  const afterMention = transaction.mapping.map(from) + node.nodeSize;
  const needsSpace = !docCharAt(transaction.doc, afterMention).match(/\s/);
  if (needsSpace) transaction = transaction.insertText(" ", afterMention);
  const selectionPos = afterMention + (needsSpace ? 1 : 0);
  transaction = transaction.setSelection(TextSelection.create(transaction.doc, selectionPos));
  return { transaction, selectionPos };
}

function promptTextOffsetToDocPos(doc: ProseMirrorNode, offset: number): number {
  const promptText = docToPromptText(doc).content;
  const target = Math.max(0, Math.min(offset, promptText.length));
  let textOffset = 0;
  let result: number | null = null;

  doc.forEach((paragraph, paragraphOffset, index) => {
    if (result != null) return;
    const paragraphStart = paragraphOffset + 1;
    paragraph.forEach((child, childOffset) => {
      if (result != null) return;
      const serialized = promptNodeSerializedText(child);
      const nextOffset = textOffset + serialized.length;
      if (target <= nextOffset) {
        if (child.isText) {
          result = paragraphStart + childOffset + Math.max(0, target - textOffset);
        } else {
          result = paragraphStart + childOffset + (target > textOffset ? child.nodeSize : 0);
        }
        return;
      }
      textOffset = nextOffset;
    });
    if (result != null) return;
    const paragraphEnd = paragraphStart + paragraph.content.size;
    if (target <= textOffset) {
      result = paragraphEnd;
      return;
    }
    if (index < doc.childCount - 1) {
      if (target === textOffset) {
        result = paragraphEnd;
        return;
      }
      textOffset += 1;
    }
  });

  return result ?? TextSelection.atEnd(doc).from;
}

function promptNodeSerializedText(node: ProseMirrorNode): string {
  if (node.isText) return node.text ?? "";
  if (node.type.name === "richLink") return promptRichLinkSerializedText(node);
  if (isMentionNode(node)) {
    const label = promptMentionSerializedLabel(node);
    const path = String(node.attrs.path || "");
    return label && path ? `[${label}](${escapePromptPath(path)})` : "";
  }
  return "";
}

function promptRichLinkSerializedText(node: ProseMirrorNode): string {
  const href = String(node.attrs.href || "");
  const displayText = String(node.attrs.displayText || "") || href;
  return href ? `[${displayText}](${escapePromptPath(href)})` : "";
}

function promptMentionSerializedLabel(node: ProseMirrorNode): string {
  const name = String(node.attrs.name || "").replace(/^[@$]/, "");
  if (node.type.name === "skillMention" || node.type.name === "appMention") return name ? `$${name}` : "";
  if (node.type.name === "pluginMention") return name ? `@${name}` : "";
  if (node.type.name === "agentMention") {
    const displayName = String(node.attrs.displayName || name).replace(/^@/, "");
    return displayName ? `@${displayName}` : "";
  }
  return String(node.attrs.label || node.attrs.displayName || node.attrs.name || "");
}

function promptMentionDisplayText(node: ProseMirrorNode): string {
  const displayName = String(node.attrs.displayName || node.attrs.name || node.attrs.label || "");
  if (node.type.name === "agentMention") return displayName.startsWith("@") ? displayName : `@${displayName}`;
  if (node.type.name === "skillMention" || node.type.name === "appMention" || node.type.name === "pluginMention") {
    return displayName.replace(/^[@$]/, "");
  }
  return String(node.attrs.label || displayName);
}

function docCharAt(doc: ProseMirrorNode, pos: number): string {
  if (pos >= doc.content.size) return "";
  const resolved = doc.resolve(Math.max(0, Math.min(pos, doc.content.size)));
  if (resolved.parentOffset >= resolved.parent.content.size) return "\n";
  const next = resolved.parent.childAfter(resolved.parentOffset).node;
  return next?.isText ? next.text?.[0] ?? "" : "";
}

function inferMentionNameFromPath(path: string): string {
  if (/^(?:app|plugin|agent):\/\//i.test(path)) return path.replace(/^[a-z]+:\/\//i, "").split(/[/?#]/, 1)[0] ?? "";
  const normalized = path.replace(/\/+$/, "");
  const parts = normalized.split(/[\\/]/).filter(Boolean);
  if (parts.at(-1)?.toLowerCase() === "skill.md" && parts.length >= 2) return parts.at(-2) ?? "";
  return parts.at(-1) ?? normalized;
}

function insertPlainTextAtSelection(view: EditorView, text: string): void {
  if (isEditorViewDestroyed(view)) return;
  if (!text) return;
  const lines = text.replace(/\r\n/g, "\n").split("\n");
  if (lines.length === 1) {
    safeDispatchEditorTransaction(view, view.state.tr.insertText(lines[0]).scrollIntoView());
    return;
  }
  const { schema } = view.state;
  if (!safeDispatchEditorTransaction(view, view.state.tr.deleteSelection().insertText(lines[0]))) return;
  if (isEditorViewDestroyed(view)) return;
  splitBlock(view.state, (transaction) => {
    safeDispatchEditorTransaction(view, transaction);
  }, view);
  if (isEditorViewDestroyed(view)) return;
  const nodes = lines.slice(1).map((line) => schema.nodes.paragraph.create(null, line ? schema.text(line) : null));
  safeDispatchEditorTransaction(view, view.state.tr.replaceSelection(new Slice(Fragment.fromArray(nodes), 0, 0)).scrollIntoView());
}

export function splitPromptEditorPasteFiles<T extends PromptEditorPasteFileLike>(
  files: ArrayLike<T> | null | undefined,
): { imageFiles: T[]; otherFiles: T[] } {
  const imageFiles: T[] = [];
  const otherFiles: T[] = [];
  for (const file of Array.from(files ?? [])) {
    if (isPromptEditorImageFile(file)) imageFiles.push(file);
    else otherFiles.push(file);
  }
  return { imageFiles, otherFiles };
}

function isPromptEditorImageFile(file: PromptEditorPasteFileLike): boolean {
  const mime = file.type?.trim().toLowerCase();
  if (mime?.startsWith("image/")) return true;
  return /\.(avif|bmp|gif|heic|heif|jpe?g|png|svg|tiff?|webp)$/i.test(file.name ?? "");
}

function isPromptText(value: string): boolean {
  return /\[(?:\$|@)?[^\]]+\]\((?:\\.|[^)])+\)/.test(value);
}

function isMentionNode(node: ProseMirrorNode): boolean {
  return node.type.name === "atMention"
    || node.type.name === "agentMention"
    || node.type.name === "skillMention"
    || node.type.name === "appMention"
    || node.type.name === "pluginMention";
}

function unescapePromptPath(value: string): string {
  const unwrapped = value.startsWith("<") && value.endsWith(">") && value.length >= 2
    ? value.slice(1, -1).replace(/\\>/g, ">")
    : value;
  return unwrapped.replace(/\\([\\)])/g, "$1");
}

function escapePromptPath(value: string): string {
  if (/[\s()<>]/.test(value)) {
    return `<${value.replace(/\\/g, "\\\\").replace(/>/g, "\\>")}>`;
  }
  return value.replace(/\\/g, "\\\\").replace(/\)/g, "\\)");
}

function promptEditorViewFromElement(element: HTMLElement | null): EditorView | null {
  if (!element || !element.isConnected) return null;
  const view = (element as HTMLElement & { pmViewDesc?: { editorView?: EditorView } }).pmViewDesc?.editorView;
  if (!view || isEditorViewUnavailable(view)) return null;
  return view;
}

function isEditorViewDestroyed(view: EditorView): boolean {
  return view.isDestroyed || (view as EditorView & { docView?: unknown }).docView == null;
}

function isEditorViewDetached(view: EditorView): boolean {
  return (view as unknown as GuardedEditorView)[promptEditorDetachedSymbol] === true;
}

function isEditorViewUnavailable(view: EditorView): boolean {
  return isEditorViewDestroyed(view) || isEditorViewDetached(view);
}

function safeUpdateEditorState(view: EditorView, state: EditorState): boolean {
  if (isEditorViewUnavailable(view)) return false;
  try {
    view.updateState(state);
    return !isEditorViewUnavailable(view);
  } catch (error) {
    if (isStaleEditorViewError(error)) {
      markEditorViewDestroyed(view);
      return false;
    }
    throw error;
  }
}

function safeDispatchEditorTransaction(view: EditorView, transaction: EditorState["tr"]): boolean {
  if (isEditorViewUnavailable(view)) return false;
  try {
    view.dispatch(transaction);
    return !isEditorViewUnavailable(view);
  } catch (error) {
    if (isStaleEditorViewError(error)) {
      markEditorViewDestroyed(view);
      return false;
    }
    throw error;
  }
}

function safeFocusEditorView(view: EditorView): void {
  if (isEditorViewUnavailable(view) || !view.dom.isConnected) return;
  try {
    view.focus();
  } catch (error) {
    if (isStaleEditorViewError(error)) {
      markEditorViewDestroyed(view);
      return;
    }
    throw error;
  }
}

function installEditorViewStaleGuards(view: EditorView): void {
  const guardedView = view as unknown as GuardedEditorView;
  if (guardedView[promptEditorStaleGuardSymbol]) return;
  guardedView[promptEditorStaleGuardSymbol] = true;

  if (typeof guardedView.updateStateInner === "function") {
    const updateStateInner = guardedView.updateStateInner.bind(view);
    guardedView.updateStateInner = (state, prevProps) => {
      runEditorViewOperation(view, () => updateStateInner(state, prevProps));
    };
  }

  const update = view.update.bind(view);
  view.update = (props) => {
    runEditorViewOperation(view, () => update(props));
  };

  const setProps = view.setProps.bind(view);
  view.setProps = (props) => {
    runEditorViewOperation(view, () => setProps(props));
  };

  const updateState = view.updateState.bind(view);
  view.updateState = (state) => {
    runEditorViewOperation(view, () => updateState(state));
  };

  const dispatch = view.dispatch.bind(view);
  view.dispatch = (transaction) => {
    runEditorViewOperation(view, () => dispatch(transaction));
  };

  const focus = view.focus.bind(view);
  view.focus = () => {
    if (!view.dom.isConnected) return;
    runEditorViewOperation(view, () => focus());
  };

  const destroy = view.destroy.bind(view);
  view.destroy = () => {
    if (isEditorViewDestroyed(view)) return;
    try {
      destroy();
    } catch (error) {
      if (!isStaleEditorViewError(error)) throw error;
      markEditorViewDestroyed(view);
    }
  };

  installDomObserverStaleGuards(view);
}

function safeFocusElement(element: HTMLElement | null): void {
  if (!element || !element.isConnected) return;
  try {
    element.focus();
  } catch (error) {
    if (isStaleEditorViewError(error)) return;
    throw error;
  }
}

export function isStalePromptEditorViewError(error: unknown): boolean {
  return isStaleEditorViewError(error);
}

export function installPromptEditorViewStaleGuardsForTest(view: EditorView): void {
  installEditorViewStaleGuards(view);
}

export function setPromptEditorViewDetachedForTest(view: EditorView, detached: boolean): void {
  markEditorViewDetached(view, detached);
}

function isStaleEditorViewError(error: unknown): boolean {
  const message = error instanceof Error
    ? error.message
    : typeof error === "object" && error != null && "message" in error
      ? String((error as { message?: unknown }).message ?? "")
      : typeof error === "string" ? error : "";
  return /docView|matchesNode/i.test(message);
}

const promptEditorStaleGuardSymbol = Symbol("hicodex.promptEditor.staleGuard");
const promptEditorDetachedSymbol = Symbol("hicodex.promptEditor.detached");

type GuardedEditorView = {
  [promptEditorStaleGuardSymbol]?: true;
  [promptEditorDetachedSymbol]?: true;
  docView?: unknown;
  updateStateInner?: (state: EditorState, prevProps: unknown) => void;
  domObserver?: {
    flush?: () => void;
    flushSoon?: () => void;
    forceFlush?: () => void;
    start?: () => void;
    stop?: () => void;
  };
};

function runEditorViewOperation<T>(view: EditorView, operation: () => T): T | undefined {
  if (isEditorViewUnavailable(view)) return undefined;
  try {
    return operation();
  } catch (error) {
    if (isStaleEditorViewError(error)) {
      markEditorViewDestroyed(view);
      return undefined;
    }
    throw error;
  }
}

function markEditorViewDestroyed(view: EditorView): void {
  (view as EditorView & { docView?: unknown }).docView = null;
}

function markEditorViewDetached(view: EditorView, detached: boolean): void {
  const guardedView = view as unknown as GuardedEditorView;
  if (detached) guardedView[promptEditorDetachedSymbol] = true;
  else delete guardedView[promptEditorDetachedSymbol];
}

function stopEditorDomObserver(view: EditorView): void {
  const observer = (view as unknown as GuardedEditorView).domObserver;
  if (!observer || typeof observer.stop !== "function") return;
  try {
    observer.stop();
  } catch (error) {
    if (!isStaleEditorViewError(error)) throw error;
    markEditorViewDestroyed(view);
  }
}

function startEditorDomObserver(view: EditorView): void {
  const observer = (view as unknown as GuardedEditorView).domObserver;
  if (!observer || typeof observer.start !== "function") return;
  try {
    observer.start();
  } catch (error) {
    if (!isStaleEditorViewError(error)) throw error;
    markEditorViewDestroyed(view);
  }
}

function installDomObserverStaleGuards(view: EditorView): void {
  const observer = (view as unknown as GuardedEditorView).domObserver;
  if (!observer) return;

  if (typeof observer.flush === "function") {
    const flush = observer.flush.bind(observer);
    observer.flush = () => {
      runEditorViewOperation(view, () => flush());
    };
  }

  if (typeof observer.flushSoon === "function") {
    const flushSoon = observer.flushSoon.bind(observer);
    observer.flushSoon = () => {
      runEditorViewOperation(view, () => flushSoon());
    };
  }

  if (typeof observer.forceFlush === "function") {
    const forceFlush = observer.forceFlush.bind(observer);
    observer.forceFlush = () => {
      runEditorViewOperation(view, () => forceFlush());
    };
  }
}

function selectionInside(element: HTMLElement, selection: Selection): boolean {
  const anchor = selection.anchorNode;
  const focus = selection.focusNode;
  return Boolean(anchor && focus && element.contains(anchor) && element.contains(focus));
}
