import { formatUnknown, stringField } from "../lib/format";
import { formatModelDisplayName } from "../model/model-settings";

import { formatMessage } from "./i18n";
import { hiCodexImageToolOutputUrl } from "./image-generation-tool";
import { automationScheduleSummary } from "./automation-schedule-summary";
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
  if (hiCodexImageToolOutputUrl(item)) return generatedImageLabel();
  const type = itemType(item);
  const record = item as ItemRecord;
  if (type === "userInput" || type === "user-input") {
    return isCompletedRecord(item)
      ? formatMessage({ id: "hc.event.userInputRequest", defaultMessage: "User input request" })
      : formatMessage({ id: "hc.event.userInputRequested", defaultMessage: "User input requested" });
  }
  if (type === "user-input-response") return userInputResponseSummary(record);
  if (type === "mcp-server-elicitation") return formatMessage({ id: "hc.event.mcpServerElicitation", defaultMessage: "MCP server elicitation" });
  if (type === "permission-request") return formatMessage({ id: "hc.event.permissionRequest", defaultMessage: "Permission request" });
  if (type === "turn-diff") return formatMessage({ id: "hc.event.diff", defaultMessage: "Diff" });
  if (type === "automation-update") return automationUpdateSummary(record);
  if (type === "auto-review-interruption-warning") return autoReviewInterruptionLabel();
  if (type === "automatic-approval-review") return formatMessage({ id: "hc.event.autoReview", defaultMessage: "Auto-review" });
  if (type === "multi-agent-action") return formatMessage({ id: "hc.event.subagentAction", defaultMessage: "Subagent action" });
  if (type === "plan-implementation") return formatMessage({ id: "hc.event.planImplementation", defaultMessage: "Plan implementation" });
  if (type === "remote-task-created") return remoteTaskCreatedLabel();
  if (type === "context-compaction") return contextCompactionLabel(item);
  if (type === "personality-changed") return personalityChangedLabel(record);
  if (type === "forked-from-conversation") return forkedConversationLabel(record);
  if (type === "model-changed") return modelChangedLabel(record);
  if (type === "model-rerouted") return modelReroutedLabel(record);
  if (type === "steered") return steeredLabel();
  if (type === "system-error") return formatMessage({ id: "hc.event.systemError", defaultMessage: "System error" });
  if (type === "stream-error") return formatMessage({ id: "hc.event.streamError", defaultMessage: "Stream error" });
  if (type === "dynamic-tool-call") return formatMessage({ id: "hc.event.toolCall", defaultMessage: "Tool call" });
  if (type === "imageView") return formatMessage({ id: "hc.event.viewedImage", defaultMessage: "Viewed image" });
  if (type === "imageGeneration" || type === "generated-image") return generatedImageLabel();
  if (type === "enteredReviewMode") return formatMessage({ id: "hc.event.enteredReview", defaultMessage: "Entered review" });
  if (type === "exitedReviewMode") return formatMessage({ id: "hc.event.exitedReview", defaultMessage: "Exited review" });
  if (type === "proposed-plan") return formatMessage({ id: "hc.event.plan", defaultMessage: "Plan" });
  return type;
}

function generatedImageLabel(): string {
  return formatMessage({ id: "hc.event.generatedImage", defaultMessage: "Generated image" });
}

function autoReviewInterruptionLabel(): string {
  return formatMessage({ id: "localConversation.autoReviewInterruptionWarning", defaultMessage: "Turn ended by Auto-review" });
}

function remoteTaskCreatedLabel(): string {
  return formatMessage({ id: "hc.event.remoteTaskCreated", defaultMessage: "Created task in Codex Cloud" });
}

function steeredLabel(): string {
  return formatMessage({ id: "localConversation.steered.summary", defaultMessage: "Steered conversation" });
}

export function eventText(item: ThreadItem): string {
  const hiCodexImageUrl = hiCodexImageToolOutputUrl(item);
  if (hiCodexImageUrl) return `![Generated image](${markdownImageTarget(hiCodexImageUrl)})`;
  const type = itemType(item);
  const record = item as ItemRecord;
  if (type === "userInput" || type === "user-input") {
    return eventLines(userInputQuestionLines(record)) || itemText(item) || formatUnknown(item);
  }
  if (type === "user-input-response") return userInputResponseSummary(record);
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
    return automationUpdateSummary(record);
  }
  if (type === "auto-review-interruption-warning") {
    return autoReviewInterruptionLabel();
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
    return remoteTaskCreatedLabel();
  }
  if (type === "context-compaction") {
    return contextCompactionLabel(item);
  }
  if (type === "personality-changed") {
    return personalityChangedLabel(record);
  }
  if (type === "forked-from-conversation") return forkedConversationLabel(record);
  if (type === "model-changed") {
    return modelChangedLabel(record);
  }
  if (type === "model-rerouted") {
    return modelReroutedLabel(record);
  }
  if (type === "steered") {
    return steeredLabel();
  }
  if (type === "system-error") {
    return errorSummaryText(item) || formatUnknown(item);
  }
  if (type === "stream-error") {
    return errorSummaryText(item) || formatUnknown(item);
  }
  if (type === "dynamic-tool-call") {
    return eventLines([
      keyValueLine("Tool", dynamicToolName(record)),
      `Status: ${isCompletedRecord(item) ? "completed" : "running"}`,
    ]);
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

function errorSummaryText(item: ThreadItem): string {
  const record = item as ItemRecord;
  return itemText(item)
    || scalarText(record.message)
    || scalarText(record.error)
    || scalarText(record.content)
    || scalarText(record.title);
}

export function eventFormat(item: ThreadItem): EventFormat | undefined {
  if (hiCodexImageToolOutputUrl(item)) return "markdown";
  const type = itemType(item);
  if (type === "turn-diff") return "diff";
  if (type === "stream-error") return "stream-error";
  if (type === "system-error") return "system-error";
  if (type === "user-input-response") return "user-input-response";
  if (type === "automation-update") return "automation-update";
  if (type === "steered") return "status";
  if (type === "context-compaction") return "context-status";
  if (
    type === "auto-review-interruption-warning"
    || type === "model-changed"
    || type === "model-rerouted"
    || type === "personality-changed"
    || type === "remote-task-created"
    || type === "forked-from-conversation"
  ) return "divider-status";
  if ((type === "generated-image" || type === "imageGeneration") && imageEventSource(item as ItemRecord)) {
    return "markdown";
  }
  return undefined;
}

export function eventDetails(item: ThreadItem): string | undefined {
  if (itemType(item) === "user-input-response") {
    const record = item as ItemRecord;
    if (record.completed !== true) return undefined;
    return questionAnswerDetailText(record.questionsAndAnswers) || undefined;
  }
  if (itemType(item) !== "stream-error") return undefined;
  const summary = errorSummaryText(item).trim();
  const record = item as ItemRecord;
  const details = firstScalarText([
    record.additionalDetails,
    record.additional_details,
  ]).trim();
  return details && details !== summary ? details : undefined;
}

function firstScalarText(values: unknown[]): string {
  for (const value of values) {
    const text = scalarText(value);
    if (text.trim()) return text;
  }
  return "";
}

function userInputQuestionLines(record: ItemRecord): string[] {
  return recordArray(record.questions).flatMap((question) => {
    const text = stringField(question, "question") || stringField(question, "label") || scalarText(question);
    return text ? [`- ${text}`] : [];
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

function contextCompactionLabel(item: ThreadItem): string {
  const record = item as ItemRecord;
  const source = stringField(record, "source");
  const completed = contextCompactionCompleted(item);
  if (source === "manual") {
    return completed
      ? formatMessage({ id: "localConversation.contextManuallyCompacted", defaultMessage: "Context compacted" })
      : formatMessage({ id: "localConversation.contextManuallyCompacting", defaultMessage: "Compacting context" });
  }
  return completed
    ? formatMessage({ id: "localConversation.contextAutomaticallyCompacted", defaultMessage: "Context automatically compacted" })
    : formatMessage({ id: "localConversation.contextAutomaticallyCompacting", defaultMessage: "Automatically compacting context" });
}

function contextCompactionCompleted(item: ThreadItem): boolean {
  const record = item as ItemRecord;
  if (record.completed === true) return true;
  if (stringField(record, "status") === "completed") return true;
  return stringField(record, "_turnStatus") === "completed";
}

function permissionResponseText(value: unknown): string {
  if (value === null || value === undefined) return "none";
  if (typeof value === "string") return value.trim() || "granted";
  return "granted";
}

function modelChangedLabel(record: ItemRecord): string {
  const from = stringField(record, "fromModel") || stringField(record, "from_model");
  const to = stringField(record, "toModel") || stringField(record, "to_model");
  return formatMessage(
    { id: "localConversation.modelChanged", defaultMessage: "Model changed from {fromModel} to {toModel}." },
    { fromModel: modelDisplayName(from), toModel: modelDisplayName(to) },
  );
}

function modelReroutedLabel(record: ItemRecord): string {
  const to = stringField(record, "toModel") || stringField(record, "to_model");
  return formatMessage(
    { id: "localConversation.modelRerouted", defaultMessage: "Your request was routed to {toModel}." },
    { toModel: modelDisplayName(to) },
  );
}

function modelDisplayName(value: string): string {
  const trimmed = value.trim();
  return trimmed ? formatModelDisplayName(trimmed) : formatMessage({ id: "hc.event.modelCustomName", defaultMessage: "Custom" });
}

function personalityChangedLabel(record: ItemRecord): string {
  const label = stringField(record, "personality") === "friendly"
    ? formatMessage({ id: "composer.personalitySlashCommand.label.friendly", defaultMessage: "Friendly" })
    : formatMessage({ id: "composer.personalitySlashCommand.label.pragmatic", defaultMessage: "Pragmatic" });
  return formatMessage(
    { id: "localConversation.personalityChanged", defaultMessage: "Switched to {personality} personality" },
    { personality: label },
  );
}

function forkedConversationLabel(_record: ItemRecord): string {
  return formatMessage({ id: "localConversation.forkedFromConversation", defaultMessage: "Forked from conversation" });
}

function userInputResponseSummary(record: ItemRecord): string {
  const count = recordArray(record.questionsAndAnswers).length;
  if (record.completed !== true) {
    return formatMessage(
      { id: "localConversation.userInputRequest.inProgress", defaultMessage: "Asking {count, plural, one {question} other {questions}}" },
      { count },
    );
  }
  const asked = formatMessage({ id: "localConversation.userInputRequest.summary.asked", defaultMessage: "Asked" });
  const counts = formatMessage(
    { id: "localConversation.userInputRequest.summary.count", defaultMessage: "{count, plural, one {# question} other {# questions}}" },
    { count },
  );
  return formatMessage(
    { id: "localConversation.userInputRequest.summary", defaultMessage: "{label} {counts}" },
    { label: asked, counts },
  );
}

function automationUpdateSummary(record: ItemRecord): string {
  const args = recordObject(record.arguments);
  const result = recordObject(record.result);
  const snapshot = recordObject(result.snapshot);
  const mode = stringField(result, "mode") || stringField(args, "mode") || stringField(record, "mode");
  const action = automationActionLabel(mode, stringField(result, "deleteStatus") || stringField(result, "delete_status"));
  const id = stringField(result, "automationId")
    || stringField(result, "automation_id")
    || stringField(args, "id")
    || stringField(record, "id");
  const title = stringField(args, "name")
    || stringField(record, "name")
    || stringField(snapshot, "name")
    || deletedAutomationTitle(mode, id)
    || formatMessage({ id: "automation.updateDirective.untitled", defaultMessage: "Untitled automation" });
  const rawSchedule = stringField(args, "rrule") || stringField(record, "rrule") || stringField(snapshot, "rrule");
  const schedule = automationScheduleSummary(rawSchedule) ?? "";
  return [action, title, schedule].filter(Boolean).join(" · ");
}

function automationActionLabel(mode: string, deleteStatus: string): string {
  if (mode === "create") return formatMessage({ id: "automation.updateDirective.created", defaultMessage: "Created" });
  if (mode === "update") return formatMessage({ id: "automation.updateDirective.updated", defaultMessage: "Updated" });
  if (mode === "delete") {
    return deleteStatus === "not_found"
      ? formatMessage({ id: "automation.updateDirective.missing", defaultMessage: "Missing" })
      : formatMessage({ id: "automation.updateDirective.deleted", defaultMessage: "Deleted" });
  }
  if (mode === "suggested-create") return formatMessage({ id: "automation.updateDirective.proposed", defaultMessage: "Proposed" });
  if (mode === "suggested-update") return formatMessage({ id: "automation.updateDirective.proposedUpdate", defaultMessage: "Proposed update" });
  return formatMessage({ id: "automation.updateDirective.automation", defaultMessage: "Automation" });
}

function deletedAutomationTitle(mode: string, id: string): string {
  if (mode !== "delete") return "";
  const trimmed = id.trim();
  if (!trimmed) return "";
  if (/^[0-9a-f]{8}-[0-9a-f-]+$/i.test(trimmed)) return trimmed;
  return trimmed.replace(/[-_]+/g, " ");
}

function questionAnswerDetailText(value: unknown): string {
  return recordArray(value).map((questionAndAnswer) => {
    const question = stringField(questionAndAnswer, "question")
      || formatMessage({ id: "hc.event.questionFallback", defaultMessage: "Question" });
    const answers = Array.isArray(questionAndAnswer.answers)
      ? questionAndAnswer.answers.map(scalarText).filter(Boolean)
      : [];
    const noAnswer = formatMessage({ id: "localConversation.userInputRequest.noAnswer", defaultMessage: "No answer provided" });
    return [question, answers.length > 0 ? answers.join(", ") : noAnswer].join("\n");
  }).filter(Boolean).join("\n\n");
}

function dynamicToolName(record: ItemRecord): string {
  return [stringField(record, "namespace"), stringField(record, "tool") || "tool"]
    .filter(Boolean)
    .join(".");
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
  if (!src) {
    const result = stringField(record, "result").trim();
    return result ? `data:image/png;base64,${result}` : "";
  }
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
