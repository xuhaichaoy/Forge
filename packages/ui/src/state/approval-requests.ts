import { formatUnknown, stringField } from "../lib/format";
import { formatMessage } from "./i18n";
import { mcpToolApprovalDetail } from "./approval-request-mcp-tool-approval";
import {
  commandApprovalBody,
  commandApprovalDecisionFromAnswers,
  commandApprovalMetadata,
  commandApprovalQuestions,
  commandApprovalTitle,
} from "./approval-request-command";
import {
  fileChangeApprovalDecisionFromAnswers,
  fileChangeApprovalMetadata,
  fileChangeApprovalQuestions,
} from "./approval-request-file-change";
import {
  buildMcpElicitationContent,
  buildMcpElicitationMeta,
  mcpElicitationAcceptLabel,
  mcpElicitationBody,
  mcpElicitationMetadata,
  mcpElicitationQuestions,
  mcpElicitationTitle,
  mcpExternalActionUrl,
  mcpPersistQuestions,
} from "./approval-request-mcp-elicitation";
import {
  describePermissions,
  hasGrantablePermissions,
  permissionRequestTitle,
  permissionScopeQuestion,
} from "./approval-request-permissions";
import {
  PLAN_IMPLEMENTATION_REQUEST_METHOD,
  planImplementationAction,
  planImplementationFollowUp,
  planImplementationQuestion,
} from "./approval-request-plan-implementation";
import {
  buildOnboardingInputResult,
  buildOptionPickerResult,
  buildSetupCodexStepResult,
  buildSetupContextPickerResult,
  onboardingInputRequestDetail,
  optionPickerRequestDetail,
  setupCodexStepRequestDetail,
  setupContextPickerRequestDetail,
  unsupportedToolCallDetail,
} from "./approval-request-tool-call";
import {
  buildUserInputAnswers,
  requestUserInputQuestions,
} from "./approval-request-user-input";
import {
  allowLabel,
  cancelLabel,
  dismissLabel,
  legacyApprovalDecisionFromAnswers,
  requestMetadata,
  submitLabel,
  unsupportedLabel,
  type PendingRequestDetail,
} from "./approval-requests-shared";
import type { PendingServerRequest } from "./codex-reducer";

/*
 * Approval-request projection hub. The per-approval-type detail/answer logic
 * was split verbatim into the approval-request-* domain modules; this hub
 * keeps the method dispatchers (pendingRequestDetail / buildApprovalResult /
 * buildStopPendingRequestResult) and re-exports every historical name so
 * existing import paths keep working unchanged.
 */
export type {
  PendingRequestDetail,
  PendingRequestMetadata,
  PendingRequestOption,
  PendingRequestOptionPicker,
  PendingRequestQuestion,
  PendingRequestSetupContextPicker,
} from "./approval-requests-shared";


/*
 * The MCP tool-approval shapes were extracted to ./approval-requests-types
 * (pure type leaf) so approval-request-mcp-tool-approval.ts can reference
 * them without importing back into this module. Re-exported in place to keep
 * historical import paths working.
 */
export type {
  PendingRequestMcpToolApproval,
  PendingRequestMcpToolParamEntry,
} from "./approval-requests-types";

export {
  OPTION_PICKER_ACTION_QUESTION_ID,
  OPTION_PICKER_QUESTION_ID,
  SETUP_CODEX_STEP_ROLE_QUESTION_ID,
  SETUP_CODEX_STEP_TASK_ACTION_QUESTION_ID,
  SETUP_CODEX_STEP_TASK_QUESTION_ID,
  SETUP_CONTEXT_ACTION_QUESTION_ID,
  SETUP_CONTEXT_SOURCES_QUESTION_ID,
} from "./approval-request-tool-call";
export {
  PLAN_IMPLEMENTATION_ACCEPT_VALUE,
  PLAN_IMPLEMENTATION_QUESTION_ID,
  PLAN_IMPLEMENTATION_REQUEST_METHOD,
  planImplementationFollowUpText,
  planImplementationPendingRequest,
} from "./approval-request-plan-implementation";
export { questionText, requestUserInputQuestions } from "./approval-request-user-input";
export { isAutoDeniablePermissionRequest } from "./approval-request-permissions";

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
       * plan-implementation 分支一致；按钮 tooltip 保留为 Forge 增强。
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
      const onboardingInput = onboardingInputRequestDetail(params);
      if (onboardingInput) return onboardingInput;
      const optionPicker = optionPickerRequestDetail(params, true);
      if (optionPicker) return optionPicker;
      const setupCodexStep = setupCodexStepRequestDetail(params);
      if (setupCodexStep) return setupCodexStep;
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
          defaultMessage: "Forge does not manage ChatGPT auth tokens for app-server refresh requests.",
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
      const onboardingInputResult = buildOnboardingInputResult(request, accepted, answers);
      if (onboardingInputResult) return onboardingInputResult;
      const optionPickerResult = buildOptionPickerResult(request, accepted, answers, true);
      if (optionPickerResult) return optionPickerResult;
      const setupCodexStepResult = buildSetupCodexStepResult(request, accepted, answers);
      if (setupCodexStepResult) return setupCodexStepResult;
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
