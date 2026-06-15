import type { BrowserStorageLike } from "./image-generation-tool";

/*
 * CODEX-REF: /private/tmp/codex-asar/pretty/set-pinned-thread-BF6dMuHF.pretty.js:1-11
 * and /private/tmp/codex-asar/pretty/src-DAzAmbVS.pretty.js:2988 -
 * Codex Desktop reads `list-pinned-threads`, writes `set-thread-pinned` /
 * `set-pinned-threads-order`, and persists the `pinned-thread-ids` key.
 * Forge keeps this as a local app-layer overlay until the Tauri host owns
 * the equivalent Desktop host store.
 */
export const DESKTOP_PINNED_THREAD_IDS_STORAGE_KEY = "pinned-thread-ids";

export function loadPinnedThreadIds(storage: BrowserStorageLike | null | undefined): Set<string> {
  const raw = storage?.getItem(DESKTOP_PINNED_THREAD_IDS_STORAGE_KEY);
  return new Set(normalizePinnedThreadIds(raw));
}

export function savePinnedThreadIds(
  storage: BrowserStorageLike | null | undefined,
  threadIds: Iterable<string>,
): void {
  if (!storage) return;
  try {
    storage.setItem(DESKTOP_PINNED_THREAD_IDS_STORAGE_KEY, JSON.stringify(normalizePinnedThreadIds([...threadIds])));
  } catch {
    // Thread pin state still updates in memory when browser storage is unavailable.
  }
}

export function updatePinnedThreadIds(
  current: ReadonlySet<string>,
  threadId: string,
  pinned: boolean,
): Set<string> {
  const normalizedThreadId = normalizeThreadId(threadId);
  const next = new Set(current);
  if (!normalizedThreadId) return next;
  if (pinned) {
    next.add(normalizedThreadId);
  } else {
    next.delete(normalizedThreadId);
  }
  return next;
}

function normalizePinnedThreadIds(value: unknown): string[] {
  const parsed = parseStoredPinnedThreadIds(value);
  if (Array.isArray(parsed)) return dedupeThreadIds(parsed);
  return [];
}

function parseStoredPinnedThreadIds(value: unknown): unknown {
  if (typeof value !== "string") return value;
  try {
    return JSON.parse(value);
  } catch {
    return value;
  }
}

function dedupeThreadIds(values: unknown[]): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const value of values) {
    const normalized = normalizeThreadId(value);
    if (!normalized || seen.has(normalized)) continue;
    seen.add(normalized);
    out.push(normalized);
  }
  return out;
}

function normalizeThreadId(value: unknown): string | null {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}
