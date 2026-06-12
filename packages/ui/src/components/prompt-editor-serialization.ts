import type { Fragment, Node as ProseMirrorNode } from "prosemirror-model";
import { escapePromptPath } from "./prompt-editor-link-utils";

export function docToPromptText(doc: ProseMirrorNode): { content: string; metadata: Record<string, never> } {
  return docFragmentToPromptText(doc.content);
}

export function docFragmentToPromptText(fragment: Fragment): { content: string; metadata: Record<string, never> } {
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

export function promptNodeSerializedText(node: ProseMirrorNode): string {
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
  // codex: mirrors upstream prompt-editor markdown writer verbatim —
  //   let n = e.type.name === `pluginMention` ? `@` : `$`;
  //   let r = e.type.name === `appMention`    ? `app`
  //         : e.type.name === `pluginMention` ? `plugin`
  //                                           : `skill`;
  //   let i = typeof e.attrs.name === `string` ? e.attrs.name : r;
  //   t += `[${n}${i}](${o(e.attrs.path)})`
  // (Upstream falls back to the type-tag — "skill"/"app"/"plugin" — when
  //  the attribute is missing, rather than skipping the mention.)
  const name = String(node.attrs.name || "").replace(/^[@$]/, "");
  if (node.type.name === "skillMention" || node.type.name === "appMention" || node.type.name === "pluginMention") {
    const marker = node.type.name === "pluginMention" ? "@" : "$";
    const fallback = node.type.name === "appMention"
      ? "app"
      : node.type.name === "pluginMention"
        ? "plugin"
        : "skill";
    return `${marker}${name || fallback}`;
  }
  if (node.type.name === "agentMention") {
    const displayName = String(node.attrs.displayName || name).replace(/^@/, "");
    return displayName ? `@${displayName}` : "";
  }
  return String(node.attrs.label || node.attrs.displayName || node.attrs.name || "");
}

function isMentionNode(node: ProseMirrorNode): boolean {
  return node.type.name === "atMention"
    || node.type.name === "agentMention"
    || node.type.name === "skillMention"
    || node.type.name === "appMention"
    || node.type.name === "pluginMention";
}
