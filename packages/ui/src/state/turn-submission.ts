import type { CollaborationModeMask } from "@forge/codex-protocol";
import type { ThreadContextDefaults } from "./codex-reducer";
import { collaborationModeFromComposerMode } from "./collaboration-modes";
import type { ComposerMode, ComposerSubmitState } from "./composer-workflow";
import type { TerminalTurnSnapshot } from "./codex-ui-types";
import type { QueuedFollowUp } from "./queued-followups";
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
  queueInterrupted?: boolean;
  queue: QueuedFollowUp[];
}): QueuedFollowUp | null {
  if (
    input.activeThreadRunning
    || input.activeThreadNeedsResume
    || input.pendingRequestCount > 0
    || input.queueInterrupted
  ) {
    return null;
  }
  // A follow-up flips to "sending" before its turn/start round-trips, so the
  // thread still reads as idle here. Draining past it would double-send.
  if (input.queue.some((message) => message.status === "sending")) return null;
  return input.queue.find((message) => message.status === "queued") ?? null;
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
