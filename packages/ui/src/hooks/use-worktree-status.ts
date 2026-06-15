import { useEffect, useState } from "react";

import { formatError } from "../lib/format";
import { ghPrStatus, isTauriRuntime, type GhPrInfo } from "../lib/tauri-host";
import { useServices } from "../components/services-context";
import { readCurrentHostGitStatus, type HostGitStatus } from "../state/worktrees";

/*
 * Host git status + PR status for the active worktree cwd, lifted verbatim out of
 * ForgeApp. Two best-effort effects gated on `worktreeStatusCwd`: the git
 * status one logs a warn on failure, the PR one fails silently (the row simply
 * doesn't render). `dispatch` stays in the git effect's dep array exactly as in
 * the original.
 */
export function useWorktreeGitAndPrStatus({
  worktreeStatusCwd,
}: {
  worktreeStatusCwd: string;
}): {
  worktreeHostGitStatus: HostGitStatus | null;
  pullRequestStatus: GhPrInfo | null;
} {
  const { dispatch } = useServices();
  const [worktreeHostGitStatus, setWorktreeHostGitStatus] = useState<HostGitStatus | null>(null);
  const [pullRequestStatus, setPullRequestStatus] = useState<GhPrInfo | null>(null);

  useEffect(() => {
    if (!worktreeStatusCwd || !isTauriRuntime()) {
      setWorktreeHostGitStatus(null);
      return;
    }
    let cancelled = false;
    void readCurrentHostGitStatus(worktreeStatusCwd)
      .then((status) => {
        if (cancelled) return;
        setWorktreeHostGitStatus(status);
      })
      .catch((error) => {
        if (cancelled) return;
        setWorktreeHostGitStatus(null);
        dispatch({ type: "log", text: `host git status failed: ${formatError(error)}`, level: "warn" });
      });
    return () => {
      cancelled = true;
    };
  }, [dispatch, worktreeStatusCwd]);
  /*
   * codex: local-conversation-thread-*.js row 4 `ga` PR widget —
   * fetches PR status via `gh pr status` and caches it for `projectBranchDetails`.
   * Runs alongside the readCurrentHostGitStatus effect and is gated on the
   * same `worktreeStatusCwd`. Failures are silent (the row simply doesn't
   * render); they're logged once for triage but don't surface a banner.
   */
  useEffect(() => {
    if (!worktreeStatusCwd || !isTauriRuntime()) {
      setPullRequestStatus(null);
      return;
    }
    let cancelled = false;
    void ghPrStatus(worktreeStatusCwd)
      .then((response) => {
        if (cancelled) return;
        setPullRequestStatus(response.pr);
      })
      .catch(() => {
        if (cancelled) return;
        // codex: PR row is best-effort; gh CLI absence / network failure should
        // not block the rail — silently clear and skip the log noise.
        setPullRequestStatus(null);
      });
    return () => {
      cancelled = true;
    };
  }, [worktreeStatusCwd]);

  return { worktreeHostGitStatus, pullRequestStatus };
}
