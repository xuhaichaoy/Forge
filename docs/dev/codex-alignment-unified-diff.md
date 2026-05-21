# Codex Alignment — Unified Diff Inline Card and Failure Dialog

Alignment reference for the two distinct unified-diff surfaces Codex Desktop ships:

1. **Inline `Review changes` card** — rendered at every turn end with edited files / undo / reapply affordances.
2. **Failure Dialog** — rendered only when a `revert` / `reapply` action partially fails.

Use this when changing `packages/ui/src/components/event-unit.tsx::ToolBlock`, `unified-diff-failure-dialog.tsx`, or anything backed by `host_apply_patch_action` (`apps/desktop/src-tauri/src/main.rs`).

Linked: [dispatcher](./codex-alignment-dispatcher.md), [gap matrix](./codex-alignment-gap-matrix.md).

## 1. Source of truth

The diff card consumes `item/fileChange/patchUpdated` notifications (see [dispatcher doc](./codex-alignment-dispatcher.md)). `PatchApplyStatus` progresses through `inProgress -> applied | skipped | conflicted | declined`.

Codex Desktop renders:

- **Inline card** any time the turn has non-empty patch entries and the turn is not currently streaming a blocking request. Eligibility rule: `unifiedDiffItem` renders when `!hasBlockingRequest && conversationDetailLevel !== 'STEPS_PROSE'`.
- **Failure Dialog** when a `revert` or `reapply` action returns a result with non-empty `appliedPaths` / `skippedPaths` / `conflictedPaths`.

## 2. Inline card behavior

The inline card layout:

- Header: `Review changes` action + edited file count + per-file row.
- Per-file: filename + +linesAdded / -linesDeleted + Show-in-review action + (when applicable) Undo / Reapply tooltips.
- Show-more / Collapse for long file lists.
- "Too large to render inline" placeholder for oversize diffs.
- `inlineLargeFile` substitution when the file body exceeds the inline-render threshold.

HiCodex `hc-turn-diff` inline card (in `event-unit.tsx::ToolBlock`) implements the action / collapse / undo / reapply parts but does not render the full edited-file detail list.

## 3. Failure Dialog structure

Component signature (clean-room):

```ts
UnifiedDiffFailureDialog({
  open: boolean,
  onOpenChange: (open: boolean) => void,
  failure: {
    action: 'revert' | 'reapply',
    appliedPaths: string[],
    skippedPaths: string[],
    conflictedPaths: string[],
    errorOutput?: string,        // surfaces `Git apply error: {message}`
  } | null,
  cwd: string,
  hostId: string,
})
```

Render when `failure != null` and any of `appliedPaths / skippedPaths / conflictedPaths` is non-empty.

Three path groups with distinct tone classes:

| group | i18n heading (completed) | toneClassName |
| --- | --- | --- |
| `appliedPaths` | `Applied cleanly ({count})` | `text-token-foreground` |
| `skippedPaths` | `Skipped ({count})` | `text-token-description-foreground` |
| `conflictedPaths` | `Conflicts ({count})` | `text-token-charts-red` |

Layout constants:

- Dialog body: `max-h-[40vh] overflow-y-auto`.
- Header icon: red error glyph (`text-token-charts-red`).
- Path rows share a sub-component (clean-room: `PatchFailurePathList`) receiving `{ cwd, hostId, toneClassName, paths[] }`.

## 4. `not-git-repo` error path

Special error code surfaces a dedicated string set instead of the normal dialog body:

- `revertPatchNotGitRepo = Undo requires a Git repository`
- `reapplyPatchNotGitRepo = Reapply requires a Git repository`
- `patchNotGitRepoDescription = This action only works when running in a Git repository.`

HiCodex `host_apply_patch_action` (Rust) returns `{ errorCode: 'not-git-repo' }` to drive this branch.

## 5. Toast / status feedback after Undo / Reapply

Eight toast strings cover success / partial / no-changes / error variants for both actions. Use the exact defaults:

```text
revertPatchSuccess     = Changes reverted
reapplyPatchSuccess    = Changes reapplied
revertPatchPartial     = Some changes reverted
reapplyPatchPartial    = Some changes reapplied
revertPatchNoChanges   = No changes reverted
reapplyPatchNoChanges  = No changes reapplied
revertPatchError       = Failed to revert changes
reapplyPatchError      = Failed to reapply changes
```

## 6. Full i18n table (41 strings, durable)

### Failure Dialog (8)

```text
codex.unifiedDiff.patchAppliedPathsHeading       = Applied cleanly ({count})
codex.unifiedDiff.patchSkippedPathsHeading       = Skipped ({count})
codex.unifiedDiff.patchConflictedPathsHeading    = Conflicts ({count})
codex.unifiedDiff.patchFailureDialogClose        = Close
codex.unifiedDiff.patchFailureDetailsIntroRevert  = There were issues reverting some files
codex.unifiedDiff.patchFailureDetailsIntroReapply = There were issues reapplying some files
codex.unifiedDiff.patchErrorOutputSummary        = Git apply error: {message}
codex.unifiedDiff.patchFailureNoDetails          = No file details were returned for this patch action.
```

### Not-git-repo (3)

```text
codex.unifiedDiff.revertPatchNotGitRepo          = Undo requires a Git repository
codex.unifiedDiff.reapplyPatchNotGitRepo         = Reapply requires a Git repository
codex.unifiedDiff.patchNotGitRepoDescription     = This action only works when running in a Git repository.
```

### Undo / Reapply toast (8)

```text
codex.unifiedDiff.revertPatchSuccess             = Changes reverted
codex.unifiedDiff.reapplyPatchSuccess            = Changes reapplied
codex.unifiedDiff.revertPatchPartial             = Some changes reverted
codex.unifiedDiff.reapplyPatchPartial            = Some changes reapplied
codex.unifiedDiff.revertPatchNoChanges           = No changes reverted
codex.unifiedDiff.reapplyPatchNoChanges          = No changes reapplied
codex.unifiedDiff.revertPatchError               = Failed to revert changes
codex.unifiedDiff.reapplyPatchError              = Failed to reapply changes
```

### Inline card (22)

```text
codex.unifiedDiff.reviewChanges                  = Review here
codex.unifiedDiff.reviewChangesHover             = Review changes
codex.unifiedDiff.reviewShort                    = Review
codex.unifiedDiff.viewDiffTooltip                = Review
codex.unifiedDiff.reviewChangedFiles             = Review changed files
codex.unifiedDiff.editedFiles                    = {fileCount, plural, one {Edited # file} other {Edited # files}}
codex.unifiedDiff.editedFile                     = Edited {filename}
codex.unifiedDiff.filesChanged                   = {fileCount, plural, one {# file changed} other {# files changed}}
codex.unifiedDiff.linesAdded                     = +{linesAdded}
codex.unifiedDiff.linesDeleted                   = -{linesDeleted}
codex.unifiedDiff.showMoreFiles                  = {count, plural, one {Show # more file} other {Show # more files}}
codex.unifiedDiff.collapseFiles                  = Collapse files
codex.unifiedDiff.showFileInReview.ariaLabel     = Show file in review
codex.unifiedDiff.showFileInReview.tooltip       = Show in review
codex.unifiedDiff.revertChangesTooltip           = Undo
codex.unifiedDiff.reapplyChangesTooltip          = Reapply
codex.unifiedDiff.inlineLargeFile                = Too large to render inline
codex.unifiedDiff.details                        = Details
```

(The full set above is 22 lines; the table grouping is approximate — total across all four buckets is 41 strings.)

## 7. HiCodex implementation status

- Backend `host_apply_patch_action` (Tauri command) runs `git apply` / `git apply --reverse`, detects non-git repos, and returns `{ appliedPaths, skippedPaths, conflictedPaths, errorOutput, errorCode? }`.
- UI bridge: `tauri-host.ts::applyPatchAction` + `PatchActionRequest` / `PatchActionResult` types.
- State: `HiCodexApp.tsx` owns `patchActionState` / `patchFailure` / `patchActionInFlight` and renders `<UnifiedDiffFailureDialog/>`.
- Inline card: `event-unit.tsx::ToolBlock` consumes the prop chain through `conversation-view.tsx`.
- CSS: `settings-command.css` extension for dialog styling.

Gaps (see [gap matrix](./codex-alignment-gap-matrix.md) section E): inline card detail list (edited file count, per-file rows, show-more), large-file inline placeholder, full toast coverage for partial/no-changes paths.
