import { Edit3, GripVertical, ListPlus, MoreHorizontal, Send, Trash2, TriangleAlert } from "lucide-react";
import { useCallback, useRef, useState } from "react";
import { useDismissibleLayer } from "../hooks/use-dismissible-layer";
import type { QueuedFollowUp } from "../state/queued-followups";
import { queuedFollowUpSummary } from "../state/queued-followups";

export interface QueuedFollowUpStackProps {
  messages: QueuedFollowUp[];
  isQueueingEnabled: boolean;
  onSendNow: (message: QueuedFollowUp) => void;
  onEdit: (message: QueuedFollowUp) => void;
  onDelete: (message: QueuedFollowUp) => void;
  onQueueingChange: (enabled: boolean) => void;
  onReorder: (activeId: string, overId: string) => void;
}

export function QueuedFollowUpStack({
  messages,
  isQueueingEnabled,
  onSendNow,
  onEdit,
  onDelete,
  onQueueingChange,
  onReorder,
}: QueuedFollowUpStackProps) {
  const [openMenuId, setOpenMenuId] = useState<string | null>(null);
  const [draggingId, setDraggingId] = useState<string | null>(null);
  const openMenuWrapRef = useRef<HTMLDivElement | null>(null);
  const closeOpenMenu = useCallback(() => setOpenMenuId(null), []);
  useDismissibleLayer(openMenuId != null, openMenuWrapRef, closeOpenMenu);

  if (messages.length === 0) return null;

  return (
    <section className="hc-queued-followups" aria-label="Queued follow-ups">
      {messages.map((message) => (
        <article
          className={`hc-queued-followup-row ${openMenuId === message.id ? "is-menu-open" : ""}`}
          data-status={message.status}
          data-dragging={draggingId === message.id}
          key={message.id}
          onDragOver={(event) => {
            if (!draggingId || draggingId === message.id) return;
            event.preventDefault();
          }}
          onDrop={(event) => {
            event.preventDefault();
            if (draggingId && draggingId !== message.id) onReorder(draggingId, message.id);
            setDraggingId(null);
          }}
        >
          <span
            className="hc-queued-followup-handle"
            aria-hidden="true"
            draggable
            onDragStart={(event) => {
              setDraggingId(message.id);
              event.dataTransfer.effectAllowed = "move";
              event.dataTransfer.setData("text/plain", message.id);
            }}
            onDragEnd={() => setDraggingId(null)}
          >
            <GripVertical size={13} />
          </span>
          <div className="hc-queued-followup-main">
            {message.status === "paused" && (
              <span
                className="hc-queued-followup-warning"
                title="This queued message could not be sent. Retry, edit, or delete it to continue the queue."
              >
                <TriangleAlert size={14} />
              </span>
            )}
            <span className="hc-queued-followup-text">{queuedFollowUpSummary(message)}</span>
            {message.attachments.length > 0 && <small>{message.attachments.length} context</small>}
          </div>
          {message.error && <div className="hc-queued-followup-error">{message.error}</div>}
          <div className="hc-queued-followup-actions">
            <button
              type="button"
              className="hc-queued-followup-steer"
              title={message.status === "paused" ? "Retry queued message" : "Submit without interrupting the model"}
              aria-label={message.status === "paused" ? "Retry" : "Steer"}
              onClick={() => onSendNow(message)}
            >
              <Send size={13} />
              <span>{message.status === "paused" ? "Retry" : "Steer"}</span>
            </button>
            <button
              type="button"
              title="Delete queued message"
              aria-label="Delete queued message"
              onClick={() => {
                setOpenMenuId(null);
                onDelete(message);
              }}
            >
              <Trash2 size={13} />
            </button>
            <div
              className="hc-queued-followup-menu-wrap"
              ref={openMenuId === message.id ? openMenuWrapRef : undefined}
            >
              <button
                type="button"
                title="Queued message actions"
                aria-label="Queued message actions"
                aria-haspopup="menu"
                aria-expanded={openMenuId === message.id}
                onClick={() => setOpenMenuId((value) => value === message.id ? null : message.id)}
              >
                <MoreHorizontal size={13} />
              </button>
              {openMenuId === message.id && (
                <div className="hc-thread-menu hc-queued-followup-menu hc-app-popover-menu" role="menu" data-state="open">
                  <button
                    type="button"
                    className="hc-thread-menu-item"
                    role="menuitem"
                    onClick={() => {
                      setOpenMenuId(null);
                      onEdit(message);
                    }}
                  >
                    <Edit3 size={13} />
                    Edit message
                  </button>
                  <button
                    type="button"
                    className="hc-thread-menu-item"
                    role="menuitem"
                    onClick={() => {
                      setOpenMenuId(null);
                      onQueueingChange(!isQueueingEnabled);
                    }}
                  >
                    <ListPlus size={13} />
                    {isQueueingEnabled ? "Turn off queueing" : "Turn on queueing"}
                  </button>
                </div>
              )}
            </div>
          </div>
        </article>
      ))}
    </section>
  );
}
