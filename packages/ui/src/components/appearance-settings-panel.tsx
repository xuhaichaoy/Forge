import { useEffect, useRef, useState } from "react";
import {
  CODE_FONT_SIZE_DEFAULT,
  CODE_FONT_SIZE_MAX,
  CODE_FONT_SIZE_MIN,
  CODE_FONT_SIZE_STEP,
  REDUCED_MOTION_MODES,
  clampCodeFontSize,
  reducedMotionDescription,
  reducedMotionLabel,
  type ReducedMotionMode,
  type UiAppearancePreferences,
} from "../state/appearance";
import {
  UI_THEME_MODES,
  themeModeDescription,
  themeModeLabel,
  type UiThemeMode,
  type UiThemeSnapshot,
} from "../state/theme";

/*
 * CODEX-REF: appearance-settings-BLTO9KX5.js inline editor. Codex Desktop
 * renders the Appearance panel as a column of labelled control rows (not as
 * a CommandPanelEntry list), so HiCodex follows suit. The three controls
 * that currently have HiCodex-side backing are Theme (§1), Code font size
 * (§4), and Reduce motion (§8); the other Codex sections (light/dark color
 * pickers, code theme, diff markers, pointer cursors) are not implemented
 * because HiCodex's base.css is hardcoded hex and there's no token-override
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
  onSetUiTheme: (mode: UiThemeMode) => void;
  onSetCodeFontSize: (size: number) => void;
  onSetReducedMotion: (mode: ReducedMotionMode) => void;
}

export function AppearanceSettingsPanel({
  uiTheme,
  uiAppearance,
  onSetUiTheme,
  onSetCodeFontSize,
  onSetReducedMotion,
}: AppearanceSettingsPanelProps) {
  return (
    <div className="hc-appearance-settings">
      {/*
        * CODEX-REF: appearance-settings-BLTO9KX5.js §1 — Theme row.
        * Codex i18n: settings.general.appearance.theme.{light,dark,system}.
        */}
      <AppearanceRow
        title="Theme"
        description={themeModeDescription(uiTheme.mode, uiTheme.resolved)}
      >
        <SegmentedToggle
          options={UI_THEME_MODES.map((mode) => ({
            value: mode,
            label: themeModeLabel(mode),
          }))}
          value={uiTheme.mode}
          onChange={(value) => onSetUiTheme(value as UiThemeMode)}
          ariaLabel="Theme"
        />
      </AppearanceRow>
      {/*
        * CODEX-REF: appearance-settings-BLTO9KX5.js §4 — Code font size.
        * Codex spec: <input type="number" min={8} max={24} step={1}>, commit
        * onBlur, Enter triggers blur, NaN reverts. HiCodex mirrors verbatim.
        */}
      <AppearanceRow
        title="Code font size"
        description="Adjust the base size used for code across chats and diffs."
      >
        <CodeFontSizeInput
          value={uiAppearance.codeFontSize}
          onCommit={onSetCodeFontSize}
        />
      </AppearanceRow>
      {/*
        * CODEX-REF: appearance-settings-BLTO9KX5.js §8 — Reduce motion.
        * 3-way segmented toggle: System / On / Off (Codex i18n ids
        * settings.general.appearance.reducedMotion.{system,on,off}).
        */}
      <AppearanceRow
        title="Reduce motion"
        description={reducedMotionDescription(uiAppearance.reducedMotion)}
      >
        <SegmentedToggle
          options={REDUCED_MOTION_MODES.map((mode) => ({
            value: mode,
            label: reducedMotionLabel(mode),
          }))}
          value={uiAppearance.reducedMotion}
          onChange={(value) => onSetReducedMotion(value as ReducedMotionMode)}
          ariaLabel="Reduce motion"
        />
      </AppearanceRow>
    </div>
  );
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
  options: ReadonlyArray<{ value: string; label: string }>;
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
 * CODEX-REF: appearance-settings-BLTO9KX5.js §4 number-input control.
 *
 *   <input type="number" min={8} max={24} step={1}>
 *   onBlur  → parse → NaN ? revert : commit
 *   onKeyDown Enter → blur
 *
 * HiCodex re-implements verbatim. The input is *controlled* with a local
 * draft string so transient invalid intermediates (e.g. user is mid-typing
 * "1" before "12") don't trigger an onCommit. The commit happens on blur or
 * Enter; cancel via Escape reverts the draft to the current persisted value.
 */
function CodeFontSizeInput({
  value,
  onCommit,
}: {
  value: number;
  onCommit: (next: number) => void;
}) {
  const [draft, setDraft] = useState<string>(String(value));
  const valueRef = useRef(value);
  useEffect(() => {
    valueRef.current = value;
    setDraft(String(value));
  }, [value]);

  const tryCommit = (): void => {
    const parsed = Number.parseFloat(draft);
    if (!Number.isFinite(parsed)) {
      setDraft(String(valueRef.current));
      return;
    }
    const next = clampCodeFontSize(parsed);
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
        min={CODE_FONT_SIZE_MIN}
        max={CODE_FONT_SIZE_MAX}
        step={CODE_FONT_SIZE_STEP}
        inputMode="numeric"
        aria-label="Code font size"
        value={draft}
        onChange={(event) => setDraft(event.target.value)}
        onBlur={tryCommit}
        onKeyDown={(event) => {
          if (event.key === "Enter") {
            event.preventDefault();
            event.currentTarget.blur();
          } else if (event.key === "Escape") {
            event.preventDefault();
            setDraft(String(valueRef.current));
            event.currentTarget.blur();
          }
        }}
      />
      {/* CODEX-REF: settings.general.appearance.codeFontSize.units defaultMessage "px" */}
      <span className="hc-appearance-number-input-unit">px</span>
    </div>
  );
}

// Exported only so the existing settings-panel-workflow.ts default snapshot
// has a stable reference; not used by this component directly.
export { CODE_FONT_SIZE_DEFAULT };
