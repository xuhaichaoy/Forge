import {
  Activity,
  Bot,
  ChevronRight,
  CircleStop,
  Loader2,
  MessageSquarePlus,
  RefreshCcw,
  Settings,
  Terminal,
} from "lucide-react";
import { useCallback, useEffect, useMemo, useReducer, useRef, useState } from "react";
import type { Dispatch } from "react";
import type { ModelConfig, TeamSummary, Thread, UserInput } from "@hicodex/codex-protocol";
import { Composer } from "./components/composer";
import { ConversationView } from "./components/conversation-view";
import { ModelSettingsPanel } from "./components/model-settings-panel";
import { PendingRequestStack } from "./components/pending-request-stack";
import { RightRail } from "./components/right-rail";
import { CodexJsonRpcClient } from "./lib/codex-json-rpc-client";
import { formatError } from "./lib/format";
import { writeLocalModelCatalog } from "./lib/tauri-host";
import {
  EMPTY_MODEL,
  buildLocalModelCatalogEntry,
  buildModelConfigEdits,
  buildModelConfigsFromList,
  normalizeModelConfig,
  type ModelListEntry,
} from "./model/model-settings";
import {
  codexUiReducer,
  initialCodexUiState,
  type PendingServerRequest,
} from "./state/codex-reducer";
import { buildApprovalResult } from "./state/approval-requests";
import { projectBranchDetails } from "./state/branch-details";
import {
  isThreadStatusInProgress,
  projectConversation,
} from "./state/render-groups";
import {
  createAndSelectThreadForTurn,
  isThreadNotFound,
  isThreadNotMaterialized,
  refreshThreads,
  startThread,
  startTurn,
  steerTurn,
  threadStatusLabel,
  threadTitle,
} from "./state/thread-workflow";

const SEED_TEAMS: TeamSummary[] = [
  { id: "local", name: "Local workspace", role: "owner", plan: "trial", active: true },
];

export function HiCodexApp() {
  const [state, dispatch] = useReducer(codexUiReducer, initialCodexUiState);
  const [input, setInput] = useState("");
  const [workspace, setWorkspace] = useState("");
  const [showSettings, setShowSettings] = useState(false);
  const [modelDraft, setModelDraft] = useState<ModelConfig>(EMPTY_MODEL);
  const clientRef = useRef<CodexJsonRpcClient | null>(null);
  const workspaceInitialized = useRef(false);

  const client = useMemo(() => {
    const rpc = new CodexJsonRpcClient({
      onHostStatus: (status) => dispatch({ type: "hostStatus", status }),
      onNotification: (message) => dispatch({ type: "notification", message }),
      onServerRequest: (request) => dispatch({ type: "serverRequest", request }),
      onLog: (text, level) => dispatch({ type: "log", text, level }),
    });
    clientRef.current = rpc;
    return rpc;
  }, []);

  const activeItems = state.activeThreadId
    ? state.itemsByThread[state.activeThreadId] ?? []
    : [];
  const activeThread = state.threads.find((thread) => thread.id === state.activeThreadId) ?? null;
  const activeTurnId = state.activeThreadId
    ? state.activeTurnIdsByThread[state.activeThreadId] ?? null
    : null;
  const activeThreadRunning = Boolean(activeTurnId) || isThreadStatusInProgress(activeThread?.status);
  const conversation = useMemo(() => projectConversation(activeItems), [activeItems]);
  const activeDiff = state.activeThreadId ? state.turnDiffsByThread[state.activeThreadId] ?? "" : "";
  const branchDetails = useMemo(
    () => projectBranchDetails({
      thread: activeThread,
      diff: activeDiff ? { diff: activeDiff } : null,
    }),
    [activeDiff, activeThread],
  );

  const autoConnectStarted = useRef(false);

  const connect = useCallback(async (): Promise<boolean> => {
    dispatch({ type: "connecting", value: true });
    try {
      await client.connect();
      dispatch({ type: "connected", value: true });
      dispatch({ type: "setTeams", teams: SEED_TEAMS });
      await refreshThreads(client, dispatch);
      await refreshModels(client, dispatch);
      return true;
    } catch (error) {
      dispatch({ type: "connected", value: false });
      dispatch({ type: "log", text: formatError(error), level: "error" });
      return false;
    } finally {
      dispatch({ type: "connecting", value: false });
    }
  }, [client]);

  useEffect(() => {
    if (autoConnectStarted.current) return;
    autoConnectStarted.current = true;
    void connect();
  }, [connect]);

  useEffect(() => {
    if (workspaceInitialized.current || !state.hostStatus?.defaultCwd) return;
    workspaceInitialized.current = true;
    setWorkspace((current) => current.trim() || state.hostStatus?.defaultCwd || "");
  }, [state.hostStatus?.defaultCwd]);

  const disconnect = useCallback(async () => {
    try {
      await client.disconnect();
      dispatch({ type: "connected", value: false });
    } catch (error) {
      dispatch({ type: "log", text: formatError(error), level: "error" });
    }
  }, [client]);

  const createThread = useCallback(async () => {
    try {
      const result = await startThread(client, workspace);
      if (result.thread) {
        dispatch({ type: "setThreads", threads: [result.thread, ...state.threads] });
        dispatch({ type: "setActiveThread", threadId: result.thread.id });
      }
    } catch (error) {
      dispatch({ type: "log", text: formatError(error), level: "error" });
    }
  }, [client, state.threads, workspace]);

  const selectThread = useCallback(async (thread: Thread) => {
    dispatch({ type: "setActiveThread", threadId: thread.id });
    try {
      const result = await client.request<{ thread?: Thread }>("thread/read", {
        threadId: thread.id,
        includeTurns: true,
      });
      if (result.thread) {
        dispatch({ type: "setThreads", threads: [result.thread, ...state.threads.filter((item) => item.id !== thread.id)] });
        dispatch({ type: "notification", message: { method: "thread/started", params: { thread: result.thread } } });
      }
    } catch (error) {
      if (isThreadNotFound(error)) {
        dispatch({ type: "removeThread", threadId: thread.id });
      } else if (isThreadNotMaterialized(error)) {
        dispatch({
          type: "log",
          text: "thread is not materialized yet; send the first message before loading turns",
          level: "warn",
        });
        return;
      }
      dispatch({ type: "log", text: formatError(error), level: "error" });
    }
  }, [client, state.threads]);

  const sendTurn = useCallback(async () => {
    const text = input.trim();
    if (!text) return;
    try {
      if (!state.connected) {
        const connected = await connect();
        if (!connected) return;
      }
      let threadId = state.activeThreadId;
      if (!threadId) {
        threadId = await createAndSelectThreadForTurn(client, workspace, state.threads, dispatch);
      }
      if (!threadId) throw new Error("No active Codex thread");
      setInput("");
      const content: UserInput[] = [{ type: "text", text, text_elements: [] }];
      try {
        if (activeTurnId && activeThreadRunning) {
          await steerTurn(client, threadId, content, activeTurnId);
        } else {
          await startTurn(client, threadId, content, workspace);
        }
      } catch (error) {
        if (!isThreadNotFound(error)) throw error;
        dispatch({ type: "removeThread", threadId });
        const nextThreadId = await createAndSelectThreadForTurn(client, workspace, state.threads, dispatch);
        if (!nextThreadId) throw error;
        await startTurn(client, nextThreadId, content, workspace);
      }
    } catch (error) {
      dispatch({ type: "log", text: formatError(error), level: "error" });
    }
  }, [activeThreadRunning, activeTurnId, client, connect, input, state.activeThreadId, state.connected, state.threads, workspace]);

  const interruptActiveTurn = useCallback(async () => {
    if (!state.activeThreadId || !activeTurnId) return;
    try {
      await client.request("turn/interrupt", {
        threadId: state.activeThreadId,
        turnId: activeTurnId,
      }, 120_000);
    } catch (error) {
      dispatch({ type: "log", text: formatError(error), level: "error" });
    }
  }, [activeTurnId, client, state.activeThreadId]);

  const respondToRequest = useCallback(async (request: PendingServerRequest, accepted: boolean) => {
    try {
      const result = buildApprovalResult(request, accepted);
      result === null
        ? await client.reject(request.id, accepted ? "Unsupported HiCodex request" : "Rejected by HiCodex user")
        : await client.respond(request.id, result);
      dispatch({ type: "resolveServerRequest", id: request.id });
    } catch (error) {
      dispatch({ type: "log", text: formatError(error), level: "error" });
    }
  }, [client]);

  const saveModelDraft = useCallback(async () => {
    const nextModel = normalizeModelConfig(modelDraft);
    dispatch({ type: "upsertModel", model: nextModel });
    try {
      const connected = state.connected || await connect();
      if (connected && nextModel.model) {
        const catalogPath = await writeLocalModelCatalog(
          state.hostStatus?.codexHome,
          buildLocalModelCatalogEntry(nextModel),
        );
        await client.request("config/batchWrite", {
          edits: buildModelConfigEdits(nextModel, catalogPath),
          reloadUserConfig: true,
        });
        dispatch({
          type: "log",
          text: `set Codex model to ${nextModel.model}; restart sidecar if this model was not in the previous catalog`,
        });
        await refreshModels(client, dispatch);
      }
    } catch (error) {
      dispatch({ type: "log", text: `saved locally; Codex config write failed: ${formatError(error)}`, level: "warn" });
    }
  }, [client, connect, modelDraft, state.connected, state.hostStatus?.codexHome]);

  const composerMode = activeThreadRunning && !input.trim() ? "stop" : activeThreadRunning ? "steer" : "send";

  return (
    <div className="hc-app">
      <aside className="hc-sidebar">
        <div className="hc-brand">
          <div className="hc-brand-mark"><Bot size={18} /></div>
          <div>
            <div className="hc-brand-title">HiCodex</div>
            <div className="hc-brand-subtitle">Codex core desktop</div>
          </div>
        </div>

        <div className="hc-sidebar-actions">
          <button className="hc-button hc-button-primary" onClick={state.connected ? createThread : connect} disabled={state.connecting}>
            {state.connecting ? <Loader2 className="hc-spin" size={16} /> : <MessageSquarePlus size={16} />}
            {state.connected ? "New thread" : "Connect"}
          </button>
          {state.connected && (
            <button className="hc-icon-button" onClick={() => void refreshThreads(client, dispatch)} title="Refresh threads">
              <RefreshCcw size={16} />
            </button>
          )}
        </div>

        <div className="hc-thread-list">
          {state.threads.length === 0 && (
            <div className="hc-empty-panel">No threads loaded</div>
          )}
          {state.threads.map((thread) => (
            <button
              key={thread.id}
              className={`hc-thread-row ${thread.id === state.activeThreadId ? "is-active" : ""}`}
              onClick={() => void selectThread(thread)}
            >
              <div className="hc-thread-name">{threadTitle(thread)}</div>
              <div className="hc-thread-meta">
                <span>{thread.id === state.activeThreadId && activeThreadRunning ? "running" : threadStatusLabel((thread as { status?: unknown }).status)}</span>
                <ChevronRight size={14} />
              </div>
            </button>
          ))}
        </div>

        <div className="hc-sidebar-footer">
          <button className="hc-link-button" onClick={() => setShowSettings(true)}>
            <Settings size={15} /> Settings
          </button>
          {state.connected && (
            <button className="hc-link-button danger" onClick={() => void disconnect()}>
              <CircleStop size={15} /> Stop sidecar
            </button>
          )}
        </div>
      </aside>

      <main className="hc-main">
        <header className="hc-topbar">
          <div>
            <div className="hc-top-title">{activeThread ? threadTitle(activeThread) : "Codex conversation"}</div>
            <div className="hc-top-meta">{state.hostStatus?.codexHome ?? "Sidecar not started"}</div>
          </div>
          <div className="hc-status-pill" data-running={state.connected}>
            <Activity size={14} />
            {state.connected ? `running${state.hostStatus?.pid ? `:${state.hostStatus.pid}` : ""}` : "offline"}
          </div>
        </header>

        <section className="hc-workspace-bar">
          <label>cwd</label>
          <input value={workspace} onChange={(event) => setWorkspace(event.target.value)} />
        </section>

        <section className="hc-conversation">
          <ConversationView
            units={conversation.units}
            emptyState={(
              <div className="hc-welcome">
                <Terminal size={28} />
                <h1>Ready for Codex app-server</h1>
                <p>Start a thread and send a prompt. Runtime facts will come from app-server ThreadItems.</p>
              </div>
            )}
          />
        </section>

        {state.pendingRequests.length > 0 && (
          <PendingRequestStack
            pendingRequests={state.pendingRequests}
            onRespond={respondToRequest}
            onLog={(text, level) => dispatch({ type: "log", text, level })}
          />
        )}

        <Composer
          input={input}
          onInputChange={setInput}
          mode={composerMode}
          connecting={state.connecting}
          activeTurnId={activeTurnId}
          onSend={() => void sendTurn()}
          onInterrupt={() => void interruptActiveTurn()}
        />
      </main>

      <RightRail
        conversation={conversation}
        branchDetails={branchDetails}
        teams={state.teams}
        activeTeamId={state.activeTeamId}
        logs={state.logs}
        onTeamSelect={(teamId) => dispatch({ type: "setActiveTeam", teamId })}
      />

      {showSettings && (
        <ModelSettingsPanel
          modelDraft={modelDraft}
          setModelDraft={setModelDraft}
          models={state.models}
          onClose={() => setShowSettings(false)}
          onSave={saveModelDraft}
        />
      )}
    </div>
  );
}

async function refreshModels(
  client: CodexJsonRpcClient,
  dispatch: Dispatch<Parameters<typeof codexUiReducer>[1]>,
) {
  try {
    const result = await client.request<{ data?: ModelListEntry[] }>("model/list", {
      includeHidden: false,
    });
    dispatch({ type: "setModels", models: buildModelConfigsFromList(result.data ?? []) });
  } catch (error) {
    dispatch({ type: "log", text: `model/list failed: ${formatError(error)}`, level: "warn" });
  }
}
