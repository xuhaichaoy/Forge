import { formatUnknown, stringField } from "../lib/format";
import type { PendingServerRequest } from "./codex-reducer";

export interface PendingRequestDetail {
  title: string;
  reason?: string;
  body: string;
  questions: PendingRequestQuestion[];
  acceptLabel: string;
  declineLabel: string;
}

export interface PendingRequestQuestion {
  id: string;
  header: string;
  question: string;
  isSecret: boolean;
  options: PendingRequestOption[];
}

export interface PendingRequestOption {
  label: string;
  description: string;
}

export function pendingRequestDetail(request: PendingServerRequest): PendingRequestDetail {
  const params = request.params as Record<string, unknown> | undefined;
  switch (request.method) {
    case "item/commandExecution/requestApproval":
    case "execCommandApproval":
      return {
        title: "Run command",
        reason: stringField(params, "reason"),
        body: [
          commandText(params),
          stringField(params, "cwd") ? `cwd: ${stringField(params, "cwd")}` : "",
        ].filter(Boolean).join("\n"),
        questions: [],
        acceptLabel: "Allow",
        declineLabel: "Cancel",
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
        title: "Apply file changes",
        reason: stringField(params, "reason"),
        body: paths.length > 0 ? paths.join("\n") : formatUnknown(params),
        questions: [],
        acceptLabel: "Allow",
        declineLabel: "Cancel",
      };
    }
    case "item/tool/requestUserInput": {
      const questions = requestUserInputQuestions(params);
      return {
        title: "Codex needs input",
        body: questions.length > 0
          ? questions.map((question, index) => `${index + 1}. ${question.question}`).join("\n")
          : formatUnknown(params),
        questions,
        acceptLabel: "Submit",
        declineLabel: "Cancel",
      };
    }
    case "mcpServer/elicitation/request":
      return {
        title: "MCP request",
        body: stringField(params, "message") || stringField(params, "title") || formatUnknown(params),
        questions: [],
        acceptLabel: "Allow",
        declineLabel: "Cancel",
      };
    case "item/permissions/requestApproval":
      return {
        title: "Permission request",
        reason: stringField(params, "reason"),
        body: [
          stringField(params, "cwd") ? `cwd: ${stringField(params, "cwd")}` : "",
          formatUnknown(params?.permissions),
        ].filter(Boolean).join("\n"),
        questions: [],
        acceptLabel: "Allow",
        declineLabel: "Cancel",
      };
    case "item/tool/call":
      return {
        title: "Tool call",
        body: `${stringField(params, "tool") || "tool"}\n${formatUnknown(params?.arguments ?? params)}`,
        questions: [],
        acceptLabel: "Allow",
        declineLabel: "Cancel",
      };
    default:
      return {
        title: `Unsupported request: ${request.method}`,
        body: formatUnknown(params),
        questions: [],
        acceptLabel: "Allow",
        declineLabel: "Cancel",
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
    case "execCommandApproval":
    case "item/fileChange/requestApproval":
    case "applyPatchApproval":
      return { decision: accepted ? "accept" : "decline" };
    case "item/tool/requestUserInput":
      return accepted ? { answers: buildUserInputAnswers(request, answers) } : null;
    case "mcpServer/elicitation/request":
      return { action: accepted ? "accept" : "decline", content: null, _meta: null };
    case "item/permissions/requestApproval": {
      if (!accepted) return null;
      const params = request.params as { permissions?: { network?: unknown; fileSystem?: unknown } } | undefined;
      return {
        permissions: {
          network: params?.permissions?.network ?? undefined,
          fileSystem: params?.permissions?.fileSystem ?? undefined,
        },
        scope: "turn",
        strictAutoReview: false,
      };
    }
    case "item/tool/call":
      return accepted ? {} : null;
    default:
      return null;
  }
}

export function requestUserInputQuestions(params: unknown): PendingRequestQuestion[] {
  const questions = params && typeof params === "object" && Array.isArray((params as Record<string, unknown>).questions)
    ? (params as { questions: unknown[] }).questions
    : [];
  return questions.map((question, index) => {
    const record = question && typeof question === "object" ? question as Record<string, unknown> : {};
    const text = questionText(question);
    return {
      id: stringField(record, "id") || `question_${index + 1}`,
      header: stringField(record, "header") || stringField(record, "label") || `Question ${index + 1}`,
      question: text,
      isSecret: record.isSecret === true || record.is_secret === true,
      options: requestUserInputOptions(record.options),
    };
  });
}

function requestUserInputOptions(value: unknown): PendingRequestOption[] {
  if (!Array.isArray(value)) return [];
  return value.flatMap((option) => {
    if (!option || typeof option !== "object") return [];
    const record = option as Record<string, unknown>;
    const label = stringField(record, "label");
    if (!label) return [];
    return [{
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

function commandText(value: unknown): string {
  const command = value && typeof value === "object"
    ? (value as Record<string, unknown>).command ?? (value as Record<string, unknown>).cmd
    : null;
  if (Array.isArray(command)) return command.map((part) => String(part)).join(" ");
  return typeof command === "string" ? command : "command";
}
