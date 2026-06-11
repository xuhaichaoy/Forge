import { formatUnknown, stringField } from "../lib/format";

export type McpResultBlock =
  | { kind: "text"; text: string; annotations?: string }
  | { kind: "image"; mimeType: string; dataUrl: string; annotations?: string }
  | { kind: "audio"; mimeType: string; dataUrl: string; annotations?: string }
  | { kind: "resourceLink"; uri: string; name?: string; title?: string; annotations?: string }
  | { kind: "embeddedResource"; mimeType?: string; uri?: string; text?: string; annotations?: string }
  | { kind: "unknown"; raw: string };

export function mcpResultBlocks(value: unknown): McpResultBlock[] {
  const record = recordObject(value);
  const content = Array.isArray(record.content) ? record.content : [];
  return content.flatMap((rawBlock): McpResultBlock[] => {
    if (!rawBlock || typeof rawBlock !== "object") {
      return [{ kind: "unknown", raw: formatUnknown(rawBlock) }];
    }
    const blockRecord = rawBlock as Record<string, unknown>;
    const blockType = stringField(blockRecord, "type");
    const annotations = formatAnnotations(blockRecord.annotations);
    switch (blockType) {
      case "text": {
        const text = stringField(blockRecord, "text");
        return text ? [{ kind: "text", text, annotations }] : [];
      }
      case "image": {
        const mimeType = stringField(blockRecord, "mimeType") || "image/png";
        const data = stringField(blockRecord, "data");
        if (!data) return [{ kind: "unknown", raw: formatUnknown(blockRecord) }];
        const dataUrl = data.startsWith("data:") ? data : `data:${mimeType};base64,${data}`;
        return [{ kind: "image", mimeType, dataUrl, annotations }];
      }
      case "audio": {
        const mimeType = stringField(blockRecord, "mimeType") || "audio/mpeg";
        const data = stringField(blockRecord, "data");
        if (!data) return [{ kind: "unknown", raw: formatUnknown(blockRecord) }];
        const dataUrl = data.startsWith("data:") ? data : `data:${mimeType};base64,${data}`;
        return [{ kind: "audio", mimeType, dataUrl, annotations }];
      }
      case "resource_link":
      case "resourceLink": {
        const uri = stringField(blockRecord, "uri");
        const name = stringField(blockRecord, "name");
        const title = stringField(blockRecord, "title");
        return uri ? [{ kind: "resourceLink", uri, name, title, annotations }] : [];
      }
      case "embedded_resource":
      case "embeddedResource":
      case "resource": {
        const resource = recordObject(blockRecord.resource);
        const text = stringField(resource, "text") || stringField(resource, "blob") || undefined;
        return [{
          kind: "embeddedResource",
          mimeType: stringField(resource, "mimeType") || undefined,
          uri: stringField(resource, "uri") || undefined,
          text,
          annotations: formatAnnotations(resource.annotations),
        }];
      }
      case "unknown":
        return [{ kind: "unknown", raw: formatUnknown(blockRecord.raw ?? blockRecord) }];
      default:
        return [{ kind: "unknown", raw: formatUnknown(blockRecord) }];
    }
  });
}

export function toolResultText(value: unknown): string {
  if (value === null || value === undefined) return "";
  const record = recordObject(value);
  if (stringField(record, "type") === "error") return "";
  const isProtocolMcpResult = Array.isArray(record.content)
    || "structuredContent" in record
    || "structured_content" in record
    || "_meta" in record;
  if (isProtocolMcpResult) {
    return Array.isArray(record.content)
      ? record.content.map(toolResultContentText).filter(Boolean).join("\n\n")
      : "";
  }
  return formatUnknown(value);
}

export function mcpToolErrorText(record: Record<string, unknown>, server = "", tool = ""): string {
  const result = recordObject(record.result);
  let errorText = "";
  if (stringField(result, "type") === "error") {
    errorText = stringField(result, "error") || stringField(recordObject(result.rawError), "message") || formatUnknown(result);
    return computerUseMcpToolErrorText(server, tool, errorText);
  }
  const error = record.error;
  if (error === null || error === undefined) return "";
  const message = stringField(recordObject(error), "message");
  errorText = message || formatUnknown(error);
  return computerUseMcpToolErrorText(server, tool, errorText);
}

export function mcpStructuredResultText(value: unknown): string {
  if (value === null || value === undefined) return "";
  const record = recordObject(value);
  const structured = record.structuredContent ?? record.structured_content;
  if (structured === null || structured === undefined) return "";
  return formatUnknown(structured);
}

export function mcpDisplayResultBlocks(blocks: McpResultBlock[], structuredResultText: string): McpResultBlock[] {
  if (!structuredResultText || blocks.length !== 1) return blocks;
  const [block] = blocks;
  if (block?.kind !== "text" || block.annotations) return blocks;
  return parseJsonText(block.text) === structuredResultText ? [] : blocks;
}

function formatAnnotations(value: unknown): string | undefined {
  if (!value || typeof value !== "object") return undefined;
  const record = value as Record<string, unknown>;
  const parts: string[] = [];
  const audience = record.audience;
  if (Array.isArray(audience) && audience.length > 0) {
    parts.push(`audience=${audience.filter((entry) => typeof entry === "string").join(", ")}`);
  }
  if (record.priority != null) {
    parts.push(`priority=${String(record.priority)}`);
  }
  if (record.lastModified != null) {
    parts.push(`lastModified=${String(record.lastModified)}`);
  }
  return parts.length === 0 ? undefined : parts.join("; ");
}

function computerUseMcpToolErrorText(server: string, tool: string, errorText: string): string {
  if (normalizeMcpName(server) !== "computeruse") return errorText;
  if (!/timeout|timed out|awaiting tools\/call/i.test(errorText)) return errorText;
  return [
    errorText,
    "",
    `Computer Use diagnostics: ${server || "computer-use"}:${tool || "tool"} timed out in the downstream MCP tools/call path. Check helper signatures, Screen Recording, Accessibility, app approvals, MCP startup or restart state, and whether a native prompt is blocking the helper.`,
  ].join("\n");
}

function normalizeMcpName(value: string): string {
  return value.trim().toLowerCase().replace(/[^a-z0-9]+/g, "");
}

function parseJsonText(value: string): string {
  const trimmed = value.trim();
  if (!trimmed || (trimmed[0] !== "{" && trimmed[0] !== "[")) return "";
  try {
    return formatUnknown(JSON.parse(trimmed));
  } catch {
    return "";
  }
}

function toolResultContentText(value: unknown): string {
  if (!value || typeof value !== "object") return formatUnknown(value);
  const record = value as Record<string, unknown>;
  const type = stringField(record, "type");
  if (type === "text") return stringField(record, "text");
  if (type === "image") return `Image output: ${stringField(record, "mimeType") || stringField(record, "mime_type") || "image"}`;
  if (type === "audio") return `Audio output: ${stringField(record, "mimeType") || stringField(record, "mime_type") || "audio"}`;
  if (type === "resource_link") return `Resource: ${stringField(record, "title") || stringField(record, "name") || stringField(record, "uri")}`;
  if (type === "embedded_resource") {
    const resource = recordObject(record.resource);
    const title = stringField(resource, "title") || stringField(resource, "name") || stringField(resource, "uri") || "resource";
    const text = stringField(resource, "text");
    return text ? `Resource: ${title}\n\n${text}` : `Resource: ${title}`;
  }
  return formatUnknown(value);
}

function recordObject(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {};
}
