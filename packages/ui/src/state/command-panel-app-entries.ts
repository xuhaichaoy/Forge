/*
 * Connector app entry projection (app/list payloads): required-app prompts,
 * app entries, and the shared AppListState/connector detail helpers that the
 * plugin entry module reuses. Moved verbatim out of state/command-panel.ts.
 */
import {
  booleanField,
  cleanSecondaryActions,
  stringArrayField,
} from "./command-panel-value-utils";
import {
  cleanList,
  fieldText,
  responseItems,
} from "./command-panel-entry-fields";
import {
  ensureTrailingSpace,
  escapePromptPath,
} from "./command-panel-skill-helpers";
import type {
  CommandPanelEntry,
  CommandPanelEntryAction,
  CommandPanelSecondaryAction,
} from "./command-panel-types";

const CONNECTOR_REFRESH_GUIDANCE = "Finish the browser flow, then refresh Apps or Plugins.";

const CONNECTOR_PROTOCOL_LIMITED_DETAIL =
  "Protocol-limited: app-server returned app/list metadata only; no native connector OAuth method or browser setup URL is available.";

export function projectRequiredAppEntries(
  apps: unknown,
  waitingAppIds: ReadonlySet<string> = new Set(),
): CommandPanelEntry[] {
  return responseItems(apps).map((app, index) => {
    const { appId, title } = appIdentity(app, index);
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

export function projectAppEntries(value: unknown): CommandPanelEntry[] {
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

export function appConfigToggleAction(app: {
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

export interface AppListState {
  hasAccessibleField: boolean;
  accessible: boolean;
  hasEnabledField: boolean;
  enabled: boolean;
  installUrl: string;
  needsAuth: boolean;
}

export function appIdentity(app: Record<string, unknown>, index: number): {
  appId: string;
  appName: string;
  title: string;
} {
  const appId = fieldText(app, "id") || fieldText(app, "name") || `app-${index + 1}`;
  const appName = fieldText(app, "name") || appId;
  const title = fieldText(app, "title") || fieldText(app, "displayName") || appName;
  return { appId, appName, title };
}

export function appListState(app: Record<string, unknown>): AppListState {
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

export function connectorAuthDetail(state: AppListState): string {
  if (state.needsAuth) return "Auth: ChatGPT connector authorization required";
  if (state.hasAccessibleField) return state.accessible
    ? "Auth: accessible according to app/list"
    : "Auth: not accessible according to app/list";
  return "Auth: not reported by app/list";
}

export function connectorInstallDetail(state: AppListState): string {
  return state.installUrl ? "Install: browser setup URL available" : "Install: no browser setup URL returned";
}

export function connectorProtocolLimitedDetail(state: AppListState): string {
  const missingConnectMethod = !state.installUrl && (state.needsAuth || (state.hasAccessibleField && !state.accessible));
  return missingConnectMethod ? CONNECTOR_PROTOCOL_LIMITED_DETAIL : "";
}
