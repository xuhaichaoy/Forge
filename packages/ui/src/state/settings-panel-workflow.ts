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
import {
  CODE_FONT_SIZE_MAX,
  CODE_FONT_SIZE_MIN,
  CODE_FONT_SIZE_STEP,
  DEFAULT_UI_APPEARANCE,
  REDUCED_MOTION_MODES,
  clampCodeFontSize,
  reducedMotionDescription,
  reducedMotionLabel,
  type ReducedMotionMode,
  type UiAppearancePreferences,
} from "./appearance";
import {
  COMMAND_DESCRIPTORS,
  descriptorAcceleratorLabel,
} from "./commands";
import {
  EMPTY_KEYMAP_OVERRIDES,
  resolveKeymapOverride,
  type KeymapOverrides,
} from "./keymap-overrides";

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
 * HiCodex keeps its own slug names (`mcp`, `hooks`, `plugins`, `skills`, `general`)
 * instead of Codex's `mcp-settings` / `general-settings` style because the
 * SettingsPanelId union in composer-workflow.ts and the panel-ID branches in
 * settings-panel-loader.ts are wired to these short slugs. The user-visible label
 * still mirrors Codex Desktop.
 *
 * HiCodex-only sections (`models`, `images`, `permissions`, `approvals`, `apps`,
 * `experimental`) have no Codex Desktop counterpart — they are kept where HiCodex
 * had them and use HiCodex-original descriptions.
 */
type SettingsSectionIcon =
  // HiCodex-original tokens
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
  | "plugins"           // Codex apps icon (slug plugins-settings); HiCodex token "plugins"
  | "archive";          // Codex archive icon (slug data-controls)

/*
 * CODEX-REF: Section grouping mirrors Codex Desktop's group descriptor in
 * settings-page-*.js:
 *   [
 *     {key:`app`,slugs:[`general-settings`,`profile`,
 *           `appearance`,`appshots`,`connections`,`git-settings`,`usage`]},
 *     {key:`connection`,slugs:[`agent`,`personalization`,
 *           `keyboard-shortcuts`,`mcp-settings`,`hooks-settings`,`browser-use`,
 *           `computer-use`,`local-environments`,`worktrees`,`data-controls`]}
 *   ]
 * Heading strings:
 *   {appHeading:{id:`settings.nav.heading.app`,defaultMessage:`App`},
 *    hostHeading:{id:`settings.nav.heading.host`,defaultMessage:`Host`}}
 *
 * Codex defines exactly 2 groups; HiCodex has no third group either.
 * HiCodex-only sections (models / images / permissions / approvals / apps /
 * experimental) that have no Codex Desktop counterpart are folded into the
 * Codex group whose semantic they most match:
 *   - models, images   → app   (local client-side endpoint config)
 *   - permissions      → host  (agent runtime policy)
 *   - approvals        → host  (agent runtime policy)
 *   - apps             → host  (sits next to plugins / skills)
 *   - experimental     → host  (feature gates, adjacent to data-controls)
 */
export type SettingsSectionGroup = "app" | "host";

export const SETTINGS_SECTION_GROUP_HEADINGS: Record<SettingsSectionGroup, string | null> = {
  // Codex Desktop: settings.nav.heading.app defaultMessage "App"
  app: "App",
  // Codex Desktop: settings.nav.heading.host defaultMessage "Host"
  host: "Host",
};

export const SETTINGS_SECTIONS: Array<{
  id: SettingsPanelId;
  title: string;
  description: string;
  icon: SettingsSectionIcon;
  group: SettingsSectionGroup;
}> = [
  // === App group (Codex _e[0].slugs order, sans Codex-only `profile`;
  // HiCodex-only models/images inserted near the end before usage to stay
  // adjacent to general/appearance/connections client-side settings) ===
  // Codex Desktop label "General" (settings-shared-*.js: settings.nav.general-settings)
  { id: "general", title: "General", description: "Runtime and workspace", icon: "general", group: "app" },
  // Codex Desktop label "Appearance" (settings.nav.appearance) — no subtitle
  { id: "appearance", title: "Appearance", description: "", icon: "appearance", group: "app" },
  // Codex Desktop label "Appshots" (settings.nav.appshots) — no subtitle
  { id: "appshots", title: "Appshots", description: "", icon: "appshots", group: "app" },
  // Codex Desktop label "Connections" (settings.nav.connections) — no subtitle
  { id: "connections", title: "Connections", description: "", icon: "connections", group: "app" },
  // Codex Desktop label "Git" (settings.nav.git-settings) — no subtitle
  { id: "git-settings", title: "Git", description: "", icon: "git", group: "app" },
  // HiCodex-only: local model endpoint config — no Codex counterpart, lives in app
  { id: "models", title: "Models", description: "Provider and model profile", icon: "models", group: "app" },
  // HiCodex-only: local image generation endpoint — no Codex counterpart, lives in app
  { id: "images", title: "Images", description: "Image generation endpoint", icon: "images", group: "app" },
  // Codex Desktop label "Usage & billing" (settings.nav.usage) — no subtitle
  { id: "usage", title: "Usage & billing", description: "", icon: "usage", group: "app" },

  // === Host group (Codex _e[1].slugs order, with HiCodex-only items folded
  // into semantic-adjacent positions) ===
  // Codex Desktop label "Configuration" (settings.nav.agent) — no subtitle
  { id: "agent", title: "Configuration", description: "", icon: "agent", group: "host" },
  // Codex Desktop label "Personalization" (settings.nav.personalization) — no subtitle
  { id: "personalization", title: "Personalization", description: "", icon: "personalization", group: "host" },
  // Codex Desktop label "Keyboard shortcuts" (settings.nav.keyboard-shortcuts) — no subtitle
  { id: "keyboard-shortcuts", title: "Keyboard shortcuts", description: "", icon: "keyboard", group: "host" },
  // Codex Desktop label "MCP servers" with subtitle "Connect external tools and data sources."
  // (settings-shared-*.js subtitle for the mcp-settings case)
  { id: "mcp", title: "MCP servers", description: "Connect external tools and data sources.", icon: "mcp", group: "host" },
  // Codex Desktop label "Hooks" (settings.nav.hooks-settings) — no subtitle
  { id: "hooks", title: "Hooks", description: "", icon: "hooks", group: "host" },
  // Codex Desktop label "Plugins" (settings.nav.plugins-settings) — gated in Codex but always shown in HiCodex
  { id: "plugins", title: "Plugins", description: "", icon: "plugins", group: "host" },
  // Codex Desktop label "Skills" (settings.nav.skills-settings) — gated in Codex but always shown in HiCodex
  { id: "skills", title: "Skills", description: "", icon: "skills", group: "host" },
  // HiCodex-only: agent runtime policy — fits next to other agent-scope settings
  { id: "permissions", title: "Permissions", description: "Sandbox and access mode", icon: "permissions", group: "host" },
  // HiCodex-only: agent approval policy — same rationale as permissions
  { id: "approvals", title: "Approvals", description: "Current request policy", icon: "permissions", group: "host" },
  // HiCodex-only: connected apps — semantic neighbor to plugins/skills
  { id: "apps", title: "Apps", description: "Connected apps", icon: "apps", group: "host" },
  // Codex Desktop label "Browser" (settings.nav.browser-use) — no subtitle
  { id: "browser-use", title: "Browser", description: "", icon: "browser", group: "host" },
  // Codex Desktop label "Computer use" (settings.nav.computer-use) — no subtitle
  { id: "computer-use", title: "Computer use", description: "", icon: "computer", group: "host" },
  // Codex Desktop label "Environments" (settings.nav.local-environments) — no subtitle
  { id: "local-environments", title: "Environments", description: "", icon: "environments", group: "host" },
  // Codex Desktop label "Worktrees" (settings.nav.worktrees) — no subtitle
  { id: "worktrees", title: "Worktrees", description: "Local, worktree, cloud modes", icon: "worktrees", group: "host" },
  // HiCodex-only: feature gates — sits with other lifecycle / data settings near data-controls
  { id: "experimental", title: "Experimental", description: "Feature gates", icon: "experimental", group: "host" },
  // Codex Desktop label "Archived chats" (settings.nav.data-controls) — no subtitle (last in Codex _e order)
  { id: "data-controls", title: "Archived chats", description: "", icon: "archive", group: "host" },
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

/*
 * `keyboard-shortcuts` was previously routed through desktopBackedLocalSettingsEntries
 * as a "Desktop route" placeholder; it is now served by keyboardShortcutsSettingsEntries
 * below (CODEX-REF: keyboard-shortcuts-settings-*.js — read-only port of the
 * Codex Desktop 3-column command list). Rebind / key-capture / conflict detection
 * are NOT implemented here — Codex's panel allows in-place rebind via two host
 * bridges (codex-command-keymap-state, set-codex-command-keybinding) that HiCodex
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
 * rendering one section heading per group. HiCodex mirrors the same taxonomy
 * already used in components/keyboard-shortcuts-dialog.tsx so the Settings
 * panel and the ⌘⇧/ dialog stay visually consistent. Order of GROUP_TITLE
 * dictates section order; anything not in the list falls under "Other".
 */
const KEYBOARD_SHORTCUTS_GROUP_TITLE: ReadonlyArray<{ key: string; title: string }> = [
  { key: "thread", title: "Thread" },
  { key: "panels", title: "Panels" },
  { key: "navigation", title: "Navigation" },
  { key: "workspace", title: "Workspace" },
  { key: "skills", title: "Skills" },
  { key: "configure", title: "Configure" },
  { key: "app", title: "App" },
];

/*
 * CODEX-REF: keyboard-shortcuts-settings-*.js renders an editable 3-column
 * grid (Command / Keybinding / Actions) backed by two host bridges
 * (`codex-command-keymap-state` query, `set-codex-command-keybinding` mutation).
 * HiCodex ships a READ-ONLY port: one CommandPanelEntry per registered
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
      title: descriptor.title,
      kind: "status",
      status: accelerator ?? "—",
      meta: hasOverride ? "Custom" : (descriptor.description ?? undefined),
      groupKey,
      groupLabel: groupLabel(groupKey),
    };
  });
}

export function appearanceSettingsEntries(context: {
  uiTheme?: UiThemeSnapshot;
  uiAppearance?: UiAppearancePreferences;
}): CommandPanelEntry[] {
  const appearance = context.uiAppearance ?? DEFAULT_UI_APPEARANCE;
  return [
    projectThemeSettingsEntry(context.uiTheme ?? { mode: "system", resolved: "light" }),
    // CODEX-REF: appearance-settings-*.js — "Code font size" row
    // (id settings.general.appearance.codeFontSize.row, unit "px").
    projectCodeFontSizeSettingsEntry(appearance.codeFontSize),
    // CODEX-REF: appearance-settings-*.js — "Reduce motion" 3-way
    // toggle (id settings.general.appearance.reducedMotion.label).
    projectReducedMotionSettingsEntry(appearance.reducedMotion),
  ];
}

/*
 * CODEX-REF: appearance-settings-*.js. Codex Desktop renders a
 * number input bound to client config `codeFontSize` (range 8-24, unit "px",
 * onBlur commit). HiCodex exposes the value via the status field and uses
 * +/- secondaryActions to step the size by 1px — that maps to the same
 * `setCodeFontSize` action HiCodex dispatches via the command-panel pipeline.
 */
export function projectCodeFontSizeSettingsEntry(size: number): CommandPanelEntry {
  const clamped = clampCodeFontSize(size);
  const decrement = clamped > CODE_FONT_SIZE_MIN ? clamped - CODE_FONT_SIZE_STEP : null;
  const increment = clamped < CODE_FONT_SIZE_MAX ? clamped + CODE_FONT_SIZE_STEP : null;
  return {
    id: "settings:code-font-size",
    title: "Code font size",
    kind: "status",
    // CODEX-REF: settings.general.appearance.codeFontSize.units defaultMessage "px"
    status: `${clamped} px`,
    meta: `Range ${CODE_FONT_SIZE_MIN}-${CODE_FONT_SIZE_MAX} px`,
    details: [
      "Sets `--codex-chat-code-font-size` on the document root.",
      "Local shell preference; does not require app-server refresh.",
    ],
    secondaryActions: [
      ...(decrement !== null ? [{
        id: `code-font-size:${decrement}`,
        label: "−",
        title: `Use ${decrement} px code font`,
        action: {
          type: "setCodeFontSize" as const,
          title: `Use ${decrement} px code font`,
          size: decrement,
        },
      }] : []),
      ...(increment !== null ? [{
        id: `code-font-size:${increment}`,
        label: "+",
        title: `Use ${increment} px code font`,
        action: {
          type: "setCodeFontSize" as const,
          title: `Use ${increment} px code font`,
          size: increment,
        },
      }] : []),
    ],
  };
}

/*
 * CODEX-REF: appearance-settings-*.js. Codex Desktop renders a
 * segmented control with three buttons whose labels resolve from
 *   settings.general.appearance.reducedMotion.{system,on,off}
 * Default option is `system`; mode strings match the message IDs.
 */
export function projectReducedMotionSettingsEntry(mode: ReducedMotionMode): CommandPanelEntry {
  return {
    id: "settings:reduced-motion",
    title: "Reduce motion",
    kind: "status",
    status: reducedMotionLabel(mode),
    meta: "Saved locally",
    details: [
      reducedMotionDescription(mode),
      "Applies via the `data-hc-reduce-motion` attribute on the document root.",
    ],
    secondaryActions: REDUCED_MOTION_MODES
      .filter((nextMode) => nextMode !== mode)
      .map((nextMode) => ({
        id: `reduced-motion:${nextMode}`,
        label: reducedMotionLabel(nextMode),
        title: `Use ${reducedMotionLabel(nextMode).toLowerCase()} reduced motion`,
        action: {
          type: "setReducedMotion" as const,
          title: `Use ${reducedMotionLabel(nextMode).toLowerCase()} reduced motion`,
          mode: nextMode,
        },
      })),
  };
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
