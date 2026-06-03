import { Edit3, GripVertical, ListPlus, MoreHorizontal, Send, Trash2, TriangleAlert } from "lucide-react";
import { useCallback, useRef, useState } from "react";
import { useDismissibleLayer } from "../hooks/use-dismissible-layer";
import type { QueuedFollowUp } from "../state/queued-followups";
import { queuedFollowUpSummary } from "../state/queued-followups";
import { useHiCodexIntl } from "./i18n-provider";

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
  const { formatMessage } = useHiCodexIntl();
  const [openMenuId, setOpenMenuId] = useState<string | null>(null);
  const [draggingId, setDraggingId] = useState<string | null>(null);
  const openMenuWrapRef = useRef<HTMLDivElement | null>(null);
  const closeOpenMenu = useCallback(() => setOpenMenuId(null), []);
  useDismissibleLayer(openMenuId != null, openMenuWrapRef, closeOpenMenu);

  if (messages.length === 0) return null;

  /*
   * CODEX-REF: composer.queuedMessage.* (pretty/<composer>.js) —
   * Codex 把 paused/retry 的 tooltip 拆成主句 + 补救句两个独立 id
   * (pausedTooltip + pausedTooltipRemedy / retryTooltip + retryTooltipRemedy)。
   * 此处保留两段式语义、运行时拼接为单个 title。
   */
  const pausedTooltip = `${formatMessage({
    id: "composer.queuedMessage.pausedTooltip",
    defaultMessage: "This queued message could not be sent",
  })}. ${formatMessage({
    id: "composer.queuedMessage.pausedTooltipRemedy",
    defaultMessage: "Retry, edit, or delete it to continue the queue",
  })}.`;
  const retryTooltip = `${formatMessage({
    id: "composer.queuedMessage.retryTooltip",
    defaultMessage: "Try sending this queued message again",
  })}. ${formatMessage({
    id: "composer.queuedMessage.retryTooltipRemedy",
    defaultMessage: "Edit or delete it if retry keeps failing",
  })}.`;
  const sendNowTooltip = formatMessage({
    id: "composer.queuedMessage.sendNowTooltip",
    defaultMessage: "Submit without interrupting the model",
  });
  const sendNowLabel = formatMessage({ id: "composer.queuedMessage.sendNow", defaultMessage: "Steer" });
  const retryLabel = formatMessage({ id: "composer.queuedMessage.retry", defaultMessage: "Retry" });
  const deleteLabel = formatMessage({ id: "composer.queuedMessage.delete", defaultMessage: "Delete queued message" });
  const moreLabel = formatMessage({ id: "composer.queuedMessage.more", defaultMessage: "Queued message actions" });
  const editLabel = formatMessage({ id: "composer.queuedMessage.edit", defaultMessage: "Edit message" });
  const turnOnLabel = formatMessage({ id: "composer.queuedMessage.turnOn", defaultMessage: "Turn on queueing" });
  const turnOffLabel = formatMessage({ id: "composer.queuedMessage.turnOff", defaultMessage: "Turn off queueing" });

  return (
    <section className="hc-queued-followups" aria-label="Queued follow-ups">
      {messages.map((message) => {
        const isPaused = message.status === "paused";
        return (
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
              {isPaused && (
                <span className="hc-queued-followup-warning" title={pausedTooltip}>
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
                title={isPaused ? retryTooltip : sendNowTooltip}
                aria-label={isPaused ? retryLabel : sendNowLabel}
                onClick={() => onSendNow(message)}
              >
                <Send size={13} />
                <span>{isPaused ? retryLabel : sendNowLabel}</span>
              </button>
              <button
                type="button"
                title={deleteLabel}
                aria-label={deleteLabel}
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
                  title={moreLabel}
                  aria-label={moreLabel}
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
                      {editLabel}
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
                      {isQueueingEnabled ? turnOffLabel : turnOnLabel}
                    </button>
                  </div>
                )}
              </div>
            </div>
          </article>
        );
      })}
    </section>
  );
}
