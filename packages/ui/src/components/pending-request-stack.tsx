import { ChevronRight } from "lucide-react";
import { useMemo, useRef, useState } from "react";
import { formatError } from "../lib/format";
import { openExternalUrl } from "../lib/tauri-host";
import { useHiCodexIntl } from "./i18n-provider";
import type { PendingServerRequest } from "../state/codex-reducer";
import {
  RequestBodyPreview,
  RequestDetailList,
  requestKind,
  requestPanelDetails,
  requestPanelTitle,
  type RequestKind,
} from "./pending-request-detail-preview";
import {
  OptionPickerField,
  QuestionField,
  SetupContextPickerBody,
} from "./pending-request-question-fields";
import { McpToolApprovalHeader } from "./mcp-tool-approval-preview";
import {
  OPTION_PICKER_ACTION_QUESTION_ID,
  SETUP_CONTEXT_ACTION_QUESTION_ID,
  pendingRequestDetail,
  type PendingRequestDetail,
  type PendingRequestQuestion,
} from "../state/approval-requests";

export type { PendingRequestDetail };
export { commandPreviewText, looksLikeCommandOrPath } from "./pending-request-command-preview";

export interface PendingRequestStackProps {
  pendingRequests: PendingServerRequest[];
  requestActors?: Record<string, string>;
  onRespond: (request: PendingServerRequest, accepted: boolean, answers?: Record<string, string[]>) => void | Promise<void>;
  onLog?: (text: string, level?: "info" | "warn" | "error") => void;
}

export interface ApprovalCardProps {
  actorLabel?: string;
  request: PendingServerRequest;
  onRespond: (request: PendingServerRequest, accepted: boolean, answers?: Record<string, string[]>) => void | Promise<void>;
  onLog?: (text: string, level?: "info" | "warn" | "error") => void;
}

export function PendingRequestStack({
  pendingRequests,
  requestActors = {},
  onRespond,
  onLog,
}: PendingRequestStackProps) {
  const { formatMessage } = useHiCodexIntl();
  return (
    <section
      className="hc-pending-stack"
      aria-label={formatMessage({ id: "hc.pendingRequest.regionLabel", defaultMessage: "Pending requests" })}
    >
      {pendingRequests.map((request) => (
        <ApprovalCard
          actorLabel={requestActors[String(request.id)]}
          key={String(request.id)}
          request={request}
          onRespond={onRespond}
          onLog={onLog}
        />
      ))}
    </section>
  );
}

export function ApprovalCard({
  actorLabel,
  request,
  onRespond,
  onLog,
}: ApprovalCardProps) {
  const { formatMessage } = useHiCodexIntl();
  const detail = useMemo(() => pendingRequestDetail(request), [request]);
  const [externalUrlOpened, setExternalUrlOpened] = useState(false);
  const [answers, setAnswers] = useState<Record<string, string[]>>(() =>
    Object.fromEntries(detail.questions.map((question) => [question.id, defaultAnswers(question)])),
  );
  const [responding, setResponding] = useState(false);
  const respondingRef = useRef(false);
  /*
   * CODEX-REF: pending-request-item-panel-*.js — the request-input panel tracks
   * a current step index in useState; derives hasMultipleQuestions (questions
   * length > 1), isLastQuestion, and a "1 of 3" progress label; and destructures
   * only the current question (question / options / isOther).
   * Codex 一次只渲染一道 question + 顶部 stepper（多 question 时）+ 数字键
   * 选 option 后自动 next-or-submit、左右箭头切换 question。HiCodex
   * 严格对齐 — 不再 map 全部 question 铺开。
   */
  const [questionIndex, setQuestionIndex] = useState(0);
  const totalQuestions = detail.questions.length;
  const hasMultipleQuestions = totalQuestions > 1;
  const isLastQuestion = questionIndex >= totalQuestions - 1;
  const currentQuestion = detail.questions[questionIndex] ?? null;
  const goToQuestion = (next: number) => {
    if (totalQuestions === 0) return;
    const clamped = Math.min(Math.max(next, 0), totalQuestions - 1);
    setQuestionIndex(clamped);
  };
  const canSubmitWithAnswers = (candidateAnswers: Record<string, string[]>) =>
    detail.canAccept && detail.questions.every((question) =>
      !question.required || (candidateAnswers[question.id] ?? question.defaultAnswers).some((answer) => answer.trim()),
    );
  const canRespondWithAnswers = (accepted: boolean, candidateAnswers: Record<string, string[]>) =>
    !accepted || canSubmitWithAnswers(candidateAnswers) || isNonSubmitOptionPickerAction(detail, candidateAnswers);
  const canSubmit = !responding && canSubmitWithAnswers(answers);

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
  const kind = requestKind(request.method);
  const requestKindForRender: RequestKind = detail.optionPicker
    ? "option-picker"
    : detail.setupContextPicker
      ? "setup-context-picker"
      : kind;
  /*
   * CODEX-REF: pending-request-item-panel-*.js — panel header:
   *   title container `flex min-w-0 flex-col gap-2`
   *     child `text-base font-medium` whose text is the outer header prop
   *     (when supplied) else the current question text
   *   row `flex items-start justify-between ... pt-4 pr-3 pb-2 pl-4`
   *     children = [title container, stepper] (stepper only when multi-question)
   * The Codex header does **not** render threadId / turnId / itemId / details /
   * body preview — only the current question title + stepper（多 question 时）。
   * HiCodex 之前对 user-input request 也塞了这些技术 ID，是 approval/command/mcp 等
   * 其他 request kind 的通用渲染冗余落到了 user-input。
   * (注释里避免嵌套 / star star /，TS/CSS 都不支持嵌套块注释。)
   *
   * 对 user-input：跳过 details 行和 RequestBodyPreview；panel-title 用当前
   * question.question 而非 questions[0]?.question（multi-question 时随 step 切换）。
   */
  const isUserInput = kind === "user-input";
  const isOptionPicker = detail.optionPicker != null;
  const isSetupContextPicker = detail.setupContextPicker != null;
  /*
   * CODEX-REF: pending-request-item-panel-*.js — single title source: outer
   * header prop falling back to the current question text. HiCodex 之前
   * panel-title 和 QuestionField heading 同时渲染同一份 question 文本造成重复。
   * 对齐方案：panel-title 显示 header 或 question（header 优先），
   * QuestionField 隐藏自己的 heading（通过 hideHeading prop）。
   */
  const panelTitle = isUserInput
    ? (currentQuestion?.header || currentQuestion?.question || requestPanelTitle(detail))
    : requestPanelTitle(detail);
  const details = isUserInput || isOptionPicker || isSetupContextPicker ? [] : requestPanelDetails(detail, request);
  const showBodyPreview = !isUserInput && !isOptionPicker && !isSetupContextPicker;
  const primaryLabel = detail.externalUrl && externalUrlOpened || hasMultipleQuestions && !isLastQuestion
    ? formatMessage({ id: "requestInputPanel.continue", defaultMessage: "Continue" })
    : detail.acceptLabel;
  const declineTitle = request.method.includes("requestUserInput")
    ? formatMessage({
        id: "hc.pendingRequest.declineUserInputTitle",
        defaultMessage: "Stops the running turn instead of submitting an empty answer.",
      })
    : undefined;

  return (
    <div
      className="hc-request-input-panel"
      data-request-kind={requestKindForRender}
      aria-busy={responding || undefined}
      tabIndex={0}
      onKeyDown={(event) => {
        /*
         * CODEX-REF: pending-request-item-panel-*.js — keyboard handler:
         *   - Escape → onEscapeDismiss
         *   - 1-9 → select option index N AND (multi-question ? next : submit)
         *   - ArrowLeft/ArrowRight (multi-question only) → step ±1
         *   - Enter (not in editable) → next-or-submit
         */
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
        // CODEX-REF: pending-request-item-panel-*.js — left/right 切换 question（仅 multi-question 时）
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
        // CODEX-REF: pending-request-item-panel-*.js — 数字键选 option, after which
        // it jumps to the next question or submits (when last). HiCodex 用当前
        // questionIndex 而不是 questions[0]。
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
          // Codex next-or-submit: not last → 跳下一题；is last → submit
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
          canSubmit,
          isEditableTarget: isEditableEventTarget(event.target),
          key: event.key,
          responding,
          shiftKey: event.shiftKey,
        })) {
          event.preventDefault();
          // CODEX-REF: pending-request-item-panel-*.js — Enter: 非最后一题跳 next，最后一题 submit
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
      }}
    >
      <div className="hc-request-panel-content">
        {actorLabel ? (
          <div className="hc-request-panel-actor">{actorLabel}</div>
        ) : null}
        {detail.mcpToolApproval ? <McpToolApprovalHeader approval={detail.mcpToolApproval} /> : null}
        <div className="hc-request-panel-title">{panelTitle}</div>
        {detail.setupContextPicker ? <SetupContextPickerBody picker={detail.setupContextPicker} /> : null}
        <RequestDetailList details={details} />
        {showBodyPreview && <RequestBodyPreview detail={detail} request={request} requestKind={kind} />}
      </div>
      {currentQuestion && (
        <div className="hc-request-questions">
          {/*
           * CODEX-REF: pending-request-item-panel-*.js — 顶部 header 容器
           *   `flex items-start justify-between border-token-border/70 pt-4 pr-3 pb-2 pl-4`
           * 左侧是 question title `text-base font-medium`，右侧（仅多 question 时）
           * 是 "← {step} of {total} →" 步进器。HiCodex 当前 QuestionField 内
           * 自带 heading（question.header + question.question），所以这里只在
           * multi-question 时补一个 stepper 显示进度。
           */}
          {hasMultipleQuestions && (
            <div className="hc-request-question-stepper" aria-live="polite">
              <button
                type="button"
                className="hc-request-question-stepper-nav"
                aria-label={formatMessage({ id: "hc.pendingRequest.previousQuestion", defaultMessage: "Previous question" })}
                disabled={responding || questionIndex === 0}
                onClick={() => goToQuestion(questionIndex - 1)}
              >
                <ChevronRight aria-hidden size={14} style={{ transform: "rotate(180deg)" }} />
              </button>
              <span className="hc-request-question-stepper-count">
                {formatMessage(
                  { id: "hc.pendingRequest.questionStep", defaultMessage: "{current} of {total}" },
                  { current: questionIndex + 1, total: totalQuestions },
                )}
              </span>
              <button
                type="button"
                className="hc-request-question-stepper-nav"
                aria-label={formatMessage({ id: "hc.pendingRequest.nextQuestion", defaultMessage: "Next question" })}
                disabled={responding || isLastQuestion}
                onClick={() => goToQuestion(questionIndex + 1)}
              >
                <ChevronRight aria-hidden size={14} />
              </button>
            </div>
          )}
          {detail.optionPicker ? (
            <OptionPickerField
              optionPicker={detail.optionPicker}
              question={currentQuestion}
              disabled={responding}
              value={answers[currentQuestion.id] ?? currentQuestion.defaultAnswers}
              onChange={(value) => setAnswers((current) => ({ ...current, [currentQuestion.id]: value }))}
              onSubmit={(value) => respondOptionPicker("submit", { ...answers, [currentQuestion.id]: value })}
            />
          ) : (
            <QuestionField
              key={currentQuestion.id}
              question={currentQuestion}
              index={questionIndex}
              disabled={responding}
              value={answers[currentQuestion.id] ?? currentQuestion.defaultAnswers}
              onChange={(value) => setAnswers((current) => ({ ...current, [currentQuestion.id]: value }))}
              onOptionSelect={(value) => handleSingleSelectOption(currentQuestion, value)}
              /*
               * CODEX-REF: pending-request-item-panel-*.js — panel 顶部 header 已经
               * 渲染 question 文本。隐藏 QuestionField 自带的 heading 避免与
               * panel-title 重复。如果 QuestionField 在非 user-input 场景被调用，
               * hideHeading 默认 false，保留原有渲染不影响其它 RequestKind。
               */
              hideHeading={isUserInput}
            />
          )}
        </div>
      )}
      {!detail.canAccept && detail.acceptDisabledReason && (
        <div className="hc-approval-disabled-note">{detail.acceptDisabledReason}</div>
      )}
      <div className="hc-request-panel-actions">
        <button
          type="button"
          className="hc-request-action ghost"
          disabled={responding}
          title={declineTitle}
          onClick={() => {
            if (isOptionPicker) {
              respondOptionPicker("skip");
            } else if (isSetupContextPicker) {
              respondSetupContextPicker("skip");
            } else {
              respond(false);
            }
          }}
        >
          <span>{detail.declineLabel}</span>
          {/* codex: requestInputPanel uses 'ESC' (uppercase); the general approval/browser path uses 'Esc'. */}
          {!isOptionPicker && !isSetupContextPicker && <kbd>{isUserInput ? "ESC" : "Esc"}</kbd>}
        </button>
        <button
          type="button"
          className="hc-request-action primary"
          autoFocus
          disabled={!canSubmit}
          title={!canSubmit ? detail.acceptDisabledReason : undefined}
          onClick={() => {
            if (isOptionPicker) {
              respondOptionPicker("submit");
            } else if (isSetupContextPicker) {
              respondSetupContextPicker("continue");
            } else {
              respond(true);
            }
          }}
        >
          <span>{primaryLabel}</span>
          {/* codex Enter chip = ⏎ (U+23CE RETURN SYMBOL), not ↵ (U+21B5) */}
          <kbd>⏎</kbd>
        </button>
      </div>
    </div>
  );
}

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
