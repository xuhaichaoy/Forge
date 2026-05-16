import type { CodexJsonRpcClient } from "../lib/codex-json-rpc-client";

export const DESKTOP_APP_LIST_LIMIT = 1000;

export interface LoadAllAppsOptions {
  forceRefetch?: boolean;
  threadId?: string | null;
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
