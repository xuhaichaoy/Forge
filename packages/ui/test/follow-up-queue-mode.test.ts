import {
  DEFAULT_FOLLOW_UP_QUEUE_MODE,
  FOLLOW_UP_QUEUE_MODE_KEY,
  followUpQueueModeConfigEdit,
  followUpQueueModeFromQueueingEnabled,
  followUpQueueingEnabledFromMode,
  isLegacyFollowUpQueueMode,
  normalizeFollowUpQueueMode,
} from "../src/state/follow-up-queue-mode";

export default function runFollowUpQueueModeTests(): void {
  normalizesDesktopQueueModes();
  buildsRootConfigEdit();
}

function normalizesDesktopQueueModes(): void {
  assertEqual(normalizeFollowUpQueueMode("queue"), "queue", "queue should stay queue");
  assertEqual(normalizeFollowUpQueueMode("steer"), "steer", "steer should stay steer");
  assertEqual(normalizeFollowUpQueueMode("interrupt"), "steer", "legacy interrupt should migrate to steer");
  assertEqual(normalizeFollowUpQueueMode(undefined), DEFAULT_FOLLOW_UP_QUEUE_MODE, "missing config should default queue");
  assertEqual(isLegacyFollowUpQueueMode("interrupt"), true, "interrupt should be detected as legacy");
  assertEqual(isLegacyFollowUpQueueMode("steer"), false, "steer should not be legacy");
  assertEqual(followUpQueueingEnabledFromMode("queue"), true, "queue mode enables queueing");
  assertEqual(followUpQueueingEnabledFromMode("steer"), false, "steer mode disables queueing");
  assertEqual(followUpQueueModeFromQueueingEnabled(true), "queue", "enabled queueing writes queue");
  assertEqual(followUpQueueModeFromQueueingEnabled(false), "steer", "disabled queueing writes steer");
}

function buildsRootConfigEdit(): void {
  assertDeepEqual(
    followUpQueueModeConfigEdit("steer"),
    {
      keyPath: FOLLOW_UP_QUEUE_MODE_KEY,
      value: "steer",
      mergeStrategy: "replace",
    },
    "follow-up queue mode should write the Desktop root config key",
  );
}

function assertEqual<T>(actual: T, expected: T, message: string): void {
  if (actual !== expected) {
    throw new Error(`${message}: expected ${String(expected)}, got ${String(actual)}`);
  }
}

function assertDeepEqual(actual: unknown, expected: unknown, message: string): void {
  const actualJson = JSON.stringify(actual);
  const expectedJson = JSON.stringify(expected);
  if (actualJson !== expectedJson) {
    throw new Error(`${message}: expected ${expectedJson}, got ${actualJson}`);
  }
}
