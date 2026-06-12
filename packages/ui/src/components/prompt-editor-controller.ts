import { chainCommands, deleteSelection, joinBackward, joinForward, selectAll, selectNodeBackward, selectNodeForward, splitBlock } from "prosemirror-commands";
import { history, redo, undo } from "prosemirror-history";
import { keymap } from "prosemirror-keymap";
import type { Node as ProseMirrorNode } from "prosemirror-model";
import { EditorState, TextSelection } from "prosemirror-state";
import { EditorView } from "prosemirror-view";
import {
  installEditorViewStaleGuards,
  isEditorViewDestroyed,
  isEditorViewUnavailable,
  markEditorViewDetached,
  safeDispatchEditorTransaction,
  safeFocusEditorView,
  safeUpdateEditorState,
  startEditorDomObserver,
  stopEditorDomObserver,
} from "./prompt-editor-stale-guards";
import { splitPromptEditorPasteFiles } from "./prompt-editor-paste";
import {
  plainTextToDoc,
  promptTextToDoc,
} from "./prompt-editor-doc";
import {
  placeholderPlugin,
  placeholderPluginKey,
  promptEditorSchema,
} from "./prompt-editor-schema";
import {
  docFragmentToPromptText,
  docToPromptText,
} from "./prompt-editor-serialization";
import { PromptEditorEmitter } from "./prompt-editor-events";
import {
  insertPlainTextAtSelection,
  insertPromptTextAtSelection,
  isPromptText,
} from "./prompt-editor-insertion";

export type PromptEditorEnterBehavior = "enter" | "newline" | "cmdIfMultiline";

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
            // Mirror ProseMirror's baseKeymap Backspace/Delete: chain
            // selection-delete with block-join (joinBackward/joinForward) and
            // atom-node selection. Without joinBackward a collapsed cursor at a
            // paragraph boundary did nothing, so a trailing/empty line - and any
            // line break - could not be deleted.
            Backspace: chainCommands(deleteSelection, joinBackward, selectNodeBackward),
            Delete: chainCommands(deleteSelection, joinForward, selectNodeForward),
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
        if (isPromptText(text)) {
          insertPromptTextAtSelection(editorView, text);
          return true;
        }
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
