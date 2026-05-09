import { formatUnknown, stringField } from "../lib/format";

import type { ThreadItem, UserMessageContentPart, UserMessageTextElement } from "./render-group-types";

export function userMessageText(item: ThreadItem): string {
  const record = item as Record<string, unknown>;
  const content = Array.isArray(record.content) ? record.content : [];
  return content.map(userInputPartText).filter(Boolean).join("\n");
}

export function projectUserMessageContent(item: ThreadItem): UserMessageContentPart[] {
  const record = item as Record<string, unknown>;
  const content = Array.isArray(record.content) ? record.content : [];
  return content.flatMap(projectUserInputPart);
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
      return text ? [{ kind: "text", text, textElements: textElements(record.text_elements) }] : [];
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
      return label || path ? [{ kind: "chip", chipKind: "mention", label: label || path, path }] : [];
    }
    case "skill": {
      const path = stringField(record, "path");
      const label = stringField(record, "name") || path;
      return label || path ? [{ kind: "chip", chipKind: "skill", label: label || path, path }] : [];
    }
    default: {
      const text = userInputPartText(part);
      return text ? [{ kind: "text", text, textElements: [] }] : [];
    }
  }
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
