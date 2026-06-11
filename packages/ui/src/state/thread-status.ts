import { formatUnknown, stringField } from "../lib/format";

export function threadStatusLabel(status: unknown): string {
  if (status === null || status === undefined) return "ready";
  if (typeof status === "string") return friendlyStatus(status);
  if (typeof status === "number" || typeof status === "boolean") return String(status);
  if (typeof status === "object") {
    const record = status as Record<string, unknown>;
    const type = trimmedStatusField(record, "type");
    const value = trimmedStatusField(record, "status");
    return type ? friendlyStatus(type) : value ? friendlyStatus(value) : compactUnknown(status);
  }
  return String(status);
}

export function isThreadStatusNotLoaded(status: unknown): boolean {
  if (typeof status === "string") return status === "notLoaded";
  if (!status || typeof status !== "object") return false;
  const record = status as Record<string, unknown>;
  return trimmedStatusField(record, "type") === "notLoaded" || trimmedStatusField(record, "status") === "notLoaded";
}

function trimmedStatusField(value: unknown, key: string): string {
  return stringField(value, key).trim();
}

function compactUnknown(value: unknown): string {
  try {
    return JSON.stringify(value);
  } catch {
    return formatUnknown(value);
  }
}

function friendlyStatus(status: string): string {
  const normalized = status.trim();
  if (!normalized) return "ready";
  switch (normalized) {
    case "notLoaded":
      return "not loaded";
    case "inProgress":
    case "active":
      return "running";
    case "completed":
      return "idle";
    default:
      return normalized;
  }
}
