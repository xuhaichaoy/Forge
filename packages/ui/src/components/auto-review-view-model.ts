import { stringField } from "../lib/format";
import type { HiCodexIntlContextValue } from "./i18n-provider";

type AutoReviewFormatMessage = HiCodexIntlContextValue["formatMessage"];

function localizeAutoReview(formatMessage: AutoReviewFormatMessage | undefined, id: string, defaultMessage: string): string {
  return formatMessage ? formatMessage({ id, defaultMessage }) : defaultMessage;
}

// codex: localConversation.automaticApprovalReview.title.* - status-keyed title.
export function autoReviewTitle(record: Record<string, unknown>, formatMessage?: AutoReviewFormatMessage): string {
  const status = stringField(record, "status");
  if (status === "approved") return localizeAutoReview(formatMessage, "localConversation.automaticApprovalReview.title.approved", "Auto-review approved");
  if (status === "denied") return stringField(record, "riskLevel") === "high"
    ? localizeAutoReview(formatMessage, "localConversation.automaticApprovalReview.title.deniedHighRisk", "Auto-review denied high risk")
    : localizeAutoReview(formatMessage, "localConversation.automaticApprovalReview.title.denied", "Auto-review denied");
  if (status === "timedOut") return localizeAutoReview(formatMessage, "localConversation.automaticApprovalReview.title.timedOut", "Auto-review timed out");
  if (status === "aborted") return localizeAutoReview(formatMessage, "localConversation.automaticApprovalReview.title.aborted", "Auto-review stopped");
  return localizeAutoReview(formatMessage, "localConversation.automaticApprovalReview.title.inProgress", "Auto-reviewing");
}

// codex: localConversation.automaticApprovalReview.summary.* - status-keyed body
// (a non-empty `rationale` from the reviewer agent is shown verbatim instead).
export function autoReviewBody(record: Record<string, unknown>, formatMessage?: AutoReviewFormatMessage): string {
  const rationale = stringField(record, "rationale").trim();
  if (rationale) return rationale;
  const status = stringField(record, "status");
  if (status === "inProgress") {
    return localizeAutoReview(formatMessage, "localConversation.automaticApprovalReview.summary.inProgress", "A carefully prompted reviewer agent is reviewing this request before Codex runs it.");
  }
  if (status === "aborted") {
    return localizeAutoReview(formatMessage, "localConversation.automaticApprovalReview.summary.aborted", "A carefully prompted reviewer agent stopped reviewing this request before Codex ran it.");
  }
  if (status === "timedOut") {
    return localizeAutoReview(formatMessage, "localConversation.automaticApprovalReview.summary.timedOut", "A carefully prompted reviewer agent timed out before Codex ran this request.");
  }
  return localizeAutoReview(formatMessage, "localConversation.automaticApprovalReview.summary.completed", "A carefully prompted reviewer agent reviewed this request.");
}
