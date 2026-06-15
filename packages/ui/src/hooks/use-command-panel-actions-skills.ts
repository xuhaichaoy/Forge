/*
 * Skills panel flows (skill config write, skill/plugin-skill source read,
 * starter-skill creation) extracted verbatim from the useCommandPanelActions
 * callback bodies.
 */
import type { CodexJsonRpcClient } from "../lib/codex-json-rpc-client";
import { formatError } from "../lib/format";
import {
  projectCommandPanelEntries,
  projectPluginSkillReadResultEntries,
  projectSkillFileReadResultEntries,
  projectSkillManagementEntries,
  type CommandPanelEntry,
} from "../state/command-panel";
import {
  decodeBase64Utf8,
  encodeBase64Utf8,
} from "../state/app-shell-helpers";
import type { ThreadWorkflowDispatch } from "../state/thread-workflow";
import type { CommandPanelSink } from "./use-command-panel-actions-types";

export async function writeSkillConfigFromPanelFlow(
  {
    client,
    dispatch,
    ensureConnected,
    workspace,
  }: {
    client: CodexJsonRpcClient;
    dispatch: ThreadWorkflowDispatch;
    ensureConnected: () => Promise<boolean>;
    workspace: string;
  },
  action: Extract<NonNullable<CommandPanelEntry["action"]>, { type: "writeSkillConfig" }>,
  sink: CommandPanelSink,
): Promise<void> {
  const path = action.path?.trim();
  const name = action.name.trim();
  if (!path && !name) {
    const message = "Skill config write requires a skill path or name.";
    dispatch({ type: "log", text: message, level: "warn" });
    sink("skills", { status: "error", title: action.title, error: message, entries: [] });
    return;
  }
  sink("skills", {
    status: "loading",
    title: action.title,
    message: action.enabled ? "Enabling skill..." : "Disabling skill...",
    entries: [],
  });
  if (!(await ensureConnected())) {
    sink("skills", {
      status: "error",
      title: action.title,
      error: "Runtime is offline.",
      entries: [],
    });
    return;
  }
  try {
    const result = await client.request<{ effectiveEnabled?: boolean }>("skills/config/write", {
      path: path || null,
      name: path ? null : name,
      enabled: action.enabled,
    }, 120_000);
    const skills = await client.request<unknown>("skills/list", {
      cwds: workspace.trim() ? [workspace.trim()] : [],
      forceReload: true,
    }, 120_000);
    const effectiveEnabled = result.effectiveEnabled ?? action.enabled;
    sink("skills", {
      status: "ready",
      title: "Skills",
      message: `${action.name} ${effectiveEnabled ? "enabled" : "disabled"}.`,
      entries: projectCommandPanelEntries({ skills }),
    });
  } catch (error) {
    sink("skills", {
      status: "error",
      title: action.title,
      error: formatError(error),
      entries: [],
    });
  }
}

export async function readSkillFileFromPanelFlow(
  {
    client,
    dispatch,
    ensureConnected,
  }: {
    client: CodexJsonRpcClient;
    dispatch: ThreadWorkflowDispatch;
    ensureConnected: () => Promise<boolean>;
  },
  action: Extract<NonNullable<CommandPanelEntry["action"]>, { type: "readSkillFile" }>,
  sink: CommandPanelSink,
): Promise<void> {
  const path = action.path.trim();
  if (!path) {
    const message = "Skill source read requires a path.";
    dispatch({ type: "log", text: message, level: "warn" });
    sink("skills", { status: "error", title: action.title, error: message, entries: [] });
    return;
  }
  sink("skills", {
    status: "loading",
    title: action.title,
    message: "Reading skill source...",
    entries: [],
  });
  if (!(await ensureConnected())) {
    sink("skills", {
      status: "error",
      title: action.title,
      error: "Runtime is offline.",
      entries: [],
    });
    return;
  }
  try {
    const result = await client.request<{ dataBase64?: string }>("fs/readFile", { path }, 120_000);
    const contents = decodeBase64Utf8(result.dataBase64 ?? "");
    sink("skills", {
      status: "ready",
      title: action.title,
      message: "Skill source loaded from app-server.",
      entries: projectSkillFileReadResultEntries(path, contents),
    });
  } catch (error) {
    sink("skills", {
      status: "error",
      title: action.title,
      error: formatError(error),
      entries: [],
    });
  }
}

export async function createStarterSkillFromPanelFlow(
  {
    client,
    dispatch,
    ensureConnected,
    workspace,
  }: {
    client: CodexJsonRpcClient;
    dispatch: ThreadWorkflowDispatch;
    ensureConnected: () => Promise<boolean>;
    workspace: string;
  },
  action: Extract<NonNullable<CommandPanelEntry["action"]>, { type: "createStarterSkill" }>,
  sink: CommandPanelSink,
): Promise<void> {
  sink("skills", {
    status: "loading",
    title: action.title,
    message: "Creating starter skill...",
    entries: [],
  });
  if (!(await ensureConnected())) {
    sink("skills", {
      status: "error",
      title: action.title,
      error: "Runtime is offline.",
      entries: [],
    });
    return;
  }
  try {
    if (await fsPathExists(client, action.filePath)) {
      const message = `${action.filePath} already exists. Open it from Skills instead of overwriting it.`;
      dispatch({ type: "log", text: message, level: "warn" });
      sink("skills", {
        status: "error",
        title: action.title,
        error: message,
        entries: [],
      });
      return;
    }
    await client.request("fs/createDirectory", {
      path: action.directoryPath,
      recursive: true,
    }, 120_000);
    await client.request("fs/writeFile", {
      path: action.filePath,
      dataBase64: encodeBase64Utf8(action.contents),
    }, 120_000);
    const skills = await client.request<unknown>("skills/list", {
      cwds: workspace.trim() ? [workspace.trim()] : [],
      forceReload: true,
    }, 120_000);
    sink("skills", {
      status: "ready",
      title: "Skills",
      message: `${action.skillName} created. Edit ${action.filePath} to customize it.`,
      entries: projectSkillManagementEntries(skills, { workspace }),
    });
  } catch (error) {
    sink("skills", {
      status: "error",
      title: action.title,
      error: formatError(error),
      entries: [],
    });
  }
}

export async function readPluginSkillFromPanelFlow(
  {
    client,
    ensureConnected,
  }: {
    client: CodexJsonRpcClient;
    ensureConnected: () => Promise<boolean>;
  },
  action: Extract<NonNullable<CommandPanelEntry["action"]>, { type: "readPluginSkill" }>,
  sink: CommandPanelSink,
): Promise<void> {
  sink("skills", {
    status: "loading",
    title: action.title,
    message: "Reading plugin skill source...",
    entries: [],
  });
  if (!(await ensureConnected())) {
    sink("skills", {
      status: "error",
      title: action.title,
      error: "Runtime is offline.",
      entries: [],
    });
    return;
  }
  try {
    const result = await client.request<{ contents?: string | null }>("plugin/skill/read", {
      remoteMarketplaceName: action.remoteMarketplaceName,
      remotePluginId: action.remotePluginId,
      skillName: action.skillName,
    }, 120_000);
    sink("skills", {
      status: "ready",
      title: action.title,
      message: "Plugin skill source loaded from app-server.",
      entries: projectPluginSkillReadResultEntries(
        action.skillName,
        `${action.remoteMarketplaceName}:${action.remotePluginId}`,
        result.contents,
      ),
    });
  } catch (error) {
    sink("skills", {
      status: "error",
      title: action.title,
      error: formatError(error),
      entries: [],
    });
  }
}

async function fsPathExists(client: CodexJsonRpcClient, path: string): Promise<boolean> {
  try {
    await client.request("fs/getMetadata", { path }, 120_000);
    return true;
  } catch {
    return false;
  }
}
