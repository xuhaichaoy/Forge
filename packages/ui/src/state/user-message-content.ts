import { formatUnknown, stringField } from "../lib/format";

import type { ThreadItem, UserMessageContentPart, UserMessageTextElement } from "./render-group-types";

export function userMessageText(item: ThreadItem): string {
  const record = item as Record<string, unknown>;
  const content = Array.isArray(record.content) ? record.content : [];
  if (content.length === 0 && Array.isArray(record.fragments)) {
    return hookPromptFragmentsText(record.fragments);
  }
  return content.map(userInputPartText).filter(Boolean).join("\n");
}

export function userMessageCopyText(item: ThreadItem): string {
  const record = item as Record<string, unknown>;
  const content = Array.isArray(record.content) ? record.content : [];
  if (content.length === 0 && Array.isArray(record.fragments)) {
    return hookPromptFragmentsText(record.fragments).trim();
  }
  return content
    .map((part) => projectUserInputPart(part).filter(isCopyableUserMessagePart).map(copyableUserMessagePartText).join(""))
    .filter(Boolean)
    .join("\n")
    .trim();
}

export function projectUserMessageContent(item: ThreadItem): UserMessageContentPart[] {
  const record = item as Record<string, unknown>;
  const content = Array.isArray(record.content) ? record.content : [];
  if (content.length === 0 && Array.isArray(record.fragments)) {
    const text = hookPromptFragmentsText(record.fragments);
    return text ? [{ kind: "text", text, textElements: [] }] : [];
  }
  return content.flatMap(projectUserInputPart);
}

function hookPromptFragmentsText(fragments: unknown[]): string {
  return fragments.map((fragment) => {
    if (!fragment || typeof fragment !== "object") return "";
    const text = (fragment as Record<string, unknown>).text;
    return typeof text === "string" ? text : "";
  }).filter(Boolean).join("\n");
}

function userInputPartText(part: unknown): string {
  if (!part || typeof part !== "object") return formatUnknown(part);
  const record = part as Record<string, unknown>;
  if (record.type === "text" || record.type === "input_text" || record.type === "inputText") {
    return stringField(record, "text");
  }
  if (
    record.type === "image"
    || record.type === "image_url"
    || record.type === "input_image"
    || record.type === "inputImage"
    || record.type === "localImage"
    || record.type === "local_image"
  ) {
    return "";
  }
  if (record.type === "mention") return `@${stringField(record, "name") || stringField(record, "path")}`;
  if (record.type === "skill") return `$${stringField(record, "name") || stringField(record, "path")}`;
  return `[${stringField(record, "type") || "input"}]`;
}

function projectUserInputPart(part: unknown): UserMessageContentPart[] {
  if (!part || typeof part !== "object") {
    const text = formatUnknown(part);
    return text ? [{ kind: "text", text, textElements: [] }] : [];
  }
  const record = part as Record<string, unknown>;
  switch (record.type) {
    case "text":
    case "input_text":
    case "inputText": {
      const text = stringField(record, "text");
      if (!text) return [];
      return splitTextWithFileLinks(text, textElements(record.text_elements));
    }
    case "image":
    case "image_url":
    case "input_image":
    case "inputImage": {
      const url = imageUrlField(record);
      return url ? [{ kind: "image", source: "url", src: url, label: imageLabel(url) }] : [];
    }
    case "localImage":
    case "local_image": {
      const path = stringField(record, "path");
      return path ? [{ kind: "image", source: "local", src: path, label: imageLabel(path) }] : [];
    }
    case "mention": {
      const path = stringField(record, "path");
      const label = stringField(record, "name") || path;
      if (!label && !path) return [];
      // 本地文件路径 → file chip
      if (path && isLocalFilePath(path)) {
        return [{
          kind: "chip",
          chipKind: "file",
          label: label || basenameOf(path) || path,
          path,
          presentation: "inline",
          fileExtension: extensionOf(path),
        }];
      }
      /*
       * URL scheme dispatch is a view concern. Protocol UserInput.Mention only
       * carries { name, path }, so replayed transcript chips render without
       * registry-only metadata.
       */
      const trimmedPath = path?.trim() ?? "";
      let chipKind: "app" | "plugin" | "agent" | "mention" = "mention";
      if (/^app:\/\//i.test(trimmedPath)) chipKind = "app";
      else if (/^plugin:\/\//i.test(trimmedPath)) chipKind = "plugin";
      else if (/^(?:agent|subagent):\/\//i.test(trimmedPath)) chipKind = "agent";
      return [{
        kind: "chip",
        chipKind,
        label: label || path,
        path,
      }];
    }
    case "skill": {
      const path = stringField(record, "path");
      const label = stringField(record, "name") || path;
      if (!label && !path) return [];
      /* Protocol UserInput.Skill only carries { name, path }. */
      return [{
        kind: "chip",
        chipKind: "skill",
        label: label || path,
        path,
      }];
    }
    default: {
      const text = userInputPartText(part);
      return text ? [{ kind: "text", text, textElements: [] }] : [];
    }
  }
}

function isCopyableUserMessagePart(part: UserMessageContentPart): boolean {
  if (part.kind === "image") return false;
  if (part.kind === "chip" && part.chipKind === "file" && part.presentation === "attachment") return false;
  return true;
}

function copyableUserMessagePartText(part: UserMessageContentPart): string {
  if (part.kind === "text") return part.text;
  if (part.kind === "image") return "";
  const label = part.label.trim();
  const path = part.path?.trim() ?? "";
  if (!path) return label;
  switch (part.chipKind) {
    case "skill":
    case "app":
      return `[${escapePromptLinkLabel(promptLinkLabel("$", label))}](${escapePromptLinkPath(path)})`;
    case "plugin":
    case "agent":
      return `[${escapePromptLinkLabel(promptLinkLabel("@", label))}](${escapePromptLinkPath(path)})`;
    case "file":
    case "mention":
      return `[${escapePromptLinkLabel(label || basenameOf(path))}](${escapePromptLinkPath(path)})`;
  }
}

function promptLinkLabel(marker: "$" | "@", label: string): string {
  const trimmed = label.trim().replace(/^[@$]/, "");
  return `${marker}${trimmed || (marker === "$" ? "skill" : "mention")}`;
}

function escapePromptLinkPath(path: string): string {
  if (/[\s()<>]/.test(path)) {
    return `<${path.replace(/\\/g, "\\\\").replace(/>/g, "\\>")}>`;
  }
  return path.replace(/\\/g, "\\\\").replace(/\)/g, "\\)");
}

function escapePromptLinkLabel(label: string): string {
  return label.replace(/\\/g, "\\\\").replace(/\]/g, "\\]");
}

function imageUrlField(record: Record<string, unknown>): string {
  const direct = stringField(record, "url") || stringField(record, "image_url") || stringField(record, "imageUrl");
  if (direct) return direct;
  const nested = record.image_url ?? record.imageUrl;
  if (nested && typeof nested === "object") {
    return stringField(nested, "url");
  }
  return "";
}

function textElements(value: unknown): UserMessageTextElement[] {
  if (!Array.isArray(value)) return [];
  return value.flatMap((item) => {
    if (!item || typeof item !== "object") return [];
    const record = item as Record<string, unknown>;
    const range = record.byteRange && typeof record.byteRange === "object"
      ? record.byteRange as Record<string, unknown>
      : null;
    const start = typeof range?.start === "number" ? range.start : null;
    const end = typeof range?.end === "number" ? range.end : null;
    if (start === null || end === null) return [];
    return [{
      start,
      end,
      placeholder: typeof record.placeholder === "string" ? record.placeholder : null,
    }];
  });
}

function imageLabel(value: string): string {
  const path = value.trim();
  if (!path || /^(?:data|blob):/i.test(path)) return "User attachment";
  const segment = path.split(/[/?#]/).filter(Boolean).pop();
  return segment ? decodeURIComponentSafe(segment) : "User attachment";
}

function decodeURIComponentSafe(value: string): string {
  try {
    return decodeURIComponent(value);
  } catch {
    return value;
  }
}

const URL_SCHEME_RE = /^[a-z][a-z0-9+.-]*:/i;
const REMOTE_PROMPT_LINK_RE = /^(?:app|plugin|skill|agent|http|https|mailto|tel|data|blob):/i;

function isLocalFilePath(value: string): boolean {
  const trimmed = value.trim();
  if (!trimmed) return false;
  if (REMOTE_PROMPT_LINK_RE.test(trimmed)) return false;
  if (URL_SCHEME_RE.test(trimmed)) return false;
  // Absolute or relative path → treat as local file
  return trimmed.startsWith("/") || trimmed.startsWith("~") || /\.[A-Za-z0-9]{1,8}$/.test(trimmed);
}

function basenameOf(path: string): string {
  const trimmed = path.trim();
  if (!trimmed) return "";
  const segment = trimmed.split(/[/?#]/).filter(Boolean).pop() ?? "";
  return decodeURIComponentSafe(segment);
}

function extensionOf(path: string): string {
  const name = basenameOf(path);
  const dot = name.lastIndexOf(".");
  if (dot <= 0 || dot === name.length - 1) return "";
  return name.slice(dot + 1).toLowerCase();
}

/**
 * Markdown link to local file:
 *   `[some name](path/with/extension.ext)`
 *   `[报价函](/tmp/报价.docx)`
 *   `[report final.pdf](</tmp/report final.pdf>)` — angle-bracket escaped for
 *   paths containing spaces (CommonMark angle-bracket destination).
 *
 * The composer inlines local file attachments as such links so the model can
 * read the path directly. The projection layer extracts those links into
 * chip parts so the user message renders a file chip above the bubble
 * instead of a raw markdown link inside it.
 *
 * Two alternatives in the destination group:
 *   `<...>`  (CommonMark angle-bracket destination — wraps a path that may
 *             contain spaces; the `<` / `>` are markdown syntax, not content)
 *   `(...)`  (plain destination — no spaces / parens)
 */
const FILE_LINK_RE = /\[([^[\]\n]+)\]\(<([^>\n]+)>\)|\[([^[\]\n]+)\]\(([^)\s\n]+)\)/g;

function splitTextWithFileLinks(text: string, baseElements: UserMessageTextElement[]): UserMessageContentPart[] {
  // Fast path: nothing that looks like a markdown link.
  if (!text.includes("](")) {
    return [{ kind: "text", text, textElements: baseElements }];
  }
  const parts: UserMessageContentPart[] = [];
  let cursor = 0;
  let match: RegExpExecArray | null;
  FILE_LINK_RE.lastIndex = 0;
  while ((match = FILE_LINK_RE.exec(text)) !== null) {
    // The regex has two alternatives; one branch yields (1,2), the other (3,4).
    const label = (match[1] ?? match[3] ?? "").trim();
    const rawPath = match[2] ?? match[4] ?? "";
    const whole = match[0];
    const path = rawPath.trim();
    if (!isLocalFilePath(path)) continue;
    const matchStart = match.index;
    const before = text.slice(cursor, matchStart);
    if (before) {
      parts.push({ kind: "text", text: before, textElements: sliceTextElements(baseElements, cursor, matchStart) });
    }
    if (isSkillPromptLink(label, path)) {
      parts.push({
        kind: "chip",
        chipKind: "skill",
        label: skillPromptLabel(label),
        path,
      });
    } else {
      parts.push({
        kind: "chip",
        chipKind: "file",
        label: label.trim() || basenameOf(path),
        path,
        presentation: "attachment",
        fileExtension: extensionOf(path),
      });
    }
    cursor = matchStart + whole.length;
  }
  if (parts.length === 0) {
    return [{ kind: "text", text, textElements: baseElements }];
  }
  const tail = text.slice(cursor);
  if (tail) {
    parts.push({ kind: "text", text: tail, textElements: sliceTextElements(baseElements, cursor, text.length) });
  }
  // Drop any leading / trailing pure-whitespace text segments left over by the
  // extraction (`\n[link]\n` -> drops both newlines so the chip doesn't end up
  // wrapped by blank lines).
  return parts.filter((part) => part.kind !== "text" || part.text.replace(/\s+/g, "").length > 0);
}

function isSkillPromptLink(label: string, path: string): boolean {
  return label.trim().startsWith("$") && /(?:^|\/)SKILL\.md$/i.test(path.trim());
}

function skillPromptLabel(label: string): string {
  return label.trim().replace(/^\$+/, "").trim() || label.trim();
}

function sliceTextElements(
  elements: UserMessageTextElement[],
  start: number,
  end: number,
): UserMessageTextElement[] {
  if (elements.length === 0) return [];
  const out: UserMessageTextElement[] = [];
  for (const el of elements) {
    if (el.end <= start || el.start >= end) continue;
    out.push({
      start: Math.max(0, el.start - start),
      end: Math.min(end - start, el.end - start),
      placeholder: el.placeholder,
    });
  }
  return out;
}
