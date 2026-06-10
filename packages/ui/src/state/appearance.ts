import type { BrowserStorageLike } from "./image-generation-tool";
import { HICODEX_DESKTOP_CONFIG_KEYS, readMigratedStorageValue } from "./hicodex-desktop-namespace";

/*
 * CODEX-REF: Two settings beyond Theme mode from Codex Desktop Appearance
 * panel (appearance-settings-*.js):
 *
 *   §0 UI font size  — settings.general.appearance.sansFontSize.row
 *       ("UI font size"), unit "px", description "Adjust the base size used for
 *       the UI". Codex sets `--vscode-font-size` and lets its rem/var cascade
 *       scale every UI text size. HiCodex's CSS is ~588 hardcoded-px font sizes
 *       (only 10 are var-based), so a single var cannot reach them; instead we
 *       publish a SCALE factor `--hc-ui-font-scale` (= size / 14) and every
 *       `font-size` in the stylesheet is `calc(Npx * var(--hc-ui-font-scale,1))`.
 *       Default 14 → scale 1 → no change. Code blocks are excluded (they ride the
 *       independent code-font-size var below). Persisted under key `sansFontSize`.
 *
 *   §4 Code font size — settings.general.appearance.codeFontSize.row,
 *       unit "px" (id settings.general.appearance.codeFontSize.units),
 *       range 8-24, persisted on blur to client config key
 *       `codeFontSize` / `appearance.codeFontSize`.
 *
 *   §8 Reduce motion  — settings.general.appearance.reducedMotion.label,
 *       3-way segmented toggle System/On/Off (ids
 *       settings.general.appearance.reducedMotion.{system,on,off}),
 *       client config key `reducedMotion` / `appearance.reducedMotion`.
 *
 * HiCodex stores both under the desktop.hicodex.* namespace (browser
 * localStorage); see [[appearanceTheme]] for the analogous theme-mode
 * persistence. Code font size drives the CSS variable
 * `--codex-chat-code-font-size` defined in base.css; reduced motion drives
 * `data-hc-reduce-motion` on `<html>`, which CSS turns into transition/animation
 * suppression.
 */

export const CODE_FONT_SIZE_MIN = 8;
export const CODE_FONT_SIZE_MAX = 24;
// CODEX-REF: base.css :65 `--codex-chat-code-font-size: 12px;` is HiCodex's
// pre-existing default for the chat code font — keep that as the resolved
// fallback when no user preference is stored.
export const CODE_FONT_SIZE_DEFAULT = 12;
export const CODE_FONT_SIZE_STEP = 1;

// UI (sans) font size — the whole-UI text scale. DEFAULT 14 matches base.css
// `--text-base: 14px`; the `--hc-ui-font-scale` factor published from it is
// `size / UI_FONT_SIZE_DEFAULT`, so 14 → 1.0 (no change). The range is kept
// conservative (10-20) because HiCodex spacing/padding stay fixed px while only
// fonts scale, so extreme sizes would crowd fixed-width chrome.
export const UI_FONT_SIZE_MIN = 10;
export const UI_FONT_SIZE_MAX = 20;
export const UI_FONT_SIZE_DEFAULT = 14;
export const UI_FONT_SIZE_STEP = 1;

export const REDUCED_MOTION_MODES = ["system", "on", "off"] as const;
export type ReducedMotionMode = (typeof REDUCED_MOTION_MODES)[number];

export interface UiAppearancePreferences {
  uiFontSize: number;
  codeFontSize: number;
  reducedMotion: ReducedMotionMode;
}

export const DEFAULT_UI_APPEARANCE: UiAppearancePreferences = {
  uiFontSize: UI_FONT_SIZE_DEFAULT,
  codeFontSize: CODE_FONT_SIZE_DEFAULT,
  reducedMotion: "system",
};

export function isReducedMotionMode(value: unknown): value is ReducedMotionMode {
  return typeof value === "string" && REDUCED_MOTION_MODES.includes(value as ReducedMotionMode);
}

export function clampCodeFontSize(value: number): number {
  if (!Number.isFinite(value)) return CODE_FONT_SIZE_DEFAULT;
  const rounded = Math.round(value);
  if (rounded < CODE_FONT_SIZE_MIN) return CODE_FONT_SIZE_MIN;
  if (rounded > CODE_FONT_SIZE_MAX) return CODE_FONT_SIZE_MAX;
  return rounded;
}

export function clampUiFontSize(value: number): number {
  if (!Number.isFinite(value)) return UI_FONT_SIZE_DEFAULT;
  const rounded = Math.round(value);
  if (rounded < UI_FONT_SIZE_MIN) return UI_FONT_SIZE_MIN;
  if (rounded > UI_FONT_SIZE_MAX) return UI_FONT_SIZE_MAX;
  return rounded;
}

// The CSS scale factor every `font-size: calc(Npx * var(--hc-ui-font-scale))`
// multiplies by. Base is UI_FONT_SIZE_DEFAULT so the default size is exactly 1.0.
export function uiFontScale(uiFontSize: number): number {
  return clampUiFontSize(uiFontSize) / UI_FONT_SIZE_DEFAULT;
}

export function loadUiAppearance(storage: BrowserStorageLike | null): UiAppearancePreferences {
  if (!storage) return { ...DEFAULT_UI_APPEARANCE };
  let uiFontSize = UI_FONT_SIZE_DEFAULT;
  let codeFontSize = CODE_FONT_SIZE_DEFAULT;
  let reducedMotion: ReducedMotionMode = "system";
  try {
    const raw = readMigratedStorageValue(storage, HICODEX_DESKTOP_CONFIG_KEYS.appearanceUiFontSize);
    const parsed = raw === null ? Number.NaN : Number(raw);
    if (Number.isFinite(parsed)) uiFontSize = clampUiFontSize(parsed);
  } catch {
    // keep default
  }
  try {
    const raw = readMigratedStorageValue(storage, HICODEX_DESKTOP_CONFIG_KEYS.appearanceCodeFontSize);
    const parsed = raw === null ? Number.NaN : Number(raw);
    if (Number.isFinite(parsed)) codeFontSize = clampCodeFontSize(parsed);
  } catch {
    // keep default
  }
  try {
    const raw = readMigratedStorageValue(storage, HICODEX_DESKTOP_CONFIG_KEYS.appearanceReducedMotion);
    if (isReducedMotionMode(raw)) reducedMotion = raw;
  } catch {
    // keep default
  }
  return { uiFontSize, codeFontSize, reducedMotion };
}

export function saveUiFontSize(storage: BrowserStorageLike | null, size: number): void {
  if (!storage) return;
  try {
    storage.setItem(HICODEX_DESKTOP_CONFIG_KEYS.appearanceUiFontSize, String(clampUiFontSize(size)));
  } catch {
    // Preference still applies for this session when storage is unavailable.
  }
}

export function saveUiCodeFontSize(storage: BrowserStorageLike | null, size: number): void {
  if (!storage) return;
  try {
    storage.setItem(HICODEX_DESKTOP_CONFIG_KEYS.appearanceCodeFontSize, String(clampCodeFontSize(size)));
  } catch {
    // Preference still applies for this session when storage is unavailable.
  }
}

export function saveUiReducedMotion(storage: BrowserStorageLike | null, mode: ReducedMotionMode): void {
  if (!storage) return;
  try {
    storage.setItem(HICODEX_DESKTOP_CONFIG_KEYS.appearanceReducedMotion, mode);
  } catch {
    // Preference still applies for this session when storage is unavailable.
  }
}

// CODEX-REF: Labels mirror the resolved defaultMessage strings under
// settings.general.appearance.reducedMotion.* (see Codex appearance spec).
export function reducedMotionLabel(mode: ReducedMotionMode): string {
  switch (mode) {
    case "on":
      return "On";
    case "off":
      return "Off";
    default:
      return "System";
  }
}

export function reducedMotionDescription(mode: ReducedMotionMode): string {
  switch (mode) {
    case "on":
      return "Suppress transitions and animations regardless of OS preference.";
    case "off":
      return "Play transitions and animations even if the OS requests reduced motion.";
    default:
      return "Follow the operating system reduced-motion preference.";
  }
}
