import {
  HICODEX_NOTIFICATION_PREFERENCES_STORAGE_KEY,
  loadNotificationPreferences,
  mergeNotificationPreferences,
  normalizeNotificationPreferences,
  saveNotificationPreferences,
  shouldNotifyTurnCompletion,
} from "../src/state/notification-preferences";

export default function runNotificationPreferenceTests(): void {
  normalizesAndPersistsNotificationPreferences();
  appliesTurnCompletionPolicy();
}

function normalizesAndPersistsNotificationPreferences(): void {
  assertDeepEqual(
    normalizeNotificationPreferences({ turnCompletionPolicy: "always", sound: false }),
    { turnCompletionPolicy: "always", sound: false },
    "valid notification preferences should normalize",
  );
  assertDeepEqual(
    normalizeNotificationPreferences({ turnCompletionPolicy: "bad", sound: "yes" }),
    { turnCompletionPolicy: "backgroundOnly", sound: true },
    "invalid notification preferences should fall back",
  );
  assertDeepEqual(
    mergeNotificationPreferences({ turnCompletionPolicy: "backgroundOnly", sound: true }, { sound: false }),
    { turnCompletionPolicy: "backgroundOnly", sound: false },
    "partial notification preference patches should preserve existing values",
  );

  const storage = memoryStorage();
  assertDeepEqual(
    loadNotificationPreferences(storage),
    { turnCompletionPolicy: "backgroundOnly", sound: true },
    "missing notification preference should default to background-only with sound",
  );
  saveNotificationPreferences(storage, { turnCompletionPolicy: "off", sound: false });
  assertEqual(
    storage.values.get(HICODEX_NOTIFICATION_PREFERENCES_STORAGE_KEY),
    JSON.stringify({ turnCompletionPolicy: "off", sound: false }),
    "notification preferences should be persisted as JSON",
  );
  assertDeepEqual(
    loadNotificationPreferences(storage),
    { turnCompletionPolicy: "off", sound: false },
    "notification preferences should load from storage",
  );
}

function appliesTurnCompletionPolicy(): void {
  assertEqual(
    shouldNotifyTurnCompletion({
      preferences: { turnCompletionPolicy: "backgroundOnly", sound: true },
      visibilityState: "visible",
      hasFocus: true,
    }),
    false,
    "background-only notifications should not fire in the focused window",
  );
  assertEqual(
    shouldNotifyTurnCompletion({
      preferences: { turnCompletionPolicy: "backgroundOnly", sound: true },
      visibilityState: "visible",
      hasFocus: false,
    }),
    true,
    "background-only notifications should fire when the window is not focused",
  );
  assertEqual(
    shouldNotifyTurnCompletion({
      preferences: { turnCompletionPolicy: "always", sound: false },
      visibilityState: "visible",
      hasFocus: true,
    }),
    true,
    "always notifications should fire even in the focused window",
  );
  assertEqual(
    shouldNotifyTurnCompletion({
      preferences: { turnCompletionPolicy: "off", sound: true },
      visibilityState: "hidden",
      hasFocus: false,
    }),
    false,
    "off notifications should never fire",
  );
}

function memoryStorage() {
  const values = new Map<string, string>();
  return {
    values,
    getItem: (key: string) => values.get(key) ?? null,
    setItem: (key: string, value: string) => {
      values.set(key, value);
    },
  };
}

function assertEqual<T>(actual: T, expected: T, message: string): void {
  if (actual !== expected) {
    throw new Error(`${message}: expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`);
  }
}

function assertDeepEqual(actual: unknown, expected: unknown, message: string): void {
  const actualJson = JSON.stringify(actual);
  const expectedJson = JSON.stringify(expected);
  if (actualJson !== expectedJson) {
    throw new Error(`${message}: expected ${expectedJson}, got ${actualJson}`);
  }
}
