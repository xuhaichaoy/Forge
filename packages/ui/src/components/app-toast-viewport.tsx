import { X } from "lucide-react";
import { useState } from "react";
import type { LogLine } from "../state/codex-reducer";

// codex toast-signal-CTz_x1Qc.js — the default toast duration is `var r=5` (5 seconds);
// the toast lifetime/auto-dismiss matches that, not the 7s HiCodex previously used.
const DEFAULT_TOAST_TTL_MS = 5_000;
const MAX_VISIBLE_TOASTS = 3;

export interface AppToastViewportProps {
  logs: LogLine[];
  now?: number;
}

const EMPTY_DISMISSED: ReadonlySet<string> = new Set();

export function AppToastViewport({ logs, now = Date.now() }: AppToastViewportProps) {
  // codex toast-signal-CTz_x1Qc.js — `hasCloseButton` defaults to true, so every toast is
  // user-dismissible. Track dismissed ids locally (toasts are derived from immutable log
  // state) so the close affordance hides them ahead of the auto-dismiss TTL.
  const [dismissed, setDismissed] = useState<ReadonlySet<string>>(EMPTY_DISMISSED);
  const toasts = projectToastLogs(logs, now).filter((log) => !dismissed.has(log.id));
  if (toasts.length === 0) return null;
  return (
    <div className="hc-toast-viewport" role="status" aria-live="polite" aria-atomic="false">
      {toasts.map((log) => (
        <article className="hc-app-toast" data-level={log.level} key={log.id}>
          <span className="hc-app-toast-dot" aria-hidden />
          <p>{log.text}</p>
          <button
            type="button"
            className="hc-app-toast-close"
            aria-label="Dismiss"
            onClick={() => setDismissed((prev) => {
              const next = new Set(prev);
              next.add(log.id);
              return next;
            })}
          >
            <X size={16} aria-hidden />
          </button>
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
  const text = log.text.trim();
  if (!text) return false;
  if (INTERNAL_LOG_PATTERNS.some((pattern) => pattern.test(text))) return false;
  if (log.level !== "info") return true;
  return !INTERNAL_INFO_PREFIXES.some((prefix) => text.startsWith(prefix));
}

const INTERNAL_INFO_PREFIXES = [
  "attached to initialized Codex app-server",
  "initialized Codex app-server",
  "getAuthStatus",
  "thread is not materialized yet",
];

const INTERNAL_LOG_PATTERNS = [
  /^attaching to existing Codex app-server$/i,
  /^attached to initialized Codex app-server$/i,
  /^initialized Codex app-server$/i,
  /^[a-z][\w-]* (?:starting|ready|stopping|stopped|restarting)$/i,
  /^Falling back from WebSockets to HTTPS transport\./i,
  /^stream disconnected before completion:/i,
  /^Cannot read properties of undefined \(reading ['"]transformCallback['"]\)$/i,
  // codex-rs warns when a model slug is absent from its bundled metadata table
  // (e.g. a subscription model routed through `openai_http`) and falls back to
  // default metadata. The turn still completes normally, so this is benign
  // noise rather than a user-actionable error — keep it in the log history but
  // don't pop a scary toast on every turn. (The proper fix is to supply the
  // model metadata so codex-rs stops falling back.)
  /^Model metadata for .+ not found\. Defaulting to fallback metadata/i,
];
