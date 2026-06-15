import { ChevronRight } from "lucide-react";
import { useEffect, useState } from "react";
import { splitDiffByFile, type TurnDiffFileViewModel } from "./turn-diff-view-model";
import { CodeSnippet } from "./code-snippet";
import { useForgeIntl } from "./i18n-provider";

const TURN_DIFF_COLLAPSE_THRESHOLD = 3;
const TURN_DIFF_INLINE_RENDER_CUTOFF = 5000;

export function TurnDiffFilesSection({
  files,
  onOpenDiff,
  singleFileDetailsLabel,
  value,
}: {
  files: TurnDiffFileViewModel[];
  onOpenDiff?: (filePath?: string) => void;
  singleFileDetailsLabel: string | null;
  value: string;
}) {
  const { formatMessage } = useForgeIntl();
  const [filesExpanded, setFilesExpanded] = useState(false);
  const [openInlineFiles, setOpenInlineFiles] = useState<Set<string>>(() => new Set());

  useEffect(() => {
    setFilesExpanded(false);
    setOpenInlineFiles(new Set());
  }, [value]);

  const visibleFiles = filesExpanded
    ? files
    : files.slice(0, TURN_DIFF_COLLAPSE_THRESHOLD);
  const remaining = Math.max(files.length - visibleFiles.length, 0);
  const diffByFile = splitDiffByFile(value);
  const handlePerFileReview = (path: string) => onOpenDiff?.(path);

  return (
    <>
      <div className="hc-turn-diff-files">
        {visibleFiles.map((file) => {
          const tooLarge = isTurnDiffFileTooLargeToRender(file);
          const fileDiff = diffByFile.get(file.path) ?? "";
          const inlineOpen = openInlineFiles.has(file.path);
          const rowLabel = singleFileDetailsLabel ?? file.path;
          const showFileStats = singleFileDetailsLabel == null;
          const reviewControl = onOpenDiff ? (
            <span
              role="button"
              tabIndex={0}
              className="hc-turn-diff-file-review"
              aria-label={formatMessage({ id: "hc.unifiedDiff.showFileInReview", defaultMessage: "Show file in review" })}
              title={formatMessage({ id: "hc.unifiedDiff.showInReview", defaultMessage: "Show in review" })}
              onClick={(event) => {
                event.stopPropagation();
                handlePerFileReview(file.path);
              }}
              onKeyDown={(event) => {
                if (event.key !== "Enter" && event.key !== " ") return;
                event.preventDefault();
                event.stopPropagation();
                handlePerFileReview(file.path);
              }}
            >
              {formatMessage({ id: "codex.unifiedDiff.viewDiffTooltip", defaultMessage: "Review" })}
            </span>
          ) : null;
          if (tooLarge) {
            return (
              <div className="hc-turn-diff-file" key={file.path}>
                <div className="hc-turn-diff-file-row">
                  <span className="hc-turn-diff-file-path">{rowLabel}</span>
                  {showFileStats && <TurnDiffStats added={file.linesAdded} removed={file.linesRemoved} />}
                  <span className="hc-turn-diff-file-too-large">
                    {formatMessage({
                      id: "codex.unifiedDiff.inlineLargeFile",
                      defaultMessage: "Too large to render inline",
                    })}
                  </span>
                  {reviewControl}
                </div>
              </div>
            );
          }
          return (
            <div className="hc-turn-diff-file" key={file.path}>
              <button
                type="button"
                className="hc-turn-diff-file-row"
                aria-expanded={inlineOpen}
                onClick={() => {
                  setOpenInlineFiles((prev) => {
                    const next = new Set(prev);
                    if (next.has(file.path)) next.delete(file.path);
                    else next.add(file.path);
                    return next;
                  });
                }}
              >
                <ChevronRight
                  aria-hidden
                  size={12}
                  className={inlineOpen ? "is-open" : ""}
                />
                <span className="hc-turn-diff-file-path">{rowLabel}</span>
                {showFileStats && <TurnDiffStats added={file.linesAdded} removed={file.linesRemoved} />}
                {reviewControl}
              </button>
              {!tooLarge && inlineOpen && fileDiff.length > 0 ? (
                <div className="hc-turn-diff-file-inline">
                  <CodeSnippet language="diff" text={fileDiff} />
                </div>
              ) : null}
            </div>
          );
        })}
      </div>

      {remaining > 0 ? (
        <button
          type="button"
          className="hc-turn-diff-expand-files"
          aria-expanded={false}
          onClick={() => setFilesExpanded(true)}
        >
          <span>
            {formatMessage(
              {
                id: "codex.unifiedDiff.showMoreFiles",
                defaultMessage: "{count, plural, one {Show # more file} other {Show # more files}}",
              },
              { count: remaining },
            )}
          </span>
          <ChevronRight aria-hidden size={12} className="hc-turn-diff-expand-files-chevron" />
        </button>
      ) : filesExpanded && files.length > TURN_DIFF_COLLAPSE_THRESHOLD ? (
        <button
          type="button"
          className="hc-turn-diff-expand-files"
          aria-expanded={true}
          onClick={() => setFilesExpanded(false)}
        >
          <span>{formatMessage({ id: "codex.unifiedDiff.collapseFiles", defaultMessage: "Collapse files" })}</span>
          <ChevronRight
            aria-hidden
            size={12}
            className="hc-turn-diff-expand-files-chevron is-open"
          />
        </button>
      ) : null}
    </>
  );
}

function isTurnDiffFileTooLargeToRender(file: TurnDiffFileViewModel): boolean {
  return Math.max(file.renderedLineEstimate, file.linesAdded + file.linesRemoved) > TURN_DIFF_INLINE_RENDER_CUTOFF;
}

export function TurnDiffStats({ added, removed }: { added: number; removed: number }) {
  const { formatMessage } = useForgeIntl();
  return (
    <span
      className="hc-turn-diff-stats"
      aria-label={formatMessage(
        { id: "hc.diffStats.linesAddedRemoved", defaultMessage: "{added} lines added, {removed} lines removed" },
        { added, removed },
      )}
    >
      <span className="hc-turn-diff-added">+{added}</span>
      <span className="hc-turn-diff-removed">-{removed}</span>
    </span>
  );
}
