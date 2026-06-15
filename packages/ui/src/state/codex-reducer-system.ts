// System-domain handlers of the Codex UI reducer (mechanically extracted from
// codex-reducer.ts, logic verbatim): the error-notification projection,
// server-request resolution, MCP startup-status tracking, and the
// log-only notification fall-through.
import type { JsonRpcNotification } from "@forge/codex-protocol";
import { stringField } from "../lib/format";
import { ensureTurnInOrder, mergeItems } from "./codex-reducer-item-helpers";
import {
  normalizeThreadRuntime,
  prependLog,
  recordParam,
  selectThreadRuntime,
} from "./codex-reducer-runtime";
import { applyHookRunNotification } from "./codex-reducer-threads";
import type { CodexUiState } from "./codex-ui-types";
import type { McpServerStartupStatus } from "./mcp-skills-management";
import {
  formatUnknownForLog,
  fsChangedLogText,
  hookLogText,
  hookRunStatus,
} from "./notification-log-format";
import { reconnectStreamErrorItem, streamErrorItem, turnErrorMessage } from "./thread-stream-error";

// --- server-request notification handlers ------------------------------------

export function handleServerRequestResolvedNotification(state: CodexUiState, params: Record<string, unknown>): CodexUiState {
  return {
    ...state,
    pendingRequests: state.pendingRequests.filter((request) => request.id !== params.requestId),
  };
}

export function applyMcpServerStartupStatusNotification(
  state: CodexUiState,
  params: Record<string, unknown>,
  message: JsonRpcNotification,
): CodexUiState {
  const name = stringField(params, "name");
  if (!name) return logNotificationIfUseful(state, message);
  const startup: McpServerStartupStatus = {
    status: formatUnknownForLog(params.status) || "unknown",
    error: stringField(params, "error") || null,
    updatedAt: Date.now(),
  };
  return logNotificationIfUseful({
    ...state,
    mcpServerStartupStatuses: {
      ...state.mcpServerStartupStatuses,
      [name]: startup,
    },
  }, message);
}

export function applyErrorNotification(state: CodexUiState, params: Record<string, unknown>): CodexUiState {
  const error = recordParam(params.error);
  const text = turnErrorMessage(error) || formatUnknownForLog(params);
  const willRetry = params.willRetry === true;
  const retryText = willRetry ? " (will retry)" : "";
  const logged = text ? prependLog(state, `${text}${retryText}`, "error") : state;

  const threadId = String(params.threadId ?? "");
  if (!threadId || !text) return logged;
  const turnId = String(params.turnId ?? "");
  const runtime = selectThreadRuntime(logged, threadId);
  const order = ensureTurnInOrder(runtime.turnOrder, turnId || null);

  /*
   * Codex projects the `error` notification by `willRetry`
   * (app-server-manager-signals :20244-20264): a retrying/reconnect error
   * becomes a low-key `stream-error` row carrying a "Reconnecting N/M" progress
   * when the message encodes it. Forge previously DROPPED willRetry errors
   * entirely (log-only early return), so reconnect attempts were invisible in
   * the transcript — fixed here.
   *
   * Codex renders a FATAL error as a `system-error` block (vs `stream-error`).
   * Forge keeps fatal errors on `stream-error` for now: the fatal `error`
   * notification and the `turn/failed` path both surface the same error and
   * unify on `stream-error:${turnId}` (one row); reclassifying to system-error
   * would also require reclassifying the turn/failed path, which this audit did
   * not verify against the bundle. Tracked as a follow-up.
   */
  if (willRetry) {
    return {
      ...logged,
      threadsRuntime: {
        ...logged.threadsRuntime,
        [threadId]: normalizeThreadRuntime({
          ...runtime,
          turnOrder: order,
          items: mergeItems(runtime.items, [reconnectStreamErrorItem(turnId, error, text)], order),
        }),
      },
    };
  }

  return {
    ...logged,
    threads: logged.threads.map((thread) =>
      thread.id === threadId ? { ...thread, status: { type: "systemError" } } : thread,
    ),
    threadsRuntime: {
      ...logged.threadsRuntime,
      [threadId]: normalizeThreadRuntime({
        ...runtime,
        turnOrder: order,
        items: mergeItems(runtime.items, [streamErrorItem(turnId, error, text)], order),
      }),
    },
  };
}

export function logNotificationIfUseful(state: CodexUiState, message: JsonRpcNotification): CodexUiState {
  const params = (message.params ?? {}) as Record<string, unknown>;
  switch (message.method) {
    case "warning":
    case "guardianWarning":
      return prependLog(state, stringField(params, "message") || formatUnknownForLog(params), "warn");
    case "configWarning": {
      const summary = stringField(params, "summary") || "config warning";
      const details = stringField(params, "details");
      return prependLog(state, details ? `${summary}: ${details}` : summary, "warn");
    }
    // `model/rerouted` is intercepted by applyNotification (synthesizes a
    // modelRerouted timeline item); it no longer falls through to logging here.
    case "model/verification":
      return prependLog(state, `model verification required: ${formatUnknownForLog(params.verifications)}`, "warn");
    case "mcpServer/startupStatus/updated": {
      const name = stringField(params, "name") || "mcp server";
      const status = formatUnknownForLog(params.status);
      const error = stringField(params, "error");
      return prependLog(state, error ? `${name} ${status}: ${error}` : `${name} ${status}`, error ? "warn" : "info");
    }
    case "account/updated": {
      const authMode = formatUnknownForLog(params.authMode);
      const planType = formatUnknownForLog(params.planType);
      return prependLog(state, `account updated: ${authMode || "unknown"}${planType ? ` / ${planType}` : ""}`);
    }
    case "account/login/completed": {
      const success = params.success === true;
      const error = stringField(params, "error");
      return prependLog(state, success ? "account login completed" : `account login failed${error ? `: ${error}` : ""}`, success ? "info" : "error");
    }
    case "thread/realtime/error":
      return prependLog(state, stringField(params, "message") || formatUnknownForLog(params), "error");
    case "deprecationNotice":
      return prependLog(state, stringField(params, "message") || formatUnknownForLog(params), "warn");
    case "fs/changed":
      return prependLog(state, fsChangedLogText(params));
    case "hook/started":
      return prependLog(applyHookRunNotification(state, params), hookLogText("started", params));
    case "hook/completed": {
      const level = hookRunStatus(params) === "failed" ? "warn" : "info";
      return prependLog(applyHookRunNotification(state, params), hookLogText("completed", params), level);
    }
    case "windows/worldWritableWarning":
      return prependLog(state, `world-writable path warning: ${formatUnknownForLog(params)}`, "warn");
    default:
      return state;
  }
}
