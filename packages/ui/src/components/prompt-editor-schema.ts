import { Schema } from "prosemirror-model";
import type { Node as ProseMirrorNode, NodeSpec } from "prosemirror-model";
import { Plugin, PluginKey } from "prosemirror-state";
import { Decoration, DecorationSet } from "prosemirror-view";

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
 * Codex `pp` (prosemirror-*.js) — richLink NodeSpec.
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
  // codex: parseDOM selector mirrors upstream verbatim — upstream uses the
  // presence of all three `rich-link-*` attributes as the discriminator
  // (no separate marker attribute):
  //   tag: `span[rich-link-display-text][rich-link-href][rich-link-source-app-id]`
  parseDOM: [{
    tag: "span[rich-link-display-text][rich-link-href][rich-link-source-app-id]",
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

export const promptEditorSchema = new Schema({
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

export const placeholderPluginKey = new PluginKey<{ placeholder: string }>("prompt-placeholder");

export function placeholderPlugin(placeholder: string): Plugin<{ placeholder: string }> {
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

function promptMentionDisplayText(node: ProseMirrorNode): string {
  const displayName = String(node.attrs.displayName || node.attrs.name || node.attrs.label || "");
  if (node.type.name === "agentMention") return displayName.startsWith("@") ? displayName : `@${displayName}`;
  if (node.type.name === "skillMention" || node.type.name === "appMention" || node.type.name === "pluginMention") {
    return displayName.replace(/^[@$]/, "");
  }
  return String(node.attrs.label || displayName);
}
