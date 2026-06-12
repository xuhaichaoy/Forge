import type { Node as ProseMirrorNode, Schema } from "prosemirror-model";
import type { EditorState } from "prosemirror-state";
import { TextSelection } from "prosemirror-state";
import {
  conversationIdFromAgentPath,
  inferMentionNameFromPath,
} from "./prompt-editor-link-utils";
import {
  docToPromptText,
  promptNodeSerializedText,
} from "./prompt-editor-serialization";
import {
  promptEditorViewFromElement,
  safeDispatchEditorTransaction,
  safeFocusEditorView,
} from "./prompt-editor-stale-guards";

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

function docCharAt(doc: ProseMirrorNode, pos: number): string {
  if (pos >= doc.content.size) return "";
  const resolved = doc.resolve(Math.max(0, Math.min(pos, doc.content.size)));
  if (resolved.parentOffset >= resolved.parent.content.size) return "\n";
  const next = resolved.parent.childAfter(resolved.parentOffset).node;
  return next?.isText ? next.text?.[0] ?? "" : "";
}
