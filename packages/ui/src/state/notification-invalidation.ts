import type { JsonRpcNotification } from "@hicodex/codex-protocol";
import { accountRefreshScopeForNotification } from "./account-state";
import {
  appListRefreshMessage,
  invalidateAppListForNotification,
  mcpOauthLoginRefreshMessage,
} from "./app-list";
import type { NotificationInvalidationState } from "./codex-reducer";

export function applyInvalidation(
  invalidation: NotificationInvalidationState,
  message: JsonRpcNotification,
): NotificationInvalidationState {
  // Each block accumulates into `next` independently, mirroring the original
  // HiCodexApp's independent `if` blocks so a notification method can trigger
  // more than one counter (e.g. mcpServer/oauthLogin/completed bumps BOTH
  // appList AND mcpStatus; an early-return would drop the second bump).
  let next = invalidation;
  const appListInvalidation = invalidateAppListForNotification(message.method);
  if (appListInvalidation) {
    next = {
      ...next,
      appList: next.appList + 1,
      appListMessage: appListRefreshMessage(appListInvalidation.reason),
    };
  }
  if (accountRefreshScopeForNotification(message)) {
    const bumpsAuth = message.method === "account/login/completed" || message.method === "account/updated";
    next = {
      ...next,
      accountRefresh: next.accountRefresh + 1,
      authRefresh: bumpsAuth ? next.authRefresh + 1 : next.authRefresh,
    };
  }
  switch (message.method) {
    case "skills/changed":
      return { ...next, skills: next.skills + 1 };
    case "hook/completed":
      return { ...next, hooks: next.hooks + 1 };
    case "mcpServer/startupStatus/updated":
      return { ...next, mcpStatus: next.mcpStatus + 1, mcpStatusMessage: "MCP startup status changed." };
    case "mcpServer/oauthLogin/completed":
      return { ...next, mcpStatus: next.mcpStatus + 1, mcpStatusMessage: mcpOauthLoginRefreshMessage(message.params) };
    default:
      return next;
  }
}
