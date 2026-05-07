export type CommandPanelKind =
  | "mcp"
  | "skills"
  | "hooks"
  | "apps"
  | "plugins"
  | "experimental"
  | "collaboration"
  | "status"
  | "diff"
  | "generic";

export type CommandPanelEntryKind =
  | "mcpServer"
  | "skill"
  | "hook"
  | "app"
  | "plugin"
  | "experimentalFeature"
  | "collaborationMode"
  | "status"
  | "diff";

export type CommandPanelStatus = "idle" | "loading" | "ready" | "empty" | "error";

export interface CommandPanelEntry {
  id: string;
  title: string;
  kind: CommandPanelEntryKind;
  status?: string;
  meta?: string;
  details?: string[];
}

export interface CommandPanelState {
  panel: CommandPanelKind;
  status: CommandPanelStatus;
  title: string;
  entries: CommandPanelEntry[];
  message: string;
}

export interface CommandPanelOptions {
  status?: CommandPanelStatus;
  entries?: CommandPanelEntry[];
  error?: string;
  message?: string;
  title?: string;
}

export function createCommandPanelState(
  panel: CommandPanelKind,
  options: CommandPanelOptions = {},
): CommandPanelState {
  const entries = options.entries ?? [];
  const requestedStatus = options.status ?? "idle";
  const status = requestedStatus === "ready" && entries.length === 0 ? "empty" : requestedStatus;
  return {
    panel,
    status,
    title: options.title ?? panelTitle(panel),
    entries,
    message: options.message ?? panelMessage(panel, status, options.error),
  };
}

export function projectCommandPanelEntries(value: {
  mcp?: unknown;
  skills?: unknown;
  hooks?: unknown;
  apps?: unknown;
  plugins?: unknown;
  experimental?: unknown;
  collaboration?: unknown;
}): CommandPanelEntry[] {
  return [
    ...projectMcpServerEntries(value.mcp),
    ...projectSkillEntries(value.skills),
    ...projectHookEntries(value.hooks),
    ...projectAppEntries(value.apps),
    ...projectPluginEntries(value.plugins),
    ...projectExperimentalFeatureEntries(value.experimental),
    ...projectCollaborationModeEntries(value.collaboration),
  ];
}

export function projectMcpServerEntries(value: unknown): CommandPanelEntry[] {
  return responseItems(value).map((server, index) => {
    const name = fieldText(server, "name") || `server-${index + 1}`;
    const tools = recordField(server, "tools");
    const toolDetails = Object.entries(tools)
      .map(([toolName, tool]) => {
        const description = fieldText(tool, "description");
        return description ? `${toolName} - ${description}` : toolName;
      });

    return {
      id: `mcp:${name}`,
      title: name,
      kind: "mcpServer",
      status: mcpAuthStatus(server),
      meta: countLabel(toolDetails.length, "tool", "No tools"),
      details: toolDetails,
    };
  });
}

export function projectPluginEntries(value: unknown): CommandPanelEntry[] {
  return arrayField(value, "marketplaces").flatMap((marketplace) => {
    const marketplaceName = fieldText(marketplace, "name") || "Unknown marketplace";
    return arrayField(marketplace, "plugins").map((plugin, index) => {
      const pluginId = fieldText(plugin, "id") || fieldText(plugin, "name") || `plugin-${index + 1}`;
      const title = fieldText(plugin, "name") || pluginId;
      return {
        id: `plugin:${pluginId}`,
        title,
        kind: "plugin",
        status: pluginStatus(plugin),
        meta: marketplaceName,
        details: cleanList([
          fieldText(plugin, "availability") && `Availability: ${fieldText(plugin, "availability")}`,
          fieldText(plugin, "installPolicy") && `Install: ${fieldText(plugin, "installPolicy")}`,
          fieldText(plugin, "authPolicy") && `Auth: ${fieldText(plugin, "authPolicy")}`,
        ]),
      };
    });
  });
}

function projectSkillEntries(value: unknown): CommandPanelEntry[] {
  return responseItems(value).flatMap((item) => {
    if (Array.isArray(item.skills)) {
      const cwd = fieldText(item, "cwd");
      return arrayField(item, "skills").map((skill) => skillEntry(skill, cwd));
    }
    return [skillEntry(item)];
  });
}

function skillEntry(skill: Record<string, unknown>, cwd = ""): CommandPanelEntry {
  const name = fieldText(skill, "name") || fieldText(skill, "path") || "skill";
  const path = fieldText(skill, "path");
  return {
    id: `skill:${name}`,
    title: name,
    kind: "skill",
    status: booleanField(skill, "enabled") ? "enabled" : undefined,
    meta: path || cwd || undefined,
    details: cleanList([
      fieldText(skill, "description"),
      path && `Path: ${path}`,
      cwd && `CWD: ${cwd}`,
    ]),
  };
}

function projectHookEntries(value: unknown): CommandPanelEntry[] {
  return responseItems(value).flatMap((item) => {
    if (Array.isArray(item.hooks)) {
      const cwd = fieldText(item, "cwd");
      return arrayField(item, "hooks").map((hook) => hookEntry(hook, cwd));
    }
    return [hookEntry(item)];
  });
}

function hookEntry(hook: Record<string, unknown>, cwd = ""): CommandPanelEntry {
  const key = fieldText(hook, "key") || "hook";
  return {
    id: `hook:${key}`,
    title: key,
    kind: "hook",
    status: booleanField(hook, "enabled") ? "enabled" : undefined,
    meta: fieldText(hook, "eventName") || undefined,
    details: cleanList([
      fieldText(hook, "matcher") && `Matcher: ${fieldText(hook, "matcher")}`,
      fieldText(hook, "command") && `Command: ${fieldText(hook, "command")}`,
      cwd && `CWD: ${cwd}`,
    ]),
  };
}

function projectAppEntries(value: unknown): CommandPanelEntry[] {
  return responseItems(value).map((app, index) => {
    const name = fieldText(app, "name") || fieldText(app, "id") || `app-${index + 1}`;
    const title = fieldText(app, "title") || name;
    const plugins = stringArrayField(app, "pluginDisplayNames");
    return {
      id: `app:${name}`,
      title,
      kind: "app",
      status: booleanField(app, "isEnabled") ? "enabled" : undefined,
      meta: name,
      details: cleanList([
        fieldText(app, "description"),
        plugins.length ? `Plugins: ${plugins.join(", ")}` : "",
      ]),
    };
  });
}

function projectExperimentalFeatureEntries(value: unknown): CommandPanelEntry[] {
  return responseItems(value).map((feature, index) => {
    const name = fieldText(feature, "name") || `feature-${index + 1}`;
    return {
      id: `experimental:${name}`,
      title: fieldText(feature, "displayName") || name,
      kind: "experimentalFeature",
      status: booleanField(feature, "enabled") ? "enabled" : "disabled",
      meta: fieldText(feature, "stage") || undefined,
      details: cleanList([fieldText(feature, "description"), fieldText(feature, "announcement")]),
    };
  });
}

function projectCollaborationModeEntries(value: unknown): CommandPanelEntry[] {
  return responseItems(value).map((mode, index) => {
    const name = fieldText(mode, "name") || `mode-${index + 1}`;
    return {
      id: `collaboration:${name}`,
      title: name,
      kind: "collaborationMode",
      meta: fieldText(mode, "mode") || undefined,
      details: cleanList([
        fieldText(mode, "model") && `Model: ${fieldText(mode, "model")}`,
        fieldText(mode, "reasoning_effort") && `Reasoning: ${fieldText(mode, "reasoning_effort")}`,
      ]),
    };
  });
}

function mcpAuthStatus(server: Record<string, unknown>): string {
  const authStatus = fieldText(server, "authStatus");
  if (authStatus) return authStatus;
  const auth = recordField(server, "auth");
  return fieldText(auth, "status") || fieldText(server, "authMode") || "unknown";
}

function pluginStatus(plugin: Record<string, unknown>): string | undefined {
  if (booleanField(plugin, "installed")) {
    return booleanField(plugin, "enabled") ? "enabled" : "installed";
  }
  return fieldText(plugin, "availability") || undefined;
}

function responseItems(value: unknown): Record<string, unknown>[] {
  if (Array.isArray(value)) return value.filter(isRecord);
  if (!isRecord(value)) return [];
  if (Array.isArray(value.data)) return value.data.filter(isRecord);
  return [];
}

function arrayField(value: unknown, key: string): Record<string, unknown>[] {
  if (!isRecord(value)) return [];
  const field = value[key];
  return Array.isArray(field) ? field.filter(isRecord) : [];
}

function stringArrayField(value: unknown, key: string): string[] {
  if (!isRecord(value)) return [];
  const field = value[key];
  return Array.isArray(field)
    ? field.map((item) => typeof item === "string" ? item.trim() : "").filter(Boolean)
    : [];
}

function recordField(value: unknown, key: string): Record<string, unknown> {
  if (!isRecord(value)) return {};
  const field = value[key];
  return isRecord(field) ? field : {};
}

function fieldText(value: unknown, key: string): string {
  if (!isRecord(value)) return "";
  const field = value[key];
  if (typeof field === "string") return field.trim();
  if (typeof field === "number" || typeof field === "boolean" || typeof field === "bigint") return String(field);
  return "";
}

function booleanField(value: unknown, key: string): boolean {
  return isRecord(value) && value[key] === true;
}

function cleanList(values: Array<string | false | null | undefined>): string[] {
  return values.filter((value): value is string => typeof value === "string" && value.trim().length > 0);
}

function countLabel(count: number, singular: string, empty: string): string {
  if (count === 0) return empty;
  return `${count} ${count === 1 ? singular : `${singular}s`}`;
}

function panelTitle(panel: CommandPanelKind): string {
  switch (panel) {
    case "mcp":
      return "MCP servers";
    case "skills":
      return "Skills";
    case "hooks":
      return "Hooks";
    case "apps":
      return "Apps";
    case "plugins":
      return "Plugins";
    case "experimental":
      return "Experimental features";
    case "collaboration":
      return "Collaboration modes";
    case "status":
      return "Status";
    case "diff":
      return "Diff";
    default:
      return "Command";
  }
}

function panelMessage(panel: CommandPanelKind, status: CommandPanelStatus, error?: string): string {
  if (status === "error") return error || `${panelTitle(panel)} failed.`;
  if (status === "loading") return `Loading ${panelTitle(panel)}...`;
  if (status === "empty") return `No ${panelTitle(panel).toLowerCase()} found.`;
  return "";
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}
