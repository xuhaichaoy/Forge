import { useCallback, useEffect, useMemo, useState } from "react";
import {
  checkoutGitBranch,
  createGitBranch,
  getGitDefaultBranch,
  isTauriRuntime,
  listGitBranches,
  type GitBranchInfo,
} from "../lib/tauri-host";
import {
  partitionBranches,
  stripRemotePrefix,
} from "./composer-branch-helpers";

interface BranchSwitcherState {
  status: "idle" | "loading" | "ready" | "error";
  branches: GitBranchInfo[];
  current: string | null;
  error: string | null;
}

const INITIAL_STATE: BranchSwitcherState = {
  status: "idle",
  branches: [],
  current: null,
  error: null,
};

interface UseComposerBranchSwitcherWorkflowInput {
  cwd?: string | null;
  currentBranch?: string | null;
  open: boolean;
  setOpen: (open: boolean) => void;
  onBranchSwitched?: (branchName: string) => void;
  onError?: (message: string) => void;
}

export function useComposerBranchSwitcherWorkflow({
  cwd,
  currentBranch,
  open,
  setOpen,
  onBranchSwitched,
  onError,
}: UseComposerBranchSwitcherWorkflowInput) {
  const trimmedCwd = typeof cwd === "string" ? cwd.trim() : "";
  const trimmedCurrent = typeof currentBranch === "string" ? currentBranch.trim() : "";
  const [state, setState] = useState<BranchSwitcherState>(INITIAL_STATE);
  const [query, setQuery] = useState("");
  const [switching, setSwitching] = useState<string | null>(null);
  const [switchError, setSwitchError] = useState<string | null>(null);
  // codex: branch-picker-extension — `useGitDefaultBranch` state; null until
  // the host call resolves so the "Default" chip is omitted from SSR snapshots.
  const [defaultBranch, setDefaultBranch] = useState<string | null>(null);
  // codex: branch-picker-extension — "Create new branch" inline form state.
  // The footer button toggles `creating` on; submitting `newBranchName`
  // shells out to `git checkout -b <name> <currentBranch>`.
  const [creating, setCreating] = useState(false);
  const [newBranchName, setNewBranchName] = useState("");
  const [createError, setCreateError] = useState<string | null>(null);
  const [createBusy, setCreateBusy] = useState(false);

  // codex: composer-footer-branch-switcher-*.js — `useGitCurrentBranch`
  // / `useGitRecentBranches`. We only fetch when running inside Tauri AND when
  // the dropdown opens; the chip itself uses the renderer-provided
  // `currentBranch` label so the SSR snapshot still includes "main".
  // codex: branch-picker-extension — request remote branches alongside locals
  // so the dropdown can render the "Remote branches" section without a second
  // round-trip.
  useEffect(() => {
    if (!open) return;
    if (!isTauriRuntime() || !trimmedCwd) {
      setState({ status: "error", branches: [], current: null, error: "host bridge unavailable" });
      return;
    }
    let cancelled = false;
    setState((prev) => ({ ...prev, status: "loading", error: null }));
    listGitBranches(trimmedCwd, { includeRemote: true })
      .then((response) => {
        if (cancelled) return;
        setState({
          status: "ready",
          branches: response.branches,
          current: response.current,
          error: null,
        });
      })
      .catch((error: unknown) => {
        if (cancelled) return;
        const message = error instanceof Error ? error.message : String(error);
        setState({ status: "error", branches: [], current: null, error: message });
      });
    return () => {
      cancelled = true;
    };
  }, [open, trimmedCwd]);

  // codex: branch-picker-extension — `useGitDefaultBranch`. We refetch on
  // both mount (so the renderer can highlight the default branch before the
  // dropdown opens) and on every open in case the user changed remotes.
  useEffect(() => {
    if (!isTauriRuntime() || !trimmedCwd) {
      setDefaultBranch(null);
      return;
    }
    let cancelled = false;
    getGitDefaultBranch(trimmedCwd)
      .then((response) => {
        if (cancelled) return;
        setDefaultBranch(response.defaultBranch ?? null);
      })
      .catch(() => {
        if (!cancelled) setDefaultBranch(null);
      });
    return () => {
      cancelled = true;
    };
  }, [open, trimmedCwd]);

  // codex: clear the inline switch error whenever the dropdown reopens or the
  // workspace cwd changes — matches Codex's toast-on-fresh-action behavior.
  // codex: branch-picker-extension — also reset the create-form state when
  // the dropdown closes so reopening starts fresh.
  useEffect(() => {
    setSwitchError(null);
    if (!open) {
      setCreating(false);
      setNewBranchName("");
      setCreateError(null);
    }
  }, [open, trimmedCwd]);

  const effectiveCurrent = state.current ?? trimmedCurrent;
  const chipLabel = effectiveCurrent || trimmedCurrent || "";
  // codex: composer-footer-branch-switcher-*.js — picker sort/filter.
  // Local refs put current first, then `committerdate desc`; remote refs sort
  // independently in their own section.
  const visibleBranchGroups = useMemo(
    () => partitionBranches(state.branches, query),
    [query, state.branches],
  );
  const visibleBranches = visibleBranchGroups.local;
  const visibleRemoteBranches = visibleBranchGroups.remote;
  const hostKnowsItIsNotGit = state.status === "ready" && state.current === null && state.branches.length === 0;
  const hidden = (hostKnowsItIsNotGit && !trimmedCurrent) || !chipLabel;

  const toggleOpen = useCallback(() => {
    setOpen(!open);
  }, [open, setOpen]);

  const selectBranch = useCallback(async (branchName: string) => {
    if (!trimmedCwd) return;
    if (branchName === effectiveCurrent) {
      setOpen(false);
      return;
    }
    setSwitching(branchName);
    setSwitchError(null);
    try {
      await checkoutGitBranch(trimmedCwd, branchName);
      setOpen(false);
      setQuery("");
      setState((prev) => ({
        ...prev,
        current: branchName,
        branches: prev.branches.map((branch) => ({
          ...branch,
          isCurrent: !branch.isRemote && branch.name === branchName,
        })),
      }));
      onBranchSwitched?.(branchName);
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : String(error);
      setSwitchError(message);
      onError?.(message);
    } finally {
      setSwitching(null);
    }
  }, [effectiveCurrent, onBranchSwitched, onError, setOpen, trimmedCwd]);

  const selectRemoteBranch = useCallback(async (remoteName: string) => {
    if (!trimmedCwd) return;
    const localName = stripRemotePrefix(remoteName);
    if (!localName) return;
    setSwitching(remoteName);
    setSwitchError(null);
    try {
      const localExists = state.branches.some(
        (branch) => !branch.isRemote && branch.name === localName,
      );
      if (localExists) {
        await checkoutGitBranch(trimmedCwd, localName);
      } else {
        await createGitBranch(trimmedCwd, localName, remoteName);
      }
      setOpen(false);
      setQuery("");
      setState((prev) => ({
        ...prev,
        current: localName,
        branches: prev.branches.map((branch) => ({
          ...branch,
          isCurrent: !branch.isRemote && branch.name === localName,
        })),
      }));
      onBranchSwitched?.(localName);
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : String(error);
      setSwitchError(message);
      onError?.(message);
    } finally {
      setSwitching(null);
    }
  }, [onBranchSwitched, onError, setOpen, state.branches, trimmedCwd]);

  const submitCreateBranch = useCallback(async () => {
    if (!trimmedCwd) return;
    const name = newBranchName.trim();
    if (!name) {
      setCreateError("Branch name is required");
      return;
    }
    setCreateBusy(true);
    setCreateError(null);
    try {
      // codex: branch-picker-extension — Codex Desktop bases the new branch on
      // whatever HEAD is at click time. Passing the current branch keeps the
      // intent explicit while still supporting detached-HEAD states.
      await createGitBranch(trimmedCwd, name, effectiveCurrent || undefined);
      setOpen(false);
      setQuery("");
      setNewBranchName("");
      setCreating(false);
      setState((prev) => ({
        ...prev,
        current: name,
        branches: [
          {
            name,
            isCurrent: true,
            isRemote: false,
            lastCommitMs: Date.now(),
          },
          ...prev.branches.map((branch) => ({
            ...branch,
            isCurrent: false,
          })),
        ],
      }));
      onBranchSwitched?.(name);
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : String(error);
      setCreateError(message);
      onError?.(message);
    } finally {
      setCreateBusy(false);
    }
  }, [effectiveCurrent, newBranchName, onBranchSwitched, onError, setOpen, trimmedCwd]);

  const startCreatingBranch = useCallback(() => {
    setCreating(true);
    setNewBranchName("");
    setCreateError(null);
  }, []);

  const cancelCreatingBranch = useCallback(() => {
    setCreating(false);
    setNewBranchName("");
    setCreateError(null);
  }, []);

  return {
    chipLabel,
    createBusy,
    createError,
    creating,
    defaultBranch,
    effectiveCurrent,
    hidden,
    newBranchName,
    query,
    selectBranch,
    selectRemoteBranch,
    setNewBranchName,
    setQuery,
    startCreatingBranch,
    cancelCreatingBranch,
    state,
    submitCreateBranch,
    switchError,
    switching,
    toggleOpen,
    trimmedCwd,
    visibleBranches,
    visibleRemoteBranches,
  };
}
