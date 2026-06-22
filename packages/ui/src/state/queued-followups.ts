import type { ImageDetail } from "@forge/codex-protocol";
import type { ComposerAttachment, ComposerMode } from "./composer-workflow";

export const QUEUED_FOLLOW_UPS_GLOBAL_STATE_KEY = "queued-follow-ups";

export type QueuedFollowUpStatus = "queued" | "sending" | "paused";

export type QueuedFollowUpsByThread = Record<string, QueuedFollowUp[]>;

export interface QueuedFollowUp {
  id: string;
  text: string;
  context?: unknown;
  attachments: ComposerAttachment[];
  cwd: string;
  mode?: ComposerMode;
  createdAt: number;
  status: QueuedFollowUpStatus;
  error?: string;
  pausedReason?: string;
  responsesapiClientMetadata?: unknown;
}

export const INTERRUPTED_STEER_PAUSED_REASON = "Interrupted before the steer was accepted.";
export const RUN_ENDED_STEER_PAUSED_REASON = "Run ended before the steer was accepted.";

const QUEUED_FOLLOW_UP_STATUSES: readonly QueuedFollowUpStatus[] = ["queued", "sending", "paused"];

export function createQueuedFollowUp(input: {
  text: string;
  attachments: ComposerAttachment[];
  cwd: string;
  context?: unknown;
  createdAt?: number;
  mode?: ComposerMode;
  responsesapiClientMetadata?: unknown;
  now?: number;
  id?: string;
}): QueuedFollowUp {
  const now = input.createdAt ?? input.now ?? Date.now();
  return {
    id: input.id ?? `queued-${now.toString(36)}-${Math.random().toString(36).slice(2, 8)}`,
    text: input.text,
    ...(input.context !== undefined ? { context: input.context } : {}),
    attachments: input.attachments,
    cwd: input.cwd,
    ...(input.mode ? { mode: input.mode } : {}),
    createdAt: now,
    status: "queued",
    ...(input.responsesapiClientMetadata === undefined
      ? {}
      : { responsesapiClientMetadata: input.responsesapiClientMetadata }),
  };
}

export function removeQueuedFollowUp(queue: QueuedFollowUp[], id: string): QueuedFollowUp[] {
  return queue.filter((message) => message.id !== id);
}

export function updateQueuedFollowUpsByThread(
  current: QueuedFollowUpsByThread,
  threadId: string,
  updater: (queue: QueuedFollowUp[]) => QueuedFollowUp[],
): QueuedFollowUpsByThread {
  const nextQueue = updater(current[threadId] ?? []);
  if (nextQueue.length === 0) {
    const { [threadId]: _removed, ...rest } = current;
    return rest;
  }
  return { ...current, [threadId]: nextQueue };
}

export function normalizeQueuedFollowUpsByThread(value: unknown): QueuedFollowUpsByThread {
  if (!isRecord(value)) return {};
  const normalized: QueuedFollowUpsByThread = {};
  for (const [threadId, rawQueue] of Object.entries(value)) {
    if (!threadId.trim() || !Array.isArray(rawQueue)) continue;
    const queue = rawQueue.flatMap((message) => {
      const normalizedMessage = normalizeQueuedFollowUp(message);
      return normalizedMessage ? [normalizedMessage] : [];
    });
    if (queue.length > 0) normalized[threadId] = queue;
  }
  return normalized;
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
 * Desktop UI/app-layer `steeringUserMessage` item and does not expose an
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

function normalizeQueuedFollowUp(value: unknown): QueuedFollowUp | null {
  if (!isRecord(value)) return null;
  const id = readString(value.id);
  const context = value.context;
  const text = readString(value.text) ?? readContextPrompt(context);
  const cwd = readString(value.cwd);
  const createdAt = typeof value.createdAt === "number" && Number.isFinite(value.createdAt)
    ? value.createdAt
    : null;
  if (!id || text === null || cwd === null || createdAt === null) return null;
  const mode = value.mode === "default" || value.mode === "plan" ? value.mode : undefined;
  const status = QUEUED_FOLLOW_UP_STATUSES.includes(value.status as QueuedFollowUpStatus)
    ? value.status as QueuedFollowUpStatus
    : "queued";
  const error = readOptionalString(value.error);
  const pausedReason = readOptionalString(value.pausedReason);
  return {
    id,
    text,
    ...(context !== undefined ? { context } : {}),
    attachments: normalizeComposerAttachments(value.attachments),
    cwd,
    ...(mode && mode !== "default" ? { mode } : {}),
    createdAt,
    status,
    ...(error ? { error } : {}),
    ...(pausedReason ? { pausedReason } : {}),
    ...(value.responsesapiClientMetadata === undefined
      ? {}
      : { responsesapiClientMetadata: value.responsesapiClientMetadata }),
  };
}

function normalizeComposerAttachments(value: unknown): ComposerAttachment[] {
  if (!Array.isArray(value)) return [];
  return value.flatMap<ComposerAttachment>((attachment): ComposerAttachment[] => {
    if (!isRecord(attachment)) return [];
    switch (attachment.type) {
      case "mention":
      case "skill": {
        const name = readString(attachment.name);
        const path = readString(attachment.path);
        return name !== null && path !== null ? [{ type: attachment.type, name, path }] : [];
      }
      case "localImage": {
        const path = readString(attachment.path);
        const detail = normalizeImageDetail(attachment.detail);
        return path !== null ? [{ type: "localImage", path, ...(detail ? { detail } : {}) }] : [];
      }
      case "image": {
        const url = readString(attachment.url);
        const name = readOptionalString(attachment.name);
        const detail = normalizeImageDetail(attachment.detail);
        return url !== null ? [{ type: "image", url, ...(name ? { name } : {}), ...(detail ? { detail } : {}) }] : [];
      }
      case "plainText": {
        const text = readString(attachment.text);
        return text !== null ? [{ type: "plainText", text }] : [];
      }
      case "filePath": {
        const path = readString(attachment.path);
        return path !== null ? [{ type: "filePath", path }] : [];
      }
      default:
        return [];
    }
  });
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function readString(value: unknown): string | null {
  return typeof value === "string" ? value : null;
}

function readOptionalString(value: unknown): string | undefined {
  return typeof value === "string" && value ? value : undefined;
}

function readContextPrompt(value: unknown): string | null {
  return isRecord(value) && typeof value.prompt === "string" ? value.prompt : null;
}

function normalizeImageDetail(value: unknown): ImageDetail | undefined {
  return value === "auto" || value === "low" || value === "high" || value === "original"
    ? value
    : undefined;
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
