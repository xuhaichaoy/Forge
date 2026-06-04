import { useCallback, useState } from "react";
import type {
  JsonRpcNotification,
  ThreadGoalClearResponse,
  ThreadGoalSetResponse,
} from "@hicodex/codex-protocol";
import type { ThreadGoalStatus } from "@hicodex/codex-protocol/generated/v2/ThreadGoalStatus";

import type { ThreadGoalBannerAction } from "../components/thread-goal-banner";
import { useServices } from "../components/services-context";
import { formatError } from "../lib/format";

/*
 * Thread-goal edit / status / clear actions + the pending-action spinner state,
 * lifted verbatim out of HiCodexApp. Each action sets the pending flag, calls the
 * thread/goal/* RPC, dispatches the resulting notification, and clears the flag.
 * `dispatch` (stable) stays out of the dep arrays exactly as in the original.
 */
export function useThreadGoalActions({
  ensureConnected,
  activeThreadId,
}: {
  ensureConnected: () => Promise<boolean>;
  activeThreadId: string | null;
}): {
  threadGoalPendingAction: ThreadGoalBannerAction | null;
  editActiveThreadGoal: (objective: string) => Promise<void>;
  setActiveThreadGoalStatus: (status: ThreadGoalStatus) => Promise<void>;
  clearActiveThreadGoal: () => Promise<void>;
} {
  const { client, dispatch } = useServices();
  const [threadGoalPendingAction, setThreadGoalPendingAction] = useState<ThreadGoalBannerAction | null>(null);

  const updateActiveThreadGoal = useCallback(async (
    patch: { objective?: string; status?: ThreadGoalStatus },
    pendingAction: ThreadGoalBannerAction,
  ) => {
    const threadId = activeThreadId;
    if (!threadId) {
      dispatch({ type: "log", text: "Select or start a thread before editing a goal.", level: "warn" });
      return;
    }
    if (!(await ensureConnected())) return;
    setThreadGoalPendingAction(pendingAction);
    try {
      const response = await client.request<ThreadGoalSetResponse>("thread/goal/set", {
        threadId,
        ...patch,
      }, 120_000);
      const message: JsonRpcNotification = {
        method: "thread/goal/updated",
        params: { threadId, turnId: null, goal: response.goal },
      };
      dispatch({ type: "notification", message });
    } catch (error) {
      dispatch({ type: "log", text: `thread goal update failed: ${formatError(error)}`, level: "error" });
    } finally {
      setThreadGoalPendingAction(null);
    }
  }, [client, ensureConnected, activeThreadId]);

  const editActiveThreadGoal = useCallback((objective: string) => (
    updateActiveThreadGoal({ objective }, "edit")
  ), [updateActiveThreadGoal]);

  const setActiveThreadGoalStatus = useCallback((status: ThreadGoalStatus) => (
    updateActiveThreadGoal({ status }, "status")
  ), [updateActiveThreadGoal]);

  const clearActiveThreadGoal = useCallback(async () => {
    const threadId = activeThreadId;
    if (!threadId) {
      dispatch({ type: "log", text: "Select or start a thread before clearing a goal.", level: "warn" });
      return;
    }
    if (!(await ensureConnected())) return;
    setThreadGoalPendingAction("clear");
    try {
      const response = await client.request<ThreadGoalClearResponse>("thread/goal/clear", { threadId }, 120_000);
      if (response.cleared) {
        const message: JsonRpcNotification = {
          method: "thread/goal/cleared",
          params: { threadId },
        };
        dispatch({ type: "notification", message });
      }
    } catch (error) {
      dispatch({ type: "log", text: `thread goal clear failed: ${formatError(error)}`, level: "error" });
    } finally {
      setThreadGoalPendingAction(null);
    }
  }, [client, ensureConnected, activeThreadId]);

  return { threadGoalPendingAction, editActiveThreadGoal, setActiveThreadGoalStatus, clearActiveThreadGoal };
}
