import { CommandPanel, type CommandPanelProps } from "./command-panel";
import { SettingsPanel, type SettingsPanelProps } from "./model-settings-panel";
import type { CommandPanelState } from "../state/command-panel";
import { isChatSearchPanel, isCommandMenuPanel } from "../state/command-panel";
import type { SettingsPanelId } from "../state/composer-workflow";

/*
 * SettingsPanel + CommandPanel overlays extracted from ForgeApp's return.
 * SettingsPanel is rendered when `activeSettingsPanel` is non-null (its
 * `activePanel` prop). CommandPanel renders on `commandPanel`. The search-
 * handler selection (files vs command-menu vs none) is computed here to keep
 * the three-way conditional out of the body's JSX.
 */

type PanelOverlaysProps = {
  activeSettingsPanel: SettingsPanelId | null;
  commandPanel: CommandPanelState | null;
  onCommandPanelClose: () => void;
  onCommandPanelSelectAction?: CommandPanelProps["onSelectAction"];
  onCommandPanelSelectEntry?: CommandPanelProps["onSelectEntry"];
  onSearchChats: (query: string) => void;
  onSearchFiles: (query: string) => void;
  onSearchCommandMenu: (query: string) => void;
} & Omit<SettingsPanelProps, "activePanel">;

export function PanelOverlays({
  activeSettingsPanel,
  commandPanel,
  onCommandPanelClose,
  onCommandPanelSelectAction,
  onCommandPanelSelectEntry,
  onSearchChats,
  onSearchFiles,
  onSearchCommandMenu,
  ...settingsProps
}: PanelOverlaysProps) {
  const searchQueryChange: CommandPanelProps["onSearchQueryChange"] = commandPanel
    ? commandPanel.panel === "files"
      ? onSearchFiles
      : isChatSearchPanel(commandPanel)
        ? onSearchChats
      : isCommandMenuPanel(commandPanel)
        ? onSearchCommandMenu
        : undefined
    : undefined;

  return (
    <>
      {activeSettingsPanel && (
        <SettingsPanel activePanel={activeSettingsPanel} {...settingsProps} />
      )}
      {commandPanel && (
        <CommandPanel
          panel={commandPanel}
          onClose={onCommandPanelClose}
          onSelectAction={onCommandPanelSelectAction}
          onSelectEntry={onCommandPanelSelectEntry}
          onSearchQueryChange={searchQueryChange}
        />
      )}
    </>
  );
}
