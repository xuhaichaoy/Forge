/*
 * Plan-implementation request domain: the client-synthesized
 * item/plan/requestImplementation pending request (no app-server RPC behind
 * it), its decision question, and follow-up text projection. Extracted
 * verbatim from ./approval-requests.
 */
import { formatMessage } from "./i18n";
import type { PendingRequestQuestion } from "./approval-requests-shared";
import type { PendingServerRequest } from "./codex-reducer";
import { itemType, recordObject } from "./thread-item-fields";

export const PLAN_IMPLEMENTATION_REQUEST_METHOD = "item/plan/requestImplementation";

export const PLAN_IMPLEMENTATION_QUESTION_ID = "planImplementationDecision";

export const PLAN_IMPLEMENTATION_ACCEPT_VALUE = "implement";

export function planImplementationQuestion(): PendingRequestQuestion {
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

export function planImplementationAction(answers: Record<string, string[]>): "implement" | "custom" {
  const value = answers[PLAN_IMPLEMENTATION_QUESTION_ID]?.[0]?.trim() ?? "";
  return value === PLAN_IMPLEMENTATION_ACCEPT_VALUE ? "implement" : "custom";
}

export function planImplementationFollowUp(answers: Record<string, string[]>): string | null {
  const value = answers[PLAN_IMPLEMENTATION_QUESTION_ID]?.[0]?.trim() ?? "";
  return value && value !== PLAN_IMPLEMENTATION_ACCEPT_VALUE ? value : null;
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
