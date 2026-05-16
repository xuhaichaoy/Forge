import { formatUnknown, stringField } from "../lib/format";
import type { PendingServerRequest } from "./codex-reducer";

export interface PendingRequestDetail {
  title: string;
  reason?: string;
  body: string;
  metadata: PendingRequestMetadata[];
  questions: PendingRequestQuestion[];
  acceptLabel: string;
  declineLabel: string;
  canAccept: boolean;
  acceptDisabledReason?: string;
}

export interface PendingRequestMetadata {
  label: string;
  value: string;
}

export interface PendingRequestQuestion {
  id: string;
  header: string;
  question: string;
  kind: "text" | "password" | "textarea" | "number" | "boolean" | "singleSelect" | "multiSelect";
  isSecret: boolean;
  required: boolean;
  defaultAnswers: string[];
  options: PendingRequestOption[];
}

export interface PendingRequestOption {
  value: string;
  label: string;
  description: string;
}

const APPROVAL_DECISION_QUESTION_ID = "approvalDecision";

export function pendingRequestDetail(request: PendingServerRequest): PendingRequestDetail {
  const params = request.params as Record<string, unknown> | undefined;
  switch (request.method) {
    case "item/commandExecution/requestApproval":
    case "execCommandApproval": {
      const questions = commandApprovalQuestions(params);
      return {
        title: commandApprovalTitle(params),
        reason: stringField(params, "reason"),
        body: commandApprovalBody(params),
        metadata: commandApprovalMetadata(params),
        questions,
        acceptLabel: "Allow",
        declineLabel: "Cancel",
        canAccept: questions.some((question) => question.options.length > 0),
        acceptDisabledReason: questions.some((question) => question.options.length > 0)
          ? undefined
          : "No approvable command decision was provided.",
      };
    }
    case "item/fileChange/requestApproval":
    case "applyPatchApproval": {
      const changes = Array.isArray(params?.changes) ? params.changes : [];
      const paths = changes.flatMap((change) => {
        if (!change || typeof change !== "object") return [];
        const path = (change as Record<string, unknown>).path;
        return typeof path === "string" ? [path] : [];
      });
      return {
        title: "Do you want to make these changes?",
        reason: stringField(params, "reason"),
        body: paths.length > 0 ? paths.join("\n") : formatUnknown(params),
        metadata: fileChangeApprovalMetadata(params),
        questions: fileChangeApprovalQuestions(params),
        acceptLabel: "Allow",
        declineLabel: "Cancel",
        canAccept: true,
      };
    }
    case "item/tool/requestUserInput": {
      const questions = requestUserInputQuestions(params);
      return {
        title: "Codex needs input",
        body: questions.length > 0
          ? questions.map((question, index) => `${index + 1}. ${question.question}`).join("\n")
          : formatUnknown(params),
        metadata: requestMetadata(params, ["threadId", "turnId", "itemId"]),
        questions,
        acceptLabel: "Submit",
        declineLabel: "Cancel",
        canAccept: true,
      };
    }
    case "mcpServer/elicitation/request": {
      const questions = mcpElicitationQuestions(params);
      return {
        title: "MCP request",
        body: mcpElicitationBody(params),
        metadata: mcpElicitationMetadata(params),
        questions,
        acceptLabel: questions.length > 0 ? "Submit" : "Allow",
        declineLabel: "Cancel",
        canAccept: true,
      };
    }
    case "item/permissions/requestApproval":
      return {
        title: permissionRequestTitle(params?.permissions),
        reason: stringField(params, "reason"),
        body: describePermissions(params?.permissions),
        metadata: requestMetadata(params, ["cwd", "threadId", "turnId", "itemId"]),
        questions: hasGrantablePermissions(params?.permissions) ? [permissionScopeQuestion()] : [],
        acceptLabel: "Allow",
        declineLabel: "Cancel",
        canAccept: hasGrantablePermissions(params?.permissions),
        acceptDisabledReason: hasGrantablePermissions(params?.permissions)
          ? undefined
          : "No additional permission profile was provided.",
      };
    case "item/tool/call":
      return {
        title: "App tool request",
        reason: "Dynamic client-side tool execution is not implemented.",
        body: toolCallRequestBody(params),
        metadata: toolCallRequestMetadata(params),
        questions: [],
        acceptLabel: "Unsupported",
        declineLabel: "Cancel",
        canAccept: false,
        acceptDisabledReason: "HiCodex can show this app-server request but cannot execute dynamic app tools from the UI shell yet.",
      };
    case "account/chatgptAuthTokens/refresh":
      return {
        title: "ChatGPT auth refresh",
        body: "HiCodex does not manage ChatGPT auth tokens for app-server refresh requests.",
        metadata: requestMetadata(params, ["threadId", "turnId", "accountId"]),
        questions: [],
        acceptLabel: "Unsupported",
        declineLabel: "Cancel",
        canAccept: false,
        acceptDisabledReason: "Token refresh must be handled by a real ChatGPT auth provider.",
      };
    default:
      return {
        title: `Unsupported request: ${request.method}`,
        body: formatUnknown(params),
        metadata: [],
        questions: [],
        acceptLabel: "Unsupported",
        declineLabel: "Cancel",
        canAccept: false,
        acceptDisabledReason: "Unknown app-server request type.",
      };
  }
}

export function questionText(question: unknown): string {
  if (!question || typeof question !== "object") return formatUnknown(question);
  const record = question as Record<string, unknown>;
  return stringField(record, "question")
    || stringField(record, "prompt")
    || stringField(record, "label")
    || stringField(record, "header")
    || formatUnknown(record);
}

export function buildApprovalResult(
  request: PendingServerRequest,
  accepted: boolean,
  answers: Record<string, string[]> = {},
): unknown | null {
  switch (request.method) {
    case "item/commandExecution/requestApproval":
      return { decision: accepted ? commandApprovalDecisionFromAnswers(request, answers) : "decline" };
    case "execCommandApproval":
      return { decision: accepted ? legacyApprovalDecisionFromAnswers(answers) : "denied" };
    case "item/fileChange/requestApproval":
      return { decision: accepted ? fileChangeApprovalDecisionFromAnswers(answers) : "decline" };
    case "applyPatchApproval":
      return { decision: accepted ? legacyApprovalDecisionFromAnswers(answers) : "denied" };
    case "item/tool/requestUserInput":
      return accepted ? { answers: buildUserInputAnswers(request, answers) } : null;
    case "mcpServer/elicitation/request":
      return {
        action: accepted ? "accept" : "decline",
        content: accepted ? buildMcpElicitationContent(request, answers) : null,
        _meta: null,
      };
    case "item/permissions/requestApproval": {
      if (!accepted) return null;
      const params = request.params as { permissions?: { network?: unknown; fileSystem?: unknown } } | undefined;
      const scope = answers.scope?.[0] === "session" ? "session" : "turn";
      return {
        permissions: {
          network: params?.permissions?.network ?? undefined,
          fileSystem: params?.permissions?.fileSystem ?? undefined,
        },
        scope,
        strictAutoReview: false,
      };
    }
    case "item/tool/call":
    case "account/chatgptAuthTokens/refresh":
      return null;
    default:
      return null;
  }
}

function commandApprovalQuestions(params: unknown): PendingRequestQuestion[] {
  return [approvalDecisionQuestion(commandApprovalTitle(params), commandApprovalOptions(params))];
}

function fileChangeApprovalQuestions(_params: unknown): PendingRequestQuestion[] {
  return [approvalDecisionQuestion("Do you want to make these changes?", [
    { value: "accept", label: "Yes", description: "Approve this patch application." },
    { value: "acceptForSession", label: "Yes, and don't ask again this session", description: "Approve patch applications until app-server restarts." },
  ])];
}

function approvalDecisionQuestion(
  question: string,
  options: PendingRequestOption[],
): PendingRequestQuestion {
  return {
    id: APPROVAL_DECISION_QUESTION_ID,
    header: "Approval",
    question,
    kind: "singleSelect",
    isSecret: false,
    required: true,
    defaultAnswers: ["accept"],
    options,
  };
}

function commandApprovalOptions(params: unknown): PendingRequestOption[] {
  const filterAvailable = (options: PendingRequestOption[]) =>
    filterAvailableCommandDecisionOptions(params, options);
  if (networkApprovalContext(params)) {
    return filterAvailable([
      { value: "accept", label: "Yes, just this once", description: "Approve only the current network attempt." },
      { value: "acceptForSession", label: "Yes, and allow this host for this conversation", description: "Approve this host for the current conversation." },
      ...(allowNetworkPolicyAmendment(params)
        ? [{
            value: "applyNetworkPolicyAmendment",
            label: "Yes, and allow this host in the future",
            description: "Save a host allowlist rule for future requests.",
          }]
        : []),
    ]);
  }

  const amendment = execPolicyAmendment(params);
  return filterAvailable([
    { value: "accept", label: "Yes", description: "Approve this command execution." },
    amendment
      ? {
          value: "acceptWithExecpolicyAmendment",
          label: `Yes, and don't ask again for commands that start with ${execPolicyAmendmentText(amendment)}`,
          description: "Approve commands with the same prefix.",
        }
      : {
          value: "acceptForSession",
          label: "Yes, and don't ask again this session",
          description: "Approve command executions until app-server restarts.",
        },
  ]);
}

function commandApprovalTitle(params: unknown): string {
  const network = networkApprovalContext(params);
  if (network) {
    const host = stringField(network, "host");
    return host ? `Do you want to approve network access to "${host}"?` : "Do you want to approve network access?";
  }
  return "Do you want to run this command?";
}

function commandApprovalBody(params: unknown): string {
  const network = networkApprovalContext(params);
  if (network) {
    const host = stringField(network, "host");
    return host ? `Reason: ${host} isn't on the current network allowlist` : "Reason: host isn't on the current network allowlist";
  }
  return [
    commandText(params),
    stringField(params, "cwd") ? `cwd: ${stringField(params, "cwd")}` : "",
  ].filter(Boolean).join("\n");
}

function commandApprovalDecisionFromAnswers(
  request: PendingServerRequest,
  answers: Record<string, string[]>,
): unknown {
  const requested = answers[APPROVAL_DECISION_QUESTION_ID]?.[0];
  const available = availableCommandDecisionIds(request.params);
  if (requested && available && !available.has(requested)) return available.has("accept") ? "accept" : "cancel";
  if (requested === "acceptForSession") return "acceptForSession";
  if (requested === "acceptWithExecpolicyAmendment") {
    const amendment = execPolicyAmendment(request.params);
    return amendment
      ? { acceptWithExecpolicyAmendment: { execpolicy_amendment: amendment } }
      : "acceptForSession";
  }
  if (requested === "applyNetworkPolicyAmendment") {
    const amendment = allowNetworkPolicyAmendment(request.params);
    return amendment
      ? { applyNetworkPolicyAmendment: { network_policy_amendment: amendment } }
      : "acceptForSession";
  }
  return "accept";
}

function filterAvailableCommandDecisionOptions(
  params: unknown,
  options: PendingRequestOption[],
): PendingRequestOption[] {
  const available = availableCommandDecisionIds(params);
  if (!available) return options;
  const filtered = options.filter((option) => available.has(option.value));
  return filtered;
}

function availableCommandDecisionIds(params: unknown): Set<string> | null {
  const record = objectRecord(params);
  const decisions = record?.availableDecisions;
  if (!Array.isArray(decisions)) return null;
  const ids = decisions.flatMap((decision) => {
    if (typeof decision === "string") return [decision];
    if (!decision || typeof decision !== "object" || Array.isArray(decision)) return [];
    return Object.keys(decision);
  });
  return ids.length > 0 ? new Set(ids) : null;
}

function fileChangeApprovalDecisionFromAnswers(
  answers: Record<string, string[]>,
): "accept" | "acceptForSession" {
  return answers[APPROVAL_DECISION_QUESTION_ID]?.[0] === "acceptForSession" ? "acceptForSession" : "accept";
}

function legacyApprovalDecisionFromAnswers(
  answers: Record<string, string[]>,
): "approved" | "approved_for_session" {
  return answers[APPROVAL_DECISION_QUESTION_ID]?.[0] === "acceptForSession" ? "approved_for_session" : "approved";
}

function networkApprovalContext(params: unknown): Record<string, unknown> | null {
  const record = objectRecord(params);
  const network = record?.networkApprovalContext;
  return objectRecord(network);
}

function execPolicyAmendment(params: unknown): string[] | null {
  const record = objectRecord(params);
  const amendment = record?.proposedExecpolicyAmendment;
  if (!Array.isArray(amendment)) return null;
  if (!amendment.every((item): item is string => typeof item === "string")) return null;
  return execPolicyAmendmentText(amendment).includes("\n") || execPolicyAmendmentText(amendment).includes("\r")
    ? null
    : amendment;
}

function execPolicyAmendmentText(amendment: string[]): string {
  return amendment.join(" ");
}

function allowNetworkPolicyAmendment(params: unknown): Record<string, unknown> | null {
  const record = objectRecord(params);
  const amendments = record?.proposedNetworkPolicyAmendments;
  if (!Array.isArray(amendments)) return null;
  for (const amendment of amendments) {
    const item = objectRecord(amendment);
    if (!item || item.action !== "allow" || !stringField(item, "host")) continue;
    return item;
  }
  return null;
}

function commandApprovalMetadata(params: unknown): PendingRequestMetadata[] {
  const metadata = requestMetadata(params, ["cwd", "threadId", "turnId", "itemId", "approvalId"]);
  if (!params || typeof params !== "object") return metadata;
  const record = params as Record<string, unknown>;
  const network = record.networkApprovalContext && typeof record.networkApprovalContext === "object"
    ? record.networkApprovalContext as Record<string, unknown>
    : null;
  if (!network) return metadata;
  const host = stringField(network, "host");
  const protocol = stringField(network, "protocol");
  return [
    ...metadata,
    ...(host ? [{ label: "Network host", value: protocol ? `${protocol}://${host}` : host }] : []),
  ];
}

function objectRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : null;
}

function fileChangeApprovalMetadata(params: unknown): PendingRequestMetadata[] {
  const metadata = requestMetadata(params, ["threadId", "turnId", "itemId"]);
  const grantRoot = params && typeof params === "object" ? stringField(params as Record<string, unknown>, "grantRoot") : "";
  return grantRoot ? [...metadata, { label: "Grant root", value: grantRoot }] : metadata;
}

export function requestUserInputQuestions(params: unknown): PendingRequestQuestion[] {
  const questions = params && typeof params === "object" && Array.isArray((params as Record<string, unknown>).questions)
    ? (params as { questions: unknown[] }).questions
    : [];
  return questions.map((question, index) => {
    const record = question && typeof question === "object" ? question as Record<string, unknown> : {};
    const text = questionText(question);
    const options = requestUserInputOptions(record.options);
    return {
      id: stringField(record, "id") || `question_${index + 1}`,
      header: stringField(record, "header") || stringField(record, "label") || `Question ${index + 1}`,
      question: text,
      kind: requestUserInputKind(record, options),
      isSecret: record.isSecret === true || record.is_secret === true,
      required: true,
      defaultAnswers: [],
      options,
    };
  });
}

function requestUserInputKind(
  record: Record<string, unknown>,
  options: PendingRequestOption[],
): PendingRequestQuestion["kind"] {
  if (options.length > 0) return "singleSelect";
  return record.isSecret === true || record.is_secret === true ? "password" : "textarea";
}

function requestUserInputOptions(value: unknown): PendingRequestOption[] {
  if (!Array.isArray(value)) return [];
  return value.flatMap((option) => {
    if (!option || typeof option !== "object") return [];
    const record = option as Record<string, unknown>;
    const label = stringField(record, "label");
    if (!label) return [];
    return [{
      value: label,
      label,
      description: stringField(record, "description"),
    }];
  });
}

function buildUserInputAnswers(
  request: PendingServerRequest,
  answers: Record<string, string[]>,
): Record<string, { answers: string[] }> {
  const questions = requestUserInputQuestions(request.params);
  const result: Record<string, { answers: string[] }> = {};
  for (const question of questions) {
    const values = (answers[question.id] ?? [])
      .map((answer) => answer.trim())
      .filter(Boolean);
    if (values.length > 0) {
      result[question.id] = { answers: values };
    }
  }
  return result;
}

function mcpElicitationQuestions(params: unknown): PendingRequestQuestion[] {
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
        { value: "true", label: "Yes", description: "" },
        { value: "false", label: "No", description: "" },
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

function mcpElicitationBody(params: unknown): string {
  return stringField(params, "message") || stringField(params, "title") || formatUnknown(params);
}

function buildMcpElicitationContent(
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

function normalizeAnswers(values: string[]): string[] {
  return values
    .map((answer) => answer.trim())
    .filter(Boolean);
}

function permissionScopeQuestion(): PendingRequestQuestion {
  return {
    id: "scope",
    header: "Scope",
    question: "How long should this permission apply?",
    kind: "singleSelect",
    isSecret: false,
    required: true,
    defaultAnswers: ["turn"],
    options: [
      { value: "turn", label: "Yes, allow for this turn", description: "Allow the requested access for the current turn only." },
      { value: "session", label: "Yes, allow for this session", description: "Allow until this app-server session ends." },
    ],
  };
}

function permissionRequestTitle(value: unknown): string {
  if (!value || typeof value !== "object") return "Allow additional access?";
  const record = value as Record<string, unknown>;
  const hasNetwork = hasNetworkPermission(record.network);
  const fileAccess = fileSystemAccessSummary(record.fileSystem);
  if (hasNetwork && !fileAccess) return "Allow network access?";
  if (!hasNetwork && fileAccess) {
    if (fileAccess.access === "read") return `Allow read access to ${fileAccess.target}?`;
    if (fileAccess.access === "write") return `Allow write access to ${fileAccess.target}?`;
    if (fileAccess.access === "read and write") return `Allow read and write access to ${fileAccess.target}?`;
  }
  return "Allow additional access?";
}

function hasGrantablePermissions(value: unknown): boolean {
  if (!value || typeof value !== "object") return false;
  const record = value as Record<string, unknown>;
  return hasNetworkPermission(record.network) || hasFileSystemPermission(record.fileSystem);
}

function hasNetworkPermission(value: unknown): boolean {
  if (!value || typeof value !== "object") return false;
  return (value as Record<string, unknown>).enabled !== false;
}

function hasFileSystemPermission(value: unknown): boolean {
  if (!value || typeof value !== "object") return false;
  const record = value as Record<string, unknown>;
  return arrayOfStrings(record.read).length > 0
    || arrayOfStrings(record.write).length > 0
    || (Array.isArray(record.entries) && record.entries.length > 0);
}

function fileSystemAccessSummary(value: unknown): { access: "read" | "write" | "read and write"; target: string } | null {
  if (!value || typeof value !== "object") return null;
  const record = value as Record<string, unknown>;
  const read = arrayOfStrings(record.read);
  const write = arrayOfStrings(record.write);
  const entryTargets = Array.isArray(record.entries)
    ? record.entries.flatMap((entry) => {
      const summary = fileSystemEntrySummary(entry);
      return summary ? [summary] : [];
    })
    : [];
  const targets = [...read, ...write, ...entryTargets.map((entry) => entry.target)].filter(Boolean);
  const uniqueTargets = Array.from(new Set(targets));
  if (uniqueTargets.length !== 1) return null;
  const hasRead = read.length > 0 || entryTargets.some((entry) => entry.access === "read");
  const hasWrite = write.length > 0 || entryTargets.some((entry) => entry.access === "write");
  return {
    access: hasRead && hasWrite ? "read and write" : hasWrite ? "write" : "read",
    target: uniqueTargets[0],
  };
}

function fileSystemEntrySummary(value: unknown): { access: "read" | "write"; target: string } | null {
  if (!value || typeof value !== "object") return null;
  const record = value as Record<string, unknown>;
  const access = stringField(record, "access");
  if (access !== "read" && access !== "write") return null;
  const path = record.path && typeof record.path === "object" ? record.path as Record<string, unknown> : null;
  if (!path) return null;
  if (path.type === "path") return { access, target: stringField(path, "path") };
  if (path.type === "glob_pattern") return { access, target: stringField(path, "pattern") };
  if (path.type === "special") return { access, target: stringField(path, "value") };
  return null;
}

function mcpElicitationMetadata(params: unknown): PendingRequestMetadata[] {
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
  const meta = objectRecord(objectRecord(params)?._meta);
  if (!meta) return [];
  const rows: PendingRequestMetadata[] = [];
  const approvalKind = stringField(meta, "codex_approval_kind");
  if (approvalKind) {
    rows.push({ label: "Approval", value: mcpApprovalKindLabel(approvalKind) });
  }
  const connector = stringField(meta, "connector_name") || stringField(meta, "connector_id");
  if (connector) rows.push({ label: "Connector", value: connector });
  const paramsDisplay = inlineUnknown(meta.tool_params_display);
  if (paramsDisplay) rows.push({ label: "Tool parameters", value: paramsDisplay });
  const persist = inlineUnknown(meta.persist);
  if (persist) rows.push({ label: "Persist", value: persist });
  return rows;
}

function mcpApprovalKindLabel(kind: string): string {
  if (kind === "mcp_tool_call") return "MCP tool call";
  if (kind === "tool_suggestion") return "Tool suggestion";
  return kind;
}

function toolCallRequestBody(params: unknown): string {
  const record = objectRecord(params);
  const argumentsText = inlineUnknown(record?.arguments);
  return [
    "Status: Unsupported dynamic tool call",
    "Details: This request came from app-server as an app tool call. HiCodex displays it as a pending request and does not run it as regular tool activity.",
    ...(argumentsText ? [`Arguments: ${argumentsText}`] : []),
  ].join("\n");
}

function toolCallRequestMetadata(params: unknown): PendingRequestMetadata[] {
  const metadata = requestMetadata(params, ["namespace", "tool", "callId", "threadId", "turnId"]);
  const labels: Record<string, string> = {
    namespace: "Namespace",
    tool: "Tool",
    callId: "Call",
    threadId: "Thread",
    turnId: "Turn",
  };
  return [
    { label: "Kind", value: "App tool request" },
    ...metadata.map((item) => ({
      label: labels[item.label] ?? item.label,
      value: item.value,
    })),
  ];
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

function requestMetadata(params: unknown, keys: string[]): PendingRequestMetadata[] {
  if (!params || typeof params !== "object") return [];
  const record = params as Record<string, unknown>;
  return keys.flatMap((key) => {
    const value = record[key];
    if (value === undefined || value === null || value === "") return [];
    return [{ label: key, value: String(value) }];
  });
}

function describePermissions(value: unknown): string {
  if (!value || typeof value !== "object") return "No additional permissions requested.";
  const record = value as Record<string, unknown>;
  const lines = [
    ...describeNetworkPermissions(record.network),
    ...describeFileSystemPermissions(record.fileSystem),
  ];
  return lines.length > 0 ? lines.join("\n") : "No additional permissions requested.";
}

function describeNetworkPermissions(value: unknown): string[] {
  if (!value || typeof value !== "object") return [];
  const record = value as Record<string, unknown>;
  if (record.enabled === true) return ["Network: enabled"];
  if (record.enabled === false) return ["Network: disabled"];
  return [`Network: ${formatUnknown(value)}`];
}

function describeFileSystemPermissions(value: unknown): string[] {
  if (!value || typeof value !== "object") return [];
  const record = value as Record<string, unknown>;
  const lines: string[] = [];
  const read = arrayOfStrings(record.read);
  const write = arrayOfStrings(record.write);
  if (read.length > 0) lines.push(`Read: ${read.join(", ")}`);
  if (write.length > 0) lines.push(`Write: ${write.join(", ")}`);
  if (Array.isArray(record.entries)) {
    for (const entry of record.entries) {
      const line = describeFileSystemEntry(entry);
      if (line) lines.push(line);
    }
  }
  if (typeof record.globScanMaxDepth === "number") lines.push(`Glob scan max depth: ${record.globScanMaxDepth}`);
  return lines.length > 0 ? lines : [`File system: ${formatUnknown(value)}`];
}

function describeFileSystemEntry(value: unknown): string | null {
  if (!value || typeof value !== "object") return null;
  const record = value as Record<string, unknown>;
  const access = stringField(record, "access") || "access";
  const path = record.path && typeof record.path === "object" ? record.path as Record<string, unknown> : null;
  if (!path) return null;
  if (path.type === "path") return `${access}: ${stringField(path, "path")}`;
  if (path.type === "glob_pattern") return `${access}: ${stringField(path, "pattern")}`;
  if (path.type === "special") return `${access}: ${stringField(path, "value")}`;
  return null;
}

function arrayOfStrings(value: unknown): string[] {
  return Array.isArray(value) ? value.filter((item): item is string => typeof item === "string") : [];
}

function commandText(value: unknown): string {
  const command = value && typeof value === "object"
    ? (value as Record<string, unknown>).command ?? (value as Record<string, unknown>).cmd
    : null;
  if (Array.isArray(command)) return command.map((part) => String(part)).join(" ");
  return typeof command === "string" ? command : "command";
}
