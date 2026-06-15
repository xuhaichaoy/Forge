import type { ModelConfig } from "@forge/codex-protocol";
import type { CommandPanelEntry, CommandPanelKind } from "./command-panel";
import type { SettingsPanelId } from "./composer-workflow";
import { FORGE_IMAGE_TOOL_NAME } from "./image-generation-tool";
import {
  findSettingsActiveModel,
  projectServiceTierSettingsEntry,
} from "./settings-service-tier";
import {
  formatMessage,
  type ForgeLocale,
  type I18nMessageDescriptor,
  type I18nValues,
} from "./i18n";

// Local structural alias for the IntlProvider's formatMessage, so this state
// module localizes labels without importing from the components layer. Callers
// (model-settings-panel) pass it down; when absent, labels stay English.
type FormatMessage = (descriptor: I18nMessageDescriptor, values?: I18nValues) => string;
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
import type { UiThemeSnapshot } from "./theme";
import {
  COMMAND_DESCRIPTORS,
  commandDescriptorDescription,
  commandDescriptorTitle,
  descriptorAcceleratorLabel,
} from "./commands";
import {
  EMPTY_KEYMAP_OVERRIDES,
  resolveKeymapOverride,
  type KeymapOverrides,
} from "./keymap-overrides";
import { projectLocaleSettingsEntry } from "./settings-local-preferences";

export {
  appearanceSettingsEntries,
  projectCodeFontSizeSettingsEntry,
  projectLocaleSettingsEntry,
  projectReducedMotionSettingsEntry,
  projectThemeSettingsEntry,
} from "./settings-local-preferences";

/*
 * CODEX-REF: Codex Desktop settings webview chunks
 * (Cursor ChatGPT extension `openai.chatgpt-26.519.32039-darwin-arm64/webview/assets/`).
 *
 * Section order, labels, and per-slug icon come from `settings-page-*.js`
 * (the slug→icon map and the group descriptor) and `settings-shared-*.js`
 * (the `settings.nav.<slug>` defaultMessage table). `settings-sections-*.js`
 * defines the canonical slug order. Codex Desktop renders NO subtitle/description
 * under each nav entry — `settings-shared-*.js` returns a subtitle JSX only for
 * the `mcp-settings` case (defaultMessage: "Connect external tools and data
 * sources."). All other sections have no description text.
 *
 * Forge keeps its own slug names (`mcp`, `hooks`, `plugins`, `skills`, `general`)
 * instead of Codex's `mcp-settings` / `general-settings` style because the
 * SettingsPanelId union in composer-workflow.ts and the panel-ID branches in
 * settings-panel-loader.ts are wired to these short slugs. The user-visible label
 * still mirrors Codex Desktop.
 *
 * Forge-only sections (`models`, `images`, `permissions`, `approvals`, `apps`,
 * `experimental`) have no Codex Desktop counterpart — they are kept where Forge
 * had them and use Forge-original descriptions.
 */
type SettingsSectionIcon =
  // Forge-original tokens
  | "general"
  | "models"
  | "images"
  | "permissions"
  | "apps"
  | "experimental"
  // Codex Desktop sections (settings-page-*.js slug→icon map)
  | "appearance"        // Codex sun icon
  | "appshots"          // Codex appshot-window icon
  | "connections"       // Codex globe icon
  | "git"               // Codex branch icon (slug git-settings)
  | "usage"             // Codex speedometer icon
  | "agent"             // Codex shield-code icon (slug agent / "Configuration")
  | "personalization"   // Codex face icon
  | "keyboard"          // Codex inline keyboard SVG
  | "browser"           // Codex app-window icon (slug browser-use)
  | "computer"          // Codex cursor icon (slug computer-use)
  | "environments"      // Codex dock icon (slug local-environments)
  | "worktrees"         // Codex worktree icon
  | "mcp"               // Codex mcp icon (slug mcp-settings)
  | "skills"            // Codex skills icon (slug skills-settings)
  | "hooks"             // Codex hooks icon (slug hooks-settings)
  | "plugins"           // Codex apps icon (slug plugins-settings); Forge token "plugins"
  | "archive";          // Codex archive icon (slug data-controls)

/*
 * CODEX-REF: Section grouping mirrors Codex Desktop 26.602.40724's group
 * descriptor `$e` in settings-page-*.js — FOUR groups (an earlier build used a
 * 2-group app/host split, which Forge had cloned; the live build regrouped):
 *   [
 *     {key:`personal`,    heading:`Personal`,     slugs:[general-settings, profile,
 *           appearance, agent, personalization, keyboard-shortcuts, usage]},
 *     {key:`integrations`,heading:`Integrations`, slugs:[appshots, codex-micro,
 *           mcp-settings, plugins-settings, skills-settings, browser-use, computer-use]},
 *     {key:`coding`,      heading:`Coding`,       slugs:[hooks-settings, connections,
 *           git-settings, local-environments, environments, worktrees]},
 *     {key:`archived`,    heading:`Archived`,     slugs:[data-controls]}
 *   ]
 * Heading i18n: settings.nav.heading.{personal,integrations,coding,archived}.
 * profile / codex-micro are Codex-only (absent here). Forge-only sections with
 * no Codex counterpart are folded into the group whose semantic they most match:
 *   - models, images, apps → integrations (endpoints / connected apps, by MCP/plugins)
 *   - permissions, approvals, experimental → coding (agent runtime + dev config)
 */
export type SettingsSectionGroup = "personal" | "integrations" | "coding" | "archived";

export const SETTINGS_SECTION_GROUP_HEADINGS: Record<SettingsSectionGroup, string | null> = {
  // Codex Desktop: settings.nav.heading.{personal,integrations,coding,archived}
  personal: "Personal",
  integrations: "Integrations",
  coding: "Coding",
  archived: "Archived",
};

export const SETTINGS_SECTIONS: Array<{
  id: SettingsPanelId;
  title: string;
  description: string;
  icon: SettingsSectionIcon;
  group: SettingsSectionGroup;
}> = [
  // === Personal (codex $e personal.slugs: general-settings, profile, appearance,
  // agent, personalization, keyboard-shortcuts, usage; `profile` is Codex-only) ===
  { id: "general", title: "General", description: "Runtime and workspace", icon: "general", group: "personal" },
  { id: "appearance", title: "Appearance", description: "", icon: "appearance", group: "personal" },
  { id: "agent", title: "Configuration", description: "", icon: "agent", group: "personal" },
  { id: "personalization", title: "Personalization", description: "", icon: "personalization", group: "personal" },
  { id: "keyboard-shortcuts", title: "Keyboard shortcuts", description: "", icon: "keyboard", group: "personal" },
  { id: "usage", title: "Usage & billing", description: "", icon: "usage", group: "personal" },

  // === Integrations (codex $e integrations.slugs: appshots, codex-micro,
  // mcp-settings, plugins-settings, skills-settings, browser-use, computer-use;
  // `codex-micro` is Codex-only. Forge-only models/images/apps folded in here.) ===
  { id: "appshots", title: "Appshots", description: "", icon: "appshots", group: "integrations" },
  { id: "mcp", title: "MCP servers", description: "Connect external tools and data sources.", icon: "mcp", group: "integrations" },
  // Codex gates plugins/skills out of the nav; Forge keeps them (it manages its own).
  { id: "plugins", title: "Plugins", description: "", icon: "plugins", group: "integrations" },
  { id: "skills", title: "Skills", description: "Give Codex superpowers.", icon: "skills", group: "integrations" },
  // Forge-only: connected apps — semantic neighbor to plugins/skills/mcp.
  { id: "apps", title: "Apps", description: "Connected apps", icon: "apps", group: "integrations" },
  { id: "browser-use", title: "Browser", description: "Manage Codex’s browser.", icon: "browser", group: "integrations" },
  { id: "computer-use", title: "Computer use", description: "Manage how Codex uses other applications on your computer", icon: "computer", group: "integrations" },
  // Forge-only: local model + image-gen endpoint config — provider integrations.
  { id: "models", title: "Models", description: "Provider and model profile", icon: "models", group: "integrations" },
  { id: "images", title: "Images", description: "Image generation endpoint", icon: "images", group: "integrations" },

  // === Coding (codex $e coding.slugs: hooks-settings, connections, git-settings,
  // local-environments, environments, worktrees. Forge-only permissions/
  // approvals/experimental folded in — agent runtime + dev config.) ===
  { id: "hooks", title: "Hooks", description: "Manage lifecycle hooks from config and enabled plugins.", icon: "hooks", group: "coding" },
  { id: "connections", title: "Connections", description: "", icon: "connections", group: "coding" },
  { id: "git-settings", title: "Git", description: "", icon: "git", group: "coding" },
  { id: "local-environments", title: "Environments", description: "", icon: "environments", group: "coding" },
  { id: "worktrees", title: "Worktrees", description: "Local, worktree, cloud modes", icon: "worktrees", group: "coding" },
  // Forge-only: agent runtime policy + approval policy + feature gates.
  { id: "permissions", title: "Permissions", description: "Sandbox and access mode", icon: "permissions", group: "coding" },
  { id: "approvals", title: "Approvals", description: "Current request policy", icon: "permissions", group: "coding" },
  { id: "experimental", title: "Experimental", description: "Feature gates", icon: "experimental", group: "coding" },

  // === Archived (codex $e archived.slugs: data-controls) ===
  { id: "data-controls", title: "Archived chats", description: "", icon: "archive", group: "archived" },
];

/*
 * Codex i18n ids for the settings-nav slugs that exist in Codex's zh-CN catalog
 * (`settings.nav.*`). Sections with NO Codex id (Forge-only: models, images,
 * permissions, approvals, apps, experimental) are omitted → their English title
 * is used as-is. defaultMessage is always the section's existing English title,
 * so en-US rendering is unchanged.
 */
const SETTINGS_SECTION_I18N_IDS: Partial<Record<SettingsPanelId, string>> = {
  general: "settings.nav.general-settings",
  appearance: "settings.nav.appearance",
  appshots: "settings.nav.appshots",
  connections: "settings.nav.connections",
  "git-settings": "settings.nav.git-settings",
  usage: "settings.nav.usage",
  agent: "settings.nav.agent",
  personalization: "settings.nav.personalization",
  "keyboard-shortcuts": "settings.nav.keyboard-shortcuts",
  mcp: "settings.nav.mcp-settings",
  hooks: "settings.nav.hooks-settings",
  plugins: "settings.nav.plugins-settings",
  skills: "settings.nav.skills-settings",
  "browser-use": "settings.nav.browser-use",
  "computer-use": "settings.nav.computer-use",
  "local-environments": "settings.nav.local-environments",
  worktrees: "settings.nav.worktrees",
  "data-controls": "settings.nav.data-controls",
  // Forge-only sections (no Codex nav id) — localized via hc.settings.nav.* keys.
  models: "hc.settings.nav.models",
  images: "hc.settings.nav.images",
  permissions: "hc.settings.nav.permissions",
  approvals: "hc.settings.nav.approvals",
  apps: "hc.settings.nav.apps",
  experimental: "hc.settings.nav.experimental",
};

const SETTINGS_GROUP_HEADING_I18N_IDS: Record<SettingsSectionGroup, string> = {
  personal: "settings.nav.heading.personal",
  integrations: "settings.nav.heading.integrations",
  coding: "settings.nav.heading.coding",
  archived: "settings.nav.heading.archived",
};

// Localize a settings-nav section title. formatMessage is optional so callers
// without an IntlProvider (and tests) keep the English title.
export function settingsSectionTitle(
  section: { id: SettingsPanelId; title: string },
  formatMessage?: FormatMessage,
): string {
  const id = SETTINGS_SECTION_I18N_IDS[section.id];
  return id && formatMessage ? formatMessage({ id, defaultMessage: section.title }) : section.title;
}

// Forge shows a one-line subtitle under each settings-nav title (Codex Desktop
// shows none). Localize it the same way as the title; defaultMessage keeps the
// existing English subtitle so en-US rendering is unchanged.
const SETTINGS_SECTION_DESC_I18N_IDS: Partial<Record<SettingsPanelId, string>> = {
  general: "hc.settings.desc.general",
  models: "hc.settings.desc.models",
  images: "hc.settings.desc.images",
  mcp: "hc.settings.desc.mcp",
  hooks: "hc.settings.desc.hooks",
  skills: "hc.settings.desc.skills",
  permissions: "hc.settings.desc.permissions",
  approvals: "hc.settings.desc.approvals",
  apps: "hc.settings.desc.apps",
  "browser-use": "hc.settings.desc.browserUse",
  "computer-use": "hc.settings.desc.computerUse",
  worktrees: "hc.settings.desc.worktrees",
  experimental: "hc.settings.desc.experimental",
};

export function settingsSectionDescription(
  section: { id: SettingsPanelId; description: string },
  formatMessage?: FormatMessage,
): string {
  const id = SETTINGS_SECTION_DESC_I18N_IDS[section.id];
  return id && formatMessage ? formatMessage({ id, defaultMessage: section.description }) : section.description;
}

// Localize a settings-nav group heading ("App" / "Host").
export function settingsGroupHeadingTitle(
  group: SettingsSectionGroup,
  heading: string,
  formatMessage?: FormatMessage,
): string {
  const id = SETTINGS_GROUP_HEADING_I18N_IDS[group];
  return id && formatMessage ? formatMessage({ id, defaultMessage: heading }) : heading;
}

export function isRefreshableSettingsPanel(panel: SettingsPanelId): boolean {
  return panel === "images"
    || panel === "mcp"
    || panel === "skills"
    || panel === "hooks"
    || panel === "apps"
    || panel === "plugins"
    || panel === "browser-use"
    || panel === "computer-use"
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

// Localized settings-panel header title. The English switch below is the
// defaultMessage; module-level formatMessage resolves the already-present zh
// values (settings.nav.*) in Chinese mode and falls back to English otherwise,
// so en-US rendering is unchanged.
export function settingsPanelTitle(panel: SettingsPanelId): string {
  const defaultMessage = settingsPanelTitleEn(panel);
  const id = SETTINGS_SECTION_I18N_IDS[panel];
  return id ? formatMessage({ id, defaultMessage }) : defaultMessage;
}

function settingsPanelTitleEn(panel: SettingsPanelId): string {
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

/*
 * `keyboard-shortcuts` was previously routed through desktopBackedLocalSettingsEntries
 * as a "Desktop route" placeholder; it is now served by keyboardShortcutsSettingsEntries
 * below (CODEX-REF: keyboard-shortcuts-settings-*.js — read-only port of the
 * Codex Desktop 3-column command list). Rebind / key-capture / conflict detection
 * are NOT implemented here — Codex's panel allows in-place rebind via two host
 * bridges (codex-command-keymap-state, set-codex-command-keybinding) that Forge
 * does not yet have; until those land the panel stays read-only.
 */
export type DesktopBackedLocalSettingsPanel =
  | "agent"
  | "appshots"
  | "connections"
  | "data-controls"
  | "git-settings"
  | "local-environments"
  | "personalization"
  | "usage"
  | "computer-use"
  | "browser-use";

export type PluginBackedDesktopSettingsPanel = "browser-use" | "computer-use";

export interface PluginBackedDesktopSettingsInfo {
  panel: PluginBackedDesktopSettingsPanel;
  title: string;
  route: string;
  pluginAliases: string[];
  message: string;
  limitationDetails: string[];
  sourceDetails: string[];
}

export function isPluginBackedDesktopSettingsPanel(
  panel: SettingsPanelId,
): panel is PluginBackedDesktopSettingsPanel {
  return panel === "browser-use" || panel === "computer-use";
}

export function pluginBackedDesktopSettingsInfo(
  panel: PluginBackedDesktopSettingsPanel,
): PluginBackedDesktopSettingsInfo {
  const source = DESKTOP_BACKED_LOCAL_SETTINGS_SOURCE[panel];
  if (panel === "browser-use") {
    return {
      panel,
      title: "Browser",
      route: source.slug,
      pluginAliases: ["browser", "browser-use", "Browser", "Browser Use"],
      message: "Browser setup is loaded from app-server plugin data. Runtime readiness is shown separately for the local Tauri Browser surface.",
      limitationDetails: [
        "Plugin lifecycle: loaded from plugin/list, plugin/installed, plugin/share/list, and app/list.",
        "Runtime readiness: the separate Browser runtime row opens a local Tauri Browser surface; it does not prove bundled iab agent control.",
        "Settings bridge: origin allowlist and approval-mode host queries are still Desktop evidence only in Forge.",
      ],
      sourceDetails: desktopBackedLocalSettingsSourceDetails(panel),
    };
  }
  return {
    panel,
    title: "Computer use",
    route: source.slug,
    pluginAliases: ["computer-use", "computer", "Computer Use", "Computer"],
    message: "Computer Use setup is loaded from app-server plugin data. OS permissions and app approvals remain native setup requirements.",
    limitationDetails: [
      "Plugin lifecycle: loaded from plugin/list, plugin/installed, plugin/share/list, and app/list.",
      "OS permissions: Forge preflights Screen Recording and Accessibility for the current host process; helper-specific proof and app approvals remain native setup requirements.",
      "Execution bridge: this settings page does not add native mouse, keyboard, window, or screenshot control.",
    ],
    sourceDetails: desktopBackedLocalSettingsSourceDetails(panel),
  };
}

export function isDesktopBackedLocalSettingsPanel(
  panel: SettingsPanelId,
): panel is DesktopBackedLocalSettingsPanel {
  return panel === "agent"
    || panel === "appshots"
    || panel === "connections"
    || panel === "data-controls"
    || panel === "git-settings"
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
    details: desktopBackedLocalSettingsSourceDetails(panel),
  }];
}

export function desktopBackedLocalSettingsSourceDetails(
  panel: DesktopBackedLocalSettingsPanel,
): string[] {
  const source = DESKTOP_BACKED_LOCAL_SETTINGS_SOURCE[panel];
  return [
    `settings-sections slug: ${source.slug}`,
    `lazy chunk: ${source.chunk}`,
    ...source.evidence,
  ];
}

export function pluginBackedDesktopSettingsFallbackEntry(
  panel: PluginBackedDesktopSettingsPanel,
  context: { connected: boolean; error?: string | null },
): CommandPanelEntry {
  const info = pluginBackedDesktopSettingsInfo(panel);
  return {
    id: `${panel}:plugin-lifecycle`,
    title: info.title,
    kind: "status",
    status: context.connected ? "protocol-limited" : "offline",
    meta: "Plugin lifecycle",
    details: [
      context.error
        ? `Plugin data error: ${context.error}`
        : context.connected
          ? `No matching plugin row returned for aliases: ${info.pluginAliases.join(", ")}`
          : "Runtime is offline; plugin/list and plugin/installed were not queried.",
      ...info.limitationDetails,
      ...info.sourceDetails,
    ],
    disabled: true,
  };
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
    chunk: "agent-settings-*.js",
    evidence: [],
  },
  "appshots": {
    title: "Appshots",
    slug: "appshots",
    chunk: "appshots-settings-*.js",
    evidence: ["host query: appshot-hotkey-state", "host query: appshot-set-hotkey"],
  },
  "browser-use": {
    title: "Browser",
    slug: "browser-use",
    chunk: "browser-use-settings-*.js",
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
    chunk: "computer-use-settings-*.js",
    evidence: [
      "host query: computer-use-app-approvals-visibility",
      "host query: computer-use-app-approvals-read",
    ],
  },
  "connections": {
    title: "Connections",
    slug: "connections",
    chunk: "remote-connections-settings-*.js",
    evidence: [],
  },
  "data-controls": {
    title: "Archived chats",
    slug: "data-controls",
    chunk: "data-controls-*.js",
    evidence: [],
  },
  "git-settings": {
    title: "Git",
    slug: "git-settings",
    chunk: "git-settings-*.js",
    evidence: [],
  },
  // `keyboard-shortcuts` moved out of this map — see keyboardShortcutsSettingsEntries below.
  "local-environments": {
    title: "Environments",
    slug: "local-environments",
    chunk: "local-environments-settings-page-*.js",
    evidence: ["host query: local-environments", "app-server request: environment/add"],
  },
  "personalization": {
    title: "Personalization",
    slug: "personalization",
    chunk: "personalization-settings-*.js",
    evidence: [],
  },
  "usage": {
    title: "Usage & billing",
    slug: "usage",
    chunk: "usage-settings-*.js",
    evidence: ["access hook: use-usage-settings-access"],
  },
};

/*
 * CODEX-REF: keyboard-shortcuts-settings-*.js section grouping. Codex
 * Desktop groups its 3-column command list by `commandMenuGroupKey`,
 * rendering one section heading per group. Forge mirrors the same taxonomy
 * already used in components/keyboard-shortcuts-dialog.tsx so the Settings
 * panel and the ⌘⇧/ dialog stay visually consistent. Order of GROUP_TITLE
 * dictates section order; anything not in the list falls under "Other".
 */
const KEYBOARD_SHORTCUTS_GROUP_TITLE: ReadonlyArray<{ key: string; title: string }> = [
  { key: "thread", title: "Chat" },
  { key: "panels", title: "Panels" },
  { key: "navigation", title: "Navigation" },
  { key: "workspace", title: "Project" },
  { key: "skills", title: "Skills" },
  { key: "configure", title: "Configure" },
  { key: "app", title: "App" },
];

/*
 * CODEX-REF: keyboard-shortcuts-settings-*.js renders an editable 3-column
 * grid (Command / Keybinding / Actions) backed by two host bridges
 * (`codex-command-keymap-state` query, `set-codex-command-keybinding` mutation).
 * Forge ships a READ-ONLY port: one CommandPanelEntry per registered
 * COMMAND_DESCRIPTORS entry, with the platform-resolved accelerator surfaced
 * via the `status` field. Rebinding, key-capture, conflict detection, and
 * "reset to default" are intentionally NOT implemented yet — they need a new
 * Tauri-side keymap store + a key-capture component. The current panel
 * mirrors the same data the ⌘⇧/ KeyboardShortcutsDialog already shows.
 */
/*
 * CODEX-REF: kept as a pure read-only projector for callers that want a
 * flat CommandPanelEntry view of the command catalogue (e.g. cmdk-style
 * search). The Settings panel no longer consumes this; it renders the
 * KeyboardShortcutsSettingsPanel component directly with bespoke
 * 3-column / inline-capture UI mirroring keyboard-shortcuts-settings-*.js.
 * No secondaryActions because the inline panel owns the row-action affordances.
 */
export function keyboardShortcutsSettingsEntries(
  overrides: KeymapOverrides = EMPTY_KEYMAP_OVERRIDES,
): CommandPanelEntry[] {
  const groupLabel = (key: string): string => {
    const known = KEYBOARD_SHORTCUTS_GROUP_TITLE.find((entry) => entry.key === key);
    if (known) return known.title;
    if (!key) return "Other";
    return key.charAt(0).toUpperCase() + key.slice(1);
  };
  const groupOrder = (key: string): number => {
    const index = KEYBOARD_SHORTCUTS_GROUP_TITLE.findIndex((entry) => entry.key === key);
    return index < 0 ? KEYBOARD_SHORTCUTS_GROUP_TITLE.length : index;
  };
  const sorted = COMMAND_DESCRIPTORS.slice().sort((a, b) => {
    const ag = a.commandMenuGroupKey ?? a.group;
    const bg = b.commandMenuGroupKey ?? b.group;
    const groupDelta = groupOrder(ag) - groupOrder(bg);
    if (groupDelta !== 0) return groupDelta;
    return 0;
  });
  return sorted.map((descriptor) => {
    const groupKey = descriptor.commandMenuGroupKey ?? descriptor.group;
    const accelerator = descriptorAcceleratorLabel(descriptor.id);
    const override = resolveKeymapOverride(descriptor.id, overrides);
    const hasOverride = override !== undefined;
    return {
      id: `keyboard-shortcut:${descriptor.id}`,
      title: commandDescriptorTitle(descriptor),
      kind: "status",
      status: accelerator ?? "—",
      meta: hasOverride ? "Custom" : commandDescriptorDescription(descriptor),
      groupKey,
      groupLabel: groupLabel(groupKey),
    };
  });
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
  uiLocale?: ForgeLocale;
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

function notificationPolicyAction(policy: TurnCompletionNotificationPolicy) {
  const label = notificationPolicyLabel(policy);
  return {
    id: `notifications:policy:${policy}`,
    label,
    // Readable with the multi-word policy labels (codex "Only when unfocused").
    title: `Notify on turn completion: ${label}`,
    action: {
      type: "setNotificationPreferences" as const,
      title: `Notify on turn completion: ${label}`,
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
  const dynamicToolName = context.dynamicToolName || FORGE_IMAGE_TOOL_NAME;
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
