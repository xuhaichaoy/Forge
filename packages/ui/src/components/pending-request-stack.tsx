import { Check, X } from "lucide-react";
import { formatError } from "../lib/format";
import type { PendingServerRequest } from "../state/codex-reducer";
import {
  pendingRequestDetail,
  type PendingRequestDetail,
} from "../state/approval-requests";

export type { PendingRequestDetail };

export interface PendingRequestStackProps {
  pendingRequests: PendingServerRequest[];
  onRespond: (request: PendingServerRequest, accepted: boolean) => void | Promise<void>;
  onLog?: (text: string, level?: "info" | "warn" | "error") => void;
}

export interface ApprovalCardProps {
  request: PendingServerRequest;
  onRespond: (request: PendingServerRequest, accepted: boolean) => void | Promise<void>;
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
  const detail = pendingRequestDetail(request);

  const respond = (accepted: boolean) => {
    try {
      const result = onRespond(request, accepted);
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
      <div className="hc-approval-actions">
        <button className="hc-mini-button accept" onClick={() => respond(true)}><Check size={13} /> Allow</button>
        <button className="hc-mini-button decline" onClick={() => respond(false)}><X size={13} /> Cancel</button>
      </div>
    </div>
  );
}

function isPromiseLike(value: void | Promise<void>): value is Promise<void> {
  return Boolean(value && typeof value === "object" && typeof value.catch === "function");
}
