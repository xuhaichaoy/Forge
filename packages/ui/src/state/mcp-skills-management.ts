import {
  projectCommandPanelEntries,
  type ConfigWriteTarget,
  type CommandPanelEntry,
} from "./command-panel";
import { formatMessage } from "./i18n";

export type ManagementPanelKind = "mcp" | "plugins" | "skills";

export interface McpServerStartupStatus {
  status: string;
  error: string | null;
  updatedAt?: number;
}

export interface ManagementPanelSummary {
  id: string;
  label: string;
  value: number;
  tone?: "default" | "success" | "warning" | "danger";
}

export interface ManagementPanelSection {
  id: string;
  title: string;
  meta?: string;
  entries: CommandPanelEntry[];
}

export interface McpManagementConfigContext {
  configReadResult?: unknown;
}

export function managementPanelSummary(
  kind: ManagementPanelKind,
  entries: CommandPanelEntry[],
): ManagementPanelSummary[] {
  if (kind === "mcp") return mcpManagementSummary(entries);
  if (kind === "plugins") return pluginManagementSummary(entries);
  return skillManagementSummary(entries);
}

export function managementPanelSections(
  kind: ManagementPanelKind,
  entries: CommandPanelEntry[],
): ManagementPanelSection[] {
  if (kind === "mcp") return mcpManagementSections(entries);
  if (kind === "plugins") return pluginManagementSections(entries);
  return skillManagementSections(entries);
}

export function projectMcpManagementEntries(
  mcpStatusResult: unknown,
  startupStatuses: Record<string, McpServerStartupStatus | undefined> | null | undefined,
  context?: McpManagementConfigContext,
): CommandPanelEntry[] {
  const config = mcpManagementConfig(context?.configReadResult);
  return addMcpServerConfigManagementEntries(
    applyMcpStartupStatusToCommandEntries(
      projectCommandPanelEntries({ mcp: mcpStatusResult }),
      startupStatuses,
    ),
    config,
  );
}

export function addMcpServerConfigManagementEntries(
  entries: CommandPanelEntry[],
  config?: McpManagementConfig,
): CommandPanelEntry[] {
  const existingServers = config?.serverKeys ?? mcpServerEntryNames(entries);
  const addEntry: CommandPanelEntry = {
    id: "mcp:add-server",
    // codex settings.mcp.addServer — Codex's add button reads "Add server".
    title: formatMessage({ id: "settings.mcp.addServer", defaultMessage: "Add server" }),
    kind: "mcpServer",
    status: "new",
    meta: "stdio or streamable HTTP",
    details: ["Create or replace an MCP server in Codex config.toml."],
    action: mcpServerFormAction({
      title: "Add MCP server",
      mode: "add",
      existingServers,
      configWriteTarget: config?.writableTarget,
    }),
  };
  return [
    addEntry,
    ...entries.map((entry) => {
      if (entry.kind !== "mcpServer") return entry;
      const serverKey = entry.title;
      const serverConfig = config?.servers[serverKey];
      const configWriteTarget = config
        ? config.serverTargets[serverKey] ?? config.writableTarget
        : undefined;
      const hasConfigContext = config !== undefined;
      const isReadOnly = hasConfigContext && (!serverConfig || config.readOnlyServers.has(serverKey));
      const enabled = serverConfig ? serverConfig.enabled !== false : true;
      return {
        ...entry,
        secondaryActions: cleanSecondaryActions([
          ...(entry.secondaryActions ?? []),
          !isReadOnly && serverConfig ? {
            id: `${entry.id}:toggle-config`,
            label: enabled ? "Disable" : "Enable",
            title: `${enabled ? "Disable" : "Enable"} ${entry.title}`,
            tone: enabled ? "default" as const : "success" as const,
            action: {
              type: "writeMcpServerConfig" as const,
              title: `${enabled ? "Disable" : "Enable"} ${entry.title}`,
              name: serverKey,
              config: { ...serverConfig, enabled: !enabled },
              configWriteTarget,
            },
          } : undefined,
          !isReadOnly ? {
            id: `${entry.id}:edit-config`,
            // codex settings.mcp.server.settings — Codex's per-server control is "Settings".
            label: formatMessage({ id: "settings.mcp.server.settings", defaultMessage: "Settings" }),
            title: `${entry.title} settings`,
            action: mcpServerFormAction({
              title: `Edit ${entry.title}`,
              mode: "edit" as const,
              server: entry.title,
              existingServers,
              serverConfig,
              configWriteTarget,
            }),
          } : undefined,
          !isReadOnly ? {
            id: `${entry.id}:remove-config`,
            // codex settings.mcp.detail.uninstall — Codex labels MCP-server removal "Uninstall".
            label: formatMessage({ id: "settings.mcp.detail.uninstall", defaultMessage: "Uninstall" }),
            title: `Uninstall ${entry.title}`,
            tone: "danger" as const,
            action: {
              type: "removeMcpServer" as const,
              title: `Remove ${entry.title}`,
              server: entry.title,
              configWriteTarget,
            },
          } : undefined,
        ]),
      };
    }),
  ];
}

export function normalizeMcpServerKey(
  value: string | null | undefined,
  existingKeys: readonly string[] = [],
  currentKey?: string | null,
): string {
  const cleaned = value
    ?.trim()
    .replace(/\s+/gu, "_")
    .replace(/[^a-zA-Z0-9-_]+/gu, "-")
    .replace(/-+/gu, "-") ?? "";
  const base = cleaned.length > 0 ? cleaned.toLowerCase() : "custom-server";
  const conflicts = existingKeys.filter((key) => currentKey == null || key !== currentKey);
  if (!conflicts.includes(base)) return base;
  let suffix = 2;
  let candidate = `${base}-${suffix}`;
  while (conflicts.includes(candidate)) {
    suffix += 1;
    candidate = `${base}-${suffix}`;
  }
  return candidate;
}

export function applyMcpStartupStatusToCommandEntries(
  entries: CommandPanelEntry[],
  startupStatuses: Record<string, McpServerStartupStatus | undefined> | null | undefined,
): CommandPanelEntry[] {
  if (!startupStatuses || Object.keys(startupStatuses).length === 0) return entries;
  return entries.map((entry) => {
    if (entry.kind !== "mcpServer") return entry;
    const startup = startupStatuses[entry.title] ?? startupStatuses[entry.id.replace(/^mcp:/, "")];
    if (!startup) return entry;
    const details = (entry.details ?? []).filter((detail) =>
      !detail.startsWith("Startup:") && !detail.startsWith("Startup error:")
    );
    details.push(`Startup: ${startup.status}`);
    if (startup.error) details.push(`Startup error: ${startup.error}`);
    return { ...entry, details };
  });
}

function mcpManagementSummary(entries: CommandPanelEntry[]): ManagementPanelSummary[] {
  const servers = entries.filter((entry) => entry.kind === "mcpServer" && entry.id !== "mcp:add-server");
  const tools = entries.filter((entry) => entry.kind === "mcpTool");
  const resources = entries.filter((entry) => entry.kind === "mcpResource");
  const templates = entries.filter((entry) => entry.kind === "mcpResourceTemplate");
  const needsAuth = servers.filter((entry) => {
    const status = (entry.status ?? "").toLowerCase();
    return status.includes("unauth")
      || status.includes("oauth")
      || status.includes("notloggedin")
      || (status.includes("login") && !status.includes("loggedin"));
  });
  const startupErrors = servers.filter((entry) =>
    (entry.details ?? []).some((detail) => detail.startsWith("Startup error:"))
  );
  return [
    { id: "mcp:servers", label: "Servers", value: servers.length },
    { id: "mcp:tools", label: "Tools", value: tools.length, tone: tools.length > 0 ? "success" : "default" },
    { id: "mcp:resources", label: "Resources", value: resources.length + templates.length },
    { id: "mcp:auth", label: "Auth needed", value: needsAuth.length, tone: needsAuth.length > 0 ? "warning" : "default" },
    {
      id: "mcp:startup-errors",
      label: "Startup errors",
      value: startupErrors.length,
      tone: startupErrors.length > 0 ? "danger" : "default",
    },
  ];
}

function skillManagementSummary(entries: CommandPanelEntry[]): ManagementPanelSummary[] {
  const skills = entries.filter((entry) =>
    entry.kind === "skill"
    && !entry.id.startsWith("skill-error:")
    && !entry.id.startsWith("recommended-skill:")
    && !entry.id.startsWith("skill-creator:")
  );
  const recommended = entries.filter((entry) =>
    entry.kind === "skill"
    && (entry.id.startsWith("recommended-skill:") || entry.id.startsWith("skill-creator:"))
  );
  const enabled = skills.filter((entry) => entry.status === "enabled" || entry.status === undefined);
  const disabled = skills.filter((entry) => entry.status === "disabled");
  const errors = entries.filter((entry) => entry.kind === "skill" && entry.status === "error");
  return [
    { id: "skills:total", label: "Skills", value: skills.length },
    { id: "skills:enabled", label: "Enabled", value: enabled.length, tone: enabled.length > 0 ? "success" : "default" },
    { id: "skills:disabled", label: "Disabled", value: disabled.length, tone: disabled.length > 0 ? "warning" : "default" },
    {
      id: "skills:recommended",
      label: "Recommended",
      value: recommended.length,
      tone: recommended.length > 0 ? "success" : "default",
    },
    { id: "skills:errors", label: "Load errors", value: errors.length, tone: errors.length > 0 ? "danger" : "default" },
  ];
}

function pluginManagementSummary(entries: CommandPanelEntry[]): ManagementPanelSummary[] {
  const plugins = entries.filter((entry) => entry.kind === "plugin");
  const installed = plugins.filter((entry) =>
    entry.status === "enabled" || entry.status === "installed" || entry.status === "app disabled"
  );
  const enabled = plugins.filter((entry) => entry.status === "enabled");
  const featured = plugins.filter(pluginEntryFeatured);
  const shared = plugins.filter(pluginEntryShared);
  return [
    { id: "plugins:total", label: "Plugins", value: plugins.length },
    {
      id: "plugins:installed",
      label: "Installed",
      value: installed.length,
      tone: installed.length > 0 ? "success" : "default",
    },
    {
      id: "plugins:enabled",
      label: "Enabled",
      value: enabled.length,
      tone: enabled.length > 0 ? "success" : "default",
    },
    {
      id: "plugins:featured",
      label: "Featured",
      value: featured.length,
      tone: featured.length > 0 ? "success" : "default",
    },
    {
      id: "plugins:shared",
      label: "Shared",
      value: shared.length,
      tone: shared.length > 0 ? "warning" : "default",
    },
  ];
}

function mcpManagementSections(entries: CommandPanelEntry[]): ManagementPanelSection[] {
  const servers = entries.filter((entry) => entry.kind === "mcpServer");
  const children = entries.filter((entry) => entry.kind !== "mcpServer");
  const sections = servers.map((server) => {
    const name = server.title;
    const serverChildren = children.filter((entry) => mcpEntryServerName(entry) === name);
    const startup = prefixedDetail(server.details, "Startup:");
    const startupError = prefixedDetail(server.details, "Startup error:");
    return {
      id: server.id,
      title: name,
      meta: cleanList([
        server.status,
        startup && `startup ${startup}`,
        startupError && "startup error",
        server.meta,
      ]).join(" · ") || undefined,
      entries: [server, ...serverChildren],
    };
  });
  const knownServerNames = new Set(servers.map((entry) => entry.title));
  const ungrouped = children.filter((entry) => {
    const server = mcpEntryServerName(entry);
    return !server || !knownServerNames.has(server);
  });
  if (ungrouped.length > 0) {
    sections.push({
      id: "mcp:ungrouped",
      title: "Other MCP entries",
      meta: `${ungrouped.length} entries`,
      entries: ungrouped,
    });
  }
  return sections;
}

function skillManagementSections(entries: CommandPanelEntry[]): ManagementPanelSection[] {
  const buckets = new Map<string, CommandPanelEntry[]>();
  for (const entry of entries) {
    const section = skillSectionLabel(entry);
    const current = buckets.get(section) ?? [];
    current.push(entry);
    buckets.set(section, current);
  }
  return Array.from(buckets.entries()).map(([title, sectionEntries]) => ({
    id: `skills:${title.toLowerCase().replace(/\s+/g, "-")}`,
    title,
    meta: `${sectionEntries.length} entries`,
    entries: sectionEntries,
  }));
}

function pluginManagementSections(entries: CommandPanelEntry[]): ManagementPanelSection[] {
  const plugins = entries.filter((entry) => entry.kind === "plugin");
  const sections: ManagementPanelSection[] = [];
  const addSection = (id: string, title: string, sectionEntries: CommandPanelEntry[]) => {
    if (sectionEntries.length === 0) return;
    sections.push({
      id,
      title,
      meta: `${sectionEntries.length} entries`,
      entries: sectionEntries,
    });
  };
  const installed = plugins.filter((entry) =>
    entry.status === "enabled" || entry.status === "installed" || entry.status === "app disabled"
  );
  const shared = plugins.filter(pluginEntryShared);
  const featured = plugins.filter((entry) => pluginEntryFeatured(entry) && !installed.includes(entry));
  const seen = new Set([...installed, ...shared, ...featured].map((entry) => entry.id));
  addSection("plugins:installed", "Installed", installed);
  addSection("plugins:shared", "Shared", shared.filter((entry) => !installed.includes(entry)));
  addSection("plugins:featured", "Featured", featured);

  const marketplaceBuckets = new Map<string, CommandPanelEntry[]>();
  for (const entry of plugins) {
    if (seen.has(entry.id)) continue;
    const marketplace = entry.meta?.split(" · ")[0]?.trim() || "Marketplace";
    const current = marketplaceBuckets.get(marketplace) ?? [];
    current.push(entry);
    marketplaceBuckets.set(marketplace, current);
  }
  for (const [marketplace, sectionEntries] of marketplaceBuckets.entries()) {
    addSection(`plugins:${marketplace.toLowerCase().replace(/\s+/g, "-")}`, marketplace, sectionEntries);
  }

  const nonPlugins = entries.filter((entry) => entry.kind !== "plugin");
  addSection("plugins:other", "Other plugin entries", nonPlugins);
  return sections;
}

function pluginEntryFeatured(entry: CommandPanelEntry): boolean {
  return entry.status === "featured" || (entry.meta ?? "").includes("Featured");
}

function pluginEntryShared(entry: CommandPanelEntry): boolean {
  return entry.status === "shared" || (entry.meta ?? "").includes("Shared");
}

function mcpEntryServerName(entry: CommandPanelEntry): string {
  if (entry.kind === "mcpServer") return entry.title;
  if (entry.meta) {
    if (entry.meta.includes(":")) {
      const byColon = entry.meta.split(":")[0]?.trim();
      if (byColon) return byColon;
    }
    const byDot = entry.meta.split(" · ")[0]?.trim();
    if (byDot) return byDot;
  }
  const prefix = entry.kind === "mcpTool"
    ? "mcp-tool:"
    : entry.kind === "mcpResource"
      ? "mcp-resource:"
      : entry.kind === "mcpResourceTemplate"
        ? "mcp-resource-template:"
        : "";
  if (!prefix || !entry.id.startsWith(prefix)) return "";
  return entry.id.slice(prefix.length).split(":")[0] ?? "";
}

function skillSectionLabel(entry: CommandPanelEntry): string {
  if (entry.status === "error" || entry.id.startsWith("skill-error:")) return "Load errors";
  const firstMeta = entry.meta?.split(" · ")[0]?.trim();
  return firstMeta || "Skills";
}

function prefixedDetail(details: string[] | undefined, prefix: string): string | undefined {
  const detail = details?.find((item) => item.startsWith(prefix));
  return detail?.slice(prefix.length).trim() || undefined;
}

function cleanList(values: Array<string | null | undefined | false>): string[] {
  return values.filter((value): value is string => typeof value === "string" && value.trim().length > 0);
}

function cleanSecondaryActions(
  values: Array<NonNullable<CommandPanelEntry["secondaryActions"]>[number] | null | undefined | false>,
): NonNullable<CommandPanelEntry["secondaryActions"]> {
  return values.filter((value): value is NonNullable<CommandPanelEntry["secondaryActions"]>[number] => Boolean(value));
}

interface McpManagementConfig {
  readOnlyServers: Set<string>;
  serverKeys: string[];
  serverTargets: Record<string, ConfigWriteTarget | undefined>;
  servers: Record<string, Record<string, unknown>>;
  writableTarget?: ConfigWriteTarget;
}

function mcpManagementConfig(configReadResult: unknown): McpManagementConfig | undefined {
  const root = recordObject(configReadResult);
  const config = recordObject(root.config);
  const servers = recordOfRecords(config.mcp_servers);
  if (Object.keys(config).length === 0) return undefined;
  const origins = recordObject(root.origins);
  const serverKeys = Object.keys(servers ?? {});
  const writableTarget = mcpConfigWriteTargetFromReadResult(configReadResult);
  const serverTargets = Object.fromEntries(
    serverKeys.map((key) => [key, mcpConfigWriteTargetFromReadResult(configReadResult, key)] as const),
  );
  return {
    servers: servers ?? {},
    serverKeys,
    serverTargets,
    writableTarget,
    readOnlyServers: new Set(serverKeys.filter((key) => mcpServerHasProjectOrigin(key, origins))),
  };
}

export function mcpConfigWriteTargetFromReadResult(
  configReadResult: unknown,
  serverKey?: string,
): ConfigWriteTarget | undefined {
  const root = recordObject(configReadResult);
  const origins = recordObject(root.origins);
  if (serverKey) {
    const target = mcpServerWriteTarget(serverKey, origins);
    if (target) return target;
  }
  return userLayerWriteTarget(root.layers);
}

function mcpServerWriteTarget(
  serverKey: string,
  origins: Record<string, unknown>,
): ConfigWriteTarget | undefined {
  const prefix = `mcp_servers.${serverKey}.`;
  for (const [path, origin] of Object.entries(origins)) {
    if (path !== `mcp_servers.${serverKey}` && !path.startsWith(prefix)) continue;
    const target = originWriteTarget(origin);
    if (target) return target;
  }
  return undefined;
}

function originWriteTarget(origin: unknown): ConfigWriteTarget | undefined {
  const metadata = recordObject(origin);
  const source = recordObject(metadata.name);
  if (source.type !== "user") return undefined;
  const filePath = typeof source.file === "string" ? source.file : "";
  const expectedVersion = typeof metadata.version === "string" ? metadata.version : "";
  return filePath && expectedVersion ? { filePath, expectedVersion } : undefined;
}

function userLayerWriteTarget(layers: unknown): ConfigWriteTarget | undefined {
  if (!Array.isArray(layers)) return undefined;
  for (const layer of layers) {
    const record = recordObject(layer);
    const source = recordObject(record.name);
    if (source.type !== "user") continue;
    const filePath = typeof source.file === "string" ? source.file : "";
    const expectedVersion = typeof record.version === "string" ? record.version : "";
    if (filePath && expectedVersion) return { filePath, expectedVersion };
  }
  return undefined;
}

function mcpServerHasProjectOrigin(serverKey: string, origins: Record<string, unknown>): boolean {
  const prefix = `mcp_servers.${serverKey}.`;
  return Object.entries(origins).some(([path, origin]) => {
    if (path !== `mcp_servers.${serverKey}` && !path.startsWith(prefix)) return false;
    return recordObject(recordObject(origin).name).type === "project";
  });
}

function mcpServerEntryNames(entries: CommandPanelEntry[]): string[] {
  return entries
    .filter((entry) => entry.kind === "mcpServer" && entry.id !== "mcp:add-server")
    .map((entry) => entry.title);
}

function mcpServerFormAction(action: {
  configWriteTarget?: ConfigWriteTarget;
  existingServers: string[];
  mode: "add" | "edit";
  server?: string;
  serverConfig?: Record<string, unknown>;
  title: string;
}): NonNullable<CommandPanelEntry["action"]> {
  const result: Extract<NonNullable<CommandPanelEntry["action"]>, { type: "openMcpServerForm" }> = {
    type: "openMcpServerForm",
    title: action.title,
    mode: action.mode,
    ...(action.server !== undefined ? { server: action.server } : {}),
    existingServers: action.existingServers,
    ...(action.serverConfig !== undefined ? { serverConfig: action.serverConfig } : {}),
    ...(action.configWriteTarget !== undefined ? { configWriteTarget: action.configWriteTarget } : {}),
  };
  return result;
}

function recordObject(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {};
}

function recordOfRecords(value: unknown): Record<string, Record<string, unknown>> | undefined {
  const record = recordObject(value);
  if (Object.keys(record).length === 0) return undefined;
  return Object.fromEntries(
    Object.entries(record)
      .map(([key, entry]) => [key, recordObject(entry)] as const)
      .filter(([, entry]) => Object.keys(entry).length > 0),
  );
}
