// codex: automation-schedule-*.js — Desktop parses RRULE
// text and turns common minutely/hourly/daily/weekly schedules into short
// summaries, falling back to "Custom schedule" when the rule is not
// representable by its compact automation UI.

import { formatMessage } from "./i18n";

// codex: automation-schedule-*.js — `settings.automations.rruleSummaryFallback`
// ("Custom schedule" / "自定义安排"). Resolved at call time so the active locale
// applies (the exported const stays for back-compat callers that need a literal).
export const AUTOMATION_SCHEDULE_FALLBACK = "Custom schedule";

function automationScheduleFallbackLabel(): string {
  return formatMessage({ id: "settings.automations.rruleSummaryFallback", defaultMessage: "Custom schedule" });
}

const WEEKDAY_ORDER = ["SU", "MO", "TU", "WE", "TH", "FR", "SA"] as const;
const WEEKDAYS = ["MO", "TU", "WE", "TH", "FR"] as const;
const WEEKENDS = ["SA", "SU"] as const;
const DEFAULT_TIME = "09:00";

type WeekdayCode = typeof WEEKDAY_ORDER[number];

interface ParsedRrule {
  byday: WeekdayCode[] | null;
  byhour: number[] | null;
  byminute: number[] | null;
  dtstart: { hour: number; minute: number } | null;
  freq: string;
  interval: number;
}

export function automationScheduleSummary(
  rrule: string | null | undefined,
  fallbackMessage = automationScheduleFallbackLabel(),
): string | null {
  const parsed = parseRrule(rrule);
  if (!parsed) return rrule?.trim() ? fallbackMessage : null;
  const weekdays = parsed.byday ?? [...WEEKDAY_ORDER];
  const everyDay = sameWeekdays(weekdays, WEEKDAY_ORDER);

  if (parsed.freq === "MINUTELY") {
    return intervalSummary(minutelyIntervalLabel(parsed.interval), everyDay, weekdays);
  }
  if (parsed.freq === "HOURLY") {
    const interval = parsed.interval === 1
      ? formatMessage({ id: "settings.automations.scheduleSummary.intervalHourly", defaultMessage: "Hourly" })
      : formatMessage({ id: "settings.automations.scheduleSummary.interval", defaultMessage: "Every {count}h" }, { count: parsed.interval });
    return intervalSummary(interval, everyDay, weekdays);
  }
  if (parsed.freq !== "DAILY" && parsed.freq !== "WEEKLY") return fallbackMessage;

  const time = formatScheduleTime(scheduleTime(parsed));
  if (!time) return fallbackMessage;
  return dailyWeeklySummary(time, weekdays, everyDay);
}

function parseRrule(raw: string | null | undefined): ParsedRrule | null {
  const text = raw?.trim();
  if (!text) return null;
  const props = new Map<string, string>();
  for (const part of rruleParts(text)) {
    const index = part.indexOf("=");
    if (index <= 0) continue;
    props.set(part.slice(0, index).toUpperCase(), part.slice(index + 1));
  }
  const freq = props.get("FREQ")?.trim().toUpperCase();
  if (!freq) return null;
  const interval = positiveInteger(props.get("INTERVAL")) ?? 1;
  return {
    byday: parseByDay(props.get("BYDAY")),
    byhour: parseNumberList(props.get("BYHOUR")),
    byminute: parseNumberList(props.get("BYMINUTE")),
    dtstart: parseDtstart(text),
    freq,
    interval,
  };
}

function rruleParts(text: string): string[] {
  const segments = text.split(/\r?\n/).flatMap((line) => line.split(";"));
  return segments.flatMap((segment) => {
    const trimmed = segment.trim();
    if (!trimmed) return [];
    const rrulePrefix = /^RRULE:/i.exec(trimmed);
    return [rrulePrefix ? trimmed.slice(rrulePrefix[0].length) : trimmed];
  });
}

function parseNumberList(raw: string | null | undefined): number[] | null {
  if (!raw) return null;
  const values = raw.split(",").flatMap((part) => {
    const value = Number(part.trim());
    return Number.isFinite(value) ? [Math.round(value)] : [];
  });
  return values.length > 0 ? values : null;
}

function parseByDay(raw: string | null | undefined): WeekdayCode[] | null {
  if (!raw) return null;
  const values = raw.split(",").flatMap((part) => {
    const normalized = part.trim().toUpperCase();
    const code = normalized.slice(-2);
    return isWeekdayCode(code) ? [code] : [];
  });
  return values.length > 0 ? sortWeekdays([...new Set(values)]) : null;
}

function parseDtstart(text: string): { hour: number; minute: number } | null {
  const match = /DTSTART(?:;TZID=[^:=]+)?(?::|=)(\d{8})(?:T(\d{2})(\d{2}))?/i.exec(text);
  if (!match?.[2] || !match[3]) return null;
  const hour = Number(match[2]);
  const minute = Number(match[3]);
  return Number.isFinite(hour) && Number.isFinite(minute) ? { hour, minute } : null;
}

function positiveInteger(raw: string | null | undefined): number | null {
  const value = Number(raw);
  if (!Number.isFinite(value)) return null;
  const rounded = Math.round(value);
  return rounded >= 1 ? rounded : null;
}

function scheduleTime(parsed: ParsedRrule): { hour: number; minute: number } {
  const hour = firstNumber(parsed.byhour);
  const minute = firstNumber(parsed.byminute);
  if (hour != null && minute != null) return { hour, minute };
  if (parsed.dtstart) return parsed.dtstart;
  const fallback = DEFAULT_TIME.split(":").map(Number);
  return { hour: fallback[0] ?? 9, minute: fallback[1] ?? 0 };
}

function firstNumber(values: number[] | null): number | null {
  return typeof values?.[0] === "number" ? values[0] : null;
}

function formatScheduleTime(time: { hour: number; minute: number }): string | null {
  if (time.hour < 0 || time.hour > 23 || time.minute < 0 || time.minute > 59) return null;
  return new Intl.DateTimeFormat(undefined, {
    hour: "numeric",
    minute: "2-digit",
  }).format(new Date(2024, 0, 1, time.hour, time.minute));
}

function minutelyIntervalLabel(interval: number): string {
  if (interval === 1) return formatMessage({ id: "settings.automations.scheduleSummary.intervalMinute", defaultMessage: "Every minute" });
  if (interval === 60) return formatMessage({ id: "settings.automations.scheduleSummary.intervalHourly", defaultMessage: "Hourly" });
  if (interval === 1440) return formatMessage({ id: "settings.automations.scheduleSummary.intervalDaily", defaultMessage: "Daily" });
  if (interval === 10080) return formatMessage({ id: "settings.automations.scheduleSummary.intervalWeekly", defaultMessage: "Weekly" });
  return formatMessage({ id: "settings.automations.scheduleSummary.intervalMinutes", defaultMessage: "Every {count}m" }, { count: interval });
}

function intervalSummary(interval: string, everyDay: boolean, weekdays: WeekdayCode[]): string {
  if (everyDay) return interval;
  return formatMessage(
    { id: "settings.automations.scheduleSummary.intervalDays", defaultMessage: "{interval} on {days}" },
    { interval, days: weekdayCountLabel(weekdays.length) },
  );
}

function weekdayCountLabel(count: number): string {
  return formatMessage(
    { id: "settings.automations.scheduleSummary.intervalDayCount", defaultMessage: "{count, plural, one {# day} other {# days}}" },
    { count },
  );
}

function dailyWeeklySummary(timeLabel: string, weekdays: WeekdayCode[], everyDay: boolean): string | null {
  if (everyDay) return formatMessage({ id: "settings.automations.scheduleSummary.daily", defaultMessage: "Daily at {time}" }, { time: timeLabel });
  if (sameWeekdays(weekdays, WEEKDAYS)) return formatMessage({ id: "settings.automations.scheduleSummary.weekdays", defaultMessage: "Weekdays at {time}" }, { time: timeLabel });
  if (sameWeekdays(weekdays, WEEKENDS)) return formatMessage({ id: "settings.automations.scheduleSummary.weekends", defaultMessage: "Weekends at {time}" }, { time: timeLabel });
  const days = weekdaysSummary(weekdays);
  return days ? formatMessage({ id: "settings.automations.scheduleSummary.weekly", defaultMessage: "{days} at {time}" }, { days, time: timeLabel }) : null;
}

function weekdaysSummary(weekdays: WeekdayCode[]): string | null {
  if (weekdays.length === 0) return null;
  if (weekdays.length === 1) return pluralWeekday(weekdays[0]!);
  const labels = weekdays.map((day) => weekdayName(day, weekdays.length > 2 ? "short" : "long"));
  return new Intl.ListFormat(undefined, { type: "conjunction" }).format(labels);
}

function pluralWeekday(day: WeekdayCode): string {
  const name = weekdayName(day, "long");
  return name.endsWith("s") ? name : `${name}s`;
}

function weekdayName(day: WeekdayCode, style: "long" | "short"): string {
  const base = new Date(2024, 0, 7 + WEEKDAY_ORDER.indexOf(day));
  return new Intl.DateTimeFormat(undefined, { weekday: style }).format(base);
}

function sortWeekdays(weekdays: WeekdayCode[]): WeekdayCode[] {
  return weekdays.sort((left, right) => WEEKDAY_ORDER.indexOf(left) - WEEKDAY_ORDER.indexOf(right));
}

function sameWeekdays(left: readonly WeekdayCode[], right: readonly WeekdayCode[]): boolean {
  return left.length === right.length && right.every((day) => left.includes(day));
}

function isWeekdayCode(value: string): value is WeekdayCode {
  return (WEEKDAY_ORDER as readonly string[]).includes(value);
}
