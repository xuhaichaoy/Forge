import {
  AUTOMATIONS_FUTURE_HOOKS,
  projectHeartbeatAutomationEligibility,
  projectAutomationsSurface,
} from "../src/state/automations-viewer";

export default function runAutomationsViewerTests(): void {
  projectsLoadingStateBeforeEndpointReturns();
  projectsUnsupportedStateWithoutFakeData();
  projectsEmptyReadOnlyStateFromEndpointPayload();
  projectsRealSchedulesWhenProvided();
  projectsHeartbeatAutomationEligibility();
}

function projectsLoadingStateBeforeEndpointReturns(): void {
  const model = projectAutomationsSurface({
    connected: true,
    loading: true,
  });

  assertEqual(model.status, "loading", "loading state should be explicit");
  assertEqual(model.schedules.length, 0, "loading state should not invent schedules");
  assertEqual(model.heartbeatEligibility, null, "loading state should omit heartbeat eligibility when not provided");
}

function projectsUnsupportedStateWithoutFakeData(): void {
  const model = projectAutomationsSurface({
    connected: true,
    error: "method not found: automation/list",
  });

  assertEqual(model.status, "unsupported", "missing endpoint should be an unsupported state");
  assertEqual(model.schedules.length, 0, "unsupported state should not invent schedules");
  assertDeepEqual(model.futureHooks, AUTOMATIONS_FUTURE_HOOKS, "future hooks should be explicit");
}

function projectsEmptyReadOnlyStateFromEndpointPayload(): void {
  const model = projectAutomationsSurface({
    connected: true,
    payload: { schedules: [] },
  });

  assertEqual(model.status, "empty", "empty endpoint payload should stay read-only empty");
  assertEqual(model.schedules.length, 0, "empty payload should not invent schedules");
}

function projectsRealSchedulesWhenProvided(): void {
  const model = projectAutomationsSurface({
    connected: true,
    payload: {
      schedules: [
        {
          automationId: "auto-1",
          name: "Daily digest",
          cron: "0 9 * * *",
          timezone: "Asia/Shanghai",
          next_run_at: "2026-05-17T09:00:00+08:00",
          status: "enabled",
        },
      ],
    },
    heartbeat: {
      hasConversation: true,
      latestTurnId: "turn-1",
      latestTurnStatus: "completed",
      resumeState: "resumed",
    },
  });

  assertEqual(model.status, "ready", "real endpoint payload should project ready state");
  assertDeepEqual(
    model.heartbeatEligibility,
    { isEligible: true, reason: null },
    "surface should carry active-thread heartbeat eligibility",
  );
  assertDeepEqual(
    model.schedules[0],
    {
      id: "auto-1",
      title: "Daily digest",
      status: "enabled",
      schedule: "0 9 * * *",
      timezone: "Asia/Shanghai",
      nextRunAt: "2026-05-17T09:00:00+08:00",
    },
    "real schedule fields should be preserved",
  );
}

function projectsHeartbeatAutomationEligibility(): void {
  assertDeepEqual(
    projectHeartbeatAutomationEligibility({
      hasConversation: false,
      resumeState: "resumed",
    }),
    { isEligible: false, reason: "missing_conversation" },
    "heartbeat needs an active conversation",
  );
  assertDeepEqual(
    projectHeartbeatAutomationEligibility({
      hasConversation: true,
      hostSupported: false,
      latestTurnId: "turn-1",
      latestTurnStatus: "completed",
      resumeState: "resumed",
    }),
    { isEligible: false, reason: "unsupported_host" },
    "heartbeat requires a supported local host",
  );
  assertDeepEqual(
    projectHeartbeatAutomationEligibility({
      hasConversation: true,
      latestTurnId: null,
      latestTurnStatus: null,
      resumeState: "resuming",
    }),
    { isEligible: false, reason: "resuming" },
    "heartbeat waits for a resumable conversation to finish resuming",
  );
  assertDeepEqual(
    projectHeartbeatAutomationEligibility({
      hasConversation: true,
      latestTurnId: "turn-1",
      latestTurnStatus: "completed",
      pendingRequestType: "userInput",
      resumeState: "resumed",
    }),
    { isEligible: false, reason: "waiting_on_user_input" },
    "heartbeat should not attach while app-server is waiting for user input",
  );
  assertDeepEqual(
    projectHeartbeatAutomationEligibility({
      hasConversation: true,
      latestTurnId: "turn-1",
      latestTurnStatus: "inProgress",
      resumeState: "resumed",
    }),
    { isEligible: false, reason: "turn_in_progress" },
    "heartbeat should not attach while a turn is running",
  );
  assertDeepEqual(
    projectHeartbeatAutomationEligibility({
      hasConversation: true,
      latestTurnId: "turn-1",
      latestTurnStatus: "completed",
      resumeState: "resumed",
    }),
    { isEligible: true, reason: null },
    "heartbeat should be eligible after a completed local turn with no pending request",
  );
}

function assertEqual<T>(actual: T, expected: T, message: string): void {
  if (actual !== expected) {
    throw new Error(`${message}: expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`);
  }
}

function assertDeepEqual<T>(actual: T, expected: T, message: string): void {
  const actualJson = JSON.stringify(actual);
  const expectedJson = JSON.stringify(expected);
  if (actualJson !== expectedJson) {
    throw new Error(`${message}: expected ${expectedJson}, got ${actualJson}`);
  }
}
