import { stringField } from "../lib/format";
import type { AccumulatedThreadItem } from "./render-groups";

export function turnErrorMessage(error: Record<string, unknown> | null | undefined): string {
  return stringField(error, "message");
}

export function streamErrorItem(
  turnId: string,
  error: Record<string, unknown> | null | undefined,
  fallbackText: string,
): AccumulatedThreadItem {
  const id = turnId ? `stream-error:${turnId}` : `stream-error:${fallbackText}`;
  return {
    id,
    type: "stream-error",
    content: turnErrorMessage(error) || fallbackText,
    additionalDetails: stringField(error, "additionalDetails"),
    completed: true,
    ...(turnId ? { _turnId: turnId } : {}),
  };
}

export function systemErrorItem(
  turnId: string,
  error: Record<string, unknown> | null | undefined,
  fallbackText: string,
): AccumulatedThreadItem {
  const rawDetail = stringField(error, "additionalDetails");
  const errorInfo = errorInfoField(error);
  return {
    id: turnId ? `system-error:${turnId}` : `system-error:${fallbackText}`,
    type: "system-error",
    content: turnErrorMessage(error) || fallbackText,
    ...(errorInfo !== undefined ? { errorInfo } : {}),
    ...(rawDetail ? { raw_detail: rawDetail } : {}),
    completed: true,
    ...(turnId ? { _turnId: turnId } : {}),
  } as AccumulatedThreadItem;
}

function errorInfoField(error: Record<string, unknown> | null | undefined): unknown {
  if (!error) return undefined;
  const value = error.errorInfo ?? error.codexErrorInfo;
  return value == null ? undefined : value;
}

const RECONNECTING_MESSAGE_PATTERN = /^Reconnecting(?:\.\.\.)?\s+(\d+)\/(\d+)$/;

export function reconnectStreamErrorItem(
  turnId: string,
  error: Record<string, unknown> | null | undefined,
  fallbackText: string,
): AccumulatedThreadItem {
  const message = turnErrorMessage(error) || fallbackText;
  const match = RECONNECTING_MESSAGE_PATTERN.exec(message.trim());
  const reconnect = match
    ? { reconnectAttempt: Number(match[1]), reconnectMaxAttempts: Number(match[2]) }
    : null;
  return {
    id: turnId ? `stream-error:${turnId}` : `stream-error:${fallbackText}`,
    type: "stream-error",
    content: reconnect ? `Reconnecting ${reconnect.reconnectAttempt}/${reconnect.reconnectMaxAttempts}` : message,
    additionalDetails: stringField(error, "additionalDetails"),
    completed: true,
    ...reconnect,
    ...(turnId ? { _turnId: turnId } : {}),
  } as AccumulatedThreadItem;
}
