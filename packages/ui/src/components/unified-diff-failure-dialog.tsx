import { AlertTriangle, X } from "lucide-react";

/*
 * Codex Desktop unifiedDiff Failure Dialog — implemented per `hS` function in
 * `local-conversation-thread-BX7YNcUw.js` byte ~422600. The Dialog only opens
 * when a patch revert/reapply action returns partial / conflicted results
 * (`failure.result.{appliedPaths|skippedPaths|conflictedPaths}` non-empty) OR
 * the cwd is not a Git repository (`errorCode === "not-git-repo"`).
 *
 * Wiring is live: `HiCodexApp.handlePatchAction` calls
 * `host_apply_patch_action` (Rust Tauri command running `git apply` /
 * `--reverse`), reads the returned `PatchActionResult`, and on failure / non-
 * git cwd populates `patchFailure` state which mounts this Dialog.
 *
 * All literal strings here are taken verbatim from Codex i18n defaultMessage
 * values (`codex.unifiedDiff.*`); see docs/dev/codex-alignment-unified-diff.md.
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

export function UnifiedDiffFailureDialog({
  failure,
  onClose,
}: UnifiedDiffFailureDialogProps) {
  const isNotGitRepo = failure.errorCode === "not-git-repo";
  const titleText = isNotGitRepo
    ? failure.action === "revert"
      // codex.unifiedDiff.revertPatchNotGitRepo
      ? "Undo requires a Git repository"
      // codex.unifiedDiff.reapplyPatchNotGitRepo
      : "Reapply requires a Git repository"
    : failure.action === "revert"
      // codex.unifiedDiff.patchFailureDetailsIntroRevert
      ? "There were issues reverting some files"
      // codex.unifiedDiff.patchFailureDetailsIntroReapply
      : "There were issues reapplying some files";

  const { appliedPaths, skippedPaths, conflictedPaths, execOutput } = failure.result;
  const hasAnyPaths =
    appliedPaths.length > 0 || skippedPaths.length > 0 || conflictedPaths.length > 0;
  const execOutputText = execOutput?.output?.trim() ?? "";

  return (
    <div className="hc-settings-backdrop" role="presentation" onMouseDown={onClose}>
      <section
        className="hc-thread-dialog-panel hc-unified-diff-failure-dialog"
        role="dialog"
        aria-modal="true"
        aria-label={titleText}
        onMouseDown={(event) => event.stopPropagation()}
      >
        <header>
          <div className="hc-unified-diff-failure-title">
            {/* Codex `Ri` icon at byte ~422700 with `text-token-charts-red`. */}
            <AlertTriangle aria-hidden className="hc-unified-diff-failure-icon" size={16} />
            <span>{titleText}</span>
          </div>
          {/* codex.unifiedDiff.patchFailureDialogClose */}
          <button type="button" aria-label="Close" onClick={onClose}>
            <X size={16} />
          </button>
        </header>
        <div className="hc-thread-dialog-body hc-unified-diff-failure-body">
          {isNotGitRepo ? (
            // codex.unifiedDiff.patchNotGitRepoDescription
            <p className="hc-unified-diff-failure-help">
              This action only works when running in a Git repository.
            </p>
          ) : (
            <>
              {!hasAnyPaths && execOutputText.length === 0 && (
                // codex.unifiedDiff.patchFailureNoDetails
                <p className="hc-unified-diff-failure-help">
                  No file details were returned for this patch action.
                </p>
              )}
              {appliedPaths.length > 0 && (
                <PathList
                  heading={`Applied cleanly (${appliedPaths.length})`}
                  // Codex toneClassName: text-token-foreground (default tone)
                  toneClass="hc-unified-diff-tone-applied"
                  paths={appliedPaths}
                />
              )}
              {skippedPaths.length > 0 && (
                <PathList
                  heading={`Skipped (${skippedPaths.length})`}
                  // Codex toneClassName: text-token-description-foreground
                  toneClass="hc-unified-diff-tone-skipped"
                  paths={skippedPaths}
                />
              )}
              {conflictedPaths.length > 0 && (
                <PathList
                  heading={`Conflicts (${conflictedPaths.length})`}
                  // Codex toneClassName: text-token-charts-red
                  toneClass="hc-unified-diff-tone-conflicted"
                  paths={conflictedPaths}
                />
              )}
              {execOutputText.length > 0 && (
                <details className="hc-unified-diff-failure-exec">
                  {/* codex.unifiedDiff.patchErrorOutputSummary = "Git apply error: {message}" */}
                  <summary>Git apply error</summary>
                  <pre className="hc-unified-diff-failure-exec-output">{execOutputText}</pre>
                </details>
              )}
            </>
          )}
        </div>
        <footer>
          <button
            type="button"
            className="hc-mini-button"
            autoFocus
            onClick={onClose}
          >
            Close
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
