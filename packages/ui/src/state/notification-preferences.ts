import { setDesktopAppSettingValue } from "../lib/app-settings";
import type { BrowserStorageLike } from "./image-generation-tool";
import { HICODEX_DESKTOP_CONFIG_KEYS, readMigratedStorageValue } from "./hicodex-desktop-namespace";
import { formatMessage } from "./i18n";

export const LEGACY_HICODEX_NOTIFICATION_PREFERENCES_STORAGE_KEY = "hicodex:notification-preferences";
export const HICODEX_NOTIFICATION_PREFERENCES_STORAGE_KEY = HICODEX_DESKTOP_CONFIG_KEYS.notificationPreferences;

export const TURN_COMPLETION_NOTIFICATION_POLICIES = ["backgroundOnly", "always", "off"] as const;
export type TurnCompletionNotificationPolicy = (typeof TURN_COMPLETION_NOTIFICATION_POLICIES)[number];

export interface NotificationPreferences {
  turnCompletionPolicy: TurnCompletionNotificationPolicy;
  sound: boolean;
}

export const DEFAULT_NOTIFICATION_PREFERENCES: NotificationPreferences = {
  turnCompletionPolicy: "backgroundOnly",
  sound: true,
};

export function isTurnCompletionNotificationPolicy(value: unknown): value is TurnCompletionNotificationPolicy {
  return typeof value === "string"
    && TURN_COMPLETION_NOTIFICATION_POLICIES.includes(value as TurnCompletionNotificationPolicy);
}

export function normalizeNotificationPreferences(
  value: unknown,
  fallback: NotificationPreferences = DEFAULT_NOTIFICATION_PREFERENCES,
): NotificationPreferences {
  const source = decodeNotificationPreferenceValue(value);
  const policy = isTurnCompletionNotificationPolicy(source?.turnCompletionPolicy)
    ? source.turnCompletionPolicy
    : isTurnCompletionNotificationPolicy(source?.policy)
      ? source.policy
      : fallback.turnCompletionPolicy;
  return {
    turnCompletionPolicy: policy,
    sound: typeof source?.sound === "boolean" ? source.sound : fallback.sound,
  };
}

export function mergeNotificationPreferences(
  current: NotificationPreferences,
  patch: Partial<NotificationPreferences>,
): NotificationPreferences {
  return normalizeNotificationPreferences({ ...current, ...patch }, current);
}

export function loadNotificationPreferences(storage: BrowserStorageLike | null): NotificationPreferences {
  if (!storage) return { ...DEFAULT_NOTIFICATION_PREFERENCES };
  try {
    return normalizeNotificationPreferences(readMigratedStorageValue(
      storage,
      HICODEX_NOTIFICATION_PREFERENCES_STORAGE_KEY,
      [LEGACY_HICODEX_NOTIFICATION_PREFERENCES_STORAGE_KEY],
    ));
  } catch {
    return { ...DEFAULT_NOTIFICATION_PREFERENCES };
  }
}

export function saveNotificationPreferences(
  storage: BrowserStorageLike | null,
  preferences: NotificationPreferences,
): void {
  if (!storage) return;
  try {
    setDesktopAppSettingValue(
      storage,
      HICODEX_NOTIFICATION_PREFERENCES_STORAGE_KEY,
      JSON.stringify(normalizeNotificationPreferences(preferences)),
    );
  } catch {
    // Preference still applies for this session when storage is unavailable.
  }
}

export function shouldNotifyTurnCompletion(input: {
  preferences: NotificationPreferences;
  visibilityState?: string | null;
  hasFocus?: boolean | null;
}): boolean {
  if (input.preferences.turnCompletionPolicy === "off") return false;
  if (input.preferences.turnCompletionPolicy === "always") return true;
  return !(input.visibilityState === "visible" && input.hasFocus === true);
}

export function notificationPolicyLabel(policy: TurnCompletionNotificationPolicy): string {
  switch (policy) {
    // codex notifications.turnMode.* — always="Always", off="Never",
    // unfocused(=HiCodex backgroundOnly: notify only when app not focused)="Only when unfocused".
    case "always":
      return formatMessage({ id: "notifications.turnMode.always", defaultMessage: "Always" });
    case "off":
      return formatMessage({ id: "notifications.turnMode.off", defaultMessage: "Never" });
    default:
      return formatMessage({ id: "notifications.turnMode.unfocused", defaultMessage: "Only when unfocused" });
  }
}

export function notificationPolicyDescription(policy: TurnCompletionNotificationPolicy): string {
  switch (policy) {
    case "always":
      return formatMessage({
        id: "hc.notifications.turnMode.always.description",
        defaultMessage: "Notify when a turn finishes, even while the HiCodex window is focused.",
      });
    case "off":
      return formatMessage({
        id: "hc.notifications.turnMode.off.description",
        defaultMessage: "Do not show native turn-completion notifications.",
      });
    default:
      return formatMessage({
        id: "hc.notifications.turnMode.unfocused.description",
        defaultMessage: "Notify when a turn finishes outside the focused HiCodex window.",
      });
  }
}

export function notificationSoundLabel(enabled: boolean): string {
  return enabled
    ? formatMessage({ id: "hc.notifications.sound.on", defaultMessage: "Sound on" })
    : formatMessage({ id: "hc.notifications.sound.off", defaultMessage: "Sound off" });
}

function decodeNotificationPreferenceValue(value: unknown): Record<string, unknown> | null {
  if (isTurnCompletionNotificationPolicy(value)) {
    return { turnCompletionPolicy: value };
  }
  if (typeof value === "string") {
    try {
      const decoded = JSON.parse(value) as unknown;
      return decoded && typeof decoded === "object" && !Array.isArray(decoded)
        ? decoded as Record<string, unknown>
        : null;
    } catch {
      return null;
    }
  }
  return value && typeof value === "object" && !Array.isArray(value)
    ? value as Record<string, unknown>
    : null;
}
