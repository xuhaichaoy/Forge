import { AlertTriangle, ChevronRight } from "lucide-react";
import { useMemo, useRef, useState } from "react";
import { formatError } from "../lib/format";
import { openExternalUrl } from "../lib/tauri-host";
import { useHiCodexIntl } from "./i18n-provider";
import { useMeasuredTextCollapse } from "../hooks/use-measured-text-collapse";
import type { PendingServerRequest } from "../state/codex-reducer";
import {
  OPTION_PICKER_ACTION_QUESTION_ID,
  SETUP_CONTEXT_ACTION_QUESTION_ID,
  pendingRequestDetail,
  type PendingRequestDetail,
  type PendingRequestMcpToolApproval,
  type PendingRequestMcpToolParamEntry,
  type PendingRequestOptionPicker,
  type PendingRequestSetupContextPicker,
  type PendingRequestQuestion,
} from "../state/approval-requests";

export type { PendingRequestDetail };

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
        {details.length > 0 && (
          <div className="hc-request-panel-details">
            {details.map((item) => (
              <RequestDetailRow key={`${item.label}:${item.value}`} label={item.label}>
                {item.values
                  ? (
                    <span className="hc-request-detail-code-lines">
                      {item.values.map((path, index) => (
                        <code key={`${path}:${index}`}>{path}</code>
                      ))}
                    </span>
                  )
                  : item.code
                    ? <code>{item.value}</code>
                    : item.value}
              </RequestDetailRow>
            ))}
          </div>
        )}
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

interface RequestDetailItem {
  label: string;
  value: string;
  code?: boolean;
  // Codex renders each granted filesystem path on its own monospace line
  // (pending-request-item-panel On/kn). When set, render `values` as stacked
  // code lines instead of the single comma-joined `value`.
  values?: string[];
}

type RequestKind =
  | "command"
  | "file-change"
  | "user-input"
  | "option-picker"
  | "setup-context-picker"
  | "mcp"
  | "tool-call"
  | "permission"
  | "unknown";

function RequestDetailRow({ label, children }: { label: string; children: React.ReactNode }) {
  const { formatMessage } = useHiCodexIntl();
  // codex pending-request-item-panel localizes the structural row labels
  // (permissionRequest.network/fileRead/fileWrite/fileReadWrite). The describe*
  // layer keeps the English label as a parsing key; localize it for display here.
  const displayLabel =
    label === "Network" ? formatMessage({ id: "permissionRequest.network", defaultMessage: "Network" })
    : label === "Read" ? formatMessage({ id: "permissionRequest.fileRead", defaultMessage: "Read" })
    : label === "Write" ? formatMessage({ id: "permissionRequest.fileWrite", defaultMessage: "Write" })
    : label === "Read and write" ? formatMessage({ id: "permissionRequest.fileReadWrite", defaultMessage: "Read and write" })
    : label;
  return (
    <div className="hc-request-detail-row">
      <span>{displayLabel}</span>
      <span>{children}</span>
    </div>
  );
}

function requestPanelTitle(detail: PendingRequestDetail): string {
  // CODEX-REF: requestInputPanel.* — 用户输入请求无固定标题 id，面板标题取
  // 当前问题文本。requestUserInput 现以空 title 进入(见 approval-requests.ts)，
  // 此处对空标题回退到首个问题文本，与 Codex 一致。
  if (detail.title) return detail.title;
  return detail.questions[0]?.question || detail.title;
}

// Codex renders each granted filesystem path on its own monospace line
// (pending-request-item-panel `On` → `flex min-w-0 flex-col gap-0.5` stack of
// `kn` `font-mono leading-5` code lines), not a single comma-joined value.
function detailRowFromLabelValue(label: string, value: string): RequestDetailItem {
  const code = isTechnicalDetail(label, value);
  if ((label === "Read" || label === "Write" || label === "Read and write") && value.includes(", ")) {
    const values = value.split(", ").map((path) => path.trim()).filter(Boolean);
    if (values.length > 1) return { label, value, code, values };
  }
  return { label, value, code };
}

function requestPanelDetails(detail: PendingRequestDetail, request: PendingServerRequest): RequestDetailItem[] {
  const rows: RequestDetailItem[] = [];
  if (detail.reason) rows.push({ label: "Reason", value: detail.reason });
  if (detail.mcpToolApproval) return rows;
  for (const item of detail.metadata) {
    rows.push({ label: item.label, value: item.value, code: isTechnicalDetail(item.label, item.value) });
  }
  const kind = requestKind(request.method);
  if (kind === "command") {
    if (networkApprovalContext(request.params) && !detail.reason) {
      rows.push(...bodyLinesToDetailRows(detail.body, detail));
    }
    return rows;
  }
  if (kind === "file-change") return rows;
  for (const line of detail.body.split(/\r?\n/).map((value) => value.trim()).filter(Boolean)) {
    if (line === detail.title || line === detail.questions[0]?.question) continue;
    const [label, ...rest] = line.split(": ");
    if (rest.length > 0 && label.length <= 24) {
      rows.push(detailRowFromLabelValue(label, rest.join(": ")));
    } else {
      rows.push({ label: "Details", value: line, code: looksLikeCommandOrPath(line) });
    }
  }
  return rows;
}

function bodyLinesToDetailRows(detailBody: string, detail: PendingRequestDetail): RequestDetailItem[] {
  const rows: RequestDetailItem[] = [];
  for (const line of detailBody.split(/\r?\n/).map((value) => value.trim()).filter(Boolean)) {
    if (line === detail.title || line === detail.questions[0]?.question) continue;
    const [label, ...rest] = line.split(": ");
    if (rest.length > 0 && label.length <= 24) {
      rows.push(detailRowFromLabelValue(label, rest.join(": ")));
    } else {
      rows.push({ label: "Details", value: line, code: looksLikeCommandOrPath(line) });
    }
  }
  return rows;
}

function RequestBodyPreview({
  detail,
  request,
  requestKind,
}: {
  detail: PendingRequestDetail;
  request: PendingServerRequest;
  requestKind: RequestKind;
}) {
  const { formatMessage } = useHiCodexIntl();
  if (detail.mcpToolApproval) {
    return <McpToolApprovalParams approval={detail.mcpToolApproval} />;
  }
  if (requestKind === "command") {
    if (networkApprovalContext(request.params)) return null;
    return <CommandPreview text={commandPreviewText(request.params)} />;
  }
  if (requestKind === "file-change") {
    const paths = detail.body.split(/\r?\n/).map((line) => line.trim()).filter(Boolean);
    if (paths.length === 0 || paths.some((line) => line.startsWith("{") || line.startsWith("["))) return null;
    return (
      <div
        className="hc-request-file-preview"
        aria-label={formatMessage({ id: "hc.pendingRequest.requestedFileChanges", defaultMessage: "Requested file changes" })}
      >
        {paths.map((path) => (
          <code key={path}>{path}</code>
        ))}
      </div>
    );
  }
  return null;
}

const MCP_TOOL_PARAM_PREVIEW_LIMIT = 4;

function McpToolApprovalHeader({ approval }: { approval: PendingRequestMcpToolApproval }) {
  const { formatMessage } = useHiCodexIntl();
  const isHighRisk = approval.riskLevel === "high";
  if (isHighRisk) {
    return (
      <div className="hc-mcp-tool-approval-header warning">
        <AlertTriangle aria-hidden size={14} />
        <span>{formatMessage({ id: "composer.mcpToolCallApproval.elevatedRiskLabel", defaultMessage: "Elevated Risk" })}</span>
      </div>
    );
  }
  return (
    <div className="hc-mcp-tool-approval-header">
      <span className="hc-mcp-tool-approval-connector-dot" aria-hidden="true" />
      <span>{approval.connectorName}</span>
    </div>
  );
}

function McpToolApprovalParams({ approval }: { approval: PendingRequestMcpToolApproval }) {
  const { formatMessage } = useHiCodexIntl();
  const [showAll, setShowAll] = useState(false);
  const [expanded, setExpanded] = useState<Record<string, boolean>>({});
  const entries = approval.toolParamEntries;
  if (entries.length === 0) return null;
  const visibleEntries = showAll ? entries : entries.slice(0, MCP_TOOL_PARAM_PREVIEW_LIMIT);
  const hiddenCount = entries.length - visibleEntries.length;
  return (
    <div
      className="hc-mcp-tool-approval-params"
      aria-label={formatMessage({ id: "hc.pendingRequest.toolParameters", defaultMessage: "Tool parameters" })}
    >
      {visibleEntries.map((entry) => {
        const key = entry.name;
        return (
          <McpToolParamRow
            key={key}
            entry={entry}
            expanded={expanded[key] === true}
            onToggle={() => setExpanded((current) => ({ ...current, [key]: current[key] !== true }))}
          />
        );
      })}
      {hiddenCount > 0 ? (
        <button
          type="button"
          className="hc-mcp-tool-param-toggle-list"
          onClick={() => setShowAll(true)}
        >
          <span>
            {formatMessage(
              { id: "composer.mcpToolCallApproval.toolParam.more", defaultMessage: "Show {count} more items" },
              { count: hiddenCount },
            )}
          </span>
          <ChevronRight aria-hidden size={12} />
        </button>
      ) : null}
      {showAll && entries.length > MCP_TOOL_PARAM_PREVIEW_LIMIT ? (
        <button
          type="button"
          className="hc-mcp-tool-param-toggle-list"
          onClick={() => setShowAll(false)}
        >
          <span>{formatMessage({ id: "composer.mcpToolCallApproval.toolParam.less", defaultMessage: "Show fewer items" })}</span>
          <ChevronRight aria-hidden className="hc-mcp-tool-param-chevron-up" size={12} />
        </button>
      ) : null}
    </div>
  );
}

function McpToolParamRow({
  entry,
  expanded,
  onToggle,
}: {
  entry: PendingRequestMcpToolParamEntry;
  expanded: boolean;
  onToggle: () => void;
}) {
  const { formatMessage } = useHiCodexIntl();
  const value = expanded ? entry.expandedText : entry.previewText;
  const toggleAction = expanded
    ? formatMessage({ id: "composer.mcpToolCallApproval.toolParam.collapse", defaultMessage: "Collapse" })
    : formatMessage({ id: "composer.mcpToolCallApproval.toolParam.expand", defaultMessage: "Expand" });
  const valueClass = [
    "hc-mcp-tool-param-value",
    entry.displayKind === "json" ? "json" : "text",
    entry.isExpandable && !expanded ? "collapsed" : "",
  ].filter(Boolean).join(" ");
  return (
    <div className="hc-mcp-tool-param-row">
      <div className="hc-mcp-tool-param-label">{entry.label}</div>
      <div className="hc-mcp-tool-param-content">
        <div className={valueClass} data-expanded={expanded || undefined}>
          {value}
        </div>
        {entry.isExpandable ? (
          <button
            type="button"
            className="hc-mcp-tool-param-toggle"
            aria-expanded={expanded}
            aria-label={formatMessage(
              { id: "composer.mcpToolCallApproval.toolParam.toggle", defaultMessage: "{action} {label}" },
              { action: toggleAction, label: entry.label },
            )}
            onClick={onToggle}
          >
            <span>{toggleAction}</span>
            <ChevronRight
              aria-hidden
              className={expanded ? "hc-mcp-tool-param-chevron-up" : undefined}
              size={12}
            />
          </button>
        ) : null}
      </div>
    </div>
  );
}

// CODEX-REF: composer-*.js — command-preview renderer.
// Codex 渲染：<div min-h-0 overflow-y-auto px-2 pt-2 pb-2 font-mono font-medium>
//   <span block break-words whitespace-pre-wrap style={line-clamp 3}>{cmd}</span></div>
// + 独立 footer <div flex shrink-0 justify-end p-1><button>{展开/收起}</button></div>
// HiCodex 这里改用 useMeasuredTextCollapse 三态 hook：靠 ResizeObserver 测真实
// 文本高度而不是用启发式行数/字数；展开后是内层容器滚动而非把卡片撑高。
function CommandPreview({ text }: { text: string }) {
  const { formatMessage } = useHiCodexIntl();
  const { ref, state, toggle } = useMeasuredTextCollapse<HTMLSpanElement>(3);
  const isExpanded = state === "expanded";
  const isCollapsed = state === "collapsed";
  const showToggle = state !== "uncollapsible";
  return (
    <div className="hc-request-command-preview" data-expanded={isExpanded}>
      <div className="hc-request-command-preview-content">
        <span
          ref={ref}
          className="hc-request-command-preview-text"
          data-collapsed={isCollapsed}
        >
          {text}
        </span>
      </div>
      {showToggle && (
        <div className="hc-request-command-preview-footer">
          <button
            type="button"
            className="hc-request-command-preview-toggle"
            onClick={toggle}
          >
            {isExpanded
              ? formatMessage({ id: "composer.mcpToolCallApproval.toolParam.collapse", defaultMessage: "Collapse" })
              : formatMessage({ id: "composer.mcpToolCallApproval.toolParam.expand", defaultMessage: "Expand" })}
          </button>
        </div>
      )}
    </div>
  );
}

// CODEX-REF: composer-*.js — command-preview renderer.
// Codex 直接把 cmd 的 raw text 交给 <span whitespace-pre-wrap> 渲染，靠 CSS 真实换行；
// 对于 `bash -lc <heredoc>` 这种结构，HiCodex 特判 cmd[2]，避免被 join(" ") 拼成单行字符串
// 后 heredoc 里的 "\n" 显示成转义符。其它形式继续 join(" ")。
function bashShellScriptText(command: readonly unknown[]): string | null {
  if (command.length !== 3) return null;
  const head = command[0];
  const flag = command[1];
  const body = command[2];
  if (typeof head !== "string" || typeof flag !== "string" || typeof body !== "string") return null;
  if (!/^(bash|sh|zsh)$/.test(head)) return null;
  if (!/^-l?c$/.test(flag)) return null;
  return body;
}

export function commandPreviewText(params: unknown): string {
  const command = params && typeof params === "object"
    ? (params as Record<string, unknown>).command ?? (params as Record<string, unknown>).cmd
    : null;
  if (Array.isArray(command)) {
    const shellScript = bashShellScriptText(command);
    if (shellScript !== null) return shellScript;
    return command.map((part) => String(part)).join(" ");
  }
  return typeof command === "string" && command.trim().length > 0 ? command : "command";
}

function networkApprovalContext(params: unknown): Record<string, unknown> | null {
  if (!params || typeof params !== "object" || Array.isArray(params)) return null;
  const network = (params as Record<string, unknown>).networkApprovalContext;
  return network && typeof network === "object" && !Array.isArray(network)
    ? network as Record<string, unknown>
    : null;
}

function isTechnicalDetail(label: string, value: string): boolean {
  return /cwd|thread|turn|item|request|url|path|root|namespace|tool|call|argument|parameter|server|connector/i.test(label)
    || looksLikeCommandOrPath(value);
}

export function looksLikeCommandOrPath(value: string): boolean {
  const trimmed = value.trim();
  if (!trimmed) return false;
  if (/^(?:\/|\.\/|\.\.\/|~\/|[A-Za-z]:[\\/])/.test(trimmed)) return true;
  if (/^[a-z][a-z0-9+.-]*:\/\//i.test(trimmed)) return true;
  const [first = ""] = trimmed.split(/\s+/);
  if (COMMON_SHELL_COMMANDS.has(first)) return true;
  if (/^(?:[./~\w-]+\/)+[\w.-]+$/.test(first)) return true;
  return /^[\w.-]+\.(?:[cm]?[jt]sx?|json|md|css|scss|html|rs|go|py|rb|php|java|kt|swift|toml|ya?ml|lock|sh|zsh|bash|sql|txt)$/.test(first);
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

const COMMON_SHELL_COMMANDS = new Set([
  "awk",
  "bun",
  "cargo",
  "cat",
  "chmod",
  "chown",
  "cmake",
  "cp",
  "curl",
  "deno",
  "docker",
  "find",
  "git",
  "go",
  "grep",
  "jq",
  "ls",
  "make",
  "mkdir",
  "mv",
  "node",
  "npm",
  "npx",
  "open",
  "osascript",
  "pnpm",
  "python",
  "python3",
  "rg",
  "rm",
  "rustc",
  "sed",
  "tar",
  "tsc",
  "unzip",
  "vite",
  "yarn",
  "zip",
]);

function requestKind(method: string): RequestKind {
  if (method.includes("commandExecution") || method === "execCommandApproval") return "command";
  if (method.includes("fileChange") || method === "applyPatchApproval") return "file-change";
  if (method.includes("requestUserInput") || method.includes("requestImplementation")) return "user-input";
  if (method.includes("requestOptionPicker")) return "option-picker";
  if (method.includes("requestSetupCodexContextPicker")) return "setup-context-picker";
  if (method.includes("elicitation")) return "mcp";
  if (method === "item/tool/call") return "tool-call";
  if (method.includes("permissions")) return "permission";
  return "unknown";
}

function QuestionField({
  question,
  index,
  disabled,
  value,
  onChange,
  onOptionSelect,
  hideHeading = false,
}: {
  question: PendingRequestQuestion;
  index: number;
  disabled: boolean;
  value: string[];
  onChange: (value: string[]) => void;
  onOptionSelect?: (value: string) => void;
  /*
   * CODEX-REF: pending-request-item-panel-*.js — 顶部 panel header 已经显示
   * question 文本，QuestionField 自带 heading 与之重复。caller
   * (`ApprovalCard` user-input 分支) 传 `hideHeading=true` 让 QuestionField
   * 跳过 `.hc-request-question-heading` 渲染。
   */
  hideHeading?: boolean;
}) {
  const { formatMessage } = useHiCodexIntl();
  const currentValue = value[0] ?? "";
  /*
   * CODEX-REF: pending-request-item-panel-*.js — question field render modes,
   * keyed on isOther and whether the question has options:
   *   isOther && hasOptions  → options + freeform textarea 并存
   *   isOther && !hasOptions → freeform textarea only
   *   !isOther && hasOptions → options only (radio)
   * 选中 option 与 freeform 互斥（选 option 清除 freeform，改 textarea 清除
   * selectedOptionId）。HiCodex 用单维 string[] 表达答案：当 value 命中某 option
   * 时视为 selected；否则视为 freeform。
   */
  const isOther = question.isOther === true;
  const selectedOptionValue = question.options.find((o) => o.value === currentValue)?.value;
  const freeformValue = isOther && selectedOptionValue == null ? currentValue : "";
  return (
    <div className="hc-request-question">
      {!hideHeading && (
        <div className="hc-request-question-heading">
          <span>{question.header}</span>
          <small>{question.question}</small>
        </div>
      )}
      {question.kind === "multiSelect" ? (
        <div className="hc-request-options multi">
          {question.options.map((option, optionIndex) => {
            const selected = value.includes(option.value);
            return (
              <label className="hc-request-option-row checkbox" data-selected={selected} key={option.value}>
                <span className="hc-request-option-index">{optionIndex + 1}.</span>
                <input
                  type="checkbox"
                  disabled={disabled}
                  checked={selected}
                  onChange={() => onChange(
                    selected ? value.filter((item) => item !== option.value) : [...value, option.value],
                  )}
                />
                <OptionCopy option={option} />
              </label>
            );
          })}
        </div>
      ) : question.options.length > 0 ? (
        <>
          <div className="hc-request-options" role="radiogroup" aria-label={question.header}>
            {question.options.map((option, optionIndex) => {
              const selected = selectedOptionValue === option.value;
              return (
                <button
                  type="button"
                  className="hc-request-option-row"
                  data-selected={selected}
                  role="radio"
                  aria-checked={selected}
                  disabled={disabled}
                  key={option.value}
                  aria-label={option.ariaLabel}
                  onClick={() => {
                    if (onOptionSelect) {
                      onOptionSelect(option.value);
                    } else {
                      onChange([option.value]);
                    }
                  }}
                >
                  <span className="hc-request-option-index">{optionIndex + 1}.</span>
                  <OptionCopy option={option} />
                </button>
              );
            })}
          </div>
          {isOther && (
            /*
             * CODEX-REF: pending-request-item-panel-*.js — when isOther && hasOptions,
             * options 后追加 freeform input。
             * Codex placeholder i18n: `requestInputPanel.otherPlaceholder`
             * = "No, and tell Codex what to do differently"。HiCodex 用通用兜底。
             * 输入时清除 selected option（用 freeform 替代）。
             */
          <div className="hc-request-inline-freeform hc-request-other-freeform">
              <textarea
                data-request-other-freeform="true"
                value={freeformValue}
                placeholder={formatMessage({ id: "requestInputPanel.otherPlaceholder", defaultMessage: "No, and tell Codex what to do differently" })}
                rows={1}
                disabled={disabled}
                onChange={(event) => onChange(event.target.value.length > 0 ? [event.target.value] : [])}
              />
            </div>
          )}
        </>
      ) : question.kind === "textarea" ? (
        <div className="hc-request-inline-freeform">
          <span>{index + 1}.</span>
          <textarea
            value={currentValue}
            placeholder={formatMessage({ id: "requestInputPanel.freeFormPlaceholder", defaultMessage: "Type here" })}
            rows={1}
            disabled={disabled}
            onChange={(event) => onChange([event.target.value])}
          />
        </div>
      ) : (
        <div className="hc-request-inline-freeform">
          <span>{index + 1}.</span>
          <input
            type={question.kind === "password" ? "password" : question.kind === "number" ? "number" : "text"}
            value={currentValue}
            placeholder={formatMessage({ id: "requestInputPanel.freeFormPlaceholder", defaultMessage: "Type here" })}
            disabled={disabled}
            onChange={(event) => onChange([event.target.value])}
          />
        </div>
      )}
    </div>
  );
}

function OptionPickerField({
  optionPicker,
  question,
  disabled,
  value,
  onChange,
  onSubmit,
}: {
  optionPicker: PendingRequestOptionPicker;
  question: PendingRequestQuestion;
  disabled: boolean;
  value: string[];
  onChange: (value: string[]) => void;
  onSubmit: (value: string[]) => void;
}) {
  const { formatMessage } = useHiCodexIntl();
  const optionValues = new Set(question.options.map((option) => option.value));
  const freeformValue = value.find((item) => !optionValues.has(item)) ?? "";
  const selectedValues = value.filter((item) => optionValues.has(item));
  const currentSelectedValues = optionPicker.allowMultiple ? selectedValues : selectedValues.slice(0, 1);
  const pickerValue = (selected: string[], freeform: string) => (
    freeform.length > 0 ? [...selected, freeform] : selected
  );
  const toggleOption = (optionValue: string) => {
    const selected = selectedValues.includes(optionValue);
    if (optionPicker.allowMultiple) {
      onChange(selected
        ? value.filter((item) => item !== optionValue)
        : [...value.filter((item) => item !== optionValue || !optionValues.has(item)), optionValue]);
      return;
    }
    onChange(pickerValue([optionValue], freeformValue));
  };
  const changeFreeform = (text: string) => {
    onChange(pickerValue(currentSelectedValues, text));
  };
  /*
   * CODEX-REF: pending-request-item-panel-DZ77s3cA.pretty.js `un` —
   * optionPicker is a dedicated form: rounded option pills (`role` radio or
   * checkbox), an inline "Something else" input, Skip ghost button, and a
   * primary Submit button returning { action, selectedOptions, freeformAnswer }.
   */
  return (
    <div className="hc-option-picker">
      <div className="hc-option-picker-options" role={optionPicker.allowMultiple ? "group" : "radiogroup"} aria-label={question.question}>
        {question.options.map((option) => {
          const selected = selectedValues.includes(option.value);
          return (
            <button
              key={option.value}
              type="button"
              className="hc-option-picker-pill"
              role={optionPicker.allowMultiple ? "checkbox" : "radio"}
              aria-checked={selected}
              data-selected={selected || undefined}
              disabled={disabled}
              onClick={() => toggleOption(option.value)}
              title={option.description || undefined}
            >
              {option.label}
            </button>
          );
        })}
        <input
          className="hc-option-picker-freeform"
          data-request-other-freeform="true"
          value={freeformValue}
          placeholder={formatMessage({ id: "optionPickerRequest.freeformPlaceholder", defaultMessage: "Something else" })}
          disabled={disabled}
          onChange={(event) => changeFreeform(event.currentTarget.value)}
          onKeyDown={(event) => {
            if (event.key === "Enter") {
              event.preventDefault();
              onSubmit(pickerValue(currentSelectedValues, event.currentTarget.value));
            }
          }}
        />
      </div>
    </div>
  );
}

function SetupContextPickerBody({ picker }: { picker: PendingRequestSetupContextPicker }) {
  /*
   * CODEX-REF: pending-request-item-panel-DZ77s3cA.pretty.js `Pn` —
   * setup context picker can always Dismiss, Skip, or Continue with
   * `{ action, selectedSources }`. HiCodex intentionally keeps source
   * selection empty until the app/plugin/OAuth/folder host flows exist.
   */
  void picker;
  return null;
}

function OptionCopy({ option }: { option: PendingRequestQuestion["options"][number] }) {
  const codePreview = option.codePreview?.trim() ?? "";
  const codeLayout = codePreview.includes("\n") || codePreview.includes("\r") ? "block" : "inline";
  return (
    <span className="hc-request-option-copy">
      <strong data-has-code={codePreview ? true : undefined} data-code-layout={codePreview ? codeLayout : undefined}>
        <span className="hc-request-option-label-text">{option.label}</span>
        {codePreview && (
          <code className="hc-request-option-code" title={codePreview}>
            {codePreview}
          </code>
        )}
      </strong>
      {/* codex: approval/option rows are a single bold label line — the option's
          `description` is i18n/metadata (or a hover tooltip in the optionPicker
          path), NEVER an always-visible inline subline. So HiCodex no longer
          renders it as `<small>` subtext. */}
    </span>
  );
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
