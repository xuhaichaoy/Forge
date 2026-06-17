import type { ComposerAttachment, ComposerMode } from "./composer-workflow";

export type QueuedFollowUpStatus = "queued" | "sending" | "paused";

export interface QueuedFollowUp {
  id: string;
  text: string;
  attachments: ComposerAttachment[];
  cwd: string;
  mode?: ComposerMode;
  createdAt: number;
  status: QueuedFollowUpStatus;
  error?: string;
  pausedReason?: string;
}

export const INTERRUPTED_STEER_PAUSED_REASON = "Interrupted before the steer was accepted.";

export function createQueuedFollowUp(input: {
  text: string;
  attachments: ComposerAttachment[];
  cwd: string;
  mode?: ComposerMode;
  now?: number;
  id?: string;
}): QueuedFollowUp {
  const now = input.now ?? Date.now();
  return {
    id: input.id ?? `queued-${now.toString(36)}-${Math.random().toString(36).slice(2, 8)}`,
    text: input.text,
    attachments: input.attachments,
    cwd: input.cwd,
    ...(input.mode ? { mode: input.mode } : {}),
    createdAt: now,
    status: "queued",
  };
}

export function removeQueuedFollowUp(queue: QueuedFollowUp[], id: string): QueuedFollowUp[] {
  return queue.filter((message) => message.id !== id);
}

export function reorderQueuedFollowUps(
  queue: QueuedFollowUp[],
  activeId: string,
  overId: string,
): QueuedFollowUp[] {
  if (activeId === overId) return queue;
  const fromIndex = queue.findIndex((message) => message.id === activeId);
  const toIndex = queue.findIndex((message) => message.id === overId);
  if (fromIndex < 0 || toIndex < 0) return queue;
  const next = [...queue];
  const [message] = next.splice(fromIndex, 1);
  if (!message) return queue;
  next.splice(toIndex, 0, message);
  return next;
}

export function updateQueuedFollowUpStatus(
  queue: QueuedFollowUp[],
  id: string,
  status: QueuedFollowUpStatus,
  error?: string,
  pausedReason?: string,
): QueuedFollowUp[] {
  return queue.map((message) =>
    message.id === id
      ? {
          ...message,
          status,
          ...(error ? { error } : { error: undefined }),
          ...(pausedReason ? { pausedReason } : { pausedReason: undefined }),
        }
      : message,
  );
}

/**
 * Forge-only guard: current Codex Desktop owns pending steers through the
 * product/app-server `steeringUserMessage` model and does not expose an
 * app-layer duplicate helper for Forge's local queue. This keeps local queued
 * follow-ups from accumulating identical prompt/context pairs while a turn is
 * still streaming.
 */
export function isQueuedFollowUpDuplicate(
  queue: QueuedFollowUp[],
  candidate: Pick<QueuedFollowUp, "text" | "attachments">,
): boolean {
  const key = canonicalFollowUpKey(candidate);
  if (!key) return false;
  return queue.some((message) => canonicalFollowUpKey(message) === key);
}

export function pauseQueuedFollowUpsWithReason(
  queue: QueuedFollowUp[],
  pausedReason: string,
): QueuedFollowUp[] {
  return queue.map((message) => (
    message.status === "queued"
      ? { ...message, pausedReason }
      : message
  ));
}

export function resumeQueuedFollowUpsWithReason(
  queue: QueuedFollowUp[],
  pausedReason: string,
): QueuedFollowUp[] {
  return queue.map((message) => (
    message.pausedReason === pausedReason
      ? { ...message, pausedReason: undefined }
      : message
  ));
}

function canonicalFollowUpKey(
  message: Pick<QueuedFollowUp, "text" | "attachments">,
): string {
  const text = message.text.trim().replaceAll(/\s+/g, " ");
  const attachmentKey = message.attachments
    .map((attachment) => `${attachment.type}::${describeAttachmentTarget(attachment)}`)
    .sort()
    .join("\u001f");
  if (!text && !attachmentKey) return "";
  return `${text}\u001e${attachmentKey}`;
}

function describeAttachmentTarget(attachment: ComposerAttachment): string {
  switch (attachment.type) {
    case "mention":
    case "skill":
      return `${attachment.name}@${attachment.path}`;
    case "localImage":
    case "filePath":
      return attachment.path;
    case "image":
      return `${attachment.name ?? ""}@${attachment.url}`;
    case "plainText":
      return attachment.text;
    default:
      return "";
  }
}

export function queuedFollowUpSummary(message: Pick<QueuedFollowUp, "text" | "attachments">): string {
  const text = summarizeQueuedFollowUpText(message.text);
  if (text) return text;
  const pastedTextAttachments = message.attachments.filter((attachment) => attachment.type === "plainText");
  if (pastedTextAttachments.length > 0) {
    const preview = summarizeQueuedFollowUpText(pastedTextAttachments[0]?.text ?? "") || "Pasted text";
    const remaining = pastedTextAttachments.length - 1;
    if (remaining === 0) return preview;
    return `${preview} (+${remaining} more pasted text attachment${remaining === 1 ? "" : "s"})`;
  }
  return message.attachments.length === 1
    ? "1 attachment"
    : `${message.attachments.length} attachments`;
}

function summarizeQueuedFollowUpText(value: string): string {
  const text = value.trim().replaceAll(/\s+/g, " ");
  return text.length > 96 ? `${text.slice(0, 93)}...` : text;
}
