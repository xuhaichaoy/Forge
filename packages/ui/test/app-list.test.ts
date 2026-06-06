import {
  DESKTOP_APP_LIST_LIMIT,
  appEnabledConfigEdit,
  appListInvalidationReasonForNotification,
  getAppListInvalidationVersion,
  invalidateAppList,
  invalidateAppListForNotification,
  loadAllApps,
  subscribeAppListInvalidation,
} from "../src/state/app-list";

export default async function runAppListTests(): Promise<void> {
  buildsLeafConfigEditForAppEnabledState();
  invalidatesAppListFromDesktopNotifications();
  await loadsPagedAppListWithDesktopLimit();
}

function buildsLeafConfigEditForAppEnabledState(): void {
  assertDeepEqual(
    appEnabledConfigEdit(" gmail ", true),
    {
      keyPath: "apps.gmail.enabled",
      value: true,
      mergeStrategy: "upsert",
    },
    "app enablement writes the leaf enabled key without replacing sibling app config",
  );
}

function invalidatesAppListFromDesktopNotifications(): void {
  const before = getAppListInvalidationVersion();
  const seen: Array<{ reason: string; version: number }> = [];
  const unsubscribe = subscribeAppListInvalidation((invalidation) => {
    seen.push(invalidation);
  });

  assertEqual(
    appListInvalidationReasonForNotification("app/list/updated"),
    null,
    "app/list/updated should not recursively force-refresh app-list backed surfaces",
  );
  assertEqual(
    appListInvalidationReasonForNotification("mcpServer/oauthLogin/completed"),
    "mcp-oauth-login-completed",
    "MCP OAuth completion should invalidate app-list backed surfaces",
  );
  assertEqual(
    appListInvalidationReasonForNotification("thread/started"),
    null,
    "unrelated notifications should not invalidate app-list backed surfaces",
  );

  const oauthInvalidation = invalidateAppListForNotification("mcpServer/oauthLogin/completed");
  const ignored = invalidateAppListForNotification("thread/started");
  const connectorCallback = invalidateAppList("app-connect-oauth-callback");
  unsubscribe();
  invalidateAppList("app-list-updated");

  assertDeepEqual(
    {
      oauthInvalidation,
      connectorCallback,
      ignored,
      seen,
    },
    {
      oauthInvalidation: { reason: "mcp-oauth-login-completed", version: before + 1 },
      connectorCallback: { reason: "app-connect-oauth-callback", version: before + 2 },
      ignored: null,
      seen: [
        { reason: "mcp-oauth-login-completed", version: before + 1 },
        { reason: "app-connect-oauth-callback", version: before + 2 },
      ],
    },
    "OAuth notifications and explicit callbacks should publish app-list invalidation versions",
  );
}

async function loadsPagedAppListWithDesktopLimit(): Promise<void> {
  const calls: Array<{ method: string; params: unknown }> = [];
  const client = {
    async request<T>(method: string, params: unknown): Promise<T> {
      calls.push({ method, params });
      if (calls.length === 1) {
        return { data: [{ id: "gmail" }], nextCursor: "page-2" } as T;
      }
      return { data: [{ id: "drive" }], nextCursor: null } as T;
    },
  };

  const result = await loadAllApps(client as never, { forceRefetch: true, threadId: "thread-1" });

  assertDeepEqual(
    result,
    { data: [{ id: "gmail" }, { id: "drive" }], nextCursor: null },
    "loadAllApps should flatten paged app/list results",
  );
  assertDeepEqual(
    calls,
    [
      {
        method: "app/list",
        params: {
          cursor: null,
          forceRefetch: true,
          limit: DESKTOP_APP_LIST_LIMIT,
          threadId: "thread-1",
        },
      },
      {
        method: "app/list",
        params: {
          cursor: "page-2",
          forceRefetch: true,
          limit: DESKTOP_APP_LIST_LIMIT,
          threadId: "thread-1",
        },
      },
    ],
    "loadAllApps should request each page with Desktop limit and forceRefetch passthrough",
  );
}

function assertEqual<T>(actual: T, expected: T, message: string): void {
  if (actual !== expected) {
    throw new Error(`${message}\nExpected: ${String(expected)}\nActual: ${String(actual)}`);
  }
}

function assertDeepEqual(actual: unknown, expected: unknown, message: string): void {
  const actualJson = JSON.stringify(actual, null, 2);
  const expectedJson = JSON.stringify(expected, null, 2);
  if (actualJson !== expectedJson) {
    throw new Error(`${message}\nExpected: ${expectedJson}\nActual: ${actualJson}`);
  }
}
