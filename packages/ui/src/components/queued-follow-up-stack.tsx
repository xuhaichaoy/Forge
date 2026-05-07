import { Edit3, Send, Trash2, TriangleAlert } from "lucide-react";
import type { QueuedFollowUp } from "../state/queued-followups";
import { queuedFollowUpSummary } from "../state/queued-followups";

export interface QueuedFollowUpStackProps {
  messages: QueuedFollowUp[];
  onSendNow: (message: QueuedFollowUp) => void;
  onEdit: (message: QueuedFollowUp) => void;
  onDelete: (message: QueuedFollowUp) => void;
}

export function QueuedFollowUpStack({
  messages,
  onSendNow,
  onEdit,
  onDelete,
}: QueuedFollowUpStackProps) {
  if (messages.length === 0) return null;

  return (
    <section className="hc-queued-followups" aria-label="Queued follow-ups">
      {messages.map((message) => (
        <article className="hc-queued-followup-row" data-status={message.status} key={message.id}>
          <div className="hc-queued-followup-main">
            {message.status === "paused" && <TriangleAlert size={14} />}
            <span>{queuedFollowUpSummary(message)}</span>
            {message.attachments.length > 0 && <small>{message.attachments.length} context</small>}
          </div>
          {message.error && <div className="hc-queued-followup-error">{message.error}</div>}
          <div className="hc-queued-followup-actions">
            <button type="button" title={message.status === "paused" ? "Retry" : "Steer"} onClick={() => onSendNow(message)}>
              <Send size={13} />
            </button>
            <button type="button" title="Edit message" onClick={() => onEdit(message)}>
              <Edit3 size={13} />
            </button>
            <button type="button" title="Delete queued message" onClick={() => onDelete(message)}>
              <Trash2 size={13} />
            </button>
          </div>
        </article>
      ))}
    </section>
  );
}
