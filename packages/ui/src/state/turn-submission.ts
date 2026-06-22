import type { CollaborationModeMask } from "@forge/codex-protocol";
import type { ThreadContextDefaults } from "./codex-reducer";
import { collaborationModeFromComposerMode } from "./collaboration-modes";
import type { ComposerMode, ComposerSubmitState } from "./composer-workflow";
import type { PendingSteerCompareKey, TerminalTurnSnapshot, ThreadRuntimeSlice } from "./codex-ui-types";
import {
  INTERRUPTED_STEER_PAUSED_REASON,
  RUN_ENDED_STEER_PAUSED_REASON,
  type QueuedFollowUp,
} from "./queued-followups";
import type { TurnStartOptions } from "./thread-workflow";

export const PLAN_MODE_UNAVAILABLE_MESSAGE =
  "Plan mode is unavailable until collaboration modes load from app-server";

export function shouldQueueComposerFollowUp(input: {
  activeTurnId: string | null;
  activeThreadRunning: boolean;
  isQueueingEnabled: boolean;
  submitButtonMode: ComposerSubmitState["submitButtonMode"];
}): boolean {
  return Boolean(
    input.activeTurnId
      && input.activeThreadRunning
      && input.isQueueingEnabled
      && input.submitButtonMode === "queue",
  );
}

export function shouldPromptPausedQueueSubmit(input: {
  activeThreadId: string | null;
  queueInterrupted: boolean;
  queuedFollowUpCount: number;
  shouldQueueFollowUp: boolean;
}): boolean {
  return Boolean(
    input.activeThreadId
      && input.queueInterrupted
      && input.queuedFollowUpCount > 0
      && !input.shouldQueueFollowUp,
  );
}

export function shouldSteerQueuedFollowUp(input: {
  activeThreadId: string | null;
  activeThreadRunning: boolean;
  activeTurnId: string | null;
  threadId: string;
}): boolean {
  return Boolean(
    input.activeTurnId
      && input.activeThreadRunning
      && input.threadId === input.activeThreadId,
  );
}

export function selectNextQueuedFollowUp(input: {
  activeThreadNeedsResume?: boolean;
  activeThreadRunning: boolean;
  pendingRequestCount: number;
  previousCompletedTurnAllowsAutoDrain: boolean;
  queueInterrupted?: boolean;
  queue: QueuedFollowUp[];
}): QueuedFollowUp | null {
  if (
    input.activeThreadRunning
    || input.pendingRequestCount > 0
    || !input.previousCompletedTurnAllowsAutoDrain
    || input.queueInterrupted
  ) {
    return null;
  }
  // Desktop's host drain resumes conversations before turn/start. A notLoaded
  // thread is therefore still eligible here; the send path owns resume.
  void input.activeThreadNeedsResume;
  const firstMessage = input.queue[0] ?? null;
  if (!firstMessage || firstMessage.status !== "queued" || firstMessage.pausedReason) return null;
  return firstMessage;
}

export interface QueuedFollowUpDrainThreadState {
  threadId: string;
  activeThreadNeedsResume?: boolean;
  activeThreadRunning: boolean;
  pendingRequestCount: number;
  previousCompletedTurnAllowsAutoDrain: boolean;
  queueInterrupted?: boolean;
  queue: QueuedFollowUp[];
}

export function selectNextQueuedFollowUpDrainCandidate(
  threads: QueuedFollowUpDrainThreadState[],
): { threadId: string; message: QueuedFollowUp } | null {
  for (const thread of threads) {
    const message = selectNextQueuedFollowUp(thread);
    if (message) return { threadId: thread.threadId, message };
  }
  return null;
}

export function completedTurnAllowsQueuedFollowUpAutoDrain(
  runtime: Pick<ThreadRuntimeSlice, "items" | "latestTerminalTurn"> | null | undefined,
): boolean {
  if (!runtime) return false;
  const terminalTurn = runtime?.latestTerminalTurn ?? null;
  if (terminalTurn?.status !== "completed" || !terminalTurn.turnId) return false;
  return runtime.items.some((item) => {
    const record = item as Record<string, unknown>;
    if (record._turnId !== terminalTurn.turnId) return false;
    if (record.type === "agentMessage") return true;
    return record.type === "contextCompaction" && record.source === "manual";
  });
}

export function interruptedTerminalTurnKey(
  threadId: string | null | undefined,
  terminalTurn: TerminalTurnSnapshot | null | undefined,
): string | null {
  if (!threadId || terminalTurn?.status !== "interrupted") return null;
  return `${threadId}:${terminalTurn.turnId ?? "unknown"}`;
}

export function shouldPauseQueuedFollowUpsForInterruptedTerminalTurn(input: {
  activeThreadId: string | null;
  handledInterruptedTerminalTurnKeys: ReadonlySet<string>;
  latestTerminalTurn: TerminalTurnSnapshot | null | undefined;
  queuedFollowUpCount: number;
}): boolean {
  const key = interruptedTerminalTurnKey(input.activeThreadId, input.latestTerminalTurn);
  return Boolean(
    key
      && input.queuedFollowUpCount > 0
      && !input.handledInterruptedTerminalTurnKeys.has(key),
  );
}

export function pendingSteerRestorePausedReason(input: {
  clientUserMessageId: string;
  compareKey?: PendingSteerCompareKey | null;
  runtime: Pick<ThreadRuntimeSlice, "items" | "latestTerminalTurn"> | null | undefined;
  turnId: string;
}): string | null {
  if (!input.runtime) return null;
  if (runtimeHasAcceptedSteer(input.runtime, input.clientUserMessageId, input.compareKey, input.turnId)) return null;
  const terminalTurn = input.runtime.latestTerminalTurn ?? null;
  if (terminalTurn?.turnId !== input.turnId) return null;
  return terminalTurn.status === "interrupted" ? INTERRUPTED_STEER_PAUSED_REASON : RUN_ENDED_STEER_PAUSED_REASON;
}

export function runtimeHasAcceptedSteer(
  runtime: Pick<ThreadRuntimeSlice, "items">,
  clientUserMessageId: string,
  compareKey?: PendingSteerCompareKey | null,
  turnId?: string | null,
): boolean {
  return runtime.items.some((item) => {
    const record = item as Record<string, unknown>;
    if (record.type !== "userMessage") return false;
    if (typeof record._localId === "string" && record._localId.length > 0) return false;
    if (record.clientId === clientUserMessageId) return true;
    if (!compareKey) return false;
    const itemTurnId = typeof record._turnId === "string" ? record._turnId : null;
    if (turnId && itemTurnId && itemTurnId !== turnId) return false;
    return pendingSteerCompareKeysEqual(compareKey, pendingSteerCompareKeyFromUserInput(record.content));
  });
}

export function pendingSteerCompareKeyFromUserInput(input: unknown): PendingSteerCompareKey {
  const parts = Array.isArray(input) ? input : typeof input === "string" ? [{ type: "text", text: input }] : [];
  const rawTextParts: string[] = [];
  let imageCount = 0;
  for (const part of parts) {
    if (typeof part === "string") {
      rawTextParts.push(part);
      continue;
    }
    if (!part || typeof part !== "object") continue;
    const record = part as Record<string, unknown>;
    if (record.type === "text" || typeof record.text === "string") {
      if (typeof record.text === "string") rawTextParts.push(record.text);
      continue;
    }
    if (record.type === "image" || record.type === "localImage") {
      imageCount += 1;
    }
  }
  return {
    rawText: rawTextParts.join("\n").replace(/\r\n?/g, "\n").trim(),
    imageCount,
  };
}

function pendingSteerCompareKeysEqual(
  left: PendingSteerCompareKey,
  right: PendingSteerCompareKey,
): boolean {
  return left.rawText === right.rawText && left.imageCount === right.imageCount;
}

export function turnStartOptionsFromComposerMode(
  mode: ComposerMode,
  collaborationModes: CollaborationModeMask[],
  context: ThreadContextDefaults | null | undefined,
): TurnStartOptions | null {
  const collaborationMode = collaborationModeFromComposerMode(mode, collaborationModes, context);
  return collaborationMode ? { collaborationMode } : null;
}

export function composerModeRequiresUnavailablePlanMode(
  mode: ComposerMode,
  options: TurnStartOptions | null | undefined,
): boolean {
  return mode === "plan" && !options?.collaborationMode;
}

export function shouldResetCreatedThreadComposerMode(mode: ComposerMode): boolean {
  return mode === "default";
}
