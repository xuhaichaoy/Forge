import { useCallback, useEffect, useState } from "react";

import { formatError } from "../lib/format";
import { ghPrStatus, hostCommandErrorCode, isTauriRuntime, type GhPrInfo } from "../lib/tauri-host";
import { useServices } from "../components/services-context";
import { readCurrentHostGitStatus, type HostGitStatus } from "../state/worktrees";

export interface WorktreeGithubStatus {
  isAuthenticated?: boolean;
  isError?: boolean;
  isInstalled?: boolean;
  isLoading?: boolean;
  pullRequestStatus?: {
    number: number;
  };
}

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
  worktreeGithubStatus: WorktreeGithubStatus | null;
  worktreeHostGitStatus: HostGitStatus | null;
  pullRequestStatus: GhPrInfo | null;
  refreshWorktreeGitStatus: () => void;
} {
  const { dispatch } = useServices();
  const [worktreeGithubStatus, setWorktreeGithubStatus] = useState<WorktreeGithubStatus | null>(null);
  const [worktreeHostGitStatus, setWorktreeHostGitStatus] = useState<HostGitStatus | null>(null);
  const [pullRequestStatus, setPullRequestStatus] = useState<GhPrInfo | null>(null);
  const [refreshToken, setRefreshToken] = useState(0);
  const refreshWorktreeGitStatus = useCallback(() => {
    setRefreshToken((token) => token + 1);
  }, []);

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
  }, [dispatch, refreshToken, worktreeStatusCwd]);
  /*
   * codex: local-conversation-thread-*.js row 4 `ga` PR widget —
   * fetches PR status via `gh pr status` and caches it for `projectBranchDetails`.
   * Runs alongside the readCurrentHostGitStatus effect and is gated on the
   * same `worktreeStatusCwd`. Failures are silent (the row simply doesn't
   * render); they're logged once for triage but don't surface a banner.
   */
  useEffect(() => {
    if (!worktreeStatusCwd || !isTauriRuntime()) {
      setWorktreeGithubStatus(null);
      setPullRequestStatus(null);
      return;
    }
    let cancelled = false;
    setWorktreeGithubStatus({ isLoading: true });
    void ghPrStatus(worktreeStatusCwd)
      .then((response) => {
        if (cancelled) return;
        setPullRequestStatus(response.pr);
        setWorktreeGithubStatus({
          isAuthenticated: true,
          isInstalled: true,
          ...(response.pr ? { pullRequestStatus: { number: response.pr.number } } : {}),
        });
      })
      .catch((error: unknown) => {
        if (cancelled) return;
        // codex: PR row is best-effort; gh CLI absence / network failure should
        // not block the rail — silently clear and skip the log noise.
        setPullRequestStatus(null);
        setWorktreeGithubStatus(githubStatusFromPrError(error));
      });
    return () => {
      cancelled = true;
    };
  }, [refreshToken, worktreeStatusCwd]);

  return { worktreeGithubStatus, worktreeHostGitStatus, pullRequestStatus, refreshWorktreeGitStatus };
}

function githubStatusFromPrError(error: unknown): WorktreeGithubStatus | null {
  const code = hostCommandErrorCode(error);
  const message = error instanceof Error ? error.message : String(error ?? "");
  const normalized = message.toLowerCase();
  if (code === "not_found" && normalized.includes("not a git repository")) {
    return null;
  }
  if (code === "not_found" && normalized.includes("gh cli")) {
    return { isInstalled: false };
  }
  if (
    normalized.includes("not authenticated")
    || normalized.includes("auth login")
    || normalized.includes("authentication")
    || normalized.includes("not logged")
  ) {
    return { isAuthenticated: false, isInstalled: true };
  }
  return { isError: true, isInstalled: true };
}
