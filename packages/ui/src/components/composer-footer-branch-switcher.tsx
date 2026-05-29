// codex: composer-footer-branch-switcher-*.js — picker UI.
// Self-contained chip+dropdown that drives `host_git_list_branches` /
// `host_git_checkout_branch` from the composer footer. Codex Desktop splits
// this into `useGitDefaultBranch` + `useGitRecentBranches` + a search query;
// we collapse them into a single host call (`listGitBranches`) plus
// client-side filtering so HiCodex doesn't need react-query yet.
// codex: branch-picker-extension — picker grew three Codex Desktop parity
// features: a "Default" chip on the default branch, a "Remote branches"
// section sourced from `git branch -r`, and a "Create new branch" form that
// shells out to `git checkout -b`.
import { ChevronDown, GitBranch, Plus, Search } from "lucide-react";
import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
  type ReactElement,
  type RefObject,
} from "react";
import { createPortal } from "react-dom";
import {
  checkoutGitBranch,
  createGitBranch,
  getGitDefaultBranch,
  isTauriRuntime,
  listGitBranches,
  type GitBranchInfo,
} from "../lib/tauri-host";

export interface ComposerFooterBranchSwitcherProps {
  cwd?: string | null;
  /** Pre-resolved branch label (used as the chip text while the host call resolves). */
  currentBranch?: string | null;
  /** Notified after a successful `git checkout`. */
  onBranchSwitched?: (branchName: string) => void;
  /** Logger hook so failures land in the existing dispatch log. */
  onError?: (message: string) => void;
}

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

export function ComposerFooterBranchSwitcher({
  cwd,
  currentBranch,
  onBranchSwitched,
  onError,
}: ComposerFooterBranchSwitcherProps) {
  const trimmedCwd = typeof cwd === "string" ? cwd.trim() : "";
  const trimmedCurrent = typeof currentBranch === "string" ? currentBranch.trim() : "";
  const [state, setState] = useState<BranchSwitcherState>(INITIAL_STATE);
  const [open, setOpen] = useState(false);
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
  const triggerRef = useRef<HTMLButtonElement | null>(null);
  const menuRef = useRef<HTMLDivElement | null>(null);
  const close = useCallback(() => setOpen(false), []);
  useAnchoredMenuDismiss(open, triggerRef, menuRef, close);

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
    if (!open) {
      setSwitchError(null);
      setCreating(false);
      setNewBranchName("");
      setCreateError(null);
    }
  }, [open, trimmedCwd]);

  const effectiveCurrent = state.current ?? trimmedCurrent;
  const chipLabel = effectiveCurrent || trimmedCurrent || "";

  // codex: composer-footer-branch-switcher-*.js — picker sort.
  // Codex orders the list as: current branch first, then everything else by
  // `committerdate desc`. We mirror that here in pure JS.
  // codex: branch-picker-extension — also keep remote refs out of the local
  // sort path; remote refs are sorted independently in their own section.
  const orderedBranches = useMemo(() => {
    const all = state.branches.filter((branch) => !branch.isRemote);
    all.sort((left, right) => {
      if (left.isCurrent && !right.isCurrent) return -1;
      if (!left.isCurrent && right.isCurrent) return 1;
      const leftMs = left.lastCommitMs ?? 0;
      const rightMs = right.lastCommitMs ?? 0;
      return rightMs - leftMs;
    });
    return all;
  }, [state.branches]);

  // codex: branch-picker-extension — remote branches keep their own
  // committer-date sort; we don't bubble a "current" to the top because no
  // remote ref is ever the current ref.
  const orderedRemoteBranches = useMemo(() => {
    const remote = state.branches.filter((branch) => branch.isRemote);
    remote.sort((left, right) => {
      const leftMs = left.lastCommitMs ?? 0;
      const rightMs = right.lastCommitMs ?? 0;
      return rightMs - leftMs;
    });
    return remote;
  }, [state.branches]);

  const needle = query.trim().toLowerCase();
  const visibleBranches = useMemo(() => {
    if (!needle) return orderedBranches;
    return orderedBranches.filter((branch) => branch.name.toLowerCase().includes(needle));
  }, [needle, orderedBranches]);

  const visibleRemoteBranches = useMemo(() => {
    if (!needle) return orderedRemoteBranches;
    return orderedRemoteBranches.filter((branch) => branch.name.toLowerCase().includes(needle));
  }, [needle, orderedRemoteBranches]);

  // codex: composer-footer-branch-switcher-*.js — hide entirely when we
  // know the workspace is not a git repo. Until the dropdown is opened we keep
  // the chip visible if the caller passed a `currentBranch` label (matches the
  // pre-existing readonly span behavior).
  const hostKnowsItIsNotGit = state.status === "ready" && state.current === null && state.branches.length === 0;
  if (hostKnowsItIsNotGit && !trimmedCurrent) {
    return null;
  }
  if (!chipLabel) {
    return null;
  }

  function toggleOpen() {
    setOpen((value) => !value);
  }

  async function selectBranch(branchName: string) {
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
      // Optimistically reflect the new current; the next open will refetch.
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
  }

  // codex: branch-picker-extension — Codex Desktop's "track remote" flow.
  // Clicking a remote ref (e.g. `origin/feature-x`) creates the local tracker
  // via `git checkout -b feature-x origin/feature-x`; if the local branch
  // already exists we fall back to a plain checkout.
  async function selectRemoteBranch(remoteName: string) {
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
  }

  async function submitCreateBranch() {
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
  }

  return (
    <div className="hc-composer-footer-branch-switcher">
      <button
        ref={triggerRef}
        type="button"
        className="hc-composer-footer-chip hc-composer-footer-branch"
        title={`Branch: ${chipLabel}`}
        aria-label={`Current branch: ${chipLabel}`}
        aria-haspopup="menu"
        aria-expanded={open}
        aria-controls={open ? "hc-composer-branch-menu" : undefined}
        data-chip="branch"
        data-interactive="true"
        onClick={toggleOpen}
        disabled={!trimmedCwd}
      >
        <GitBranch size={14} />
        <span className="hc-composer-footer-chip-label">{chipLabel}</span>
        <ChevronDown size={13} />
      </button>
      {open && (
        <BranchMenuPortal anchor={triggerRef.current}>
          <div
            ref={menuRef}
            id="hc-composer-branch-menu"
            className="hc-thread-menu hc-composer-branch-menu hc-app-popover-menu"
            role="menu"
            data-state="open"
          >
            <label className="hc-composer-branch-search">
              <Search size={13} />
              <input
                autoFocus
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                placeholder="Search branches"
                onKeyDown={(event) => {
                  if (event.key === "Escape") close();
                }}
              />
            </label>
            <div className="hc-composer-branch-list">
              {state.status === "loading" && (
                <div className="hc-composer-branch-empty">Loading branches</div>
              )}
              {state.status === "error" && (
                <div className="hc-composer-branch-empty hc-composer-branch-error">
                  {state.error ?? "Failed to load branches"}
                </div>
              )}
              {state.status === "ready"
                && visibleBranches.length === 0
                && visibleRemoteBranches.length === 0 && (
                  <div className="hc-composer-branch-empty">No branches</div>
                )}
              {state.status === "ready"
                && visibleBranches.map((branch) => {
                  const isCurrent = branch.isCurrent || branch.name === effectiveCurrent;
                  const isDefault =
                    defaultBranch !== null && branch.name === defaultBranch;
                  return (
                    <button
                      key={`local:${branch.name}`}
                      type="button"
                      className="hc-thread-menu-item hc-composer-branch-item"
                      role="menuitem"
                      title={branch.name}
                      data-current={isCurrent ? "true" : undefined}
                      data-default={isDefault ? "true" : undefined}
                      disabled={switching !== null || createBusy}
                      onClick={() => void selectBranch(branch.name)}
                    >
                      <GitBranch size={13} />
                      <span className="hc-composer-branch-item-name">{branch.name}</span>
                      {isDefault && (
                        <span
                          className="hc-branch-picker-default-chip"
                          aria-label="Repository default branch"
                        >
                          Default
                        </span>
                      )}
                      {isCurrent && (
                        <span className="hc-composer-branch-item-suffix">current</span>
                      )}
                      {switching === branch.name && (
                        <span className="hc-composer-branch-item-suffix">…</span>
                      )}
                    </button>
                  );
                })}
              {/* codex: branch-picker-extension — "Remote branches" heading +
                  list. Clicking entries creates a local tracking branch via
                  `selectRemoteBranch`. */}
              {state.status === "ready" && visibleRemoteBranches.length > 0 && (
                <div
                  className="hc-branch-picker-section-heading"
                  role="presentation"
                >
                  Remote branches
                </div>
              )}
              {state.status === "ready"
                && visibleRemoteBranches.map((branch) => (
                  <button
                    key={`remote:${branch.name}`}
                    type="button"
                    className="hc-thread-menu-item hc-composer-branch-item"
                    role="menuitem"
                    title={branch.name}
                    data-remote="true"
                    disabled={switching !== null || createBusy}
                    onClick={() => void selectRemoteBranch(branch.name)}
                  >
                    <GitBranch size={13} />
                    <span className="hc-composer-branch-item-name">{branch.name}</span>
                    {switching === branch.name && (
                      <span className="hc-composer-branch-item-suffix">…</span>
                    )}
                  </button>
                ))}
            </div>
            {switchError && (
              <div className="hc-composer-branch-error-row" role="alert">
                {switchError}
              </div>
            )}
            {/* codex: branch-picker-extension — footer "Create new branch"
                form. Clicking the button reveals an inline input; pressing
                Enter posts to `createGitBranch`. */}
            {creating ? (
              <div className="hc-branch-picker-create-form" role="group">
                <input
                  autoFocus
                  className="hc-branch-picker-create-input"
                  type="text"
                  value={newBranchName}
                  placeholder="Branch name"
                  onChange={(event) => setNewBranchName(event.target.value)}
                  onKeyDown={(event) => {
                    if (event.key === "Enter") {
                      event.preventDefault();
                      void submitCreateBranch();
                    } else if (event.key === "Escape") {
                      event.preventDefault();
                      setCreating(false);
                      setNewBranchName("");
                      setCreateError(null);
                    }
                  }}
                  disabled={createBusy}
                />
                {createError && (
                  <div
                    className="hc-composer-branch-error-row hc-branch-picker-create-error"
                    role="alert"
                  >
                    {createError}
                  </div>
                )}
              </div>
            ) : (
              <button
                type="button"
                className="hc-branch-picker-create-button"
                onClick={() => {
                  setCreating(true);
                  setNewBranchName("");
                  setCreateError(null);
                }}
                disabled={state.status === "loading" || switching !== null}
              >
                <Plus size={13} />
                <span>Create new branch…</span>
              </button>
            )}
          </div>
        </BranchMenuPortal>
      )}
    </div>
  );
}

// codex: branch-picker-extension — `origin/feature-x` → `feature-x`. Returns
// null when the remote ref has no slash (defensive against odd configs); the
// caller skips the action when this happens.
function stripRemotePrefix(remoteName: string): string | null {
  const idx = remoteName.indexOf("/");
  if (idx < 0) return null;
  const tail = remoteName.slice(idx + 1).trim();
  return tail.length > 0 ? tail : null;
}

// codex: branch-picker-extension — pure helpers exported for unit testing.
// `partitionBranches` mirrors the in-component sort/filter pipeline so the
// "Default" chip + remote section behaviour can be asserted without rendering
// the React portal.
export interface PartitionedBranches {
  local: GitBranchInfo[];
  remote: GitBranchInfo[];
}

function partitionBranches(
  branches: GitBranchInfo[],
  needle: string,
): PartitionedBranches {
  const lower = needle.trim().toLowerCase();
  const matches = (branch: GitBranchInfo) =>
    lower.length === 0 || branch.name.toLowerCase().includes(lower);
  const local = branches
    .filter((branch) => !branch.isRemote && matches(branch))
    .sort((left, right) => {
      if (left.isCurrent && !right.isCurrent) return -1;
      if (!left.isCurrent && right.isCurrent) return 1;
      const leftMs = left.lastCommitMs ?? 0;
      const rightMs = right.lastCommitMs ?? 0;
      return rightMs - leftMs;
    });
  const remote = branches
    .filter((branch) => branch.isRemote && matches(branch))
    .sort((left, right) => {
      const leftMs = left.lastCommitMs ?? 0;
      const rightMs = right.lastCommitMs ?? 0;
      return rightMs - leftMs;
    });
  return { local, remote };
}

function isDefaultBranchMarker(
  branchName: string,
  defaultBranch: string | null,
): boolean {
  if (defaultBranch === null || defaultBranch.length === 0) return false;
  return branchName === defaultBranch;
}

export const __testing = {
  partitionBranches,
  isDefaultBranchMarker,
  stripRemotePrefix,
};

// codex: composer-footer-branch-switcher-*.js — popover positioning.
// Same `createPortal` + `getBoundingClientRect()` pattern used by the project
// menu (`composer-external-footer.tsx` ProjectMenuPortal); duplicated locally
// to keep this file self-contained.
const BRANCH_MENU_WIDTH_PX = 320;
const BRANCH_MENU_VIEWPORT_MARGIN_PX = 12;

function BranchMenuPortal({
  anchor,
  children,
}: {
  anchor: HTMLElement | null;
  children: ReactElement;
}) {
  const [style, setStyle] = useState<CSSProperties>(() => branchMenuStyle(anchor));

  useLayoutEffect(() => {
    const updatePosition = () => setStyle(branchMenuStyle(anchor));
    updatePosition();
    window.addEventListener("resize", updatePosition);
    window.addEventListener("scroll", updatePosition, true);
    return () => {
      window.removeEventListener("resize", updatePosition);
      window.removeEventListener("scroll", updatePosition, true);
    };
  }, [anchor]);

  if (!anchor || typeof document === "undefined") return null;
  return createPortal(<div style={style}>{children}</div>, document.body);
}

function branchMenuStyle(anchor: HTMLElement | null): CSSProperties {
  if (!anchor || typeof window === "undefined") {
    return {
      position: "fixed",
      top: 0,
      left: BRANCH_MENU_VIEWPORT_MARGIN_PX,
      width: BRANCH_MENU_WIDTH_PX,
      transform: "translateY(-100%)",
    };
  }
  const rect = anchor.getBoundingClientRect();
  const width = Math.min(BRANCH_MENU_WIDTH_PX, Math.max(0, window.innerWidth - BRANCH_MENU_VIEWPORT_MARGIN_PX * 2));
  const maxLeft = window.innerWidth - width - BRANCH_MENU_VIEWPORT_MARGIN_PX;
  const left = Math.max(BRANCH_MENU_VIEWPORT_MARGIN_PX, Math.min(rect.left, maxLeft));
  return {
    position: "fixed",
    top: rect.top - 8,
    left,
    width,
    transform: "translateY(-100%)",
    zIndex: "var(--hc-z-popover)",
  };
}

function useAnchoredMenuDismiss(
  open: boolean,
  anchorRef: RefObject<HTMLElement | null>,
  menuRef: RefObject<HTMLElement | null>,
  onDismiss: () => void,
) {
  useEffect(() => {
    if (!open) return;
    const closeOnPointerDown = (event: PointerEvent) => {
      const target = event.target;
      if (!(target instanceof Node)) return;
      if (anchorRef.current?.contains(target)) return;
      if (menuRef.current?.contains(target)) return;
      onDismiss();
    };
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") onDismiss();
    };
    document.addEventListener("pointerdown", closeOnPointerDown, true);
    document.addEventListener("keydown", closeOnEscape);
    return () => {
      document.removeEventListener("pointerdown", closeOnPointerDown, true);
      document.removeEventListener("keydown", closeOnEscape);
    };
  }, [anchorRef, menuRef, onDismiss, open]);
}
