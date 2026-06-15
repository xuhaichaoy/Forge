import {
  Loader2,
  RefreshCw,
  Settings,
  X,
} from "lucide-react";
import type { ModelConfig } from "@forge/codex-protocol";
import type { SettingsPanelId } from "../state/composer-workflow";
import type { CommandPanelEntry, CommandPanelEntryAction, CommandPanelState } from "../state/command-panel";
import type { ImageGenerationSettings } from "../state/image-generation-tool";
import {
  SETTINGS_SECTIONS,
  SETTINGS_SECTION_GROUP_HEADINGS,
  isDesktopBackedLocalSettingsPanel,
  isPluginBackedDesktopSettingsPanel,
  isRefreshableSettingsPanel,
  settingsGroupHeadingTitle,
  settingsSectionTitle,
  settingsSectionDescription,
  type SettingsSectionGroup,
} from "../state/settings-panel-workflow";
import { AppearanceSettingsPanel } from "./appearance-settings-panel";
import { useForgeIntl } from "./i18n-provider";
import { KeyboardShortcutsSettingsPanel } from "./keyboard-shortcuts-settings-panel";
import { McpSkillsManagementPanel } from "./mcp-skills-management-panel";
import {
  ImageGenerationSettingsForm,
  ModelSettingsForm,
  SettingsCommandContent,
} from "./model-settings-forms";
import {
  DesktopBackedSettingsContent,
  PluginBackedDesktopSettingsContent,
} from "./settings-route-content";
import { settingsSectionIcon } from "./settings-section-icon";
import type { KeymapOverrides } from "../state/keymap-overrides";
import type { ReducedMotionMode, UiAppearancePreferences } from "../state/appearance";
import type { UiThemeMode, UiThemeSnapshot } from "../state/theme";
import type { ForgeLocale } from "../state/i18n";
import { useEffect, useRef } from "react";

export interface SettingsPanelProps {
  activePanel: SettingsPanelId;
  modelDraft: ModelConfig;
  setModelDraft: (model: ModelConfig) => void;
  imageGenerationDraft: ImageGenerationSettings;
  setImageGenerationDraft: (settings: ImageGenerationSettings) => void;
  models: ModelConfig[];
  panelState: CommandPanelState | null;
  onClose: () => void;
  onSaveModel: () => void;
  onSaveImageGeneration: () => void;
  onRefreshPanel: () => void;
  onSelectPanel: (panel: SettingsPanelId) => void;
  onSelectEntry?: (entry: CommandPanelEntry) => void;
  onSelectAction?: (action: CommandPanelEntryAction, entry: CommandPanelEntry) => void;
  /*
   * CODEX-REF: keyboard-shortcuts-settings-*.js — inline keyboard
   * shortcuts editor needs direct setter/state access (vs going through the
   * action dispatch pipeline) so capture latency stays sub-16ms.
   */
  keymapOverrides?: KeymapOverrides;
  onSetKeyboardShortcut?: (commandId: string, accelerator: string | null) => void;
  onResetKeyboardShortcut?: (commandId: string) => void;
  /*
   * CODEX-REF: appearance-settings-*.js — inline appearance editor.
   * Same rationale as keyboard-shortcuts: Codex renders a column of bespoke
   * controls (segmented toggle + number input + segmented toggle) that
   * doesn't map onto a flat CommandPanelEntry list.
   */
  uiTheme?: UiThemeSnapshot;
  uiAppearance?: UiAppearancePreferences;
  uiLocale?: ForgeLocale;
  onSetUiTheme?: (mode: UiThemeMode) => void;
  onSetUiFontSize?: (size: number) => void;
  onSetCodeFontSize?: (size: number) => void;
  onSetReducedMotion?: (mode: ReducedMotionMode) => void;
  onSetUiLocale?: (locale: ForgeLocale) => void;
}

export function SettingsPanel({
  activePanel,
  modelDraft,
  setModelDraft,
  imageGenerationDraft,
  setImageGenerationDraft,
  models,
  panelState,
  onClose,
  onSaveModel,
  onSaveImageGeneration,
  onRefreshPanel,
  onSelectPanel,
  onSelectEntry,
  onSelectAction,
  keymapOverrides,
  onSetKeyboardShortcut,
  onResetKeyboardShortcut,
  uiTheme,
  uiAppearance,
  uiLocale,
  onSetUiTheme,
  onSetUiFontSize,
  onSetCodeFontSize,
  onSetReducedMotion,
  onSetUiLocale,
}: SettingsPanelProps) {
  const { formatMessage } = useForgeIntl();
  const activeSection = SETTINGS_SECTIONS.find((section) => section.id === activePanel) ?? SETTINGS_SECTIONS[0];
  const refreshable = isRefreshableSettingsPanel(activePanel);
  // Focus the dialog on open (Radix focuses dialog content on mount) so Escape
  // closes it immediately, not only after the user clicks into the panel.
  const dialogRef = useRef<HTMLElement>(null);
  useEffect(() => {
    dialogRef.current?.focus();
  }, []);
  return (
    <div className="hc-settings-backdrop" role="presentation" onMouseDown={onClose}>
      <section
        ref={dialogRef}
        tabIndex={-1}
        className="hc-settings-panel hc-settings-center"
        role="dialog"
        data-state="open"
        aria-modal="true"
        aria-label="Settings"
        onKeyDown={(event) => {
          // codex: the Settings page is a Radix modal → Escape closes it. Fields
          // that own Escape (e.g. the code-font-size input revert) stopPropagation
          // so they don't also close the panel.
          if (event.key === "Escape") {
            event.stopPropagation();
            onClose();
          }
        }}
        onMouseDown={(event) => event.stopPropagation()}
      >
        <header>
          <div><Settings size={17} /> {formatMessage({ id: "hc.settings.title", defaultMessage: "Settings" })}</div>
          <button className="hc-icon-button" type="button" onClick={onClose} aria-label={formatMessage({ id: "hc.settings.close", defaultMessage: "Close settings" })}>
            <X size={16} />
          </button>
        </header>

        <div className="hc-settings-shell">
          {/*
           * CODEX-REF: Grouped nav mirrors Codex Desktop's settings-page
           * group renderer (settings-page-*.js):
           * `_e.map(e => <Group heading={e.heading}>{e.slugs.map(...)}</Group>)`.
           * Codex emits one `<L>` wrapper per group with the heading rendered
           * by `<a {...e.heading}/>` only when present — groups whose
           * SETTINGS_SECTION_GROUP_HEADINGS entry is empty render no heading.
           */}
          <nav className="hc-settings-nav" aria-label={formatMessage({ id: "settings.nav.ariaLabel", defaultMessage: "Settings" })}>
            {(["personal", "integrations", "coding", "archived"] as const).map((group: SettingsSectionGroup) => {
              const heading = SETTINGS_SECTION_GROUP_HEADINGS[group];
              const sections = SETTINGS_SECTIONS.filter((section) => section.group === group);
              if (sections.length === 0) return null;
              return (
                <div className="hc-settings-nav-group" data-group={group} key={group}>
                  {heading ? <div className="hc-settings-nav-group-heading">{settingsGroupHeadingTitle(group, heading, formatMessage)}</div> : null}
                  {sections.map((section) => (
                    <button
                      aria-current={section.id === activePanel ? "page" : undefined}
                      className="hc-settings-nav-item"
                      key={section.id}
                      type="button"
                      onClick={() => onSelectPanel(section.id)}
                    >
                      {settingsSectionIcon(section.icon)}
                      <span>
                        {/*
                         * codex settings-page-*.js nav items are icon + title only —
                         * the nav renderer (`ye`/`ve(slug)`) resolves just the title;
                         * per-section subtitles live in-page, not in the nav. So the
                         * nav item shows no subtitle (the active-section page below
                         * still renders the in-page description).
                         */}
                        <strong>{settingsSectionTitle(section, formatMessage)}</strong>
                      </span>
                    </button>
                  ))}
                </div>
              );
            })}
          </nav>

          <div className="hc-settings-content">
            <div className="hc-settings-content-header">
              <div>
                {settingsSectionIcon(activeSection.icon)}
                <span>
                  <strong>{settingsSectionTitle(activeSection, formatMessage)}</strong>
                  {activeSection.description ? <small>{settingsSectionDescription(activeSection, formatMessage)}</small> : null}
                </span>
              </div>
              {refreshable && (
                <button
                  className="hc-command-secondary-action"
                  type="button"
                  onClick={onRefreshPanel}
                  disabled={panelState?.status === "loading"}
                >
                  {panelState?.status === "loading" ? <Loader2 className="hc-spin" size={13} /> : <RefreshCw size={13} />}
                  <span>{formatMessage({ id: "settings.worktrees.refresh", defaultMessage: "Refresh" })}</span>
                </button>
              )}
            </div>

            {activePanel === "models" ? (
              <ModelSettingsForm
                modelDraft={modelDraft}
                models={models}
                setModelDraft={setModelDraft}
                onSave={onSaveModel}
              />
            ) : activePanel === "images" ? (
              <ImageGenerationSettingsForm
                imageGenerationDraft={imageGenerationDraft}
                panelState={panelState}
                setImageGenerationDraft={setImageGenerationDraft}
                onSave={onSaveImageGeneration}
              />
            ) : activePanel === "mcp" || activePanel === "skills" || activePanel === "plugins" ? (
              <McpSkillsManagementPanel
                kind={activePanel}
                panelState={panelState}
                onReload={onRefreshPanel}
                onSelectAction={onSelectAction}
                onSelectEntry={onSelectEntry}
              />
            ) : activePanel === "appearance" ? (
              /*
               * CODEX-REF: appearance-settings-*.js — bespoke inline
               * appearance editor. Replaces the prior CommandPanelEntry-based
               * implementation so the number input (Code font size, §4) and
               * segmented toggles (Theme §1, Reduce motion §8) can render
               * faithfully.
               */
              <AppearanceSettingsPanel
                uiTheme={uiTheme ?? { mode: "system", resolved: "light" }}
                uiAppearance={uiAppearance ?? { uiFontSize: 14, codeFontSize: 12, reducedMotion: "system" }}
                uiLocale={uiLocale ?? "en-US"}
                onSetUiTheme={onSetUiTheme ?? (() => undefined)}
                onSetUiFontSize={onSetUiFontSize ?? (() => undefined)}
                onSetCodeFontSize={onSetCodeFontSize ?? (() => undefined)}
                onSetReducedMotion={onSetReducedMotion ?? (() => undefined)}
                onSetUiLocale={onSetUiLocale ?? (() => undefined)}
              />
            ) : activePanel === "keyboard-shortcuts" ? (
              /*
               * CODEX-REF: keyboard-shortcuts-settings-*.js — bespoke
               * inline editor. Bypasses the SettingsCommandContent /
               * CommandPanelEntryList pipeline because Codex's row layout is
               * a 3-column table with capture-mode column swap, which
               * doesn't map onto a flat CommandPanelEntry list.
               */
              <KeyboardShortcutsSettingsPanel
                keymapOverrides={keymapOverrides ?? {}}
                onSetShortcut={onSetKeyboardShortcut ?? (() => undefined)}
                onResetShortcut={onResetKeyboardShortcut ?? (() => undefined)}
              />
            ) : isPluginBackedDesktopSettingsPanel(activePanel) ? (
              <PluginBackedDesktopSettingsContent
                panel={activePanel}
                panelState={panelState}
                section={activeSection}
                onSelectAction={onSelectAction}
                onSelectEntry={onSelectEntry}
              />
            ) : isDesktopBackedLocalSettingsPanel(activePanel) ? (
              <DesktopBackedSettingsContent
                panelState={panelState}
                section={activeSection}
              />
            ) : (
              <SettingsCommandContent
                panelState={panelState}
                onSelectAction={onSelectAction}
                onSelectEntry={onSelectEntry}
              />
            )}
          </div>
        </div>
      </section>
    </div>
  );
}

export { SETTINGS_SECTIONS, isRefreshableSettingsPanel };
