import { useMemo, useRef, useState } from "react";
import type { Dispatch, KeyboardEvent, SetStateAction } from "react";
import { formatError } from "../lib/format";
import { openExternalUrl } from "../lib/tauri-host";
import {
  OPTION_PICKER_ACTION_QUESTION_ID,
  SETUP_CONTEXT_ACTION_QUESTION_ID,
  pendingRequestDetail,
  type PendingRequestDetail,
  type PendingRequestQuestion,
} from "../state/approval-requests";
import type { PendingServerRequest } from "../state/codex-reducer";
import {
  pendingRequestOptionArrowSelection,
  pendingRequestOptionSelectionAction,
  pendingRequestOptionShortcut,
  pendingRequestShouldSubmitOnEnter,
} from "./pending-request-keyboard";
import { useForgeIntl } from "./i18n-provider";

type PendingRequestResponder = (
  request: PendingServerRequest,
  accepted: boolean,
  answers?: Record<string, string[]>,
) => void | Promise<void>;

interface PendingRequestApprovalControllerArgs {
  request: PendingServerRequest;
  onRespond: PendingRequestResponder;
  onLog?: (text: string, level?: "info" | "warn" | "error") => void;
}

interface PendingRequestApprovalController {
  answers: Record<string, string[]>;
  canUsePrimaryAction: boolean;
  currentQuestion: PendingRequestQuestion | null;
  detail: PendingRequestDetail;
  externalUrlOpened: boolean;
  hasMultipleQuestions: boolean;
  isLastQuestion: boolean;
  questionIndex: number;
  responding: boolean;
  setAnswers: Dispatch<SetStateAction<Record<string, string[]>>>;
  totalQuestions: number;
  goToQuestion: (next: number) => void;
  handlePanelKeyDown: (event: KeyboardEvent<HTMLDivElement>) => void;
  handleSingleSelectOption: (question: PendingRequestQuestion, value: string) => void;
  respond: (accepted: boolean, nextAnswers?: Record<string, string[]>) => void;
  respondOptionPicker: (
    action: "submit" | "skip" | "dismiss",
    nextAnswers?: Record<string, string[]>,
  ) => void;
  respondSetupContextPicker: (action: "continue" | "skip" | "dismiss") => void;
}

export function usePendingRequestApprovalController({
  request,
  onRespond,
  onLog,
}: PendingRequestApprovalControllerArgs): PendingRequestApprovalController {
  // pendingRequestDetail formats title/labels via the module-level
  // formatMessage singleton (bound to the active locale at call time), so the
  // memo must recompute on a live language switch — otherwise the card's
  // Accept/Decline/title stay in the old language while the inline-formatted
  // bits (Continue, stepper) switch, mixing two languages on one card.
  const { locale } = useForgeIntl();
  const detail = useMemo(() => {
    // `locale` is an implicit dependency: pendingRequestDetail reads the
    // module-level formatMessage singleton (bound to the active locale), so
    // detail must recompute on a language switch. Referencing it here makes
    // that dependency explicit to both the linter and the reader.
    void locale;
    return pendingRequestDetail(request);
  }, [request, locale]);
  const [externalUrlOpened, setExternalUrlOpened] = useState(false);
  const [answers, setAnswers] = useState<Record<string, string[]>>(() =>
    Object.fromEntries(detail.questions.map((question) => [question.id, defaultAnswers(question)])),
  );
  const [responding, setResponding] = useState(false);
  const respondingRef = useRef(false);
  const [questionIndex, setQuestionIndex] = useState(0);
  const totalQuestions = detail.questions.length;
  const hasMultipleQuestions = totalQuestions > 1;
  const isLastQuestion = questionIndex >= totalQuestions - 1;
  const currentQuestion = detail.questions[questionIndex] ?? null;
  const isOptionPicker = detail.optionPicker != null;
  const isSetupContextPicker = detail.setupContextPicker != null;

  const goToQuestion = (next: number) => {
    if (totalQuestions === 0) return;
    const clamped = Math.min(Math.max(next, 0), totalQuestions - 1);
    setQuestionIndex(clamped);
  };

  const questionHasRequiredAnswer = (
    question: PendingRequestQuestion,
    candidateAnswers: Record<string, string[]>,
  ) =>
    !question.required
    || (candidateAnswers[question.id] ?? question.defaultAnswers).some((answer) => answer.trim());
  const canSubmitWithAnswers = (candidateAnswers: Record<string, string[]>) =>
    detail.canAccept && detail.questions.every((question) => questionHasRequiredAnswer(question, candidateAnswers));
  const canRespondWithAnswers = (accepted: boolean, candidateAnswers: Record<string, string[]>) =>
    !accepted || canSubmitWithAnswers(candidateAnswers) || isNonSubmitOptionPickerAction(detail, candidateAnswers);
  const canSubmit = !responding && canSubmitWithAnswers(answers);
  const canAdvanceCurrentQuestion = !responding
    && detail.canAccept
    && currentQuestion != null
    && questionHasRequiredAnswer(currentQuestion, answers);
  const canUsePrimaryAction = hasMultipleQuestions && !isLastQuestion
    ? canAdvanceCurrentQuestion
    : canSubmit;

  const respond = (accepted: boolean, nextAnswers: Record<string, string[]> = answers) => {
    if (respondingRef.current) return;
    if (!canRespondWithAnswers(accepted, nextAnswers)) return;
    respondingRef.current = true;
    setResponding(true);
    const finishResponding = () => {
      respondingRef.current = false;
      setResponding(false);
    };
    if (accepted && detail.externalUrl && !externalUrlOpened) {
      void openExternalUrl(detail.externalUrl)
        .then(() => {
          setExternalUrlOpened(true);
          onLog?.("Opened link for pending request.", "info");
        })
        .catch((error: unknown) => {
          onLog?.(formatError(error), "error");
        })
        .finally(() => {
          finishResponding();
        });
      return;
    }
    try {
      const result = onRespond(request, accepted, accepted ? answerPayload(detail, nextAnswers) : undefined);
      if (isPromiseLike(result)) {
        void result
          .catch((error: unknown) => {
            onLog?.(formatError(error), "error");
          })
          .finally(() => {
            finishResponding();
          });
      } else {
        finishResponding();
      }
    } catch (error) {
      finishResponding();
      onLog?.(formatError(error), "error");
    }
  };

  const respondOptionPicker = (action: "submit" | "skip" | "dismiss", nextAnswers: Record<string, string[]> = answers) => {
    respond(true, { ...nextAnswers, [OPTION_PICKER_ACTION_QUESTION_ID]: [action] });
  };

  const respondSetupContextPicker = (action: "continue" | "skip" | "dismiss") => {
    respond(true, { ...answers, [SETUP_CONTEXT_ACTION_QUESTION_ID]: [action] });
  };

  const handleSingleSelectOption = (question: PendingRequestQuestion, value: string) => {
    const nextAnswers = { ...answers, [question.id]: [value] };
    setAnswers(nextAnswers);
    const action = pendingRequestOptionSelectionAction({ questionIndex, totalQuestions });
    if (action === "next") {
      goToQuestion(questionIndex + 1);
    } else if (action === "submit" && isOptionPicker && canSubmitWithAnswers(nextAnswers)) {
      respondOptionPicker("submit", nextAnswers);
    } else if (action === "submit" && canSubmitWithAnswers(nextAnswers)) {
      respond(true, nextAnswers);
    }
  };

  const handlePanelKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    if (event.defaultPrevented) return;
    if (respondingRef.current) return;
    if (event.key === "Escape") {
      event.preventDefault();
      if (isOptionPicker) {
        respondOptionPicker("dismiss");
      } else if (isSetupContextPicker) {
        respondSetupContextPicker("dismiss");
      } else {
        respond(false);
      }
      return;
    }
    if (hasMultipleQuestions && !isEditableEventTarget(event.target)
      && (event.key === "ArrowLeft" || event.key === "ArrowRight")) {
      event.preventDefault();
      goToQuestion(questionIndex + (event.key === "ArrowRight" ? 1 : -1));
      return;
    }
    const arrowSelection = pendingRequestOptionArrowSelection({
      key: event.key,
      question: currentQuestion,
      currentValue: currentQuestion ? answers[currentQuestion.id] ?? currentQuestion.defaultAnswers : [],
      responding: respondingRef.current,
      isEditableTarget: isEditableEventTarget(event.target),
    });
    if (arrowSelection) {
      event.preventDefault();
      if ("focusOther" in arrowSelection) {
        const textarea = event.currentTarget.querySelector<HTMLTextAreaElement>("[data-request-other-freeform]");
        textarea?.focus();
        return;
      }
      setAnswers((current) => ({ ...current, [arrowSelection.questionId]: [arrowSelection.value] }));
      return;
    }
    const shortcut = pendingRequestOptionShortcut({
      key: event.key,
      questions: currentQuestion ? [currentQuestion] : detail.questions,
      responding: respondingRef.current,
      isEditableTarget: isEditableEventTarget(event.target),
    });
    if (shortcut) {
      event.preventDefault();
      const nextAnswers = { ...answers, [shortcut.questionId]: [shortcut.value] };
      setAnswers(nextAnswers);
      const action = pendingRequestOptionSelectionAction({ questionIndex, totalQuestions });
      if (action === "next") {
        goToQuestion(questionIndex + 1);
      } else if (action === "submit" && isOptionPicker && canSubmitWithAnswers(nextAnswers)) {
        respondOptionPicker("submit", nextAnswers);
      } else if (action === "submit" && canSubmitWithAnswers(nextAnswers)) {
        respond(true, nextAnswers);
      }
      return;
    }
    if (pendingRequestShouldSubmitOnEnter({
      canSubmit: canUsePrimaryAction,
      isEditableTarget: isEditableEventTarget(event.target),
      key: event.key,
      responding,
      shiftKey: event.shiftKey,
    })) {
      event.preventDefault();
      if (!isLastQuestion && totalQuestions > 1) {
        goToQuestion(questionIndex + 1);
      } else if (isOptionPicker) {
        respondOptionPicker("submit");
      } else if (isSetupContextPicker) {
        respondSetupContextPicker("continue");
      } else {
        respond(true);
      }
    }
  };

  return {
    answers,
    canUsePrimaryAction,
    currentQuestion,
    detail,
    externalUrlOpened,
    hasMultipleQuestions,
    isLastQuestion,
    questionIndex,
    responding,
    setAnswers,
    totalQuestions,
    goToQuestion,
    handlePanelKeyDown,
    handleSingleSelectOption,
    respond,
    respondOptionPicker,
    respondSetupContextPicker,
  };
}

function defaultAnswers(question: PendingRequestQuestion): string[] {
  if (question.defaultAnswers.length > 0) return question.defaultAnswers;
  if (question.kind === "singleSelect" && question.options.length > 0) return [question.options[0].value];
  return [];
}

function answerPayload(
  detail: PendingRequestDetail,
  answers: Record<string, string[]>,
): Record<string, string[]> {
  const payload = Object.fromEntries(
    detail.questions.map((question) => [question.id, answers[question.id] ?? question.defaultAnswers]),
  );
  if (detail.optionPicker && answers[OPTION_PICKER_ACTION_QUESTION_ID]) {
    payload[OPTION_PICKER_ACTION_QUESTION_ID] = answers[OPTION_PICKER_ACTION_QUESTION_ID];
  }
  if (detail.setupContextPicker && answers[SETUP_CONTEXT_ACTION_QUESTION_ID]) {
    payload[SETUP_CONTEXT_ACTION_QUESTION_ID] = answers[SETUP_CONTEXT_ACTION_QUESTION_ID];
  }
  return payload;
}

function isNonSubmitOptionPickerAction(
  detail: PendingRequestDetail,
  answers: Record<string, string[]>,
): boolean {
  if (!detail.optionPicker) return false;
  const action = answers[OPTION_PICKER_ACTION_QUESTION_ID]?.[0];
  return action === "skip" || action === "dismiss";
}

function isEditableEventTarget(target: EventTarget | null): boolean {
  return target instanceof HTMLInputElement
    || target instanceof HTMLTextAreaElement
    || target instanceof HTMLSelectElement
    || target instanceof HTMLElement && target.isContentEditable;
}

function isPromiseLike(value: void | Promise<void>): value is Promise<void> {
  return Boolean(value && typeof value === "object" && typeof value.catch === "function");
}
