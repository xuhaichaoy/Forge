import { formatUnknown, stringField } from "../lib/format";
import { formatMessage } from "./i18n";
import type { PendingServerRequest } from "./codex-reducer";
import { itemType, recordObject } from "./thread-item-fields";

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
  externalUrl?: string;
  mcpToolApproval?: PendingRequestMcpToolApproval;
  optionPicker?: PendingRequestOptionPicker;
  setupContextPicker?: PendingRequestSetupContextPicker;
}

export interface PendingRequestMetadata {
  label: string;
  value: string;
}

export interface PendingRequestMcpToolApproval {
  connectorName: string;
  riskLevel: string | null;
  toolParamEntries: PendingRequestMcpToolParamEntry[];
}

export interface PendingRequestMcpToolParamEntry {
  name: string;
  label: string;
  displayKind: "text" | "json";
  previewText: string;
  expandedText: string;
  isExpandable: boolean;
}

export const OPTION_PICKER_ACTION_QUESTION_ID = "__optionPicker.action";
export const OPTION_PICKER_QUESTION_ID = "optionPickerSelection";
export const SETUP_CONTEXT_ACTION_QUESTION_ID = "__setupCodexContextPicker.action";
export const PLAN_IMPLEMENTATION_REQUEST_METHOD = "item/plan/requestImplementation";
export const PLAN_IMPLEMENTATION_QUESTION_ID = "planImplementationDecision";
export const PLAN_IMPLEMENTATION_ACCEPT_VALUE = "implement";

export interface PendingRequestOptionPicker {
  questionId: string;
  allowMultiple: boolean;
  submitLabel: string;
  skipLabel: string;
}

export interface PendingRequestSetupContextPicker {
  canSelectSources: boolean;
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
  /*
   * CODEX-REF: packages/codex-protocol/src/generated/v2/ToolRequestUserInputQuestion.ts
   * 协议层 `ToolRequestUserInputQuestion.isOther: boolean`。Codex bundle
   * `pending-request-item-panel-*.js` 检查 `isOther === true` 并：
   * - 渲染 freeform textarea（可与 options 并存）
   * - 提交时若 `isOther && freeformText`，则用 freeform 文本作答案（覆盖 selected option id）
   * - 数字键超出 options 数量时 focus 到 textarea
   * HiCodex protocol bridge 之前丢了此字段，QuestionField 因而没有 freeform 输入。
   */
  isOther?: boolean;
}

export interface PendingRequestOption {
  value: string;
  label: string;
  description: string;
  codePreview?: string;
  ariaLabel?: string;
}

const APPROVAL_DECISION_QUESTION_ID = "approvalDecision";

// Shared pending-request action labels. Codex-backed where an upstream id
// exists (common.cancel / requestInputPanel.submit / requestInputPanel.dismiss);
// "Allow" / "Unsupported" / "App tool request" are HiCodex panel labels with no
// dedicated Codex id. Defined as functions so each resolves against the active
// locale at render time (formatMessage reads the module-level i18n singleton).
function allowLabel(): string {
  return formatMessage({ id: "hc.pendingRequest.allow", defaultMessage: "Allow" });
}
function cancelLabel(): string {
  return formatMessage({ id: "common.cancel", defaultMessage: "Cancel" });
}
function submitLabel(): string {
  return formatMessage({ id: "requestInputPanel.submit", defaultMessage: "Submit" });
}
function dismissLabel(): string {
  return formatMessage({ id: "requestInputPanel.dismiss", defaultMessage: "Dismiss" });
}
function unsupportedLabel(): string {
  return formatMessage({ id: "hc.pendingRequest.unsupported", defaultMessage: "Unsupported" });
}
function appToolRequestLabel(): string {
  return formatMessage({ id: "hc.pendingRequest.appToolRequest.title", defaultMessage: "App tool request" });
}

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
        acceptLabel: allowLabel(),
        declineLabel: cancelLabel(),
        canAccept: questions.some((question) => question.options.length > 0),
        acceptDisabledReason: questions.some((question) => question.options.length > 0)
          ? undefined
          : formatMessage({
              id: "hc.pendingRequest.command.noDecision",
              defaultMessage: "No approvable command decision was provided.",
            }),
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
        title: formatMessage({
          id: "patchApprovalRequest.prompt",
          defaultMessage: "Do you want to make these changes?",
        }),
        reason: stringField(params, "reason"),
        body: paths.length > 0 ? paths.join("\n") : formatUnknown(params),
        metadata: fileChangeApprovalMetadata(params),
        questions: fileChangeApprovalQuestions(params),
        acceptLabel: allowLabel(),
        declineLabel: cancelLabel(),
        canAccept: true,
      };
    }
    case "item/tool/requestUserInput": {
      const questions = requestUserInputQuestions(params);
      /*
       * CODEX-REF: pending-request-item-panel-*.js requestInputPanel.* —
       * Codex 的用户输入面板没有固定标题 id（requestInputPanel 词根仅含
       * submit/skip/dismiss/continue 等，无 title/header），面板标题直接取当前
       * question 文本。故 title 留空，由 requestPanelTitle/panelTitle 回退到问题
       * 文本（与 Codex 一致），避免无 question 时落出非 Codex 文案。
       * declineLabel 用 requestInputPanel.dismiss=`Dismiss`（zh `忽略`），与
       * plan-implementation 分支一致；按钮 tooltip 保留为 HiCodex 增强。
       */
      return {
        title: "",
        body: questions.length > 0
          ? questions.map((question, index) => `${index + 1}. ${question.question}`).join("\n")
          : formatUnknown(params),
        metadata: requestMetadata(params, ["threadId", "turnId", "itemId"]),
        questions,
        acceptLabel: submitLabel(),
        declineLabel: dismissLabel(),
        canAccept: true,
      };
    }
    case PLAN_IMPLEMENTATION_REQUEST_METHOD:
      return {
        title: formatMessage({
          id: "implementPlanRequest.prompt",
          defaultMessage: "Implement this plan?",
        }),
        body: stringField(params, "planContent"),
        metadata: requestMetadata(params, ["threadId", "turnId", "itemId"]),
        questions: [planImplementationQuestion()],
        acceptLabel: submitLabel(),
        declineLabel: dismissLabel(),
        canAccept: true,
      };
    case "mcpServer/elicitation/request": {
      const mcpToolApproval = mcpToolApprovalDetail(params);
      const questions = [
        ...mcpElicitationQuestions(params),
        ...mcpPersistQuestions(params),
      ];
      const externalUrl = mcpExternalActionUrl(params);
      return {
        title: mcpElicitationTitle(params),
        body: mcpElicitationBody(params),
        metadata: mcpElicitationMetadata(params),
        questions,
        acceptLabel: mcpElicitationAcceptLabel(params, questions),
        declineLabel: cancelLabel(),
        canAccept: true,
        externalUrl: externalUrl ?? undefined,
        mcpToolApproval: mcpToolApproval ?? undefined,
      };
    }
    case "item/permissions/requestApproval":
      return {
        title: permissionRequestTitle(params?.permissions),
        reason: stringField(params, "reason"),
        body: describePermissions(params?.permissions),
        metadata: requestMetadata(params, ["cwd", "threadId", "turnId", "itemId"]),
        questions: hasGrantablePermissions(params?.permissions) ? [permissionScopeQuestion()] : [],
        acceptLabel: allowLabel(),
        declineLabel: cancelLabel(),
        canAccept: hasGrantablePermissions(params?.permissions),
        acceptDisabledReason: hasGrantablePermissions(params?.permissions)
          ? undefined
          : formatMessage({
              id: "hc.pendingRequest.permission.noProfile",
              defaultMessage: "No additional permission profile was provided.",
            }),
      };
    case "item/tool/requestOptionPicker": {
      const optionPicker = optionPickerRequestDetail(params, false);
      if (optionPicker) return optionPicker;
      return unsupportedToolCallDetail(params);
    }
    case "item/tool/requestSetupCodexContextPicker":
      return setupContextPickerRequestDetail(params, false) ?? unsupportedToolCallDetail(params);
    case "item/tool/call": {
      const optionPicker = optionPickerRequestDetail(params, true);
      if (optionPicker) return optionPicker;
      const setupContextPicker = setupContextPickerRequestDetail(params, true);
      if (setupContextPicker) return setupContextPicker;
      return unsupportedToolCallDetail(params);
    }
    case "account/chatgptAuthTokens/refresh":
      return {
        title: formatMessage({
          id: "hc.pendingRequest.chatgptAuthRefresh.title",
          defaultMessage: "ChatGPT auth refresh",
        }),
        body: formatMessage({
          id: "hc.pendingRequest.chatgptAuthRefresh.body",
          defaultMessage: "HiCodex does not manage ChatGPT auth tokens for app-server refresh requests.",
        }),
        metadata: requestMetadata(params, ["threadId", "turnId", "accountId"]),
        questions: [],
        acceptLabel: unsupportedLabel(),
        declineLabel: cancelLabel(),
        canAccept: false,
        acceptDisabledReason: formatMessage({
          id: "hc.pendingRequest.chatgptAuthRefresh.disabledReason",
          defaultMessage: "Token refresh must be handled by a real ChatGPT auth provider.",
        }),
      };
    default:
      return {
        title: formatMessage(
          {
            id: "hc.pendingRequest.unsupportedRequest.title",
            defaultMessage: "Unsupported request: {method}",
          },
          { method: request.method },
        ),
        body: formatUnknown(params),
        metadata: [],
        questions: [],
        acceptLabel: unsupportedLabel(),
        declineLabel: cancelLabel(),
        canAccept: false,
        acceptDisabledReason: formatMessage({
          id: "hc.pendingRequest.unsupportedRequest.disabledReason",
          defaultMessage: "Unknown app-server request type.",
        }),
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
    case PLAN_IMPLEMENTATION_REQUEST_METHOD:
      return accepted
        ? { action: planImplementationAction(answers), followUp: planImplementationFollowUp(answers) }
        : null;
    case "mcpServer/elicitation/request":
      return {
        action: accepted ? "accept" : "decline",
        content: accepted ? buildMcpElicitationContent(request, answers) : null,
        _meta: accepted ? buildMcpElicitationMeta(request, answers) : null,
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
    case "item/tool/requestOptionPicker": {
      const optionPickerResult = buildOptionPickerResult(request, accepted, answers, false);
      return optionPickerResult ?? null;
    }
    case "item/tool/requestSetupCodexContextPicker": {
      const setupContextPickerResult = buildSetupContextPickerResult(request, accepted, answers, false);
      return setupContextPickerResult ?? null;
    }
    case "item/tool/call": {
      const optionPickerResult = buildOptionPickerResult(request, accepted, answers, true);
      if (optionPickerResult) return optionPickerResult;
      const setupContextPickerResult = buildSetupContextPickerResult(request, accepted, answers, true);
      return setupContextPickerResult ?? null;
    }
    case "account/chatgptAuthTokens/refresh":
      return null;
    default:
      return null;
  }
}

export function buildStopPendingRequestResult(request: PendingServerRequest): unknown | null {
  switch (request.method) {
    case "item/commandExecution/requestApproval":
    case "execCommandApproval":
    case "item/fileChange/requestApproval":
    case "applyPatchApproval":
    case "mcpServer/elicitation/request":
      return buildApprovalResult(request, false);
    case "item/tool/requestUserInput":
      return { answers: {} };
    case PLAN_IMPLEMENTATION_REQUEST_METHOD:
      return null;
    case "item/permissions/requestApproval":
      return { permissions: {}, scope: "turn" };
    case "item/tool/requestOptionPicker":
      return buildApprovalResult(request, false);
    case "item/tool/requestSetupCodexContextPicker":
      return buildApprovalResult(request, false);
    case "item/tool/call":
      return buildApprovalResult(request, false);
    default:
      return null;
  }
}

function setupContextPickerRequestDetail(
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

function buildSetupContextPickerResult(
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

function unsupportedToolCallDetail(params: unknown): PendingRequestDetail {
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
      defaultMessage: "HiCodex can show this app-server request but cannot execute dynamic app tools from the UI shell yet.",
    }),
  };
}

function optionPickerRequestDetail(params: unknown, dynamicToolCall: boolean): PendingRequestDetail | null {
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

function buildOptionPickerResult(
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

function commandApprovalQuestions(params: unknown): PendingRequestQuestion[] {
  return [approvalDecisionQuestion(commandApprovalTitle(params), commandApprovalOptions(params))];
}

function fileChangeApprovalQuestions(_params: unknown): PendingRequestQuestion[] {
  // codex: prompt + menu labels align to upstream ICU defaults —
  //   patchApprovalRequest.prompt               = "Do you want to make these changes?"
  //   patchApprovalRequest.menu.allowOnce       = "Yes"
  //   patchApprovalRequest.menu.allowForSession = "Yes, and don't ask again this session"
  return [approvalDecisionQuestion(
    formatMessage({ id: "patchApprovalRequest.prompt", defaultMessage: "Do you want to make these changes?" }),
    [
      {
        value: "accept",
        label: formatMessage({ id: "patchApprovalRequest.menu.allowOnce", defaultMessage: "Yes" }),
        description: formatMessage({
          id: "hc.pendingRequest.fileChange.acceptDescription",
          defaultMessage: "Approve this patch application.",
        }),
      },
      {
        value: "acceptForSession",
        label: formatMessage({
          id: "patchApprovalRequest.menu.allowForSession",
          defaultMessage: "Yes, and don't ask again this session",
        }),
        description: formatMessage({
          id: "hc.pendingRequest.fileChange.acceptForSessionDescription",
          defaultMessage: "Approve patch applications until app-server restarts.",
        }),
      },
    ],
  )];
}

function approvalDecisionQuestion(
  question: string,
  options: PendingRequestOption[],
): PendingRequestQuestion {
  return {
    id: APPROVAL_DECISION_QUESTION_ID,
    header: formatMessage({ id: "hc.pendingRequest.approvalHeader", defaultMessage: "Approval" }),
    question,
    kind: "singleSelect",
    isSecret: false,
    required: true,
    defaultAnswers: ["accept"],
    options,
  };
}

function planImplementationQuestion(): PendingRequestQuestion {
  const prompt = formatMessage({ id: "implementPlanRequest.prompt", defaultMessage: "Implement this plan?" });
  return {
    id: PLAN_IMPLEMENTATION_QUESTION_ID,
    header: prompt,
    question: prompt,
    kind: "singleSelect",
    isSecret: false,
    required: false,
    defaultAnswers: [PLAN_IMPLEMENTATION_ACCEPT_VALUE],
    isOther: true,
    options: [{
      value: PLAN_IMPLEMENTATION_ACCEPT_VALUE,
      label: formatMessage({ id: "implementPlanRequest.option.implement", defaultMessage: "Yes, implement this plan" }),
      description: "",
    }],
  };
}

function planImplementationAction(answers: Record<string, string[]>): "implement" | "custom" {
  const value = answers[PLAN_IMPLEMENTATION_QUESTION_ID]?.[0]?.trim() ?? "";
  return value === PLAN_IMPLEMENTATION_ACCEPT_VALUE ? "implement" : "custom";
}

function planImplementationFollowUp(answers: Record<string, string[]>): string | null {
  const value = answers[PLAN_IMPLEMENTATION_QUESTION_ID]?.[0]?.trim() ?? "";
  return value && value !== PLAN_IMPLEMENTATION_ACCEPT_VALUE ? value : null;
}

function commandApprovalOptions(params: unknown): PendingRequestOption[] {
  // codex: option labels align verbatim to upstream ICU defaults —
  //   network branch:
  //     execApprovalRequest.network.menu.allowOnce       = "Yes, just this once"
  //     execApprovalRequest.network.menu.allowForSession = "Yes, and allow this host for this conversation"
  //     execApprovalRequest.network.menu.allowAlways     = "Yes, and allow this host in the future"
  //   exec branch:
  //     execApprovalRequest.menu.runOnce                          = "Yes"
  //     execApprovalRequest.menu.runAlwaysWithAmendment.prefix    = "Yes, and don't ask again for commands that start with"
  //     execApprovalRequest.menu.runAlways                        = "Yes, and don't ask again this session"
  const filterAvailable = (options: PendingRequestOption[]) =>
    filterAvailableCommandDecisionOptions(params, options);
  if (networkApprovalContext(params)) {
    return filterAvailable([
      {
        value: "accept",
        label: formatMessage({ id: "execApprovalRequest.network.menu.allowOnce", defaultMessage: "Yes, just this once" }),
        description: formatMessage({
          id: "hc.pendingRequest.command.network.acceptDescription",
          defaultMessage: "Approve only the current network attempt.",
        }),
      },
      {
        value: "acceptForSession",
        label: formatMessage({
          id: "execApprovalRequest.network.menu.allowForSession",
          defaultMessage: "Yes, and allow this host for this conversation",
        }),
        description: formatMessage({
          id: "hc.pendingRequest.command.network.acceptForSessionDescription",
          defaultMessage: "Approve this host for the current conversation.",
        }),
      },
      ...(allowNetworkPolicyAmendment(params)
        ? [{
            value: "applyNetworkPolicyAmendment",
            label: formatMessage({
              id: "execApprovalRequest.network.menu.allowAlways",
              defaultMessage: "Yes, and allow this host in the future",
            }),
            description: formatMessage({
              id: "hc.pendingRequest.command.network.allowAlwaysDescription",
              defaultMessage: "Save a host allowlist rule for future requests.",
            }),
          }]
        : []),
    ]);
  }

  const amendment = execPolicyAmendment(params);
  return filterAvailable([
    {
      value: "accept",
      label: formatMessage({ id: "execApprovalRequest.menu.runOnce", defaultMessage: "Yes" }),
      description: formatMessage({
        id: "hc.pendingRequest.command.acceptDescription",
        defaultMessage: "Approve this command execution.",
      }),
    },
    amendment
      ? {
          value: "acceptWithExecpolicyAmendment",
          label: formatMessage({
            id: "execApprovalRequest.menu.runAlwaysWithAmendment.prefix",
            defaultMessage: "Yes, and don't ask again for commands that start with",
          }),
          description: formatMessage({
            id: "hc.pendingRequest.command.amendmentDescription",
            defaultMessage: "Approve commands with the same prefix.",
          }),
          codePreview: execPolicyAmendmentText(amendment),
          ariaLabel: formatMessage(
            {
              id: "execApprovalRequest.menu.runAlwaysWithAmendment",
              defaultMessage: "Yes, and don't ask again for commands that start with {command}",
            },
            { command: execPolicyAmendmentText(amendment) },
          ),
        }
      : {
          value: "acceptForSession",
          label: formatMessage({
            id: "execApprovalRequest.menu.runAlways",
            defaultMessage: "Yes, and don't ask again this session",
          }),
          description: formatMessage({
            id: "hc.pendingRequest.command.acceptForSessionDescription",
            defaultMessage: "Approve command executions until app-server restarts.",
          }),
        },
  ]);
}

function commandApprovalTitle(params: unknown): string {
  // codex: prompt strings align verbatim to upstream ICU defaults —
  //   execApprovalRequest.network.prompt = `Do you want to approve network access to "{host}"?`
  //   execApprovalRequest.prompt         = "Do you want to run this command?"
  const network = networkApprovalContext(params);
  if (network) {
    const host = stringField(network, "host");
    return host
      ? formatMessage(
          { id: "execApprovalRequest.network.prompt", defaultMessage: "Do you want to approve network access to \"{host}\"?" },
          { host },
        )
      : formatMessage({
          id: "hc.pendingRequest.command.networkPromptNoHost",
          defaultMessage: "Do you want to approve network access?",
        });
  }
  return formatMessage({ id: "execApprovalRequest.prompt", defaultMessage: "Do you want to run this command?" });
}

function commandApprovalBody(params: unknown): string {
  const network = networkApprovalContext(params);
  if (network) {
    const host = stringField(network, "host");
    return host
      ? formatMessage(
          { id: "execApprovalRequest.network.reason", defaultMessage: "Reason: {host} isn't on the current network allowlist" },
          { host },
        )
      : formatMessage(
          { id: "execApprovalRequest.network.reason", defaultMessage: "Reason: {host} isn't on the current network allowlist" },
          { host: "host" },
        );
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
  if (requested && available && !available.has(requested)) return available.has("accept") ? "accept" : "decline";
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
    /*
     * CODEX-REF: ToolRequestUserInputQuestion.isOther → en `K = ne === !0`。
     * 拿 raw payload 的 isOther / is_other 字段；若 true 则 question 支持 freeform
     * 输入（合并 options 一起渲染）。
     */
    const isOther = record.isOther === true || record.is_other === true;
    return {
      id: stringField(record, "id") || `question_${index + 1}`,
      header: stringField(record, "header") || stringField(record, "label")
        || formatMessage({ id: "hc.pendingRequest.questionFallbackHeader", defaultMessage: "Question {number}" }, { number: index + 1 }),
      question: text,
      kind: requestUserInputKind(record, options),
      isSecret: record.isSecret === true || record.is_secret === true,
      required: true,
      defaultAnswers: [],
      options,
      ...(isOther ? { isOther: true } : {}),
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

const MCP_PERSIST_QUESTION_ID = "_meta.persist";

function mcpPersistQuestions(params: unknown): PendingRequestQuestion[] {
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

function mcpElicitationBody(params: unknown): string {
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

function mcpElicitationTitle(params: unknown): string {
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

function mcpToolApprovalTitle(params: unknown): string {
  const record = objectRecord(params);
  const message = stringField(record, "message") || stringField(record, "title");
  const approval = objectRecord(record?.approval);
  const meta = objectRecord(record?._meta);
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
  // HiCodex flattens the emphasized tool name into a plain string title.
  const prefix = formatMessage(
    { id: "composer.mcpToolCallApproval.formattedToolTitlePrefix", defaultMessage: "Allow {connectorName} to run" },
    { connectorName },
  );
  const suffix = formatMessage({ id: "composer.mcpToolCallApproval.formattedToolTitleSuffix", defaultMessage: "tool ?" });
  if (toolName) return `${prefix} ${toolName} ${suffix}`;
  if (message) return message;
  return `${prefix} ${suffix}`;
}

function mcpElicitationAcceptLabel(
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

function mcpExternalActionUrl(params: unknown): string | null {
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

function mcpToolApprovalDetail(params: unknown): PendingRequestMcpToolApproval | null {
  const record = objectRecord(params);
  const meta = objectRecord(record?._meta);
  const approval = objectRecord(record?.approval);
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
  const record = objectRecord(params);
  const meta = objectRecord(record?._meta);
  const approval = objectRecord(record?.approval);
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
  const record = objectRecord(params);
  const meta = objectRecord(record?._meta);
  const approval = objectRecord(record?.approval);
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
      const record = objectRecord(item);
      if (!record) return [];
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
  const record = objectRecord(value);
  if (!record) return [];
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

function buildMcpElicitationMeta(
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

function permissionScopeQuestion(): PendingRequestQuestion {
  return {
    id: "scope",
    header: formatMessage({ id: "hc.pendingRequest.scope.header", defaultMessage: "Scope" }),
    question: formatMessage({ id: "hc.pendingRequest.scope.question", defaultMessage: "How long should this permission apply?" }),
    kind: "singleSelect",
    isSecret: false,
    required: true,
    defaultAnswers: ["turn"],
    options: [
      {
        value: "turn",
        label: formatMessage({ id: "permissionRequest.menu.allowOnce", defaultMessage: "Yes, allow for this turn" }),
        description: formatMessage({
          id: "hc.pendingRequest.scope.turnDescription",
          defaultMessage: "Allow the requested access for the current turn only.",
        }),
      },
      {
        value: "session",
        label: formatMessage({ id: "permissionRequest.menu.allowForSession", defaultMessage: "Yes, allow for this session" }),
        description: formatMessage({
          id: "hc.pendingRequest.scope.sessionDescription",
          defaultMessage: "Allow until this app-server session ends.",
        }),
      },
    ],
  };
}

function permissionRequestTitle(value: unknown): string {
  const additional = formatMessage({ id: "permissionRequest.title.additional", defaultMessage: "Allow additional access?" });
  if (!value || typeof value !== "object") return additional;
  const record = value as Record<string, unknown>;
  const hasNetwork = hasNetworkPermission(record.network);
  const fileAccess = fileSystemAccessSummary(record.fileSystem);
  if (hasNetwork && !fileAccess) {
    return formatMessage({ id: "permissionRequest.title.network", defaultMessage: "Allow network access?" });
  }
  if (!hasNetwork && fileAccess) {
    if (fileAccess.access === "read") {
      return formatMessage({ id: "permissionRequest.title.read", defaultMessage: "Allow read access to {path}?" }, { path: fileAccess.target });
    }
    if (fileAccess.access === "write") {
      return formatMessage({ id: "permissionRequest.title.write", defaultMessage: "Allow write access to {path}?" }, { path: fileAccess.target });
    }
    if (fileAccess.access === "read and write") {
      return formatMessage({ id: "permissionRequest.title.readWrite", defaultMessage: "Allow read and write access to {path}?" }, { path: fileAccess.target });
    }
  }
  return additional;
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
  const empty = formatMessage({
    id: "hc.pendingRequest.permission.none",
    defaultMessage: "No additional permissions requested.",
  });
  if (!value || typeof value !== "object") return empty;
  const record = value as Record<string, unknown>;
  const lines = [
    ...describeNetworkPermissions(record.network),
    ...describeFileSystemPermissions(record.fileSystem),
  ];
  return lines.length > 0 ? lines.join("\n") : empty;
}

function describeNetworkPermissions(value: unknown): string[] {
  if (!value || typeof value !== "object") return [];
  const record = value as Record<string, unknown>;
  // The "Network: " prefix is a structural row-label parsed downstream
  // (pending-request-stack splits each body line on ": "); only the value is
  // localized. codex `permissionRequest.networkValue` = "Internet access".
  if (record.enabled === true) {
    return [`Network: ${formatMessage({ id: "permissionRequest.networkValue", defaultMessage: "Internet access" })}`];
  }
  if (record.enabled === false) {
    return [`Network: ${formatMessage({ id: "hc.pendingRequest.permission.networkDisabled", defaultMessage: "disabled" })}`];
  }
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

export function planImplementationPendingRequest(
  items: Array<{ id: string; type: string } & Record<string, unknown>>,
  activeThreadId: string | null,
  dismissedRequestIds: ReadonlySet<string>,
): PendingServerRequest | null {
  if (!activeThreadId) return null;
  for (let index = items.length - 1; index >= 0; index -= 1) {
    const item = items[index] as PendingServerRequestPlanImplementationItem;
    if (itemType(item) !== "plan-implementation") continue;
    if (item.isCompleted === true) continue;
    const planContent = typeof item.planContent === "string" ? item.planContent.trim() : "";
    if (!planContent) continue;
    const turnId = typeof item.turnId === "string" && item.turnId.trim() ? item.turnId.trim() : null;
    const id = typeof item.id === "string" && item.id.trim() ? item.id.trim() : `implement-plan:${turnId ?? index}`;
    if (dismissedRequestIds.has(id)) continue;
    return {
      id,
      method: PLAN_IMPLEMENTATION_REQUEST_METHOD,
      params: {
        threadId: activeThreadId,
        ...(turnId ? { turnId } : {}),
        itemId: item.id,
        planContent,
      },
      createdAt: 0,
    };
  }
  return null;
}

interface PendingServerRequestPlanImplementationItem extends Record<string, unknown> {
  id: string;
  type: string;
  turnId?: unknown;
  planContent?: unknown;
  isCompleted?: unknown;
}

export function planImplementationFollowUpText(
  request: PendingServerRequest,
  answers: Record<string, string[]> | undefined,
): string | null {
  const answer = answers?.[PLAN_IMPLEMENTATION_QUESTION_ID]?.[0]?.trim() ?? "";
  if (answer && answer !== PLAN_IMPLEMENTATION_ACCEPT_VALUE) return answer;
  const params = recordObject(request.params);
  const planContent = typeof params.planContent === "string" ? params.planContent.trim() : "";
  return planContent ? `PLEASE IMPLEMENT THIS PLAN:\n${planContent}` : null;
}
