import { Fragment } from "prosemirror-model";
import type { Node as ProseMirrorNode, Schema } from "prosemirror-model";
import {
  conversationIdFromAgentPath,
  externalLinkSourceAppId,
  isAgentMentionPath,
  isUrlLikePromptPath,
  unescapePromptPath,
} from "./prompt-editor-link-utils";

export function plainTextToDoc({ schema, text }: { schema: Schema; text: string }): ProseMirrorNode {
  const paragraph = schema.nodes.paragraph;
  const lines = text.split("\n");
  return schema.nodes.doc.create(null, lines.length
    ? lines.map((line) => paragraph.create(null, line ? schema.text(line) : null))
    : [paragraph.create()]);
}

export function promptTextToDoc({ schema, text }: { schema: Schema; text: string }): ProseMirrorNode {
  const paragraph = schema.nodes.paragraph;
  const lines = text.split("\n");
  return schema.nodes.doc.create(null, lines.length
    ? lines.map((line) => paragraph.create(null, promptInlineNodes(schema, line)))
    : [paragraph.create()]);
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
  if (isUrlLikePromptPath(path)) return null;
  if (label.startsWith("$")) {
    return schema.nodes.skillMention.create({ label: `$${name}`, name, displayName: name, path });
  }
  return schema.nodes.atMention.create({ label, name: label, displayName: label, path, fsPath: path });
}
