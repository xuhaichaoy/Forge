import { AlertTriangle, X } from "lucide-react";
import { useHiCodexIntl } from "./i18n-provider";

/*
 * Codex Desktop unifiedDiff Failure Dialog.
 *
 * Opens only when a patch revert/reapply action returns partial / conflicted
 * results (failure.result.{appliedPaths|skippedPaths|conflictedPaths} non-empty)
 * or the cwd is not a Git repository (errorCode === "not-git-repo"). A clean
 * full-success apply surfaces a toast instead (see HiCodexApp.handlePatchAction).
 *
 * Durable contract, re-verified vs Codex Desktop v26.519.81530:
 *   - The dialog TITLE is a 4-way selector on the result (codex.unifiedDiff.*):
 *       not-git-repo             -> "Undo requires a Git repository" / "Reapply requires a Git repository"
 *       appliedPaths > 0         -> "Some changes reverted" / "Some changes reapplied"        (revertPatchPartial)
 *       skipped>0 && conflict==0 -> "No changes reverted" / "No changes reapplied"            (revertPatchNoChanges)
 *       otherwise                -> "Failed to revert changes" / "Failed to reapply changes"  (revertPatchError)
 *   - A BODY intro line (description tone) sits above the path list:
 *       not-git-repo -> "This action only works when running in a Git repository."  (patchNotGitRepoDescription)
 *       hasAnyPaths  -> "There were issues reverting/reapplying some files"          (patchFailureDetailsIntro*)
 *       execOutput   -> "Git apply error: {message}" (single line)                   (patchErrorOutputSummary)
 *       otherwise    -> "No file details were returned for this patch action."       (patchFailureNoDetails)
 *   - Path groups carry distinct tones: applied=foreground, skipped=description, conflicted=charts-red.
 *   - Only the path-list block scrolls (max-height 40vh); the header icon is charts-red.
 * All literal strings are Codex i18n defaultMessage values; see
 * docs/dev/codex-alignment-unified-diff.md.
 */

export type UnifiedDiffPatchAction = "revert" | "reapply";

export interface UnifiedDiffPatchActionResult {
  appliedPaths: string[];
  skippedPaths: string[];
  conflictedPaths: string[];
  execOutput?: { output?: string | null } | null;
}

export type UnifiedDiffFailureErrorCode = "not-git-repo" | string;

export interface UnifiedDiffFailure {
  action: UnifiedDiffPatchAction;
  result: UnifiedDiffPatchActionResult;
  errorCode?: UnifiedDiffFailureErrorCode;
}

export interface UnifiedDiffFailureDialogProps {
  failure: UnifiedDiffFailure;
  onClose: () => void;
}

function firstErrorLine(text: string): string {
  // Codex's fallback-error-line helper collapses multi-line git stderr to one line.
  for (const line of text.split("\n")) {
    const trimmed = line.trim();
    if (trimmed.length > 0) return trimmed;
  }
  return text.trim();
}

export function UnifiedDiffFailureDialog({
  failure,
  onClose,
}: UnifiedDiffFailureDialogProps) {
  const { formatMessage } = useHiCodexIntl();
  const isNotGitRepo = failure.errorCode === "not-git-repo";
  const isRevert = failure.action === "revert";
  const { appliedPaths, skippedPaths, conflictedPaths, execOutput } = failure.result;
  const hasAnyPaths =
    appliedPaths.length > 0 || skippedPaths.length > 0 || conflictedPaths.length > 0;
  const execOutputText = execOutput?.output?.trim() ?? "";

  // codex.unifiedDiff.{revert,reapply}Patch{NotGitRepo,Partial,NoChanges,Error} — 4-way title selector.
  const titleText = isNotGitRepo
    ? (isRevert
        ? formatMessage({ id: "codex.unifiedDiff.revertPatchNotGitRepo", defaultMessage: "Undo requires a Git repository" })
        : formatMessage({ id: "codex.unifiedDiff.reapplyPatchNotGitRepo", defaultMessage: "Reapply requires a Git repository" }))
    : appliedPaths.length > 0
      ? (isRevert
          ? formatMessage({ id: "codex.unifiedDiff.revertPatchPartial", defaultMessage: "Some changes reverted" })
          : formatMessage({ id: "codex.unifiedDiff.reapplyPatchPartial", defaultMessage: "Some changes reapplied" }))
      : (skippedPaths.length > 0 && conflictedPaths.length === 0)
        ? (isRevert
            ? formatMessage({ id: "codex.unifiedDiff.revertPatchNoChanges", defaultMessage: "No changes reverted" })
            : formatMessage({ id: "codex.unifiedDiff.reapplyPatchNoChanges", defaultMessage: "No changes reapplied" }))
        : (isRevert
            ? formatMessage({ id: "codex.unifiedDiff.revertPatchError", defaultMessage: "Failed to revert changes" })
            : formatMessage({ id: "codex.unifiedDiff.reapplyPatchError", defaultMessage: "Failed to reapply changes" }));

  const introText = isNotGitRepo
    ? formatMessage({ id: "codex.unifiedDiff.patchNotGitRepoDescription", defaultMessage: "This action only works when running in a Git repository." })
    : hasAnyPaths
      ? (isRevert
          ? formatMessage({ id: "codex.unifiedDiff.patchFailureDetailsIntroRevert", defaultMessage: "There were issues reverting some files" })
          : formatMessage({ id: "codex.unifiedDiff.patchFailureDetailsIntroReapply", defaultMessage: "There were issues reapplying some files" }))
      : execOutputText.length > 0
        ? formatMessage({ id: "codex.unifiedDiff.patchErrorOutputSummary", defaultMessage: "Git apply error: {message}" }, { message: firstErrorLine(execOutputText) })
        : formatMessage({ id: "codex.unifiedDiff.patchFailureNoDetails", defaultMessage: "No file details were returned for this patch action." });

  return (
    <div className="hc-settings-backdrop" role="presentation" onMouseDown={onClose}>
      <section
        className="hc-thread-dialog-panel hc-unified-diff-failure-dialog"
        role="dialog"
        data-state="open"
        aria-modal="true"
        aria-label={titleText}
        onKeyDown={(event) => {
          // codex: Radix dialogs close on Escape; mirror the dismiss behavior the
          // other HiCodex dialogs (mcp-follow-up, keyboard-shortcuts, rating) all have.
          if (event.key === "Escape") {
            event.stopPropagation();
            onClose();
          }
        }}
        onMouseDown={(event) => event.stopPropagation()}
      >
        <header>
          <div className="hc-unified-diff-failure-title">
            {/* Header glyph uses the charts-red error tone. */}
            <AlertTriangle aria-hidden className="hc-unified-diff-failure-icon" size={16} />
            <span>{titleText}</span>
          </div>
          <button
            type="button"
            aria-label={formatMessage({ id: "codex.unifiedDiff.patchFailureDialogClose", defaultMessage: "Close" })}
            onClick={onClose}
          >
            <X size={16} />
          </button>
        </header>
        <div className="hc-thread-dialog-body hc-unified-diff-failure-body">
          <p className="hc-unified-diff-failure-intro">{introText}</p>
          {hasAnyPaths && (
            <div className="hc-unified-diff-failure-paths">
              {appliedPaths.length > 0 && (
                <PathList
                  heading={formatMessage(
                    { id: "codex.unifiedDiff.patchAppliedPathsHeading", defaultMessage: "Applied cleanly ({count})" },
                    { count: appliedPaths.length },
                  )}
                  // tone: text-token-foreground
                  toneClass="hc-unified-diff-tone-applied"
                  paths={appliedPaths}
                />
              )}
              {skippedPaths.length > 0 && (
                <PathList
                  heading={formatMessage(
                    { id: "codex.unifiedDiff.patchSkippedPathsHeading", defaultMessage: "Skipped ({count})" },
                    { count: skippedPaths.length },
                  )}
                  // tone: text-token-description-foreground
                  toneClass="hc-unified-diff-tone-skipped"
                  paths={skippedPaths}
                />
              )}
              {conflictedPaths.length > 0 && (
                <PathList
                  heading={formatMessage(
                    { id: "codex.unifiedDiff.patchConflictedPathsHeading", defaultMessage: "Conflicts ({count})" },
                    { count: conflictedPaths.length },
                  )}
                  // tone: text-token-charts-red
                  toneClass="hc-unified-diff-tone-conflicted"
                  paths={conflictedPaths}
                />
              )}
            </div>
          )}
        </div>
        <footer>
          <button type="button" className="hc-mini-button" autoFocus onClick={onClose}>
            {formatMessage({ id: "codex.unifiedDiff.patchFailureDialogClose", defaultMessage: "Close" })}
          </button>
        </footer>
      </section>
    </div>
  );
}

function PathList({
  heading,
  toneClass,
  paths,
}: {
  heading: string;
  toneClass: string;
  paths: readonly string[];
}) {
  return (
    <section className={`hc-unified-diff-path-section ${toneClass}`}>
      <h3 className="hc-unified-diff-path-heading">{heading}</h3>
      <ul className="hc-unified-diff-path-list">
        {paths.map((path) => (
          <li key={path} className="hc-unified-diff-path-row">
            <span className="hc-unified-diff-path-name">{path}</span>
          </li>
        ))}
      </ul>
    </section>
  );
}
