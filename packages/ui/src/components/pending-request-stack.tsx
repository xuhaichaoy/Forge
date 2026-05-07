import { Check, X } from "lucide-react";
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
    <section className="hc-pending-stack">
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

  return (
    <div className="hc-approval-card">
      <div className="hc-approval-method">{detail.title}</div>
      {detail.reason && <div className="hc-approval-reason">{detail.reason}</div>}
      {detail.metadata.length > 0 && (
        <dl className="hc-approval-metadata">
          {detail.metadata.map((item) => (
            <div key={`${item.label}:${item.value}`}>
              <dt>{item.label}</dt>
              <dd>{item.value}</dd>
            </div>
          ))}
        </dl>
      )}
      {detail.body && <pre>{detail.body}</pre>}
      {detail.questions.length > 0 && (
        <div className="hc-request-questions">
          {detail.questions.map((question) => (
            <QuestionField
              key={question.id}
              question={question}
              value={answers[question.id] ?? question.defaultAnswers}
              onChange={(value) => setAnswers((current) => ({ ...current, [question.id]: value }))}
            />
          ))}
        </div>
      )}
      {!detail.canAccept && detail.acceptDisabledReason && (
        <div className="hc-approval-disabled-note">{detail.acceptDisabledReason}</div>
      )}
      <div className="hc-approval-actions">
        <button
          className="hc-mini-button accept"
          disabled={!canSubmit}
          title={!canSubmit ? detail.acceptDisabledReason : undefined}
          onClick={() => respond(true)}
        ><Check size={13} /> {detail.acceptLabel}</button>
        <button className="hc-mini-button decline" onClick={() => respond(false)}><X size={13} /> {detail.declineLabel}</button>
      </div>
    </div>
  );
}

function QuestionField({
  question,
  value,
  onChange,
}: {
  question: PendingRequestQuestion;
  value: string[];
  onChange: (value: string[]) => void;
}) {
  const currentValue = value[0] ?? "";
  return (
    <div className="hc-request-question">
      <span>{question.header}</span>
      <small>{question.question}</small>
      {question.kind === "multiSelect" ? (
        <div className="hc-request-options multi">
          {question.options.map((option) => {
            const selected = value.includes(option.value);
            return (
              <label className="hc-request-checkbox" key={option.value}>
                <input
                  type="checkbox"
                  checked={selected}
                  onChange={() => onChange(
                    selected ? value.filter((item) => item !== option.value) : [...value, option.value],
                  )}
                />
                <span>{option.label}</span>
                {option.description && <small>{option.description}</small>}
              </label>
            );
          })}
        </div>
      ) : question.options.length > 0 ? (
        <div className="hc-request-options" role="radiogroup" aria-label={question.header}>
          {question.options.map((option) => {
            const selected = currentValue === option.value;
            return (
              <button
                type="button"
                className={selected ? "is-selected" : ""}
                role="radio"
                aria-checked={selected}
                key={option.value}
                onClick={() => onChange([option.value])}
              >
                <span>{option.label}</span>
                {option.description && <small>{option.description}</small>}
              </button>
            );
          })}
        </div>
      ) : question.kind === "textarea" ? (
        <textarea
          value={currentValue}
          onChange={(event) => onChange([event.target.value])}
        />
      ) : (
        <input
          type={question.kind === "password" ? "password" : question.kind === "number" ? "number" : "text"}
          value={currentValue}
          onChange={(event) => onChange([event.target.value])}
        />
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
