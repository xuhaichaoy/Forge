import {
  PLAN_MODE_UNAVAILABLE_MESSAGE,
  composerModeRequiresUnavailablePlanMode,
  selectNextQueuedFollowUp,
  shouldResetCreatedThreadComposerMode,
  shouldQueueComposerFollowUp,
  shouldSteerQueuedFollowUp,
  turnStartOptionsFromComposerMode,
} from "../src/state/turn-submission";

export default function runTurnSubmissionTests(): void {
  detectsQueuedFollowUpSubmissions();
  detectsQueuedFollowUpSteering();
  selectsNextQueuedFollowUp();
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
  const sending = queuedFollowUp("sending", "sending");
  const queued = queuedFollowUp("queued", "queued");
  assertDeepEqual(
    selectNextQueuedFollowUp({
      activeThreadRunning: false,
      pendingRequestCount: 0,
      queue: [paused, sending, queued],
    }),
    queued,
    "auto drain should skip paused and sending queued follow-ups",
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
    null,
    "auto drain should wait while the active thread needs reconnect resume",
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
