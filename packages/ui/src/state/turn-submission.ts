import type { CollaborationModeMask } from "@hicodex/codex-protocol";
import type { ThreadContextDefaults } from "./codex-reducer";
import { collaborationModeFromComposerMode } from "./collaboration-modes";
import type { ComposerMode, ComposerSubmitState } from "./composer-workflow";
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
  queue: QueuedFollowUp[];
}): QueuedFollowUp | null {
  if (input.activeThreadRunning || input.activeThreadNeedsResume || input.pendingRequestCount > 0) return null;
  return input.queue.find((message) => message.status === "queued") ?? null;
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
