/*
 * File-change (patch) approval domain (item/fileChange/requestApproval +
 * legacy applyPatchApproval decision mapping lives in the shared leaf).
 * Extracted verbatim from ./approval-requests.
 */
import { stringField } from "../lib/format";
import { formatMessage } from "./i18n";
import {
  APPROVAL_DECISION_QUESTION_ID,
  approvalDecisionQuestion,
  requestMetadata,
  type PendingRequestMetadata,
  type PendingRequestQuestion,
} from "./approval-requests-shared";

export function fileChangeApprovalQuestions(_params: unknown): PendingRequestQuestion[] {
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

export function fileChangeApprovalDecisionFromAnswers(
  answers: Record<string, string[]>,
): "accept" | "acceptForSession" {
  return answers[APPROVAL_DECISION_QUESTION_ID]?.[0] === "acceptForSession" ? "acceptForSession" : "accept";
}

export function fileChangeApprovalMetadata(params: unknown): PendingRequestMetadata[] {
  const metadata = requestMetadata(params, ["threadId", "turnId", "itemId"]);
  const grantRoot = params && typeof params === "object" ? stringField(params as Record<string, unknown>, "grantRoot") : "";
  return grantRoot ? [...metadata, { label: "Grant root", value: grantRoot }] : metadata;
}
