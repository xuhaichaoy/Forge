import type { Thread } from "@hicodex/codex-protocol";
import { CodexJsonRpcClient } from "../lib/codex-json-rpc-client";
import { formatError } from "../lib/format";
import type { SlashCommandRequest } from "./composer-workflow";
import {
  projectCommandPanelEntries,
  projectMcpServerEntries,
  projectPluginEntries,
  type CommandPanelEntry,
  type CommandPanelKind,
  type CommandPanelOptions,
} from "./command-panel";
import type { ThreadWorkflowDispatch } from "./thread-workflow";

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
  connected: boolean;
  pid?: number | null;
  modelCount: number;
  pendingRequestCount: number;
  threads: Thread[];
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
    connected,
    pid,
    modelCount,
    pendingRequestCount,
    threads,
  } = context;

  try {
    if (!(await ensureConnected())) return;

    switch (request) {
      case "resumeThread": {
        const threadId = stringPayload(payload, "threadId");
        if (!threadId) {
          dispatch({ type: "log", text: "Select a thread from the sidebar to resume it.", level: "info" });
          return;
        }
        const result = await client.request<{ thread: Thread }>("thread/resume", {
          threadId,
          cwd: workspace.trim() || null,
        });
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
        const result = await client.request<{ thread: Thread }>("thread/fork", {
          threadId,
          cwd: workspace.trim() || null,
        }, 120_000);
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
        const detail = stringPayload(payload, "detail").toLowerCase() === "verbose" ? "full" : "toolsAndAuthOnly";
        openCommandPanel("mcp", { status: "loading", entries: [] });
        await client.request("config/mcpServer/reload", undefined, 120_000);
        const result = await client.request<unknown>("mcpServerStatus/list", { limit: 50, detail }, 120_000);
        openCommandPanel("mcp", { status: "ready", entries: projectMcpServerEntries(result) });
        return;
      }
      case "listSkills": {
        openCommandPanel("skills", { status: "loading", entries: [] });
        const result = await client.request<unknown>("skills/list", {
          cwds: workspace.trim() ? [workspace.trim()] : [],
        });
        openCommandPanel("skills", { status: "ready", entries: projectCommandPanelEntries({ skills: result }) });
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
        const result = await client.request<unknown>("app/list", {
          limit: 50,
          threadId: activeThreadId,
        });
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
      case "logout": {
        await client.request("account/logout", undefined, 120_000);
        dispatch({ type: "log", text: "Logged out from the current Codex account.", level: "info" });
        return;
      }
      case "exitApp":
        dispatch({ type: "log", text: "Use the macOS window close button to quit HiCodex during development.", level: "info" });
        return;
      case "copyLastAnswer":
        dispatch({ type: "log", text: "Copy last answer is queued for the transcript action toolbar.", level: "info" });
        return;
      case "approveGuardianDeniedAction":
        dispatch({
          type: "log",
          text: "/approve is registered, but HiCodex still needs to persist the guardian denial event before it can call thread/approveGuardianDeniedAction.",
          level: "warn",
        });
        return;
      case "showExperimental": {
        openCommandPanel("experimental", { status: "loading", entries: [] });
        const result = await client.request<unknown>("experimentalFeature/list", { limit: 50 }, 120_000);
        openCommandPanel("experimental", { status: "ready", entries: projectCommandPanelEntries({ experimental: result }) });
        return;
      }
      case "showCollaborationModes": {
        openCommandPanel("collaboration", {
          status: "empty",
          message: "The current Codex app-server protocol does not expose collaborationMode/list. Use thread fork/resume for the supported thread flows.",
          entries: [],
        });
        return;
      }
      case "showGoal": {
        const threadId = requireActiveThreadId(request, activeThreadId, dispatch);
        if (!threadId) return;
        handleGoalRequest(openCommandPanel, threadId, stringPayload(payload, "objective"));
        return;
      }
      case "cleanBackgroundTerminals": {
        openCommandPanel("status", {
          status: "empty",
          message: "The current Codex app-server protocol does not expose thread/backgroundTerminals/clean. Use turn interrupt for the active run.",
          entries: [],
        });
        return;
      }
      case "showMentionPicker": {
        await handleMentionSearch(client, openCommandPanel, stringPayload(payload, "query"), workspace.trim() || defaultCwd || "");
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

function handleGoalRequest(
  openCommandPanel: SlashRequestWorkflowContext["openCommandPanel"],
  threadId: string,
  objective: string,
) {
  if (objective.toLowerCase() === "clear") {
    openCommandPanel("status", {
      status: "empty",
      message: "The current Codex app-server protocol publishes goal notifications but does not expose thread/goal/clear.",
      entries: [],
    });
    return;
  }
  if (objective) {
    openCommandPanel("status", {
      status: "empty",
      message: "The current Codex app-server protocol publishes goal notifications but does not expose thread/goal/set.",
      entries: [{
        id: "goal:unsupported",
        title: objective,
        kind: "status",
        status: "not sent",
        meta: `thread ${threadId}`,
      }],
    });
    return;
  }
  openCommandPanel("status", {
    status: "empty",
    message: "The current Codex app-server protocol publishes goal notifications but does not expose thread/goal/get.",
    entries: [{
      id: "goal:unsupported",
      title: "Thread goal",
      kind: "status",
      status: "not queryable",
      meta: `thread ${threadId}`,
    }],
  });
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
      message: "Type /mention <query> to search workspace files, or use + Mention file to attach a known path.",
      entries: [],
    });
    return;
  }
  openCommandPanel("generic", { status: "loading", title: "Files", entries: [], message: "Searching files..." });
  const result = await client.request<{ files?: Array<{ path?: string; file_name?: string; score?: number; match_type?: string }> }>(
    "fuzzyFileSearch",
    { query, roots: [cwd], cancellationToken: null },
    120_000,
  );
  const entries: CommandPanelEntry[] = (result.files ?? []).slice(0, 25).map((file, index) => ({
    id: `file:${file.path ?? file.file_name ?? index}`,
    title: file.file_name || file.path || "file",
    kind: "status",
    status: file.match_type,
    meta: file.path,
    details: [`score: ${file.score ?? "unknown"}`],
  }));
  openCommandPanel("generic", {
    status: "ready",
    title: "Files",
    entries,
    message: entries.length ? `${entries.length} matching file(s). Use + Mention file to attach a path.` : "No matching files found.",
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

function stringPayload(payload: Record<string, unknown> | undefined, key: string): string {
  const value = payload?.[key];
  return typeof value === "string" ? value.trim() : "";
}

function diffLineCount(value: string): number {
  return value.split("\n").filter((line) => line.startsWith("+") || line.startsWith("-")).length;
}
