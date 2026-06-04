export function formatError(error: unknown): string {
  if (error instanceof Error) return error.message;
  if (error && typeof error === "object") {
    const message = (error as Record<string, unknown>).message;
    if (typeof message === "string") return message;
  }
  return String(error);
}

export function formatUnknown(value: unknown): string {
  if (value === null || value === undefined) return "";
  if (typeof value === "string") return value;
  if (typeof value === "number" || typeof value === "boolean") return String(value);
  try {
    return JSON.stringify(value, null, 2);
  } catch {
    return String(value);
  }
}

export function stringField(value: unknown, key: string): string {
  if (!value || typeof value !== "object") return "";
  const field = (value as Record<string, unknown>)[key];
  return typeof field === "string" ? field : "";
}

/*
 * ANSI CSI / SGR escape sequences emitted by Rust `tracing-subscriber` when
 * the codex app-server writes to a TTY-like pipe (`\x1b[31m` red, `\x1b[2m`
 * dim, `\x1b[3m` italic, `\x1b[0m` reset, `\x1b[2J` clear screen, …).
 * HiCodex's stderr reader was forwarding raw codes into the toast viewport
 * (Screen Recording 2026-05-21 at 07.57.04 right-bottom toast). Codex Desktop
 * never surfaces stderr to the renderer — `remote-conversation-page-*.js`
 * only consumes structured `error` notifications via `params.error.message`.
 * We mirror that by stripping escapes anywhere a stderr line could leak into
 * user-facing text.
 *
 * Pattern: ESC (0x1B) + CSI introducer (`[`) + standard parameter bytes
 * (0x30-0x3F) + intermediate bytes (0x20-0x2F) + final byte (0x40-0x7E).
 * Covers the SGR + cursor-control subset tracing-subscriber emits — the only
 * forms observed in practice. Non-CSI single-byte escapes (OSC, RI, …) are
 * not stripped; tracing-subscriber doesn't emit them, and a stricter pattern
 * is safer than an overly broad one that could accidentally eat real text.
 */
// eslint-disable-next-line no-control-regex
const ANSI_ESCAPE_PATTERN = /\x1b\[[0-?]*[ -/]*[@-~]/g;

export function stripAnsiEscapes(value: string): string {
  if (!value) return value;
  return value.replace(ANSI_ESCAPE_PATTERN, "");
}

export function hostFromBaseUrl(value: string | null | undefined, fallback: string): string {
  const trimmed = value?.trim();
  if (!trimmed) return fallback;
  try {
    return new URL(trimmed).host || fallback;
  } catch {
    return fallback;
  }
}

export function patchFailurePathForOpen(path: string, cwd: string): string {
  const trimmed = path.trim();
  if (!trimmed) return "";
  if (/^(?:\/|[A-Za-z]:[\\/]|\\\\)/.test(trimmed)) return trimmed;
  const root = cwd.trim().replace(/[\\/]+$/, "");
  if (!root) return trimmed;
  return `${root}/${trimmed.replace(/^(?:\.[\\/]|[\\/])+/, "")}`;
}
