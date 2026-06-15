import { humanizeRrule } from "../src/lib/rrule-format";
import {
  AUTOMATIONS_FUTURE_HOOKS,
  focusedAutomationSchedule,
  projectActiveThreadAutomation,
  projectHeartbeatAutomationEligibility,
  projectAutomationsSurface,
} from "../src/state/automations-viewer";

export default function runAutomationsViewerTests(): void {
  projectsLoadingStateBeforeEndpointReturns();
  projectsUnsupportedStateWithoutFakeData();
  projectsEmptyReadOnlyStateFromEndpointPayload();
  projectsRealSchedulesWhenProvided();
  // CODEX-REF: legacy multi-list automation 已删除，仅保留 single-entry
  // projectActiveThreadAutomation 测试覆盖 heartbeat-ACTIVE-target-thread filter。
  projectsActiveThreadAutomationForRightRailSection();
  // codex: $i(rawRrule) — humanizeRrule must turn RRULE bodies into English
  // text while falling back to the original string for cron / free-form input.
  humanizesRruleStringsForRightRailSummary();
  projectsHeartbeatAutomationEligibility();
  // codex: citation chip `ke` deep-link — the surface model carries the focus
  // target so the panel can scope to the specific automation.
  carriesDeepLinkFocusTargetThroughEveryState();
  resolvesFocusedAutomationScheduleById();
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

  // codex automation-schedule-*.js — `rruleSummary` is Codex's STRUCTURED schedule
  // label, NOT rrule's prose toText(); "FREQ=HOURLY" → "Hourly" (not "every hour"),
  // matching Desktop's automation summary wording. `status` is threaded through so
  // the rail "Next run" tooltip can render "-" for PAUSED (codex `Ao({status})`).
  assertDeepEqual(
    projectActiveThreadAutomation(model, "thread-1"),
    {
      id: "heartbeat-active",
      name: "Thread heartbeat",
      rruleSummary: "Hourly",
      nextRunAtMs: Date.parse(isoNextRun),
      status: "ACTIVE",
    },
    "right rail automation section should humanize the heartbeat RRULE and carry status for the current thread",
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

// codex automation-schedule-*.js `dn`/`At`/`mn` — humanizeRrule contract:
//   RRULE body / RRULE-prefixed → Codex STRUCTURED label ("Daily", "Hourly",
//     "Weekdays", "Weekends", "{days} at {time}", "Every {n}h/m")
//   MINUTELY 60/1440/10080      → "Hourly"/"Daily"/"Weekly" (mn normalization)
//   multi-weekday               → Sunday-first conjunction / "Mon-Fri" range (At)
//   cron / free-form / MONTHLY  → null (Codex renders "Custom schedule" fallback)
//   null / empty / whitespace   → null (caller omits the field)
function humanizesRruleStringsForRightRailSummary(): void {
  // single weekday + BYHOUR → "{days} at {time}" (e.g. "Mondays at 9:00 AM").
  // codex `At` length===1 long-style → plural day name.
  const weekly = humanizeRrule("FREQ=WEEKLY;BYDAY=MO;BYHOUR=9");
  assertEqual(
    typeof weekly === "string" && /^Mondays at /.test(weekly),
    true,
    "single-weekday RRULE should humanize to 'Mondays at {time}'",
  );

  // Mon–Fri → "Weekdays"
  assertEqual(
    humanizeRrule("FREQ=WEEKLY;BYDAY=MO,TU,WE,TH,FR"),
    "Weekdays",
    "Mon-Fri RRULE should humanize to Codex's 'Weekdays' label",
  );

  // Sat+Sun → "Weekends"
  assertEqual(
    humanizeRrule("FREQ=WEEKLY;BYDAY=SA,SU"),
    "Weekends",
    "Sat-Sun RRULE should humanize to Codex's 'Weekends' label",
  );

  // codex `At`/`jt` — exactly two non-weekend days use a singular long-name
  // conjunction list, Sunday-first ("Sunday and Friday", NOT "Fridays, Sundays").
  assertEqual(
    humanizeRrule("FREQ=WEEKLY;BYDAY=FR,SU"),
    "Sunday and Friday",
    "two arbitrary weekdays should use a Sunday-first long-name conjunction list",
  );

  // codex `At`/`It` — three-plus consecutive days fold into a short-name range.
  assertEqual(
    humanizeRrule("FREQ=WEEKLY;BYDAY=MO,TU,WE"),
    "Mon-Wed",
    "three consecutive weekdays should fold into a 'Mon-Wed' range",
  );

  // codex `At`/`jt` — three-plus non-consecutive days use a short-name conjunction
  // list (Oxford 'and'), Sunday-first.
  assertEqual(
    humanizeRrule("FREQ=WEEKLY;BYDAY=MO,WE,FR"),
    "Mon, Wed, and Fri",
    "three non-consecutive weekdays should use a short-name conjunction list",
  );

  // FREQ alone → bare interval label ("Daily" / "Hourly" / "Weekly")
  assertEqual(humanizeRrule("FREQ=DAILY"), "Daily", "FREQ=DAILY → 'Daily'");
  assertEqual(humanizeRrule("FREQ=HOURLY;INTERVAL=2"), "Every 2h", "every-2-hours RRULE → 'Every 2h'");

  // codex `mn` — equivalent MINUTELY intervals normalize to the named labels.
  assertEqual(humanizeRrule("FREQ=MINUTELY;INTERVAL=60"), "Hourly", "MINUTELY 60 → 'Hourly'");
  assertEqual(humanizeRrule("FREQ=MINUTELY;INTERVAL=1440"), "Daily", "MINUTELY 1440 → 'Daily'");
  assertEqual(humanizeRrule("FREQ=MINUTELY;INTERVAL=10080"), "Weekly", "MINUTELY 10080 → 'Weekly'");
  assertEqual(humanizeRrule("FREQ=MINUTELY;INTERVAL=30"), "Every 30m", "MINUTELY 30 → 'Every 30m'");

  // iCal-prefixed RRULE → same structured label
  assertEqual(
    humanizeRrule("RRULE:FREQ=HOURLY"),
    "Hourly",
    "iCal-prefixed RRULE should humanize to Codex's 'Hourly' label",
  );

  assertEqual(humanizeRrule(null), null, "null input should return null");
  assertEqual(humanizeRrule(undefined), null, "undefined input should return null");
  assertEqual(humanizeRrule(""), null, "empty string should return null");
  assertEqual(humanizeRrule("   "), null, "whitespace-only string should return null");

  // codex `dn` returns null for unparseable input AND for MONTHLY/YEARLY rules;
  // the rail row then renders the localized "Custom schedule" fallback.
  assertEqual(
    humanizeRrule("0 9 * * 1"),
    null,
    "cron expressions that rrule cannot parse should return null (rail shows 'Custom schedule')",
  );
  assertEqual(
    humanizeRrule("every Monday at 9am"),
    null,
    "already-humanized free-form text should return null (rail shows 'Custom schedule')",
  );
  assertEqual(
    humanizeRrule("FREQ=MONTHLY;BYMONTHDAY=1"),
    null,
    "MONTHLY RRULE should return null so the rail shows 'Custom schedule' (matches Codex dn)",
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

// codex: local-conversation-thread-*.js — the citation chip `ke` handler
// resolves a specific automation id and deep-links it (Km({automationId,…}) /
// navigate-to-route ?automationId=…). Forge threads that id onto the surface
// model as `focusedAutomationId` so the panel can scope to it. The focus target
// must survive on EVERY status (loading/offline/error/empty/ready), and empty /
// whitespace ids must normalize to null.
function carriesDeepLinkFocusTargetThroughEveryState(): void {
  const loading = projectAutomationsSurface({
    connected: true,
    loading: true,
    focusedAutomationId: "auto-7",
  });
  assertEqual(loading.status, "loading", "loading state should be unchanged by focus target");
  assertEqual(loading.focusedAutomationId, "auto-7", "loading state should still carry the focus target");

  const offline = projectAutomationsSurface({
    connected: false,
    focusedAutomationId: "auto-7",
  });
  assertEqual(offline.focusedAutomationId, "auto-7", "offline state should still carry the focus target");

  const errored = projectAutomationsSurface({
    connected: true,
    error: "boom",
    focusedAutomationId: "auto-7",
  });
  assertEqual(errored.status, "error", "error state should be unchanged by focus target");
  assertEqual(errored.focusedAutomationId, "auto-7", "error state should still carry the focus target");

  const empty = projectAutomationsSurface({
    connected: true,
    payload: { schedules: [] },
    focusedAutomationId: "auto-7",
  });
  assertEqual(empty.focusedAutomationId, "auto-7", "empty state should still carry the focus target");

  const ready = projectAutomationsSurface({
    connected: true,
    payload: { schedules: [{ id: "auto-7", name: "Digest", cron: "0 9 * * *", status: "enabled" }] },
    focusedAutomationId: "auto-7",
  });
  assertEqual(ready.status, "ready", "ready state should be unchanged by focus target");
  assertEqual(ready.focusedAutomationId, "auto-7", "ready state should carry the focus target");

  const unfocused = projectAutomationsSurface({ connected: true, payload: { schedules: [] } });
  assertEqual(
    unfocused.focusedAutomationId,
    null,
    "generic open (no citation id) should leave the focus target null",
  );

  const blank = projectAutomationsSurface({
    connected: true,
    payload: { schedules: [] },
    focusedAutomationId: "   ",
  });
  assertEqual(blank.focusedAutomationId, null, "whitespace-only focus id should normalize to null");
}

// codex: local-conversation-thread-*.js — `jm({automationId:n})` resolves the
// focused automation as `items.find(e => e.id === n) ?? null` before rendering
// the per-automation editor. `focusedAutomationSchedule` mirrors that so the
// panel scopes to exactly the deep-linked schedule, falling back to null when
// nothing is focused or the id isn't present (matching `jm`'s placeholder branch).
function resolvesFocusedAutomationScheduleById(): void {
  const model = projectAutomationsSurface({
    connected: true,
    payload: {
      schedules: [
        { id: "auto-1", name: "First", cron: "0 9 * * *", status: "enabled" },
        { id: "auto-2", name: "Second", cron: "0 18 * * *", status: "enabled" },
      ],
    },
    focusedAutomationId: "auto-2",
  });
  assertEqual(
    focusedAutomationSchedule(model)?.id,
    "auto-2",
    "resolver should return the schedule matching the focus target",
  );
  assertEqual(
    focusedAutomationSchedule(model)?.title,
    "Second",
    "resolved schedule should be the full view, not just the id",
  );

  const noFocus = projectAutomationsSurface({
    connected: true,
    payload: { schedules: [{ id: "auto-1", name: "First", cron: "0 9 * * *", status: "enabled" }] },
  });
  assertEqual(
    focusedAutomationSchedule(noFocus),
    null,
    "resolver should return null when nothing is focused",
  );

  const missing = projectAutomationsSurface({
    connected: true,
    payload: { schedules: [{ id: "auto-1", name: "First", cron: "0 9 * * *", status: "enabled" }] },
    focusedAutomationId: "auto-404",
  });
  assertEqual(
    focusedAutomationSchedule(missing),
    null,
    "resolver should return null when the focus id is not in the loaded schedules (deleted / still loading)",
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
