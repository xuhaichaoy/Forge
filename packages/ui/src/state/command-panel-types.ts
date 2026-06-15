// Pure type layer for the command panel, extracted verbatim from
// command-panel.ts. Type-only consumers (command-panel-file-search, -groups,
// -selectors, -skill-helpers, -state, -value-utils) import the contracts from
// here instead of from the panel implementation — that import-type back-edge
// is what used to close the six command-panel-centric dependency cycles.
// command-panel.ts re-exports everything in this module, so all existing
// importers keep working unchanged.
//
// Cycle safety: this module may only import from leaf/type modules whose
// transitive closure never reaches the command-panel family. Current imports
// (mcp-tool-arguments, i18n, notification-preferences, theme) are verified
// cycle-free; keep it that way when adding dependencies here.
import type { McpToolArgumentField } from "./mcp-tool-arguments";
import type { ForgeLocale } from "./i18n";
import type { NotificationPreferences } from "./notification-preferences";
import type { UiThemeMode } from "./theme";

export interface ConfigWriteActionEdit {
  keyPath: string;
  value: unknown;
  mergeStrategy: "replace" | "upsert";
}

export interface ConfigWriteTarget {
  filePath: string;
  expectedVersion: string;
}

export type CommandPanelKind =
  | "mcp"
  | "skills"
  | "hooks"
  | "apps"
  | "plugins"
  | "experimental"
  | "collaboration"
  | "status"
  | "theme"
  | "files"
  | "diff"
  | "generic";

// codex: app-main-*.js — cmdk Hd atom (root/chats/files modes).
// The Codex command dialog tracks a sub-mode separately from its panel kind
// so a single dialog can swap between command list / chat picker / file
// picker placeholders (`Type command` / `Search chats` / `Search files`) and
// drive the two-stage Esc behavior. We surface the same notion here as a
// derived value so existing CommandPanelState (panel + title) stays the
// source of truth.
export type CommandPanelSubMode = "root" | "chats" | "files";

export type CommandPanelEntryKind =
  | "mcpServer"
  | "mcpTool"
  | "mcpResource"
  | "mcpResourceTemplate"
  | "skill"
  | "hook"
  | "app"
  | "plugin"
  | "experimentalFeature"
  | "collaborationMode"
  | "thread"
  | "status"
  | "theme"
  | "file"
  | "diff";

export type CommandPanelEntryAction =
  | { type: "attachMention"; name: string; path: string }
  | {
      type: "attachSkill";
      name: string;
      path: string;
      promptText?: string;
      /*
       * SkillInterface 字段 — 透传给 chip 渲染（协议字段名见
       * packages/codex-protocol/src/generated/v2/SkillInterface.ts）。
       */
      iconSmall?: string | null;
      brandColor?: string | null;
    }
  | {
      type: "attachApp";
      name: string;
      path: string;
      promptText: string;
      /*
       * AppInfo.logoUrl / logoUrlDark — 透传给 chip 渲染（协议字段名见
       * packages/codex-protocol/src/generated/v2/AppInfo.ts）。
       */
      iconSmall?: string | null;
      brandColor?: string | null;
    }
  | {
      type: "attachPlugin";
      name: string;
      path: string;
      promptText: string;
      /*
       * PluginInterface composerIcon(Url) / logo(Url) / brandColor — 透传给 chip
       * 渲染（协议字段名见 packages/codex-protocol/src/generated/v2/PluginInterface.ts）。
       */
      iconSmall?: string | null;
      brandColor?: string | null;
    }
  | { type: "selectThread"; threadId: string }
  | {
      type: "writeConfig";
      title: string;
      message: string;
      edits: ConfigWriteActionEdit[];
      configWriteTarget?: ConfigWriteTarget;
      reloadUserConfig?: boolean;
      afterWrite?: { type: "addPersonalityChangeSyntheticItem"; personality: "friendly" | "pragmatic" };
    }
  | { type: "callMcpTool"; server: string; tool: string; arguments: Record<string, unknown> }
  | { type: "readMcpResource"; server: string; uri: string; title: string }
  | { type: "reloadMcpServers"; title: string }
  | { type: "loginMcpServer"; server: string; title: string }
  | {
      type: "openMcpToolForm";
      server: string;
      tool: string;
      title: string;
      description?: string;
      fields: McpToolArgumentField[];
    }
  | {
      type: "writeSkillConfig";
      title: string;
      name: string;
      path?: string;
      enabled: boolean;
    }
  | { type: "readSkillFile"; title: string; path: string }
  | {
      type: "createStarterSkill";
      title: string;
      skillName: string;
      directoryPath: string;
      filePath: string;
      contents: string;
    }
  | {
      type: "readPluginSkill";
      title: string;
      remoteMarketplaceName: string;
      remotePluginId: string;
      skillName: string;
    }
  | { type: "insertLocalCommand"; title: string; command: string; message: string }
  | {
      type: "openMcpServerForm";
      title: string;
      mode: "add" | "edit";
      server?: string;
      existingServers?: string[];
      serverConfig?: Record<string, unknown>;
      configWriteTarget?: ConfigWriteTarget;
    }
  | { type: "writeMcpServerConfig"; title: string; name: string; config: Record<string, unknown>; configWriteTarget?: ConfigWriteTarget }
  | { type: "removeMcpServer"; title: string; server: string; configWriteTarget?: ConfigWriteTarget }
  | { type: "writeAppConfig"; title: string; appId: string; enabled: boolean; configWriteTarget?: ConfigWriteTarget }
  | { type: "connectRequiredApp"; title: string; appId: string; appName: string; installUrl?: string | null }
  | { type: "openExternalUrl"; title: string; url: string }
  | { type: "openBrowserRuntime"; title: string; url?: string | null; tabId?: string | null }
  | {
      type: "probeComputerUseMcp";
      title: string;
      threadId: string;
      server: string;
      tool: string;
      arguments?: Record<string, unknown>;
    }
  | {
      type: "openComputerUseSetup";
      title: string;
      target: "helper" | "installer" | "screenRecording" | "accessibility";
      codexHome?: string | null;
    }
  | {
      type: "repairComputerUseBundle";
      title: string;
      codexHome?: string | null;
    }
  | {
      type: "installPlugin";
      title: string;
      pluginId: string;
      pluginName: string;
      marketplaceName: string;
      marketplacePath?: string | null;
      remotePluginId?: string | null;
      sourceSettingsPanel?: "browser-use" | "computer-use";
    }
  | { type: "uninstallPlugin"; title: string; pluginId: string; sourceSettingsPanel?: "browser-use" | "computer-use" }
  | {
      type: "writePluginConfig";
      title: string;
      pluginId: string;
      enabled: boolean;
      configWriteTarget?: ConfigWriteTarget;
      sourceSettingsPanel?: "browser-use" | "computer-use";
    }
  | { type: "checkoutPluginShare"; title: string; remotePluginId: string; pluginName: string }
  | { type: "setThreadMemoryMode"; title: string; threadId: string; mode: "enabled" | "disabled" }
  | { type: "setThreadPinned"; title: string; threadId: string; pinned: boolean }
  | { type: "setUiTheme"; title: string; mode: UiThemeMode }
  // CODEX-REF: settings.general.appearance.codeFontSize.row — Codex Desktop
  // commits a number 8-24 on blur. Forge uses +/- secondaryActions instead
  // of a number input, but the payload shape (size: number) is identical.
  | { type: "setCodeFontSize"; title: string; size: number }
  // CODEX-REF: settings.general.appearance.reducedMotion.label — 3-way toggle
  // (system / on / off). Mode string matches the option message IDs.
  | { type: "setReducedMotion"; title: string; mode: "system" | "on" | "off" }
  // CODEX-REF: keyboard-shortcuts-settings-*.js mutation
  // `set-codex-command-keybinding` (type=set/replace). Accelerator string is
  // already normalized to "CmdOrCtrl+K" shape by the capture component;
  // `null` clears the binding (user explicitly unbound the command).
  | { type: "setKeyboardShortcut"; title: string; commandId: string; accelerator: string | null }
  // CODEX-REF: same chunk — `set-codex-command-keybinding` type=reset; drops
  // the user override so the command falls back to its descriptor default.
  | { type: "resetKeyboardShortcut"; title: string; commandId: string }
  | { type: "setUiLocale"; title: string; locale: ForgeLocale }
  | { type: "setNotificationPreferences"; title: string; patch: Partial<NotificationPreferences> }
  | { type: "runSlashCommand"; title: string; commandId: string }
  | { type: "openFileSearch"; title: string }
  | { type: "copyText"; title: string; label: string; text: string }
  | { type: "scrollToContentUnit"; title: string; unitKey: string };

export type CommandPanelStatus = "idle" | "loading" | "ready" | "empty" | "error";

export interface CommandPanelSecondaryAction {
  id: string;
  label: string;
  title?: string;
  tone?: "default" | "success" | "danger";
  action: CommandPanelEntryAction;
}

export interface CommandPanelEntry {
  id: string;
  title: string;
  kind: CommandPanelEntryKind;
  groupKey?: string;
  groupLabel?: string;
  status?: string;
  meta?: string;
  details?: string[];
  disabled?: boolean;
  action?: CommandPanelEntryAction;
  secondaryActions?: CommandPanelSecondaryAction[];
  // codex: app-main-*.js — cmdk Ym.Item right-side shortcut.
  // Optional pre-resolved accelerator label rendered as a trailing <kbd> in
  // CommandPanelRow. Callers that already know the descriptor (e.g. when
  // emitting bespoke menu entries with a fixed COMMAND_IDS mapping) can fill
  // this directly; otherwise CommandPanel falls back to
  // `commandPanelEntryAcceleratorLabel(entry.id)` for the lookup.
  acceleratorLabel?: string;
}

export type CommandPanelRenderedItem =
  | { type: "group"; key: string; label: string }
  | { type: "entry"; key: string; entry: CommandPanelEntry };

export interface CommandPanelState {
  panel: CommandPanelKind;
  status: CommandPanelStatus;
  title: string;
  entries: CommandPanelEntry[];
  message: string;
  searchable?: boolean;
}

export interface FileSearchResult {
  root?: string;
  path?: string;
  file_name?: string;
  fsPath?: string;
  relativePathWithoutFileName?: string;
  score?: number;
  match_type?: string;
}
