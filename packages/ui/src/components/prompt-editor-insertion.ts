import { splitBlock } from "prosemirror-commands";
import { Fragment, Slice } from "prosemirror-model";
import type { EditorView } from "prosemirror-view";
import { TextSelection } from "prosemirror-state";
import { promptTextToDoc } from "./prompt-editor-doc";
import {
  isEditorViewDestroyed,
  promptEditorViewFromElement,
  safeDispatchEditorTransaction,
  safeFocusEditorView,
  safeFocusElement,
} from "./prompt-editor-stale-guards";

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

export function insertPlainTextAtSelection(view: EditorView, text: string): void {
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

export function insertPromptTextAtSelection(view: EditorView, text: string): void {
  if (isEditorViewDestroyed(view)) return;
  if (!text) return;
  const doc = promptTextToDoc({ schema: view.state.schema, text });
  safeDispatchEditorTransaction(view, view.state.tr.replaceSelection(new Slice(doc.content, 1, 1)).scrollIntoView());
}

export function isPromptText(value: string): boolean {
  return /\[(?:\$|@)?[^\]]+\]\((?:\\.|[^)])+\)/.test(value);
}

function selectionInside(element: HTMLElement, selection: Selection): boolean {
  const anchor = selection.anchorNode;
  const focus = selection.focusNode;
  return Boolean(anchor && focus && element.contains(anchor) && element.contains(focus));
}
