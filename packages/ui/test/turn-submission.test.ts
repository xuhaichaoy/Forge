import type { UserInput } from "@forge/codex-protocol";
import {
  PLAN_MODE_UNAVAILABLE_MESSAGE,
  composerModeRequiresUnavailablePlanMode,
  pendingSteerCompareKeyFromUserInput,
  pendingSteerRestorePausedReason,
  runtimeHasAcceptedSteer,
  selectNextQueuedFollowUpDrainCandidate,
  selectNextQueuedFollowUp,
  shouldPauseQueuedFollowUpsForInterruptedTerminalTurn,
  shouldPromptPausedQueueSubmit,
  shouldResetCreatedThreadComposerMode,
  shouldQueueComposerFollowUp,
  shouldSteerQueuedFollowUp,
  turnStartOptionsFromComposerMode,
} from "../src/state/turn-submission";

export default function runTurnSubmissionTests(): void {
  detectsQueuedFollowUpSubmissions();
  detectsQueuedFollowUpSteering();
  selectsNextQueuedFollowUp();
  selectsNextQueuedFollowUpDrainCandidate();
  detectsPendingSteerRestoreReason();
  detectsInterruptedTerminalQueuePause();
  detectsPausedQueueSubmitPromptGate();
  projectsTurnStartOptionsFromComposerMode();
  detectsUnavailablePlanMode();
  detectsCreatedThreadComposerModeResetGate();
}

function detectsQueuedFollowUpSubmissions(): void {
  assertEqual(
    shouldQueueComposerFollowUp({
      activeTurnId: "turn-1",
      activeThreadRunning: true,
      isQueueingEnabled: true,
      submitButtonMode: "queue",
    }),
    true,
    "running active turn with queue button should enqueue a follow-up",
  );
  assertEqual(
    shouldQueueComposerFollowUp({
      activeTurnId: null,
      activeThreadRunning: true,
      isQueueingEnabled: true,
      submitButtonMode: "queue",
    }),
    false,
    "queue mode still requires an active turn id",
  );
  assertEqual(
    shouldQueueComposerFollowUp({
      activeTurnId: "turn-1",
      activeThreadRunning: true,
      isQueueingEnabled: false,
      submitButtonMode: "queue",
    }),
    false,
    "disabled queueing should steer instead of enqueueing",
  );
  assertEqual(
    shouldQueueComposerFollowUp({
      activeTurnId: "turn-1",
      activeThreadRunning: false,
      isQueueingEnabled: false,
      submitButtonMode: "send",
    }),
    false,
    "idle send mode should start a normal turn",
  );
}

function detectsQueuedFollowUpSteering(): void {
  assertEqual(
    shouldSteerQueuedFollowUp({
      activeThreadId: "thread-1",
      activeThreadRunning: true,
      activeTurnId: "turn-1",
      threadId: "thread-1",
    }),
    true,
    "queued follow-up should steer the active running thread",
  );
  assertEqual(
    shouldSteerQueuedFollowUp({
      activeThreadId: "thread-2",
      activeThreadRunning: true,
      activeTurnId: "turn-1",
      threadId: "thread-1",
    }),
    false,
    "queued follow-up should start a turn for a different thread",
  );
  assertEqual(
    shouldSteerQueuedFollowUp({
      activeThreadId: "thread-1",
      activeThreadRunning: false,
      activeTurnId: "turn-1",
      threadId: "thread-1",
    }),
    false,
    "queued follow-up should not steer when the active thread is idle",
  );
}

function selectsNextQueuedFollowUp(): void {
  const paused = queuedFollowUp("paused", "paused");
  const pausedReason = { ...queuedFollowUp("queued", "paused-reason"), pausedReason: "Interrupted before the steer was accepted." };
  const queued = queuedFollowUp("queued", "queued");
  assertDeepEqual(
    selectNextQueuedFollowUp({
      activeThreadRunning: false,
      pendingRequestCount: 0,
      queue: [pausedReason, queued],
    }),
    null,
    "auto drain should not skip a queue-head follow-up paused by reason",
  );
  assertDeepEqual(
    selectNextQueuedFollowUp({
      activeThreadRunning: false,
      pendingRequestCount: 0,
      queue: [paused, queued],
    }),
    null,
    "auto drain should not skip a paused queue-head follow-up",
  );
  assertDeepEqual(
    selectNextQueuedFollowUp({
      activeThreadRunning: false,
      pendingRequestCount: 0,
      queue: [queuedFollowUp("sending", "sending"), queued],
    }),
    null,
    "auto drain should not send a legacy sending queue-head item",
  );
  assertDeepEqual(
    selectNextQueuedFollowUp({
      activeThreadRunning: false,
      pendingRequestCount: 0,
      queue: [queued, queuedFollowUp("sending", "legacy-sending")],
    }),
    queued,
    "auto drain should not use persisted sending items as the double-send guard",
  );
  assertDeepEqual(
    selectNextQueuedFollowUp({
      activeThreadRunning: true,
      pendingRequestCount: 0,
      queue: [queued],
    }),
    null,
    "auto drain should wait while the active thread is running",
  );
  assertDeepEqual(
    selectNextQueuedFollowUp({
      activeThreadRunning: false,
      activeThreadNeedsResume: true,
      pendingRequestCount: 0,
      queue: [queued],
    }),
    queued,
    "auto drain should select a queued follow-up whose thread needs resume",
  );
  assertDeepEqual(
    selectNextQueuedFollowUp({
      activeThreadRunning: false,
      pendingRequestCount: 1,
      queue: [queued],
    }),
    null,
    "auto drain should wait while a pending request needs user input",
  );
  assertDeepEqual(
    selectNextQueuedFollowUp({
      activeThreadRunning: false,
      pendingRequestCount: 0,
      queueInterrupted: true,
      queue: [queued],
    }),
    null,
    "auto drain should wait while the queue is paused after an interruption",
  );
}

function selectsNextQueuedFollowUpDrainCandidate(): void {
  const firstThreadQueued = queuedFollowUp("queued", "first");
  const secondThreadQueued = queuedFollowUp("queued", "second");
  const candidate = selectNextQueuedFollowUpDrainCandidate([
    {
      threadId: "thread-running",
      activeThreadRunning: true,
      pendingRequestCount: 0,
      queue: [firstThreadQueued],
    },
    {
      threadId: "thread-pending",
      activeThreadRunning: false,
      pendingRequestCount: 1,
      queue: [firstThreadQueued],
    },
    {
      threadId: "thread-ready",
      activeThreadRunning: false,
      activeThreadNeedsResume: true,
      pendingRequestCount: 0,
      queue: [secondThreadQueued],
    },
  ]);

  assertDeepEqual(
    candidate,
    { threadId: "thread-ready", message: secondThreadQueued },
    "global drain should pick the first thread whose queue can send",
  );
}

function detectsPendingSteerRestoreReason(): void {
  const content: UserInput[] = [{ type: "text", text: "continue", text_elements: [] }];
  const compareKey = pendingSteerCompareKeyFromUserInput(content);
  assertEqual(
    runtimeHasAcceptedSteer({
      items: [{ type: "userMessage", id: "server-user", clientId: "client-1", content }],
    }, "client-1"),
    true,
    "matching clientUserMessageId should accept the pending steer",
  );
  assertEqual(
    runtimeHasAcceptedSteer({
      items: [{ type: "userMessage", id: "server-user", clientId: null, content, _turnId: "turn-1" }],
    }, "client-1", compareKey, "turn-1"),
    true,
    "same-turn confirmed user content should accept the pending steer by Desktop compareKey fallback",
  );
  assertEqual(
    runtimeHasAcceptedSteer({
      items: [{
        type: "userMessage",
        id: "optimistic-user",
        content,
        _localId: "optimistic-user:client-1",
        _turnId: "turn-1",
      }],
    }, "client-1", compareKey, "turn-1"),
    false,
    "same-turn optimistic user content must not accept its own pending steer by compareKey",
  );
  assertEqual(
    runtimeHasAcceptedSteer({
      items: [{ type: "userMessage", id: "server-user", clientId: null, content, _turnId: "turn-2" }],
    }, "client-1", compareKey, "turn-1"),
    false,
    "different-turn confirmed user content should not accept the pending steer by compareKey",
  );
  assertEqual(
    pendingSteerRestorePausedReason({
      clientUserMessageId: "client-1",
      compareKey,
      turnId: "turn-1",
      runtime: {
        items: [],
        latestTerminalTurn: { turnId: "turn-1", status: "interrupted" },
      },
    }),
    "Interrupted before the steer was accepted.",
    "interrupted terminal turn should restore the pending steer with Desktop's interrupted reason",
  );
  assertEqual(
    pendingSteerRestorePausedReason({
      clientUserMessageId: "client-1",
      compareKey,
      turnId: "turn-1",
      runtime: {
        items: [],
        latestTerminalTurn: { turnId: "turn-1", status: "completed" },
      },
    }),
    "Run ended before the steer was accepted.",
    "non-interrupted terminal turn should restore the pending steer with Desktop's run-ended reason",
  );
  assertEqual(
    pendingSteerRestorePausedReason({
      clientUserMessageId: "client-1",
      compareKey,
      turnId: "turn-1",
      runtime: {
        items: [{
          type: "userMessage",
          id: "optimistic-user",
          content,
          _localId: "optimistic-user:client-1",
          _turnId: "turn-1",
        }],
        latestTerminalTurn: { turnId: "turn-1", status: "interrupted" },
      },
    }),
    "Interrupted before the steer was accepted.",
    "optimistic self-match should still restore the pending steer after interruption",
  );
  assertEqual(
    pendingSteerRestorePausedReason({
      clientUserMessageId: "client-1",
      compareKey,
      turnId: "turn-1",
      runtime: {
        items: [{ type: "userMessage", id: "server-user", clientId: null, content, _turnId: "turn-1" }],
        latestTerminalTurn: { turnId: "turn-1", status: "interrupted" },
      },
    }),
    null,
    "accepted steer should not be restored after terminal turn",
  );
}

function detectsInterruptedTerminalQueuePause(): void {
  const interrupted = { turnId: "turn-1", status: "interrupted" as const };
  const handled = new Set(["thread-1:turn-1"]);

  assertEqual(
    shouldPauseQueuedFollowUpsForInterruptedTerminalTurn({
      activeThreadId: "thread-1",
      handledInterruptedTerminalTurnKeys: new Set(),
      latestTerminalTurn: interrupted,
      queuedFollowUpCount: 1,
    }),
    true,
    "interrupted terminal turn should pause a non-empty queue before auto drain",
  );
  assertEqual(
    shouldPauseQueuedFollowUpsForInterruptedTerminalTurn({
      activeThreadId: "thread-1",
      handledInterruptedTerminalTurnKeys: handled,
      latestTerminalTurn: interrupted,
      queuedFollowUpCount: 1,
    }),
    false,
    "handled interrupted terminal turn should not re-pause after Resume",
  );
  assertEqual(
    shouldPauseQueuedFollowUpsForInterruptedTerminalTurn({
      activeThreadId: "thread-1",
      handledInterruptedTerminalTurnKeys: new Set(),
      latestTerminalTurn: { turnId: "turn-1", status: "completed" },
      queuedFollowUpCount: 1,
    }),
    false,
    "completed terminal turn should not pause the queue",
  );
  assertEqual(
    shouldPauseQueuedFollowUpsForInterruptedTerminalTurn({
      activeThreadId: "thread-1",
      handledInterruptedTerminalTurnKeys: new Set(),
      latestTerminalTurn: interrupted,
      queuedFollowUpCount: 0,
    }),
    false,
    "empty queue should not surface an interrupted queue pause",
  );
}

function detectsPausedQueueSubmitPromptGate(): void {
  assertEqual(
    shouldPromptPausedQueueSubmit({
      activeThreadId: "thread-1",
      queueInterrupted: true,
      queuedFollowUpCount: 2,
      shouldQueueFollowUp: false,
    }),
    true,
    "sending a new non-queue message while an interrupted queue is paused should prompt",
  );
  assertEqual(
    shouldPromptPausedQueueSubmit({
      activeThreadId: "thread-1",
      queueInterrupted: true,
      queuedFollowUpCount: 2,
      shouldQueueFollowUp: true,
    }),
    false,
    "queueing another follow-up should not show the paused-queue send confirmation",
  );
  assertEqual(
    shouldPromptPausedQueueSubmit({
      activeThreadId: "thread-1",
      queueInterrupted: false,
      queuedFollowUpCount: 2,
      shouldQueueFollowUp: false,
    }),
    false,
    "unpaused queues should not show the paused-queue send confirmation",
  );
  assertEqual(
    shouldPromptPausedQueueSubmit({
      activeThreadId: null,
      queueInterrupted: true,
      queuedFollowUpCount: 2,
      shouldQueueFollowUp: false,
    }),
    false,
    "new-thread submissions have no paused active-thread queue to confirm",
  );
}

function projectsTurnStartOptionsFromComposerMode(): void {
  const planMode = {
    name: "Plan",
    mode: "plan",
    model: null,
    reasoning_effort: "medium",
  } as const;

  assertDeepEqual(
    turnStartOptionsFromComposerMode("default", [planMode], null),
    null,
    "default composer mode should not attach a collaboration mode override",
  );
  assertDeepEqual(
    turnStartOptionsFromComposerMode("plan", [planMode], { model: "gpt-5.4" }),
    {
      collaborationMode: {
        mode: "plan",
        settings: {
          model: "gpt-5.4",
          reasoning_effort: "medium",
          developer_instructions: null,
        },
      },
    },
    "plan composer mode should attach the app-server plan collaboration mode",
  );
  assertDeepEqual(
    turnStartOptionsFromComposerMode("plan", [planMode], null),
    null,
    "plan composer mode should not attach a collaboration mode when no model source is available",
  );
}

function detectsUnavailablePlanMode(): void {
  assertEqual(
    composerModeRequiresUnavailablePlanMode("plan", null),
    true,
    "plan mode should be blocked when app-server did not expose a plan preset",
  );
  assertEqual(
    composerModeRequiresUnavailablePlanMode("default", null),
    false,
    "default mode should not be blocked by missing plan preset",
  );
  assertEqual(
    PLAN_MODE_UNAVAILABLE_MESSAGE,
    "Plan mode is unavailable until collaboration modes load from app-server",
    "shared warning should stay stable across direct and queued submissions",
  );
}

function detectsCreatedThreadComposerModeResetGate(): void {
  assertEqual(
    shouldResetCreatedThreadComposerMode("default"),
    true,
    "default new-thread submission should reset explicit draft mode",
  );
  assertEqual(
    shouldResetCreatedThreadComposerMode("plan"),
    false,
    "plan new-thread submission should preserve the collaboration-derived mode",
  );
}

function queuedFollowUp(status: "queued" | "sending" | "paused", id: string) {
  return {
    id,
    text: id,
    attachments: [],
    cwd: "/tmp/project",
    createdAt: 1,
    status,
  };
}

function assertEqual<T>(actual: T, expected: T, message: string): void {
  if (actual !== expected) {
    throw new Error(`${message}: expected ${String(expected)}, got ${String(actual)}`);
  }
}

function assertDeepEqual(actual: unknown, expected: unknown, message: string): void {
  const actualJson = JSON.stringify(actual);
  const expectedJson = JSON.stringify(expected);
  if (actualJson !== expectedJson) {
    throw new Error(`${message}: expected ${expectedJson}, got ${actualJson}`);
  }
}
