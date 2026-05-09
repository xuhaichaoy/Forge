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
    case "execCommandApproval":
      return {
        title: commandApprovalTitle(params),
        reason: stringField(params, "reason"),
        body: [
          commandText(params),
          stringField(params, "cwd") ? `cwd: ${stringField(params, "cwd")}` : "",
        ].filter(Boolean).join("\n"),
        metadata: commandApprovalMetadata(params),
        questions: commandApprovalQuestions(params),
        acceptLabel: "Allow",
        declineLabel: "Cancel",
        canAccept: true,
      };
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
        body: stringField(params, "message") || stringField(params, "title") || formatUnknown(params),
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
        title: "Tool call",
        body: [
          "HiCodex does not implement dynamic client-side tool execution yet.",
          formatUnknown(params?.arguments ?? params),
        ].join("\n"),
        metadata: requestMetadata(params, ["namespace", "tool", "callId", "threadId", "turnId"]),
        questions: [],
        acceptLabel: "Unsupported",
        declineLabel: "Cancel",
        canAccept: false,
        acceptDisabledReason: "Dynamic tool execution requires a typed tool response.",
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
      return { decision: accepted ? approvalDecisionFromAnswers(request, answers) : "decline" };
    case "execCommandApproval":
      return { decision: accepted ? legacyApprovalDecisionFromAnswers(request, answers) : "denied" };
    case "item/fileChange/requestApproval":
      return { decision: accepted ? approvalDecisionFromAnswers(request, answers) : "decline" };
    case "applyPatchApproval":
      return { decision: accepted ? legacyApprovalDecisionFromAnswers(request, answers) : "denied" };
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
  return requestAllowsSessionApproval({ method: "item/commandExecution/requestApproval", params, id: "", createdAt: 0 })
    ? [approvalDecisionQuestion("Do you want to run this command?", {
      once: "Yes",
      session: "Yes, and don't ask again this session",
    })]
    : [];
}

function fileChangeApprovalQuestions(params: unknown): PendingRequestQuestion[] {
  return requestAllowsSessionApproval({ method: "item/fileChange/requestApproval", params, id: "", createdAt: 0 })
    ? [approvalDecisionQuestion("Do you want to make these changes?", {
      once: "Yes",
      session: "Yes, and don't ask again this session",
    })]
    : [];
}

function approvalDecisionQuestion(
  question: string,
  labels: { once: string; session: string },
): PendingRequestQuestion {
  return {
    id: APPROVAL_DECISION_QUESTION_ID,
    header: "Approval",
    question,
    kind: "singleSelect",
    isSecret: false,
    required: true,
    defaultAnswers: ["accept"],
    options: [
      { value: "accept", label: labels.once, description: "Allow only this request." },
      { value: "acceptForSession", label: labels.session, description: "Allow matching requests until app-server restarts." },
    ],
  };
}

function commandApprovalTitle(params: unknown): string {
  if (!params || typeof params !== "object") return "Do you want to run this command?";
  const network = (params as Record<string, unknown>).networkApprovalContext;
  if (network && typeof network === "object") {
    const host = stringField(network as Record<string, unknown>, "host");
    return host ? `Do you want to approve network access to "${host}"?` : "Do you want to approve network access?";
  }
  return "Do you want to run this command?";
}

function approvalDecisionFromAnswers(
  request: PendingServerRequest,
  answers: Record<string, string[]>,
): "accept" | "acceptForSession" {
  const requested = answers[APPROVAL_DECISION_QUESTION_ID]?.[0];
  return requested === "acceptForSession" && requestAllowsSessionApproval(request) ? "acceptForSession" : "accept";
}

function legacyApprovalDecisionFromAnswers(
  request: PendingServerRequest,
  answers: Record<string, string[]>,
): "approved" | "approved_for_session" {
  return approvalDecisionFromAnswers(request, answers) === "acceptForSession" ? "approved_for_session" : "approved";
}

function requestAllowsSessionApproval(request: PendingServerRequest): boolean {
  switch (request.method) {
    case "item/commandExecution/requestApproval":
    case "execCommandApproval":
      return commandAllowsSessionApproval(request.params);
    case "item/fileChange/requestApproval":
    case "applyPatchApproval":
      return fileChangeAllowsSessionApproval(request.params);
    default:
      return false;
  }
}

function commandAllowsSessionApproval(params: unknown): boolean {
  const record = params && typeof params === "object" ? params as Record<string, unknown> : {};
  const availableDecisions = availableDecisionStrings(record.availableDecisions);
  if (availableDecisions.length > 0) return availableDecisions.includes("acceptForSession");
  return Boolean(record.networkApprovalContext);
}

function fileChangeAllowsSessionApproval(params: unknown): boolean {
  if (!params || typeof params !== "object") return false;
  return Boolean(stringField(params as Record<string, unknown>, "grantRoot"));
}

function availableDecisionStrings(value: unknown): string[] {
  return Array.isArray(value)
    ? value.flatMap((item) => typeof item === "string" ? [item] : [])
    : [];
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
      { value: "turn", label: "This turn", description: "Allow for the current turn only." },
      { value: "session", label: "This session", description: "Allow until this app-server session ends." },
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
    serverName: "Server",
    mode: "Mode",
    url: "URL",
    elicitationId: "Request",
    threadId: "Thread",
    turnId: "Turn",
  };
  return metadata.map((item) => ({
    label: labels[item.label] ?? item.label,
    value: item.value,
  }));
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
