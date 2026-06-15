/*
 * MCP elicitation domain (mcpServer/elicitation/request): form-schema
 * questions, persist prompts, tool-suggestion / connector-auth / url-action
 * titling, external action URLs, and accept-payload assembly. The MCP
 * tool-approval card detail stays in ./approval-request-mcp-tool-approval.
 * Extracted verbatim from ./approval-requests.
 */
import { formatUnknown, stringField } from "../lib/format";
import { formatMessage } from "./i18n";
import { mcpToolApprovalTitle } from "./approval-request-mcp-tool-approval";
import {
  allowLabel,
  inlineUnknown,
  objectRecord,
  requestMetadata,
  submitLabel,
  type PendingRequestMetadata,
  type PendingRequestOption,
  type PendingRequestQuestion,
} from "./approval-requests-shared";
import type { PendingServerRequest } from "./codex-reducer";

export function mcpElicitationQuestions(params: unknown): PendingRequestQuestion[] {
  if (!params || typeof params !== "object") return [];
  const record = params as Record<string, unknown>;
  if (record.mode !== "form") return [];
  const schema = record.requestedSchema;
  if (!schema || typeof schema !== "object") return [];
  const properties = (schema as Record<string, unknown>).properties;
  if (!properties || typeof properties !== "object") return [];
  const required = new Set(
    Array.isArray((schema as Record<string, unknown>).required)
      ? ((schema as Record<string, unknown>).required as unknown[]).filter((value): value is string => typeof value === "string")
      : [],
  );
  return Object.entries(properties as Record<string, unknown>).flatMap(([id, field]) => {
    const question = mcpFieldQuestion(id, field, required.has(id));
    return question ? [question] : [];
  });
}

const MCP_PERSIST_QUESTION_ID = "_meta.persist";

export function mcpPersistQuestions(params: unknown): PendingRequestQuestion[] {
  const modes = mcpPersistModes(params);
  if (modes.length === 0) return [];
  const copyKind = mcpPersistCopyKind(params);
  return [{
    id: MCP_PERSIST_QUESTION_ID,
    header: copyKind === "toolSuggestion"
      ? formatMessage({ id: "hc.pendingRequest.persist.suggestionHeader", defaultMessage: "Suggestion" })
      : formatMessage({ id: "hc.pendingRequest.persist.approvalHeader", defaultMessage: "Approval" }),
    question: copyKind === "toolSuggestion"
      ? formatMessage({ id: "hc.pendingRequest.persist.suggestionQuestion", defaultMessage: "Hide this suggestion in the future?" })
      : formatMessage({ id: "hc.pendingRequest.persist.approvalQuestion", defaultMessage: "Remember this approval?" }),
    kind: "singleSelect",
    isSecret: false,
    required: false,
    defaultAnswers: ["none"],
    options: [
      {
        value: "none",
        label: formatMessage({ id: "hc.pendingRequest.persist.none", defaultMessage: "Don’t persist" }),
        description: formatMessage({ id: "hc.pendingRequest.persist.noneDescription", defaultMessage: "Apply this response only once." }),
      },
      ...modes.map((mode) => ({
        value: mode,
        label: mcpPersistLabel(mode, copyKind),
        description: mcpPersistDescription(mode, copyKind),
      })),
    ],
  }];
}

function mcpPersistModes(params: unknown): string[] {
  const persist = objectRecord(objectRecord(params)?._meta)?.persist;
  if (persist === undefined || persist === null) return [];
  const raw = Array.isArray(persist) ? persist : [persist];
  const modes = raw.flatMap((item) => typeof item === "string" && item.trim() ? [item.trim()] : []);
  return Array.from(new Set(modes));
}

function mcpPersistCopyKind(params: unknown): "approval" | "toolSuggestion" {
  const approvalKind = stringField(objectRecord(objectRecord(params)?._meta), "codex_approval_kind");
  return approvalKind === "tool_suggestion" ? "toolSuggestion" : "approval";
}

function mcpPersistLabel(mode: string, copyKind: "approval" | "toolSuggestion"): string {
  if (copyKind === "toolSuggestion") return formatMessage({ id: "composer.toolSuggestion.persist.always", defaultMessage: "Don't show again" });
  if (mode === "always") return formatMessage({ id: "composer.mcpToolCallApproval.persist.always", defaultMessage: "Always allow" });
  if (mode === "session") return formatMessage({ id: "composer.mcpToolCallApproval.persist.session", defaultMessage: "Allow for this chat" });
  return mode;
}

function mcpPersistDescription(mode: string, copyKind: "approval" | "toolSuggestion"): string {
  if (copyKind === "toolSuggestion") return formatMessage({ id: "hc.pendingRequest.persist.toolSuggestionDescription", defaultMessage: "Hide matching tool suggestions in future sessions." });
  if (mode === "always") return formatMessage({ id: "hc.pendingRequest.persist.alwaysDescription", defaultMessage: "Persist this approval across future sessions." });
  if (mode === "session") return formatMessage({ id: "hc.pendingRequest.persist.sessionDescription", defaultMessage: "Persist this approval for the current chat." });
  return formatMessage({ id: "hc.pendingRequest.persist.genericDescription", defaultMessage: "Persist this approval choice." });
}

function mcpFieldQuestion(id: string, field: unknown, required: boolean): PendingRequestQuestion | null {
  if (!field || typeof field !== "object") return null;
  const record = field as Record<string, unknown>;
  const title = stringField(record, "title") || id;
  const description = stringField(record, "description");
  const type = stringField(record, "type");
  const options = mcpEnumOptions(record);
  const defaultAnswers = mcpDefaultAnswers(record);

  if (type === "array") {
    return {
      id,
      header: title,
      question: description || title,
      kind: "multiSelect",
      isSecret: false,
      required,
      defaultAnswers,
      options,
    };
  }
  if (options.length > 0) {
    return {
      id,
      header: title,
      question: description || title,
      kind: "singleSelect",
      isSecret: false,
      required,
      defaultAnswers,
      options,
    };
  }
  if (type === "number" || type === "integer") {
    return {
      id,
      header: title,
      question: description || title,
      kind: "number",
      isSecret: false,
      required,
      defaultAnswers,
      options: [],
    };
  }
  if (type === "boolean") {
    return {
      id,
      header: title,
      question: description || title,
      kind: "boolean",
      isSecret: false,
      required,
      defaultAnswers,
      options: [
        { value: "true", label: formatMessage({ id: "hc.pendingRequest.boolean.yes", defaultMessage: "Yes" }), description: "" },
        { value: "false", label: formatMessage({ id: "hc.pendingRequest.boolean.no", defaultMessage: "No" }), description: "" },
      ],
    };
  }
  return {
    id,
    header: title,
    question: description || title,
    kind: stringField(record, "format") === "password" ? "password" : "text",
    isSecret: stringField(record, "format") === "password",
    required,
    defaultAnswers,
    options: [],
  };
}

function mcpEnumOptions(record: Record<string, unknown>): PendingRequestOption[] {
  const oneOf = Array.isArray(record.oneOf) ? record.oneOf : null;
  if (oneOf) {
    return oneOf.flatMap((option) => {
      if (!option || typeof option !== "object") return [];
      const value = stringField(option as Record<string, unknown>, "const");
      if (!value) return [];
      return [{
        value,
        label: stringField(option as Record<string, unknown>, "title") || value,
        description: "",
      }];
    });
  }

  const items = record.items && typeof record.items === "object" ? record.items as Record<string, unknown> : null;
  const anyOf = Array.isArray(items?.anyOf) ? items?.anyOf : null;
  if (anyOf) {
    return anyOf.flatMap((option) => {
      if (!option || typeof option !== "object") return [];
      const value = stringField(option as Record<string, unknown>, "const");
      if (!value) return [];
      return [{
        value,
        label: stringField(option as Record<string, unknown>, "title") || value,
        description: "",
      }];
    });
  }

  const enumValues = Array.isArray(record.enum)
    ? record.enum
    : Array.isArray(items?.enum)
      ? items?.enum
      : [];
  const enumNames = Array.isArray(record.enumNames) ? record.enumNames : [];
  return enumValues.flatMap((value, index) => {
    if (typeof value !== "string") return [];
    const enumName = enumNames[index];
    return [{
      value,
      label: typeof enumName === "string" && enumName ? enumName : value,
      description: "",
    }];
  });
}

function mcpDefaultAnswers(record: Record<string, unknown>): string[] {
  const value = record.default;
  if (Array.isArray(value)) return value.map(String);
  if (value === undefined || value === null) return [];
  return [String(value)];
}

export function mcpElicitationBody(params: unknown): string {
  const url = mcpExternalActionUrl(params);
  if (url) {
    return [
      stringField(params, "message") || stringField(objectRecord(params)?.action, "message")
        || formatMessage({ id: "hc.pendingRequest.openLinkBody", defaultMessage: "Open this link to continue." }),
      `URL: ${url}`,
    ].filter(Boolean).join("\n");
  }
  return stringField(params, "message") || stringField(params, "title") || formatUnknown(params);
}

export function mcpElicitationTitle(params: unknown): string {
  const meta = objectRecord(objectRecord(params)?._meta);
  const approvalKind = stringField(meta, "codex_approval_kind");
  if (approvalKind === "mcp_tool_call") return mcpToolApprovalTitle(params);
  const connector = stringField(meta, "connector_name") || stringField(meta, "connector_id");
  const kind = stringField(params, "kind");
  const suggestion = objectRecord(objectRecord(params)?.suggestion);
  const connectorAuth = objectRecord(objectRecord(params)?.connector);
  const suggestedTool = stringField(suggestion, "tool_name") || stringField(suggestion, "tool_id");
  if (kind === "toolSuggestion" || approvalKind === "tool_suggestion" || suggestion) {
    const suggestType = stringField(suggestion, "suggest_type") || stringField(meta, "suggest_type");
    if (suggestedTool && suggestType === "install") {
      return formatMessage({ id: "composer.toolSuggestion.installTitle", defaultMessage: "Install {toolName}?" }, { toolName: suggestedTool });
    }
    if (suggestedTool) {
      return formatMessage({ id: "hc.pendingRequest.suggestion.enableTitle", defaultMessage: "Enable {toolName}?" }, { toolName: suggestedTool });
    }
    return formatMessage({ id: "hc.pendingRequest.suggestion.fallbackTitle", defaultMessage: "Suggested tool" });
  }
  if (kind === "connectorAuth" || connectorAuth) {
    const connectorName = stringField(connectorAuth, "connector_name") || stringField(connectorAuth, "connector_id") || connector;
    const authReason = stringField(connectorAuth, "auth_reason");
    if (connectorName && authReason === "missing_link") {
      return formatMessage({ id: "hc.pendingRequest.connectorAuth.signInTitle", defaultMessage: "Sign in to {connectorName}?" }, { connectorName });
    }
    if (connectorName) {
      return formatMessage({ id: "hc.pendingRequest.connectorAuth.reconnectTitle", defaultMessage: "Reconnect {connectorName}?" }, { connectorName });
    }
    return formatMessage({ id: "hc.pendingRequest.connectorAuth.fallbackTitle", defaultMessage: "Connect app?" });
  }
  if (kind === "urlAction" || mcpUrlActionUrl(params)) {
    return formatMessage({ id: "hc.pendingRequest.urlAction.title", defaultMessage: "Action required" });
  }
  if (stringField(params, "mode") === "url" || stringField(params, "url")) {
    return formatMessage({ id: "hc.pendingRequest.openUrl.title", defaultMessage: "Open this URL?" });
  }
  if (connector) {
    return formatMessage({ id: "hc.pendingRequest.connector.title", defaultMessage: "Connect {connectorName}?" }, { connectorName: connector });
  }
  return formatMessage({ id: "hc.pendingRequest.mcpRequest.title", defaultMessage: "MCP request" });
}

export function mcpElicitationAcceptLabel(
  params: unknown,
  questions: PendingRequestQuestion[],
): string {
  const kind = stringField(params, "kind");
  const meta = objectRecord(objectRecord(params)?._meta);
  const approvalKind = stringField(meta, "codex_approval_kind");
  const suggestion = objectRecord(objectRecord(params)?.suggestion);
  const connectorAuth = objectRecord(objectRecord(params)?.connector);
  if (kind === "urlAction" || mcpUrlActionUrl(params)) {
    return formatMessage({ id: "hc.pendingRequest.acceptLabel.openLink", defaultMessage: "Open link" });
  }
  if (kind === "toolSuggestion" || approvalKind === "tool_suggestion" || suggestion) {
    const suggestType = stringField(suggestion, "suggest_type") || stringField(meta, "suggest_type");
    return suggestType === "install"
      ? formatMessage({ id: "composer.toolSuggestion.install", defaultMessage: "Install" })
      : formatMessage({ id: "composer.toolSuggestion.enable", defaultMessage: "Enable" });
  }
  if (kind === "connectorAuth" || connectorAuth) {
    const authReason = stringField(connectorAuth, "auth_reason");
    return authReason === "missing_link" || mcpConnectorAuthUrl(params)
      ? formatMessage({ id: "hc.pendingRequest.acceptLabel.signIn", defaultMessage: "Sign in" })
      : formatMessage({ id: "composer.connectorAuth.reconnect.button.label", defaultMessage: "Reconnect" });
  }
  if (questions.length > 0) return submitLabel();
  return allowLabel();
}

export function mcpExternalActionUrl(params: unknown): string | null {
  return mcpUrlActionUrl(params) || mcpConnectorAuthUrl(params);
}

function mcpUrlActionUrl(params: unknown): string | null {
  const record = objectRecord(params);
  const action = objectRecord(record?.action);
  const meta = objectRecord(record?._meta);
  return normalizedHttpUrl(
    stringField(record, "url")
      || stringField(action, "url")
      || stringField(meta, "url"),
  );
}

function mcpConnectorAuthUrl(params: unknown): string | null {
  const record = objectRecord(params);
  const connector = objectRecord(record?.connector);
  const meta = objectRecord(record?._meta);
  return normalizedHttpUrl(
    stringField(connector, "url")
      || stringField(connector, "auth_url")
      || stringField(connector, "authUrl")
      || stringField(connector, "oauth_url")
      || stringField(connector, "oauthUrl")
      || stringField(meta, "auth_url")
      || stringField(meta, "authUrl")
      || stringField(meta, "oauth_url")
      || stringField(meta, "oauthUrl"),
  );
}

function normalizedHttpUrl(value: string): string | null {
  const trimmed = value.trim();
  if (!trimmed) return null;
  try {
    const url = new URL(trimmed);
    if (url.protocol !== "http:" && url.protocol !== "https:") return null;
    return url.href;
  } catch {
    return null;
  }
}

export function buildMcpElicitationContent(
  request: PendingServerRequest,
  answers: Record<string, string[]>,
): Record<string, unknown> | null {
  const params = request.params as Record<string, unknown> | undefined;
  if (params?.mode !== "form") return null;
  const result: Record<string, unknown> = {};
  for (const question of mcpElicitationQuestions(request.params)) {
    const values = normalizeAnswers(answers[question.id] ?? question.defaultAnswers);
    if (values.length === 0) continue;
    if (question.kind === "multiSelect") {
      result[question.id] = values;
    } else if (question.kind === "number") {
      const numericValue = Number(values[0]);
      if (Number.isFinite(numericValue)) result[question.id] = numericValue;
    } else if (question.kind === "boolean") {
      result[question.id] = values[0] === "true";
    } else {
      result[question.id] = values[0];
    }
  }
  return result;
}

export function buildMcpElicitationMeta(
  request: PendingServerRequest,
  answers: Record<string, string[]>,
): Record<string, unknown> | null {
  const requestedPersist = answers[MCP_PERSIST_QUESTION_ID]?.[0];
  if (!requestedPersist || requestedPersist === "none") return null;
  const modes = new Set(mcpPersistModes(request.params));
  return modes.has(requestedPersist) ? { persist: requestedPersist } : null;
}

function normalizeAnswers(values: string[]): string[] {
  return values
    .map((answer) => answer.trim())
    .filter(Boolean);
}

export function mcpElicitationMetadata(params: unknown): PendingRequestMetadata[] {
  const metadata = requestMetadata(params, ["serverName", "mode", "url", "elicitationId", "threadId", "turnId"]);
  const labels: Record<string, string> = {
    serverName: "MCP server",
    mode: "Mode",
    url: "URL",
    elicitationId: "Request",
    threadId: "Thread",
    turnId: "Turn",
  };
  return [
    { label: "Kind", value: "MCP request" },
    ...metadata.map((item) => ({
      label: labels[item.label] ?? item.label,
      value: item.value,
    })),
    ...mcpElicitationMetaMetadata(params),
  ];
}

function mcpElicitationMetaMetadata(params: unknown): PendingRequestMetadata[] {
  const record = objectRecord(params);
  const meta = objectRecord(record?._meta);
  const rows: PendingRequestMetadata[] = [];
  const kind = stringField(record, "kind");
  if (kind) rows.push({ label: "Subtype", value: mcpApprovalKindLabel(kind) });
  const approvalKind = stringField(meta, "codex_approval_kind");
  if (approvalKind) {
    rows.push({ label: "Approval", value: mcpApprovalKindLabel(approvalKind) });
  }
  const suggestion = objectRecord(record?.suggestion);
  if (suggestion) {
    const tool = stringField(suggestion, "tool_name") || stringField(suggestion, "tool_id");
    const suggestType = stringField(suggestion, "suggest_type");
    const toolType = stringField(suggestion, "tool_type");
    if (tool) rows.push({ label: "Suggested tool", value: tool });
    if (suggestType) rows.push({ label: "Suggestion", value: suggestType });
    if (toolType) rows.push({ label: "Tool type", value: toolType });
  }
  const connectorAuth = objectRecord(record?.connector);
  if (connectorAuth) {
    const connectorName = stringField(connectorAuth, "connector_name") || stringField(connectorAuth, "connector_id");
    const authReason = stringField(connectorAuth, "auth_reason");
    if (connectorName) rows.push({ label: "Connector", value: connectorName });
    if (authReason) rows.push({ label: "Auth", value: authReason });
  }
  const connectorAuthUrl = mcpConnectorAuthUrl(params);
  if (connectorAuthUrl) rows.push({ label: "Auth URL", value: connectorAuthUrl });
  const connector = stringField(meta, "connector_name") || stringField(meta, "connector_id");
  if (connector) rows.push({ label: "Connector", value: connector });
  const paramsDisplay = inlineUnknown(meta?.tool_params_display);
  if (paramsDisplay) rows.push({ label: "Tool parameters", value: paramsDisplay });
  const persist = inlineUnknown(meta?.persist);
  if (persist) rows.push({ label: "Persist", value: persist });
  return rows;
}

function mcpApprovalKindLabel(kind: string): string {
  if (kind === "mcp_tool_call") return "MCP tool call";
  if (kind === "tool_suggestion") return "Tool suggestion";
  if (kind === "toolSuggestion") return "Tool suggestion";
  if (kind === "connectorAuth") return "Connector auth";
  if (kind === "urlAction") return "URL action";
  return kind;
}
