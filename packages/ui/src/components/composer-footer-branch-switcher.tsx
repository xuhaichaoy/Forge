// codex: composer-footer-branch-switcher-*.js — picker UI.
// Self-contained chip+dropdown that drives `host_git_list_branches` /
// `host_git_checkout_branch` from the composer footer. Codex Desktop splits
// this into `useGitDefaultBranch` + `useGitRecentBranches` + a search query;
// we collapse them into a single host call (`listGitBranches`) plus
// client-side filtering so Forge doesn't need react-query yet.
// codex: branch-picker-extension — picker grew three Codex Desktop parity
// features: a "Default" chip on the default branch, a "Remote branches"
// section sourced from `git branch -r`, and a "Create new branch" form that
// shells out to `git checkout -b`.
import { ChevronDown, GitBranch, Plus, Search } from "lucide-react";
import { useForgeIntl } from "./i18n-provider";
import { useCallback, useRef, useState } from "react";
import { __testing, isDefaultBranchMarker } from "./composer-branch-helpers";
import type { PartitionedBranches } from "./composer-branch-helpers";
import { BranchMenuPortal, useAnchoredMenuDismiss } from "./composer-branch-menu-portal";
import { useComposerBranchSwitcherWorkflow } from "./composer-branch-switcher-workflow";

export interface ComposerFooterBranchSwitcherProps {
  cwd?: string | null;
  /** Pre-resolved branch label (used as the chip text while the host call resolves). */
  currentBranch?: string | null;
  /** Notified after a successful `git checkout`. */
  onBranchSwitched?: (branchName: string) => void;
  /** Logger hook so failures land in the existing dispatch log. */
  onError?: (message: string) => void;
}

export function ComposerFooterBranchSwitcher({
  cwd,
  currentBranch,
  onBranchSwitched,
  onError,
}: ComposerFooterBranchSwitcherProps) {
  const { formatMessage } = useForgeIntl();
  const [open, setOpen] = useState(false);
  const triggerRef = useRef<HTMLButtonElement | null>(null);
  const menuRef = useRef<HTMLDivElement | null>(null);
  const close = useCallback(() => setOpen(false), []);
  useAnchoredMenuDismiss(open, triggerRef, menuRef, close);
  const {
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
  } = useComposerBranchSwitcherWorkflow({
    cwd,
    currentBranch,
    open,
    setOpen,
    onBranchSwitched,
    onError,
  });

  // codex: composer-footer-branch-switcher-*.js — hide entirely when we
  // know the workspace is not a git repo. Until the dropdown is opened we keep
  // the chip visible if the caller passed a `currentBranch` label (matches the
  // pre-existing readonly span behavior).
  if (hidden) {
    return null;
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
        {/* codex chip chevron = icon-2xs (14px) */}
        <ChevronDown size={14} />
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
                placeholder={formatMessage({ id: "codex.composer.searchBranches", defaultMessage: "Search branches" })}
                onKeyDown={(event) => {
                  if (event.key === "Escape") close();
                }}
              />
            </label>
            <div className="hc-composer-branch-list">
              {state.status === "loading" && (
                <div className="hc-composer-branch-empty">Loading branches…</div>
              )}
              {state.status === "error" && (
                <div className="hc-composer-branch-empty hc-composer-branch-error">
                  {state.error ?? "Unable to load branches"}
                </div>
              )}
              {state.status === "ready"
                && visibleBranches.length === 0
                && visibleRemoteBranches.length === 0 && (
                  <div className="hc-composer-branch-empty">No branches found</div>
                )}
              {state.status === "ready"
                && visibleBranches.map((branch) => {
                  const isCurrent = branch.isCurrent || branch.name === effectiveCurrent;
                  const isDefault = isDefaultBranchMarker(branch.name, defaultBranch);
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
                  placeholder={formatMessage({ id: "localConversationPage.gitActions.branchNameLabel", defaultMessage: "Branch name" })}
                  onChange={(event) => setNewBranchName(event.target.value)}
                  onKeyDown={(event) => {
                    if (event.key === "Enter") {
                      event.preventDefault();
                      void submitCreateBranch();
                    } else if (event.key === "Escape") {
                      event.preventDefault();
                      cancelCreatingBranch();
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
                onClick={startCreatingBranch}
                disabled={state.status === "loading" || switching !== null}
              >
                <Plus size={13} />
                <span>{formatMessage({ id: "composer.footer.branchSwitch.createAndCheckout", defaultMessage: "Create and checkout new branch…" })}</span>
              </button>
            )}
          </div>
        </BranchMenuPortal>
      )}
    </div>
  );
}

export type { PartitionedBranches };
export { __testing };
