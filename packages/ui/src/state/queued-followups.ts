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
}

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

export function updateQueuedFollowUpStatus(
  queue: QueuedFollowUp[],
  id: string,
  status: QueuedFollowUpStatus,
  error?: string,
): QueuedFollowUp[] {
  return queue.map((message) =>
    message.id === id
      ? {
          ...message,
          status,
          ...(error ? { error } : { error: undefined }),
        }
      : message,
  );
}

export function queuedFollowUpSummary(message: Pick<QueuedFollowUp, "text" | "attachments">): string {
  const text = message.text.trim().replaceAll(/\s+/g, " ");
  if (text) return text.length > 96 ? `${text.slice(0, 93)}...` : text;
  return message.attachments.length === 1
    ? "1 attachment"
    : `${message.attachments.length} attachments`;
}
