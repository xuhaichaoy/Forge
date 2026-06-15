/*
 * App tool-call request domain: option picker (item/tool/requestOptionPicker),
 * setup-context picker (item/tool/requestSetupCodexContextPicker), their
 * dynamic item/tool/call variants, and the unsupported dynamic tool-call
 * fallback detail. Extracted verbatim from ./approval-requests.
 */
import { stringField } from "../lib/format";
import { formatMessage } from "./i18n";
import {
  appToolRequestLabel,
  cancelLabel,
  inlineUnknown,
  objectRecord,
  requestMetadata,
  unsupportedLabel,
  type PendingRequestDetail,
  type PendingRequestMetadata,
  type PendingRequestOption,
  type PendingRequestQuestion,
} from "./approval-requests-shared";
import type { PendingServerRequest } from "./codex-reducer";

export const OPTION_PICKER_ACTION_QUESTION_ID = "__optionPicker.action";

export const OPTION_PICKER_QUESTION_ID = "optionPickerSelection";

export const SETUP_CONTEXT_ACTION_QUESTION_ID = "__setupCodexContextPicker.action";

export function setupContextPickerRequestDetail(
  params: unknown,
  dynamicToolCall: boolean,
): PendingRequestDetail | null {
  if (!setupContextPickerRequestModel(params, dynamicToolCall)) return null;
  return {
    title: formatMessage({
      id: "setupCodexContextPicker.title",
      defaultMessage: "Where can we pull context from?",
    }),
    body: "",
    metadata: requestMetadata(params, ["threadId", "turnId", "itemId", "callId"]),
    questions: [],
    acceptLabel: formatMessage({ id: "setupCodexContextPicker.continue", defaultMessage: "Continue" }),
    declineLabel: formatMessage({ id: "setupCodexContextPicker.skip", defaultMessage: "Skip" }),
    canAccept: true,
    setupContextPicker: {
      canSelectSources: false,
    },
  };
}

export function buildSetupContextPickerResult(
  request: PendingServerRequest,
  accepted: boolean,
  answers: Record<string, string[]>,
  dynamicToolCall: boolean,
): unknown | null {
  if (!setupContextPickerRequestModel(request.params, dynamicToolCall)) return null;
  const response = {
    action: setupContextPickerAction(accepted, answers),
    selectedSources: [],
  };
  if (!dynamicToolCall) return response;
  /*
   * CODEX-REF: app-server-manager-signals-Bpaj8VHp.pretty.js
   * `replyWithSetupCodexContextPickerResponse` wraps dynamic
   * `setup_codex_context_picker` responses with the same `bc` inputText
   * wrapper used by `request_option_picker`.
   */
  return {
    success: true,
    contentItems: [{ type: "inputText", text: JSON.stringify(response) }],
  };
}

function setupContextPickerAction(
  accepted: boolean,
  answers: Record<string, string[]>,
): "continue" | "skip" | "dismiss" {
  if (!accepted) return "dismiss";
  const requested = answers[SETUP_CONTEXT_ACTION_QUESTION_ID]?.[0];
  return requested === "skip" || requested === "dismiss" ? requested : "continue";
}

function setupContextPickerRequestModel(params: unknown, dynamicToolCall: boolean): true | null {
  if (!dynamicToolCall) return true;
  const record = objectRecord(params);
  if (!record) return null;
  return stringField(record, "tool") === "setup_codex_context_picker" ? true : null;
}

export function unsupportedToolCallDetail(params: unknown): PendingRequestDetail {
  return {
    title: appToolRequestLabel(),
    reason: formatMessage({
      id: "hc.pendingRequest.appTool.reason",
      defaultMessage: "Dynamic client-side tool execution is not implemented.",
    }),
    body: toolCallRequestBody(params),
    metadata: toolCallRequestMetadata(params),
    questions: [],
    acceptLabel: unsupportedLabel(),
    declineLabel: cancelLabel(),
    canAccept: false,
    acceptDisabledReason: formatMessage({
      id: "hc.pendingRequest.appTool.disabledReason",
      defaultMessage: "Forge can show this app-server request but cannot execute dynamic app tools from the UI shell yet.",
    }),
  };
}

export function optionPickerRequestDetail(params: unknown, dynamicToolCall: boolean): PendingRequestDetail | null {
  const parsed = optionPickerRequestModel(params, dynamicToolCall);
  if (!parsed) return null;
  const question: PendingRequestQuestion = {
    id: OPTION_PICKER_QUESTION_ID,
    header: parsed.question,
    question: parsed.question,
    kind: parsed.allowMultiple ? "multiSelect" : "singleSelect",
    isSecret: false,
    required: true,
    defaultAnswers: [],
    options: parsed.options,
    isOther: true,
  };
  return {
    title: parsed.question,
    body: parsed.options.map((option) => option.label).join("\n"),
    metadata: requestMetadata(params, ["threadId", "turnId", "itemId", "callId"]),
    questions: [question],
    acceptLabel: parsed.submitLabel,
    declineLabel: parsed.skipLabel,
    canAccept: true,
    optionPicker: {
      questionId: OPTION_PICKER_QUESTION_ID,
      allowMultiple: parsed.allowMultiple,
      submitLabel: parsed.submitLabel,
      skipLabel: parsed.skipLabel,
    },
  };
}

export function buildOptionPickerResult(
  request: PendingServerRequest,
  accepted: boolean,
  answers: Record<string, string[]>,
  dynamicToolCall: boolean,
): unknown | null {
  const parsed = optionPickerRequestModel(request.params, dynamicToolCall);
  if (!parsed) return null;
  const action = optionPickerAction(accepted, answers);
  const answerValues = answers[OPTION_PICKER_QUESTION_ID] ?? [];
  const optionValues = new Set(parsed.options.map((option) => option.value));
  const selectedOptions = action === "dismiss"
    ? []
    : answerValues.filter((value) => optionValues.has(value));
  const freeformAnswer = action === "dismiss"
    ? null
    : answerValues.map((value) => value.trim()).find((value) => value.length > 0 && !optionValues.has(value)) ?? null;
  const response = { action, selectedOptions, freeformAnswer };
  if (!dynamicToolCall) return response;
  /*
   * CODEX-REF: app-server-manager-signals-Bpaj8VHp.pretty.js `bc` wraps
   * dynamic `request_option_picker` responses as an MCP-style tool result:
   * { success:true, contentItems:[{ type:"inputText", text:JSON.stringify(response) }] }.
   */
  return {
    success: true,
    contentItems: [{ type: "inputText", text: JSON.stringify(response) }],
  };
}

function optionPickerAction(
  accepted: boolean,
  answers: Record<string, string[]>,
): "submit" | "skip" | "dismiss" {
  if (!accepted) return "dismiss";
  const requested = answers[OPTION_PICKER_ACTION_QUESTION_ID]?.[0];
  return requested === "skip" || requested === "dismiss" ? requested : "submit";
}

function optionPickerRequestModel(
  params: unknown,
  dynamicToolCall: boolean,
): {
  question: string;
  options: PendingRequestOption[];
  allowMultiple: boolean;
  submitLabel: string;
  skipLabel: string;
} | null {
  const record = objectRecord(params);
  if (!record) return null;
  const source = dynamicToolCall ? dynamicOptionPickerArguments(record) : record;
  if (!source) return null;
  const question = stringField(source, "question");
  const options = optionPickerOptions(source.options);
  if (!question || options.length === 0) return null;
  return {
    question,
    options,
    allowMultiple: source.allowMultiple === true || source.allow_multiple === true,
    submitLabel: stringField(source, "submitLabel") || stringField(source, "submit_label")
      || formatMessage({ id: "optionPickerRequest.submit", defaultMessage: "Submit" }),
    skipLabel: stringField(source, "skipLabel") || stringField(source, "skip_label")
      || formatMessage({ id: "optionPickerRequest.skip", defaultMessage: "Skip" }),
  };
}

function dynamicOptionPickerArguments(record: Record<string, unknown>): Record<string, unknown> | null {
  if (stringField(record, "tool") !== "request_option_picker") return null;
  const args = record.arguments;
  if (typeof args === "string") {
    try {
      return objectRecord(JSON.parse(args));
    } catch {
      return null;
    }
  }
  return objectRecord(args);
}

function optionPickerOptions(value: unknown): PendingRequestOption[] {
  if (!Array.isArray(value)) return [];
  return value.flatMap((option) => {
    if (!option || typeof option !== "object" || Array.isArray(option)) return [];
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

function toolCallRequestBody(params: unknown): string {
  const record = objectRecord(params);
  const argumentsText = inlineUnknown(record?.arguments);
  return [
    "Status: Unsupported dynamic tool call",
    "Details: This request came from app-server as an app tool call. Forge displays it as a pending request and does not run it as regular tool activity.",
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
