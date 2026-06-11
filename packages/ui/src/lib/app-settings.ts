import { HICODEX_DESKTOP_CONFIG_ROOT } from "../state/hicodex-desktop-namespace";
import { isTauriRuntime, readAppSettingsFile, writeAppSettingsFile } from "./tauri-host";

/*
 * Durable persistence for the `desktop.hicodex.*` localStorage namespace.
 *
 * WKWebView localStorage is keyed by the app bundle identifier, so a rebrand
 * (com.hicodex.desktop → com.forge.desktop) or a webview data-container
 * change silently wipes every setting: team service address, auth session,
 * model selection, appearance, locale. codex-home survives those events, so
 * the whole namespace is mirrored into hicodex-app-settings.json there:
 *
 *   - startup: hydrate keys that are MISSING from localStorage from disk
 *     (localStorage wins when both exist — it is the live copy);
 *   - writes: callers schedule a debounced snapshot of the namespace to disk.
 */

const APP_SETTINGS_VERSION = 1;
const NAMESPACE_PREFIX = `${HICODEX_DESKTOP_CONFIG_ROOT}.`;
const PERSIST_DEBOUNCE_MS = 400;

interface AppSettingsFilePayload {
  version: number;
  values: Record<string, string>;
}

export function parseAppSettingsPayload(raw: string): Record<string, string> | null {
  const trimmed = raw.trim();
  if (!trimmed) return null;
  try {
    const parsed = JSON.parse(trimmed) as Partial<AppSettingsFilePayload> | null;
    const values = parsed?.values;
    if (!values || typeof values !== "object" || Array.isArray(values)) return null;
    const result: Record<string, string> = {};
    for (const [key, value] of Object.entries(values)) {
      if (key.startsWith(NAMESPACE_PREFIX) && typeof value === "string") {
        result[key] = value;
      }
    }
    return result;
  } catch {
    return null;
  }
}

export function collectNamespaceSnapshot(storage: Storage): Record<string, string> {
  const values: Record<string, string> = {};
  for (let index = 0; index < storage.length; index += 1) {
    const key = storage.key(index);
    if (!key || !key.startsWith(NAMESPACE_PREFIX)) continue;
    const value = storage.getItem(key);
    if (value !== null) values[key] = value;
  }
  return values;
}

export function applyHydratedValues(
  storage: Storage,
  values: Record<string, string>,
): number {
  let applied = 0;
  for (const [key, value] of Object.entries(values)) {
    if (storage.getItem(key) !== null) continue;
    storage.setItem(key, value);
    applied += 1;
  }
  return applied;
}

/*
 * Must run BEFORE the React tree renders: connection/auth/model-selection
 * reads are synchronous localStorage reads at render time.
 */
export async function hydrateAppSettingsFromDisk(
  storage: Storage | null = browserStorage(),
): Promise<void> {
  if (!storage || !isTauriRuntime()) return;
  try {
    const values = parseAppSettingsPayload(await readAppSettingsFile());
    if (!values) return;
    applyHydratedValues(storage, values);
  } catch {
    // Hydration is best-effort: a missing/corrupt settings file falls back to
    // whatever localStorage holds (possibly factory defaults).
  }
}

let persistTimer: ReturnType<typeof setTimeout> | null = null;

function persistAppSettingsNow(storage: Storage): void {
  const payload: AppSettingsFilePayload = {
    version: APP_SETTINGS_VERSION,
    values: collectNamespaceSnapshot(storage),
  };
  void writeAppSettingsFile(JSON.stringify(payload, null, 2)).catch(() => {
    // Best-effort mirror; the next write retries.
  });
}

/*
 * Fire-and-forget mirror of the current namespace to disk. Debounced so call
 * sites can invoke it after every localStorage write without IPC spam.
 */
export function scheduleAppSettingsPersist(
  storage: Storage | null = browserStorage(),
): void {
  if (!storage || !isTauriRuntime()) return;
  if (persistTimer) clearTimeout(persistTimer);
  persistTimer = setTimeout(() => {
    persistTimer = null;
    persistAppSettingsNow(storage);
  }, PERSIST_DEBOUNCE_MS);
}

/*
 * Safety net for the namespace writes that have no explicit mirror call
 * (appearance, locale, composer prefs, …): a periodic snapshot plus an
 * immediate flush when the page unloads.
 */
export function installAppSettingsAutoPersist(
  storage: Storage | null = browserStorage(),
): () => void {
  if (!storage || !isTauriRuntime() || typeof window === "undefined") {
    return () => {};
  }
  const flush = () => {
    if (persistTimer) {
      clearTimeout(persistTimer);
      persistTimer = null;
    }
    persistAppSettingsNow(storage);
  };
  const interval = setInterval(() => scheduleAppSettingsPersist(storage), 60_000);
  window.addEventListener("pagehide", flush);
  window.addEventListener("beforeunload", flush);
  return () => {
    clearInterval(interval);
    window.removeEventListener("pagehide", flush);
    window.removeEventListener("beforeunload", flush);
  };
}

function browserStorage(): Storage | null {
  try {
    return typeof window === "undefined" ? null : window.localStorage;
  } catch {
    return null;
  }
}
