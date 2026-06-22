import type { ConfigWriteActionEdit } from "./command-panel";

export type FollowUpQueueMode = "queue" | "steer";

export const FOLLOW_UP_QUEUE_MODE_KEY = "followUpQueueMode";
export const DEFAULT_FOLLOW_UP_QUEUE_MODE: FollowUpQueueMode = "queue";

export function normalizeFollowUpQueueMode(value: unknown): FollowUpQueueMode {
  if (value === "steer" || value === "interrupt") return "steer";
  return DEFAULT_FOLLOW_UP_QUEUE_MODE;
}

export function isLegacyFollowUpQueueMode(value: unknown): value is "interrupt" {
  return value === "interrupt";
}

export function followUpQueueingEnabledFromMode(mode: FollowUpQueueMode): boolean {
  return mode === "queue";
}

export function followUpQueueModeFromQueueingEnabled(enabled: boolean): FollowUpQueueMode {
  return enabled ? "queue" : "steer";
}

export function followUpQueueModeConfigEdit(mode: FollowUpQueueMode): ConfigWriteActionEdit {
  return {
    keyPath: FOLLOW_UP_QUEUE_MODE_KEY,
    value: mode,
    mergeStrategy: "replace",
  };
}
