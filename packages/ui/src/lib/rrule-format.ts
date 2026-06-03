/*
 * codex automation-schedule-*.js — humanizes a raw RRULE into Codex's STRUCTURED
 * schedule labels ("Daily", "Hourly", "Daily at {time}", "Weekdays at {time}",
 * "Weekends at {time}", "{days} at {time}", "Every {n}h", "Every {n}m"), NOT
 * rrule's prose toText() ("every day at 9"). The label set is taken verbatim from
 * the bundle (automation-schedule-*.js defaultMessages); the FREQ / INTERVAL /
 * BYDAY → label mapping mirrors that chunk's `dn` interval + `At` weekday branches.
 *
 * Fallback: when the rule cannot be reduced to one of those compact labels —
 * unparseable input (cron expressions, already-humanized strings), or a parseable
 * but non-MINUTELY/HOURLY/DAILY/WEEKLY rule (MONTHLY/YEARLY) — this returns `null`,
 * exactly like Codex's `dn` (returns null for `freq !== DAILY && freq !== WEEKLY`
 * etc.). The right-rail row then renders the localized
 * `settings.automations.rruleSummaryFallback` ("Custom schedule" / "自定义安排"),
 * matching Codex's `Ec({rrule, fallbackMessage})` call site rather than leaking the
 * raw RRULE/cron body into the summary slot.
 *
 * MINUTELY interval normalization (60m→Hourly / 1440m→Daily / 10080m→Weekly) and
 * the multi-weekday grouping (single→plural, consecutive run→"Mon-Fri" range,
 * otherwise Intl.ListFormat conjunction with Sunday-first ordering) are clean-room
 * reimplementations of the bundle's deterministic `mn` / `At` algorithms.
 */
import { RRule, rrulestr } from "rrule";

// codex automation-schedule-*.js `K` — weekday display order is Sunday-first.
// rrule's own `weekday` numbering is Monday-first (MO=0…SU=6); we map into this
// Sunday-first order for sorting, range detection, and labeling.
const SUNDAY_FIRST_ORDER = [6, 0, 1, 2, 3, 4, 5] as const;

// codex `kt` — single-weekday "long" style renders the plural day name. Indexed
// by rrule's Monday-first weekday number (MO=0…SU=6).
const WEEKDAY_PLURAL = ["Mondays", "Tuesdays", "Wednesdays", "Thursdays", "Fridays", "Saturdays", "Sundays"];

/** rrule's byweekday can be a Weekday object ({weekday:n}), a number, or an array of either. */
function weekdayNumbers(byweekday: unknown): number[] {
  if (byweekday == null) return [];
  const arr = Array.isArray(byweekday) ? byweekday : [byweekday];
  const numbers = arr
    .map((d) => {
      if (typeof d === "number") return d;
      if (typeof d === "object" && d !== null && "weekday" in d) {
        return (d as { weekday: number }).weekday;
      }
      return null;
    })
    .filter((n): n is number => typeof n === "number" && n >= 0 && n <= 6);
  // codex `q` — dedupe then sort by the Sunday-first display order.
  return [...new Set(numbers)].sort(
    (a, b) => SUNDAY_FIRST_ORDER.indexOf(a as typeof SUNDAY_FIRST_ORDER[number])
      - SUNDAY_FIRST_ORDER.indexOf(b as typeof SUNDAY_FIRST_ORDER[number]),
  );
}

// codex `Nt`/`Mt`/`Ft` — render a weekday name from its rrule (Monday-first)
// number. A reference week starting 2024-01-07 (a Sunday) lets Intl pick the
// localized name; rrule MO=0 maps to that Sunday + (number + 1) days.
function weekdayName(weekday: number, style: "long" | "short" | "narrow"): string {
  // 2024-01-07 is a Sunday; rrule SU=6 → +0 day, MO=0 → +1 day … SA=5 → +6 days.
  const dayOffset = weekday === 6 ? 0 : weekday + 1;
  const base = new Date(2024, 0, 7 + dayOffset);
  return base.toLocaleDateString(undefined, { weekday: style });
}

// codex `Ft` — "short" weekday name, falling back to the "narrow" name when the
// short form is not actually shorter than the long form (e.g. CJK locales).
function shortWeekdayName(weekday: number): string {
  const short = weekdayName(weekday, "short");
  const long = weekdayName(weekday, "long");
  return short.length >= long.length ? weekdayName(weekday, "narrow") : short;
}

// codex `Lt` — true when the sorted (Sunday-first) weekdays form a contiguous run.
function isConsecutiveRun(sortedDays: number[]): boolean {
  if (sortedDays.length < 2) return false;
  for (let i = 1; i < sortedDays.length; i += 1) {
    const prev = SUNDAY_FIRST_ORDER.indexOf(sortedDays[i - 1] as typeof SUNDAY_FIRST_ORDER[number]);
    const curr = SUNDAY_FIRST_ORDER.indexOf(sortedDays[i] as typeof SUNDAY_FIRST_ORDER[number]);
    if (prev < 0 || curr < 0 || curr !== prev + 1) return false;
  }
  return true;
}

// codex `At` (weekly summary always calls it with style "long") — grade the
// weekday list into Codex's three forms:
//   • exactly one day  → plural long name ("Mondays")           [`kt`]
//   • ≥3 consecutive   → short-name range ("Mon-Fri")           [`It`]
//   • everything else  → Intl.ListFormat conjunction            [`jt`]
//       (≤2 days use long names "Monday and Friday"; >2 use short
//        names "Mon, Wed, and Fri", matching `jt`'s short/long split)
function weekdayLabel(sortedDays: number[]): string | null {
  if (sortedDays.length === 0) return null;
  if (sortedDays.length === 1) {
    return WEEKDAY_PLURAL[sortedDays[0]!] ?? null;
  }
  if (sortedDays.length > 2 && isConsecutiveRun(sortedDays)) {
    const first = sortedDays[0]!;
    const last = sortedDays[sortedDays.length - 1]!;
    return `${shortWeekdayName(first)}-${shortWeekdayName(last)}`;
  }
  const useShort = sortedDays.length > 2;
  const names = sortedDays.map((day) => (useShort ? shortWeekdayName(day) : weekdayName(day, "long")));
  return new Intl.ListFormat(undefined, { type: "conjunction" }).format(names);
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

    if (freq === RRule.MINUTELY) return minutelyLabel(interval);
    if (freq === RRule.HOURLY) return interval === 1 ? "Hourly" : `Every ${interval}h`;
    if (freq === RRule.DAILY) return time ? `Daily at ${time}` : "Daily";
    if (freq === RRule.WEEKLY) {
      const days = weekdayNumbers(options.byweekday);
      if (days.length === 0) return "Weekly";
      // rrule (Monday-first) weekday numbers: MO=0…FR=4 → weekdays; SA=5,SU=6 → weekends.
      const isWeekdays = days.length === 5 && days.every((d) => d <= 4);
      const isWeekends = days.length === 2 && days.includes(5) && days.includes(6);
      if (isWeekdays) return time ? `Weekdays at ${time}` : "Weekdays";
      if (isWeekends) return time ? `Weekends at ${time}` : "Weekends";
      const label = weekdayLabel(days);
      if (!label) return "Weekly";
      return time ? `${label} at ${time}` : label;
    }
    // codex `dn` returns null for MONTHLY / YEARLY / unrecognized parseable rules;
    // the right-rail row renders the localized "Custom schedule" fallback instead.
    return null;
  } catch {
    // cron / free-form / pre-humanized text rrule cannot parse → null so the
    // caller renders the localized "Custom schedule" fallback (codex `Ec`).
    return null;
  }
}

// codex `mn` — equivalent integer-minute intervals normalize to the named labels
// (60→Hourly, 1440→Daily, 10080→Weekly); 1→"Every minute"; otherwise "Every {n}m".
function minutelyLabel(interval: number): string {
  if (interval === 1) return "Every minute";
  if (interval === 60) return "Hourly";
  if (interval === 1440) return "Daily";
  if (interval === 10080) return "Weekly";
  return `Every ${interval}m`;
}
