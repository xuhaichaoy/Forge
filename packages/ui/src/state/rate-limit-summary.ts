import type { RateLimitSnapshot } from "@hicodex/codex-protocol/generated/v2/RateLimitSnapshot";
import type { RateLimitWindow } from "@hicodex/codex-protocol/generated/v2/RateLimitWindow";
import { formatMessage } from "./i18n";

export interface RateLimitDisplayWindow {
  id: "primary" | "secondary";
  label: string;
  remainingPercent: number;
  remainingText: string;
  resetMetadata: string;
  resetText: string | null;
}

export interface RateLimitDisplaySection {
  id: string;
  label: string | null;
  windows: RateLimitDisplayWindow[];
}

export interface RateLimitCompactSummary {
  heading: string;
  remainingText: string | null;
  sections: RateLimitDisplaySection[];
}

interface RateLimitEntry {
  key: string;
  snapshot: RateLimitSnapshot;
}

const DAY_MINUTES = 24 * 60;
const WEEK_MINUTES = 7 * DAY_MINUTES;
const MONTH_MINUTES = 30 * DAY_MINUTES;
const YEAR_MINUTES = 365 * DAY_MINUTES;

export function projectRateLimitSections(
  snapshotsByLimitId: Record<string, RateLimitSnapshot> | null | undefined,
  fallback: RateLimitSnapshot | null | undefined,
): RateLimitDisplaySection[] {
  return rateLimitEntries(snapshotsByLimitId, fallback)
    .map((entry) => {
      const windows = rateLimitWindows(entry.snapshot);
      if (windows.length === 0) return null;
      // codex: model section header — ICU id `composer.mode.rateLimit.modelSectionLabel`
      // defaultMessage:`{modelName} limit:` (zh `{modelName} 限额：`).
      const sectionLabel = entry.snapshot.limitName
        ? formatMessage(
            { id: "composer.mode.rateLimit.modelSectionLabel", defaultMessage: "{modelName} limit:" },
            { modelName: formatLimitName(entry.snapshot.limitName) },
          )
        : null;
      return {
        id: entry.key,
        label: sectionLabel,
        windows,
      };
    })
    .filter((section): section is RateLimitDisplaySection => Boolean(section));
}

export function projectRateLimitCompactSummary(
  snapshotsByLimitId: Record<string, RateLimitSnapshot> | null | undefined,
  fallback: RateLimitSnapshot | null | undefined,
): RateLimitCompactSummary | null {
  const sections = projectRateLimitSections(snapshotsByLimitId, fallback);
  if (sections.length === 0) return null;
  const mostConstrained = sections
    .flatMap((section) => section.windows)
    .reduce<RateLimitDisplayWindow | null>((current, next) => {
      if (!current) return next;
      return next.remainingPercent < current.remainingPercent ? next : current;
    }, null);
  return {
    // codex: rate-limit panel heading — ICU id `composer.mode.rateLimit.heading`
    // defaultMessage:`Usage remaining` (zh `剩余用量`).
    heading: formatMessage({ id: "composer.mode.rateLimit.heading", defaultMessage: "Usage remaining" }),
    remainingText: mostConstrained?.remainingText ?? null,
    sections,
  };
}

export function formatRateLimitProgress(remainingPercent: number, width = 24): string {
  const percent = clampPercent(remainingPercent);
  const columns = Math.max(12, Math.min(48, Math.round(width)));
  const filled = Math.round((percent / 100) * columns);
  return `${"█".repeat(filled)}${"░".repeat(Math.max(columns - filled, 0))}`;
}

function rateLimitEntries(
  snapshotsByLimitId: Record<string, RateLimitSnapshot> | null | undefined,
  fallback: RateLimitSnapshot | null | undefined,
): RateLimitEntry[] {
  const entries: RateLimitEntry[] = [];
  const seen = new Set<string>();
  const add = (key: string, snapshot: RateLimitSnapshot | null | undefined) => {
    if (!snapshot) return;
    const identity = rateLimitIdentity(snapshot);
    if (seen.has(identity)) return;
    seen.add(identity);
    entries.push({ key, snapshot });
  };
  for (const [key, snapshot] of Object.entries(snapshotsByLimitId ?? {})) {
    add(key || rateLimitIdentity(snapshot), snapshot);
  }
  add(fallback?.limitId || "default", fallback);
  return entries;
}

function rateLimitIdentity(snapshot: RateLimitSnapshot | null | undefined): string {
  if (!snapshot) return "empty";
  return [
    snapshot.limitId ?? "",
    snapshot.limitName ?? "",
    snapshot.primary?.windowDurationMins ?? "",
    snapshot.secondary?.windowDurationMins ?? "",
  ].join(":");
}

function rateLimitWindows(snapshot: RateLimitSnapshot): RateLimitDisplayWindow[] {
  const windows: RateLimitDisplayWindow[] = [];
  const primary = rateLimitWindow(snapshot.primary, "primary");
  const secondary = rateLimitWindow(snapshot.secondary, "secondary");
  if (primary) windows.push(primary);
  if (secondary) windows.push(secondary);
  return windows.sort((a, b) => rateLimitWindowSortValue(a) - rateLimitWindowSortValue(b));
}

function rateLimitWindow(window: RateLimitWindow | null, id: "primary" | "secondary"): RateLimitDisplayWindow | null {
  if (!window || !Number.isFinite(window.usedPercent)) return null;
  const remainingPercent = clampPercent(100 - window.usedPercent);
  const resetText = compactResetText(window.resetsAt);
  // codex: percent-remaining and reset metadata — ICU ids
  // `composer.statusPlain.rateLimitPercent` defaultMessage:`{remaining}% left`,
  // `composer.statusPlain.rateLimitReset`:`resets {time}`,
  // `composer.statusPlain.rateLimitResetUnknown`:`reset time unavailable`,
  // wrapped by `composer.statusPlain.rateLimitResetMetadata`:`({phrase})`.
  const resetPhrase = resetText
    ? formatMessage({ id: "composer.statusPlain.rateLimitReset", defaultMessage: "resets {time}" }, { time: resetText })
    : formatMessage({ id: "composer.statusPlain.rateLimitResetUnknown", defaultMessage: "reset time unavailable" });
  return {
    id,
    label: `${statusWindowLabel(window.windowDurationMins)}:`,
    remainingPercent,
    remainingText: formatMessage(
      { id: "composer.statusPlain.rateLimitPercent", defaultMessage: "{remaining}% left" },
      { remaining: Math.round(clampPercent(remainingPercent)) },
    ),
    resetMetadata: formatMessage(
      { id: "composer.statusPlain.rateLimitResetMetadata", defaultMessage: "({phrase})" },
      { phrase: resetPhrase },
    ),
    resetText,
  };
}

function rateLimitWindowSortValue(window: RateLimitDisplayWindow): number {
  const match = window.label.match(/^(\d+)(m|h|d|mo|y|w)?/);
  if (!match) return Number.MAX_SAFE_INTEGER;
  const value = Number(match[1]);
  const unit = match[2] ?? "";
  const factor = unit === "y" ? YEAR_MINUTES
    : unit === "mo" ? MONTH_MINUTES
    : unit === "w" ? WEEK_MINUTES
    : unit === "d" ? DAY_MINUTES
    : unit === "h" ? 60
    : 1;
  return value * factor;
}

function statusWindowLabel(minutes: number | null): string {
  if (!minutes || minutes <= 0) return "Rate limit";
  const years = approximateWholeDuration(minutes, YEAR_MINUTES);
  if (years != null) return `${years}y limit`;
  const months = approximateWholeDuration(minutes, MONTH_MINUTES);
  if (months != null) return `${months}mo limit`;
  if (minutes % DAY_MINUTES === 0) return `${minutes / DAY_MINUTES}d limit`;
  if (minutes % 60 === 0) return `${minutes / 60}h limit`;
  return `${Math.ceil(minutes)}m limit`;
}

export function compactWindowLabel(label: string): string {
  const value = label.replace(/:$/, "");
  const annual = value.match(/^(\d+)y limit$/);
  if (annual) return annual[1] === "1" ? "Annual" : `${annual[1]} Years`;
  const monthly = value.match(/^(\d+)mo limit$/);
  if (monthly) return monthly[1] === "1" ? "Monthly" : `${monthly[1]} Months`;
  const weekly = value.match(/^(\d+)d limit$/);
  if (weekly && Number(weekly[1]) >= 7) {
    const weeks = Math.ceil(Number(weekly[1]) / 7);
    return weeks === 1 ? "Weekly" : `${weeks} Weeks`;
  }
  return value.replace(" limit", "");
}

function approximateWholeDuration(minutes: number, unitMinutes: number): number | null {
  if (!Number.isFinite(minutes) || minutes <= 0) return null;
  const count = Math.max(1, Math.round(minutes / unitMinutes));
  return minutes >= count * unitMinutes * 0.95 && minutes <= count * unitMinutes * 1.05 ? count : null;
}

function compactResetText(value: number | null): string | null {
  if (value == null) return null;
  const millis = value > 10_000_000_000 ? value : value * 1_000;
  const resetAt = new Date(millis);
  if (Number.isNaN(resetAt.getTime())) return null;
  const secondsUntilReset = Math.floor((resetAt.getTime() - Date.now()) / 1_000);
  if (secondsUntilReset <= 0) return "now";
  if (secondsUntilReset < 24 * 60 * 60) {
    return resetAt.toLocaleTimeString([], { hour: "numeric", minute: "2-digit" });
  }
  return resetAt.toLocaleDateString([], { month: "short", day: "numeric" });
}

function formatLimitName(value: string): string {
  return value.replace(/_/g, "-");
}

function formatPercent(value: number): string {
  return `${Math.round(clampPercent(value))}%`;
}

function clampPercent(value: number): number {
  if (!Number.isFinite(value)) return 100;
  const clamped = Math.max(0, Math.min(100, value));
  return Math.round(clamped * 10) / 10;
}
