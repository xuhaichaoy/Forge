import { useEffect, useRef, useState } from "react";
import {
  CODE_FONT_SIZE_DEFAULT,
  CODE_FONT_SIZE_MAX,
  CODE_FONT_SIZE_MIN,
  CODE_FONT_SIZE_STEP,
  REDUCED_MOTION_MODES,
  UI_FONT_SIZE_MAX,
  UI_FONT_SIZE_MIN,
  UI_FONT_SIZE_STEP,
  clampCodeFontSize,
  clampUiFontSize,
  reducedMotionLabel,
  type ReducedMotionMode,
  type UiAppearancePreferences,
} from "../state/appearance";
import {
  APPEARANCE_THEME_MODE_ORDER,
  themeModeLabel,
  type UiThemeMode,
  type UiThemeSnapshot,
} from "../state/theme";
import { FORGE_SUPPORTED_LOCALES, type ForgeLocale } from "../state/i18n";
import { useForgeIntl } from "./i18n-provider";

/*
 * CODEX-REF: appearance-settings-*.js inline editor. Codex Desktop
 * renders the Appearance panel as a column of labelled control rows (not as
 * a CommandPanelEntry list), so Forge follows suit. The three controls
 * that currently have Forge-side backing are Theme (§1), Code font size
 * (§4), and Reduce motion (§8); the other Codex sections (light/dark color
 * pickers, code theme, diff markers, pointer cursors) are not implemented
 * because Forge's base.css is hardcoded hex and there's no token-override
 * pipeline yet.
 *
 * Each row mirrors the Codex layout:
 *   - label column on the left (title + short description)
 *   - control column on the right
 *     - Theme / Reduce motion → segmented toggle (matches Codex's pill group)
 *     - Code font size → number input with px suffix
 */

export interface AppearanceSettingsPanelProps {
  uiTheme: UiThemeSnapshot;
  uiAppearance: UiAppearancePreferences;
  uiLocale: ForgeLocale;
  onSetUiTheme: (mode: UiThemeMode) => void;
  onSetUiFontSize: (size: number) => void;
  onSetCodeFontSize: (size: number) => void;
  onSetReducedMotion: (mode: ReducedMotionMode) => void;
  onSetUiLocale: (locale: ForgeLocale) => void;
}

export function AppearanceSettingsPanel({
  uiTheme,
  uiAppearance,
  uiLocale,
  onSetUiTheme,
  onSetUiFontSize,
  onSetCodeFontSize,
  onSetReducedMotion,
  onSetUiLocale,
}: AppearanceSettingsPanelProps) {
  const { formatMessage } = useForgeIntl();
  return (
    <div className="hc-appearance-settings">
      {/*
        * CODEX-REF: appearance-settings-*.js §1 — Theme row.
        * Codex i18n: settings.general.appearance.theme.{light,dark,system}.
        * Description is the static settings.general.appearance.theme.description
        * (Codex shows one fixed sentence, not a mode-dependent prose). Segmented
        * options follow Codex order Light | Dark | System
        * (APPEARANCE_THEME_MODE_ORDER), with System last.
        */}
      <AppearanceRow
        title={formatMessage({ id: "settings.general.appearance.theme", defaultMessage: "Theme" })}
        description={formatMessage({
          id: "settings.general.appearance.theme.description",
          defaultMessage: "Use light, dark, or match your system",
        })}
      >
        <SegmentedToggle
          options={APPEARANCE_THEME_MODE_ORDER.map((mode) => ({
            value: mode,
            label: themeModeLabel(mode),
            ariaLabel: themeModeLabel(mode),
          }))}
          value={uiTheme.mode}
          onChange={(value) => onSetUiTheme(value as UiThemeMode)}
          ariaLabel="Theme"
        />
      </AppearanceRow>
      {/*
        * codex: general-settings-*.js `Er` — language picker (id
        * settings.ide.language.label "Language" / .description "Language for the
        * app UI"). Codex hosts it in General settings; Forge surfaces the EN/ZH
        * switch here next to Theme via the same SegmentedToggle. The locale
        * backend (setUiLocale + persistence + IntlProvider) already exists — this
        * is just the missing in-panel control. Native labels (English / 简体中文).
        */}
      <AppearanceRow
        title={formatMessage({ id: "settings.ide.language.label", defaultMessage: "Language" })}
        description={formatMessage({
          id: "settings.ide.language.description",
          defaultMessage: "Language for the app UI",
        })}
      >
        <SegmentedToggle
          options={FORGE_SUPPORTED_LOCALES.map((locale) => ({
            value: locale,
            label: localeNativeLabel(locale),
            ariaLabel: localeNativeLabel(locale),
          }))}
          value={uiLocale}
          onChange={(value) => onSetUiLocale(value as ForgeLocale)}
          ariaLabel={formatMessage({ id: "settings.ide.language.label", defaultMessage: "Language" })}
        />
      </AppearanceRow>
      {/*
        * CODEX-REF: general-settings-*.js — "UI font size" row (id
        * settings.general.appearance.sansFontSize.row, "Sans font size" base
        * key). Codex sets `--vscode-font-size`; Forge publishes
        * `--hc-ui-font-scale` (see ForgeApp apply effect) which every
        * stylesheet `font-size` calc multiplies by. Brand word dropped per the
        * Forge convention ("…used for the UI", not "…the Codex UI").
        */}
      <AppearanceRow
        title={formatMessage({
          id: "settings.general.appearance.sansFontSize.row",
          defaultMessage: "UI font size",
        })}
        description={formatMessage({
          id: "settings.general.appearance.sansFontSize.row.description",
          defaultMessage: "Adjust the base size used for the UI",
        })}
      >
        <FontSizeInput
          value={uiAppearance.uiFontSize}
          min={UI_FONT_SIZE_MIN}
          max={UI_FONT_SIZE_MAX}
          step={UI_FONT_SIZE_STEP}
          clamp={clampUiFontSize}
          ariaLabel={formatMessage({ id: "settings.general.appearance.sansFontSize.row", defaultMessage: "UI font size" })}
          unitLabel={formatMessage({ id: "settings.general.appearance.sansFontSize.units", defaultMessage: "px" })}
          onCommit={onSetUiFontSize}
        />
      </AppearanceRow>
      {/*
        * CODEX-REF: appearance-settings-*.js §4 — Code font size.
        * Codex spec: <input type="number" min={8} max={24} step={1}>, commit
        * onBlur, Enter triggers blur, NaN reverts. Forge mirrors verbatim.
        */}
      <AppearanceRow
        title={formatMessage({
          id: "settings.general.appearance.codeFontSize.row",
          defaultMessage: "Code font size",
        })}
        description={formatMessage({
          id: "settings.general.appearance.codeFontSize.row.description",
          defaultMessage: "Adjust the base size used for code across chats and diffs",
        })}
      >
        <FontSizeInput
          value={uiAppearance.codeFontSize}
          min={CODE_FONT_SIZE_MIN}
          max={CODE_FONT_SIZE_MAX}
          step={CODE_FONT_SIZE_STEP}
          clamp={clampCodeFontSize}
          ariaLabel={formatMessage({ id: "settings.general.appearance.codeFontSize.row", defaultMessage: "Code font size" })}
          unitLabel={formatMessage({ id: "settings.general.appearance.codeFontSize.units", defaultMessage: "px" })}
          onCommit={onSetCodeFontSize}
        />
      </AppearanceRow>
      {/*
        * CODEX-REF: appearance-settings-*.js §8 — Reduce motion.
        * 3-way segmented toggle: System / On / Off (Codex i18n ids
        * settings.general.appearance.reducedMotion.{system,on,off}). Description
        * is the static settings.general.appearance.reducedMotion.description
        * (Codex shows one fixed sentence, not a mode-dependent prose).
        */}
      <AppearanceRow
        title={formatMessage({
          id: "settings.general.appearance.reducedMotion.label",
          defaultMessage: "Reduce motion",
        })}
        description={formatMessage({
          id: "settings.general.appearance.reducedMotion.description",
          defaultMessage: "Reduce animations or match your system",
        })}
      >
        <SegmentedToggle
          options={REDUCED_MOTION_MODES.map((mode) => ({
            value: mode,
            label: reducedMotionLabel(mode),
            ariaLabel: reducedMotionLabel(mode),
          }))}
          value={uiAppearance.reducedMotion}
          onChange={(value) => onSetReducedMotion(value as ReducedMotionMode)}
          ariaLabel={formatMessage({ id: "settings.general.appearance.reducedMotion.label", defaultMessage: "Reduce motion" })}
        />
      </AppearanceRow>
    </div>
  );
}

// Native language labels for the segmented toggle (English / 简体中文), the way
// Codex's picker shows native names. localeLabel() in state/i18n gives English
// names ("Chinese (Simplified)") which read oddly inside the toggle.
function localeNativeLabel(locale: ForgeLocale): string {
  return locale === "zh-CN" ? "简体中文" : "English";
}

function AppearanceRow({
  title,
  description,
  children,
}: {
  title: string;
  description: string;
  children: React.ReactNode;
}) {
  return (
    <div className="hc-appearance-row">
      <div className="hc-appearance-row-label">
        <div className="hc-appearance-row-title">{title}</div>
        <div className="hc-appearance-row-desc">{description}</div>
      </div>
      <div className="hc-appearance-row-control">{children}</div>
    </div>
  );
}

function SegmentedToggle({
  options,
  value,
  onChange,
  ariaLabel,
}: {
  // CODEX-REF: general-settings-*.js segmented options carry a per-option
  // ariaLabel (`{id,label,ariaLabel}`); thread it through to each radio so the
  // accessible name matches Codex's localized option label, not just the
  // visible text.
  options: ReadonlyArray<{ value: string; label: string; ariaLabel?: string }>;
  value: string;
  onChange: (next: string) => void;
  ariaLabel: string;
}) {
  return (
    <div className="hc-segmented-toggle" role="radiogroup" aria-label={ariaLabel}>
      {options.map((option) => {
        const selected = option.value === value;
        return (
          <button
            key={option.value}
            type="button"
            role="radio"
            aria-checked={selected}
            aria-label={option.ariaLabel ?? option.label}
            className="hc-segmented-toggle-option"
            data-selected={selected}
            onClick={() => {
              if (!selected) onChange(option.value);
            }}
          >
            {option.label}
          </button>
        );
      })}
    </div>
  );
}

/*
 * CODEX-REF: appearance-settings-*.js §4 number-input control (shared by the
 * "UI font size" and "Code font size" rows).
 *
 *   <input type="number" min max step>
 *   onBlur  → parse → NaN ? revert : commit
 *   onKeyDown Enter → blur
 *
 * Forge re-implements verbatim. The input is *controlled* with a local
 * draft string so transient invalid intermediates (e.g. user is mid-typing
 * "1" before "12") don't trigger an onCommit. The commit happens on blur or
 * Enter; cancel via Escape reverts the draft to the current persisted value.
 */
function FontSizeInput({
  value,
  min,
  max,
  step,
  clamp,
  ariaLabel,
  unitLabel,
  onCommit,
}: {
  value: number;
  min: number;
  max: number;
  step: number;
  clamp: (value: number) => number;
  ariaLabel: string;
  unitLabel: string;
  onCommit: (next: number) => void;
}) {
  const [draft, setDraft] = useState<string>(String(value));
  const valueRef = useRef(value);
  // Escape sets this so the synchronous blur() it triggers reverts instead of
  // committing — without it, onBlur→tryCommit reads the (still-typed) draft from
  // its closure and commits the clamped value, defeating "cancel via Escape".
  const cancelRef = useRef(false);
  useEffect(() => {
    valueRef.current = value;
    setDraft(String(value));
  }, [value]);

  const tryCommit = (): void => {
    if (cancelRef.current) {
      cancelRef.current = false;
      setDraft(String(valueRef.current));
      return;
    }
    const parsed = Number.parseFloat(draft);
    if (!Number.isFinite(parsed)) {
      setDraft(String(valueRef.current));
      return;
    }
    const next = clamp(parsed);
    if (next !== valueRef.current) {
      onCommit(next);
    } else {
      setDraft(String(valueRef.current));
    }
  };

  return (
    <div className="hc-appearance-number-input">
      <input
        type="number"
        min={min}
        max={max}
        step={step}
        inputMode="numeric"
        aria-label={ariaLabel}
        value={draft}
        onChange={(event) => setDraft(event.target.value)}
        onBlur={tryCommit}
        onKeyDown={(event) => {
          if (event.key === "Enter") {
            event.preventDefault();
            event.currentTarget.blur();
          } else if (event.key === "Escape") {
            event.preventDefault();
            event.stopPropagation();
            cancelRef.current = true;
            setDraft(String(valueRef.current));
            event.currentTarget.blur();
          }
        }}
      />
      <span className="hc-appearance-number-input-unit">{unitLabel}</span>
    </div>
  );
}

// Exported only so the existing settings-panel-workflow.ts default snapshot
// has a stable reference; not used by this component directly.
export { CODE_FONT_SIZE_DEFAULT };
