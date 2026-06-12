import type { PendingRequestQuestion } from "../state/approval-requests";

export function pendingRequestShouldSubmitOnEnter(input: {
  canSubmit: boolean;
  isEditableTarget: boolean;
  key: string;
  responding: boolean;
  shiftKey: boolean;
}): boolean {
  return input.key === "Enter"
    && !input.shiftKey
    && input.canSubmit
    && !input.responding
    && !input.isEditableTarget;
}

export function pendingRequestOptionShortcut(input: {
  key: string;
  questions: PendingRequestQuestion[];
  responding: boolean;
  isEditableTarget: boolean;
}): { questionId: string; value: string } | null {
  if (input.responding || input.isEditableTarget) return null;
  if (!/^[1-9]$/.test(input.key)) return null;
  const question = input.questions[0];
  if (!question || question.kind === "multiSelect") return null;
  const option = question.options[Number(input.key) - 1];
  return option ? { questionId: question.id, value: option.value } : null;
}

export function pendingRequestOptionSelectionAction(input: {
  questionIndex: number;
  totalQuestions: number;
}): "next" | "submit" | null {
  if (input.totalQuestions <= 0) return null;
  return input.questionIndex < input.totalQuestions - 1 ? "next" : "submit";
}

export function pendingRequestOptionArrowSelection(input: {
  key: string;
  question: PendingRequestQuestion | null;
  currentValue: string[];
  responding: boolean;
  isEditableTarget: boolean;
}): { questionId: string; value: string } | { questionId: string; focusOther: true } | null {
  /*
   * CODEX-REF: pending-request-item-panel-*.js — request input panel registers
   * ArrowUp/ArrowDown hotkeys outside editable fields; they prevent default and
   * move the current radio selection through `question.options`; when isOther
   * is present, ArrowDown from the last option focuses the freeform textarea.
   */
  if (input.responding || input.isEditableTarget) return null;
  if (input.key !== "ArrowUp" && input.key !== "ArrowDown") return null;
  const question = input.question;
  if (!question || question.kind === "multiSelect" || question.options.length === 0) return null;
  const current = input.currentValue[0] ?? "";
  const currentIndex = question.options.findIndex((option) => option.value === current);
  if (input.key === "ArrowDown" && question.isOther === true && currentIndex === question.options.length - 1) {
    return { questionId: question.id, focusOther: true };
  }
  const direction = input.key === "ArrowDown" ? 1 : -1;
  const nextIndex = currentIndex < 0
    ? 0
    : Math.min(Math.max(currentIndex + direction, 0), question.options.length - 1);
  if (nextIndex === currentIndex) return null;
  const option = question.options[nextIndex];
  return option ? { questionId: question.id, value: option.value } : null;
}
