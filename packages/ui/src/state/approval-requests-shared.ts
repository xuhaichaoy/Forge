/*
 * Shared leaf for the approval-request projection split: the pending-request
 * detail/question shapes plus the cross-domain helpers (action labels,
 * approval-decision question scaffold, params/record utilities). Extracted
 * verbatim from ./approval-requests; the hub re-exports the public names so
 * historical import paths keep working. Keep this file dependency-light — it
 * must stay importable from every approval-request-* domain module.
 */
import { formatMessage } from "./i18n";
import type { PendingRequestMcpToolApproval } from "./approval-requests-types";

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
  setupTaskPicker?: PendingRequestSetupTaskPicker;
  setupContextPicker?: PendingRequestSetupContextPicker;
  userInput?: boolean;
}

export interface PendingRequestMetadata {
  label: string;
  value: string;
}

export interface PendingRequestOptionPicker {
  questionId: string;
  allowMultiple: boolean;
  submitLabel: string;
  skipLabel: string;
}

export interface PendingRequestSetupTaskPicker {
  questionId: string;
}

export interface PendingRequestSetupContextPicker {
  canSelectSources: boolean;
  sources: PendingRequestSetupContextSource[];
  defaultSelectedSourceIds: string[];
}

export interface PendingRequestSetupContextSource {
  id: string;
  label: string;
  description?: string;
  connected?: boolean;
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
  otherPlaceholder?: string;
  /*
   * CODEX-REF: packages/codex-protocol/src/generated/v2/ToolRequestUserInputQuestion.ts
   * 协议层 `ToolRequestUserInputQuestion.isOther: boolean`。Codex bundle
   * `pending-request-item-panel-*.js` 检查 `isOther === true` 并：
   * - 渲染 freeform textarea（可与 options 并存）
   * - 提交时若 `isOther && freeformText`，则用 freeform 文本作答案（覆盖 selected option id）
   * - 数字键超出 options 数量时 focus 到 textarea
   * Forge protocol bridge 之前丢了此字段，QuestionField 因而没有 freeform 输入。
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

export const APPROVAL_DECISION_QUESTION_ID = "approvalDecision";

// Shared pending-request action labels. Codex-backed where an upstream id
// exists (common.cancel / requestInputPanel.submit / requestInputPanel.dismiss);
// "Allow" / "Unsupported" / "App tool request" are Forge panel labels with no
// dedicated Codex id. Defined as functions so each resolves against the active
// locale at render time (formatMessage reads the module-level i18n singleton).
export function allowLabel(): string {
  return formatMessage({ id: "hc.pendingRequest.allow", defaultMessage: "Allow" });
}
export function cancelLabel(): string {
  return formatMessage({ id: "common.cancel", defaultMessage: "Cancel" });
}
export function submitLabel(): string {
  return formatMessage({ id: "requestInputPanel.submit", defaultMessage: "Submit" });
}
export function dismissLabel(): string {
  return formatMessage({ id: "requestInputPanel.dismiss", defaultMessage: "Dismiss" });
}
export function unsupportedLabel(): string {
  return formatMessage({ id: "hc.pendingRequest.unsupported", defaultMessage: "Unsupported" });
}
export function appToolRequestLabel(): string {
  return formatMessage({ id: "hc.pendingRequest.appToolRequest.title", defaultMessage: "App tool request" });
}

export function approvalDecisionQuestion(
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

export function legacyApprovalDecisionFromAnswers(
  answers: Record<string, string[]>,
): "approved" | "approved_for_session" {
  return answers[APPROVAL_DECISION_QUESTION_ID]?.[0] === "acceptForSession" ? "approved_for_session" : "approved";
}

export function objectRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : null;
}

export function inlineUnknown(value: unknown): string {
  if (value === undefined || value === null || value === "") return "";
  if (typeof value === "string") return value;
  if (typeof value === "number" || typeof value === "boolean") return String(value);
  try {
    return JSON.stringify(value);
  } catch {
    return String(value);
  }
}

export function requestMetadata(params: unknown, keys: string[]): PendingRequestMetadata[] {
  if (!params || typeof params !== "object") return [];
  const record = params as Record<string, unknown>;
  return keys.flatMap((key) => {
    const value = record[key];
    if (value === undefined || value === null || value === "") return [];
    return [{ label: key, value: String(value) }];
  });
}
