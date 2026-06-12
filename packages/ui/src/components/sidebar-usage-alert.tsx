import { X } from "lucide-react";
import type { AccountUsageAlert } from "../state/account-state";
import { useHiCodexIntl } from "./i18n-provider";

export function SidebarUsageAlert({
  alert,
  onDismiss,
}: {
  alert: AccountUsageAlert;
  onDismiss: () => void;
}) {
  const { formatMessage } = useHiCodexIntl();
  const reset = usageAlertResetLabel(alert, formatMessage);
  return (
    <div className="hc-sidebar-usage-alert">
      <div className="hc-sidebar-usage-alert-copy">
        <div className="hc-sidebar-usage-alert-heading">
          <span>
            {formatMessage(
              {
                id: "sidebarElectron.usageAlert.title",
                defaultMessage: "{remaining}% usage remaining",
              },
              { remaining: alert.remainingPercent },
            )}
          </span>
          <button
            type="button"
            className="hc-sidebar-usage-alert-dismiss"
            aria-label={formatMessage({
              id: "sidebarElectron.usageAlert.dismiss",
              defaultMessage: "Dismiss usage alert",
            })}
            onClick={onDismiss}
          >
            <X size={12} />
          </button>
        </div>
        {reset && <div className="hc-sidebar-usage-alert-reset">{reset}</div>}
      </div>
      <progress
        aria-label={formatMessage({
          id: "sidebarElectron.usageAlert.progress.ariaLabel",
          defaultMessage: "Usage consumed",
        })}
        className="hc-sidebar-usage-alert-progress"
        max={100}
        value={alert.usedPercent}
      />
    </div>
  );
}

type UsageAlertFormatMessage = (
  descriptor: { id: string; defaultMessage: string },
  values?: Record<string, string | number | boolean | null | undefined>,
) => string;

/*
 * codex app-main sidebar usage-alert reset line. Codex renders one of two
 * localized messages instead of hand-built English:
 *   - no cadence: `sidebarElectron.usageAlert.resetAt` = "Resets {time}"
 *   - with cadence: `sidebarElectron.usageAlert.resetAtWithCadence`
 *        = "Resets {cadence} · Next reset is {time}"
 * where {cadence} is a pluralized `cadence.{minute|hour|day|week|month|year}`
 * label derived from the window duration. The old HiCodex code wrote a raw
 * "Resets …"/"Window 2h" English string that never localized — replaced here.
 */
function usageAlertResetLabel(alert: AccountUsageAlert, formatMessage: UsageAlertFormatMessage): string | null {
  const time = usageAlertResetTime(alert.resetAt);
  const cadence = usageAlertCadenceLabel(alert.windowDurationMins, formatMessage);
  if (time && cadence) {
    return formatMessage(
      { id: "sidebarElectron.usageAlert.resetAtWithCadence", defaultMessage: "Resets {cadence} · Next reset is {time}" },
      { cadence, time },
    );
  }
  if (time) {
    return formatMessage(
      { id: "sidebarElectron.usageAlert.resetAt", defaultMessage: "Resets {time}" },
      { time },
    );
  }
  return null;
}

function usageAlertResetTime(resetAt: number | null): string | null {
  if (!resetAt) return null;
  const millis = resetAt > 10_000_000_000 ? resetAt : resetAt * 1_000;
  const date = new Date(millis);
  if (Number.isNaN(date.getTime())) return null;
  return date.toLocaleString([], { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" });
}

/*
 * Maps a window duration (minutes) to the largest natural cadence unit, mirroring
 * Codex's threshold ladder (year ≥ ~525600, month ≥ ~43800, week ≥ 10080,
 * day ≥ 1440, hour ≥ 60, else minute) with its ±5% rounding tolerance for the
 * coarse units. Cadence strings use HiCodex's simple-plural form (`#`) because
 * the bundled ICU formatter does not support nested-brace plural arguments.
 */
function usageAlertCadenceLabel(
  minutes: number | null,
  formatMessage: UsageAlertFormatMessage,
): string | null {
  if (minutes == null || !Number.isFinite(minutes) || minutes <= 0) return null;
  const year = approxCadenceCount(minutes, 525_600);
  if (year != null) {
    return formatMessage(
      { id: "sidebarElectron.usageAlert.cadence.year", defaultMessage: "{years, plural, one {every year} other {every # years}}" },
      { years: year },
    );
  }
  const month = approxCadenceCount(minutes, 43_800);
  if (month != null) {
    return formatMessage(
      { id: "sidebarElectron.usageAlert.cadence.month", defaultMessage: "{months, plural, one {every month} other {every # months}}" },
      { months: month },
    );
  }
  if (minutes >= 10_079) {
    return formatMessage(
      { id: "sidebarElectron.usageAlert.cadence.week", defaultMessage: "{weeks, plural, one {every week} other {every # weeks}}" },
      { weeks: Math.ceil(minutes / 10_080) },
    );
  }
  if (minutes >= 1_439) {
    return formatMessage(
      { id: "sidebarElectron.usageAlert.cadence.day", defaultMessage: "{days, plural, one {every day} other {every # days}}" },
      { days: Math.ceil(minutes / 1_440) },
    );
  }
  if (minutes >= 60) {
    return formatMessage(
      { id: "sidebarElectron.usageAlert.cadence.hour", defaultMessage: "{hours, plural, one {every hour} other {every # hours}}" },
      { hours: Math.ceil(minutes / 60) },
    );
  }
  return formatMessage(
    { id: "sidebarElectron.usageAlert.cadence.minute", defaultMessage: "{minutes, plural, one {every minute} other {every # minutes}}" },
    { minutes: Math.ceil(minutes) },
  );
}

function approxCadenceCount(minutes: number, unitMinutes: number): number | null {
  const count = Math.max(1, Math.round(minutes / unitMinutes));
  const target = count * unitMinutes;
  return minutes >= target * 0.95 && minutes <= target * 1.05 ? count : null;
}
