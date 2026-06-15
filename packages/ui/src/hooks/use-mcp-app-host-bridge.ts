import { useCallback, useEffect, useRef, useState, type MutableRefObject } from "react";
import type { Thread } from "@forge/codex-protocol";
import type {
  McpFollowUpDialogOption,
  McpFollowUpDialogRequest,
} from "../components/mcp-follow-up-dialog";
import type {
  McpAppHostCallRequest,
  McpResourceReadRequest,
} from "../components/tool-activity-detail";
import { useServices } from "../components/services-context";
import { formatError } from "../lib/format";
import { openExternalUrl } from "../lib/tauri-host";
import { buildUserInputFromComposer } from "../state/composer-workflow";
import type {
  ThreadContextDefaults,
  ThreadRuntimeSlice,
} from "../state/codex-reducer";
import {
  MCP_APP_BRIDGE_INTERNAL_JSON_RPC_ERROR,
  MCP_APP_BRIDGE_INTERNAL_ERROR,
  MCP_APP_BRIDGE_INVALID_PARAMS,
  MCP_APP_BRIDGE_METHOD_NOT_FOUND,
  downloadMcpAppFile,
  mcpAppBridgeError,
  mcpAppBridgeUserCancelledError,
  mcpAppExternalHref,
  mcpAppFileDownloadRequest,
  mcpAppFollowUpMessageRequest,
  mcpAppFollowUpSource,
  mcpAppMcpProxyRequest,
  mcpAppResourceTemplatesListResponse,
  mcpAppResourcesListResponse,
  mcpAppToolCallAllowed,
  mcpAppToolCallRequest,
  mcpAppToolCallRequestFromBridgeArgs,
  mcpAppToolsListResponse,
  mcpServerStatusFromListResult,
} from "../state/mcp-app-host";
import {
  isThreadStatusInProgress,
  recordObject,
} from "../state/thread-item-fields";
import {
  createAndSelectThreadForTurn,
  dispatchOptimisticUserMessage,
  dropOptimisticUserMessage,
  refreshThreadMetadata,
  sendPanelThreadMessage,
  startSideConversation,
} from "../state/thread-workflow";

export interface UseMcpAppHostBridgeInput {
  activeThreadId: string | null;
  ensureConnected: () => Promise<boolean>;
  hostDefaultCwd?: string | null;
  openSideConversationPanelRef: MutableRefObject<((thread: Thread) => void) | null>;
  threadContextDefaults: ThreadContextDefaults | null;
  threads: Thread[];
  threadsRuntime: Record<string, ThreadRuntimeSlice>;
  workspace: string;
}

export function useMcpAppHostBridge({
  activeThreadId,
  ensureConnected,
  hostDefaultCwd,
  openSideConversationPanelRef,
  threadContextDefaults,
  threads,
  threadsRuntime,
  workspace,
}: UseMcpAppHostBridgeInput) {
  const { client, dispatch } = useServices();
  const mcpFollowUpDialogPendingRef = useRef(false);
  const mcpFollowUpDialogDispatchingRef = useRef(false);
  const [mcpFollowUpDialog, setMcpFollowUpDialog] = useState<McpFollowUpDialogRequest | null>(null);

  const readMcpResource = useCallback(async ({ server, threadId, uri }: McpResourceReadRequest) => {
    if (!(await ensureConnected())) throw mcpAppBridgeError("Runtime is offline.");
    return client.request<unknown>("mcpServer/resource/read", {
      threadId: threadId ?? activeThreadId ?? null,
      server,
      uri,
    }, 120_000);
  }, [activeThreadId, client, ensureConnected]);

  const loadMcpServerStatus = useCallback(async (server: string, detail: "full" | "toolsAndAuthOnly" = "full") => {
    if (!(await ensureConnected())) throw mcpAppBridgeError("Runtime is offline.");
    const result = await client.request<unknown>("mcpServerStatus/list", { limit: 50, detail }, 120_000);
    const status = mcpServerStatusFromListResult(result, server);
    if (!status) throw mcpAppBridgeError(`MCP server not found: ${server}`);
    return status;
  }, [client, ensureConnected]);

  const callMcpAppTool = useCallback(async (
    request: McpAppHostCallRequest,
    toolCall: { name: string; arguments: unknown; meta?: unknown },
  ) => {
    const threadId = request.threadId ?? activeThreadId;
    if (!threadId) throw mcpAppBridgeError("Select or start a thread before calling an MCP tool.");
    if (!(await ensureConnected())) throw mcpAppBridgeError("Runtime is offline.");
    const status = await loadMcpServerStatus(request.server, "toolsAndAuthOnly");
    if (!mcpAppToolCallAllowed(status, toolCall.name)) {
      throw mcpAppBridgeError(
        `MCP app widgets cannot call tools that accept file parameters: ${toolCall.name}`,
        MCP_APP_BRIDGE_INTERNAL_JSON_RPC_ERROR,
      );
    }
    return client.request<unknown>("mcpServer/tool/call", {
      threadId,
      server: request.server,
      tool: toolCall.name,
      arguments: toolCall.arguments,
      ...(Object.prototype.hasOwnProperty.call(toolCall, "meta") ? { _meta: toolCall.meta } : {}),
    }, 120_000);
  }, [activeThreadId, client, ensureConnected, loadMcpServerStatus]);

  const sendMcpAppFollowUpMessage = useCallback(async (
    request: McpAppHostCallRequest,
    prompt: string,
    option?: McpFollowUpDialogOption,
  ) => {
    const content = buildUserInputFromComposer(prompt);
    if (content.length === 0) throw mcpAppBridgeError("Invalid follow-up message.", MCP_APP_BRIDGE_INVALID_PARAMS);
    const target = option?.id ?? "current-thread";
    if (target === "local" || target === "worktree") {
      throw mcpAppBridgeError(
        `MCP app follow-up target is disabled: ${option?.label ?? target}.`,
        MCP_APP_BRIDGE_INVALID_PARAMS,
      );
    }
    if (!(await ensureConnected())) throw mcpAppBridgeError("Runtime is offline.");

    const sourceThreadId = request.threadId ?? activeThreadId;
    const sourceThread = sourceThreadId
      ? threads.find((candidate) => candidate.id === sourceThreadId) ?? null
      : null;
    const sourceWorkspace = sourceThread?.cwd || workspace.trim() || hostDefaultCwd || "";

    if (target === "new-thread") {
      const threadId = await createAndSelectThreadForTurn(
        client,
        sourceWorkspace,
        dispatch,
        threadContextDefaults,
      );
      if (!threadId) throw mcpAppBridgeError("Unable to create a follow-up thread.");
      let optimistic: ReturnType<typeof dispatchOptimisticUserMessage> | null = null;
      try {
        optimistic = dispatchOptimisticUserMessage(dispatch, threadId, content);
        await sendPanelThreadMessage(client, threadId, content, sourceWorkspace, threadContextDefaults, null);
        await refreshThreadMetadata(client, threadId, dispatch);
        dispatch({ type: "log", text: "Sent MCP app follow-up message in a new thread.", level: "info" });
        return {};
      } catch (error) {
        if (optimistic) dropOptimisticUserMessage(dispatch, optimistic);
        throw error;
      }
    }

    if (target === "new-side-chat") {
      if (!sourceThreadId) throw mcpAppBridgeError("Select or start a thread before opening an MCP app side chat.");
      const result = await startSideConversation(
        client,
        sourceThreadId,
        sourceWorkspace,
        threadContextDefaults,
        prompt,
      );
      const sideThread = result.thread;
      openSideConversationPanelRef.current?.(sideThread);
      let optimistic: ReturnType<typeof dispatchOptimisticUserMessage> | null = null;
      try {
        optimistic = dispatchOptimisticUserMessage(dispatch, sideThread.id, content, null);
        await sendPanelThreadMessage(
          client,
          sideThread.id,
          content,
          sideThread.cwd || sourceWorkspace,
          threadContextDefaults,
          null,
        );
        await refreshThreadMetadata(client, sideThread.id, dispatch);
        dispatch({ type: "log", text: "Sent MCP app follow-up message in a new side chat.", level: "info" });
        return {};
      } catch (error) {
        if (optimistic) dropOptimisticUserMessage(dispatch, optimistic);
        throw error;
      }
    }

    const threadId = sourceThreadId;
    if (!threadId) throw mcpAppBridgeError("Select or start a thread before sending an MCP app follow-up.");
    const thread = threads.find((candidate) => candidate.id === threadId) ?? null;
    const runtime = threadsRuntime[threadId] ?? null;
    const targetActiveTurnId = runtime?.activeTurnId ?? null;
    const targetRunning = Boolean(targetActiveTurnId) || isThreadStatusInProgress(thread?.status);
    if (targetRunning && !targetActiveTurnId) {
      throw mcpAppBridgeError(
        "Waiting for the active turn before steering this thread.",
        MCP_APP_BRIDGE_INTERNAL_ERROR,
      );
    }

    let optimistic: ReturnType<typeof dispatchOptimisticUserMessage> | null = null;
    try {
      optimistic = dispatchOptimisticUserMessage(dispatch, threadId, content, targetActiveTurnId);
      await sendPanelThreadMessage(
        client,
        threadId,
        content,
        thread?.cwd || workspace.trim() || hostDefaultCwd || "",
        threadContextDefaults,
        targetActiveTurnId,
      );
      if (!targetActiveTurnId) await refreshThreadMetadata(client, threadId, dispatch);
      dispatch({ type: "log", text: "Sent MCP app follow-up message.", level: "info" });
      return {};
    } catch (error) {
      if (optimistic) dropOptimisticUserMessage(dispatch, optimistic);
      throw error;
    }
  }, [
    activeThreadId,
    client,
    dispatch,
    ensureConnected,
    hostDefaultCwd,
    openSideConversationPanelRef,
    threadContextDefaults,
    threads,
    threadsRuntime,
    workspace,
  ]);

  const requestMcpAppFollowUpMessage = useCallback((
    request: McpAppHostCallRequest,
    prompt: string,
  ) => {
    if (mcpFollowUpDialogPendingRef.current) {
      throw mcpAppBridgeError(
        "A follow-up message is already awaiting confirmation.",
        MCP_APP_BRIDGE_INTERNAL_ERROR,
      );
    }
    mcpFollowUpDialogPendingRef.current = true;
    return new Promise((resolve, reject) => {
      setMcpFollowUpDialog({ prompt, request, resolve, reject, source: mcpAppFollowUpSource(request) });
    });
  }, []);

  useEffect(() => {
    if (!mcpFollowUpDialog && !mcpFollowUpDialogDispatchingRef.current) {
      mcpFollowUpDialogPendingRef.current = false;
    }
  }, [mcpFollowUpDialog]);

  const closeMcpFollowUpDialog = useCallback(() => {
    const pending = mcpFollowUpDialog;
    setMcpFollowUpDialog(null);
    mcpFollowUpDialogPendingRef.current = false;
    pending?.reject(mcpAppBridgeUserCancelledError());
  }, [mcpFollowUpDialog]);

  const confirmMcpFollowUpDialog = useCallback(async (prompt: string, option: McpFollowUpDialogOption) => {
    const pending = mcpFollowUpDialog;
    if (!pending) return;
    mcpFollowUpDialogDispatchingRef.current = true;
    setMcpFollowUpDialog(null);
    try {
      const result = await sendMcpAppFollowUpMessage(pending.request, prompt, option);
      pending.resolve(result);
    } catch (error) {
      pending.reject(error);
      dispatch({ type: "log", text: `MCP app follow-up failed: ${formatError(error)}`, level: "error" });
    } finally {
      mcpFollowUpDialogDispatchingRef.current = false;
      mcpFollowUpDialogPendingRef.current = false;
    }
  }, [dispatch, mcpFollowUpDialog, sendMcpAppFollowUpMessage]);

  const handleMcpAppHostCall = useCallback(async (request: McpAppHostCallRequest): Promise<unknown> => {
    if (request.method === "sendFollowUpMessage") {
      const followUp = mcpAppFollowUpMessageRequest(request.args[0]);
      if (!followUp) throw mcpAppBridgeError("Invalid follow-up message.", MCP_APP_BRIDGE_INVALID_PARAMS);
      return requestMcpAppFollowUpMessage(request, followUp.prompt);
    }
    if (request.method === "openExternal") {
      const href = mcpAppExternalHref(request.args[0]);
      if (!href) return {};
      await openExternalUrl(href);
      return {};
    }
    if (request.method === "callTool") {
      const toolCall = mcpAppToolCallRequestFromBridgeArgs(request.args);
      if (!toolCall) throw mcpAppBridgeError("Invalid MCP tool call params.", MCP_APP_BRIDGE_INVALID_PARAMS);
      return callMcpAppTool(request, toolCall);
    }
    if (request.method !== "callMcp") {
      throw mcpAppBridgeError(`Unsupported MCP app host method: ${request.method}`, MCP_APP_BRIDGE_METHOD_NOT_FOUND);
    }

    const proxyRequest = mcpAppMcpProxyRequest(request.args[0]);
    if (!proxyRequest) throw mcpAppBridgeError("Invalid MCP proxy request.", MCP_APP_BRIDGE_INVALID_PARAMS);
    switch (proxyRequest.method) {
      case "ping":
        return {};
      case "ui/download-file": {
        const download = mcpAppFileDownloadRequest(proxyRequest.params);
        if (!download) throw mcpAppBridgeError("Invalid MCP file download params.", MCP_APP_BRIDGE_INVALID_PARAMS);
        downloadMcpAppFile(download);
        return {};
      }
      case "tools/call": {
        const toolCall = mcpAppToolCallRequest(proxyRequest.params);
        if (!toolCall) throw mcpAppBridgeError("Invalid MCP tool call params.", MCP_APP_BRIDGE_INVALID_PARAMS);
        return callMcpAppTool(request, toolCall);
      }
      case "resources/read": {
        const params = recordObject(proxyRequest.params);
        const uri = typeof params.uri === "string" ? params.uri : "";
        if (!uri.trim()) throw mcpAppBridgeError("Invalid MCP resource read params.", MCP_APP_BRIDGE_INVALID_PARAMS);
        return readMcpResource({ server: request.server, threadId: request.threadId, uri });
      }
      case "tools/list": {
        const status = await loadMcpServerStatus(request.server, "toolsAndAuthOnly");
        return mcpAppToolsListResponse(status);
      }
      case "resources/list": {
        const status = await loadMcpServerStatus(request.server, "full");
        return mcpAppResourcesListResponse(status, request.server);
      }
      case "resources/templates/list": {
        const status = await loadMcpServerStatus(request.server, "full");
        return mcpAppResourceTemplatesListResponse(status, request.server);
      }
      case "prompts/list":
        return { prompts: [] };
      default:
        throw mcpAppBridgeError(
          `Unsupported MCP proxy method: ${proxyRequest.method}`,
          MCP_APP_BRIDGE_METHOD_NOT_FOUND,
        );
    }
  }, [callMcpAppTool, loadMcpServerStatus, readMcpResource, requestMcpAppFollowUpMessage]);

  return {
    closeMcpFollowUpDialog,
    confirmMcpFollowUpDialog,
    handleMcpAppHostCall,
    mcpFollowUpDialog,
    readMcpResource,
  };
}
