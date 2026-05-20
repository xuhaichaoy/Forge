import type { CommandPanelEntry, CommandPanelKind } from "./command-panel";
import type { SettingsPanelId } from "./composer-workflow";
import { HICODEX_IMAGE_TOOL_NAME } from "./image-generation-tool";
import {
  HICODEX_SUPPORTED_LOCALES,
  localeDescription,
  localeLabel,
  type HiCodexLocale,
} from "./i18n";
import {
  TURN_COMPLETION_NOTIFICATION_POLICIES,
  notificationPolicyDescription,
  notificationPolicyLabel,
  notificationSoundLabel,
  type NotificationPreferences,
  type TurnCompletionNotificationPolicy,
} from "./notification-preferences";
import {
  permissionModeFromThreadContext,
  projectPermissionModeCommandEntries,
} from "./permissions-mode";
import {
  UI_THEME_MODES,
  themeModeDescription,
  themeModeLabel,
  type UiThemeMode,
  type UiThemeSnapshot,
} from "./theme";

export const SETTINGS_SECTIONS: Array<{
  id: SettingsPanelId;
  title: string;
  description: string;
  icon: "general" | "models" | "images" | "permissions" | "mcp" | "skills" | "hooks" | "apps" | "plugins" | "worktrees" | "experimental";
}> = [
  { id: "general", title: "General", description: "Runtime and workspace", icon: "general" },
  { id: "models", title: "Models", description: "Provider and model profile", icon: "models" },
  { id: "images", title: "Images", description: "Image generation endpoint", icon: "images" },
  { id: "worktrees", title: "Worktrees", description: "Local, worktree, cloud modes", icon: "worktrees" },
  { id: "permissions", title: "Permissions", description: "Sandbox and access mode", icon: "permissions" },
  { id: "approvals", title: "Approvals", description: "Current request policy", icon: "permissions" },
  { id: "mcp", title: "MCP", description: "Servers, tools, resources", icon: "mcp" },
  { id: "skills", title: "Skills", description: "Attach, recommend, create", icon: "skills" },
  { id: "hooks", title: "Hooks", description: "Lifecycle hooks", icon: "hooks" },
  { id: "apps", title: "Apps", description: "Connected apps", icon: "apps" },
  { id: "plugins", title: "Plugins", description: "Installed plugin surfaces", icon: "plugins" },
  { id: "experimental", title: "Experimental", description: "Feature gates", icon: "experimental" },
];

export function isRefreshableSettingsPanel(panel: SettingsPanelId): boolean {
  return panel === "images"
    || panel === "mcp"
    || panel === "skills"
    || panel === "hooks"
    || panel === "apps"
    || panel === "plugins"
    || panel === "worktrees"
    || panel === "experimental";
}

export function settingsPanelCommandKind(panel: SettingsPanelId): CommandPanelKind {
  switch (panel) {
    case "mcp":
      return "mcp";
    case "skills":
      return "skills";
    case "hooks":
      return "hooks";
    case "apps":
      return "apps";
    case "plugins":
      return "plugins";
    case "worktrees":
      return "generic";
    case "experimental":
      return "experimental";
    default:
      return "generic";
  }
}

export function settingsPanelTitle(panel: SettingsPanelId): string {
  switch (panel) {
    case "mcp":
      return "MCP";
    case "skills":
      return "Skills";
    case "hooks":
      return "Hooks";
    case "apps":
      return "Apps";
    case "plugins":
      return "Plugins";
    case "worktrees":
      return "Worktrees";
    case "experimental":
      return "Experimental";
    case "permissions":
      return "Permissions";
    case "approvals":
      return "Approvals";
    case "models":
      return "Models";
    case "images":
      return "Images";
    default:
      return "General";
  }
}

export function localSettingsEntries(
  panel: "permissions" | "approvals",
  context: {
    pendingRequestCount: number;
    threadContextDefaults: Parameters<typeof projectPermissionModeCommandEntries>[0];
    connected: boolean;
  },
): CommandPanelEntry[] {
  const permissionModeStatus = permissionModeFromThreadContext(context.threadContextDefaults);
  if (panel === "permissions") {
    return [
      ...projectPermissionModeCommandEntries(context.threadContextDefaults),
      ...(permissionModeStatus === "custom" ? [{
        id: "permissions:custom-status",
        title: "Custom/degraded permissions",
        kind: "status" as const,
        status: "custom/degraded",
        meta: "Status only; unsupported custom modes are not selectable.",
        details: [
          "The current sandbox, approval policy, or reviewer does not match a supported preset.",
          "Select Read only, Auto, Granular, or Full access to write a supported config tuple.",
        ],
      }] : []),
      {
        id: "permissions:connection",
        title: "Runtime connection",
        kind: "status",
        status: context.connected ? "connected" : "offline",
        meta: "Permissions are enforced by app-server requests",
      },
    ];
  }

  return [
    {
      id: "approvals:policy",
      title: "Approval policy",
      kind: "status",
      status: approvalPolicySetting(context.threadContextDefaults?.approvalPolicy) || "default",
      meta: approvalPolicySetting(context.threadContextDefaults?.approvalPolicy) === "custom/degraded"
        ? "Custom approval shape from app-server config; use Permissions presets to normalize."
        : "Configured for new thread requests",
    },
    {
      id: "approvals:permissions-mode",
      title: "Permissions mode status",
      kind: "status",
      status: permissionModeStatus === "custom" ? "custom/degraded" : permissionModeStatus,
      meta: permissionModeStatus === "custom"
        ? "Current policy is displayed for review but is not exposed as a selectable mode."
        : "Derived from sandbox, approval policy, and approval reviewer.",
    },
    {
      id: "approvals:pending",
      title: "Pending requests",
      kind: "status",
      status: String(context.pendingRequestCount),
      meta: "Shown above the composer when app-server asks for a decision",
    },
  ];
}

export function generalSettingsEntries(context: {
  activeThreadId: string | null;
  activeTurnId: string | null;
  codexHome: string | null;
  connected: boolean;
  defaultCwd: string | null;
  model: string | null;
  modelCount: number;
  pendingRequestCount: number;
  pid: number | null;
  uiLocale?: HiCodexLocale;
  uiTheme?: UiThemeSnapshot;
  workspace: string;
  notificationPreferences: NotificationPreferences;
}): CommandPanelEntry[] {
  return [
    {
      id: "settings:runtime",
      title: "Runtime",
      kind: "status",
      status: context.connected ? "connected" : "offline",
      meta: context.pid ? `pid ${context.pid}` : "No sidecar process",
      details: [
        `Codex home: ${context.codexHome || "not available"}`,
        `Workspace: ${context.workspace || context.defaultCwd || "not selected"}`,
      ],
    },
    {
      id: "settings:thread",
      title: "Active thread",
      kind: "status",
      status: context.activeThreadId ? "selected" : "none",
      meta: context.activeThreadId || undefined,
      details: [
        `Turn: ${context.activeTurnId || "none"}`,
        `Pending requests: ${context.pendingRequestCount}`,
      ],
    },
    {
      id: "settings:model",
      title: "Model profile",
      kind: "status",
      status: context.model || "default",
      meta: `${context.modelCount} configured profile(s)`,
    },
    projectThemeSettingsEntry(context.uiTheme ?? { mode: "system", resolved: "light" }),
    projectLocaleSettingsEntry(context.uiLocale ?? "en-US"),
    projectNotificationSettingsEntry(context.notificationPreferences),
  ];
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

export function projectNotificationSettingsEntry(preferences: NotificationPreferences): CommandPanelEntry {
  const policy = preferences.turnCompletionPolicy;
  return {
    id: "settings:notifications",
    title: "Turn completion notifications",
    kind: "status",
    status: notificationPolicyLabel(policy),
    meta: notificationSoundLabel(preferences.sound),
    details: [
      notificationPolicyDescription(policy),
      "Used by the native shell when app-server emits turn/completed or turn/failed.",
    ],
    secondaryActions: [
      ...TURN_COMPLETION_NOTIFICATION_POLICIES
        .filter((nextPolicy) => nextPolicy !== policy)
        .map((nextPolicy) => notificationPolicyAction(nextPolicy)),
      {
        id: `notifications:sound:${preferences.sound ? "off" : "on"}`,
        label: preferences.sound ? "Mute" : "Sound",
        title: preferences.sound ? "Turn notification sound off" : "Turn notification sound on",
        action: {
          type: "setNotificationPreferences",
          title: preferences.sound ? "Turn notification sound off" : "Turn notification sound on",
          patch: { sound: !preferences.sound },
        },
      },
    ],
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

function notificationPolicyAction(policy: TurnCompletionNotificationPolicy) {
  const label = notificationPolicyLabel(policy);
  return {
    id: `notifications:policy:${policy}`,
    label,
    title: `Use ${label.toLowerCase()} notifications`,
    action: {
      type: "setNotificationPreferences" as const,
      title: `Use ${label.toLowerCase()} notifications`,
      patch: { turnCompletionPolicy: policy },
    },
  };
}

export function modelSettingsEntries(context: {
  activeModel: string | null;
  modelCount: number;
}): CommandPanelEntry[] {
  return [
    {
      id: "models:active",
      title: "Active model",
      kind: "status",
      status: context.activeModel || "default",
      meta: `${context.modelCount} configured profile(s)`,
    },
  ];
}

export function imageGenerationCapabilityEntries(context: {
  capabilities?: unknown;
  connected: boolean;
  error?: string | null;
  dynamicToolRegistered?: boolean;
  dynamicToolName?: string;
}): CommandPanelEntry[] {
  const capabilities = parseModelProviderCapabilities(context.capabilities);
  const dynamicToolName = context.dynamicToolName || HICODEX_IMAGE_TOOL_NAME;
  const dynamicToolRegistered = context.dynamicToolRegistered === true;
  const nativeStatus = context.error
    ? "error"
    : !context.connected
      ? "offline"
      : capabilities?.imageGeneration === true
        ? "available"
        : capabilities?.imageGeneration === false
          ? "unavailable"
          : "unknown";

  return [
    {
      id: "images:native-capability",
      title: "Codex native image_generation",
      kind: "status",
      status: nativeStatus,
      meta: context.error || "Provider capability reported by app-server",
      details: [
        `namespace tools: ${capabilityLabel(capabilities?.namespaceTools)}`,
        `web search: ${capabilityLabel(capabilities?.webSearch)}`,
      ],
    },
    {
      id: "images:dynamic-tool",
      title: "Dynamic image tool",
      kind: "status",
      status: dynamicToolRegistered ? "registered" : "inactive",
      meta: dynamicToolName,
      details: dynamicToolRegistered
        ? [
            "Added to new thread/start requests",
            "Uses the configured image endpoint below",
          ]
        : [
            "Not added while image endpoint settings are blank",
            "Codex native image_generation can still be exposed by app-server",
          ],
    },
  ];
}

function approvalPolicySetting(value: unknown): string {
  if (typeof value === "string" && value.trim()) return value.trim();
  if (!value || typeof value !== "object" || Array.isArray(value)) return "";
  if (isGranularApprovalPolicy(value)) return "granular";
  return "custom/degraded";
}

function parseModelProviderCapabilities(value: unknown): {
  namespaceTools?: boolean;
  imageGeneration?: boolean;
  webSearch?: boolean;
} | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const record = value as Record<string, unknown>;
  return {
    namespaceTools: booleanField(record, "namespaceTools"),
    imageGeneration: booleanField(record, "imageGeneration"),
    webSearch: booleanField(record, "webSearch"),
  };
}

function booleanField(record: Record<string, unknown>, key: string): boolean | undefined {
  const value = record[key];
  return typeof value === "boolean" ? value : undefined;
}

function isGranularApprovalPolicy(value: unknown): boolean {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const granular = (value as Record<string, unknown>).granular;
  if (!granular || typeof granular !== "object" || Array.isArray(granular)) return false;
  const record = granular as Record<string, unknown>;
  return record.sandbox_approval === false
    && record.rules === false
    && record.skill_approval === false
    && record.request_permissions === true
    && record.mcp_elicitations === true;
}

function capabilityLabel(value: boolean | undefined): string {
  if (value === true) return "available";
  if (value === false) return "unavailable";
  return "unknown";
}
