import { useEffect, useRef } from "react";

import { useServices } from "../components/services-context";
import { formatError } from "../lib/format";
import type { ThreadContextDefaults } from "../state/codex-reducer";
import { resumeThreadWithMetadataRead } from "../state/thread-workflow";

/*
 * Resume-after-reconnect recovery, lifted verbatim out of HiCodexApp. Two local
 * refs gate the behaviour: `hasConnectedOnceRef` distinguishes the first connect
 * from a reconnect, `needsReconnectRecoveryRef` records that a drop happened
 * while connected. On the reconnect edge it marks threads needing resume and
 * re-reads the active thread's resume metadata. `dispatch` (stable) is kept out
 * of the dep array exactly as in the original.
 */
export function useReconnectRecovery({
  connected,
  activeThreadId,
  workspace,
  effectiveThreadContextDefaults,
}: {
  connected: boolean;
  activeThreadId: string | null;
  workspace: string;
  effectiveThreadContextDefaults: ThreadContextDefaults | null;
}): void {
  const { client, dispatch } = useServices();
  const hasConnectedOnceRef = useRef(false);
  const needsReconnectRecoveryRef = useRef(false);

  useEffect(() => {
    if (!connected) {
      if (hasConnectedOnceRef.current) needsReconnectRecoveryRef.current = true;
      return;
    }
    if (!hasConnectedOnceRef.current) {
      hasConnectedOnceRef.current = true;
      return;
    }
    if (!needsReconnectRecoveryRef.current) return;
    needsReconnectRecoveryRef.current = false;
    dispatch({ type: "markThreadsNeedResumeAfterReconnect" });
    if (!activeThreadId) return;
    const threadId = activeThreadId;
    void resumeThreadWithMetadataRead(client, threadId, workspace, effectiveThreadContextDefaults)
      .then((result) => dispatch({ type: "upsertThread", thread: result.thread, select: true }))
      .catch((error) => {
        dispatch({
          type: "log",
          text: `resume after reconnect failed: ${formatError(error)}`,
          level: "warn",
        });
      });
  }, [client, effectiveThreadContextDefaults, activeThreadId, connected, workspace]);
}
