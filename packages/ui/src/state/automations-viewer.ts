import { humanizeRrule } from "../lib/rrule-format";
import type { RailEntry } from "./render-groups";
// codex: local-conversation-thread-CecHj6JI.js#pe — single-entry per-conversation
// automation summary input shape lives on `right-rail.ts`; the projection
// converts the heartbeat schedule view into that shape.
import type { RightRailAutomationInput } from "./right-rail";

export type AutomationsSurfaceStatus = "loading" | "offline" | "unsupported" | "empty" | "ready" | "error";

export interface AutomationScheduleView {
  id: string;
  kind?: string | null;
  title: string;
  status: string;
  schedule: string;
  targetThreadId?: string | null;
  timezone?: string | null;
  nextRunAt?: string | null;
}

export interface AutomationsSurfaceModel {
  status: AutomationsSurfaceStatus;
  title: string;
  message: string;
  schedules: AutomationScheduleView[];
  heartbeatEligibility: HeartbeatAutomationEligibility | null;
  futureHooks: string[];
}

export interface ProjectAutomationsSurfaceInput {
  connected: boolean;
  loading?: boolean;
  payload?: unknown;
  error?: string | null;
  heartbeat?: ProjectHeartbeatAutomationEligibilityInput | null;
}

export const AUTOMATIONS_FUTURE_HOOKS = [
  "automation/list",
  "automation/schedule/list",
  "automation/heartbeat/status",
];

export type HeartbeatAutomationIneligibleReason =
  | "missing_conversation"
  | "unsupported_host"
  | "resuming"
  | "waiting_on_user_input"
  | "waiting_on_approval"
  | "missing_turn"
  | "turn_in_progress"
  | "pending_request";

export interface HeartbeatAutomationEligibility {
  isEligible: boolean;
  reason: HeartbeatAutomationIneligibleReason | null;
}

export type HeartbeatAutomationPendingRequestType =
  | "userInput"
  | "approval"
  | "mcpServerElicitation"
  | "other";

export interface ProjectHeartbeatAutomationEligibilityInput {
  hasConversation: boolean;
  hostSupported?: boolean;
  latestTurnId?: string | null;
  latestTurnStatus?: "inProgress" | "completed" | "failed" | "cancelled" | string | null;
  pendingRequestType?: HeartbeatAutomationPendingRequestType | null;
  resumeState?: "resuming" | "resumed" | string | null;
}

export function projectAutomationsSurface(
  input: ProjectAutomationsSurfaceInput,
): AutomationsSurfaceModel {
  const heartbeatEligibility = input.heartbeat
    ? projectHeartbeatAutomationEligibility(input.heartbeat)
    : null;
  if (input.loading) {
    return {
      status: "loading",
      title: "Automations",
      message: "Reading automation schedules from app-server.",
      schedules: [],
      heartbeatEligibility,
      futureHooks: AUTOMATIONS_FUTURE_HOOKS,
    };
  }

  if (!input.connected) {
    return {
      status: "offline",
      title: "Automations",
      message: "Runtime is offline. Schedules cannot be read until app-server is connected.",
      schedules: [],
      heartbeatEligibility,
      futureHooks: AUTOMATIONS_FUTURE_HOOKS,
    };
  }

  if (input.error) {
    const unsupported = /method not found|not implemented|unsupported|unknown method/i.test(input.error);
    return {
      status: unsupported ? "unsupported" : "error",
      title: "Automations",
      message: unsupported
        ? "App-server does not expose automation management endpoints yet."
        : input.error,
      schedules: [],
      heartbeatEligibility,
      futureHooks: AUTOMATIONS_FUTURE_HOOKS,
    };
  }

  const schedules = automationSchedulesFromPayload(input.payload);
  if (!schedules) {
    return {
      status: "unsupported",
      title: "Automations",
      message: "Automation management is not available from this app-server build yet.",
      schedules: [],
      heartbeatEligibility,
      futureHooks: AUTOMATIONS_FUTURE_HOOKS,
    };
  }
  if (schedules.length === 0) {
    return {
      status: "empty",
      title: "Automations",
      message: "No schedules are registered. This surface is read-only until app-server adds automation endpoints.",
      schedules: [],
      heartbeatEligibility,
      futureHooks: AUTOMATIONS_FUTURE_HOOKS,
    };
  }
  return {
    status: "ready",
    title: "Automations",
    message: "Read-only schedule overview from app-server.",
    schedules,
    heartbeatEligibility,
    futureHooks: AUTOMATIONS_FUTURE_HOOKS,
  };
}

export function projectHeartbeatAutomationEligibility(
  input: ProjectHeartbeatAutomationEligibilityInput,
): HeartbeatAutomationEligibility {
  if (!input.hasConversation) return { isEligible: false, reason: "missing_conversation" };
  if (input.hostSupported === false) return { isEligible: false, reason: "unsupported_host" };
  if (input.resumeState === "resuming" || (input.resumeState !== "resumed" && !input.latestTurnId)) {
    return { isEligible: false, reason: "resuming" };
  }
  if (input.pendingRequestType === "userInput") return { isEligible: false, reason: "waiting_on_user_input" };
  if (input.pendingRequestType === "approval" || input.pendingRequestType === "mcpServerElicitation") {
    return { isEligible: false, reason: "waiting_on_approval" };
  }
  if (input.pendingRequestType != null) return { isEligible: false, reason: "pending_request" };
  if (!input.latestTurnStatus) return { isEligible: false, reason: "missing_turn" };
  if (input.latestTurnStatus === "inProgress") return { isEligible: false, reason: "turn_in_progress" };
  return { isEligible: true, reason: null };
}

// codex: local-conversation-thread-CecHj6JI.js#pe — `B = lo({ automations,
// conversationId })` selects the single active heartbeat automation that
// targets the current thread, and `au` renders it as Clock-icon + name +
// rrule summary, with the "Next run: …" string driven by `nextRunAtMs`.
// HiCodex reuses the same filter as `projectAutomationRailEntries` (kind ==
// heartbeat && status == ACTIVE && targetThreadId == conversationId) and
// returns the first match collapsed into the `RightRailAutomationInput`
// shape consumed by `projectRightRailSections({ automation: … })`.
export function projectActiveThreadAutomation(
  model: AutomationsSurfaceModel,
  conversationId: string | null | undefined,
): RightRailAutomationInput | null {
  const targetThreadId = conversationId?.trim() ?? "";
  if (!targetThreadId || model.schedules.length === 0) return null;
  const match = model.schedules.find((automation) => (
    automation.kind === "heartbeat"
    && automation.status === "ACTIVE"
    && automation.targetThreadId === targetThreadId
  ));
  if (!match) return null;
  // codex: au row — `name` defaults to "Automation" when the schedule view's
  // `title` is missing (matches Desktop's empty-name fallback). `rruleSummary`
  // mirrors Desktop's `$i(rawRrule)` humanization: we feed the raw rrule/cron
  // schedule through `humanizeRrule` so the rail shows "every Monday at 9" /
  // "every weekday" instead of the literal "FREQ=WEEKLY;BYDAY=MO" body. The
  // helper falls back to the trimmed raw string when parsing fails (e.g. cron
  // expressions) and returns null for missing input so we can omit the field.
  const nextRunAtMs = parseIsoTimestampMs(match.nextRunAt);
  // codex: $i(rawRrule) — humanize via rrule.toText()
  const rruleSummary = humanizeRrule(match.schedule);
  return {
    id: match.id,
    name: match.title || "Automation",
    ...(rruleSummary ? { rruleSummary } : {}),
    ...(nextRunAtMs != null ? { nextRunAtMs } : {}),
  };
}

// codex: au row — `Next run: …` tooltip needs an epoch-ms number, but the
// payload usually arrives as an ISO-8601 string. Returning null on bad input
// lets the renderer omit the tooltip cleanly instead of showing "Invalid
// Date".
function parseIsoTimestampMs(raw: string | null | undefined): number | null {
  if (!raw) return null;
  const ms = Date.parse(raw);
  return Number.isFinite(ms) ? ms : null;
}

export function projectAutomationRailEntries(
  model: AutomationsSurfaceModel,
  conversationId: string | null | undefined,
): RailEntry[] {
  /*
   * CODEX-REF: /private/tmp/codex-asar/pretty/use-is-pull-request-merge-helper-enabled-yqBhsVRr.pretty.js
   * `lo({ automations, conversationId })` selects only heartbeat automations
   * whose `status === "ACTIVE"` and `targetThreadId === conversationId`.
   * CODEX-REF: /private/tmp/codex-asar/pretty/local-conversation-thread-CecHj6JI.pretty.js
   * `au` renders that active heartbeat row with `name` plus an RRULE summary.
   */
  const targetThreadId = conversationId?.trim() ?? "";
  if (!targetThreadId || model.schedules.length === 0) return [];
  return model.schedules
    .filter((automation) => (
      automation.kind === "heartbeat"
      && automation.status === "ACTIVE"
      && automation.targetThreadId === targetThreadId
    ))
    .map((automation) => ({
      id: `automation:${automation.id}`,
      title: automation.title,
      ...(automation.schedule ? { meta: automation.schedule } : {}),
    }));
}

function automationSchedulesFromPayload(payload: unknown): AutomationScheduleView[] | null {
  const items = payloadArray(payload);
  if (!items) return null;
  return items
    .map((item, index) => automationScheduleFromRecord(item, index))
    .filter((item): item is AutomationScheduleView => item != null);
}

function payloadArray(payload: unknown): unknown[] | null {
  if (Array.isArray(payload)) return payload;
  if (!payload || typeof payload !== "object") return null;
  const record = payload as Record<string, unknown>;
  const candidate = record.schedules ?? record.automations ?? record.items;
  return Array.isArray(candidate) ? candidate : null;
}

function automationScheduleFromRecord(value: unknown, index: number): AutomationScheduleView | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const record = value as Record<string, unknown>;
  const id = stringField(record, "id")
    || stringField(record, "automationId")
    || stringField(record, "automation_id")
    || `automation-${index + 1}`;
  const title = stringField(record, "title") || stringField(record, "name") || id;
  const schedule = stringField(record, "rrule")
    || stringField(record, "schedule")
    || stringField(record, "cron")
    || stringField(record, "cronExpression")
    || "unspecified schedule";
  const kind = stringField(record, "kind");
  const targetThreadId = stringField(record, "targetThreadId") || stringField(record, "target_thread_id");
  return {
    id,
    ...(kind ? { kind } : {}),
    title,
    status: stringField(record, "status") || "unknown",
    schedule,
    ...(targetThreadId ? { targetThreadId } : {}),
    timezone: stringField(record, "timezone") || stringField(record, "timeZone") || null,
    nextRunAt: stringField(record, "nextRunAt") || stringField(record, "next_run_at") || null,
  };
}

function stringField(record: Record<string, unknown>, key: string): string {
  const value = record[key];
  return typeof value === "string" && value.trim() ? value.trim() : "";
}
