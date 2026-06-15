import { useCallback, useRef, useState, type Dispatch, type SetStateAction } from "react";

import type { PatchAction, PatchActionState } from "../components/conversation-view";
import type { UnifiedDiffFailure } from "../components/unified-diff-failure-dialog";
import { formatError } from "../lib/format";
import { applyPatchAction, type PatchActionResult } from "../lib/tauri-host";
import { useServices } from "../components/services-context";

export interface UseTurnPatchActionResult {
  handlePatchAction: (action: PatchAction, diff: string) => void;
  patchActionState: PatchActionState;
  patchActionInFlight: boolean;
  patchFailure: UnifiedDiffFailure | null;
  setPatchFailure: Dispatch<SetStateAction<UnifiedDiffFailure | null>>;
}

/*
 * Codex Desktop turn-diff Undo / Reapply state + handler, lifted verbatim out of
 * ForgeApp. `patchActionState` tracks the toolbar button direction (undo ↔
 * reapply); `patchFailure` drives the <UnifiedDiffFailureDialog/> overlay. The
 * handler is handed to ConversationView and bubbles down to TurnDiffBlock's
 * onPatchAction. `dispatch` is the stable useReducer dispatch, so listing it in
 * the handler's dep array never retriggers anything.
 */
export function useTurnPatchAction({
  worktreeStatusCwd,
}: {
  worktreeStatusCwd: string;
}): UseTurnPatchActionResult {
  const { dispatch } = useServices();
  const [patchActionState, setPatchActionState] = useState<PatchActionState>(null);
  const [patchFailure, setPatchFailure] = useState<UnifiedDiffFailure | null>(null);
  const [patchActionInFlight, setPatchActionInFlight] = useState(false);
  /*
   * Synchronous re-entrancy lock — `setPatchActionInFlight(true)` only updates
   * state on the NEXT render, so a fast double-click can clear the `if
   * (patchActionInFlight) return;` guard twice before React commits. A ref
   * mutates immediately and blocks the second handler call before any git
   * apply runs against the working tree.
   */
  const patchActionLockRef = useRef(false);
  const handlePatchAction = useCallback(
    (action: PatchAction, diff: string) => {
      if (patchActionLockRef.current) return;
      patchActionLockRef.current = true;
      const cwd = worktreeStatusCwd;
      if (!cwd) {
        patchActionLockRef.current = false;
        setPatchFailure({
          action: action === "undo" ? "revert" : "reapply",
          result: { appliedPaths: [], skippedPaths: [], conflictedPaths: [] },
          errorCode: "not-git-repo",
        });
        return;
      }
      setPatchActionInFlight(true);
      const apiAction = action === "undo" ? "revert" : "reapply";
      applyPatchAction({ action: apiAction, diff, cwd })
        .then((result: PatchActionResult) => {
          const conflicted = result.conflictedPaths ?? [];
          const skipped = result.skippedPaths ?? [];
          const errorCode = result.errorCode ?? undefined;
          const failed =
            (errorCode != null && errorCode.length > 0)
            || conflicted.length > 0
            || skipped.length > 0;
          if (failed) {
            setPatchFailure({
              action: result.action,
              result: {
                appliedPaths: result.appliedPaths ?? [],
                skippedPaths: skipped,
                conflictedPaths: conflicted,
                execOutput: result.execOutput ?? null,
              },
              errorCode,
            });
            return;
          }
          // Clean apply / reverse — flip the toolbar button so the user can
          // toggle back without re-mounting the row, then surface Codex's
          // success toast (codex.unifiedDiff.revertPatchSuccess /
          // reapplyPatchSuccess). Re-verified vs Codex Desktop v26.519.81530.
          setPatchActionState({ action, diff });
          dispatch({
            type: "log",
            text: apiAction === "revert" ? "Changes reverted" : "Changes reapplied",
            level: "info",
          });
        })
        .catch((error: unknown) => {
          /*
           * A thrown patch action (IPC error, or host_apply_patch_action
           * returning Err before any structured result) surfaces as a danger
           * toast (codex.unifiedDiff.revertPatchError / reapplyPatchError),
           * matching Codex Desktop. The Failure Dialog is reserved for
           * partial/conflicted RESULTS (the .then() failed branch) and the
           * not-git-repo case. Re-verified vs Codex Desktop v26.519.81530.
           */
          const errorText = formatError(error);
          if (errorText && typeof console !== "undefined") {
            console.warn("patch action failed", errorText);
          }
          dispatch({
            type: "log",
            text: apiAction === "revert" ? "Failed to revert changes" : "Failed to reapply changes",
            level: "error",
          });
        })
        .finally(() => {
          patchActionLockRef.current = false;
          setPatchActionInFlight(false);
        });
    },
    [dispatch, worktreeStatusCwd],
  );

  return { handlePatchAction, patchActionState, patchActionInFlight, patchFailure, setPatchFailure };
}
