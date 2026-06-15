import type { ThreadGoal } from "@forge/codex-protocol";
import type { ThreadGoalStatus } from "@forge/codex-protocol/generated/v2/ThreadGoalStatus";
import { FORGE_DEFAULT_LOCALE, type ForgeLocale } from "./i18n";

export interface ThreadGoalBannerSummary {
  statusLabel: string;
  objective: string;
  detail: string;
  nextStatus: ThreadGoalStatus | null;
}

export const STATUS_LABELS: Record<ThreadGoalStatus, string> = {
  active: "Pursuing goal",
  paused: "Paused goal",
  blocked: "Goal blocked",
  usageLimited: "Goal usage limited",
  budgetLimited: "Goal limited",
  complete: "Goal achieved",
};

export function threadGoalBannerSummary(
  goal: ThreadGoal,
  nowMs = Date.now(),
  locale: ForgeLocale = FORGE_DEFAULT_LOCALE,
): ThreadGoalBannerSummary {
  const objective = goal.objective.trim() || "Untitled goal";
  const nextStatus = nextThreadGoalStatus(goal.status);
  const detail = shouldShowGoalTokenProgress(goal)
    ? `${formatThreadGoalTokenCount(goal.tokensUsed, locale)} / ${formatThreadGoalTokenCount(goal.tokenBudget ?? 0, locale)}`
    : formatThreadGoalDuration(threadGoalElapsedMs(goal, nowMs));
  return {
    statusLabel: STATUS_LABELS[goal.status] ?? "Goal",
    objective,
    detail,
    nextStatus,
  };
}

export function formatThreadGoalDuration(durationMs: number): string {
  if (!Number.isFinite(durationMs) || durationMs <= 0) return "0s";
  const totalSeconds = Math.floor(durationMs / 1000);
  if (totalSeconds <= 0) return "0s";
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;
  const parts: string[] = [];
  if (hours > 0) parts.push(`${hours}h`);
  if (minutes > 0) parts.push(`${minutes}m`);
  if (seconds > 0 || parts.length === 0) parts.push(`${seconds}s`);
  return parts.join(" ");
}

// codex composer-*.js renders goal token progress via
// formatNumber(n, {notation:"compact", maximumFractionDigits:1}) - locale-aware
// (en-US "12.3K", zh-CN "1.2万"), NOT a custom K/M tuple that rounds to integers.
export function formatThreadGoalTokenCount(
  value: number,
  locale: ForgeLocale = FORGE_DEFAULT_LOCALE,
): string {
  if (!Number.isFinite(value) || value <= 0) return "0";
  return new Intl.NumberFormat(locale, { notation: "compact", maximumFractionDigits: 1 }).format(Math.floor(value));
}

export function shouldShowGoalTokenProgress(goal: ThreadGoal): boolean {
  return (goal.status === "active" || goal.status === "budgetLimited")
    && goal.tokenBudget != null
    && Number.isFinite(goal.tokenBudget)
    && goal.tokenBudget >= 0;
}

export function threadGoalElapsedMs(goal: ThreadGoal, nowMs: number): number {
  const baseMs = Math.max(0, goal.timeUsedSeconds) * 1000;
  if (goal.status !== "active") return baseMs;
  const updatedAt = Number.isFinite(goal.updatedAt) ? goal.updatedAt : nowMs;
  return baseMs + Math.max(0, nowMs - updatedAt);
}

export function nextThreadGoalStatus(status: ThreadGoalStatus): ThreadGoalStatus | null {
  if (status === "complete") return null;
  if (status === "active") return "paused";
  return "active";
}
