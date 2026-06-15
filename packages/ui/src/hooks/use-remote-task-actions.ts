import { useCallback } from "react";
import type { Dispatch, SetStateAction } from "react";

import type { AppNavigationTab } from "../components/app-navigation-rail";
import { useServices } from "../components/services-context";
import { formatError } from "../lib/format";
import { openExternalUrl } from "../lib/tauri-host";

/*
 * Remote-task open actions. `dispatch` comes from ServicesContext (provided by
 * the shell above ForgeAppBody); the remote-task / app-tab navigation setters
 * are passed in as params because they are owned by ForgeAppBody's body.
 * openRemoteTask switches to the remote-task app tab; openRemoteTaskExternal
 * opens the task on chatgpt.com. The chatgpt.com URL shape and warn/error toast
 * wording are contract-exact; deps stay `[dispatch]` exactly as in the original
 * (the navigation setters are stable).
 */
export function useRemoteTaskActions({
  setActiveRemoteTaskId,
  setActiveAppTab,
}: {
  setActiveRemoteTaskId: Dispatch<SetStateAction<string | null>>;
  setActiveAppTab: (tab: AppNavigationTab) => void;
}): {
  openRemoteTask: (taskId: string) => void;
  openRemoteTaskExternal: (taskId: string) => void;
} {
  const { dispatch } = useServices();
  const openRemoteTaskExternal = useCallback((taskId: string) => {
    const normalizedTaskId = taskId.trim();
    if (!normalizedTaskId) {
      dispatch({ type: "log", text: "remote task id is missing", level: "warn" });
      return;
    }
    void openExternalUrl(`https://chatgpt.com/codex/tasks/${encodeURIComponent(normalizedTaskId)}`)
      .catch((error) => {
        dispatch({ type: "log", text: `Failed to open remote task ${normalizedTaskId}: ${formatError(error)}`, level: "error" });
      });
  }, [dispatch]);
  const openRemoteTask = useCallback((taskId: string) => {
    const normalizedTaskId = taskId.trim();
    if (!normalizedTaskId) {
      dispatch({ type: "log", text: "remote task id is missing", level: "warn" });
      return;
    }
    setActiveRemoteTaskId(normalizedTaskId);
    setActiveAppTab("remoteTask");
  }, [dispatch, setActiveAppTab, setActiveRemoteTaskId]);

  return { openRemoteTask, openRemoteTaskExternal };
}
