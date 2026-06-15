import { useCallback, type Dispatch, type SetStateAction } from "react";
import { useServices } from "../components/services-context";
import type {
  CommandPanelEntry,
  CommandPanelEntryAction,
  CommandPanelState,
} from "../state/command-panel";
import type { ComposerAttachment, SettingsPanelId } from "../state/composer-workflow";
import type { ForgeLocale } from "../state/i18n";
import type { NotificationPreferences } from "../state/notification-preferences";
import type { PluginBackedDesktopSettingsPanel } from "../state/settings-panel-workflow";
import type { UiThemeMode } from "../state/theme";
import type { ReducedMotionMode } from "../state/appearance";
import {
  connectRequiredAppFromPanelFlow,
  openExternalUrlFromPanelFlow,
  writeAppConfigFromPanelFlow,
} from "./use-command-panel-actions-apps";
import {
  setThreadMemoryModeFromPanelFlow,
  writeConfigFromPanelFlow,
} from "./use-command-panel-actions-config";
import { runCommandPanelAction } from "./use-command-panel-actions-dispatch";
import {
  callMcpToolFromPanelFlow,
  loginMcpServerFromPanelFlow,
  readMcpResourceFromPanelFlow,
  refreshMcpServersPanelFlow,
  reloadMcpServersFromPanelFlow,
  removeMcpServerFromPanelFlow,
  writeMcpServerConfigFromPanelFlow,
} from "./use-command-panel-actions-mcp";
import {
  checkoutPluginShareFromPanelFlow,
  installPluginFromPanelFlow,
  refreshPluginsPanelFlow,
  uninstallPluginFromPanelFlow,
  writePluginConfigFromPanelFlow,
} from "./use-command-panel-actions-plugins";
import {
  openBrowserRuntimeFromPanelFlow,
  openComputerUseSetupFromPanelFlow,
  probeComputerUseMcpFromPanelFlow,
  repairComputerUseBundleFromPanelFlow,
} from "./use-command-panel-actions-runtime";
import {
  createStarterSkillFromPanelFlow,
  readPluginSkillFromPanelFlow,
  readSkillFileFromPanelFlow,
  writeSkillConfigFromPanelFlow,
} from "./use-command-panel-actions-skills";
import type {
  CommandPanelSink,
  McpServerFormAction,
  McpToolFormAction,
} from "./use-command-panel-actions-types";

// Action flows live in use-command-panel-actions-<domain>.ts as plain async
// functions; this hook owns every React hook call (useCallback wrappers with
// the original dependency arrays) and keeps its public signature unchanged.
export type {
  CommandPanelSink,
  McpServerFormAction,
  McpToolFormAction,
} from "./use-command-panel-actions-types";

export function useCommandPanelActions({
  activeThreadId,
  activeTurnId,
  ensureConnected,
  openCommandPanel,
  setActiveSettingsPanel,
  setCommandPanel,
  setComposerAttachments,
  setInput,
  setMcpServerForm,
  setMcpToolForm,
  setUiLocale,
  setUiThemeMode,
  setUiCodeFontSize,
  setUiReducedMotion,
  setUiKeyboardShortcut,
  resetUiKeyboardShortcut,
  notificationPreferences,
  setNotificationPreferences,
  runSlashCommand,
  openFileSearchPanel,
  setThreadPinnedById,
  selectThreadById,
  workspace,
}: {
  activeThreadId: string | null;
  activeTurnId: string | null;
  ensureConnected: () => Promise<boolean>;
  openCommandPanel: CommandPanelSink;
  setActiveSettingsPanel: Dispatch<SetStateAction<SettingsPanelId | null>>;
  setCommandPanel: Dispatch<SetStateAction<CommandPanelState | null>>;
  setComposerAttachments: Dispatch<SetStateAction<ComposerAttachment[]>>;
  setInput: Dispatch<SetStateAction<string>>;
  setMcpServerForm: Dispatch<SetStateAction<McpServerFormAction | null>>;
  setMcpToolForm: Dispatch<SetStateAction<McpToolFormAction | null>>;
  setUiLocale?: (locale: ForgeLocale) => void;
  setUiThemeMode?: (mode: UiThemeMode) => void;
  /*
   * CODEX-REF: settings.general.appearance.codeFontSize.row mutation. Wires
   * the +/- secondaryAction buttons to the ForgeApp-owned setter.
   */
  setUiCodeFontSize?: (size: number) => void;
  /*
   * CODEX-REF: settings.general.appearance.reducedMotion.label mutation.
   * 3-way toggle System/On/Off.
   */
  setUiReducedMotion?: (mode: ReducedMotionMode) => void;
  /*
   * CODEX-REF: keyboard-shortcuts-settings-*.js
   * `set-codex-command-keybinding` (type=set/replace + type=remove via null).
   */
  setUiKeyboardShortcut?: (commandId: string, accelerator: string | null) => void;
  /*
   * CODEX-REF: same chunk, `set-codex-command-keybinding` type=reset.
   * Drops the override so the descriptor default takes effect again.
   */
  resetUiKeyboardShortcut?: (commandId: string) => void;
  notificationPreferences?: NotificationPreferences;
  setNotificationPreferences?: (patch: Partial<NotificationPreferences>) => NotificationPreferences;
  runSlashCommand?: (commandId: string) => void;
  openFileSearchPanel?: () => void;
  setThreadPinnedById?: (threadId: string, pinned: boolean) => void;
  selectThreadById?: (threadId: string) => void | Promise<void>;
  workspace: string;
}) {
  const { client, dispatch } = useServices();

  const callMcpToolFromPanel = useCallback(async (
    action: Extract<NonNullable<CommandPanelEntry["action"]>, { type: "callMcpTool" }>,
    sink: CommandPanelSink = openCommandPanel,
  ) => callMcpToolFromPanelFlow(
    { activeThreadId, client, dispatch, ensureConnected },
    action,
    sink,
  ), [activeThreadId, client, dispatch, ensureConnected, openCommandPanel]);

  const reloadMcpServersFromPanel = useCallback(async (
    action: Extract<NonNullable<CommandPanelEntry["action"]>, { type: "reloadMcpServers" }>,
    sink: CommandPanelSink = openCommandPanel,
  ) => reloadMcpServersFromPanelFlow(
    { client, ensureConnected, workspace },
    action,
    sink,
  ), [client, ensureConnected, openCommandPanel, workspace]);

  const loginMcpServerFromPanel = useCallback(async (
    action: Extract<NonNullable<CommandPanelEntry["action"]>, { type: "loginMcpServer" }>,
    sink: CommandPanelSink = openCommandPanel,
  ) => loginMcpServerFromPanelFlow(
    { client, ensureConnected, workspace },
    action,
    sink,
  ), [client, ensureConnected, openCommandPanel, workspace]);

  const readMcpResourceFromPanel = useCallback(async (
    action: Extract<NonNullable<CommandPanelEntry["action"]>, { type: "readMcpResource" }>,
    sink: CommandPanelSink = openCommandPanel,
  ) => readMcpResourceFromPanelFlow(
    { activeThreadId, client, ensureConnected },
    action,
    sink,
  ), [activeThreadId, client, ensureConnected, openCommandPanel]);

  const writeConfigFromPanel = useCallback(async (
    action: Extract<NonNullable<CommandPanelEntry["action"]>, { type: "writeConfig" }>,
    sink: CommandPanelSink = openCommandPanel,
  ) => writeConfigFromPanelFlow(
    { activeThreadId, activeTurnId, client, dispatch, ensureConnected, workspace },
    action,
    sink,
  ), [activeThreadId, activeTurnId, client, dispatch, ensureConnected, openCommandPanel, workspace]);

  const writeSkillConfigFromPanel = useCallback(async (
    action: Extract<NonNullable<CommandPanelEntry["action"]>, { type: "writeSkillConfig" }>,
    sink: CommandPanelSink = openCommandPanel,
  ) => writeSkillConfigFromPanelFlow(
    { client, dispatch, ensureConnected, workspace },
    action,
    sink,
  ), [client, dispatch, ensureConnected, openCommandPanel, workspace]);

  const readSkillFileFromPanel = useCallback(async (
    action: Extract<NonNullable<CommandPanelEntry["action"]>, { type: "readSkillFile" }>,
    sink: CommandPanelSink = openCommandPanel,
  ) => readSkillFileFromPanelFlow(
    { client, dispatch, ensureConnected },
    action,
    sink,
  ), [client, dispatch, ensureConnected, openCommandPanel]);

  const createStarterSkillFromPanel = useCallback(async (
    action: Extract<NonNullable<CommandPanelEntry["action"]>, { type: "createStarterSkill" }>,
    sink: CommandPanelSink = openCommandPanel,
  ) => createStarterSkillFromPanelFlow(
    { client, dispatch, ensureConnected, workspace },
    action,
    sink,
  ), [client, dispatch, ensureConnected, openCommandPanel, workspace]);

  const readPluginSkillFromPanel = useCallback(async (
    action: Extract<NonNullable<CommandPanelEntry["action"]>, { type: "readPluginSkill" }>,
    sink: CommandPanelSink = openCommandPanel,
  ) => readPluginSkillFromPanelFlow(
    { client, ensureConnected },
    action,
    sink,
  ), [client, ensureConnected, openCommandPanel]);

  const refreshMcpServersPanel = useCallback(async (
    message: string,
    sink: CommandPanelSink = openCommandPanel,
  ) => refreshMcpServersPanelFlow(
    { client, workspace },
    message,
    sink,
  ), [client, openCommandPanel, workspace]);

  const writeMcpServerConfigFromPanel = useCallback(async (
    action: Extract<NonNullable<CommandPanelEntry["action"]>, { type: "writeMcpServerConfig" }>,
    sink: CommandPanelSink = openCommandPanel,
  ) => writeMcpServerConfigFromPanelFlow(
    { client, ensureConnected, refreshMcpServersPanel, workspace },
    action,
    sink,
  ), [client, ensureConnected, openCommandPanel, refreshMcpServersPanel, workspace]);

  const removeMcpServerFromPanel = useCallback(async (
    action: Extract<NonNullable<CommandPanelEntry["action"]>, { type: "removeMcpServer" }>,
    sink: CommandPanelSink = openCommandPanel,
  ) => removeMcpServerFromPanelFlow(
    { client, ensureConnected, refreshMcpServersPanel, workspace },
    action,
    sink,
  ), [client, ensureConnected, openCommandPanel, refreshMcpServersPanel, workspace]);

  const writeAppConfigFromPanel = useCallback(async (
    action: Extract<NonNullable<CommandPanelEntry["action"]>, { type: "writeAppConfig" }>,
    sink: CommandPanelSink = openCommandPanel,
  ) => writeAppConfigFromPanelFlow(
    { activeThreadId, client, ensureConnected, workspace },
    action,
    sink,
  ), [activeThreadId, client, ensureConnected, openCommandPanel, workspace]);

  const connectRequiredAppFromPanel = useCallback(async (
    action: Extract<NonNullable<CommandPanelEntry["action"]>, { type: "connectRequiredApp" }>,
    sink: CommandPanelSink = openCommandPanel,
  ) => connectRequiredAppFromPanelFlow(
    { dispatch, setCommandPanel },
    action,
    sink,
  ), [dispatch, openCommandPanel, setCommandPanel]);

  const openExternalUrlFromPanel = useCallback(async (
    action: Extract<NonNullable<CommandPanelEntry["action"]>, { type: "openExternalUrl" }>,
    sink: CommandPanelSink = openCommandPanel,
  ) => openExternalUrlFromPanelFlow(
    { dispatch },
    action,
    sink,
  ), [dispatch, openCommandPanel]);

  const openComputerUseSetupFromPanel = useCallback(async (
    action: Extract<NonNullable<CommandPanelEntry["action"]>, { type: "openComputerUseSetup" }>,
    sink: CommandPanelSink = openCommandPanel,
  ) => openComputerUseSetupFromPanelFlow(
    { dispatch },
    action,
    sink,
  ), [dispatch, openCommandPanel]);

  const repairComputerUseBundleFromPanel = useCallback(async (
    action: Extract<NonNullable<CommandPanelEntry["action"]>, { type: "repairComputerUseBundle" }>,
    sink: CommandPanelSink = openCommandPanel,
  ) => repairComputerUseBundleFromPanelFlow(
    { dispatch },
    action,
    sink,
  ), [dispatch, openCommandPanel]);

  const probeComputerUseMcpFromPanel = useCallback(async (
    action: Extract<NonNullable<CommandPanelEntry["action"]>, { type: "probeComputerUseMcp" }>,
    sink: CommandPanelSink = openCommandPanel,
  ) => probeComputerUseMcpFromPanelFlow(
    { client, dispatch, ensureConnected },
    action,
    sink,
  ), [client, dispatch, ensureConnected, openCommandPanel]);

  const refreshPluginsPanel = useCallback(async (
    message: string,
    sink: CommandPanelSink = openCommandPanel,
    sourceSettingsPanel?: PluginBackedDesktopSettingsPanel,
  ) => refreshPluginsPanelFlow(
    { activeThreadId, client, workspace },
    message,
    sink,
    sourceSettingsPanel,
  ), [activeThreadId, client, openCommandPanel, workspace]);

  const openBrowserRuntimeFromPanel = useCallback(async (
    action: Extract<NonNullable<CommandPanelEntry["action"]>, { type: "openBrowserRuntime" }>,
    sink: CommandPanelSink = openCommandPanel,
  ) => openBrowserRuntimeFromPanelFlow(
    { dispatch, ensureConnected, refreshPluginsPanel },
    action,
    sink,
  ), [dispatch, ensureConnected, openCommandPanel, refreshPluginsPanel]);

  const installPluginFromPanel = useCallback(async (
    action: Extract<NonNullable<CommandPanelEntry["action"]>, { type: "installPlugin" }>,
    sink: CommandPanelSink = openCommandPanel,
  ) => installPluginFromPanelFlow(
    { client, dispatch, ensureConnected, refreshPluginsPanel, setActiveSettingsPanel, workspace },
    action,
    sink,
  ), [client, dispatch, ensureConnected, openCommandPanel, refreshPluginsPanel, setActiveSettingsPanel, workspace]);

  const checkoutPluginShareFromPanel = useCallback(async (
    action: Extract<NonNullable<CommandPanelEntry["action"]>, { type: "checkoutPluginShare" }>,
    sink: CommandPanelSink = openCommandPanel,
  ) => checkoutPluginShareFromPanelFlow(
    { client, dispatch, ensureConnected, refreshPluginsPanel, workspace },
    action,
    sink,
  ), [client, dispatch, ensureConnected, openCommandPanel, refreshPluginsPanel, workspace]);

  const uninstallPluginFromPanel = useCallback(async (
    action: Extract<NonNullable<CommandPanelEntry["action"]>, { type: "uninstallPlugin" }>,
    sink: CommandPanelSink = openCommandPanel,
  ) => uninstallPluginFromPanelFlow(
    { client, dispatch, ensureConnected, refreshPluginsPanel, workspace },
    action,
    sink,
  ), [client, dispatch, ensureConnected, openCommandPanel, refreshPluginsPanel, workspace]);

  const writePluginConfigFromPanel = useCallback(async (
    action: Extract<NonNullable<CommandPanelEntry["action"]>, { type: "writePluginConfig" }>,
    sink: CommandPanelSink = openCommandPanel,
  ) => writePluginConfigFromPanelFlow(
    { client, dispatch, ensureConnected, refreshPluginsPanel, workspace },
    action,
    sink,
  ), [client, dispatch, ensureConnected, openCommandPanel, refreshPluginsPanel, workspace]);

  const setThreadMemoryModeFromPanel = useCallback(async (
    action: Extract<NonNullable<CommandPanelEntry["action"]>, { type: "setThreadMemoryMode" }>,
    sink: CommandPanelSink = openCommandPanel,
  ) => setThreadMemoryModeFromPanelFlow(
    { client, ensureConnected },
    action,
    sink,
  ), [client, ensureConnected, openCommandPanel]);

  const selectCommandPanelAction = useCallback((
    action: CommandPanelEntryAction,
    sink: CommandPanelSink = openCommandPanel,
  ) => runCommandPanelAction({
    callMcpToolFromPanel,
    checkoutPluginShareFromPanel,
    connectRequiredAppFromPanel,
    createStarterSkillFromPanel,
    dispatch,
    installPluginFromPanel,
    loginMcpServerFromPanel,
    openBrowserRuntimeFromPanel,
    openComputerUseSetupFromPanel,
    openExternalUrlFromPanel,
    probeComputerUseMcpFromPanel,
    repairComputerUseBundleFromPanel,
    readMcpResourceFromPanel,
    readPluginSkillFromPanel,
    readSkillFileFromPanel,
    reloadMcpServersFromPanel,
    removeMcpServerFromPanel,
    setActiveSettingsPanel,
    setCommandPanel,
    setComposerAttachments,
    setInput,
    setThreadMemoryModeFromPanel,
    setMcpServerForm,
    setMcpToolForm,
    setUiLocale,
    setUiThemeMode,
    setUiCodeFontSize,
    setUiReducedMotion,
    setUiKeyboardShortcut,
    resetUiKeyboardShortcut,
    notificationPreferences,
    setNotificationPreferences,
    runSlashCommand,
    openFileSearchPanel,
    setThreadPinnedById,
    selectThreadById,
    uninstallPluginFromPanel,
    writeAppConfigFromPanel,
    writeConfigFromPanel,
    writeMcpServerConfigFromPanel,
    writePluginConfigFromPanel,
    writeSkillConfigFromPanel,
  }, action, sink), [
    callMcpToolFromPanel,
    checkoutPluginShareFromPanel,
    connectRequiredAppFromPanel,
    createStarterSkillFromPanel,
    dispatch,
    installPluginFromPanel,
    loginMcpServerFromPanel,
    openCommandPanel,
    openBrowserRuntimeFromPanel,
    openComputerUseSetupFromPanel,
    openExternalUrlFromPanel,
    probeComputerUseMcpFromPanel,
    repairComputerUseBundleFromPanel,
    readMcpResourceFromPanel,
    readPluginSkillFromPanel,
    readSkillFileFromPanel,
    reloadMcpServersFromPanel,
    removeMcpServerFromPanel,
    setActiveSettingsPanel,
    setCommandPanel,
    setComposerAttachments,
    setInput,
    setThreadMemoryModeFromPanel,
    setMcpServerForm,
    setMcpToolForm,
    setUiLocale,
    setUiThemeMode,
    setUiCodeFontSize,
    setUiReducedMotion,
    setUiKeyboardShortcut,
    resetUiKeyboardShortcut,
    notificationPreferences,
    setNotificationPreferences,
    runSlashCommand,
    openFileSearchPanel,
    setThreadPinnedById,
    selectThreadById,
    uninstallPluginFromPanel,
    writeAppConfigFromPanel,
    writeConfigFromPanel,
    writeMcpServerConfigFromPanel,
    writePluginConfigFromPanel,
    writeSkillConfigFromPanel,
  ]);

  const selectCommandPanelEntry = useCallback((entry: CommandPanelEntry) => {
    if (entry.disabled || !entry.action) return;
    selectCommandPanelAction(entry.action);
  }, [selectCommandPanelAction]);

  return {
    callMcpToolFromPanel,
    selectCommandPanelAction,
    selectCommandPanelEntry,
    writeMcpServerConfigFromPanel,
  };
}
