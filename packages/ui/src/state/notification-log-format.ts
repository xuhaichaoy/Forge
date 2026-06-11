import { stringField } from "../lib/format";

export function shortThreadId(id: string): string {
  return id.length > 12 ? `${id.slice(0, 8)}...${id.slice(-4)}` : id;
}

export function fsChangedLogText(params: Record<string, unknown>): string {
  const watchId = stringField(params, "watchId") || "unknown";
  const paths = Array.isArray(params.changedPaths)
    ? params.changedPaths.filter((path): path is string => typeof path === "string")
    : [];
  const preview = paths.slice(0, 3).join(", ");
  const extra = paths.length > 3 ? ` (+${paths.length - 3} more)` : "";
  return `filesystem changed for watch ${watchId}: ${preview || "no paths"}${extra}`;
}

export function hookLogText(phase: "started" | "completed", params: Record<string, unknown>): string {
  const threadId = stringField(params, "threadId");
  const turnId = stringField(params, "turnId");
  const run = recordParam(params.run);
  const eventName = stringField(run, "eventName") || "hook";
  const sourcePath = stringField(run, "sourcePath");
  const status = stringField(run, "status");
  const statusMessage = stringField(run, "statusMessage");
  const location = [
    threadId ? `thread ${shortThreadId(threadId)}` : "",
    turnId ? `turn ${shortThreadId(turnId)}` : "",
  ].filter(Boolean).join(", ");
  const suffix = [
    location,
    sourcePath,
    status && phase === "completed" ? status : "",
    statusMessage,
  ].filter(Boolean).join(" - ");
  return `hook ${phase}: ${eventName}${suffix ? ` - ${suffix}` : ""}`;
}

export function hookRunStatus(params: Record<string, unknown>): string {
  const run = recordParam(params.run);
  return stringField(run, "status");
}

export function formatUnknownForLog(value: unknown): string {
  if (value === null || value === undefined) return "";
  if (typeof value === "string") return value;
  if (typeof value === "number" || typeof value === "boolean") return String(value);
  try {
    return JSON.stringify(value);
  } catch {
    return String(value);
  }
}

function recordParam(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" ? value as Record<string, unknown> : null;
}
