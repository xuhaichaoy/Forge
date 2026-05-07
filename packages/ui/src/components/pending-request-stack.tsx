import { Check, X } from "lucide-react";
import { useMemo, useState } from "react";
import { formatError } from "../lib/format";
import type { PendingServerRequest } from "../state/codex-reducer";
import {
  pendingRequestDetail,
  type PendingRequestDetail,
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
  const [answers, setAnswers] = useState<Record<string, string>>(() =>
    Object.fromEntries(detail.questions.map((question) => [question.id, question.options[0]?.label ?? ""])),
  );

  const respond = (accepted: boolean) => {
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
      <pre>{detail.body}</pre>
      {detail.questions.length > 0 && (
        <div className="hc-request-questions">
          {detail.questions.map((question) => (
            <label className="hc-request-question" key={question.id}>
              <span>{question.header}</span>
              <small>{question.question}</small>
              {question.options.length > 0 ? (
                <select
                  value={answers[question.id] ?? ""}
                  onChange={(event) => setAnswers((current) => ({ ...current, [question.id]: event.target.value }))}
                >
                  <option value="">Choose...</option>
                  {question.options.map((option) => (
                    <option key={option.label} value={option.label}>
                      {option.description ? `${option.label} - ${option.description}` : option.label}
                    </option>
                  ))}
                </select>
              ) : (
                <input
                  type={question.isSecret ? "password" : "text"}
                  value={answers[question.id] ?? ""}
                  onChange={(event) => setAnswers((current) => ({ ...current, [question.id]: event.target.value }))}
                />
              )}
            </label>
          ))}
        </div>
      )}
      <div className="hc-approval-actions">
        <button className="hc-mini-button accept" onClick={() => respond(true)}><Check size={13} /> {detail.acceptLabel}</button>
        <button className="hc-mini-button decline" onClick={() => respond(false)}><X size={13} /> {detail.declineLabel}</button>
      </div>
    </div>
  );
}

function answerPayload(
  detail: PendingRequestDetail,
  answers: Record<string, string>,
): Record<string, string[]> {
  return Object.fromEntries(
    detail.questions.map((question) => [question.id, [answers[question.id] ?? ""]]),
  );
}

function isPromiseLike(value: void | Promise<void>): value is Promise<void> {
  return Boolean(value && typeof value === "object" && typeof value.catch === "function");
}
