import { ChevronRight } from "lucide-react";
import type { PendingServerRequest } from "../state/codex-reducer";
import { McpToolApprovalHeader } from "./mcp-tool-approval-preview";
import { usePendingRequestApprovalController } from "./pending-request-approval-controller";
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
import { useForgeIntl } from "./i18n-provider";

export interface ApprovalCardProps {
  actorLabel?: string;
  request: PendingServerRequest;
  onRespond: (request: PendingServerRequest, accepted: boolean, answers?: Record<string, string[]>) => void | Promise<void>;
  onLog?: (text: string, level?: "info" | "warn" | "error") => void;
}

export function ApprovalCard({
  actorLabel,
  request,
  onRespond,
  onLog,
}: ApprovalCardProps) {
  const { formatMessage } = useForgeIntl();
  const {
    answers,
    canUsePrimaryAction,
    currentQuestion,
    detail,
    externalUrlOpened,
    hasMultipleQuestions,
    handlePanelKeyDown,
    handleSingleSelectOption,
    isLastQuestion,
    questionIndex,
    responding,
    respond,
    respondOptionPicker,
    respondSetupContextPicker,
    setAnswers,
    goToQuestion,
    totalQuestions,
  } = usePendingRequestApprovalController({
    request,
    onRespond,
    onLog,
  });
  /*
   * CODEX-REF: pending-request-item-panel-*.js — the request-input panel tracks
   * a current step index in useState; derives hasMultipleQuestions (questions
   * length > 1), isLastQuestion, and a "1 of 3" progress label; and destructures
   * only the current question (question / options / isOther).
   * Codex 一次只渲染一道 question + 顶部 stepper（多 question 时）+ 数字键
   * 选 option 后自动 next-or-submit、左右箭头切换 question。Forge
   * 严格对齐 — 不再 map 全部 question 铺开。
   */
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
   * Forge 之前对 user-input request 也塞了这些技术 ID，是 approval/command/mcp 等
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
   * header prop falling back to the current question text. Forge 之前
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
      onKeyDown={handlePanelKeyDown}
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
           * 是 "← {step} of {total} →" 步进器。Forge 当前 QuestionField 内
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
          disabled={!canUsePrimaryAction}
          title={!canUsePrimaryAction ? detail.acceptDisabledReason : undefined}
          onClick={() => {
            // Mirror the Enter-key path (controller): on a multi-question form
            // the primary button reads "Continue" and must advance to the next
            // question, NOT submit the whole form — otherwise clicking it
            // silently answers every later question with its default.
            if (!isLastQuestion && totalQuestions > 1) {
              goToQuestion(questionIndex + 1);
            } else if (isOptionPicker) {
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
