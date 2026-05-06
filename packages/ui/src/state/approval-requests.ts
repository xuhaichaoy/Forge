import { formatUnknown, stringField } from "../lib/format";
import type { PendingServerRequest } from "./codex-reducer";

export interface PendingRequestDetail {
  title: string;
  reason?: string;
  body: string;
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
      };
    }
    case "item/tool/requestUserInput": {
      const questions = Array.isArray(params?.questions) ? params.questions : [];
      return {
        title: "Codex needs input",
        body: questions.length > 0
          ? questions.map((question, index) => `${index + 1}. ${questionText(question)}`).join("\n")
          : formatUnknown(params),
      };
    }
    case "mcpServer/elicitation/request":
      return {
        title: "MCP request",
        body: stringField(params, "message") || stringField(params, "title") || formatUnknown(params),
      };
    case "item/permissions/requestApproval":
      return {
        title: "Permission request",
        reason: stringField(params, "reason"),
        body: [
          stringField(params, "cwd") ? `cwd: ${stringField(params, "cwd")}` : "",
          formatUnknown(params?.permissions),
        ].filter(Boolean).join("\n"),
      };
    case "item/tool/call":
      return {
        title: "Tool call",
        body: `${stringField(params, "tool") || "tool"}\n${formatUnknown(params?.arguments ?? params)}`,
      };
    default:
      return { title: `Unsupported request: ${request.method}`, body: formatUnknown(params) };
  }
}

export function questionText(question: unknown): string {
  if (!question || typeof question !== "object") return formatUnknown(question);
  const record = question as Record<string, unknown>;
  return stringField(record, "question") || stringField(record, "prompt") || stringField(record, "label") || formatUnknown(record);
}

export function buildApprovalResult(request: PendingServerRequest, accepted: boolean): unknown | null {
  switch (request.method) {
    case "item/commandExecution/requestApproval":
    case "execCommandApproval":
    case "item/fileChange/requestApproval":
    case "applyPatchApproval":
      return { decision: accepted ? "accept" : "decline" };
    case "item/tool/requestUserInput":
      return accepted ? { answers: {} } : null;
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

function commandText(value: unknown): string {
  const command = value && typeof value === "object"
    ? (value as Record<string, unknown>).command ?? (value as Record<string, unknown>).cmd
    : null;
  if (Array.isArray(command)) return command.map((part) => String(part)).join(" ");
  return typeof command === "string" ? command : "command";
}
