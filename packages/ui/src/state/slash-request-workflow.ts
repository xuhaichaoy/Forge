import type {
  CollaborationModeListResponse,
  Thread,
  ThreadBackgroundTerminalsCleanResponse,
  ThreadGoal,
  ThreadGoalClearResponse,
  ThreadGoalGetResponse,
  ThreadGoalSetResponse,
} from "@hicodex/codex-protocol";
import { CodexJsonRpcClient, type RpcDebugEvent } from "../lib/codex-json-rpc-client";
import { formatError, formatUnknown } from "../lib/format";
import { openExternalUrl } from "../lib/tauri-host";
import {
  logoutAndRefreshAccountState,
  type AccountState,
} from "./account-state";
import { loadAllApps } from "./app-list";
import { projectBackgroundTerminalEntries } from "./background-terminals";
import { buildInfoDetails, type HiCodexBuildInfo } from "./build-info";
import type { SlashCommandRequest } from "./composer-workflow";
import {
  projectCommandPanelEntries,
  projectFileSearchEntries,
  projectMcpServerEntries,
  projectPluginEntries,
  type CommandPanelEntry,
  type CommandPanelKind,
  type CommandPanelOptions,
  type CommandPanelSecondaryAction,
} from "./command-panel";
import type { LogLine, ThreadContextDefaults } from "./codex-reducer";
import { projectPersonalityCommandEntries } from "./personality";
import { projectRpcDebugEntries, rpcDebugPanelMessage } from "./rpc-debug";
import type { AccumulatedThreadItem } from "./render-groups";
import {
  effectiveThreadMemoryPreferences,
  forkThread,
  resumeThread,
  startSideConversation,
  type ThreadWorkflowDispatch,
} from "./thread-workflow";
import {
  UI_THEME_MODES,
  nextToggleThemeMode,
  themeModeDescription,
  themeModeLabel,
  type UiThemeSnapshot,
} from "./theme";

export interface SlashRequestWorkflowContext {
  client: CodexJsonRpcClient;
  dispatch: ThreadWorkflowDispatch;
  ensureConnected: () => Promise<boolean>;
  openCommandPanel: (panel: CommandPanelKind, options?: CommandPanelOptions) => void;
  openRenameThreadDialog?: (thread: Thread) => void;
  workspace: string;
  defaultCwd?: string;
  activeThread: Thread | null;
  activeThreadId: string | null;
  activeTurnId: string | null;
  activeItems?: AccumulatedThreadItem[];
  connected: boolean;
  pid?: number | null;
  modelCount: number;
  pendingRequestCount: number;
  threads: Thread[];
  threadContextDefaults?: ThreadContextDefaults | null;
  openSideConversationPanel?: (thread: Thread) => void;
  accountState?: AccountState;
  setAccountState?: (state: AccountState) => void;
  uiTheme?: UiThemeSnapshot;
  logs?: LogLine[];
  rpcDebugEvents?: RpcDebugEvent[];
  buildInfo?: HiCodexBuildInfo;
  onToggleStatusFooter?: () => void;
}

export async function runSlashRequestWorkflow(
  request: SlashCommandRequest,
  payload: Record<string, unknown> | undefined,
  context: SlashRequestWorkflowContext,
) {
  const {
    client,
    dispatch,
    ensureConnected,
    openCommandPanel,
    openRenameThreadDialog,
    workspace,
    defaultCwd,
    activeThread,
    activeThreadId,
    activeTurnId,
    activeItems = [],
    connected,
    pid,
    modelCount,
    pendingRequestCount,
    threads,
    threadContextDefaults = null,
    openSideConversationPanel,
    accountState,
    setAccountState,
    uiTheme,
    logs = [],
    rpcDebugEvents = [],
    buildInfo,
    onToggleStatusFooter,
  } = context;

  try {
    if (request === "showTheme") {
      openCommandPanel("theme", {
        status: "ready",
        title: "Theme",
        message: themePanelMessage(uiTheme),
        entries: projectThemeCommandEntries(uiTheme),
      });
      return;
    }

    if (request === "toggleStatusFooter") {
      onToggleStatusFooter?.();
      return;
    }

    if (request === "showFeedback") {
      openCommandPanel("generic", {
        status: "ready",
        title: "Feedback",
        message: "Prepare a Codex feedback report. Include the diagnostics when opening a GitHub issue.",
        entries: projectFeedbackCommandEntries({
          activeThreadId,
          activeTurnId,
          connected,
          logs,
          workspace: workspace.trim() || defaultCwd || "",
        }),
      });
      return;
    }

    if (request === "showRpcInspector") {
      const entries = projectRpcDebugEntries(rpcDebugEvents);
      openCommandPanel("generic", {
        status: entries.length > 0 ? "ready" : "empty",
        title: "RPC inspector",
        message: rpcDebugPanelMessage(rpcDebugEvents),
        entries,
      });
      return;
    }

    if (!(await ensureConnected())) return;

    switch (request) {
      case "resumeThread": {
        const threadId = stringPayload(payload, "threadId");
        if (!threadId) {
          dispatch({ type: "log", text: "Select a thread from the sidebar to resume it.", level: "info" });
          return;
        }
        const result = await resumeThread(client, threadId, workspace.trim() || defaultCwd || "", threadContextDefaults);
        dispatch({ type: "setThreads", threads: [result.thread, ...threads.filter((thread) => thread.id !== result.thread.id)] });
        dispatch({ type: "setActiveThread", threadId: result.thread.id });
        dispatch({ type: "notification", message: { method: "thread/started", params: { thread: result.thread } } });
        return;
      }
      case "compactThread": {
        const threadId = requireActiveThreadId(request, activeThreadId, dispatch);
        if (!threadId) return;
        await client.request("thread/compact/start", { threadId }, 120_000);
        dispatch({ type: "log", text: "Started context compaction for the active thread.", level: "info" });
        return;
      }
      case "startReview": {
        const threadId = requireActiveThreadId(request, activeThreadId, dispatch);
        if (!threadId) return;
        const instructions = stringPayload(payload, "instructions");
        await client.request("review/start", {
          threadId,
          target: instructions ? { type: "custom", instructions } : { type: "uncommittedChanges" },
          delivery: "inline",
        }, 120_000);
        dispatch({ type: "log", text: "Started review on the active thread.", level: "info" });
        return;
      }
      case "showDiff": {
        const cwd = workspace.trim() || defaultCwd || "";
        if (!cwd) {
          dispatch({ type: "log", text: "No workspace cwd is available for /diff.", level: "warn" });
          return;
        }
        openCommandPanel("diff", { status: "loading", entries: [] });
        const result = await client.request<{ diff?: string; sha?: string }>("gitDiffToRemote", { cwd }, 120_000);
        const diff = result.diff?.trim() ?? "";
        openCommandPanel("diff", {
          status: "ready",
          message: diff ? `${diffLineCount(diff)} changed diff line(s)` : "Current workspace has no git diff.",
          entries: diff
            ? [{
                id: "diff:workspace",
                title: result.sha ? `Workspace diff against ${result.sha}` : "Workspace diff",
                kind: "diff",
                meta: cwd,
                details: diff.split("\n").slice(0, 80),
              }]
            : [],
        });
        return;
      }
      case "showStatus": {
        openCommandPanel("status", {
          status: "ready",
          entries: [{
            id: "status:runtime",
            title: "Runtime",
            kind: "status",
            status: connected ? "connected" : "offline",
            meta: `pid ${pid ?? "none"}`,
            details: [
              `Thread: ${activeThreadId ?? "none"}`,
              `Turn: ${activeTurnId ?? "none"}`,
              `CWD: ${workspace.trim() || defaultCwd || "none"}`,
              `Models: ${modelCount}`,
              `Pending requests: ${pendingRequestCount}`,
            ],
          }],
        });
        return;
      }
      case "forkThread": {
        const threadId = requireActiveThreadId(request, activeThreadId, dispatch);
        if (!threadId) return;
        const result = await forkThread(
          client,
          threadId,
          activeThread?.cwd || workspace.trim() || defaultCwd || "",
          threadContextDefaults,
        );
        dispatch({ type: "setThreads", threads: [result.thread, ...threads.filter((thread) => thread.id !== result.thread.id)] });
        dispatch({ type: "setActiveThread", threadId: result.thread.id });
        dispatch({ type: "notification", message: { method: "thread/started", params: { thread: result.thread } } });
        dispatch({ type: "log", text: `Forked active thread to ${result.thread.id}.`, level: "info" });
        return;
      }
      case "renameThread": {
        const threadId = requireActiveThreadId(request, activeThreadId, dispatch);
        if (!threadId) return;
        const name = stringPayload(payload, "name");
        if (!name.trim()) {
          if (activeThread && openRenameThreadDialog) {
            openRenameThreadDialog(activeThread);
          } else {
            dispatch({ type: "log", text: "Select a thread before renaming it.", level: "info" });
          }
          return;
        }
        await client.request("thread/name/set", { threadId, name: name.trim() });
        dispatch({
          type: "setThreads",
          threads: threads.map((thread) => thread.id === threadId ? { ...thread, name: name.trim() } : thread),
        });
        dispatch({ type: "log", text: `Renamed active thread to ${name.trim()}.`, level: "info" });
        return;
      }
      case "reloadMcp":
      case "listMcp": {
        const requestedDetail = stringPayload(payload, "detail").toLowerCase();
        const detail = requestedDetail === "tools" || requestedDetail === "toolsandauthonly" ? "toolsAndAuthOnly" : "full";
        openCommandPanel("mcp", { status: "loading", entries: [] });
        await client.request("config/mcpServer/reload", undefined, 120_000);
        const result = await client.request<unknown>("mcpServerStatus/list", { limit: 50, detail }, 120_000);
        openCommandPanel("mcp", {
          status: "ready",
          entries: projectMcpServerEntries(result),
          message: "Select a callable MCP tool to run it, or a resource to read it.",
        });
        return;
      }
      case "listSkills": {
        const detail = stringPayload(payload, "detail").toLowerCase();
        const forceReload = detail === "reload" || detail === "refresh" || detail === "force";
        openCommandPanel("skills", { status: "loading", entries: [] });
        const result = await client.request<unknown>("skills/list", {
          cwds: workspace.trim() ? [workspace.trim()] : [],
          forceReload,
        });
        openCommandPanel("skills", {
          status: "ready",
          entries: projectCommandPanelEntries({ skills: result }),
          message: forceReload
            ? "Reloaded skills from disk. Select a skill to attach it to the next message."
            : "Select a skill to attach it to the next message.",
        });
        return;
      }
      case "listHooks": {
        openCommandPanel("hooks", { status: "loading", entries: [] });
        const result = await client.request<unknown>("hooks/list", {
          cwds: workspace.trim() ? [workspace.trim()] : [],
        });
        openCommandPanel("hooks", { status: "ready", entries: projectCommandPanelEntries({ hooks: result }) });
        return;
      }
      case "listApps": {
        openCommandPanel("apps", { status: "loading", entries: [] });
        const result = await loadAllApps(client, { threadId: activeThreadId });
        openCommandPanel("apps", { status: "ready", entries: projectCommandPanelEntries({ apps: result }) });
        return;
      }
      case "listPlugins": {
        openCommandPanel("plugins", { status: "loading", entries: [] });
        const result = await client.request<unknown>("plugin/list", {
          cwds: workspace.trim() ? [workspace.trim()] : null,
        });
        openCommandPanel("plugins", { status: "ready", entries: projectPluginEntries(result) });
        return;
      }
      case "loginChatgpt": {
        // Codex protocol `account/login/start` (v2 LoginAccountParams.ts):
        //   { type: "chatgpt" } → backend returns { loginId, authUrl }
        // We open the authUrl in the system browser via Tauri's openExternalUrl.
        // Backend asynchronously receives the OAuth callback and dispatches an
        // `account/login/completed` notification (codex-reducer.ts handles it
        // and refreshes account state). National IPs blocked by chatgpt.com
        // require a VPN — this is a network-layer concern, not a code issue.
        try {
          const result = await client.request<{
            type: string;
            loginId?: string;
            authUrl?: string;
          }>("account/login/start", { type: "chatgpt" }, 120_000);
          if (result?.type !== "chatgpt" || !result.authUrl) {
            dispatch({
              type: "log",
              text: `account/login/start returned unexpected response: ${JSON.stringify(result)}`,
              level: "warn",
            });
            return;
          }
          await openExternalUrl(result.authUrl);
          dispatch({
            type: "log",
            text: "Opened ChatGPT sign-in in your browser. Complete login there — HiCodex will pick up the token automatically.",
            level: "info",
          });
        } catch (error) {
          dispatch({
            type: "log",
            text: `Login failed: ${formatError(error)}`,
            level: "error",
          });
        }
        return;
      }
      case "logout": {
        const nextAccountState = await logoutAndRefreshAccountState(client, accountState);
        setAccountState?.(nextAccountState);
        dispatch({ type: "log", text: "Logged out from the current Codex account.", level: "info" });
        return;
      }
      case "exitApp":
        dispatch({ type: "log", text: "Use the macOS window close button to quit HiCodex during development.", level: "info" });
        return;
      case "copyLastAnswer":
        dispatch({ type: "log", text: "Copy last answer is queued for the transcript action toolbar.", level: "info" });
        return;
      case "showSideConversation": {
        const threadId = requireActiveThreadId(request, activeThreadId, dispatch);
        if (!threadId) return;
        const cwd = activeThread?.cwd || workspace.trim() || defaultCwd || "";
        const result = await startSideConversation(
          client,
          threadId,
          cwd,
          threadContextDefaults,
          stringPayload(payload, "prompt"),
        );
        dispatch({ type: "upsertThread", thread: result.thread, select: false });
        openSideConversationPanel?.(result.thread);
        dispatch({ type: "log", text: `Opened side chat ${shortThreadId(result.thread.id)}.`, level: "info" });
        return;
      }
      case "approveGuardianDeniedAction":
        dispatch({
          type: "log",
          text: "/approve is registered, but HiCodex still needs to persist the guardian denial event before it can call thread/approveGuardianDeniedAction.",
          level: "warn",
        });
        return;
      case "showExperimental": {
        openCommandPanel("experimental", { status: "loading", entries: [] });
        const result = await client.request<unknown>(
          "experimentalFeature/list",
          { limit: 50, threadId: activeThreadId ?? null },
          120_000,
        );
        openCommandPanel("experimental", { status: "ready", entries: projectCommandPanelEntries({ experimental: result }) });
        return;
      }
      case "showCollaborationModes": {
        openCommandPanel("collaboration", { status: "loading", entries: [] });
        const result = await client.request<CollaborationModeListResponse>("collaborationMode/list", {}, 120_000);
        openCommandPanel("collaboration", {
          status: "ready",
          entries: projectCommandPanelEntries({ collaboration: result }),
        });
        return;
      }
      case "showGoal": {
        const threadId = requireActiveThreadId(request, activeThreadId, dispatch);
        if (!threadId) return;
        await handleGoalRequest(client, openCommandPanel, threadId, stringPayload(payload, "objective"));
        return;
      }
      case "cleanBackgroundTerminals": {
        const threadId = requireActiveThreadId(request, activeThreadId, dispatch);
        if (!threadId) return;
        openCommandPanel("status", { status: "loading", title: "Background terminals", entries: [] });
        await client.request<ThreadBackgroundTerminalsCleanResponse>(
          "thread/backgroundTerminals/clean",
          { threadId },
          120_000,
        );
        openCommandPanel("status", {
          status: "ready",
          title: "Background terminals",
          message: "Background terminal cleanup requested.",
          entries: [{
            id: `background-terminals:${threadId}`,
            title: "Background terminals",
            kind: "status",
            status: "cleanup requested",
            meta: `thread ${threadId}`,
          }],
        });
        return;
      }
      case "showProcesses": {
        const entries = projectBackgroundTerminalEntries(activeItems);
        openCommandPanel("status", {
          status: entries.length > 0 ? "ready" : "empty",
          title: "Background terminals",
          message: entries.length > 0
            ? `${entries.length} background terminal(s) running.`
            : "No background terminals running.",
          entries,
        });
        return;
      }
      case "showPersonality": {
        openCommandPanel("generic", {
          status: "ready",
          title: "Personality",
          message: "Choose a default tone for Codex responses.",
          entries: projectPersonalityCommandEntries(threadContextDefaults),
        });
        return;
      }
      case "showMemories": {
        openCommandPanel("generic", {
          status: "ready",
          title: "Memories",
          message: "Configure memory defaults, or update whether the current chat can generate future memories.",
          entries: projectMemoryCommandEntries(activeThreadId, threadContextDefaults),
        });
        return;
      }
      case "showMentionPicker": {
        await handleMentionSearch(
          client,
          openCommandPanel,
          stringPayload(payload, "query"),
          activeThread?.cwd?.trim() || workspace.trim() || defaultCwd || "",
        );
        return;
      }
      case "showDebugConfig": {
        const cwd = workspace.trim() || defaultCwd || "";
        openCommandPanel("generic", {
          status: "loading",
          title: "Debug config",
          message: "Reading effective Codex config...",
          entries: [],
        });
        const result = await client.request<unknown>("config/read", {
          includeLayers: true,
          cwd: cwd || null,
        }, 120_000);
        const entries = projectDebugConfigEntries(result, cwd, buildInfo);
        openCommandPanel("generic", {
          status: entries.length > 0 ? "ready" : "empty",
          title: "Debug config",
          message: entries.length > 0 ? "Effective config and config layers from app-server." : "No config data returned.",
          entries,
        });
        return;
      }
      default:
        dispatch({
          type: "log",
          text: `${request} is registered in the composer and will be wired to its dedicated panel next.`,
          level: "warn",
        });
    }
  } catch (error) {
    dispatch({ type: "log", text: formatError(error), level: "error" });
    openCommandPanel("generic", {
      status: "error",
      error: formatError(error),
      entries: [],
    });
  }
}

async function handleGoalRequest(
  client: SlashRequestWorkflowContext["client"],
  openCommandPanel: SlashRequestWorkflowContext["openCommandPanel"],
  threadId: string,
  objective: string,
) {
  const trimmedObjective = objective.trim();
  openCommandPanel("status", { status: "loading", title: "Goal", entries: [] });

  if (trimmedObjective.toLowerCase() === "clear") {
    const result = await client.request<ThreadGoalClearResponse>("thread/goal/clear", { threadId }, 120_000);
    openCommandPanel("status", {
      status: "ready",
      title: "Goal",
      message: result.cleared ? "Cleared the current thread goal." : "No goal was set for this thread.",
      entries: [{
        id: `goal:${threadId}:clear`,
        title: result.cleared ? "Goal cleared" : "No goal to clear",
        kind: "status",
        status: result.cleared ? "cleared" : "empty",
        meta: `thread ${threadId}`,
      }],
    });
    return;
  }

  if (trimmedObjective) {
    const result = await client.request<ThreadGoalSetResponse>(
      "thread/goal/set",
      { threadId, objective: trimmedObjective },
      120_000,
    );
    openCommandPanel("status", {
      status: "ready",
      title: "Goal",
      message: "Updated the current thread goal.",
      entries: [goalPanelEntry(result.goal)],
    });
    return;
  }

  const result = await client.request<ThreadGoalGetResponse>("thread/goal/get", { threadId }, 120_000);
  if (!result.goal) {
    openCommandPanel("status", {
      status: "empty",
      title: "Goal",
      message: "No goal is set for this thread.",
      entries: [],
    });
    return;
  }
  openCommandPanel("status", {
    status: "ready",
    title: "Goal",
    entries: [goalPanelEntry(result.goal)],
  });
}

function goalPanelEntry(goal: ThreadGoal): CommandPanelEntry {
  return {
    id: `goal:${goal.threadId}`,
    title: goal.objective,
    kind: "status",
    status: goal.status,
    meta: goal.tokenBudget === null
      ? `${goal.tokensUsed} tokens`
      : `${goal.tokensUsed}/${goal.tokenBudget} tokens`,
    details: cleanGoalDetails([
      `Thread: ${goal.threadId}`,
      `Time used: ${formatGoalDuration(goal.timeUsedSeconds)}`,
      `Created: ${formatGoalTimestamp(goal.createdAt)}`,
      `Updated: ${formatGoalTimestamp(goal.updatedAt)}`,
    ]),
  };
}

function cleanGoalDetails(values: string[]): string[] {
  return values.map((value) => value.trim()).filter(Boolean);
}

function projectMemoryCommandEntries(
  activeThreadId: string | null,
  context: ThreadContextDefaults | null,
): CommandPanelEntry[] {
  const preferences = effectiveThreadMemoryPreferences(context);
  const entries: CommandPanelEntry[] = [{
    id: "memories:defaults",
    title: "New chats",
    kind: "status",
    status: memorySummary(preferences.useMemories, preferences.generateMemories),
    // codex: subtitle aligned to upstream
    //   composer.memoriesSlashCommand.newThreadDialogSubtitle =
    //     "These switches apply to the chat started from this composer"
    meta: "These switches apply to the chat started from this composer",
    // codex: detail bullets align to upstream ICU defaults —
    //   composer.memoriesSlashCommand.useMemoriesDescription      = "Let Codex bring existing memories into this chat's context"
    //   composer.memoriesSlashCommand.generateMemoriesDescription = "Allow Codex to use this chat when creating new memories later"
    details: [
      "Use memories: Let Codex bring existing memories into this chat's context",
      "Generate memories: Allow Codex to use this chat when creating new memories later",
    ],
    secondaryActions: [
      memoryConfigAction("use", !preferences.useMemories),
      memoryConfigAction("generate", !preferences.generateMemories),
    ],
  }];

  if (activeThreadId) {
    entries.push({
      id: `memories:thread:${activeThreadId}`,
      // codex: panel title aligned to upstream
      //   composer.memoriesSlashCommand.dialogTitle = "Chat memories"
      title: "Chat memories",
      kind: "status",
      // codex: subtitle aligned to upstream
      //   composer.memoriesSlashCommand.existingThreadDialogSubtitle = "These switches apply to the current chat"
      status: "These switches apply to the current chat",
      meta: `thread ${activeThreadId}`,
      // codex: first bullet aligns to upstream
      //   composer.memoriesSlashCommand.useMemoriesStartedDescription = "Cannot be changed after conversation has started"
      details: [
        "Use memories: Cannot be changed after conversation has started",
        "Generate memories controls whether this chat remains eligible for future memory generation.",
      ],
      secondaryActions: [
        {
          id: `memories:thread:${activeThreadId}:enable`,
          label: "Enable",
          title: "Enable memory generation for this chat",
          tone: "success",
          action: {
            type: "setThreadMemoryMode",
            title: "Memories",
            threadId: activeThreadId,
            mode: "enabled",
          },
        },
        {
          id: `memories:thread:${activeThreadId}:disable`,
          label: "Disable",
          title: "Disable memory generation for this chat",
          tone: "danger",
          action: {
            type: "setThreadMemoryMode",
            title: "Memories",
            threadId: activeThreadId,
            mode: "disabled",
          },
        },
      ],
    });
  }

  return entries;
}

function memoryConfigAction(kind: "use" | "generate", enabled: boolean): CommandPanelSecondaryAction {
  const title = kind === "use" ? "Use memories" : "Generate memories";
  const keyPath = kind === "use" ? "memories.use_memories" : "memories.generate_memories";
  return {
    id: `memories:defaults:${kind}:${enabled ? "on" : "off"}`,
    label: enabled ? "Turn on" : "Turn off",
    title: `${enabled ? "Enable" : "Disable"} ${title.toLowerCase()}`,
    tone: enabled ? "success" : "danger",
    action: {
      type: "writeConfig",
      title: "Memories",
      message: `${title} ${enabled ? "enabled" : "disabled"} for new chats.`,
      edits: [{ keyPath, value: enabled, mergeStrategy: "upsert" }],
      reloadUserConfig: true,
    },
  };
}

function memorySummary(useMemories: boolean, generateMemories: boolean): string {
  return `use ${useMemories ? "on" : "off"} · generate ${generateMemories ? "on" : "off"}`;
}

function projectDebugConfigEntries(
  value: unknown,
  cwd: string,
  buildInfo?: HiCodexBuildInfo,
): CommandPanelEntry[] {
  const buildEntry = buildInfo ? [projectBuildInfoEntry(buildInfo)] : [];
  const root = recordValue(value);
  if (!root) {
    return [
      ...buildEntry,
      {
        id: "debug-config:raw",
        title: "Config response",
        kind: "status",
        meta: cwd || "global config",
        details: [formatUnknown(value)],
        action: {
          type: "copyText",
          title: "Debug config",
          label: "Debug config",
          text: compactDebugJson(value),
        },
      },
    ];
  }

  const effectiveConfig = firstRecordField(root, ["config", "settings", "effective", "effectiveConfig"]) ?? root;
  const layers = firstArrayField(root, ["layers", "configLayers", "config_layers"]);
  const entries: CommandPanelEntry[] = [...buildEntry, {
    id: "debug-config:effective",
    title: "Effective config",
    kind: "status",
    status: `${Object.keys(effectiveConfig).length} key(s)`,
    meta: cwd || "global config",
    details: summarizeDebugConfig(effectiveConfig),
    action: {
      type: "copyText",
      title: "Debug config",
      label: "Debug config",
      text: compactDebugJson(value),
    },
  }];

  layers.forEach((layer, index) => {
    const layerConfig = firstRecordField(layer, ["config", "settings", "values"]) ?? layer;
    entries.push({
      id: `debug-config:layer:${index}`,
      title: debugLayerTitle(layer, index),
      kind: "status",
      status: debugLayerStatus(layer),
      meta: debugLayerMeta(layer),
      details: summarizeDebugConfig(layerConfig),
    });
  });

  return entries;
}

function projectBuildInfoEntry(buildInfo: HiCodexBuildInfo): CommandPanelEntry {
  return {
    id: "debug-config:build",
    title: "HiCodex build",
    kind: "status",
    status: `${buildInfo.flavor} / ${buildInfo.channel}`,
    meta: buildInfo.version,
    details: buildInfoDetails(buildInfo),
    action: {
      type: "copyText",
      title: "Build info",
      label: "Build info",
      text: JSON.stringify(buildInfo, null, 2),
    },
  };
}

function summarizeDebugConfig(config: Record<string, unknown>): string[] {
  const preferredKeys = [
    "model",
    "model_provider",
    "approval_policy",
    "approvals_reviewer",
    "sandbox_mode",
    "profile",
    "model_reasoning_effort",
    "model_reasoning_summary",
    "instructions",
    "developer_instructions",
  ];
  const details: string[] = [];
  const seen = new Set<string>();
  for (const key of preferredKeys) {
    const formatted = debugConfigDetail(config, key);
    if (!formatted) continue;
    seen.add(key);
    details.push(formatted);
  }
  const memories = recordField(config, "memories");
  if (memories) {
    for (const key of ["use_memories", "generate_memories"]) {
      const formatted = debugConfigDetail(memories, key, `memories.${key}`);
      if (formatted) details.push(formatted);
    }
  }
  for (const [key, value] of Object.entries(config)) {
    if (details.length >= 10) break;
    if (seen.has(key) || key === "memories") continue;
    const formatted = formatDebugValue(value);
    if (formatted) details.push(`${key}: ${formatted}`);
  }
  return details.length > 0 ? details : ["No scalar config values returned."];
}

function debugConfigDetail(config: Record<string, unknown>, key: string, label = key): string {
  const formatted = formatDebugValue(config[key]);
  return formatted ? `${label}: ${formatted}` : "";
}

function formatDebugValue(value: unknown): string {
  if (typeof value === "string") return truncateDebugValue(value.trim());
  if (typeof value === "number" || typeof value === "boolean") return String(value);
  if (value === null) return "null";
  return "";
}

function truncateDebugValue(value: string): string {
  if (!value) return "";
  return value.length > 160 ? `${value.slice(0, 157)}...` : value;
}

function debugLayerTitle(layer: Record<string, unknown>, index: number): string {
  return fieldText(layer, "name")
    || fieldText(layer, "source")
    || fieldText(layer, "path")
    || `Config layer ${index + 1}`;
}

function debugLayerStatus(layer: Record<string, unknown>): string | undefined {
  return fieldText(layer, "status")
    || fieldText(layer, "kind")
    || (layer.enabled === false ? "disabled" : undefined);
}

function debugLayerMeta(layer: Record<string, unknown>): string | undefined {
  return fieldText(layer, "path")
    || fieldText(layer, "cwd")
    || fieldText(layer, "profile")
    || undefined;
}

function formatGoalDuration(seconds: number): string {
  if (!Number.isFinite(seconds) || seconds <= 0) return "0s";
  if (seconds < 60) return `${Math.round(seconds)}s`;
  const minutes = Math.floor(seconds / 60);
  const remainingSeconds = Math.round(seconds % 60);
  return remainingSeconds > 0 ? `${minutes}m ${remainingSeconds}s` : `${minutes}m`;
}

function formatGoalTimestamp(seconds: number): string {
  if (!Number.isFinite(seconds) || seconds <= 0) return "unknown";
  return new Date(seconds * 1_000).toLocaleString();
}

function themePanelMessage(snapshot: UiThemeSnapshot | undefined): string {
  if (!snapshot) return "Choose the UI appearance. The selection is saved locally.";
  return `Choose the UI appearance. Current mode: ${themeModeLabel(snapshot.mode)}; resolved: ${snapshot.resolved}.`;
}

function projectThemeCommandEntries(snapshot: UiThemeSnapshot | undefined): CommandPanelEntry[] {
  const currentMode = snapshot?.mode ?? "system";
  const resolved = snapshot?.resolved ?? "light";
  const toggleMode = nextToggleThemeMode(resolved);
  const toggleTitle = toggleMode === "dark" ? "Switch to dark theme" : "Switch to light theme";
  return [
    {
      id: "theme:toggle",
      title: toggleTitle,
      kind: "theme",
      status: "toggle",
      meta: `Current resolved theme is ${resolved}.`,
      action: {
        type: "setUiTheme",
        title: toggleTitle,
        mode: toggleMode,
      },
    },
    ...UI_THEME_MODES.map((mode): CommandPanelEntry => ({
      id: `theme:${mode}`,
      title: themeModeLabel(mode),
      kind: "theme",
      status: mode === currentMode ? "current" : undefined,
      meta: themeModeDescription(mode, resolved),
      disabled: mode === currentMode,
      action: mode === currentMode
        ? undefined
        : {
            type: "setUiTheme",
            title: `Use ${themeModeLabel(mode)} theme`,
            mode,
          },
    })),
  ];
}

function projectFeedbackCommandEntries(input: {
  activeThreadId: string | null;
  activeTurnId: string | null;
  connected: boolean;
  logs: LogLine[];
  workspace: string;
}): CommandPanelEntry[] {
  const diagnostics = feedbackDiagnosticsText(input);
  const threadSuffix = input.activeThreadId ? `thread ${shortThreadId(input.activeThreadId)}` : "no active thread";
  return [
    {
      id: "feedback:copy-diagnostics",
      title: "Copy feedback diagnostics",
      kind: "status",
      status: "recommended",
      meta: threadSuffix,
      details: [
        "Copies thread id, workspace, runtime status, and recent UI logs.",
        "Matches Codex Desktop's include-session-logs intent without uploading logs from HiCodex.",
      ],
      action: {
        type: "copyText",
        title: "Feedback diagnostics",
        label: "Feedback diagnostics",
        text: diagnostics,
      },
    },
    {
      id: "feedback:open-github",
      title: "Open Codex GitHub issue",
      kind: "status",
      status: "browser",
      meta: "github.com/openai/codex",
      details: [
        "Paste the copied diagnostics into the issue body.",
        input.activeThreadId ? `Thread: ${input.activeThreadId}` : "No active thread selected.",
      ],
      action: {
        type: "openExternalUrl",
        title: "Open Codex GitHub issue",
        url: feedbackIssueUrl(input.activeThreadId),
      },
    },
  ];
}

function feedbackDiagnosticsText(input: {
  activeThreadId: string | null;
  activeTurnId: string | null;
  connected: boolean;
  logs: LogLine[];
  workspace: string;
}): string {
  const recentLogs = input.logs.slice(0, 12).map((log) => (
    `- [${log.level}] ${new Date(log.at).toISOString()} ${log.text}`
  ));
  return [
    "HiCodex feedback diagnostics",
    `Thread: ${input.activeThreadId ?? "none"}`,
    `Turn: ${input.activeTurnId ?? "none"}`,
    `Workspace: ${input.workspace || "none"}`,
    `Runtime connected: ${input.connected ? "yes" : "no"}`,
    "",
    "Recent UI logs:",
    ...(recentLogs.length > 0 ? recentLogs : ["- none"]),
  ].join("\n");
}

function feedbackIssueUrl(threadId: string | null): string {
  const steps = `feedback: ${threadId ?? "no-active-thread"}`;
  return `https://github.com/openai/codex/issues/new?template=1-codex-app.yml&steps=${encodeURIComponent(steps)}`;
}

async function handleMentionSearch(
  client: CodexJsonRpcClient,
  openCommandPanel: SlashRequestWorkflowContext["openCommandPanel"],
  query: string,
  cwd: string,
) {
  if (!query || !cwd) {
    openCommandPanel("generic", {
      status: "empty",
      message: "Type /mention <query> to search workspace files, or use + Add photos & files to attach local files.",
      entries: [],
    });
    return;
  }
  openCommandPanel("generic", { status: "loading", title: "Files", entries: [], message: "Searching files…" });
  const result = await client.request<{ files?: Array<{ path?: string; file_name?: string; score?: number; match_type?: string }> }>(
    "fuzzyFileSearch",
    { query, roots: [cwd], cancellationToken: null },
    120_000,
  );
  const entries: CommandPanelEntry[] = projectFileSearchEntries(result);
  openCommandPanel("generic", {
    status: "ready",
    title: "Files",
    entries,
    message: entries.length ? `${entries.length} matching file(s). Select one to attach it.` : "No matching files found.",
  });
}

function requireActiveThreadId(
  request: SlashCommandRequest,
  activeThreadId: string | null,
  dispatch: ThreadWorkflowDispatch,
): string | null {
  if (activeThreadId) return activeThreadId;
  dispatch({
    type: "log",
    text: `/${request} needs an active thread. Start or select a thread first.`,
    level: "warn",
  });
  return null;
}

function activeThreadTitle(thread: Thread | null): string {
  if (!thread) return "";
  const name = typeof thread.name === "string" ? thread.name.trim() : "";
  const preview = typeof thread.preview === "string" ? thread.preview.trim() : "";
  return name || preview || thread.id;
}

function shortThreadId(id: string): string {
  return id.length > 12 ? `${id.slice(0, 8)}...${id.slice(-4)}` : id;
}

function stringPayload(payload: Record<string, unknown> | undefined, key: string): string {
  const value = payload?.[key];
  return typeof value === "string" ? value.trim() : "";
}

function recordValue(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" && !Array.isArray(value)
    ? value as Record<string, unknown>
    : null;
}

function recordField(value: Record<string, unknown>, key: string): Record<string, unknown> | null {
  return recordValue(value[key]);
}

function firstRecordField(value: Record<string, unknown>, keys: string[]): Record<string, unknown> | null {
  for (const key of keys) {
    const record = recordField(value, key);
    if (record) return record;
  }
  return null;
}

function firstArrayField(value: Record<string, unknown>, keys: string[]): Record<string, unknown>[] {
  for (const key of keys) {
    const field = value[key];
    if (Array.isArray(field)) return field.map(recordValue).filter((item): item is Record<string, unknown> => item != null);
  }
  return [];
}

function fieldText(value: Record<string, unknown>, key: string): string {
  const field = value[key];
  if (typeof field === "string") return field.trim();
  if (typeof field === "number" || typeof field === "boolean" || typeof field === "bigint") return String(field);
  return "";
}

function compactDebugJson(value: unknown): string {
  try {
    return JSON.stringify(value, null, 2);
  } catch {
    return formatUnknown(value);
  }
}

function diffLineCount(value: string): number {
  return value.split("\n").filter((line) => line.startsWith("+") || line.startsWith("-")).length;
}
