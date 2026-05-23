import type { ModelConfig, ModelServiceTier } from "@hicodex/codex-protocol";
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

type SettingsSectionIcon =
  | "general"
  | "models"
  | "images"
  | "permissions"
  | "mcp"
  | "skills"
  | "hooks"
  | "apps"
  | "plugins"
  | "worktrees"
  | "experimental";

export const SETTINGS_SECTIONS: Array<{
  id: SettingsPanelId;
  title: string;
  description: string;
  icon: SettingsSectionIcon;
}> = [
  { id: "general", title: "General", description: "Runtime and workspace", icon: "general" },
  { id: "appearance", title: "Appearance", description: "Desktop route: appearance", icon: "general" },
  { id: "appshots", title: "Appshots", description: "Desktop route: appshots", icon: "general" },
  { id: "connections", title: "Connections", description: "Desktop route: connections", icon: "general" },
  { id: "git-settings", title: "Git", description: "Desktop route: git-settings", icon: "general" },
  { id: "models", title: "Models", description: "Provider and model profile", icon: "models" },
  { id: "images", title: "Images", description: "Image generation endpoint", icon: "images" },
  { id: "agent", title: "Configuration", description: "Desktop route: agent", icon: "general" },
  { id: "personalization", title: "Personalization", description: "Desktop route: personalization", icon: "general" },
  { id: "worktrees", title: "Worktrees", description: "Local, worktree, cloud modes", icon: "worktrees" },
  { id: "local-environments", title: "Environments", description: "Desktop route: local-environments", icon: "general" },
  { id: "permissions", title: "Permissions", description: "Sandbox and access mode", icon: "permissions" },
  { id: "approvals", title: "Approvals", description: "Current request policy", icon: "permissions" },
  { id: "keyboard-shortcuts", title: "Keyboard shortcuts", description: "Desktop route: keyboard-shortcuts", icon: "general" },
  { id: "usage", title: "Usage & billing", description: "Desktop route: usage", icon: "general" },
  { id: "browser-use", title: "Browser", description: "Desktop route: browser-use", icon: "general" },
  { id: "computer-use", title: "Computer use", description: "Desktop route: computer-use", icon: "general" },
  { id: "mcp", title: "MCP", description: "Servers, tools, resources", icon: "mcp" },
  { id: "skills", title: "Skills", description: "Attach, recommend, create", icon: "skills" },
  { id: "hooks", title: "Hooks", description: "Lifecycle hooks", icon: "hooks" },
  { id: "apps", title: "Apps", description: "Connected apps", icon: "apps" },
  { id: "plugins", title: "Plugins", description: "Installed plugin surfaces", icon: "plugins" },
  { id: "data-controls", title: "Archived chats", description: "Desktop route: data-controls", icon: "general" },
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
    case "keyboard-shortcuts":
      return "Keyboard shortcuts";
    case "usage":
      return "Usage & billing";
    case "computer-use":
      return "Computer use";
    case "browser-use":
      return "Browser";
    case "appearance":
      return "Appearance";
    case "appshots":
      return "Appshots";
    case "connections":
      return "Connections";
    case "git-settings":
      return "Git";
    case "agent":
      return "Configuration";
    case "personalization":
      return "Personalization";
    case "local-environments":
      return "Environments";
    case "data-controls":
      return "Archived chats";
    default:
      return "General";
  }
}

export type DesktopBackedLocalSettingsPanel =
  | "agent"
  | "appshots"
  | "connections"
  | "data-controls"
  | "git-settings"
  | "keyboard-shortcuts"
  | "local-environments"
  | "personalization"
  | "usage"
  | "computer-use"
  | "browser-use";

export function isDesktopBackedLocalSettingsPanel(
  panel: SettingsPanelId,
): panel is DesktopBackedLocalSettingsPanel {
  return panel === "agent"
    || panel === "appshots"
    || panel === "connections"
    || panel === "data-controls"
    || panel === "git-settings"
    || panel === "keyboard-shortcuts"
    || panel === "local-environments"
    || panel === "personalization"
    || panel === "usage"
    || panel === "computer-use"
    || panel === "browser-use";
}

export function desktopBackedLocalSettingsEntries(
  panel: DesktopBackedLocalSettingsPanel,
  _context: {
    connected: boolean;
  },
): CommandPanelEntry[] {
  const source = DESKTOP_BACKED_LOCAL_SETTINGS_SOURCE[panel];
  return [{
    id: `${panel}:desktop-surface`,
    title: source.title,
    kind: "status",
    status: "Desktop route",
    meta: source.slug,
    details: [
      `settings-sections slug: ${source.slug}`,
      `lazy chunk: ${source.chunk}`,
      ...source.evidence,
    ],
  }];
}

const DESKTOP_BACKED_LOCAL_SETTINGS_SOURCE: Record<DesktopBackedLocalSettingsPanel, {
  title: string;
  slug: string;
  chunk: string;
  evidence: string[];
}> = {
  "agent": {
    title: "Configuration",
    slug: "agent",
    chunk: "agent-settings-Iv4e2hT5.js",
    evidence: [],
  },
  "appshots": {
    title: "Appshots",
    slug: "appshots",
    chunk: "appshots-settings-CpG8juDu.js",
    evidence: ["host query: appshot-hotkey-state", "host query: appshot-set-hotkey"],
  },
  "browser-use": {
    title: "Browser",
    slug: "browser-use",
    chunk: "browser-use-settings-C_ZI9eu2.js",
    evidence: [
      "host query: browser-use-origin-state-read",
      "host query: browser-use-approval-mode-write",
      "host query: browser-use-history-approval-mode-write",
      "host query: browser-use-file-transfer-approval-mode-write",
      "host query: browser-use-origin-add",
      "host query: browser-use-origin-remove",
    ],
  },
  "computer-use": {
    title: "Computer use",
    slug: "computer-use",
    chunk: "computer-use-settings-C4qCJ8r7.js",
    evidence: [
      "host query: computer-use-app-approvals-visibility",
      "host query: computer-use-app-approvals-read",
    ],
  },
  "connections": {
    title: "Connections",
    slug: "connections",
    chunk: "remote-connections-settings-DUq8HF8I.js",
    evidence: [],
  },
  "data-controls": {
    title: "Archived chats",
    slug: "data-controls",
    chunk: "data-controls-Bwhnjmtt.js",
    evidence: [],
  },
  "git-settings": {
    title: "Git",
    slug: "git-settings",
    chunk: "git-settings-8uEhvzRM.js",
    evidence: [],
  },
  "keyboard-shortcuts": {
    title: "Keyboard shortcuts",
    slug: "keyboard-shortcuts",
    chunk: "keyboard-shortcuts-settings-RVscBDKb.js",
    evidence: ["host query: codex-command-keymap-state"],
  },
  "local-environments": {
    title: "Environments",
    slug: "local-environments",
    chunk: "local-environments-settings-page-C7D3Aihr.js",
    evidence: ["host query: local-environments", "app-server request: environment/add"],
  },
  "personalization": {
    title: "Personalization",
    slug: "personalization",
    chunk: "personalization-settings-0c6_rq74.js",
    evidence: [],
  },
  "usage": {
    title: "Usage & billing",
    slug: "usage",
    chunk: "usage-settings-Bu1gR5h4.js",
    evidence: ["access hook: use-usage-settings-access"],
  },
};

export function appearanceSettingsEntries(context: {
  uiTheme?: UiThemeSnapshot;
}): CommandPanelEntry[] {
  return [
    projectThemeSettingsEntry(context.uiTheme ?? { mode: "system", resolved: "light" }),
  ];
}

export function localSettingsEntries(
  panel: "permissions" | "approvals",
  context: {
    pendingRequestCount: number;
    threadContextDefaults: Parameters<typeof projectPermissionModeCommandEntries>[0];
    connected: boolean;
    requirements?: unknown;
    requirementsError?: string | null;
  },
): CommandPanelEntry[] {
  const permissionModeStatus = permissionModeFromThreadContext(context.threadContextDefaults);
  if (panel === "permissions") {
    return [
      ...projectPermissionModeCommandEntries(context.threadContextDefaults, context.requirements),
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
      ...(context.requirementsError ? [{
        id: "permissions:requirements-error",
        title: "Runtime requirements",
        kind: "status" as const,
        status: "unavailable",
        meta: context.requirementsError,
        details: ["configRequirements/read failed; showing local config-derived permission modes only."],
      }] : []),
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
    ...projectPermissionModeCommandEntries(context.threadContextDefaults, context.requirements)
      .filter((entry) => entry.id === "permissions:requirements"),
    ...(context.requirementsError ? [{
      id: "approvals:requirements-error",
      title: "Runtime requirements",
      kind: "status" as const,
      status: "unavailable",
      meta: context.requirementsError,
      details: ["configRequirements/read failed; approval choices may still be restricted by app-server."],
    }] : []),
  ];
}

export function generalSettingsEntries(context: {
  activeThreadId: string | null;
  activeTurnId: string | null;
  codexHome: string | null;
  connected: boolean;
  defaultCwd: string | null;
  model: string | null;
  modelProvider?: string | null;
  modelCount: number;
  models?: ModelConfig[];
  pendingRequestCount: number;
  pid: number | null;
  serviceTier?: unknown;
  uiLocale?: HiCodexLocale;
  uiTheme?: UiThemeSnapshot;
  workspace: string;
  notificationPreferences: NotificationPreferences;
}): CommandPanelEntry[] {
  const serviceTierEntry = projectServiceTierSettingsEntry({
    model: findSettingsActiveModel(context.models ?? [], context.modelProvider ?? null, context.model),
    serviceTier: context.serviceTier,
  });
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
    ...(serviceTierEntry ? [serviceTierEntry] : []),
    projectLocaleSettingsEntry(context.uiLocale ?? "en-US"),
    projectNotificationSettingsEntry(context.notificationPreferences),
  ];
}

const SERVICE_TIER_STANDARD_VALUE = "default";
const SERVICE_TIER_FAST_VALUE = "priority";
const SERVICE_TIER_STANDARD_LABEL = "Standard";
const SERVICE_TIER_STANDARD_DESCRIPTION = "Default speed";
const SERVICE_TIER_FAST_DESCRIPTION = "1.5x speed, increased usage";
const SERVICE_TIER_ULTRAFAST_DESCRIPTION = "The fastest available responses for latency-sensitive work";

interface ProjectServiceTierSettingsContext {
  model: ModelConfig | null;
  serviceTier?: unknown;
}

interface ProjectedServiceTierOption {
  value: string;
  label: string;
  description: string;
}

export function projectServiceTierSettingsEntry(
  context: ProjectServiceTierSettingsContext,
): CommandPanelEntry | null {
  // CODEX-REF: Desktop General settings renders Speed from model.serviceTiers;
  // local Codex config_types.rs uses "default" as the explicit Standard sentinel.
  const options = projectServiceTierOptions(context.model?.serviceTiers ?? []);
  if (options.length <= 1) return null;

  const currentValue = normalizeServiceTierRequestValue(context.serviceTier);
  const currentOption = options.find((option) => option.value === currentValue);
  const currentLabel = currentOption?.label ?? `Custom (${currentValue})`;
  return {
    id: "settings:service-tier",
    title: "Speed",
    kind: "status",
    status: currentLabel,
    meta: context.model?.model || "Current model",
    details: [
      "Choose the inference tier used across chats, subagents, and compaction",
      context.model?.defaultServiceTier
        ? `Model default service tier: ${context.model.defaultServiceTier}`
        : "Standard explicitly bypasses model catalog defaults.",
    ],
    secondaryActions: options
      .filter((option) => option.value !== currentValue)
      .map((option) => serviceTierAction(option)),
  };
}

function findSettingsActiveModel(
  models: ModelConfig[],
  modelProvider: string | null,
  modelSlug: string | null,
): ModelConfig | null {
  if (modelProvider) {
    const providerMatch = models.find((model) => model.id === modelProvider);
    if (providerMatch) return providerMatch;
  }
  if (modelSlug) {
    const slugMatch = models.find((model) => model.model === modelSlug || model.models?.includes(modelSlug));
    if (slugMatch) return slugMatch;
  }
  return models[0] ?? null;
}

function projectServiceTierOptions(serviceTiers: ModelServiceTier[]): ProjectedServiceTierOption[] {
  const options: ProjectedServiceTierOption[] = [
    {
      value: SERVICE_TIER_STANDARD_VALUE,
      label: SERVICE_TIER_STANDARD_LABEL,
      description: SERVICE_TIER_STANDARD_DESCRIPTION,
    },
  ];
  const seen = new Set(options.map((option) => option.value));
  for (const tier of serviceTiers) {
    const value = normalizeServiceTierRequestValue(tier.id);
    if (!value || seen.has(value) || value === SERVICE_TIER_STANDARD_VALUE) continue;
    seen.add(value);
    options.push({
      value,
      label: serviceTierLabel(tier),
      description: serviceTierDescription(tier),
    });
  }
  return options;
}

function serviceTierLabel(tier: ModelServiceTier): string {
  const kind = serviceTierKind(tier.id, tier.name);
  if (kind === "fast") return "Fast";
  if (kind === "ultrafast") return "Ultrafast";
  return tier.name.trim() || tier.id.trim();
}

function serviceTierDescription(tier: ModelServiceTier): string {
  const description = tier.description.trim();
  if (description) return description;
  const kind = serviceTierKind(tier.id, tier.name);
  if (kind === "fast") return SERVICE_TIER_FAST_DESCRIPTION;
  if (kind === "ultrafast") return SERVICE_TIER_ULTRAFAST_DESCRIPTION;
  return tier.id.trim();
}

function serviceTierKind(id: string, name: string): "fast" | "ultrafast" | null {
  const normalizedId = id.trim().toLowerCase();
  const normalizedName = name.trim().toLowerCase();
  if (normalizedId === "priority" || normalizedId === "fast" || normalizedName === "priority" || normalizedName === "fast") {
    return "fast";
  }
  if (normalizedId === "ultrafast" || normalizedName === "ultrafast") {
    return "ultrafast";
  }
  return null;
}

function normalizeServiceTierRequestValue(value: unknown): string {
  if (typeof value !== "string") return SERVICE_TIER_STANDARD_VALUE;
  const trimmed = value.trim();
  if (!trimmed) return SERVICE_TIER_STANDARD_VALUE;
  const normalized = trimmed.toLowerCase();
  if (normalized === "standard" || normalized === SERVICE_TIER_STANDARD_VALUE) return SERVICE_TIER_STANDARD_VALUE;
  if (normalized === "fast") return SERVICE_TIER_FAST_VALUE;
  return normalized;
}

function serviceTierAction(option: ProjectedServiceTierOption) {
  return {
    id: `service-tier:${option.value}`,
    label: option.label,
    title: `Use ${option.label} speed`,
    action: {
      type: "writeConfig" as const,
      title: `Use ${option.label} speed`,
      message: `Set speed to ${option.label}.`,
      edits: [{
        keyPath: "service_tier",
        value: option.value,
        mergeStrategy: "replace" as const,
      }],
      reloadUserConfig: true,
    },
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
