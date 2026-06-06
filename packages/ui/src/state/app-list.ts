import type { CodexJsonRpcClient } from "../lib/codex-json-rpc-client";
import { recordObject } from "./thread-item-fields";

export const DESKTOP_APP_LIST_LIMIT = 1000;

export type AppListInvalidationReason =
  | "app-list-updated"
  | "mcp-oauth-login-completed"
  | "app-connect-oauth-callback";

export interface AppConfigWriteEdit {
  keyPath: string;
  value: boolean;
  mergeStrategy: "upsert";
}

export interface AppListInvalidation {
  reason: AppListInvalidationReason;
  version: number;
}

export interface LoadAllAppsOptions {
  forceRefetch?: boolean;
  threadId?: string | null;
}

let appListInvalidationVersion = 0;
const appListInvalidationListeners = new Set<(invalidation: AppListInvalidation) => void>();

export function appEnabledConfigEdit(appId: string, enabled: boolean): AppConfigWriteEdit {
  return {
    keyPath: `apps.${appId.trim()}.enabled`,
    value: enabled,
    mergeStrategy: "upsert",
  };
}

export function appListInvalidationReasonForNotification(
  method: string,
): AppListInvalidationReason | null {
  if (method === "mcpServer/oauthLogin/completed") return "mcp-oauth-login-completed";
  return null;
}

export function invalidateAppList(reason: AppListInvalidationReason): AppListInvalidation {
  appListInvalidationVersion += 1;
  const invalidation = { reason, version: appListInvalidationVersion };
  appListInvalidationListeners.forEach((listener) => listener(invalidation));
  return invalidation;
}

export function invalidateAppListForNotification(method: string): AppListInvalidation | null {
  const reason = appListInvalidationReasonForNotification(method);
  return reason ? invalidateAppList(reason) : null;
}

export function getAppListInvalidationVersion(): number {
  return appListInvalidationVersion;
}

export function subscribeAppListInvalidation(
  listener: (invalidation: AppListInvalidation) => void,
): () => void {
  appListInvalidationListeners.add(listener);
  return () => {
    appListInvalidationListeners.delete(listener);
  };
}

export async function loadAllApps(
  client: CodexJsonRpcClient,
  options: LoadAllAppsOptions = {},
): Promise<unknown> {
  const data: unknown[] = [];
  let cursor: string | null = null;
  let sawPagedResponse = false;

  for (let page = 0; page < 20; page += 1) {
    const result: unknown = await client.request<unknown>("app/list", {
      cursor,
      forceRefetch: options.forceRefetch,
      limit: DESKTOP_APP_LIST_LIMIT,
      threadId: options.threadId ?? null,
    }, 120_000);
    if (!isRecord(result)) return result;
    const pageData = Array.isArray(result.data) ? result.data : null;
    if (!pageData) return result;
    sawPagedResponse = true;
    data.push(...pageData);
    const nextCursor: string | null = typeof result.nextCursor === "string" && result.nextCursor.trim()
      ? result.nextCursor
      : null;
    if (!nextCursor) break;
    cursor = nextCursor;
  }

  return sawPagedResponse ? { data, nextCursor: null } : { data: [] };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

export function appListRefreshMessage(reason: AppListInvalidationReason): string {
  if (reason === "app-connect-oauth-callback") return "Connector OAuth callback received.";
  if (reason === "mcp-oauth-login-completed") return "MCP OAuth login completed.";
  return "App list changed.";
}

export function mcpOauthLoginRefreshMessage(params: unknown): string {
  const payload = recordObject(params);
  const name = typeof payload.name === "string" && payload.name.trim()
    ? payload.name.trim()
    : "MCP server";
  if (payload.success === false) return `${name} OAuth login completed with an error.`;
  if (payload.success === true) return `${name} OAuth login completed.`;
  return "MCP OAuth login completed.";
}
