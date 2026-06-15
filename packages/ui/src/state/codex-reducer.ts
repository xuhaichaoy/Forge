// Root reducer of the Codex UI state machine. The state/action types live in
// codex-ui-types.ts and the per-domain case logic lives in the
// codex-reducer-{runtime,item-helpers,snapshot-merge,items,turns,threads,system}
// modules (mechanical extraction — logic moved verbatim). This module keeps
// the two original dispatchers — the action switch and the notification
// router — and re-exports the complete original public API so the existing
// importers of "./codex-reducer" stay untouched.
import type { JsonRpcNotification } from "@forge/codex-protocol";
import { applyAccountNotification } from "./account-state";
import {
  appendItemText,
  appendReasoningText,
  applyBindOptimisticTurn,
  applyCommandExecutionTerminalInteraction,
  applyDropOptimisticUserMessage,
  applyOptimisticUserMessage,
  handleAutoApprovalReviewNotification,
  handleItemLifecycleNotification,
  handleModelReroutedNotification,
  mergeItemFields,
} from "./codex-reducer-items";
import {
  prependLog,
  pruneTerminalInputBuffersForThread,
  threadRuntimePatch,
  withActiveComposerMode,
} from "./codex-reducer-runtime";
import {
  applyErrorNotification,
  applyMcpServerStartupStatusNotification,
  handleServerRequestResolvedNotification,
  logNotificationIfUseful,
} from "./codex-reducer-system";
import {
  applyThreadCompactedNotification,
  applyThreadGoalClearedNotification,
  applyThreadGoalUpdatedNotification,
  applyThreadSettingsUpdatedNotification,
  applyThreadTokenUsageUpdatedNotification,
  enrichMultiAgentReceiverThreadsInRuntimes,
  handleThreadNameUpdatedNotification,
  handleThreadRemovedNotification,
  handleThreadStartedNotification,
  handleThreadStatusChangedNotification,
  handleThreadUnarchivedNotification,
  markThreadsNeedResumeAfterReconnectState,
  nextActiveThreadId,
  resetThreadComposerModeState,
  setActiveComposerModeState,
  setLatestCollaborationModeState,
  upsertThreadState,
} from "./codex-reducer-threads";
import {
  finishTurn,
  handleTurnDiffUpdatedNotification,
  handleTurnStartedNotification,
  updateLiveTokenSpeed,
  upsertTurnPlan,
} from "./codex-reducer-turns";
import type { CodexUiAction, CodexUiState } from "./codex-ui-types";
import { applyInvalidation } from "./notification-invalidation";
import {
  canNavigateBackInHistory,
  canNavigateForwardInHistory,
  pushThreadHistoryEntry,
} from "./thread-history";

export type { ThreadTokenSpeedSnapshot, ThreadTokenUsageSnapshot } from "./thread-token-usage";
export type {
  CodexUiAction,
  CodexUiState,
  LogLine,
  NotificationInvalidationState,
  PendingServerRequest,
  ThreadContextDefaults,
  ThreadMemoryPreferences,
  ThreadRuntimeSlice,
  TurnPlanSnapshot,
} from "./codex-ui-types";
export { OPTIMISTIC_TURN_PLACEHOLDER_PREFIX } from "./codex-ui-types";
export {
  initialCodexUiState,
  selectActiveThreadRuntime,
  selectActiveTurnId,
  selectItemsByThread,
  selectLatestCollaborationMode,
  selectThreadComposerMode,
  selectThreadItems,
  selectThreadRuntime,
} from "./codex-reducer-runtime";

export function codexUiReducer(state: CodexUiState, action: CodexUiAction): CodexUiState {
  switch (action.type) {
    case "connecting":
      return { ...state, connecting: action.value };
    case "connected":
      return { ...state, connected: action.value, connecting: false };
    case "hostStatus":
      // status.running means the sidecar PROCESS exists, not that this client
      // is attached to it. The 5s status poll must never resurrect `connected`
      // after a transport closure (that starved the backoff reconnect loop
      // forever); it may only downgrade when the process is gone.
      return { ...state, hostStatus: action.status, connected: state.connected && action.status.running };
    case "setThreads":
      return withActiveComposerMode({
        ...state,
        threads: action.threads,
        threadsRuntime: enrichMultiAgentReceiverThreadsInRuntimes(state.threadsRuntime, action.threads),
        activeThreadId: nextActiveThreadId(state.activeThreadId, action.threads),
      });
    case "upsertThread":
      return upsertThreadState(state, action.thread, action.select === true);
    case "renameThread":
      // Narrow patch on purpose: callers hold a render-time thread snapshot,
      // and merging that whole object back would roll back concurrent updates.
      return {
        ...state,
        threads: state.threads.map((thread) =>
          thread.id === action.threadId ? { ...thread, name: action.name } : thread),
      };
    case "setActiveThread": {
      // codex: electron-menu-shortcuts-*.js#navigateBack/Forward —
      // every explicit thread switch participates in the navigation
      // history (browser-style back stack). Forward branch is truncated
      // and consecutive duplicates of the same id are coalesced — see
      // `./thread-history.ts`.
      const historyPatch = pushThreadHistoryEntry(
        state.threadHistoryStack,
        state.threadHistoryIndex,
        action.threadId,
      );
      return withActiveComposerMode({
        ...state,
        activeThreadId: action.threadId,
        threadHistoryStack: historyPatch.threadHistoryStack,
        threadHistoryIndex: historyPatch.threadHistoryIndex,
      });
    }
    case "navigateBackInHistory": {
      // codex: electron-menu-shortcuts-*.js#navigateBack — separate
      // from `setActiveThread` because the history cursor moves without
      // pushing a new entry; otherwise pressing Back would immediately
      // bury the entry we just navigated to.
      if (!canNavigateBackInHistory(state.threadHistoryStack, state.threadHistoryIndex)) {
        return state;
      }
      const newIndex = state.threadHistoryIndex - 1;
      const targetId = state.threadHistoryStack[newIndex];
      if (!targetId) return state;
      return withActiveComposerMode({
        ...state,
        activeThreadId: targetId,
        threadHistoryIndex: newIndex,
      });
    }
    case "navigateForwardInHistory": {
      // codex: electron-menu-shortcuts-*.js#navigateForward — mirror
      // of the back case; no-op at the head of the stack.
      if (!canNavigateForwardInHistory(state.threadHistoryStack, state.threadHistoryIndex)) {
        return state;
      }
      const newIndex = state.threadHistoryIndex + 1;
      const targetId = state.threadHistoryStack[newIndex];
      if (!targetId) return state;
      return withActiveComposerMode({
        ...state,
        activeThreadId: targetId,
        threadHistoryIndex: newIndex,
      });
    }
    case "removeThread": {
      const nextThreads = state.threads.filter((thread) => thread.id !== action.threadId);
      const { [action.threadId]: _removed, ...threadsRuntime } = state.threadsRuntime;
      const terminalInputBuffers = pruneTerminalInputBuffersForThread(state.terminalInputBuffers, action.threadId);
      return withActiveComposerMode({
        ...state,
        threads: nextThreads,
        threadsRuntime,
        terminalInputBuffers,
        activeThreadId: state.activeThreadId === action.threadId ? nextThreads[0]?.id ?? null : state.activeThreadId,
      });
    }
    case "markThreadsNeedResumeAfterReconnect":
      return markThreadsNeedResumeAfterReconnectState(state);
    case "setLatestCollaborationMode":
      return setLatestCollaborationModeState(state, action.threadId, action.collaborationMode);
    case "setActiveComposerMode":
      return setActiveComposerModeState(state, action.mode);
    case "resetThreadComposerMode":
      return resetThreadComposerModeState(state, action.threadId);
    case "invalidateAppList":
      return {
        ...state,
        invalidation: {
          ...state.invalidation,
          appList: state.invalidation.appList + 1,
          appListMessage: action.message,
        },
      };
    case "setAccount":
      return action.account === state.account ? state : { ...state, account: action.account };
    case "invalidateAuth":
      return {
        ...state,
        invalidation: { ...state.invalidation, authRefresh: state.invalidation.authRefresh + 1 },
      };
    case "notification": {
      const next = applyNotification(state, action.message);
      const invalidation = applyInvalidation(next.invalidation, action.message);
      const account = applyAccountNotification(next.account, action.message);
      if (invalidation === next.invalidation && account === next.account) return next;
      return { ...next, invalidation, account };
    }
    case "serverRequest":
      return {
        ...state,
        pendingRequests: [
          ...state.pendingRequests.filter((request) => request.id !== action.request.id),
          {
            id: action.request.id,
            method: action.request.method,
            params: action.request.params,
            createdAt: Date.now(),
          },
        ],
      };
    case "resolveServerRequest":
      return {
        ...state,
        pendingRequests: state.pendingRequests.filter((request) => request.id !== action.id),
      };
    case "log":
      return prependLog(state, action.text, action.level, action.source);
    case "setModels":
      return { ...state, models: action.models };
    case "upsertModel":
      return {
        ...state,
        models: [
          action.model,
          ...state.models.filter((model) => model.id !== action.model.id),
        ],
      };
    case "setThreadContextDefaults":
      return { ...state, threadContextDefaults: action.context };
    case "setThreadResolvedModel":
      return threadRuntimePatch(state, action.threadId, {
        resolvedModel: { model: action.model, modelProvider: action.modelProvider },
      });
    case "optimisticUserMessage":
      return applyOptimisticUserMessage(state, action);
    case "bindOptimisticTurn":
      return applyBindOptimisticTurn(state, action);
    case "dropOptimisticUserMessage":
      return applyDropOptimisticUserMessage(state, action);
    default:
      return state;
  }
}

/*
 * `applyNotification` is a thin per-method dispatcher: it does the shared
 * `params` extraction once, then routes each method (or fall-through group) to a
 * domain handler below. Handlers are grouped by domain — thread lifecycle, turn
 * lifecycle, item lifecycle/deltas, model, plan/diff — and each is a pure
 * `(state, params[, message]) => state` slice of the original switch body, moved
 * verbatim. The item-lifecycle fall-through group (9 methods that shared one
 * case body) is preserved by routing all 9 labels to a single handler that
 * still derives its completion bias from `message.method`.
 */
function applyNotification(state: CodexUiState, message: JsonRpcNotification): CodexUiState {
  const params = (message.params ?? {}) as Record<string, unknown>;
  switch (message.method) {
    case "error":
      return applyErrorNotification(state, params);
    case "thread/started":
      return handleThreadStartedNotification(state, params);
    case "thread/status/changed":
      return handleThreadStatusChangedNotification(state, params);
    case "thread/name/updated":
      return handleThreadNameUpdatedNotification(state, params);
    case "thread/settings/updated":
      return applyThreadSettingsUpdatedNotification(state, params);
    case "thread/archived":
    case "thread/closed":
      return handleThreadRemovedNotification(state, params);
    case "thread/unarchived":
      return handleThreadUnarchivedNotification(state, params);
    case "thread/tokenUsage/updated":
      // codex: composer-*.js `/status` panel — projects the
      // `ThreadTokenUsage` payload (last-turn breakdown + `modelContextWindow`)
      // into `ThreadRuntimeSlice.tokenUsage` so the composer status panel can
      // render the context usage row.
      return applyThreadTokenUsageUpdatedNotification(state, params);
    case "thread/compacted":
      return applyThreadCompactedNotification(state, params);
    case "thread/goal/updated":
      return applyThreadGoalUpdatedNotification(state, params);
    case "thread/goal/cleared":
      return applyThreadGoalClearedNotification(state, params);
    case "turn/started":
      return handleTurnStartedNotification(state, params);
    case "item/started":
    case "item/completed":
    case "item/commandExecution/requestApproval":
    case "item/fileChange/requestApproval":
    case "item/permissions/requestApproval":
    case "item/tool/call":
    case "item/tool/requestUserInput":
      return handleItemLifecycleNotification(state, params, message);
    /*
     * Codex Desktop's `remote-conversation-page` dispatcher consumes 5 visible
     * item-level delta channels (docs §26.4). Forge used to subscribe to 3
     * extra protocol-defined channels — none of which had a downstream
     * consumer in the renderer:
     *
     *   - `item/reasoning/summaryPartAdded` — `appendReasoningText` already
     *     auto-expands the summary array via `updateReasoningParts`, making
     *     a separate "pre-allocate slot" channel redundant. Matches Codex's
     *     `Tn(arr, idx, default)` helper which expands on first delta arrival.
     *   - `item/fileChange/outputDelta` — flagged deprecated in the v2
     *     protocol; modern app-server does not send it.
     *   - `item/mcpToolCall/progress` — Desktop currently logs and ignores
     *     this progress message instead of projecting a renderer field.
     *
     * The 5 channels Forge now consumes match Codex exactly. The single
     * non-text channel here is `item/commandExecution/terminalInteraction`,
     * which Codex handles in app-server-manager by parsing stdin into
     * commandActions. The single intentional divergence is
     * `item/fileChange/patchUpdated` below, kept because Forge renders
     * `changes[]` incrementally via `tool-activity-detail.tsx:334` (Codex
     * waits for `item/completed`).
     */
    case "item/agentMessage/delta":
      return updateLiveTokenSpeed(appendItemText(state, params, "agentMessage", "text", "delta"), params);
    case "item/plan/delta":
      return updateLiveTokenSpeed(appendItemText(state, params, "plan", "text", "delta"), params);
    case "item/reasoning/textDelta":
      return updateLiveTokenSpeed(appendReasoningText(state, params, "content", "contentIndex"), params);
    case "item/reasoning/summaryTextDelta":
      return updateLiveTokenSpeed(appendReasoningText(state, params, "summary", "summaryIndex"), params);
    case "item/commandExecution/outputDelta":
      return appendItemText(state, params, "commandExecution", "aggregatedOutput", "delta");
    case "item/commandExecution/terminalInteraction":
      return applyCommandExecutionTerminalInteraction(state, params);
    case "item/fileChange/patchUpdated":
      // Forge extension (not in Codex Desktop's 5-channel set).
      return mergeItemFields(state, params, "fileChange", { changes: params.changes });
    case "item/autoApprovalReview/started":
    case "item/autoApprovalReview/completed":
      // Codex synthesizes a client-side automatic-approval-review timeline item
      // from these notifications (payload is the review itself, no params.item).
      return handleAutoApprovalReviewNotification(state, params);
    case "model/rerouted":
      return handleModelReroutedNotification(state, params);
    case "turn/plan/updated":
      return upsertTurnPlan(state, params);
    case "turn/diff/updated":
      return handleTurnDiffUpdatedNotification(state, params);
    case "turn/completed":
      return finishTurn(state, params, "completed");
    case "turn/failed":
      return finishTurn(state, params, "failed");
    case "turn/interrupted":
    case "turn/cancelled":
      return finishTurn(state, params, "interrupted");
    case "serverRequest/resolved":
      return handleServerRequestResolvedNotification(state, params);
    case "mcpServer/startupStatus/updated":
      return applyMcpServerStartupStatusNotification(state, params, message);
    default:
      return logNotificationIfUseful(state, message);
  }
}
