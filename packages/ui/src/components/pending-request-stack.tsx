import { useMemo, useState } from "react";
import { formatError } from "../lib/format";
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
  const [answers, setAnswers] = useState<Record<string, string[]>>(() =>
    Object.fromEntries(detail.questions.map((question) => [question.id, defaultAnswers(question)])),
  );
  const canSubmit = detail.canAccept && detail.questions.every((question) =>
    !question.required || (answers[question.id] ?? question.defaultAnswers).some((answer) => answer.trim()),
  );

  const respond = (accepted: boolean) => {
    if (accepted && !canSubmit) return;
    try {
      const result = onRespond(request, accepted, accepted ? answerPayload(detail, answers) : undefined);
      if (isPromiseLike(result)) {
        void result.catch((error: unknown) => {
          onLog?.(formatError(error), "error");
        });
      }
    } catch (error) {
      onLog?.(formatError(error), "error");
    }
  };
  const panelTitle = requestPanelTitle(detail);
  const details = requestPanelDetails(detail);

  return (
    <div
      className="hc-request-input-panel"
      data-request-kind={requestKind(request.method)}
      tabIndex={0}
      onKeyDown={(event) => {
        if (event.defaultPrevented) return;
        if (event.key === "Escape") {
          event.preventDefault();
          respond(false);
          return;
        }
        if (event.key === "Enter" && !event.shiftKey && canSubmit) {
          event.preventDefault();
          respond(true);
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
      </div>
      {detail.questions.length > 0 && (
        <div className="hc-request-questions">
          {detail.questions.map((question, index) => (
            <QuestionField
              key={question.id}
              question={question}
              index={index}
              value={answers[question.id] ?? question.defaultAnswers}
              onChange={(value) => setAnswers((current) => ({ ...current, [question.id]: value }))}
            />
          ))}
        </div>
      )}
      {!detail.canAccept && detail.acceptDisabledReason && (
        <div className="hc-approval-disabled-note">{detail.acceptDisabledReason}</div>
      )}
      <div className="hc-request-panel-actions">
        <button type="button" className="hc-request-action ghost" onClick={() => respond(false)}>
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
          <span>{detail.acceptLabel}</span>
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

function requestPanelDetails(detail: PendingRequestDetail): RequestDetailItem[] {
  const rows: RequestDetailItem[] = [];
  if (detail.reason) rows.push({ label: "Reason", value: detail.reason });
  for (const item of detail.metadata) {
    rows.push({ label: item.label, value: item.value, code: isTechnicalDetail(item.label, item.value) });
  }
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

function isTechnicalDetail(label: string, value: string): boolean {
  return /cwd|thread|turn|item|request|url|path|root/i.test(label) || looksLikeCommandOrPath(value);
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

function requestKind(method: string): string {
  if (method.includes("commandExecution") || method === "execCommandApproval") return "command";
  if (method.includes("fileChange") || method === "applyPatchApproval") return "file-change";
  if (method.includes("requestUserInput")) return "user-input";
  if (method.includes("elicitation")) return "mcp";
  if (method.includes("permissions")) return "permission";
  return "unknown";
}

function QuestionField({
  question,
  index,
  value,
  onChange,
}: {
  question: PendingRequestQuestion;
  index: number;
  value: string[];
  onChange: (value: string[]) => void;
}) {
  const currentValue = value[0] ?? "";
  return (
    <div className="hc-request-question">
      <div className="hc-request-question-heading">
        <span>{question.header}</span>
        <small>{question.question}</small>
      </div>
      {question.kind === "multiSelect" ? (
        <div className="hc-request-options multi">
          {question.options.map((option, optionIndex) => {
            const selected = value.includes(option.value);
            return (
              <label className="hc-request-option-row checkbox" data-selected={selected} key={option.value}>
                <span className="hc-request-option-index">{optionIndex + 1}.</span>
                <input
                  type="checkbox"
                  checked={selected}
                  onChange={() => onChange(
                    selected ? value.filter((item) => item !== option.value) : [...value, option.value],
                  )}
                />
                <span className="hc-request-option-copy">
                  <strong>{option.label}</strong>
                  {option.description && <small>{option.description}</small>}
                </span>
              </label>
            );
          })}
        </div>
      ) : question.options.length > 0 ? (
        <div className="hc-request-options" role="radiogroup" aria-label={question.header}>
          {question.options.map((option, optionIndex) => {
            const selected = currentValue === option.value;
            return (
              <button
                type="button"
                className="hc-request-option-row"
                data-selected={selected}
                role="radio"
                aria-checked={selected}
                key={option.value}
                onClick={() => onChange([option.value])}
              >
                <span className="hc-request-option-index">{optionIndex + 1}.</span>
                <span className="hc-request-option-copy">
                  <strong>{option.label}</strong>
                  {option.description && <small>{option.description}</small>}
                </span>
              </button>
            );
          })}
        </div>
      ) : question.kind === "textarea" ? (
        <div className="hc-request-inline-freeform">
          <span>{index + 1}.</span>
          <textarea
            value={currentValue}
            placeholder="Type here"
            rows={1}
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
            onChange={(event) => onChange([event.target.value])}
          />
        </div>
      )}
    </div>
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

function isPromiseLike(value: void | Promise<void>): value is Promise<void> {
  return Boolean(value && typeof value === "object" && typeof value.catch === "function");
}
