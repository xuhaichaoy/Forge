/*
 * Connector app panel flows (app config write, connect-required-app OAuth
 * hand-off, external URL open) extracted verbatim from the
 * useCommandPanelActions callback bodies.
 */
import type { Dispatch, SetStateAction } from "react";
import type { CodexJsonRpcClient } from "../lib/codex-json-rpc-client";
import { formatError } from "../lib/format";
import { openExternalUrl } from "../lib/tauri-host";
import {
  projectCommandPanelEntries,
  type CommandPanelEntry,
  type CommandPanelState,
} from "../state/command-panel";
import {
  buildConfigBatchWriteParams,
  formatConfigWriteError,
  readConfigWriteTarget,
} from "../state/config-write-target";
import { appEnabledConfigEdit, loadAllApps } from "../state/app-list";
import { markAppConnectOAuthPending } from "../state/app-connect-oauth";
import type { ThreadWorkflowDispatch } from "../state/thread-workflow";
import type { CommandPanelSink } from "./use-command-panel-actions-types";

export async function writeAppConfigFromPanelFlow(
  {
    activeThreadId,
    client,
    ensureConnected,
    workspace,
  }: {
    activeThreadId: string | null;
    client: CodexJsonRpcClient;
    ensureConnected: () => Promise<boolean>;
    workspace: string;
  },
  action: Extract<NonNullable<CommandPanelEntry["action"]>, { type: "writeAppConfig" }>,
  sink: CommandPanelSink,
): Promise<void> {
  sink("apps", {
    status: "loading",
    title: action.title,
    message: action.enabled ? "Enabling app..." : "Disabling app...",
    entries: [],
  });
  if (!(await ensureConnected())) {
    sink("apps", {
      status: "error",
      title: action.title,
      error: "Runtime is offline.",
      entries: [],
    });
    return;
  }
  try {
    const edits = [appEnabledConfigEdit(action.appId, action.enabled)];
    const configWriteTarget = action.configWriteTarget
      ?? await readConfigWriteTarget(client, {
        cwd: workspace,
        keyPaths: edits.map((edit) => edit.keyPath),
        scope: "App config write",
      });
    await client.request("config/batchWrite", buildConfigBatchWriteParams({
      edits,
      target: configWriteTarget,
      reloadUserConfig: true,
    }), 120_000);
    const result = await loadAllApps(client, { forceRefetch: true, threadId: activeThreadId });
    sink("apps", {
      status: "ready",
      title: "Apps",
      message: `${action.appId} ${action.enabled ? "enabled" : "disabled"}.`,
      entries: projectCommandPanelEntries({ apps: result }),
    });
  } catch (error) {
    sink("apps", {
      status: "error",
      title: action.title,
      error: formatConfigWriteError(error, "App config write"),
      entries: [],
    });
  }
}

export async function connectRequiredAppFromPanelFlow(
  {
    dispatch,
    setCommandPanel,
  }: {
    dispatch: ThreadWorkflowDispatch;
    setCommandPanel: Dispatch<SetStateAction<CommandPanelState | null>>;
  },
  action: Extract<NonNullable<CommandPanelEntry["action"]>, { type: "connectRequiredApp" }>,
  sink: CommandPanelSink,
): Promise<void> {
  const url = action.installUrl?.trim();
  if (!url) {
    sink("apps", {
      status: "error",
      title: action.title,
      error: "This app-server build only exposes app/list metadata for this connector. No native connector OAuth method or browser setup URL is available.",
      entries: [],
    });
    return;
  }
  try {
    await openExternalUrl(url);
    const pendingOAuth = markAppConnectOAuthPending({
      appId: action.appId,
      appName: action.appName,
      redirectUrl: url,
    });
    const flowMessage = pendingOAuth
      ? "Finish the browser flow. Forge will refresh Apps or Plugins when the OAuth callback returns."
      : "Finish the browser flow, then refresh Apps or Plugins.";
    setCommandPanel((current) => current?.panel === "apps" || current?.panel === "plugins"
      ? {
          ...current,
          status: "ready",
          message: `${action.appName} setup URL opened. ${flowMessage}`,
          entries: current.entries.map((entry) => entryTracksAppConnectAction(entry, action.appId)
            ? {
                ...entry,
                status: "waiting for refresh",
                details: [
                  ...(entry.details ?? []).filter((detail) => !detail.startsWith("Finish the browser flow")),
                  flowMessage,
                ],
                secondaryActions: entry.secondaryActions?.map((secondary) => ({
                  ...secondary,
                  label: secondary.action.type === "connectRequiredApp" ? "Open again" : secondary.label,
                  tone: secondary.action.type === "connectRequiredApp" ? "default" : secondary.tone,
                })),
              }
            : entry),
        }
      : current);
    dispatch({
      type: "log",
      text: `${action.appName} setup URL opened. ${flowMessage}`,
      level: "info",
    });
  } catch (error) {
    dispatch({ type: "log", text: `${action.title} failed: ${formatError(error)}`, level: "error" });
    sink("apps", {
      status: "error",
      title: action.title,
      error: formatError(error),
      entries: [],
    });
  }
}

export async function openExternalUrlFromPanelFlow(
  {
    dispatch,
  }: {
    dispatch: ThreadWorkflowDispatch;
  },
  action: Extract<NonNullable<CommandPanelEntry["action"]>, { type: "openExternalUrl" }>,
  sink: CommandPanelSink,
): Promise<void> {
  try {
    await openExternalUrl(action.url);
    dispatch({ type: "log", text: `${action.title} opened.`, level: "info" });
  } catch (error) {
    dispatch({ type: "log", text: `${action.title} failed: ${formatError(error)}`, level: "error" });
    sink("apps", {
      status: "error",
      title: action.title,
      error: formatError(error),
      entries: [],
    });
  }
}

function entryTracksAppConnectAction(entry: CommandPanelEntry, appId: string): boolean {
  if (entry.id === `required-app:${appId}` || entry.id === `app:${appId}`) return true;
  return entry.secondaryActions?.some((secondary) =>
    secondary.action.type === "connectRequiredApp" && secondary.action.appId === appId
  ) ?? false;
}
