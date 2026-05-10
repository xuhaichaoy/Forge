import { formatUnknown, stringField } from "../lib/format";

import type { EventFormat, EventTone, ItemRecord, ThreadItem } from "./render-group-types";
import {
  formatCount,
  isCompletedRecord,
  itemText,
  itemType,
  mcpServerName,
  mcpToolName,
} from "./thread-item-fields";

export function eventLabel(item: ThreadItem): string {
  const type = itemType(item);
  if (type === "userInput" || type === "user-input") return isCompletedRecord(item) ? "User input request" : "User input requested";
  if (type === "user-input-response") return "User input response";
  if (type === "mcp-server-elicitation") return "MCP server elicitation";
  if (type === "permission-request") return "Permission request";
  if (type === "turn-diff") return "Diff";
  if (type === "automation-update") return "Automation update";
  if (type === "automatic-approval-review") return "Auto-review";
  if (type === "multi-agent-action") return "Subagent action";
  if (type === "plan-implementation") return "Plan implementation";
  if (type === "remote-task-created") return "Remote task created";
  if (type === "context-compaction") return "Context compaction";
  if (type === "personality-changed") return "Personality changed";
  if (type === "forked-from-conversation") return "Forked conversation";
  if (type === "model-changed") return "Model changed";
  if (type === "model-rerouted") return "Model rerouted";
  if (type === "system-error") return "System error";
  if (type === "stream-error") return "Stream error";
  if (type === "imageView") return "Viewed image";
  if (type === "imageGeneration" || type === "generated-image") return "Generated image";
  if (type === "enteredReviewMode") return "Entered review";
  if (type === "exitedReviewMode") return "Exited review";
  if (type === "proposed-plan") return "Plan";
  return type;
}

export function eventText(item: ThreadItem): string {
  const type = itemType(item);
  const record = item as ItemRecord;
  if (type === "userInput" || type === "user-input") {
    return eventLines(userInputQuestionLines(record)) || itemText(item) || formatUnknown(item);
  }
  if (type === "user-input-response") {
    return eventLines(questionAnswerLines(record.questionsAndAnswers)) || itemText(item) || formatUnknown(item);
  }
  if (type === "mcp-server-elicitation") {
    return eventLines([
      `Status: ${completedStatus(item, "pending")}`,
      `Action: ${stringField(record, "action") || "none"}`,
    ]);
  }
  if (type === "permission-request") {
    return eventLines([
      `Status: ${completedStatus(item, "pending")}`,
      `Reason: ${stringField(record, "reason") || "Not provided"}`,
      `Response: ${permissionResponseText(record.response)}`,
    ]);
  }
  if (type === "turn-diff") {
    return stringField(record, "unifiedDiff") || stringField(record, "diff") || itemText(item) || formatUnknown(item);
  }
  if (type === "automation-update") {
    const result = recordObject(record.result);
    return eventLines([
      `Mode: ${stringField(result, "mode") || "pending"}`,
      `Automation ID: ${stringField(result, "automationId") || stringField(result, "automation_id") || "pending"}`,
    ]);
  }
  if (type === "automatic-approval-review") {
    return eventLines([
      `Status: ${stringField(record, "status") || "pending"}`,
      keyValueLine("Risk", record.riskLevel),
      keyValueLine("Rationale", record.rationale),
    ]);
  }
  if (type === "multi-agent-action") {
    const receiverThreads = multiAgentReceiverThreadIds(item);
    return eventLines([
      keyValueLine("Action", multiAgentAction(item)),
      keyValueLine("Status", multiAgentStatus(item)),
      receiverThreads.length === 0 ? "" : `Receiver threads: ${receiverThreads.length}`,
      keyValueLine("Prompt", record.prompt),
    ]);
  }
  if (type === "plan-implementation") {
    return eventLines([
      `Status: ${record.isCompleted === true ? "completed" : completedStatus(item, "running")}`,
      scalarText(record.planContent),
    ]);
  }
  if (type === "remote-task-created") {
    return eventLines([`Task ID: ${stringField(record, "taskId") || stringField(record, "task_id") || "unknown"}`]);
  }
  if (type === "context-compaction") {
    return eventLines([
      keyValueLine("Source", record.source ?? "automatic"),
      `Status: ${completedStatus(item, "running")}`,
    ]);
  }
  if (type === "personality-changed") {
    return eventLines([keyValueLine("Personality", record.personality)]);
  }
  if (type === "forked-from-conversation") {
    return eventLines([`Source conversation: ${stringField(record, "sourceConversationId") || stringField(record, "source_conversation_id") || "unknown"}`]);
  }
  if (type === "model-changed") {
    return modelTransitionText(record) || itemText(item) || formatUnknown(item);
  }
  if (type === "model-rerouted") {
    return eventLines([
      modelTransitionText(record),
      keyValueLine("Reason", record.reason),
    ]) || itemText(item) || formatUnknown(item);
  }
  if (type === "system-error") {
    return itemText(item) || scalarText(record.message) || scalarText(record.error) || formatUnknown(item);
  }
  if (type === "stream-error") {
    return eventLines([
      scalarText(record.content) || scalarText(record.message) || scalarText(record.error),
      scalarText(record.additionalDetails) || scalarText(record.additional_details),
    ]) || formatUnknown(item);
  }
  if (type === "generated-image" || type === "imageGeneration") {
    const src = imageEventSource(record);
    if (src) return `![Generated image](${markdownImageTarget(src)})`;
    return eventLines([
      keyValueLine("Status", record.status),
      keyValueLine("Image", src),
    ]) || itemText(item) || formatUnknown(item);
  }
  if (type === "imageView") {
    return eventLines([keyValueLine("Image", record.path ?? record.url ?? record.src)]) || itemText(item) || formatUnknown(item);
  }
  if (type === "proposed-plan") {
    return itemText(item) || scalarText(record.content) || formatUnknown(item);
  }
  return itemText(item) || formatUnknown(item);
}

export function eventTone(item: ThreadItem): EventTone | undefined {
  const type = itemType(item);
  if (type === "system-error" || type === "stream-error") return "error";
  if (type === "permission-request" && !isCompletedRecord(item)) return "warning";
  return undefined;
}

export function eventFormat(item: ThreadItem): EventFormat | undefined {
  const type = itemType(item);
  if (type === "turn-diff") return "diff";
  if ((type === "generated-image" || type === "imageGeneration") && imageEventSource(item as ItemRecord)) {
    return "markdown";
  }
  return undefined;
}

function userInputQuestionLines(record: ItemRecord): string[] {
  return recordArray(record.questions).flatMap((question) => {
    const text = stringField(question, "question") || stringField(question, "label") || scalarText(question);
    return text ? [`- ${text}`] : [];
  });
}

function questionAnswerLines(value: unknown): string[] {
  return recordArray(value).flatMap((questionAndAnswer) => {
    const question = stringField(questionAndAnswer, "question");
    const answers = Array.isArray(questionAndAnswer.answers)
      ? questionAndAnswer.answers.map(scalarText).filter(Boolean)
      : [];
    const lines = question ? [`- ${question}`] : [];
    lines.push(...answers.map((answer) => `  - ${answer}`));
    return lines;
  });
}

function completedStatus(item: ThreadItem, incompleteStatus: string): string {
  if (isCompletedRecord(item)) return "completed";
  const turnStatus = stringField(item as ItemRecord, "_turnStatus");
  if (turnStatus === "completed" || turnStatus === "failed" || turnStatus === "interrupted" || turnStatus === "cancelled") {
    return turnStatus;
  }
  return stringField(item, "status") || incompleteStatus;
}

function permissionResponseText(value: unknown): string {
  if (value === null || value === undefined) return "none";
  if (typeof value === "string") return value.trim() || "granted";
  return "granted";
}

function modelTransitionText(record: ItemRecord): string {
  const from = stringField(record, "fromModel") || stringField(record, "from_model");
  const to = stringField(record, "toModel") || stringField(record, "to_model");
  if (!from && !to) return "";
  return `${from || "unknown"} -> ${to || "unknown"}`;
}

function multiAgentReceiverThreadIds(item: ThreadItem): string[] {
  const record = item as ItemRecord;
  const raw = Array.isArray(record.receiverThreadIds)
    ? record.receiverThreadIds
    : Array.isArray(record.receiverThreads)
      ? record.receiverThreads
      : [];
  return raw.flatMap((value) => typeof value === "string" && value.trim() ? [value.trim()] : []);
}

function multiAgentAction(item: ThreadItem): string {
  const record = item as ItemRecord;
  return stringField(record, "action") || stringField(record, "tool") || "agent";
}

function multiAgentStatus(item: ThreadItem): string {
  return stringField(item as ItemRecord, "status") || "completed";
}

function imageEventSource(record: ItemRecord): string {
  const src = stringField(record, "src") || stringField(record, "url") || stringField(record, "path") || stringField(record, "savedPath");
  if (!src) return "";
  if (/^(?:data|blob|https?|file):/i.test(src)) return src;
  if (src.startsWith("/")) return `file://${encodeURI(src)}`;
  return src;
}

function imageArtifactTitle(value: string): string {
  if (/^(?:data|blob):/i.test(value)) return "Generated image";
  try {
    const url = new URL(value);
    const filename = url.pathname.split("/").filter(Boolean).pop();
    return filename ? decodeURIComponent(filename) : url.hostname || "Generated image";
  } catch {
    const filename = value.split(/[/?#]/).filter(Boolean).pop();
    return filename || "Generated image";
  }
}

function markdownImageTarget(value: string): string {
  return /[\s()<>]/.test(value) ? `<${value.replaceAll(">", "%3E")}>` : value;
}

function keyValueLine(label: string, value: unknown): string {
  const text = scalarText(value);
  return text ? `${label}: ${text}` : "";
}

function eventLines(lines: string[]): string {
  return lines.map((line) => line.trimEnd()).filter((line) => line.trim().length > 0).join("\n");
}

function scalarText(value: unknown): string {
  if (value === null || value === undefined) return "";
  if (typeof value === "string") return value;
  if (typeof value === "number" || typeof value === "boolean") return String(value);
  return formatUnknown(value);
}

function recordObject(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {};
}

function recordArray(value: unknown): Record<string, unknown>[] {
  return Array.isArray(value)
    ? value.filter((item): item is Record<string, unknown> => Boolean(item) && typeof item === "object" && !Array.isArray(item))
    : [];
}
