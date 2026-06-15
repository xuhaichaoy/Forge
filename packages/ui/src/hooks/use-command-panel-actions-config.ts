/*
 * Generic config-write and thread memory-mode flows extracted verbatim
 * from the useCommandPanelActions callback bodies.
 */
import type { CodexJsonRpcClient } from "../lib/codex-json-rpc-client";
import { formatError } from "../lib/format";
import type { CommandPanelEntry } from "../state/command-panel";
import {
  buildConfigBatchWriteParams,
  formatConfigWriteError,
  readConfigWriteTarget,
} from "../state/config-write-target";
import {
  refreshThreadContextDefaults,
  type ThreadWorkflowDispatch,
} from "../state/thread-workflow";
import type { CommandPanelSink } from "./use-command-panel-actions-types";

export async function writeConfigFromPanelFlow(
  {
    activeThreadId,
    activeTurnId,
    client,
    dispatch,
    ensureConnected,
    workspace,
  }: {
    activeThreadId: string | null;
    activeTurnId: string | null;
    client: CodexJsonRpcClient;
    dispatch: ThreadWorkflowDispatch;
    ensureConnected: () => Promise<boolean>;
    workspace: string;
  },
  action: Extract<NonNullable<CommandPanelEntry["action"]>, { type: "writeConfig" }>,
  sink: CommandPanelSink,
): Promise<void> {
  sink("generic", {
    status: "loading",
    title: action.title,
    message: "Saving configuration...",
    entries: [],
  });
  if (!(await ensureConnected())) {
    sink("generic", {
      status: "error",
      title: action.title,
      error: "Runtime is offline.",
      entries: [],
    });
    return;
  }
  try {
    const configWriteTarget = action.configWriteTarget
      ?? await readConfigWriteTarget(client, {
        cwd: workspace,
        keyPaths: action.edits.map((edit) => edit.keyPath),
      });
    await client.request("config/batchWrite", buildConfigBatchWriteParams({
      edits: action.edits,
      target: configWriteTarget,
      reloadUserConfig: action.reloadUserConfig ?? true,
    }), 120_000);
    await refreshThreadContextDefaults(client, dispatch, workspace);
    if (action.afterWrite?.type === "addPersonalityChangeSyntheticItem" && activeThreadId) {
      dispatch({
        type: "notification",
        message: {
          method: "item/completed",
          params: {
            threadId: activeThreadId,
            turnId: activeTurnId,
            item: {
              id: `personality-changed:${Date.now()}`,
              type: "personality-changed",
              personality: action.afterWrite.personality,
              completed: true,
            },
          },
        },
      });
    }
    sink("generic", {
      status: "ready",
      title: action.title,
      message: action.message,
      entries: [{
        id: "config:write:success",
        title: "Config updated",
        kind: "status",
        status: "saved",
        meta: action.message,
        details: action.edits.map((edit) => edit.keyPath),
      }],
    });
  } catch (error) {
    sink("generic", {
      status: "error",
      title: action.title,
      error: formatConfigWriteError(error, action.title),
      entries: [],
    });
  }
}

export async function setThreadMemoryModeFromPanelFlow(
  {
    client,
    ensureConnected,
  }: {
    client: CodexJsonRpcClient;
    ensureConnected: () => Promise<boolean>;
  },
  action: Extract<NonNullable<CommandPanelEntry["action"]>, { type: "setThreadMemoryMode" }>,
  sink: CommandPanelSink,
): Promise<void> {
  sink("generic", {
    status: "loading",
    title: action.title,
    message: "Updating memory mode...",
    entries: [],
  });
  if (!(await ensureConnected())) {
    sink("generic", {
      status: "error",
      title: action.title,
      error: "Runtime is offline.",
      entries: [],
    });
    return;
  }
  try {
    await client.request("thread/memoryMode/set", {
      threadId: action.threadId,
      mode: action.mode,
    }, 120_000);
    const enabled = action.mode === "enabled";
    sink("generic", {
      status: "ready",
      title: action.title,
      message: `Current chat memory generation ${enabled ? "enabled" : "disabled"}.`,
      entries: [{
        id: `memories:thread:${action.threadId}:saved`,
        title: "Current chat memory generation",
        kind: "status",
        status: action.mode,
        meta: `thread ${action.threadId}`,
        details: ["thread/memoryMode/set accepted by app-server."],
      }],
    });
  } catch (error) {
    sink("generic", {
      status: "error",
      title: action.title,
      error: formatError(error),
      entries: [],
    });
  }
}
