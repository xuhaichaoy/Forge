import { formatUnknown } from "../lib/format";
import {
  mcpToolRequiredArguments,
  projectMcpToolArgumentFields,
  type McpToolArgumentField,
} from "./mcp-tool-arguments";
import type { HiCodexLocale } from "./i18n";
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
  | {
      type: "installPlugin";
      title: string;
      pluginId: string;
      pluginName: string;
      marketplaceName: string;
      marketplacePath?: string | null;
      remotePluginId?: string | null;
    }
  | { type: "uninstallPlugin"; title: string; pluginId: string }
  | { type: "writePluginConfig"; title: string; pluginId: string; enabled: boolean; configWriteTarget?: ConfigWriteTarget }
  | { type: "checkoutPluginShare"; title: string; remotePluginId: string; pluginName: string }
  | { type: "setThreadMemoryMode"; title: string; threadId: string; mode: "enabled" | "disabled" }
  | { type: "setUiTheme"; title: string; mode: UiThemeMode }
  | { type: "setUiLocale"; title: string; locale: HiCodexLocale }
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
  status?: string;
  meta?: string;
  details?: string[];
  disabled?: boolean;
  action?: CommandPanelEntryAction;
  secondaryActions?: CommandPanelSecondaryAction[];
}

export interface CommandPanelState {
  panel: CommandPanelKind;
  status: CommandPanelStatus;
  title: string;
  entries: CommandPanelEntry[];
  message: string;
}

const CONNECTOR_REFRESH_GUIDANCE = "Finish the browser flow, then refresh Apps or Plugins.";
const CONNECTOR_PROTOCOL_LIMITED_DETAIL =
  "Protocol-limited: app-server returned app/list metadata only; no native connector OAuth method or browser setup URL is available.";
const STARTER_SKILL_NAME = "starter-skill";

export interface CommandPanelOptions {
  status?: CommandPanelStatus;
  entries?: CommandPanelEntry[];
  error?: string;
  message?: string;
  title?: string;
}

export interface FileSearchResult {
  path?: string;
  file_name?: string;
  score?: number;
  match_type?: string;
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
    ...projectPluginEntries(value.plugins, { apps: value.apps }),
    ...projectExperimentalFeatureEntries(value.experimental),
    ...projectCollaborationModeEntries(value.collaboration),
  ];
}

export function projectFileSearchEntries(result: { files?: FileSearchResult[] }): CommandPanelEntry[] {
  return (result.files ?? []).slice(0, 25).map((file, index) => ({
    id: `file:${file.path ?? file.file_name ?? index}`,
    title: file.file_name || file.path || "file",
    kind: "file",
    status: file.match_type,
    meta: file.path,
    details: [`score: ${file.score ?? "unknown"}`],
    action: file.path
      ? {
          type: "attachMention",
          name: file.file_name || file.path,
          path: file.path,
        }
      : undefined,
  }));
}

export function projectSkillManagementEntries(
  skills: unknown,
  options: {
    recommendedSkills?: unknown;
    workspace?: string;
  } = {},
): CommandPanelEntry[] {
  return [
    ...projectSkillEntries(skills),
    ...projectRecommendedSkillEntries(options.recommendedSkills, {
      existingSkills: skills,
    }),
    skillCreatorEntry(options.workspace),
  ];
}

export function projectMcpServerEntries(value: unknown): CommandPanelEntry[] {
  return responseItems(value).flatMap((server, index) => {
    const name = fieldText(server, "name") || `server-${index + 1}`;
    const tools = recordField(server, "tools");
    const resources = arrayField(server, "resources");
    const templates = arrayField(server, "resourceTemplates");
    const toolDetails = Object.entries(tools)
      .map(([toolName, tool]) => {
        const description = fieldText(tool, "description");
        return description ? `${toolName} - ${description}` : toolName;
      });
    const resourceDetails = resources.map((resource) => {
      const title = fieldText(resource, "title") || fieldText(resource, "name") || fieldText(resource, "uri");
      const uri = fieldText(resource, "uri");
      return title && uri && title !== uri ? `${title} - ${uri}` : title || uri;
    }).filter(Boolean);
    const templateDetails = templates.map((template) => {
      const title = fieldText(template, "title") || fieldText(template, "name") || fieldText(template, "uriTemplate");
      const uriTemplate = fieldText(template, "uriTemplate");
      return title && uriTemplate && title !== uriTemplate ? `${title} - ${uriTemplate}` : title || uriTemplate;
    }).filter(Boolean);

    const authStatus = mcpAuthStatus(server);
    const serverEntry: CommandPanelEntry = {
      id: `mcp:${name}`,
      title: name,
      kind: "mcpServer",
      status: authStatus,
      meta: mcpServerMeta(toolDetails.length, resourceDetails.length, templateDetails.length),
      details: [
        ...toolDetails,
        ...resourceDetails.map((detail) => `Resource: ${detail}`),
        ...templateDetails.map((detail) => `Template: ${detail}`),
      ],
      secondaryActions: cleanSecondaryActions([
        mcpAuthStatusNeedsLogin(authStatus) ? {
          id: `mcp:${name}:login`,
          label: "Authenticate",
          title: `Authenticate ${name}`,
          tone: "success",
          action: { type: "loginMcpServer", server: name, title: `Authenticate ${name}` },
        } : undefined,
        {
          id: `mcp:${name}:reload`,
          label: "Reload",
          title: "Reload MCP config",
          action: { type: "reloadMcpServers", title: "Reload MCP config" },
        },
      ]),
    };
    return [
      serverEntry,
      ...Object.entries(tools).map(([toolName, tool]) => mcpToolEntry(name, toolName, tool)),
      ...resources.map((resource, resourceIndex) => mcpResourceEntry(name, resource, resourceIndex)),
      ...templates.map((template, templateIndex) => mcpResourceTemplateEntry(name, template, templateIndex)),
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

export function projectMcpResourceReadResultEntries(
  server: string,
  uri: string,
  value: unknown,
): CommandPanelEntry[] {
  const contents = arrayField(value, "contents");
  if (contents.length === 0) {
    return [{
      id: `mcp-resource-result:${server}:${uri}:empty`,
      title: "Resource returned no content",
      kind: "status",
      status: "empty",
      meta: `${server} · ${uri}`,
      details: textDetails(formatUnknown(value)),
    }];
  }
  return contents.map((content, index) => ({
    id: `mcp-resource-result:${server}:${uri}:${index}`,
    title: mcpResourceContentTitle(content, index),
    kind: "status" as const,
    status: "read",
    meta: cleanList([server, fieldText(content, "mimeType") || fieldText(content, "mime_type")]).join(" · "),
    details: mcpResourceContentDetails(content),
  }));
}

export function projectSkillFileReadResultEntries(path: string, contents: string): CommandPanelEntry[] {
  return [{
    id: `skill-file:${path}`,
    title: inferNameFromPath(path),
    kind: "status",
    status: "read",
    meta: path,
    details: textDetails(contents),
  }];
}

export function projectPluginSkillReadResultEntries(
  skillName: string,
  source: string,
  contents: string | null | undefined,
): CommandPanelEntry[] {
  return [{
    id: `plugin-skill-file:${source}:${skillName}`,
    title: skillName || "Plugin skill",
    kind: "status",
    status: contents ? "read" : "empty",
    meta: source,
    details: contents ? textDetails(contents) : ["plugin/skill/read returned no source contents."],
  }];
}

function mcpToolEntry(serverName: string, toolName: string, tool: unknown): CommandPanelEntry {
  const title = fieldText(tool, "title") || toolName;
  const description = fieldText(tool, "description");
  const fields = projectMcpToolArgumentFields(tool);
  const required = mcpToolRequiredArguments(tool);
  const optional = fields.filter((field) => !field.required).map((field) => field.name);
  const canCallWithoutArguments = fields.length === 0;
  return {
    id: `mcp-tool:${serverName}:${toolName}`,
    title,
    kind: "mcpTool",
    status: canCallWithoutArguments ? "callable" : required.length > 0 ? "needs input" : "configure",
    meta: `${serverName}:${toolName}`,
    details: cleanList([
      description,
      required.length > 0 ? `Required: ${required.join(", ")}` : undefined,
      optional.length > 0 ? `Optional: ${optional.join(", ")}` : undefined,
      canCallWithoutArguments ? "Click to call with empty arguments." : "Click to enter arguments.",
    ]),
    action: canCallWithoutArguments
      ? { type: "callMcpTool", server: serverName, tool: toolName, arguments: {} }
      : { type: "openMcpToolForm", server: serverName, tool: toolName, title, description, fields },
  };
}

function mcpResourceEntry(serverName: string, resource: Record<string, unknown>, index: number): CommandPanelEntry {
  const uri = fieldText(resource, "uri");
  const title = fieldText(resource, "title") || fieldText(resource, "name") || uri || `resource-${index + 1}`;
  const mime = fieldText(resource, "mimeType") || fieldText(resource, "mime_type");
  return {
    id: `mcp-resource:${serverName}:${uri || index}`,
    title,
    kind: "mcpResource",
    status: "resource",
    meta: cleanList([serverName, mime]).join(" · ") || undefined,
    details: cleanList([
      fieldText(resource, "description"),
      uri && `URI: ${uri}`,
      numberField(resource, "size") !== null && `Size: ${numberField(resource, "size")} bytes`,
    ]),
    disabled: uri ? undefined : true,
    action: uri ? { type: "readMcpResource", server: serverName, uri, title } : undefined,
  };
}

function mcpResourceTemplateEntry(
  serverName: string,
  template: Record<string, unknown>,
  index: number,
): CommandPanelEntry {
  const uriTemplate = fieldText(template, "uriTemplate") || fieldText(template, "uri_template");
  const title = fieldText(template, "title") || fieldText(template, "name") || uriTemplate || `template-${index + 1}`;
  const mime = fieldText(template, "mimeType") || fieldText(template, "mime_type");
  return {
    id: `mcp-resource-template:${serverName}:${uriTemplate || index}`,
    title,
    kind: "mcpResourceTemplate",
    status: "template",
    meta: cleanList([serverName, mime]).join(" · ") || undefined,
    details: cleanList([
      fieldText(template, "description"),
      uriTemplate && `Template: ${uriTemplate}`,
    ]),
    disabled: true,
  };
}

export function projectPluginEntries(
  value: unknown,
  options: {
    additionalLists?: unknown[];
    apps?: unknown;
    installed?: unknown;
    shares?: unknown;
  } = {},
): CommandPanelEntry[] {
  const connectorApps = responseItems(options.apps);
  const contexts = [
    ...pluginProjectionContexts(value, "marketplace"),
    ...(options.additionalLists ?? []).flatMap((list) => pluginProjectionContexts(list, "marketplace")),
    ...pluginProjectionContexts(options.installed, "installed"),
    ...pluginShareProjectionContexts(options.shares),
  ];
  const mergedContexts = new Map<string, PluginProjectionContext>();
  for (const context of contexts) {
    const key = pluginProjectionKey(context);
    const current = mergedContexts.get(key);
    mergedContexts.set(key, current ? mergePluginProjectionContext(current, context) : context);
  }

  return Array.from(mergedContexts.values()).map((context, index) =>
    pluginEntryFromProjectionContext(context, connectorApps, index)
  );
}

export function projectRequiredAppEntries(
  apps: unknown,
  waitingAppIds: ReadonlySet<string> = new Set(),
): CommandPanelEntry[] {
  return responseItems(apps).map((app, index) => {
    const { appId, appName, title } = appIdentity(app, index);
    const installUrl = appInstallUrl(app);
    const needsAuth = booleanField(app, "needsAuth");
    const waiting = waitingAppIds.has(appId);
    const action: CommandPanelEntryAction | undefined = installUrl
      ? { type: "connectRequiredApp", title: `Connect ${title}`, appId, appName: title, installUrl }
      : undefined;
    return {
      id: `required-app:${appId}`,
      title,
      kind: "app",
      status: waiting ? "waiting for refresh" : installUrl ? "auth required" : "protocol-limited",
      meta: "Required app",
      details: cleanList([
        fieldText(app, "description"),
        needsAuth ? "Auth: ChatGPT connector authorization required" : "Auth: required before this plugin is ready",
        installUrl ? "Install: browser setup URL available" : CONNECTOR_PROTOCOL_LIMITED_DETAIL,
        waiting ? CONNECTOR_REFRESH_GUIDANCE : "",
      ]),
      disabled: action ? undefined : true,
      action,
      secondaryActions: action ? [{
        id: `required-app:${appId}:connect`,
        label: waiting ? "Open again" : "Connect",
        title: `Open ${title} connect flow`,
        tone: waiting ? "default" : "success",
        action,
      }] : undefined,
    };
  });
}

type PluginProjectionSource = "marketplace" | "installed" | "shared";

interface PluginProjectionContext {
  featured: boolean;
  localPluginPath: string | null;
  marketplaceName: string;
  marketplacePath: string | null;
  marketplaceTitle: string;
  plugin: Record<string, unknown>;
  source: PluginProjectionSource;
}

function pluginProjectionContexts(
  value: unknown,
  source: PluginProjectionSource,
): PluginProjectionContext[] {
  const root = isRecord(value) ? value : {};
  const featured = new Set(stringArrayField(root, "featuredPluginIds"));
  return arrayField(value, "marketplaces").flatMap((marketplace) => {
    const marketplaceName = fieldText(marketplace, "name") || "Unknown marketplace";
    const marketplacePath = fieldText(marketplace, "path") || null;
    const marketplaceTitle = fieldText(recordField(marketplace, "interface"), "displayName") || marketplaceName;
    return arrayField(marketplace, "plugins").map((plugin) => ({
      featured: pluginIdentityCandidates(plugin).some((candidate) => featured.has(candidate)),
      localPluginPath: null,
      marketplaceName,
      marketplacePath,
      marketplaceTitle,
      plugin,
      source,
    }));
  });
}

function pluginShareProjectionContexts(value: unknown): PluginProjectionContext[] {
  return responseItems(value).map((item): PluginProjectionContext => {
    const plugin = { ...recordField(item, "plugin") };
    const localPluginPath = fieldText(item, "localPluginPath") || null;
    if (localPluginPath && !Object.prototype.hasOwnProperty.call(plugin, "installed")) {
      plugin.installed = true;
    }
    return {
      featured: false,
      localPluginPath,
      marketplaceName: "Shared plugins",
      marketplacePath: null,
      marketplaceTitle: "Shared plugins",
      plugin,
      source: "shared",
    };
  }).filter((context) => Object.keys(context.plugin).length > 0);
}

function pluginEntryFromProjectionContext(
  context: PluginProjectionContext,
  connectorApps: Record<string, unknown>[],
  index: number,
): CommandPanelEntry {
  const connectorApp = findConnectorAppForPlugin(context.plugin, connectorApps);
  const connectorAppId = connectorApp ? appIdentity(connectorApp, index).appId : "";
  const connectorState = connectorApp ? appListState(connectorApp) : null;
  const effectivePlugin = connectorApp
    ? {
        ...context.plugin,
        installed: connectorState?.accessible ?? false,
        enabled: connectorState?.enabled ?? false,
      }
    : context.plugin;
  const pluginId = fieldText(effectivePlugin, "id")
    || fieldText(effectivePlugin, "remotePluginId")
    || fieldText(effectivePlugin, "name")
    || `plugin-${index + 1}`;
  const pluginName = fieldText(effectivePlugin, "name") || pluginId;
  const remotePluginId = pluginRemotePluginId(effectivePlugin);
  const interfaceInfo = recordField(effectivePlugin, "interface");
  const title = fieldText(interfaceInfo, "displayName") || pluginName;
  const description = fieldText(interfaceInfo, "shortDescription")
    || fieldText(interfaceInfo, "longDescription")
    || fieldText(effectivePlugin, "description");
  const promptPath = pluginPromptPath(pluginId);
  const mentionName = pluginMentionName(pluginId, pluginName || title);
  const mentionable = isPluginMentionable(effectivePlugin);
  const shared = context.source === "shared"
    || (!context.featured && hasPluginShareContext(effectivePlugin));
  const shareUrl = fieldText(pluginShareContext(effectivePlugin), "shareUrl");
  const secondaryActions = connectorApp && connectorState
    ? connectorAppSecondaryActions({ app: connectorApp, appId: connectorAppId, state: connectorState, title })
    : pluginSecondaryActions({
        featured: context.featured,
        localPluginPath: context.localPluginPath,
        marketplaceName: context.marketplaceName,
        marketplacePath: context.marketplacePath,
        plugin: effectivePlugin,
        pluginId,
        pluginName,
        remotePluginId,
        shareUrl,
        shared,
        title,
      });
  return {
    id: `plugin:${pluginId}`,
    title,
    kind: "plugin",
    status: connectorState ? connectorPluginStatus(connectorState) : pluginStatus(effectivePlugin, {
      featured: context.featured,
      shared,
    }),
    meta: cleanList([
      context.marketplaceTitle,
      context.featured && "Featured",
      context.source === "shared" && "Shared",
    ]).join(" · ") || undefined,
    details: cleanList([
      description,
      pluginDefaultPrompt(effectivePlugin) && `Default prompt: ${firstLine(pluginDefaultPrompt(effectivePlugin))}`,
      connectorApp && `Connector app: ${fieldText(connectorApp, "name") || fieldText(connectorApp, "id")}`,
      connectorState && `Connector enabled: ${connectorState.enabled ? "yes" : "no"}`,
      connectorState && `Connector accessible: ${connectorState.accessible ? "yes" : "no"}`,
      connectorState && connectorAuthDetail(connectorState),
      connectorState && connectorInstallDetail(connectorState),
      connectorState && connectorProtocolLimitedDetail(connectorState),
      context.marketplacePath && `Marketplace: ${context.marketplacePath}`,
      fieldText(effectivePlugin, "localVersion") && `Local version: ${fieldText(effectivePlugin, "localVersion")}`,
      fieldText(pluginShareContext(effectivePlugin), "remoteVersion")
        && `Remote version: ${fieldText(pluginShareContext(effectivePlugin), "remoteVersion")}`,
      shareUrl && `Share: ${shareUrl}`,
      context.localPluginPath && `Local path: ${context.localPluginPath}`,
      stringArrayField(interfaceInfo, "capabilities").length > 0
        && `Capabilities: ${stringArrayField(interfaceInfo, "capabilities").join(", ")}`,
      stringArrayField(effectivePlugin, "keywords").length > 0
        && `Keywords: ${stringArrayField(effectivePlugin, "keywords").join(", ")}`,
      fieldText(effectivePlugin, "availability") && `Availability: ${fieldText(effectivePlugin, "availability")}`,
      fieldText(effectivePlugin, "installPolicy") && `Install: ${fieldText(effectivePlugin, "installPolicy")}`,
      fieldText(effectivePlugin, "authPolicy") && `Auth: ${fieldText(effectivePlugin, "authPolicy")}`,
    ]),
    disabled: mentionable ? undefined : true,
    /*
     * PluginInterface 字段透传 — composerIcon(Url) / logo(Url) / brandColor。
     * 协议字段名来自 packages/codex-protocol/src/generated/v2/PluginInterface.ts：
     *   - composerIcon: 本地路径 / composerIconUrl: 远程 URL
     *   - logo: 本地路径 / logoUrl: 远程 URL
     *   - brandColor: hex 字符串
     */
    action: mentionable
      ? (() => {
          const pluginIconSmall = fieldText(interfaceInfo, "composerIcon")
            || fieldText(interfaceInfo, "composerIconUrl")
            || fieldText(interfaceInfo, "logo")
            || fieldText(interfaceInfo, "logoUrl");
          const pluginBrandColor = fieldText(interfaceInfo, "brandColor");
          return {
            type: "attachPlugin" as const,
            name: mentionName,
            path: promptPath,
            promptText: pluginPromptText(mentionName, promptPath, pluginDefaultPrompt(effectivePlugin)),
            ...(pluginIconSmall ? { iconSmall: pluginIconSmall } : {}),
            ...(pluginBrandColor ? { brandColor: pluginBrandColor } : {}),
          };
        })()
      : undefined,
    secondaryActions: secondaryActions.length > 0 ? secondaryActions : undefined,
  };
}

function pluginProjectionKey(context: PluginProjectionContext): string {
  return pluginIdentityCandidates(context.plugin)[0]
    || `${context.marketplaceName}:${context.marketplacePath ?? ""}:${JSON.stringify(context.plugin)}`;
}

function mergePluginProjectionContext(
  current: PluginProjectionContext,
  next: PluginProjectionContext,
): PluginProjectionContext {
  const currentHasInstalled = Object.prototype.hasOwnProperty.call(current.plugin, "installed");
  const nextHasInstalled = Object.prototype.hasOwnProperty.call(next.plugin, "installed");
  const installed = (currentHasInstalled && booleanField(current.plugin, "installed"))
    || (nextHasInstalled && booleanField(next.plugin, "installed"));
  const mergedPlugin = {
    ...current.plugin,
    ...next.plugin,
  };
  if (currentHasInstalled || nextHasInstalled) mergedPlugin.installed = installed;
  if (
    Object.prototype.hasOwnProperty.call(current.plugin, "enabled")
    && !Object.prototype.hasOwnProperty.call(next.plugin, "enabled")
  ) {
    mergedPlugin.enabled = current.plugin.enabled;
  }
  return {
    ...current,
    ...next,
    featured: current.featured || next.featured,
    localPluginPath: next.localPluginPath ?? current.localPluginPath,
    marketplaceName: current.marketplaceName !== "Shared plugins" ? current.marketplaceName : next.marketplaceName,
    marketplacePath: current.marketplacePath ?? next.marketplacePath,
    marketplaceTitle: current.marketplaceTitle !== "Shared plugins" ? current.marketplaceTitle : next.marketplaceTitle,
    plugin: mergedPlugin,
    source: installed ? "installed" : current.source === "shared" || next.source === "shared" ? "shared" : next.source,
  };
}

function pluginIdentityCandidates(plugin: Record<string, unknown>): string[] {
  return cleanList([
    fieldText(plugin, "remotePluginId"),
    fieldText(pluginShareContext(plugin), "remotePluginId"),
    fieldText(plugin, "id"),
    fieldText(plugin, "name"),
  ]);
}

function pluginShareContext(plugin: Record<string, unknown>): Record<string, unknown> {
  return recordField(plugin, "shareContext");
}

function hasPluginShareContext(plugin: Record<string, unknown>): boolean {
  return Object.keys(pluginShareContext(plugin)).length > 0;
}

function pluginRemotePluginId(plugin: Record<string, unknown>): string {
  return fieldText(plugin, "remotePluginId") || fieldText(pluginShareContext(plugin), "remotePluginId");
}

function pluginPromptText(name: string, path: string, defaultPrompt: string): string {
  const reference = pluginPromptReference(name, path);
  const prompt = defaultPrompt.trim();
  if (!prompt) return ensureTrailingSpace(reference);
  if (prompt.toLowerCase().includes(reference.toLowerCase().trim())) return ensureTrailingSpace(prompt);
  return ensureTrailingSpace(`${prompt} ${reference}`);
}

function pluginPromptReference(name: string, path: string): string {
  return `[@${name}](${escapePromptPath(path)})`;
}

function pluginPromptPath(pluginId: string): string {
  return pluginId.startsWith("plugin://") ? pluginId : `plugin://${pluginId}`;
}

function pluginMentionName(pluginId: string, name: string): string {
  if (pluginId === "browser-use" || name === "browser-use") return "Browser";
  if (pluginId === "computer-use" || name === "computer-use") return "Computer";
  return name || pluginId;
}

function pluginDefaultPrompt(plugin: Record<string, unknown>): string {
  const interfaceInfo = recordField(plugin, "interface");
  const defaultPrompt = interfaceInfo.defaultPrompt;
  if (Array.isArray(defaultPrompt)) {
    return defaultPrompt.map((item) => typeof item === "string" ? item.trim() : "").filter(Boolean)[0] ?? "";
  }
  return fieldText(interfaceInfo, "defaultPrompt");
}

function isPluginMentionable(plugin: Record<string, unknown>): boolean {
  const hasInstalled = Object.prototype.hasOwnProperty.call(plugin, "installed");
  const hasEnabled = Object.prototype.hasOwnProperty.call(plugin, "enabled");
  const installed = !hasInstalled || booleanField(plugin, "installed");
  const enabled = !hasEnabled || booleanField(plugin, "enabled");
  const availability = fieldText(plugin, "availability");
  const installPolicy = fieldText(plugin, "installPolicy");
  return installed && enabled && availability !== "DISABLED_BY_ADMIN" && installPolicy !== "NOT_AVAILABLE";
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

function mcpResourceContentTitle(value: Record<string, unknown>, index: number): string {
  const uri = fieldText(value, "uri");
  if (uri) return `Resource content ${index + 1}`;
  return `Content ${index + 1}`;
}

function mcpResourceContentDetails(value: Record<string, unknown>): string[] {
  const uri = fieldText(value, "uri");
  const mime = fieldText(value, "mimeType") || fieldText(value, "mime_type");
  const text = fieldText(value, "text");
  const blob = fieldText(value, "blob");
  return cleanList([
    uri && `URI: ${uri}`,
    mime && `MIME: ${mime}`,
    blob && `Blob: ${blob.length} base64 characters`,
    ...textDetails(text || (!blob ? formatUnknown(value) : "")),
  ]);
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
  const displayName = fieldText(interfaceInfo, "displayName") || name;
  const path = fieldText(skill, "path");
  const scope = fieldText(skill, "scope");
  const defaultPrompt = fieldText(interfaceInfo, "defaultPrompt");
  /*
   * SkillInterface 字段提取（iconSmall / brandColor）— 透传到 attachSkill action。
   * 字段来自 `skills/list` RPC 响应（packages/codex-protocol/src/generated/v2/SkillInterface.ts）。
   */
  const iconSmall = fieldText(interfaceInfo, "iconSmall") || null;
  const brandColor = fieldText(interfaceInfo, "brandColor") || null;
  const dependencies = arrayField(recordField(skill, "dependencies"), "tools")
    .map(skillDependencyLabel)
    .filter(Boolean);
  const hasEnabled = Object.prototype.hasOwnProperty.call(skill, "enabled");
  const enabled = booleanField(skill, "enabled");
  const secondaryActions = cleanSecondaryActions([
    path ? skillFileReadAction({ displayName, path }) : undefined,
    hasEnabled ? skillConfigToggleAction({ name, displayName, path, enabled }) : undefined,
  ]);
  return {
    id: `skill:${name}`,
    title: displayName,
    kind: "skill",
    status: hasEnabled ? enabled ? "enabled" : "disabled" : undefined,
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
    disabled: hasEnabled && !enabled ? true : undefined,
    action: path
      ? {
          type: "attachSkill",
          name,
          path,
          promptText: skillPromptText({ name, path, defaultPrompt }),
          // 仅在有值时透传，避免无关字段污染 action 对象（测试 fixture 保持简洁）
          ...(iconSmall ? { iconSmall } : {}),
          ...(brandColor ? { brandColor } : {}),
        }
      : undefined,
    secondaryActions: secondaryActions.length > 0 ? secondaryActions : undefined,
  };
}

export function projectRecommendedSkillEntries(
  value: unknown,
  options: {
    existingSkills?: unknown;
  } = {},
): CommandPanelEntry[] {
  const existing = skillIdentityKeys(options.existingSkills);
  return pluginDetails(value).flatMap((plugin, pluginIndex) => {
    const summary = recordField(plugin, "summary");
    const marketplaceName = fieldText(plugin, "marketplaceName") || fieldText(plugin, "remoteMarketplaceName");
    const marketplacePath = fieldText(plugin, "marketplacePath") || null;
    const pluginId = fieldText(summary, "id")
      || fieldText(summary, "remotePluginId")
      || fieldText(summary, "name")
      || `plugin-${pluginIndex + 1}`;
    const remotePluginId = fieldText(summary, "remotePluginId") || pluginId;
    const pluginName = fieldText(summary, "name") || pluginId;
    const interfaceInfo = recordField(summary, "interface");
    const pluginTitle = fieldText(interfaceInfo, "displayName") || pluginName;
    const installed = booleanField(summary, "installed");
    const availability = fieldText(summary, "availability");
    const installPolicy = fieldText(summary, "installPolicy");
    const canInstall = !installed
      && availability !== "DISABLED_BY_ADMIN"
      && installPolicy !== "NOT_AVAILABLE"
      && Boolean(marketplacePath || marketplaceName);
    return arrayField(plugin, "skills")
      .map((skill, skillIndex) => recommendedSkillEntry({
        canInstall,
        existing,
        installed,
        marketplaceName,
        marketplacePath,
        pluginId,
        pluginName,
        pluginTitle,
        remotePluginId,
        skill,
        skillIndex,
      }))
      .filter((entry): entry is CommandPanelEntry => entry !== null);
  });
}

function recommendedSkillEntry({
  canInstall,
  existing,
  installed,
  marketplaceName,
  marketplacePath,
  pluginId,
  pluginName,
  pluginTitle,
  remotePluginId,
  skill,
  skillIndex,
}: {
  canInstall: boolean;
  existing: Set<string>;
  installed: boolean;
  marketplaceName: string;
  marketplacePath: string | null;
  pluginId: string;
  pluginName: string;
  pluginTitle: string;
  remotePluginId: string;
  skill: Record<string, unknown>;
  skillIndex: number;
}): CommandPanelEntry | null {
  const name = fieldText(skill, "name") || `skill-${skillIndex + 1}`;
  const path = fieldText(skill, "path");
  if (existing.has(`name:${name.toLowerCase()}`) || (path && existing.has(`path:${path}`))) return null;

  const interfaceInfo = recordField(skill, "interface");
  const displayName = fieldText(interfaceInfo, "displayName") || name;
  const defaultPrompt = fieldText(interfaceInfo, "defaultPrompt");
  const enabled = !Object.prototype.hasOwnProperty.call(skill, "enabled") || booleanField(skill, "enabled");
  const remoteReadable = marketplaceName && remotePluginId && name;
  const secondaryActions = cleanSecondaryActions([
    path ? skillFileReadAction({ displayName, path }) : undefined,
    !path && remoteReadable ? {
      id: `recommended-skill:${pluginId}:${name}:read`,
      label: "View",
      title: `View ${displayName} source`,
      action: {
        type: "readPluginSkill" as const,
        title: `View ${displayName}`,
        remoteMarketplaceName: marketplaceName,
        remotePluginId,
        skillName: name,
      },
    } : undefined,
    path && Object.prototype.hasOwnProperty.call(skill, "enabled")
      ? skillConfigToggleAction({ name, displayName, path, enabled })
      : undefined,
    canInstall ? {
      id: `recommended-skill:${pluginId}:${name}:install`,
      label: "Install plugin",
      title: `Install ${pluginTitle}`,
      tone: "success" as const,
      action: {
        type: "installPlugin" as const,
        title: `Install ${pluginTitle}`,
        pluginId,
        pluginName,
        marketplaceName,
        marketplacePath,
        remotePluginId,
      },
    } : undefined,
  ]);

  return {
    id: `recommended-skill:${pluginId}:${name}`,
    title: displayName,
    kind: "skill",
    status: path ? enabled ? "available" : "disabled" : installed ? "plugin skill" : "install plugin",
    meta: `Recommended Skills · ${pluginTitle}`,
    details: cleanList([
      fieldText(interfaceInfo, "shortDescription")
        || fieldText(skill, "shortDescription")
        || fieldText(skill, "description"),
      defaultPrompt && `Default prompt: ${firstLine(defaultPrompt)}`,
      `Plugin: ${pluginTitle}`,
      path ? `Path: ${path}` : "Source: plugin/skill/read",
      !installed && "Install the plugin to materialize this skill locally.",
    ]),
    disabled: path && enabled ? undefined : true,
    action: path && enabled
      ? (() => {
          const recommendedIconSmall = fieldText(interfaceInfo, "iconSmall");
          const recommendedBrandColor = fieldText(interfaceInfo, "brandColor");
          return {
            type: "attachSkill" as const,
            name,
            path,
            promptText: skillPromptText({ name, path, defaultPrompt }),
            ...(recommendedIconSmall ? { iconSmall: recommendedIconSmall } : {}),
            ...(recommendedBrandColor ? { brandColor: recommendedBrandColor } : {}),
          };
        })()
      : undefined,
    secondaryActions: secondaryActions.length > 0 ? secondaryActions : undefined,
  };
}

function skillCreatorEntry(workspace: string | undefined): CommandPanelEntry {
  const target = starterSkillTarget(workspace);
  return {
    id: "skill-creator:local-helper",
    title: "Skill creator",
    kind: "skill",
    status: target ? "starter available" : "workspace required",
    meta: "Recommended Skills · available boundary",
    details: cleanList([
      "No app-server creator RPC is exposed; this creates a starter SKILL.md through fs/createDirectory and fs/writeFile.",
      target ? `Directory: ${target.directoryPath}` : "Open an absolute workspace folder before creating a starter skill.",
      target ? `File: ${target.filePath}` : undefined,
    ]),
    disabled: target ? undefined : true,
    secondaryActions: target ? [{
      id: "skill-creator:create-starter",
      label: "Create",
      title: "Create starter skill",
      tone: "success",
      action: {
        type: "createStarterSkill",
        title: "Create starter skill",
        ...target,
      },
    }] : undefined,
  };
}

export interface StarterSkillTarget {
  skillName: string;
  directoryPath: string;
  filePath: string;
  contents: string;
}

export function starterSkillTarget(workspace: string | undefined): StarterSkillTarget | null {
  const root = workspace?.trim().replace(/[\\/]+$/u, "") ?? "";
  if (!isAbsolutePath(root)) return null;
  const directoryPath = joinFixedPath(root, ".codex", "skills", STARTER_SKILL_NAME);
  return {
    skillName: STARTER_SKILL_NAME,
    directoryPath,
    filePath: joinFixedPath(directoryPath, "SKILL.md"),
    contents: starterSkillContents(STARTER_SKILL_NAME),
  };
}

function starterSkillContents(skillName: string): string {
  return `---
name: ${skillName}
description: Use when the user asks to try or customize the starter skill workflow.
metadata:
  short-description: Starter skill
---

# Starter Skill

Use this file to capture a focused workflow, domain rule, or repeatable task.

## Workflow

1. Identify when this skill should apply.
2. Follow the project-specific steps here.
3. Verify the result before responding.
`;
}

function isAbsolutePath(value: string): boolean {
  return value.startsWith("/") || /^[a-zA-Z]:[\\/]/u.test(value);
}

function joinFixedPath(root: string, ...parts: string[]): string {
  const separator = root.includes("\\") && !root.includes("/") ? "\\" : "/";
  return [root, ...parts].map((part, index) => {
    if (index === 0) return part.replace(/[\\/]+$/u, "");
    return part.replace(/^[\\/]+|[\\/]+$/gu, "");
  }).filter(Boolean).join(separator);
}

function skillDependencyLabel(dependency: Record<string, unknown>): string {
  const value = fieldText(dependency, "value") || fieldText(dependency, "type");
  const transport = fieldText(dependency, "transport");
  const command = fieldText(dependency, "command");
  const url = fieldText(dependency, "url");
  const detail = cleanList([
    transport,
    command && `cmd: ${command}`,
    url,
  ]).join(" · ");
  return detail ? `${value} (${detail})` : value;
}

function skillFileReadAction(skill: {
  displayName: string;
  path: string;
}): CommandPanelSecondaryAction {
  return {
    id: `skill:${skill.path}:read`,
    label: "View",
    title: `View ${skill.displayName} source`,
    action: {
      type: "readSkillFile",
      title: `View ${skill.displayName}`,
      path: skill.path,
    },
  };
}

function skillConfigToggleAction(skill: {
  name: string;
  displayName: string;
  path: string;
  enabled: boolean;
}): CommandPanelSecondaryAction {
  const nextEnabled = !skill.enabled;
  const label = nextEnabled ? "Enable" : "Disable";
  return {
    id: `skill:${skill.name}:${nextEnabled ? "enable" : "disable"}`,
    label,
    title: `${label} ${skill.displayName}`,
    tone: nextEnabled ? "success" : "danger",
    action: {
      type: "writeSkillConfig",
      title: `${label} ${skill.displayName}`,
      name: skill.name,
      path: skill.path || undefined,
      enabled: nextEnabled,
    },
  };
}

function skillPromptText(skill: { name: string; path: string; defaultPrompt: string }): string {
  const prompt = skill.defaultPrompt.trim();
  const reference = skillPromptReference(skill.name, skill.path);
  if (!prompt) return ensureTrailingSpace(reference);

  const lowerPrompt = prompt.toLowerCase();
  const lowerName = skill.name.toLowerCase();
  if (lowerPrompt.includes(`[$${lowerName}](`)) return ensureTrailingSpace(prompt);
  if (!skill.path && lowerPrompt.includes(`$${lowerName}`)) return ensureTrailingSpace(prompt);
  return ensureTrailingSpace(`${prompt} ${reference}`);
}

function skillPromptReference(name: string, path: string): string {
  return path ? `[$${name}](${escapePromptPath(path)})` : `$${name}`;
}

function ensureTrailingSpace(value: string): string {
  return value.endsWith(" ") ? value : `${value} `;
}

function escapePromptPath(value: string): string {
  if (/[\s()<>]/.test(value)) {
    return `<${value.replace(/\\/g, "\\\\").replace(/>/g, "\\>")}>`;
  }
  return value.replace(/\\/g, "\\\\").replace(/\)/g, "\\)");
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
    const { appId, appName: name, title } = appIdentity(app, index);
    const plugins = stringArrayField(app, "pluginDisplayNames");
    const state = appListState(app);
    const promptPath = appPromptPath(appId);
    const secondaryActions = cleanSecondaryActions([
      state.hasEnabledField ? appConfigToggleAction({ appId, title, enabled: state.enabled }) : undefined,
      state.installUrl ? {
        id: `app:${appId}:connect`,
        label: "Connect",
        title: `Open ${title} connect flow`,
        tone: state.accessible ? "default" : "success",
        action: {
          type: "connectRequiredApp",
          title: `Connect ${title}`,
          appId,
          appName: title,
          installUrl: state.installUrl,
        },
      } : undefined,
    ]);
    return {
      id: `app:${appId}`,
      title,
      kind: "app",
      status: appStatus(state),
      meta: name,
      details: cleanList([
        fieldText(app, "description"),
        plugins.length ? `Plugins: ${plugins.join(", ")}` : "",
        state.hasEnabledField ? `Enabled: ${state.enabled ? "yes" : "no"}` : "Enabled: not reported by app/list",
        state.hasAccessibleField ? `Accessible: ${state.accessible ? "yes" : "no"}` : "Accessible: not reported by app/list",
        connectorAuthDetail(state),
        connectorInstallDetail(state),
        connectorProtocolLimitedDetail(state),
      ]),
      disabled: state.accessible ? undefined : true,
      /*
       * AppInfo 字段透传 — 协议字段名来自
       * packages/codex-protocol/src/generated/v2/AppInfo.ts:10：
       *   logoUrl / logoUrlDark / branding(AppBranding)
       * 注：AppBranding 不含 brandColor 字段（仅 category/developer/website/...）
       *   所以 attachApp 不带 brandColor。
       */
      action: state.accessible
        ? (() => {
            const appIconSmall = fieldText(app, "logoUrl") || fieldText(app, "logoUrlDark");
            return {
              type: "attachApp" as const,
              name,
              path: promptPath,
              promptText: appPromptText(name, promptPath),
              ...(appIconSmall ? { iconSmall: appIconSmall } : {}),
            };
          })()
        : undefined,
      secondaryActions: secondaryActions.length > 0 ? secondaryActions : undefined,
    };
  });
}

function appConfigToggleAction(app: {
  appId: string;
  title: string;
  enabled: boolean;
}): CommandPanelSecondaryAction {
  const nextEnabled = !app.enabled;
  const label = nextEnabled ? "Enable" : "Disable";
  return {
    id: `app:${app.appId}:${nextEnabled ? "enable" : "disable"}`,
    label,
    title: `${label} ${app.title}`,
    tone: nextEnabled ? "success" : "danger",
    action: {
      type: "writeAppConfig",
      title: `${label} ${app.title}`,
      appId: app.appId,
      enabled: nextEnabled,
    },
  };
}

function appPromptText(name: string, path: string): string {
  return ensureTrailingSpace(`[$${name}](${escapePromptPath(path)})`);
}

function appPromptPath(appId: string): string {
  return appId.startsWith("app://") ? appId : `app://${appId}`;
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

function mcpAuthStatusNeedsLogin(status: string): boolean {
  const normalized = status.trim().toLowerCase();
  return normalized === "notloggedin"
    || normalized === "oauth"
    || normalized === "unauthenticated";
}

function pluginStatus(
  plugin: Record<string, unknown>,
  flags: { featured?: boolean; shared?: boolean } = {},
): string | undefined {
  if (booleanField(plugin, "installed")) {
    return booleanField(plugin, "enabled") ? "enabled" : "installed";
  }
  if (flags.shared) return "shared";
  if (flags.featured) return "featured";
  return fieldText(plugin, "availability") || undefined;
}

function findConnectorAppForPlugin(
  plugin: Record<string, unknown>,
  apps: Record<string, unknown>[],
): Record<string, unknown> | null {
  if (apps.length === 0) return null;
  const interfaceInfo = recordField(plugin, "interface");
  const codexAppId = fieldText(plugin, "codexAppId") || fieldText(plugin, "codex_app_id");
  if (codexAppId) {
    const byId = apps.find((app) => fieldText(app, "id") === codexAppId);
    if (byId) return byId;
  }
  const pluginNames = new Set([
    fieldText(plugin, "name"),
    fieldText(plugin, "displayName"),
    fieldText(interfaceInfo, "displayName"),
  ].map(normalizeConnectorName).filter(Boolean));
  if (pluginNames.size === 0) return null;
  return apps.find((app) => {
    const appNames = [
      fieldText(app, "name"),
      ...stringArrayField(app, "pluginDisplayNames"),
    ].map(normalizeConnectorName).filter(Boolean);
    return appNames.some((name) => pluginNames.has(name));
  }) ?? null;
}

function normalizeConnectorName(value: string): string {
  return value.trim().toLowerCase().replace(/[^a-z0-9]+/g, "");
}

function connectorPluginStatus(state: AppListState): string {
  if (state.hasEnabledField && !state.enabled) return "app disabled";
  if (state.accessible) return "enabled";
  return state.installUrl ? "auth required" : "protocol-limited";
}

function connectorAppSecondaryActions({
  app,
  appId,
  state,
  title,
}: {
  app: Record<string, unknown>;
  appId: string;
  state: AppListState;
  title: string;
}): CommandPanelSecondaryAction[] {
  return cleanSecondaryActions([
    state.hasEnabledField ? appConfigToggleAction({ appId, title, enabled: state.enabled }) : undefined,
    state.installUrl ? {
      id: `app:${appId}:connect`,
      label: state.accessible ? "Reconnect" : "Connect",
      title: `Open ${title} connect flow`,
      tone: state.accessible ? "default" : "success",
      action: {
        type: "connectRequiredApp",
        title: `Connect ${title}`,
        appId,
        appName: fieldText(app, "title") || fieldText(app, "displayName") || fieldText(app, "name") || title,
        installUrl: state.installUrl,
      },
    } : undefined,
  ]);
}

function pluginSecondaryActions({
  featured,
  localPluginPath,
  plugin,
  pluginId,
  pluginName,
  remotePluginId,
  shareUrl,
  shared,
  title,
  marketplaceName,
  marketplacePath,
}: {
  featured: boolean;
  localPluginPath: string | null;
  plugin: Record<string, unknown>;
  pluginId: string;
  pluginName: string;
  remotePluginId: string;
  shareUrl: string;
  shared: boolean;
  title: string;
  marketplaceName: string;
  marketplacePath: string | null;
}): CommandPanelSecondaryAction[] {
  const hasInstalled = Object.prototype.hasOwnProperty.call(plugin, "installed");
  const installed = hasInstalled ? booleanField(plugin, "installed") : false;
  const hasEnabled = Object.prototype.hasOwnProperty.call(plugin, "enabled");
  const enabled = hasEnabled ? booleanField(plugin, "enabled") : true;
  const installPolicy = fieldText(plugin, "installPolicy");
  const availability = fieldText(plugin, "availability");
  if (!hasInstalled) return [];
  if (installed) {
    return cleanSecondaryActions([
      hasEnabled ? pluginConfigToggleAction({ pluginId, title, enabled }) : undefined,
      shareUrl ? {
        id: `plugin:${pluginId}:open-share`,
        label: "Share",
        title: `Open ${title} share`,
        action: { type: "openExternalUrl" as const, title: `Open ${title} share`, url: shareUrl },
      } : undefined,
      installPolicy !== "INSTALLED_BY_DEFAULT" ? {
        id: `plugin:${pluginId}:uninstall`,
        label: "Uninstall",
        title: `Uninstall ${title}`,
        tone: "danger",
        action: { type: "uninstallPlugin", title: `Uninstall ${title}`, pluginId },
      } : undefined,
    ]);
  }
  if (shared && remotePluginId && !localPluginPath) {
    return cleanSecondaryActions([
      {
        id: `plugin:${pluginId}:checkout-share`,
        label: "Checkout",
        title: `Checkout ${title}`,
        tone: "success",
        action: { type: "checkoutPluginShare" as const, title: `Checkout ${title}`, remotePluginId, pluginName },
      },
      shareUrl ? {
        id: `plugin:${pluginId}:open-share`,
        label: "Share",
        title: `Open ${title} share`,
        action: { type: "openExternalUrl" as const, title: `Open ${title} share`, url: shareUrl },
      } : undefined,
    ]);
  }
  if (availability === "DISABLED_BY_ADMIN" || installPolicy === "NOT_AVAILABLE") return [];
  if (!marketplacePath && marketplaceName === "Unknown marketplace") return [];
  const installPluginName = marketplacePath ? pluginName : remotePluginId || pluginId;
  return [{
    id: `plugin:${pluginId}:install`,
    label: featured ? "Install featured" : "Install",
    title: `Install ${title}`,
    tone: "success",
    action: {
      type: "installPlugin",
      title: `Install ${title}`,
      pluginId,
      pluginName: installPluginName,
      marketplaceName,
      marketplacePath,
      ...(remotePluginId ? { remotePluginId } : {}),
    },
  }];
}

function pluginConfigToggleAction(plugin: {
  pluginId: string;
  title: string;
  enabled: boolean;
}): CommandPanelSecondaryAction {
  const nextEnabled = !plugin.enabled;
  const label = nextEnabled ? "Enable" : "Disable";
  return {
    id: `plugin:${plugin.pluginId}:${nextEnabled ? "enable" : "disable"}`,
    label,
    title: `${label} ${plugin.title}`,
    tone: nextEnabled ? "success" : "danger",
    action: {
      type: "writePluginConfig",
      title: `${label} ${plugin.title}`,
      pluginId: plugin.pluginId,
      enabled: nextEnabled,
    },
  };
}

function responseItems(value: unknown): Record<string, unknown>[] {
  if (Array.isArray(value)) return value.filter(isRecord);
  if (!isRecord(value)) return [];
  if (Array.isArray(value.data)) return value.data.filter(isRecord);
  return [];
}

function pluginDetails(value: unknown): Record<string, unknown>[] {
  if (Array.isArray(value)) return value.flatMap(pluginDetails);
  if (!isRecord(value)) return [];
  if (isRecord(value.plugin)) return [value.plugin];
  const direct = arrayField(value, "plugins");
  if (direct.length > 0) return direct;
  const details = arrayField(value, "pluginDetails");
  if (details.length > 0) return details.flatMap(pluginDetails);
  return [];
}

function skillIdentityKeys(value: unknown): Set<string> {
  const keys = new Set<string>();
  for (const item of responseItems(value)) {
    const skills = Array.isArray(item.skills) ? arrayField(item, "skills") : [item];
    for (const skill of skills) {
      const name = fieldText(skill, "name");
      const path = fieldText(skill, "path");
      if (name) keys.add(`name:${name.toLowerCase()}`);
      if (path) keys.add(`path:${path}`);
    }
  }
  return keys;
}

interface AppListState {
  hasAccessibleField: boolean;
  accessible: boolean;
  hasEnabledField: boolean;
  enabled: boolean;
  installUrl: string;
  needsAuth: boolean;
}

function appIdentity(app: Record<string, unknown>, index: number): {
  appId: string;
  appName: string;
  title: string;
} {
  const appId = fieldText(app, "id") || fieldText(app, "name") || `app-${index + 1}`;
  const appName = fieldText(app, "name") || appId;
  const title = fieldText(app, "title") || fieldText(app, "displayName") || appName;
  return { appId, appName, title };
}

function appListState(app: Record<string, unknown>): AppListState {
  const hasAccessibleField = Object.prototype.hasOwnProperty.call(app, "isAccessible");
  const hasEnabledField = Object.prototype.hasOwnProperty.call(app, "isEnabled");
  return {
    hasAccessibleField,
    accessible: !hasAccessibleField || booleanField(app, "isAccessible"),
    hasEnabledField,
    enabled: !hasEnabledField || booleanField(app, "isEnabled"),
    installUrl: appInstallUrl(app),
    needsAuth: booleanField(app, "needsAuth"),
  };
}

function appInstallUrl(app: Record<string, unknown>): string {
  return fieldText(app, "installUrl");
}

function appStatus(state: AppListState): string | undefined {
  if (state.hasEnabledField && !state.enabled) return "disabled";
  if (state.hasAccessibleField && state.accessible) return "accessible";
  if (state.needsAuth || (state.hasAccessibleField && !state.accessible)) {
    return state.installUrl ? "auth required" : "protocol-limited";
  }
  return state.hasEnabledField ? "enabled" : undefined;
}

function connectorAuthDetail(state: AppListState): string {
  if (state.needsAuth) return "Auth: ChatGPT connector authorization required";
  if (state.hasAccessibleField) return state.accessible
    ? "Auth: accessible according to app/list"
    : "Auth: not accessible according to app/list";
  return "Auth: not reported by app/list";
}

function connectorInstallDetail(state: AppListState): string {
  return state.installUrl ? "Install: browser setup URL available" : "Install: no browser setup URL returned";
}

function connectorProtocolLimitedDetail(state: AppListState): string {
  const missingConnectMethod = !state.installUrl && (state.needsAuth || (state.hasAccessibleField && !state.accessible));
  return missingConnectMethod ? CONNECTOR_PROTOCOL_LIMITED_DETAIL : "";
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

function numberField(value: unknown, key: string): number | null {
  if (!isRecord(value)) return null;
  const field = value[key];
  return typeof field === "number" && Number.isFinite(field) ? field : null;
}

function cleanList(values: Array<string | false | null | undefined>): string[] {
  return values.filter((value): value is string => typeof value === "string" && value.trim().length > 0);
}

function cleanSecondaryActions(
  values: Array<CommandPanelSecondaryAction | false | null | undefined>,
): CommandPanelSecondaryAction[] {
  return values.filter((value): value is CommandPanelSecondaryAction => Boolean(value));
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

function mcpServerMeta(toolCount: number, resourceCount: number, templateCount: number): string {
  const labels = cleanList([
    countLabel(toolCount, "tool", "No tools"),
    resourceCount > 0 && countLabel(resourceCount, "resource", ""),
    templateCount > 0 && countLabel(templateCount, "template", ""),
  ]);
  return labels.join(" · ");
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
    case "theme":
      return "Theme";
    case "files":
      return "Files";
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
