import { useCallback, useEffect, useRef, useState, type SetStateAction } from "react";
import type { CodexJsonRpcClient } from "../lib/codex-json-rpc-client";
import { formatError } from "../lib/format";
import {
  buildConfigBatchWriteParams,
  formatConfigWriteError,
  readConfigWriteTarget,
} from "../state/config-write-target";
import {
  DEFAULT_FOLLOW_UP_QUEUE_MODE,
  FOLLOW_UP_QUEUE_MODE_KEY,
  followUpQueueModeConfigEdit,
  followUpQueueModeFromQueueingEnabled,
  followUpQueueingEnabledFromMode,
  isLegacyFollowUpQueueMode,
  normalizeFollowUpQueueMode,
  type FollowUpQueueMode,
} from "../state/follow-up-queue-mode";
import type { ThreadWorkflowDispatch } from "../state/thread-workflow";

const CONFIG_WRITE_TIMEOUT_MS = 120_000;

export function useFollowUpQueueMode({
  client,
  connected,
  dispatch,
  ensureConnected,
}: {
  client: CodexJsonRpcClient;
  connected: boolean;
  dispatch: ThreadWorkflowDispatch;
  ensureConnected: () => Promise<boolean>;
}): {
  followUpQueueingEnabled: boolean;
  setFollowUpQueueingEnabled: (nextValue: SetStateAction<boolean>) => void;
} {
  const [followUpQueueMode, setFollowUpQueueModeState] = useState<FollowUpQueueMode>(DEFAULT_FOLLOW_UP_QUEUE_MODE);
  const followUpQueueModeRef = useRef<FollowUpQueueMode>(DEFAULT_FOLLOW_UP_QUEUE_MODE);
  const followUpQueueModeWriteSeqRef = useRef(0);
  const followUpQueueingEnabled = followUpQueueingEnabledFromMode(followUpQueueMode);

  const persistFollowUpQueueMode = useCallback((nextMode: FollowUpQueueMode, options: {
    previousMode?: FollowUpQueueMode;
    rollbackOnFailure?: boolean;
  } = {}) => {
    const previousMode = options.previousMode ?? followUpQueueModeRef.current;
    const rollbackOnFailure = options.rollbackOnFailure ?? true;
    const writeSeq = ++followUpQueueModeWriteSeqRef.current;
    followUpQueueModeRef.current = nextMode;
    setFollowUpQueueModeState(nextMode);

    void (async () => {
      try {
        if (!(await ensureConnected())) throw new Error("Runtime is offline.");
        const target = await readConfigWriteTarget(client, {
          keyPaths: [FOLLOW_UP_QUEUE_MODE_KEY],
          scope: "Follow-up queue mode",
        });
        await client.request("config/batchWrite", buildConfigBatchWriteParams({
          edits: [followUpQueueModeConfigEdit(nextMode)],
          target,
          reloadUserConfig: true,
        }), CONFIG_WRITE_TIMEOUT_MS);
      } catch (error) {
        if (writeSeq !== followUpQueueModeWriteSeqRef.current) return;
        if (rollbackOnFailure) {
          followUpQueueModeRef.current = previousMode;
          setFollowUpQueueModeState(previousMode);
        }
        dispatch({
          type: "log",
          text: `followUpQueueMode write failed: ${formatConfigWriteError(error, "Follow-up queue mode")}`,
          level: "warn",
        });
      }
    })();
  }, [client, dispatch, ensureConnected]);

  const setFollowUpQueueingEnabled = useCallback((nextValue: SetStateAction<boolean>) => {
    const currentMode = followUpQueueModeRef.current;
    const currentEnabled = followUpQueueingEnabledFromMode(currentMode);
    const nextEnabled = typeof nextValue === "function" ? nextValue(currentEnabled) : nextValue;
    const nextMode = followUpQueueModeFromQueueingEnabled(nextEnabled);
    if (nextMode === currentMode) return;
    persistFollowUpQueueMode(nextMode, { previousMode: currentMode });
  }, [persistFollowUpQueueMode]);

  useEffect(() => {
    if (!connected) return;
    let cancelled = false;
    const readSeq = followUpQueueModeWriteSeqRef.current;
    void (async () => {
      try {
        const result = await client.request<{ config?: Record<string, unknown> }>("config/read", {
          includeLayers: false,
        }, CONFIG_WRITE_TIMEOUT_MS);
        if (cancelled || readSeq !== followUpQueueModeWriteSeqRef.current) return;
        const rawMode = result.config?.[FOLLOW_UP_QUEUE_MODE_KEY];
        const mode = normalizeFollowUpQueueMode(rawMode);
        followUpQueueModeRef.current = mode;
        setFollowUpQueueModeState(mode);
        if (isLegacyFollowUpQueueMode(rawMode)) {
          persistFollowUpQueueMode("steer", {
            previousMode: "steer",
            rollbackOnFailure: false,
          });
        }
      } catch (error) {
        if (cancelled) return;
        dispatch({ type: "log", text: `followUpQueueMode config/read failed: ${formatError(error)}`, level: "warn" });
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [client, connected, dispatch, persistFollowUpQueueMode]);

  return {
    followUpQueueingEnabled,
    setFollowUpQueueingEnabled,
  };
}
