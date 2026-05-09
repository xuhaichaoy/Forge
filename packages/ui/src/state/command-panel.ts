import { formatUnknown } from "../lib/format";

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
  | "mcpTool"
  | "skill"
  | "hook"
  | "app"
  | "plugin"
  | "experimentalFeature"
  | "collaborationMode"
  | "status"
  | "diff";

export type CommandPanelEntryAction =
  | { type: "attachMention"; name: string; path: string }
  | { type: "attachSkill"; name: string; path: string }
  | { type: "callMcpTool"; server: string; tool: string; arguments: Record<string, never> };

export type CommandPanelStatus = "idle" | "loading" | "ready" | "empty" | "error";

export interface CommandPanelEntry {
  id: string;
  title: string;
  kind: CommandPanelEntryKind;
  status?: string;
  meta?: string;
  details?: string[];
  disabled?: boolean;
  action?: CommandPanelEntryAction;
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
  return responseItems(value).flatMap((server, index) => {
    const name = fieldText(server, "name") || `server-${index + 1}`;
    const tools = recordField(server, "tools");
    const toolDetails = Object.entries(tools)
      .map(([toolName, tool]) => {
        const description = fieldText(tool, "description");
        return description ? `${toolName} - ${description}` : toolName;
      });

    const serverEntry: CommandPanelEntry = {
      id: `mcp:${name}`,
      title: name,
      kind: "mcpServer",
      status: mcpAuthStatus(server),
      meta: countLabel(toolDetails.length, "tool", "No tools"),
      details: toolDetails,
    };
    return [
      serverEntry,
      ...Object.entries(tools).map(([toolName, tool]) => mcpToolEntry(name, toolName, tool)),
    ];
  });
}

export function projectMcpToolCallResultEntries(
  server: string,
  tool: string,
  value: unknown,
): CommandPanelEntry[] {
  const record = isRecord(value) ? value : {};
  const content = Array.isArray(record.content) ? record.content : [];
  const structuredContent = record.structuredContent ?? record.structured_content;
  const isError = record.isError === true || record.is_error === true;
  const entries = content.map((item, index) => ({
    id: `mcp-result:${server}:${tool}:content:${index}`,
    title: mcpResultTitle(item, index),
    kind: "status" as const,
    status: isError ? "error" : "completed",
    meta: `${server}:${tool}`,
    details: textDetails(mcpResultText(item)),
  }));

  if (structuredContent !== undefined && structuredContent !== null) {
    entries.push({
      id: `mcp-result:${server}:${tool}:structured`,
      title: "Structured content",
      kind: "status",
      status: isError ? "error" : "completed",
      meta: `${server}:${tool}`,
      details: textDetails(formatUnknown(structuredContent)),
    });
  }

  if (entries.length > 0) return entries;
  return [{
    id: `mcp-result:${server}:${tool}:empty`,
    title: isError ? "Tool returned an error" : "Tool completed",
    kind: "status",
    status: isError ? "error" : "completed",
    meta: `${server}:${tool}`,
    details: textDetails(formatUnknown(value)),
  }];
}

function mcpToolEntry(serverName: string, toolName: string, tool: unknown): CommandPanelEntry {
  const title = fieldText(tool, "title") || toolName;
  const description = fieldText(tool, "description");
  const required = mcpToolRequiredArguments(tool);
  const canCallWithoutArguments = required.length === 0;
  return {
    id: `mcp-tool:${serverName}:${toolName}`,
    title,
    kind: "mcpTool",
    status: canCallWithoutArguments ? "callable" : "needs input",
    meta: `${serverName}:${toolName}`,
    details: cleanList([
      description,
      required.length > 0 ? `Required: ${required.join(", ")}` : "Click to call with empty arguments.",
    ]),
    disabled: !canCallWithoutArguments,
    action: canCallWithoutArguments ? { type: "callMcpTool", server: serverName, tool: toolName, arguments: {} } : undefined,
  };
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
      return [
        ...arrayField(item, "skills").map((skill) => skillEntry(skill, cwd)),
        ...arrayField(item, "errors").map((error) => skillErrorEntry(error, cwd)),
      ];
    }
    return [skillEntry(item)];
  });
}

function mcpToolRequiredArguments(tool: unknown): string[] {
  const schema = recordField(tool, "inputSchema");
  const required = schema.required;
  return Array.isArray(required)
    ? required.filter((item): item is string => typeof item === "string" && item.trim().length > 0)
    : [];
}

function mcpResultTitle(value: unknown, index: number): string {
  if (!isRecord(value)) return `Result ${index + 1}`;
  const type = fieldText(value, "type");
  if (type === "text") return `Text result ${index + 1}`;
  if (type === "image") return `Image result ${index + 1}`;
  if (type === "resource") return `Resource result ${index + 1}`;
  return `Result ${index + 1}`;
}

function mcpResultText(value: unknown): string {
  if (!isRecord(value)) return formatUnknown(value);
  const text = fieldText(value, "text");
  if (text) return text;
  const data = fieldText(value, "data");
  if (data) return data;
  const uri = fieldText(value, "uri");
  if (uri) return uri;
  return formatUnknown(value);
}

function textDetails(value: string): string[] {
  return value
    .split(/\r?\n/)
    .map((line) => line.trimEnd())
    .filter(Boolean)
    .slice(0, 8);
}

function skillEntry(skill: Record<string, unknown>, cwd = ""): CommandPanelEntry {
  const name = fieldText(skill, "name") || fieldText(skill, "path") || "skill";
  const interfaceInfo = recordField(skill, "interface");
  const path = fieldText(skill, "path");
  const scope = fieldText(skill, "scope");
  const defaultPrompt = fieldText(interfaceInfo, "defaultPrompt");
  const dependencies = arrayField(recordField(skill, "dependencies"), "tools")
    .map((dependency) => fieldText(dependency, "value") || fieldText(dependency, "type"))
    .filter(Boolean);
  const hasEnabled = Object.prototype.hasOwnProperty.call(skill, "enabled");
  return {
    id: `skill:${name}`,
    title: fieldText(interfaceInfo, "displayName") || name,
    kind: "skill",
    status: hasEnabled ? booleanField(skill, "enabled") ? "enabled" : "disabled" : undefined,
    meta: cleanList([skillScopeLabel(scope), path || cwd]).join(" · ") || undefined,
    details: cleanList([
      fieldText(interfaceInfo, "shortDescription")
        || fieldText(skill, "shortDescription")
        || fieldText(skill, "description"),
      defaultPrompt && `Default prompt: ${firstLine(defaultPrompt)}`,
      dependencies.length > 0 && `Tools: ${dependencies.join(", ")}`,
      path && `Path: ${path}`,
      cwd && `CWD: ${cwd}`,
    ]),
    action: path ? { type: "attachSkill", name, path } : undefined,
  };
}

function skillErrorEntry(error: Record<string, unknown>, cwd = ""): CommandPanelEntry {
  const path = fieldText(error, "path");
  return {
    id: `skill-error:${path || cwd || "unknown"}`,
    title: path ? inferNameFromPath(path) : "Skill load error",
    kind: "skill",
    status: "error",
    meta: path || cwd || undefined,
    details: cleanList([fieldText(error, "message")]),
    disabled: true,
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

function firstLine(value: string): string {
  const line = value.trim().split(/\r?\n/, 1)[0] ?? "";
  return line.length > 72 ? `${line.slice(0, 69)}...` : line;
}

function inferNameFromPath(path: string): string {
  const trimmed = path.trim().replace(/\/+$/, "");
  return trimmed.split(/[\\/]/).filter(Boolean).pop() || trimmed || "skill";
}

function skillScopeLabel(scope: string): string {
  switch (scope) {
    case "system":
      return "System";
    case "repo":
      return "Repo";
    case "user":
      return "User";
    case "admin":
      return "Admin";
    default:
      return "";
  }
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
