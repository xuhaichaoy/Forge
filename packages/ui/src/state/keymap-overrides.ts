import type { BrowserStorageLike } from "./image-generation-tool";
import { HICODEX_DESKTOP_CONFIG_KEYS } from "./hicodex-desktop-namespace";

/*
 * CODEX-REF: keyboard-shortcuts-settings-*.js. Codex Desktop persists
 * keymap overrides through a pair of host bridges:
 *   - query `codex-command-keymap-state` → snapshot of all current bindings
 *   - mutation `set-codex-command-keybinding` with one of 5 types
 *     (set / replace / append / remove / reset)
 *
 * HiCodex re-implements just the webview-visible subset:
 *
 *   { [commandId: string]: string | null }
 *
 *   - present + non-empty string → user-supplied accelerator (e.g. "CmdOrCtrl+K")
 *   - present + null             → user explicitly UNBOUND the command
 *   - absent                     → use the default keybinding from
 *                                  COMMAND_DESCRIPTORS[*].defaultKeybindings
 *
 * Persistence target is desktop.hicodex.keymap in browser localStorage. Native
 * menu accelerators (registered in apps/desktop/src-tauri/src/main.rs) are NOT
 * updated by these overrides — they stay on their compile-time defaults.
 * Codex Desktop's panel has the same restriction (see Audit report at the top
 * of this conversation: "Caveat: menu items have hardcoded accelerators in
 * Rust and do not auto-update when user rebinds").
 *
 * Multi-key sequences (e.g. "K S" with 500ms timeout) and modifier-only
 * accelerators are NOT supported in this iteration — Codex's spec gates them
 * behind per-command `allowsSequences` / `allowsBareModifiers` flags, which
 * HiCodex descriptors don't yet expose. See [[keymap-overrides]] in the
 * settings-panel-workflow `keyboardShortcutsSettingsEntries` comment.
 */

export type KeymapOverrides = Readonly<Record<string, string | null>>;

export const EMPTY_KEYMAP_OVERRIDES: KeymapOverrides = Object.freeze({});

/*
 * Module-level singleton mirrors the React useState in HiCodexApp. Read-paths
 * that don't live inside React (useHotkey, descriptorAcceleratorLabel) consult
 * this snapshot directly so the resolved accelerator stays consistent with
 * what the user sees in the Settings panel. The React state is the source of
 * truth; HiCodexApp keeps both sides in sync via setUiKeymapOverrides.
 */
let activeOverrides: KeymapOverrides = EMPTY_KEYMAP_OVERRIDES;
const subscribers = new Set<(overrides: KeymapOverrides) => void>();

export function getActiveKeymapOverrides(): KeymapOverrides {
  return activeOverrides;
}

export function setActiveKeymapOverrides(next: KeymapOverrides): void {
  activeOverrides = next;
  for (const subscriber of subscribers) subscriber(next);
}

/*
 * Listeners can register to react to module-level updates — useful if a
 * non-React keyboard handler caches the resolved accelerator. None do today,
 * but the wiring is here for symmetry with Codex's host event subscription.
 */
export function subscribeKeymapOverrides(
  listener: (overrides: KeymapOverrides) => void,
): () => void {
  subscribers.add(listener);
  return () => {
    subscribers.delete(listener);
  };
}

/*
 * Returns the override entry for a command, distinguishing 3 states:
 *   - undefined → no override; use default keybinding
 *   - null      → user explicitly unbound the command
 *   - string    → user-supplied accelerator (already normalized)
 */
export function resolveKeymapOverride(
  commandId: string,
  overrides: KeymapOverrides = activeOverrides,
): string | null | undefined {
  if (!Object.prototype.hasOwnProperty.call(overrides, commandId)) return undefined;
  const value = overrides[commandId];
  if (value === null) return null;
  if (typeof value === "string" && value.length > 0) return value;
  return undefined;
}

export function withKeymapOverride(
  overrides: KeymapOverrides,
  commandId: string,
  accelerator: string | null,
): KeymapOverrides {
  return Object.freeze({ ...overrides, [commandId]: accelerator });
}

export function withoutKeymapOverride(
  overrides: KeymapOverrides,
  commandId: string,
): KeymapOverrides {
  if (!Object.prototype.hasOwnProperty.call(overrides, commandId)) return overrides;
  const next = { ...overrides };
  delete next[commandId];
  return Object.freeze(next);
}

export function loadKeymapOverrides(storage: BrowserStorageLike | null): KeymapOverrides {
  if (!storage) return EMPTY_KEYMAP_OVERRIDES;
  let raw: string | null = null;
  try {
    raw = storage.getItem(HICODEX_DESKTOP_CONFIG_KEYS.keymapOverrides);
  } catch {
    return EMPTY_KEYMAP_OVERRIDES;
  }
  if (!raw) return EMPTY_KEYMAP_OVERRIDES;
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return EMPTY_KEYMAP_OVERRIDES;
  }
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) return EMPTY_KEYMAP_OVERRIDES;
  const sanitized: Record<string, string | null> = {};
  for (const [key, value] of Object.entries(parsed as Record<string, unknown>)) {
    if (typeof key !== "string" || key.length === 0) continue;
    if (value === null) {
      sanitized[key] = null;
    } else if (typeof value === "string" && value.length > 0) {
      sanitized[key] = value;
    }
  }
  return Object.freeze(sanitized);
}

export function saveKeymapOverrides(
  storage: BrowserStorageLike | null,
  overrides: KeymapOverrides,
): void {
  if (!storage) return;
  try {
    storage.setItem(HICODEX_DESKTOP_CONFIG_KEYS.keymapOverrides, JSON.stringify(overrides));
  } catch {
    // Preference still applies for this session when storage is unavailable.
  }
}
