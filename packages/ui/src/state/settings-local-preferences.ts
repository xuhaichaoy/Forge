import type { CommandPanelEntry } from "./command-panel";
import {
  CODE_FONT_SIZE_MAX,
  CODE_FONT_SIZE_MIN,
  CODE_FONT_SIZE_STEP,
  DEFAULT_UI_APPEARANCE,
  REDUCED_MOTION_MODES,
  clampCodeFontSize,
  reducedMotionDescription,
  reducedMotionLabel,
  type ReducedMotionMode,
  type UiAppearancePreferences,
} from "./appearance";
import {
  HICODEX_SUPPORTED_LOCALES,
  localeDescription,
  localeLabel,
  type HiCodexLocale,
} from "./i18n";
import {
  UI_THEME_MODES,
  themeModeDescription,
  themeModeLabel,
  type UiThemeMode,
  type UiThemeSnapshot,
} from "./theme";

export function appearanceSettingsEntries(context: {
  uiTheme?: UiThemeSnapshot;
  uiAppearance?: UiAppearancePreferences;
}): CommandPanelEntry[] {
  const appearance = context.uiAppearance ?? DEFAULT_UI_APPEARANCE;
  return [
    projectThemeSettingsEntry(context.uiTheme ?? { mode: "system", resolved: "light" }),
    // CODEX-REF: appearance-settings-*.js - "Code font size" row
    // (id settings.general.appearance.codeFontSize.row, unit "px").
    projectCodeFontSizeSettingsEntry(appearance.codeFontSize),
    // CODEX-REF: appearance-settings-*.js - "Reduce motion" 3-way
    // toggle (id settings.general.appearance.reducedMotion.label).
    projectReducedMotionSettingsEntry(appearance.reducedMotion),
  ];
}

/*
 * CODEX-REF: appearance-settings-*.js. Codex Desktop renders a
 * number input bound to client config `codeFontSize` (range 8-24, unit "px",
 * onBlur commit). HiCodex exposes the value via the status field and uses
 * +/- secondaryActions to step the size by 1px. That maps to the same
 * `setCodeFontSize` action HiCodex dispatches via the command-panel pipeline.
 */
export function projectCodeFontSizeSettingsEntry(size: number): CommandPanelEntry {
  const clamped = clampCodeFontSize(size);
  const decrement = clamped > CODE_FONT_SIZE_MIN ? clamped - CODE_FONT_SIZE_STEP : null;
  const increment = clamped < CODE_FONT_SIZE_MAX ? clamped + CODE_FONT_SIZE_STEP : null;
  return {
    id: "settings:code-font-size",
    title: "Code font size",
    kind: "status",
    // CODEX-REF: settings.general.appearance.codeFontSize.units defaultMessage "px"
    status: `${clamped} px`,
    meta: `Range ${CODE_FONT_SIZE_MIN}-${CODE_FONT_SIZE_MAX} px`,
    details: [
      "Sets `--codex-chat-code-font-size` on the document root.",
      "Local shell preference; does not require app-server refresh.",
    ],
    secondaryActions: [
      ...(decrement !== null ? [{
        id: `code-font-size:${decrement}`,
        label: "−",
        title: `Use ${decrement} px code font`,
        action: {
          type: "setCodeFontSize" as const,
          title: `Use ${decrement} px code font`,
          size: decrement,
        },
      }] : []),
      ...(increment !== null ? [{
        id: `code-font-size:${increment}`,
        label: "+",
        title: `Use ${increment} px code font`,
        action: {
          type: "setCodeFontSize" as const,
          title: `Use ${increment} px code font`,
          size: increment,
        },
      }] : []),
    ],
  };
}

/*
 * CODEX-REF: appearance-settings-*.js. Codex Desktop renders a
 * segmented control with three buttons whose labels resolve from
 *   settings.general.appearance.reducedMotion.{system,on,off}
 * Default option is `system`; mode strings match the message IDs.
 */
export function projectReducedMotionSettingsEntry(mode: ReducedMotionMode): CommandPanelEntry {
  return {
    id: "settings:reduced-motion",
    title: "Reduce motion",
    kind: "status",
    status: reducedMotionLabel(mode),
    meta: "Saved locally",
    details: [
      reducedMotionDescription(mode),
      "Applies via the `data-hc-reduce-motion` attribute on the document root.",
    ],
    secondaryActions: REDUCED_MOTION_MODES
      .filter((nextMode) => nextMode !== mode)
      .map((nextMode) => ({
        id: `reduced-motion:${nextMode}`,
        label: reducedMotionLabel(nextMode),
        title: `Use ${reducedMotionLabel(nextMode).toLowerCase()} reduced motion`,
        action: {
          type: "setReducedMotion" as const,
          title: `Use ${reducedMotionLabel(nextMode).toLowerCase()} reduced motion`,
          mode: nextMode,
        },
      })),
  };
}

export function projectThemeSettingsEntry(theme: UiThemeSnapshot): CommandPanelEntry {
  return {
    id: "settings:theme",
    title: "Theme",
    kind: "theme",
    status: themeModeLabel(theme.mode),
    meta: `Resolved ${theme.resolved}`,
    details: [
      themeModeDescription(theme.mode, theme.resolved),
      "Local shell preference; does not require app-server refresh.",
    ],
    secondaryActions: UI_THEME_MODES
      .filter((mode) => mode !== theme.mode)
      .map((mode) => themeModeAction(mode)),
  };
}

export function projectLocaleSettingsEntry(locale: HiCodexLocale): CommandPanelEntry {
  return {
    id: "settings:locale",
    title: "Language",
    kind: "status",
    status: localeLabel(locale),
    meta: "Saved locally",
    details: [
      localeDescription(locale),
      "Local i18n preference for the HiCodex shell.",
    ],
    secondaryActions: HICODEX_SUPPORTED_LOCALES
      .filter((nextLocale) => nextLocale !== locale)
      .map((nextLocale) => localeAction(nextLocale)),
  };
}

function themeModeAction(mode: UiThemeMode) {
  const label = themeModeLabel(mode);
  return {
    id: `theme:${mode}`,
    label,
    title: `Use ${label} theme`,
    action: {
      type: "setUiTheme" as const,
      title: `Use ${label} theme`,
      mode,
    },
  };
}

function localeAction(locale: HiCodexLocale) {
  const label = localeLabel(locale);
  return {
    id: `locale:${locale}`,
    label,
    title: `Use ${label}`,
    action: {
      type: "setUiLocale" as const,
      title: `Use ${label}`,
      locale,
    },
  };
}
