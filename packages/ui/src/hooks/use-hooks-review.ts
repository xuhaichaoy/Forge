import { useCallback, useEffect, useRef, useState } from "react";
import type { Thread } from "@hicodex/codex-protocol";

import { useServices } from "../components/services-context";
import { formatError } from "../lib/format";
import type { SettingsPanelId } from "../state/composer-workflow";
import {
  buildConfigBatchWriteParams,
  formatConfigWriteError,
  readConfigWriteTarget,
} from "../state/config-write-target";
import {
  buildTrustAllHooksEdits,
  hookReviewProjectRoot,
  projectHooksNeedingReview,
  type HooksReviewSnapshot,
  type HooksSettingsFocus,
} from "../state/hooks-review";

/*
 * Hooks-needing-review banner data + actions, lifted verbatim out of HiCodexApp.
 * The fetch effect re-runs on connect / hooksChangedNonce / cwd; a monotonic
 * requestSeq ref discards out-of-order responses. trustAllHooks writes hooks.state
 * through config/batchWrite then re-fetches; reviewHooks opens the hooks settings
 * panel focused on the flagged hook. `dispatch` (stable useReducer dispatch) is
 * intentionally kept out of the dep arrays, exactly as in the original.
 */
export function useHooksReview({
  hooksChangedNonce,
  ensureConnected,
  loadSettingsPanel,
  activeThread,
  workspace,
  defaultCwd,
}: {
  hooksChangedNonce: number;
  ensureConnected: () => Promise<boolean>;
  loadSettingsPanel: (
    panel: SettingsPanelId,
    options?: { forceReload?: boolean; hooksFocus?: HooksSettingsFocus | null },
  ) => void;
  activeThread: Thread | null | undefined;
  workspace: string;
  defaultCwd: string | null | undefined;
}): {
  hooksReviewSnapshot: HooksReviewSnapshot | null;
  trustAllHooks: () => Promise<void>;
  reviewHooks: () => void;
} {
  const { client, dispatch, connected } = useServices();
  const [hooksReviewSnapshot, setHooksReviewSnapshot] = useState<HooksReviewSnapshot | null>(null);
  const hooksReviewRequestSeqRef = useRef(0);
  const hooksReviewCwd = activeThread ? "" : (workspace.trim() || defaultCwd?.trim() || "");

  useEffect(() => {
    const cwd = hooksReviewCwd.trim();
    if (!connected || !hookReviewProjectRoot(cwd)) {
      setHooksReviewSnapshot(null);
      return;
    }
    let disposed = false;
    const requestSeq = hooksReviewRequestSeqRef.current + 1;
    hooksReviewRequestSeqRef.current = requestSeq;
    void client.request<unknown>("hooks/list", { cwds: [cwd] }, 120_000)
      .then((response) => {
        if (disposed || hooksReviewRequestSeqRef.current !== requestSeq) return;
        setHooksReviewSnapshot(projectHooksNeedingReview(response, cwd));
      })
      .catch((error) => {
        if (disposed || hooksReviewRequestSeqRef.current !== requestSeq) return;
        setHooksReviewSnapshot(null);
        dispatch({ type: "log", text: `hooks review refresh failed: ${formatError(error)}`, level: "warn" });
      });
    return () => {
      disposed = true;
    };
  }, [client, hooksChangedNonce, hooksReviewCwd, connected]);

  const trustAllHooks = useCallback(async () => {
    const snapshot = hooksReviewSnapshot;
    if (!snapshot || snapshot.count <= 0) return;
    if (!(await ensureConnected())) {
      dispatch({ type: "log", text: "Runtime is offline.", level: "warn" });
      return;
    }
    try {
      const target = await readConfigWriteTarget(client, {
        cwd: snapshot.cwd,
        keyPaths: ["hooks.state"],
        scope: "Hooks trust",
      });
      await client.request("config/batchWrite", buildConfigBatchWriteParams({
        edits: buildTrustAllHooksEdits(snapshot.hooks),
        target,
        reloadUserConfig: true,
      }), 120_000);
      dispatch({ type: "log", text: "Trusted hooks", level: "info" });
      const response = await client.request<unknown>("hooks/list", { cwds: [snapshot.cwd] }, 120_000);
      setHooksReviewSnapshot(projectHooksNeedingReview(response, snapshot.cwd));
    } catch (error) {
      dispatch({ type: "log", text: `hooks trust failed: ${formatConfigWriteError(error, "Hooks trust")}`, level: "warn" });
    }
  }, [client, ensureConnected, hooksReviewSnapshot]);

  const reviewHooks = useCallback(() => {
    void loadSettingsPanel("hooks", {
      forceReload: true,
      hooksFocus: hooksReviewSnapshot?.focus ?? null,
    });
  }, [hooksReviewSnapshot?.focus, loadSettingsPanel]);

  return { hooksReviewSnapshot, trustAllHooks, reviewHooks };
}
