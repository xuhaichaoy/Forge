/*
 * Plugin entry projection: marketplace/installed/shared projection contexts,
 * connector-app bridging, and plugin secondary actions. Moved verbatim out
 * of state/command-panel.ts.
 */
import {
  booleanField,
  cleanSecondaryActions,
  firstLine,
  recordField,
  stringArrayField,
} from "./command-panel-value-utils";
import {
  arrayField,
  cleanList,
  fieldText,
  isRecord,
  responseItems,
} from "./command-panel-entry-fields";
import {
  ensureTrailingSpace,
  escapePromptPath,
} from "./command-panel-skill-helpers";
import {
  appConfigToggleAction,
  appIdentity,
  appListState,
  connectorAuthDetail,
  connectorInstallDetail,
  connectorProtocolLimitedDetail,
  type AppListState,
} from "./command-panel-app-entries";
import type {
  CommandPanelEntry,
  CommandPanelSecondaryAction,
} from "./command-panel-types";

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
