/*
 * codex automation-schedule-CNorTxWd.js — humanizes a raw RRULE into Codex's
 * STRUCTURED schedule labels ("Daily", "Hourly", "Daily at {time}", "Weekdays at
 * {time}", "Weekends at {time}", "{days} at {time}", "Every {n}h", "Every {n}m"),
 * NOT rrule's prose toText() ("every day at 9"). The label set is taken verbatim
 * from the bundle (automation-schedule-CNorTxWd.js defaultMessages); the FREQ /
 * INTERVAL / BYDAY → label mapping mirrors that chunk's interval+weekday branches.
 *
 * Fallback: unparseable input (cron expressions, already-humanized strings) is
 * returned AS-IS rather than Codex's "Custom schedule" — HiCodex's app-server can
 * deliver cron / pre-humanized schedule strings (see the automations-viewer test),
 * which are more useful shown raw than collapsed to a generic label; Codex's own
 * app-server only ever sends RRULE, so its "Custom schedule" fallback never fires
 * on these. This is the one deliberate deviation, kept for HiCodex's data reality.
 */
import { RRule, rrulestr } from "rrule";

const WEEKDAY_PLURAL = ["Mondays", "Tuesdays", "Wednesdays", "Thursdays", "Fridays", "Saturdays", "Sundays"];

/** rrule's byweekday can be a Weekday object ({weekday:n}), a number, or an array of either. */
function weekdayNumbers(byweekday: unknown): number[] {
  if (byweekday == null) return [];
  const arr = Array.isArray(byweekday) ? byweekday : [byweekday];
  return arr
    .map((d) => {
      if (typeof d === "number") return d;
      if (typeof d === "object" && d !== null && "weekday" in d) {
        return (d as { weekday: number }).weekday;
      }
      return null;
    })
    .filter((n): n is number => typeof n === "number")
    .sort((a, b) => a - b);
}

/** Codex schedule time = {hour:'numeric', minute:'2-digit'} (e.g. "9:00 AM"), or null when no BYHOUR. */
function scheduleTime(byhour: unknown, byminute: unknown): string | null {
  const h = Array.isArray(byhour) ? byhour[0] : byhour;
  if (typeof h !== "number") return null;
  const m = Array.isArray(byminute) ? byminute[0] : byminute;
  const minute = typeof m === "number" ? m : 0;
  return new Date(2000, 0, 1, h, minute).toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" });
}

export function humanizeRrule(raw: string | null | undefined): string | null {
  if (raw == null) return null;
  const trimmed = raw.trim();
  if (trimmed.length === 0) return null;
  try {
    // rrulestr accepts bare bodies ("FREQ=WEEKLY;…") and the iCal-prefixed form.
    const options = rrulestr(trimmed).origOptions;
    const freq = options.freq;
    const interval = typeof options.interval === "number" && options.interval > 0 ? options.interval : 1;
    const time = scheduleTime(options.byhour, options.byminute);

    if (freq === RRule.MINUTELY) return interval === 1 ? "Every minute" : `Every ${interval}m`;
    if (freq === RRule.HOURLY) return interval === 1 ? "Hourly" : `Every ${interval}h`;
    if (freq === RRule.DAILY) return time ? `Daily at ${time}` : "Daily";
    if (freq === RRule.WEEKLY) {
      const days = weekdayNumbers(options.byweekday);
      if (days.length === 0) return "Weekly";
      const isWeekdays = days.length === 5 && days.every((d) => d <= 4);
      const isWeekends = days.length === 2 && days[0] === 5 && days[1] === 6;
      if (isWeekdays) return time ? `Weekdays at ${time}` : "Weekdays";
      if (isWeekends) return time ? `Weekends at ${time}` : "Weekends";
      const label = days.map((d) => WEEKDAY_PLURAL[d]).filter(Boolean).join(", ");
      if (label.length === 0) return "Weekly";
      return time ? `${label} at ${time}` : label;
    }
    // MONTHLY / YEARLY / unrecognized parseable RRULE → keep the raw body.
    return trimmed;
  } catch {
    // cron / free-form / pre-humanized text rrule cannot parse → preserve as-is.
    return trimmed;
  }
}
