import { ChevronRight } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { useForgeIntl } from "./i18n-provider";
import { TurnDiffPreviewTooltip, type TurnDiffPreviewData } from "./turn-diff-preview-tooltip";
import { TurnDiffStats } from "./turn-diff-stats";
import { splitDiffByFile, type TurnDiffFileViewModel } from "./turn-diff-view-model";

const TURN_DIFF_COLLAPSE_THRESHOLD = 3;
const TURN_DIFF_INLINE_RENDER_CUTOFF = 5000;

export function TurnDiffFilesSection({
  files,
  onOpenDiff,
  value,
}: {
  files: TurnDiffFileViewModel[];
  onOpenDiff?: (filePath?: string) => void;
  value: string;
}) {
  const { formatMessage } = useForgeIntl();
  const [filesExpanded, setFilesExpanded] = useState(false);

  useEffect(() => {
    setFilesExpanded(false);
  }, [value]);

  const visibleFiles = filesExpanded
    ? files
    : files.slice(0, TURN_DIFF_COLLAPSE_THRESHOLD);
  const remaining = Math.max(files.length - visibleFiles.length, 0);
  const diffByFile = useMemo(() => splitDiffByFile(value), [value]);

  return (
    <>
      <div className="hc-turn-diff-files">
        {visibleFiles.map((file) => {
          const tooLarge = isTurnDiffFileTooLargeToRender(file);
          const preview = !tooLarge ? turnDiffFilePreviewData(file, diffByFile) : null;
          const content = (
            <>
              <span className="hc-turn-diff-file-path">{file.path}</span>
              <TurnDiffStats added={file.linesAdded} removed={file.linesRemoved} />
              {tooLarge && (
                <span className="hc-turn-diff-file-too-large">
                  {formatMessage({
                    id: "codex.unifiedDiff.inlineLargeFile",
                    defaultMessage: "Too large to render inline",
                  })}
                </span>
              )}
            </>
          );
          const row = (
            <div className="hc-turn-diff-file" key={file.path}>
              {onOpenDiff ? (
                <button
                  type="button"
                  className="hc-turn-diff-file-row"
                  onClick={() => onOpenDiff(file.path)}
                >
                  {content}
                </button>
              ) : (
                <div className="hc-turn-diff-file-row">{content}</div>
              )}
            </div>
          );
          if (preview && onOpenDiff) {
            return (
              <TurnDiffPreviewTooltip
                key={file.path}
                preview={preview}
                onOpen={() => onOpenDiff(file.path)}
              >
                {row}
              </TurnDiffPreviewTooltip>
            );
          }
          return row;
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

function turnDiffFilePreviewData(
  file: TurnDiffFileViewModel,
  diffByFile: Map<string, string>,
): TurnDiffPreviewData | null {
  const fileDiff = diffByFile.get(file.path);
  if (!fileDiff?.trim()) return null;
  return {
    diff: fileDiff,
    linesAdded: file.linesAdded,
    linesRemoved: file.linesRemoved,
    path: file.path,
  };
}
