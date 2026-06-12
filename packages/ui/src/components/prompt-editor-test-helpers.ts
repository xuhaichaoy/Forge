import { chainCommands, deleteSelection, joinBackward, selectNodeBackward } from "prosemirror-commands";
import type { Node as ProseMirrorNode } from "prosemirror-model";
import { EditorState, TextSelection } from "prosemirror-state";
import { plainTextToDoc, promptTextToDoc } from "./prompt-editor-doc";
import { promptEditorSchema } from "./prompt-editor-schema";
import { docToPromptText } from "./prompt-editor-serialization";

type PromptEditorInlineNodeForTest = {
  attrs: Record<string, unknown>;
  text?: string;
  type: string;
};

export function promptEditorInlineNodesForTest(text: string): PromptEditorInlineNodeForTest[] {
  return promptEditorInlineNodesForDoc(promptTextToDoc({ schema: promptEditorSchema, text }));
}

export function promptEditorPromptTextRoundTripForTest(text: string): string {
  return docToPromptText(promptTextToDoc({ schema: promptEditorSchema, text })).content;
}

// Runs the editor's real Backspace command (deleteSelection -> joinBackward ->
// selectNodeBackward) with the caret at the end of `text`, returning the
// resulting prompt text.
export function promptEditorBackspaceAtEndForTest(text: string): string {
  const schema = promptEditorSchema;
  const doc = plainTextToDoc({ schema, text });
  let state = EditorState.create({ schema, doc, selection: TextSelection.atEnd(doc) });
  chainCommands(deleteSelection, joinBackward, selectNodeBackward)(state, (tr) => {
    state = state.apply(tr);
  });
  return docToPromptText(state.doc).content;
}

export function promptEditorPasteInlineNodesForTest(text: string): PromptEditorInlineNodeForTest[] {
  return promptEditorInlineNodesForDoc(promptTextToDoc({ schema: promptEditorSchema, text }));
}

function promptEditorInlineNodesForDoc(doc: ProseMirrorNode): PromptEditorInlineNodeForTest[] {
  const nodes: PromptEditorInlineNodeForTest[] = [];
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
