import type { CommandPanelEntry, CommandPanelEntryAction, CommandPanelState } from "../state/command-panel";
import {
  SETTINGS_SECTIONS,
  pluginBackedDesktopSettingsInfo,
  settingsSectionTitle,
  type PluginBackedDesktopSettingsPanel,
} from "../state/settings-panel-workflow";
import { useForgeIntl } from "./i18n-provider";
import { SettingsCommandContent } from "./model-settings-forms";
import { settingsSectionIcon } from "./settings-section-icon";

type SettingsSection = (typeof SETTINGS_SECTIONS)[number];

export function PluginBackedDesktopSettingsContent({
  panel,
  panelState,
  section,
  onSelectEntry,
  onSelectAction,
}: {
  panel: PluginBackedDesktopSettingsPanel;
  panelState: CommandPanelState | null;
  section: SettingsSection;
  onSelectEntry?: (entry: CommandPanelEntry) => void;
  onSelectAction?: (action: CommandPanelEntryAction, entry: CommandPanelEntry) => void;
}) {
  const { formatMessage } = useForgeIntl();
  const info = pluginBackedDesktopSettingsInfo(panel);
  return (
    <div className="hc-settings-route-placeholder">
      <div className="hc-settings-route-placeholder-main">
        <div className="hc-settings-route-placeholder-icon" aria-hidden="true">
          {settingsSectionIcon(section.icon)}
        </div>
        <div className="hc-settings-route-placeholder-copy">
          <div>
            <h2>{settingsSectionTitle(section, formatMessage)}</h2>
            <span>Plugin lifecycle</span>
          </div>
          <p>{info.message}</p>
        </div>
      </div>

      <SettingsCommandContent
        panelState={panelState}
        onSelectAction={onSelectAction}
        onSelectEntry={onSelectEntry}
      />

      <details className="hc-settings-route-evidence" open>
        <summary>Native/backend limits</summary>
        <ul>
          {info.limitationDetails.map((detail) => (
            <li key={detail}>{detail}</li>
          ))}
        </ul>
      </details>

      <details className="hc-settings-route-evidence">
        <summary>Desktop source evidence</summary>
        <ul>
          {info.sourceDetails.map((detail) => (
            <li key={detail}>{detail}</li>
          ))}
        </ul>
      </details>
    </div>
  );
}

export function DesktopBackedSettingsContent({
  panelState,
  section,
}: {
  panelState: CommandPanelState | null;
  section: SettingsSection;
}) {
  const { formatMessage } = useForgeIntl();
  const entry = panelState?.entries[0] ?? null;
  const evidence = entry?.details ?? [];
  return (
    <div className="hc-settings-route-placeholder">
      <div className="hc-settings-route-placeholder-main">
        <div className="hc-settings-route-placeholder-icon" aria-hidden="true">
          {settingsSectionIcon(section.icon)}
        </div>
        <div className="hc-settings-route-placeholder-copy">
          <div>
            <h2>{settingsSectionTitle(section, formatMessage)}</h2>
            <span>{entry?.status ?? "Desktop route"}</span>
          </div>
          <p>
            This Codex Desktop settings page is tracked for parity, but its host bridge is not wired in Forge yet.
          </p>
        </div>
      </div>

      <dl className="hc-settings-route-meta">
        <div>
          <dt>Route</dt>
          <dd>{entry?.meta ?? section.id}</dd>
        </div>
      </dl>

      {evidence.length > 0 && (
        <details className="hc-settings-route-evidence">
          <summary>Source evidence</summary>
          <ul>
            {evidence.map((detail) => (
              <li key={detail}>{detail}</li>
            ))}
          </ul>
        </details>
      )}
    </div>
  );
}
