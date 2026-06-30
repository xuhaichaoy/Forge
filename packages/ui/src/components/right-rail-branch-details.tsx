import {
  ChevronDown,
  FileDiff,
  GitBranch,
  GitCommitHorizontal,
  Github,
  GitPullRequest,
  Laptop,
  Plus,
  Search,
} from "lucide-react";
import { useCallback, useRef, useState } from "react";
import type { BranchDetailsViewModel } from "../state/branch-details";
import type { RailEntry } from "../state/render-groups";
import { isDefaultBranchMarker } from "./composer-branch-helpers";
import { BranchMenuPortal, useAnchoredMenuDismiss } from "./composer-branch-menu-portal";
import { useComposerBranchSwitcherWorkflow } from "./composer-branch-switcher-workflow";
import { DiffStatsDisplay } from "./diff-stats-display";
import { useForgeIntl } from "./i18n-provider";
import { SummaryPanelRow } from "./summary-panel-row";

// CODEX-REF: local-conversation-thread-*.js (Environment section) —
// 当前 Codex 桌面版 Environment section 内仅以下 row 顺序:
//   1. Changes        (file-with-plus icon + diff-stats trailing,
//                      zero 时仍渲染 `+0 -0`,无 fallback 字符串)
//   2. worktree / thread-handoff trigger(仅 conversationId 存在时渲染;
//      Forge 用 "Local" 行承载相同语义)
//   3. branch picker  (branch-graph icon + label=currentBranch + chevron)
//   4. git actions    (`codex.command.git.commit` -> "Commit or push")
//   5. GitHub status  (icon + 多状态 label;Forge 用 "GitHub" 行对齐)
// 注:Forge 状态层仍用 row id "branch" / "commit" 作为内部投影键,但右栏渲染成
// Desktop 的 branch picker 和 `Commit or push` action label,不显示 "Branch"/"Commit"
// 这两个旧标题。
export function BranchDetailsCard({
  details,
  canOpenEntry,
  onOpenEntry,
  onBranchSwitched,
}: {
  details: BranchDetailsViewModel;
  canOpenEntry: (entry: RailEntry) => boolean;
  onOpenEntry: (entry: RailEntry) => void;
  onBranchSwitched?: (branchName: string) => void;
}) {
  const { formatMessage } = useForgeIntl();
  if (!details.hasData) {
    return (
      <div className="hc-rail-card">
        <div className="hc-rail-card-meta">{details.emptyText}</div>
      </div>
    );
  }

  const localRow = details.rows.find((row) => row.id === "local");
  const branchRow = details.rows.find((row) => row.id === "branch");
  const commitRow = details.rows.find((row) => row.id === "commit");
  const pullRequestRow = details.rows.find((row) => row.id === "pull-request");
  const githubRow = details.rows.find((row) => row.id === "github");
  const githubLabel = githubRow?.value ?? details.githubStatus?.label ?? formatMessage({ id: "codex.localConversation.gitSummary.githubCliUnavailable", defaultMessage: "GitHub CLI unavailable" });
  const pullRequestEntry: RailEntry | null = pullRequestRow?.actionUrl
    ? {
        id: pullRequestRow.id,
        title: pullRequestRow.label,
        meta: pullRequestRow.value,
        status: pullRequestRow.status ?? "available",
        action: { kind: "url", url: pullRequestRow.actionUrl },
      }
    : null;

  const changesEntry: RailEntry = {
    id: "changes",
    title: "Changes",
    meta: branchChangesMeta(details),
    status: details.diff?.hasDiff ? "changed" : "available",
    action: { kind: "diff" },
  };
  const canOpenChanges = canOpenEntry(changesEntry);
  // CODEX-REF: local-conversation-thread-DAwsPWah.js (Kd, git-summary Changes row) —
  // trailing = `i ? <spinner icon-xs/> : r==null ? null : <Ms linesAdded={r.additions}
  // linesRemoved={r.deletions}/>`. `r` is the diff-stats object: when it is null
  // (gitStatus absent / no real diff stats) Codex renders NO trailing — it does
  // NOT coalesce to `+0 -0`. Forge previously coalesced line counts with `?? 0`,
  // which forced a bogus `+0 -0` chip whenever gitStatus was missing; aligned to
  // the null branch here. (The loading-spinner branch `i` needs a data-layer
  // loading flag that BranchDetailsViewModel does not expose, so it is omitted.)
  const diffStats =
    details.gitStatus
    && (details.gitStatus.linesAdded != null || details.gitStatus.linesRemoved != null)
      ? {
          linesAdded: details.gitStatus.linesAdded ?? 0,
          linesRemoved: details.gitStatus.linesRemoved ?? 0,
        }
      : null;
  const changesTrailing = diffStats
    ? <DiffStatsDisplay linesAdded={diffStats.linesAdded} linesRemoved={diffStats.linesRemoved} />
    : null;

  return (
    <div className="hc-rail-list">
      {/* CODEX-REF: local-conversation-thread-DAwsPWah.js (Kd) — Changes row icon is
          the custom `Os` changes glyph rendered at `icon-sm` (app-main-DGDTSRlh.css
          `.icon-sm{width:18px;height:18px}`). lucide `FileDiff` is Forge's
          clean-room match for the Os file-diff glyph; sized to 18px. */}
      <SummaryPanelRow
        icon={<FileDiff size={18} />}
        label={formatMessage({ id: "codex.localConversation.gitSummary.branchChangesLabel", defaultMessage: "Changes" })}
        trailing={changesTrailing}
        onClick={canOpenChanges ? () => onOpenEntry(changesEntry) : undefined}
        title={changesEntry.meta}
      />
      {/* CODEX-REF: local-conversation-thread-*.js Environment work mode row —
          local mode uses the laptop glyph, linked worktrees use the branch glyph,
          and both labels are the short composer mode names. */}
      {localRow ? (
        <SummaryPanelRow
          icon={localRow.mode === "worktree" ? <GitBranch size={18} /> : <Laptop size={18} />}
          label={localRow.label}
          title={localRow.label}
          trailing={<ChevronDown size={12} />}
        />
      ) : null}
      {branchRow ? (
        <RightRailBranchPickerRow
          cwd={details.cwd}
          currentBranch={details.currentBranch ?? branchRow.value}
          onBranchSwitched={onBranchSwitched}
        />
      ) : null}
      {commitRow ? (
        <SummaryPanelRow
          icon={<GitCommitHorizontal size={18} />}
          label={formatMessage({ id: "codex.command.git.commit", defaultMessage: "Commit or push" })}
          title={formatMessage({ id: "codex.commandDescription.git.commit", defaultMessage: "Open commit or push options" })}
        />
      ) : null}
      {pullRequestRow ? (
        <SummaryPanelRow
          icon={<GitPullRequest size={18} />}
          label={pullRequestRow.value}
          title={pullRequestRow.actionUrl ?? pullRequestRow.value}
          onClick={pullRequestEntry && canOpenEntry(pullRequestEntry) ? () => onOpenEntry(pullRequestEntry) : undefined}
        />
      ) : null}
      {!pullRequestRow ? (
        <SummaryPanelRow
          icon={<Github size={14} />}
          label={githubLabel}
          title={githubLabel}
        />
      ) : null}
    </div>
  );
}

function RightRailBranchPickerRow({
  cwd,
  currentBranch,
  onBranchSwitched,
}: {
  cwd: string | null;
  currentBranch: string | null;
  onBranchSwitched?: (branchName: string) => void;
}) {
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
    onBranchSwitched,
    open,
    setOpen,
  });

  if (hidden) return null;

  return (
    <>
      <button
        ref={triggerRef}
        type="button"
        className="hc-summary-panel-row hc-summary-panel-row-interactive"
        title={chipLabel}
        aria-label={formatMessage(
          { id: "hc.branchDetails.branchPicker.openLabel", defaultMessage: "Open branch menu ({branch})" },
          { branch: chipLabel },
        )}
        aria-haspopup="menu"
        aria-expanded={open}
        aria-controls={open ? "hc-right-rail-branch-menu" : undefined}
        disabled={!trimmedCwd}
        onClick={toggleOpen}
      >
        <span className="hc-summary-panel-row-inner">
          <span className="hc-summary-panel-row-icon" aria-hidden="true">
            <GitBranch size={18} />
          </span>
          <span className="hc-summary-panel-row-label">{chipLabel}</span>
          <span className="hc-summary-panel-row-trailing">
            <ChevronDown size={12} />
          </span>
        </span>
      </button>
      {open && (
        <BranchMenuPortal anchor={triggerRef.current}>
          <div
            ref={menuRef}
            id="hc-right-rail-branch-menu"
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
                <div className="hc-composer-branch-empty">Loading branches...</div>
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
                        <span className="hc-composer-branch-item-suffix">...</span>
                      )}
                    </button>
                  );
                })}
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
                      <span className="hc-composer-branch-item-suffix">...</span>
                    )}
                  </button>
                ))}
            </div>
            {switchError && (
              <div className="hc-composer-branch-error-row" role="alert">
                {switchError}
              </div>
            )}
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
                <span>{formatMessage({ id: "composer.footer.branchSwitch.createAndCheckout", defaultMessage: "Create and checkout new branch..." })}</span>
              </button>
            )}
          </div>
        </BranchMenuPortal>
      )}
    </>
  );
}

function branchChangesMeta(details: BranchDetailsViewModel): string {
  if (details.diff) return details.diff.summary;
  const changedFiles = details.gitStatus?.changedFiles;
  if (changedFiles !== undefined) {
    return `${changedFiles} changed file${changedFiles === 1 ? "" : "s"}`;
  }
  return "Review changed files";
}
