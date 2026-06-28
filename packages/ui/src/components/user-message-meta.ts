import type { I18nValues } from "../state/i18n";
import { userMessageCommentAttachmentCount } from "../state/user-message-comment-attachments";

export interface UserMessageMetaChip {
  id: string;
  defaultMessage: string;
  values?: I18nValues;
}

export function userMessageMetaChips(item: Record<string, unknown>): UserMessageMetaChip[] {
  const chips: UserMessageMetaChip[] = [];
  if (stringValue(item.deliveryStatus) === "not-sent" || booleanField(item, "hookBlocked")) {
    chips.push({ id: "codex.userMessage.hookBlocked", defaultMessage: "Hook blocked this message" });
  } else if (item.type === "hookPrompt" || booleanField(item, "hookFeedback")) {
    chips.push({ id: "codex.userMessage.hookFeedback", defaultMessage: "Hook feedback" });
  }
  const goalChip = threadGoalMetaChip(item);
  if (goalChip) chips.push(goalChip);
  if (booleanField(item, "referencesPriorConversation")) {
    chips.push({ id: "codex.userMessage.priorConversation", defaultMessage: "References prior conversation" });
  }
  if (booleanField(item, "reviewMode")) {
    chips.push({ id: "codex.userMessage.reviewMode", defaultMessage: "Review mode" });
  }
  if (booleanField(item, "pullRequestFixMode")) {
    chips.push({ id: "codex.userMessage.pullRequestFixMode", defaultMessage: "PR fix" });
  }
  if (booleanField(item, "autoResolveSync")) {
    chips.push({ id: "codex.userMessage.autoResolveSync", defaultMessage: "Auto resolve conflicts" });
  }
  const commentCount = numericField(item, "commentCount") || userMessageCommentAttachmentCount(item);
  if (commentCount > 0) {
    chips.push({
      id: "codex.userMessage.commentCount",
      defaultMessage: "{count, plural, one {# comment} other {# comments}}",
      values: { count: commentCount },
    });
  }
  const pullRequestCheckCount = numericField(item, "pullRequestCheckCount");
  if (pullRequestCheckCount > 0) {
    chips.push({
      id: "codex.userMessage.pullRequestCheckCount",
      defaultMessage: "{count, plural, one {# CI test} other {# CI tests}}",
      values: { count: pullRequestCheckCount },
    });
  }
  if (booleanField(item, "hasPullRequestMergeConflict")) {
    chips.push({ id: "codex.userMessage.pullRequestMergeConflict", defaultMessage: "Merge conflicts" });
  }
  return chips;
}

export function messageTurnId(item: Record<string, unknown>): string | null {
  const value = item._turnId;
  return typeof value === "string" && value.length > 0 ? value : null;
}

export function messageTurnStatus(item: Record<string, unknown>): string {
  const value = item._turnStatus;
  return typeof value === "string" ? value : "";
}

function threadGoalMetaChip(item: Record<string, unknown>): UserMessageMetaChip | null {
  const goal = recordField(item, "_threadGoal");
  const objective = stringValue(goal.objective).trim();
  const status = stringValue(goal.status).trim();
  if (objective || status || item.goal === true) {
    return { id: "codex.userMessage.goal", defaultMessage: "Sent as goal" };
  }
  return null;
}

function booleanField(item: Record<string, unknown>, key: string): boolean {
  return item[key] === true;
}

function numericField(item: Record<string, unknown>, key: string): number {
  const value = item[key];
  return typeof value === "number" && Number.isFinite(value) ? value : 0;
}

function recordField(item: Record<string, unknown>, key: string): Record<string, unknown> {
  const value = item[key];
  return value && typeof value === "object" ? value as Record<string, unknown> : {};
}

function stringValue(value: unknown): string {
  return typeof value === "string" ? value : "";
}
