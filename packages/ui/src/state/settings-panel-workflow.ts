import type { CommandPanelEntry, CommandPanelKind } from "./command-panel";
import type { SettingsPanelId } from "./composer-workflow";
import { HICODEX_IMAGE_TOOL_NAME } from "./image-generation-tool";
import { projectPermissionModeCommandEntries } from "./permissions-mode";

export const SETTINGS_SECTIONS: Array<{
  id: SettingsPanelId;
  title: string;
  description: string;
  icon: "general" | "models" | "images" | "permissions" | "mcp" | "skills" | "hooks" | "apps" | "plugins" | "experimental";
}> = [
  { id: "general", title: "General", description: "Runtime and workspace", icon: "general" },
  { id: "models", title: "Models", description: "Provider and model profile", icon: "models" },
  { id: "images", title: "Images", description: "Image generation endpoint", icon: "images" },
  { id: "permissions", title: "Permissions", description: "Sandbox and access mode", icon: "permissions" },
  { id: "approvals", title: "Approvals", description: "Current request policy", icon: "permissions" },
  { id: "mcp", title: "MCP", description: "Servers, tools, resources", icon: "mcp" },
  { id: "skills", title: "Skills", description: "Attach, view, enable, disable", icon: "skills" },
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
  if (panel === "permissions") {
    return [
      ...projectPermissionModeCommandEntries(context.threadContextDefaults),
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
      meta: "Configured for new thread requests",
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
  workspace: string;
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
  ];
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
  return "custom";
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

function capabilityLabel(value: boolean | undefined): string {
  if (value === true) return "available";
  if (value === false) return "unavailable";
  return "unknown";
}
