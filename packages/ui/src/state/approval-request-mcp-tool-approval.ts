import { formatUnknown, isRecord, stringField } from "../lib/format";
import { formatMessage } from "./i18n";
import type {
  PendingRequestMcpToolApproval,
  PendingRequestMcpToolParamEntry,
} from "./approval-requests-types";
import { recordObject } from "./thread-item-fields";

export function mcpToolApprovalTitle(params: unknown): string {
  const record = recordObject(params);
  const message = stringField(record, "message") || stringField(record, "title");
  const approval = recordObject(record?.approval);
  const meta = recordObject(record?._meta);
  const connectorName = mcpToolApprovalConnectorName(params);
  const messageMatch = /^Allow\s+(.+?)\s+to\s+run\s+tool\s+"([^"]+)"\?$/.exec(message);
  const toolName = messageMatch?.[2]
    || stringField(approval, "tool_name")
    || stringField(approval, "toolName")
    || stringField(record, "tool_name")
    || stringField(record, "toolName")
    || stringField(meta, "tool_name")
    || stringField(meta, "toolName");
  // CODEX-REF: composer.mcpToolCallApproval.formattedToolTitlePrefix
  //   ("Allow {connectorName} to run") + emphasized {toolName} + suffix
  //   composer.mcpToolCallApproval.formattedToolTitleSuffix ("tool ?").
  // Forge flattens the emphasized tool name into a plain string title.
  const prefix = formatMessage(
    { id: "composer.mcpToolCallApproval.formattedToolTitlePrefix", defaultMessage: "Allow {connectorName} to run" },
    { connectorName },
  );
  const suffix = formatMessage({ id: "composer.mcpToolCallApproval.formattedToolTitleSuffix", defaultMessage: "tool ?" });
  if (toolName) return `${prefix} ${toolName} ${suffix}`;
  if (message) return message;
  return `${prefix} ${suffix}`;
}

export function mcpToolApprovalDetail(params: unknown): PendingRequestMcpToolApproval | null {
  const record = recordObject(params);
  const meta = recordObject(record?._meta);
  const approval = recordObject(record?.approval);
  const approvalKind = stringField(meta, "codex_approval_kind") || stringField(record, "kind");
  if (approvalKind !== "mcp_tool_call" && approvalKind !== "mcpToolCall") return null;
  return {
    connectorName: mcpToolApprovalConnectorName(params),
    riskLevel: stringField(record, "riskLevel")
      || stringField(record, "risk_level")
      || stringField(meta, "riskLevel")
      || stringField(meta, "risk_level")
      || stringField(approval, "riskLevel")
      || stringField(approval, "risk_level")
      || null,
    toolParamEntries: mcpToolParamEntries(params),
  };
}

function mcpToolApprovalConnectorName(params: unknown): string {
  const record = recordObject(params);
  const meta = recordObject(record?._meta);
  const approval = recordObject(record?.approval);
  return stringField(approval, "connector_name")
    || stringField(approval, "connectorName")
    || stringField(meta, "connector_name")
    || stringField(meta, "connectorName")
    || stringField(record, "connector_name")
    || stringField(record, "connectorName")
    || stringField(approval, "connector_id")
    || stringField(meta, "connector_id")
    || formatMessage({ id: "composer.mcpToolCallApproval.connectorFallbackName", defaultMessage: "Connector" });
}

function mcpToolParamEntries(params: unknown): PendingRequestMcpToolParamEntry[] {
  const record = recordObject(params);
  const meta = recordObject(record?._meta);
  const approval = recordObject(record?.approval);
  const display = record?.toolParamsDisplay
    ?? record?.tool_params_display
    ?? meta?.toolParamsDisplay
    ?? meta?.tool_params_display;
  const rawParams = approval?.tool_params
    ?? approval?.toolParams
    ?? record?.tool_params
    ?? record?.toolParams
    ?? meta?.tool_params
    ?? meta?.toolParams;
  const displayEntries = mcpToolParamDisplayEntries(display);
  const sourceEntries = displayEntries.length > 0 ? displayEntries : mcpToolParamObjectEntries(rawParams);
  return sourceEntries.map((entry) => {
    const value = mcpToolParamValue(entry.value);
    return {
      name: entry.name,
      label: entry.label,
      ...value,
    };
  });
}

function mcpToolParamDisplayEntries(value: unknown): Array<{ name: string; label: string; value: unknown }> {
  if (Array.isArray(value)) {
    return value.flatMap((item, index) => {
      // isRecord (not recordObject): the {} sentinel never fails the guard,
      // so malformed non-object display entries must be filtered explicitly —
      // HEAD dropped them via a null-returning local helper.
      if (!isRecord(item)) return [];
      const record = item;
      const name = stringField(record, "name") || stringField(record, "key") || `param_${index + 1}`;
      const label = stringField(record, "displayName")
        || stringField(record, "display_name")
        || stringField(record, "label")
        || humanizeParamName(name);
      return [{ name, label, value: record.value }];
    });
  }
  return mcpToolParamObjectEntries(value);
}

function mcpToolParamObjectEntries(value: unknown): Array<{ name: string; label: string; value: unknown }> {
  if (!isRecord(value)) return [];
  const record = value;
  return Object.entries(record).map(([name, paramValue]) => ({
    name,
    label: humanizeParamName(name),
    value: paramValue,
  }));
}

function mcpToolParamValue(value: unknown): Pick<PendingRequestMcpToolParamEntry, "displayKind" | "previewText" | "expandedText" | "isExpandable"> {
  if (typeof value === "string") {
    return {
      displayKind: "text",
      previewText: value,
      expandedText: value,
      isExpandable: mcpToolParamTextIsExpandable(value),
    };
  }
  if (typeof value === "number" || typeof value === "boolean" || value == null) {
    const text = String(value);
    return {
      displayKind: "text",
      previewText: text,
      expandedText: text,
      isExpandable: false,
    };
  }
  const expandedText = formatUnknown(value);
  const compactText = inlineUnknown(value);
  return {
    displayKind: "json",
    previewText: compactText.length <= 48 ? compactText : `${compactText.slice(0, 47)}…`,
    expandedText,
    isExpandable: compactText.length > 48,
  };
}

function mcpToolParamTextIsExpandable(value: string): boolean {
  if (value.length > 120) return true;
  return value.split(/\r?\n/).length > 4;
}

function humanizeParamName(value: string): string {
  const words = value.trim().replace(/^connector[_-]/, "").split(/[_\-\s]+/g).filter(Boolean);
  if (words.length === 0) return value;
  return words.map((word) => word.charAt(0).toUpperCase() + word.slice(1)).join(" ");
}

function inlineUnknown(value: unknown): string {
  if (value === undefined || value === null || value === "") return "";
  if (typeof value === "string") return value;
  if (typeof value === "number" || typeof value === "boolean") return String(value);
  try {
    return JSON.stringify(value);
  } catch {
    return String(value);
  }
}
