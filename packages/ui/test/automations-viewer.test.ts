import { humanizeRrule } from "../src/lib/rrule-format";
import {
  AUTOMATIONS_FUTURE_HOOKS,
  projectActiveThreadAutomation,
  projectAutomationRailEntries,
  projectHeartbeatAutomationEligibility,
  projectAutomationsSurface,
} from "../src/state/automations-viewer";

export default function runAutomationsViewerTests(): void {
  projectsLoadingStateBeforeEndpointReturns();
  projectsUnsupportedStateWithoutFakeData();
  projectsEmptyReadOnlyStateFromEndpointPayload();
  projectsRealSchedulesWhenProvided();
  projectsActiveHeartbeatAutomationsForRightRail();
  // codex: pe:automation — single-entry per-conversation automation summary
  // input for the right-rail `automation` section.
  projectsActiveThreadAutomationForRightRailSection();
  // codex: $i(rawRrule) — humanizeRrule must turn RRULE bodies into English
  // text while falling back to the original string for cron / free-form input.
  humanizesRruleStringsForRightRailSummary();
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

function projectsActiveHeartbeatAutomationsForRightRail(): void {
  const model = projectAutomationsSurface({
    connected: true,
    payload: {
      automations: [
        {
          id: "heartbeat-1",
          kind: "heartbeat",
          name: "Thread heartbeat",
          rrule: "FREQ=HOURLY",
          status: "ACTIVE",
          targetThreadId: "thread-1",
        },
        {
          id: "paused-heartbeat",
          kind: "heartbeat",
          name: "Paused heartbeat",
          rrule: "FREQ=DAILY",
          status: "PAUSED",
          targetThreadId: "thread-1",
        },
        {
          id: "cron-1",
          kind: "cron",
          name: "Cron automation",
          rrule: "FREQ=DAILY",
          status: "ACTIVE",
          targetThreadId: "thread-1",
        },
        {
          id: "other-thread",
          kind: "heartbeat",
          name: "Other thread",
          rrule: "FREQ=WEEKLY",
          status: "ACTIVE",
          targetThreadId: "thread-2",
        },
      ],
    },
  });

  assertDeepEqual(
    projectAutomationRailEntries(model, "thread-1"),
    [{ id: "automation:heartbeat-1", title: "Thread heartbeat", meta: "FREQ=HOURLY" }],
    "right rail should project only the active heartbeat automation for the current thread",
  );
}

// codex: pe:automation — single-entry per-conversation automation summary.
// Verifies the same heartbeat-active-targeted-thread filter as the rail-list
// projection, plus the ISO->ms tooltip conversion that drives the
// `Next run: …` title on the rail row.
function projectsActiveThreadAutomationForRightRailSection(): void {
  const isoNextRun = "2026-05-23T09:00:00.000Z";
  const model = projectAutomationsSurface({
    connected: true,
    payload: {
      automations: [
        {
          id: "paused-heartbeat",
          kind: "heartbeat",
          name: "Paused heartbeat",
          rrule: "FREQ=DAILY",
          status: "PAUSED",
          targetThreadId: "thread-1",
        },
        {
          id: "heartbeat-active",
          kind: "heartbeat",
          name: "Thread heartbeat",
          rrule: "FREQ=HOURLY",
          status: "ACTIVE",
          targetThreadId: "thread-1",
          nextRunAt: isoNextRun,
        },
        {
          id: "other-thread",
          kind: "heartbeat",
          name: "Other thread",
          rrule: "FREQ=WEEKLY",
          status: "ACTIVE",
          targetThreadId: "thread-2",
        },
      ],
    },
  });

  // codex: $i(rawRrule) — `rruleSummary` is now the humanized text from
  // `rrule.toText()`; "FREQ=HOURLY" becomes "every hour" so the rail row
  // matches Desktop's automation summary wording.
  assertDeepEqual(
    projectActiveThreadAutomation(model, "thread-1"),
    {
      id: "heartbeat-active",
      name: "Thread heartbeat",
      rruleSummary: "every hour",
      nextRunAtMs: Date.parse(isoNextRun),
    },
    "right rail automation section should humanize the heartbeat RRULE for the current thread",
  );

  assertEqual(
    projectActiveThreadAutomation(model, null),
    null,
    "automation section input should be null when no conversation is active",
  );

  assertEqual(
    projectActiveThreadAutomation(model, "thread-without-heartbeat"),
    null,
    "automation section input should be null when no heartbeat targets the thread",
  );
}

// codex: $i(rawRrule) — humanizeRrule contract:
//   RRULE body / RRULE-prefixed → humanized English ("every week on …")
//   cron / free-form text       → returned as-is (rrule cannot parse)
//   null / empty / whitespace   → null (caller omits the field)
function humanizesRruleStringsForRightRailSummary(): void {
  const weekly = humanizeRrule("FREQ=WEEKLY;BYDAY=MO;BYHOUR=9");
  assertEqual(
    typeof weekly === "string" && /every/i.test(weekly) && /week/i.test(weekly),
    true,
    "RRULE body should be humanized into English containing 'every' and 'week'",
  );

  const weekdays = humanizeRrule("FREQ=WEEKLY;BYDAY=MO,TU,WE,TH,FR");
  assertEqual(
    typeof weekdays === "string" && /weekday/i.test(weekdays),
    true,
    "Mon-Fri RRULE should humanize to text mentioning 'weekday'",
  );

  const prefixed = humanizeRrule("RRULE:FREQ=HOURLY");
  assertEqual(
    typeof prefixed === "string" && /every/i.test(prefixed) && /hour/i.test(prefixed),
    true,
    "iCal-prefixed RRULE should still humanize to 'every hour'-style text",
  );

  assertEqual(humanizeRrule(null), null, "null input should return null");
  assertEqual(humanizeRrule(undefined), null, "undefined input should return null");
  assertEqual(humanizeRrule(""), null, "empty string should return null");
  assertEqual(humanizeRrule("   "), null, "whitespace-only string should return null");

  assertEqual(
    humanizeRrule("0 9 * * 1"),
    "0 9 * * 1",
    "cron expressions that rrule cannot parse should fall back to the raw string",
  );
  assertEqual(
    humanizeRrule("every Monday at 9am"),
    "every Monday at 9am",
    "already-humanized text should be returned unchanged",
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
