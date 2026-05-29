import { ChevronRight } from "lucide-react";
import { useMemo, useRef, useState } from "react";
import { formatError } from "../lib/format";
import { openExternalUrl } from "../lib/tauri-host";
import { useMeasuredTextCollapse } from "../hooks/use-measured-text-collapse";
import type { PendingServerRequest } from "../state/codex-reducer";
import {
  pendingRequestDetail,
  type PendingRequestDetail,
  type PendingRequestQuestion,
} from "../state/approval-requests";

export type { PendingRequestDetail };

export interface PendingRequestStackProps {
  pendingRequests: PendingServerRequest[];
  onRespond: (request: PendingServerRequest, accepted: boolean, answers?: Record<string, string[]>) => void | Promise<void>;
  onLog?: (text: string, level?: "info" | "warn" | "error") => void;
}

export interface ApprovalCardProps {
  request: PendingServerRequest;
  onRespond: (request: PendingServerRequest, accepted: boolean, answers?: Record<string, string[]>) => void | Promise<void>;
  onLog?: (text: string, level?: "info" | "warn" | "error") => void;
}

export function PendingRequestStack({
  pendingRequests,
  onRespond,
  onLog,
}: PendingRequestStackProps) {
  return (
    <section className="hc-pending-stack" aria-label="Pending requests">
      {pendingRequests.map((request) => (
        <ApprovalCard
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
  request,
  onRespond,
  onLog,
}: ApprovalCardProps) {
  const detail = useMemo(() => pendingRequestDetail(request), [request]);
  const [externalUrlOpened, setExternalUrlOpened] = useState(false);
  const [answers, setAnswers] = useState<Record<string, string[]>>(() =>
    Object.fromEntries(detail.questions.map((question) => [question.id, defaultAnswers(question)])),
  );
  const [responding, setResponding] = useState(false);
  const respondingRef = useRef(false);
  /*
   * CODEX-REF: pending-request-item-panel-DVOSLvQ1.js function `en`
   *   let [y, b] = useState(0);                        // current step index
   *   let z = a.length > 1;                            // hasMultipleQuestions
   *   let H = y >= a.length - 1;                       // isLastQuestion
   *   let te = `${y+1} of ${a.length}`;                // "1 of 3" progress
   *   let {question:U, options:W, isOther:ne} = a[y];  // current question only
   * Codex 一次只渲染一道 question + 顶部 stepper（多 question 时）+ 数字键
   * 选 option 后自动 next-or-submit (Pe)、左右箭头切换 question (we)。HiCodex
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
  const canSubmit = !responding && canSubmitWithAnswers(answers);

  const respond = (accepted: boolean, nextAnswers: Record<string, string[]> = answers) => {
    if (respondingRef.current) return;
    if (accepted && !canSubmitWithAnswers(nextAnswers)) return;
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
  const kind = requestKind(request.method);
  /*
   * CODEX-REF: pending-request-item-panel-DVOSLvQ1.js function `en` 顶部 header:
   *   We = div.className "flex min-w-0 flex-col gap-2"
   *        children = div.className "text-base font-medium" with text G
   *        where G = r (外层 header prop) || U (a[y].question)
   *   qe = div.className "flex items-start justify-between ... pt-4 pr-3 pb-2 pl-4"
   *        children = [We, Ke]
   *        where Ke is the stepper (rendered only when multi-question)
   * Codex `en` header **不渲染** threadId / turnId / itemId / details / body
   * preview——只显示当前 question title + stepper（多 question 时）。HiCodex
   * 之前对 user-input request 也塞了这些技术 ID，是 approval/command/mcp 等
   * 其他 request kind 的通用渲染冗余落到了 user-input。
   * (注释里避免嵌套 / star star /，TS/CSS 都不支持嵌套块注释。)
   *
   * 对 user-input：跳过 details 行和 RequestBodyPreview；panel-title 用当前
   * question.question 而非 questions[0]?.question（multi-question 时随 step 切换）。
   */
  const isUserInput = kind === "user-input";
  /*
   * CODEX-REF: en `G = r || U`（r=外层 header prop, U=a[y].question）—— 单一标题
   * 来源。HiCodex 之前 panel-title 和 QuestionField heading 同时渲染同一份 question
   * 文本造成重复。对齐方案：panel-title 显示 header 或 question（header 优先），
   * QuestionField 隐藏自己的 heading（通过 hideHeading prop）。
   */
  const panelTitle = isUserInput
    ? (currentQuestion?.header || currentQuestion?.question || requestPanelTitle(detail))
    : requestPanelTitle(detail);
  const details = isUserInput ? [] : requestPanelDetails(detail, request);
  const showBodyPreview = !isUserInput;
  const primaryLabel = detail.externalUrl && externalUrlOpened ? "Continue" : detail.acceptLabel;
  const declineTitle = kind === "user-input"
    ? "Stops the running turn instead of submitting an empty answer."
    : undefined;

  return (
    <div
      className="hc-request-input-panel"
      data-request-kind={kind}
      aria-busy={responding || undefined}
      tabIndex={0}
      onKeyDown={(event) => {
        /*
         * CODEX-REF: en `Ie` keyboard handler —
         *   - Escape → onEscapeDismiss
         *   - 1-9 → select option index N AND (z ? next : submit)
         *   - ArrowLeft/ArrowRight (multi-question only) → we(y±1)
         *   - Enter (not in editable) → next-or-submit
         */
        if (event.defaultPrevented) return;
        if (respondingRef.current) return;
        if (event.key === "Escape") {
          event.preventDefault();
          respond(false);
          return;
        }
        // CODEX-REF: en — left/right 切换 question（仅 multi-question 时）
        if (hasMultipleQuestions && !isEditableEventTarget(event.target)
          && (event.key === "ArrowLeft" || event.key === "ArrowRight")) {
          event.preventDefault();
          goToQuestion(questionIndex + (event.key === "ArrowRight" ? 1 : -1));
          return;
        }
        // CODEX-REF: en — 数字键选 option after which Pe({nextAnswers}) jumps
        // to next question or submits (when last). HiCodex 用当前 questionIndex
        // 而不是 questions[0]。
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
          // Codex Pe: not last → 跳下一题；is last → submit
          if (!isLastQuestion) {
            goToQuestion(questionIndex + 1);
          } else if (canSubmitWithAnswers(nextAnswers)) {
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
          // CODEX-REF: en Enter — 非最后一题跳 next，最后一题 submit
          if (!isLastQuestion && totalQuestions > 1) {
            goToQuestion(questionIndex + 1);
          } else {
            respond(true);
          }
        }
      }}
    >
      <div className="hc-request-panel-content">
        <div className="hc-request-panel-title">{panelTitle}</div>
        {details.length > 0 && (
          <div className="hc-request-panel-details">
            {details.map((item) => (
              <RequestDetailRow key={`${item.label}:${item.value}`} label={item.label}>
                {item.code ? <code>{item.value}</code> : item.value}
              </RequestDetailRow>
            ))}
          </div>
        )}
        {showBodyPreview && <RequestBodyPreview detail={detail} request={request} requestKind={kind} />}
      </div>
      {currentQuestion && (
        <div className="hc-request-questions">
          {/*
           * CODEX-REF: en — 顶部 header 容器
           *   `flex items-start justify-between border-token-border/70 pt-4 pr-3 pb-2 pl-4`
           * 左侧是 question title `text-base font-medium`，右侧（仅多 question 时）
           * 是 "← {y+1} of {a.length} →" 步进器。HiCodex 当前 QuestionField 内
           * 自带 heading（question.header + question.question），所以这里只在
           * multi-question 时补一个 stepper 显示进度。
           */}
          {hasMultipleQuestions && (
            <div className="hc-request-question-stepper" aria-live="polite">
              <button
                type="button"
                className="hc-request-question-stepper-nav"
                aria-label="Previous question"
                disabled={responding || questionIndex === 0}
                onClick={() => goToQuestion(questionIndex - 1)}
              >
                <ChevronRight aria-hidden size={14} style={{ transform: "rotate(180deg)" }} />
              </button>
              <span className="hc-request-question-stepper-count">
                {questionIndex + 1} of {totalQuestions}
              </span>
              <button
                type="button"
                className="hc-request-question-stepper-nav"
                aria-label="Next question"
                disabled={responding || isLastQuestion}
                onClick={() => goToQuestion(questionIndex + 1)}
              >
                <ChevronRight aria-hidden size={14} />
              </button>
            </div>
          )}
          <QuestionField
            key={currentQuestion.id}
            question={currentQuestion}
            index={questionIndex}
            disabled={responding}
            value={answers[currentQuestion.id] ?? currentQuestion.defaultAnswers}
            onChange={(value) => setAnswers((current) => ({ ...current, [currentQuestion.id]: value }))}
            /*
             * CODEX-REF: en — panel 顶部 header 已经渲染 question 文本（G）。
             * 隐藏 QuestionField 自带的 heading 避免与 panel-title 重复。如果
             * QuestionField 在非 user-input 场景被调用，hideHeading 默认 false，
             * 保留原有渲染不影响其它 RequestKind。
             */
            hideHeading={isUserInput}
          />
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
          onClick={() => respond(false)}
        >
          <span>{detail.declineLabel}</span>
          <kbd>Esc</kbd>
        </button>
        <button
          type="button"
          className="hc-request-action primary"
          autoFocus
          disabled={!canSubmit}
          title={!canSubmit ? detail.acceptDisabledReason : undefined}
          onClick={() => respond(true)}
        >
          <span>{primaryLabel}</span>
          <kbd>↵</kbd>
        </button>
      </div>
    </div>
  );
}

interface RequestDetailItem {
  label: string;
  value: string;
  code?: boolean;
}

type RequestKind =
  | "command"
  | "file-change"
  | "user-input"
  | "mcp"
  | "tool-call"
  | "permission"
  | "unknown";

function RequestDetailRow({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="hc-request-detail-row">
      <span>{label}</span>
      <span>{children}</span>
    </div>
  );
}

function requestPanelTitle(detail: PendingRequestDetail): string {
  if (detail.title !== "Codex needs input") return detail.title;
  return detail.questions[0]?.question || detail.title;
}

function requestPanelDetails(detail: PendingRequestDetail, request: PendingServerRequest): RequestDetailItem[] {
  const rows: RequestDetailItem[] = [];
  if (detail.reason) rows.push({ label: "Reason", value: detail.reason });
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
      rows.push({ label, value: rest.join(": "), code: isTechnicalDetail(label, rest.join(": ")) });
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
      rows.push({ label, value: rest.join(": "), code: isTechnicalDetail(label, rest.join(": ")) });
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
  if (requestKind === "command") {
    if (networkApprovalContext(request.params)) return null;
    return <CommandPreview text={commandPreviewText(request.params)} />;
  }
  if (requestKind === "file-change") {
    const paths = detail.body.split(/\r?\n/).map((line) => line.trim()).filter(Boolean);
    if (paths.length === 0 || paths.some((line) => line.startsWith("{") || line.startsWith("["))) return null;
    return (
      <div className="hc-request-file-preview" aria-label="Requested file changes">
        {paths.map((path) => (
          <code key={path}>{path}</code>
        ))}
      </div>
    );
  }
  return null;
}

// CODEX-REF: /tmp/codex_asar_extract/webview/assets/composer-DXaiOlFj.js — lW(e)
// Codex 渲染：<div min-h-0 overflow-y-auto px-2 pt-2 pb-2 font-mono font-medium>
//   <span block break-words whitespace-pre-wrap style={ZU /* line-clamp 3 */}>{cmd}</span></div>
// + 独立 footer <div flex shrink-0 justify-end p-1><Ya>{展开/收起}</Ya></div>
// HiCodex 这里改用 useMeasuredTextCollapse 三态 hook：靠 ResizeObserver 测真实
// 文本高度而不是用启发式行数/字数；展开后是内层容器滚动而非把卡片撑高。
function CommandPreview({ text }: { text: string }) {
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
            {isExpanded ? "Collapse" : "Expand"}
          </button>
        </div>
      )}
    </div>
  );
}

// CODEX-REF: /tmp/codex_asar_extract/webview/assets/composer-DXaiOlFj.js — lW
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
  if (method.includes("requestUserInput")) return "user-input";
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
  hideHeading = false,
}: {
  question: PendingRequestQuestion;
  index: number;
  disabled: boolean;
  value: string[];
  onChange: (value: string[]) => void;
  /*
   * CODEX-REF: en — 顶部 panel header 已经显示 question 文本，QuestionField 自带
   * heading 与之重复。caller (`ApprovalCard` user-input 分支) 传 `hideHeading=true`
   * 让 QuestionField 跳过 `.hc-request-question-heading` 渲染。
   */
  hideHeading?: boolean;
}) {
  const currentValue = value[0] ?? "";
  /*
   * CODEX-REF: pending-request-item-panel-DVOSLvQ1.js function `en`
   *   let K = ne === !0;  // isOther
   *   let q = W.length > 0;  // 有 options
   *   // K && q  → options + freeform textarea 并存
   *   // K && !q → freeform textarea only
   *   // !K && q → options only (radio)
   * 选中 option 与 freeform 互斥（`xe(id)` 清除 freeform，`Te` 改 textarea 清除
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
                  onClick={() => onChange([option.value])}
                >
                  <span className="hc-request-option-index">{optionIndex + 1}.</span>
                  <OptionCopy option={option} />
                </button>
              );
            })}
          </div>
          {isOther && (
            /*
             * CODEX-REF: en — `K && q` 时 options 后追加 freeform input。
             * Codex placeholder i18n: `requestInputPanel.otherPlaceholder`
             * = "No, and tell Codex what to do differently"。HiCodex 用通用兜底。
             * 输入时清除 selected option（用 freeform 替代）。
             */
            <div className="hc-request-inline-freeform hc-request-other-freeform">
              <textarea
                value={freeformValue}
                placeholder="Or type your own answer"
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
            placeholder="Type here"
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
            placeholder="Type here"
            disabled={disabled}
            onChange={(event) => onChange([event.target.value])}
          />
        </div>
      )}
    </div>
  );
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
      {option.description && <small>{option.description}</small>}
    </span>
  );
}

function defaultAnswers(question: PendingRequestQuestion): string[] {
  if (question.defaultAnswers.length > 0) return question.defaultAnswers;
  return [];
}

function answerPayload(
  detail: PendingRequestDetail,
  answers: Record<string, string[]>,
): Record<string, string[]> {
  return Object.fromEntries(
    detail.questions.map((question) => [question.id, answers[question.id] ?? question.defaultAnswers]),
  );
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
