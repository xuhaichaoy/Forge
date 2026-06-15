/*
 * Command panel action dispatcher: the selectCommandPanelAction callback
 * body extracted verbatim. The hook passes its memoized per-action handlers
 * and setters through CommandPanelActionRunnerDeps.
 */
import type { Dispatch, SetStateAction } from "react";
import { formatError } from "../lib/format";
import {
  mergeComposerAttachments,
  type ComposerAttachment,
  type SettingsPanelId,
} from "../state/composer-workflow";
import type {
  CommandPanelEntry,
  CommandPanelEntryAction,
  CommandPanelState,
} from "../state/command-panel";
import { localeLabel, type ForgeLocale } from "../state/i18n";
import { appendSkillPromptText } from "../state/app-shell-helpers";
import {
  mergeNotificationPreferences,
  notificationPolicyLabel,
  notificationSoundLabel,
  type NotificationPreferences,
} from "../state/notification-preferences";
import { projectNotificationSettingsEntry } from "../state/settings-panel-workflow";
import { themeModeLabel, type UiThemeMode } from "../state/theme";
import { reducedMotionLabel, type ReducedMotionMode } from "../state/appearance";
import type { ThreadWorkflowDispatch } from "../state/thread-workflow";
import type {
  CommandPanelSink,
  McpServerFormAction,
  McpToolFormAction,
} from "./use-command-panel-actions-types";

type PanelActionOf<T extends NonNullable<CommandPanelEntry["action"]>["type"]> =
  Extract<NonNullable<CommandPanelEntry["action"]>, { type: T }>;

export interface CommandPanelActionRunnerDeps {
  callMcpToolFromPanel: (action: PanelActionOf<"callMcpTool">, sink?: CommandPanelSink) => Promise<void>;
  checkoutPluginShareFromPanel: (action: PanelActionOf<"checkoutPluginShare">, sink?: CommandPanelSink) => Promise<void>;
  connectRequiredAppFromPanel: (action: PanelActionOf<"connectRequiredApp">, sink?: CommandPanelSink) => Promise<void>;
  createStarterSkillFromPanel: (action: PanelActionOf<"createStarterSkill">, sink?: CommandPanelSink) => Promise<void>;
  dispatch: ThreadWorkflowDispatch;
  installPluginFromPanel: (action: PanelActionOf<"installPlugin">, sink?: CommandPanelSink) => Promise<void>;
  loginMcpServerFromPanel: (action: PanelActionOf<"loginMcpServer">, sink?: CommandPanelSink) => Promise<void>;
  openBrowserRuntimeFromPanel: (action: PanelActionOf<"openBrowserRuntime">, sink?: CommandPanelSink) => Promise<void>;
  openComputerUseSetupFromPanel: (action: PanelActionOf<"openComputerUseSetup">, sink?: CommandPanelSink) => Promise<void>;
  openExternalUrlFromPanel: (action: PanelActionOf<"openExternalUrl">, sink?: CommandPanelSink) => Promise<void>;
  probeComputerUseMcpFromPanel: (action: PanelActionOf<"probeComputerUseMcp">, sink?: CommandPanelSink) => Promise<void>;
  repairComputerUseBundleFromPanel: (action: PanelActionOf<"repairComputerUseBundle">, sink?: CommandPanelSink) => Promise<void>;
  readMcpResourceFromPanel: (action: PanelActionOf<"readMcpResource">, sink?: CommandPanelSink) => Promise<void>;
  readPluginSkillFromPanel: (action: PanelActionOf<"readPluginSkill">, sink?: CommandPanelSink) => Promise<void>;
  readSkillFileFromPanel: (action: PanelActionOf<"readSkillFile">, sink?: CommandPanelSink) => Promise<void>;
  reloadMcpServersFromPanel: (action: PanelActionOf<"reloadMcpServers">, sink?: CommandPanelSink) => Promise<void>;
  removeMcpServerFromPanel: (action: PanelActionOf<"removeMcpServer">, sink?: CommandPanelSink) => Promise<void>;
  setActiveSettingsPanel: Dispatch<SetStateAction<SettingsPanelId | null>>;
  setCommandPanel: Dispatch<SetStateAction<CommandPanelState | null>>;
  setComposerAttachments: Dispatch<SetStateAction<ComposerAttachment[]>>;
  setInput: Dispatch<SetStateAction<string>>;
  setThreadMemoryModeFromPanel: (action: PanelActionOf<"setThreadMemoryMode">, sink?: CommandPanelSink) => Promise<void>;
  setMcpServerForm: Dispatch<SetStateAction<McpServerFormAction | null>>;
  setMcpToolForm: Dispatch<SetStateAction<McpToolFormAction | null>>;
  setUiLocale?: (locale: ForgeLocale) => void;
  setUiThemeMode?: (mode: UiThemeMode) => void;
  setUiCodeFontSize?: (size: number) => void;
  setUiReducedMotion?: (mode: ReducedMotionMode) => void;
  setUiKeyboardShortcut?: (commandId: string, accelerator: string | null) => void;
  resetUiKeyboardShortcut?: (commandId: string) => void;
  notificationPreferences?: NotificationPreferences;
  setNotificationPreferences?: (patch: Partial<NotificationPreferences>) => NotificationPreferences;
  runSlashCommand?: (commandId: string) => void;
  openFileSearchPanel?: () => void;
  setThreadPinnedById?: (threadId: string, pinned: boolean) => void;
  selectThreadById?: (threadId: string) => void | Promise<void>;
  uninstallPluginFromPanel: (action: PanelActionOf<"uninstallPlugin">, sink?: CommandPanelSink) => Promise<void>;
  writeAppConfigFromPanel: (action: PanelActionOf<"writeAppConfig">, sink?: CommandPanelSink) => Promise<void>;
  writeConfigFromPanel: (action: PanelActionOf<"writeConfig">, sink?: CommandPanelSink) => Promise<void>;
  writeMcpServerConfigFromPanel: (action: PanelActionOf<"writeMcpServerConfig">, sink?: CommandPanelSink) => Promise<void>;
  writePluginConfigFromPanel: (action: PanelActionOf<"writePluginConfig">, sink?: CommandPanelSink) => Promise<void>;
  writeSkillConfigFromPanel: (action: PanelActionOf<"writeSkillConfig">, sink?: CommandPanelSink) => Promise<void>;
}

function skillPromptReference(action: Extract<CommandPanelEntryAction, { type: "attachSkill" }>): string {
  return `[$${action.name}](${escapePromptPath(action.path)}) `;
}

function escapePromptPath(value: string): string {
  return value.replace(/\\/g, "\\\\").replace(/\)/g, "\\)");
}

export function runCommandPanelAction(
  deps: CommandPanelActionRunnerDeps,
  action: CommandPanelEntryAction,
  sink: CommandPanelSink,
): void {
  const {
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
  } = deps;
  if (action.type === "attachMention") {
    setComposerAttachments((current) => mergeComposerAttachments(current, [{
      type: "mention",
      name: action.name,
      path: action.path,
    }]));
    setCommandPanel(null);
    setActiveSettingsPanel(null);
    return;
  }
  if (action.type === "attachSkill") {
    setInput((current) => appendSkillPromptText(current, action.promptText ?? skillPromptReference(action)));
    setCommandPanel(null);
    setActiveSettingsPanel(null);
    return;
  }
  if (action.type === "attachApp") {
    setInput((current) => appendSkillPromptText(current, action.promptText));
    setCommandPanel(null);
    setActiveSettingsPanel(null);
    return;
  }
  if (action.type === "attachPlugin") {
    setInput((current) => appendSkillPromptText(current, action.promptText));
    setCommandPanel(null);
    setActiveSettingsPanel(null);
    return;
  }
  if (action.type === "selectThread") {
    setCommandPanel(null);
    setActiveSettingsPanel(null);
    void selectThreadById?.(action.threadId);
    return;
  }
  if (action.type === "writeConfig") {
    void writeConfigFromPanel(action, sink);
    return;
  }
  if (action.type === "writeSkillConfig") {
    void writeSkillConfigFromPanel(action, sink);
    return;
  }
  if (action.type === "readSkillFile") {
    void readSkillFileFromPanel(action, sink);
    return;
  }
  if (action.type === "createStarterSkill") {
    void createStarterSkillFromPanel(action, sink);
    return;
  }
  if (action.type === "readPluginSkill") {
    void readPluginSkillFromPanel(action, sink);
    return;
  }
  if (action.type === "insertLocalCommand") {
    setInput((current) => current.trim() ? `${current.trimEnd()}\n${action.command}` : action.command);
    setCommandPanel(null);
    setActiveSettingsPanel(null);
    dispatch({ type: "log", text: action.message, level: "info" });
    return;
  }
  if (action.type === "openMcpServerForm") {
    setCommandPanel(null);
    setMcpServerForm(action);
    return;
  }
  if (action.type === "writeMcpServerConfig") {
    void writeMcpServerConfigFromPanel(action, sink);
    return;
  }
  if (action.type === "removeMcpServer") {
    void removeMcpServerFromPanel(action, sink);
    return;
  }
  if (action.type === "writeAppConfig") {
    void writeAppConfigFromPanel(action, sink);
    return;
  }
  if (action.type === "connectRequiredApp") {
    void connectRequiredAppFromPanel(action, sink);
    return;
  }
  if (action.type === "openExternalUrl") {
    void openExternalUrlFromPanel(action, sink);
    return;
  }
  if (action.type === "openBrowserRuntime") {
    void openBrowserRuntimeFromPanel(action, sink);
    return;
  }
  if (action.type === "openComputerUseSetup") {
    void openComputerUseSetupFromPanel(action, sink);
    return;
  }
  if (action.type === "repairComputerUseBundle") {
    void repairComputerUseBundleFromPanel(action, sink);
    return;
  }
  if (action.type === "probeComputerUseMcp") {
    void probeComputerUseMcpFromPanel(action, sink);
    return;
  }
  if (action.type === "installPlugin") {
    void installPluginFromPanel(action, sink);
    return;
  }
  if (action.type === "checkoutPluginShare") {
    void checkoutPluginShareFromPanel(action, sink);
    return;
  }
  if (action.type === "uninstallPlugin") {
    void uninstallPluginFromPanel(action, sink);
    return;
  }
  if (action.type === "writePluginConfig") {
    void writePluginConfigFromPanel(action, sink);
    return;
  }
  if (action.type === "setThreadMemoryMode") {
    void setThreadMemoryModeFromPanel(action, sink);
    return;
  }
  if (action.type === "setThreadPinned") {
    if (!setThreadPinnedById) {
      sink("generic", {
        status: "error",
        title: action.title,
        error: "Thread pinning is unavailable.",
        entries: [],
      });
      return;
    }
    setThreadPinnedById(action.threadId, action.pinned);
    setCommandPanel(null);
    setActiveSettingsPanel(null);
    dispatch({
      type: "log",
      text: `Chat ${action.pinned ? "pinned" : "unpinned"}.`,
      level: "info",
    });
    return;
  }
  if (action.type === "setUiTheme") {
    setUiThemeMode?.(action.mode);
    sink("theme", {
      status: "ready",
      title: action.title,
      message: `${themeModeLabel(action.mode)} theme selected.`,
      entries: [{
        id: `theme:${action.mode}:saved`,
        title: themeModeLabel(action.mode),
        kind: "theme",
        status: "selected",
        meta: "Saved locally",
      }],
    });
    dispatch({ type: "log", text: `${themeModeLabel(action.mode)} theme selected.`, level: "info" });
    return;
  }
  /*
   * CODEX-REF: settings.general.appearance.codeFontSize.row mutation.
   * Codex Desktop persists onBlur of a number input; Forge commits each
   * +/- button click directly, sharing the same `size: number` payload.
   */
  if (action.type === "setCodeFontSize") {
    setUiCodeFontSize?.(action.size);
    sink("generic", {
      status: "ready",
      title: action.title,
      message: `Code font size set to ${action.size} px.`,
      entries: [{
        id: `code-font-size:${action.size}:saved`,
        title: `${action.size} px`,
        kind: "status",
        status: "selected",
        meta: "Saved locally",
      }],
    });
    dispatch({ type: "log", text: `Code font size set to ${action.size} px.`, level: "info" });
    return;
  }
  /*
   * CODEX-REF: settings.general.appearance.reducedMotion.label mutation —
   * mode is one of "system" / "on" / "off" matching the Codex option IDs.
   */
  if (action.type === "setReducedMotion") {
    setUiReducedMotion?.(action.mode);
    const label = reducedMotionLabel(action.mode);
    sink("generic", {
      status: "ready",
      title: action.title,
      message: `Reduced motion: ${label}.`,
      entries: [{
        id: `reduced-motion:${action.mode}:saved`,
        title: label,
        kind: "status",
        status: "selected",
        meta: "Saved locally",
      }],
    });
    dispatch({ type: "log", text: `Reduced motion: ${label}.`, level: "info" });
    return;
  }
  /*
   * CODEX-REF: keyboard-shortcuts-settings-*.js — type=set/replace
   * mutation. Accelerator is null when the user intentionally unbinds the
   * command. The setter mirrors React state + module singleton in
   * keymap-overrides.ts so accelerator resolvers see the new value
   * immediately (no Tauri command needed, webview-scoped).
   */
  if (action.type === "setKeyboardShortcut") {
    setUiKeyboardShortcut?.(action.commandId, action.accelerator);
    const description = action.accelerator
      ? `Set ${action.commandId} to ${action.accelerator}.`
      : `Unbound ${action.commandId}.`;
    dispatch({ type: "log", text: description, level: "info" });
    return;
  }
  /*
   * CODEX-REF: keyboard-shortcuts-settings-*.js — type=reset mutation.
   */
  if (action.type === "resetKeyboardShortcut") {
    resetUiKeyboardShortcut?.(action.commandId);
    dispatch({ type: "log", text: `Reset ${action.commandId} keybinding.`, level: "info" });
    return;
  }
  if (action.type === "setUiLocale") {
    setUiLocale?.(action.locale);
    const label = localeLabel(action.locale);
    sink("generic", {
      status: "ready",
      title: action.title,
      message: `${label} language selected.`,
      entries: [{
        id: `locale:${action.locale}:saved`,
        title: label,
        kind: "status",
        status: "selected",
        meta: "Saved locally",
      }],
    });
    dispatch({ type: "log", text: `${label} language selected.`, level: "info" });
    return;
  }
  if (action.type === "setNotificationPreferences") {
    const fallback = notificationPreferences ?? {
      turnCompletionPolicy: "backgroundOnly" as const,
      sound: true,
    };
    const next = setNotificationPreferences?.(action.patch)
      ?? mergeNotificationPreferences(fallback, action.patch);
    const status = notificationPolicyLabel(next.turnCompletionPolicy);
    sink("generic", {
      status: "ready",
      title: "Notifications",
      message: `Turn completion notifications: ${status}; ${notificationSoundLabel(next.sound).toLowerCase()}.`,
      entries: [projectNotificationSettingsEntry(next)],
    });
    dispatch({
      type: "log",
      text: `Turn completion notifications set to ${status}; ${notificationSoundLabel(next.sound).toLowerCase()}.`,
      level: "info",
    });
    return;
  }
  if (action.type === "runSlashCommand") {
    setCommandPanel(null);
    setActiveSettingsPanel(null);
    runSlashCommand?.(action.commandId);
    return;
  }
  if (action.type === "openFileSearch") {
    setActiveSettingsPanel(null);
    openFileSearchPanel?.();
    return;
  }
  if (action.type === "copyText") {
    const clipboard = globalThis.navigator?.clipboard;
    if (!clipboard?.writeText) {
      sink("generic", {
        status: "error",
        title: action.title,
        error: "Clipboard API is unavailable.",
        entries: [],
      });
      return;
    }
    void clipboard.writeText(action.text)
      .then(() => {
        dispatch({ type: "log", text: `Copied ${action.label}`, level: "info" });
        sink("generic", {
          status: "ready",
          title: action.title,
          message: `Copied ${action.label}`,
          entries: [],
        });
      })
      .catch((error) => {
        sink("generic", {
          status: "error",
          title: action.title,
          error: formatError(error),
          entries: [],
        });
      });
    return;
  }
  if (action.type === "scrollToContentUnit") {
    const target = Array.from(document.querySelectorAll<HTMLElement>("[data-content-search-unit-key]"))
      .find((element) => element.dataset.contentSearchUnitKey === action.unitKey);
    if (!target) {
      dispatch({ type: "log", text: `Thread result is no longer mounted: ${action.title}`, level: "warn" });
      return;
    }
    setCommandPanel(null);
    setActiveSettingsPanel(null);
    target.scrollIntoView({ block: "center" });
    target.classList.add("hc-thread-find-flash");
    window.setTimeout(() => target.classList.remove("hc-thread-find-flash"), 1200);
    return;
  }
  if (action.type === "reloadMcpServers") {
    void reloadMcpServersFromPanel(action, sink);
    return;
  }
  if (action.type === "loginMcpServer") {
    void loginMcpServerFromPanel(action, sink);
    return;
  }
  if (action.type === "callMcpTool") {
    void callMcpToolFromPanel(action, sink);
    return;
  }
  if (action.type === "readMcpResource") {
    void readMcpResourceFromPanel(action, sink);
    return;
  }
  if (action.type === "openMcpToolForm") {
    setCommandPanel(null);
    setMcpToolForm(action);
  }
}
