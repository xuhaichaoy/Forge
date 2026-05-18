import type { LogLine } from "../state/codex-reducer";

const DEFAULT_TOAST_TTL_MS = 7_000;
const MAX_VISIBLE_TOASTS = 3;

export interface AppToastViewportProps {
  logs: LogLine[];
  now?: number;
}

export function AppToastViewport({ logs, now = Date.now() }: AppToastViewportProps) {
  const toasts = projectToastLogs(logs, now);
  if (toasts.length === 0) return null;
  return (
    <div className="hc-toast-viewport" role="status" aria-live="polite" aria-atomic="false">
      {toasts.map((log) => (
        <article className="hc-app-toast" data-level={log.level} key={log.id}>
          <span className="hc-app-toast-dot" aria-hidden />
          <p>{log.text}</p>
        </article>
      ))}
    </div>
  );
}

export function projectToastLogs(
  logs: LogLine[],
  now: number,
  ttlMs = DEFAULT_TOAST_TTL_MS,
): LogLine[] {
  return logs
    .filter((log) => now - log.at <= ttlMs)
    .filter(isToastWorthyLog)
    .slice(0, MAX_VISIBLE_TOASTS);
}

function isToastWorthyLog(log: LogLine): boolean {
  if (log.level !== "info") return true;
  const text = log.text.trim();
  if (!text) return false;
  return !INTERNAL_INFO_PREFIXES.some((prefix) => text.startsWith(prefix));
}

const INTERNAL_INFO_PREFIXES = [
  "attached to initialized Codex app-server",
  "initialized Codex app-server",
  "getAuthStatus",
  "thread is not materialized yet",
];
