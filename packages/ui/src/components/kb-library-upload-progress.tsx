import { KbLibraryIngestPipeline, uploadRunPipelineSteps } from "./kb-library-ingest-pipeline";
import type { LibraryUploadRun } from "./kb-library-model";
import {
  summarizeUploadRuns,
  uploadRunStatusLabel,
  uploadRunStatusTone,
} from "./kb-library-upload-runs";

export function KbLibraryUploadProgress({
  uploadRuns,
  onClearRuns,
  onOpenPending,
  onOpenTasks,
  onClose,
}: {
  uploadRuns: LibraryUploadRun[];
  onClearRuns: () => void;
  onOpenPending: (pendingIds: number[]) => void;
  onOpenTasks: () => void;
  onClose: () => void;
}) {
  const summary = summarizeUploadRuns(uploadRuns);
  const allPendingIds = uploadRuns.flatMap((run) => run.pendingIds ?? []);
  const settled = summary.processing === 0;
  return (
    <section className="hc-kb-upload-dialog-progress" aria-label="上传进度">
      <div className="hc-kb-upload-dialog-progress-head">
        <strong>上传进度</strong>
        <span>
          {uploadRuns.length} 条 · 已入库 {summary.done} · 需处理 {summary.queued} · 失败 {summary.failed}
        </span>
      </div>
      <ul className="hc-kb-upload-dialog-progress-list">
        {uploadRuns.map((run) => (
          <li key={run.id} className="hc-kb-upload-dialog-progress-row" data-status={run.status}>
            <div className="hc-kb-upload-dialog-progress-row-head">
              <span className={`hc-kb-status hc-kb-status--${uploadRunStatusTone(run.status)}`}>
                {uploadRunStatusLabel(run.status)}
              </span>
              <span className="hc-kb-file-name" title={run.filename}>{run.filename}</span>
              <span className="hc-kb-tag">{run.targetName}</span>
            </div>
            <div className="hc-kb-upload-dialog-progress-row-body">
              <div className="hc-kb-upload-batch-message">
                {typeof run.progress === "number" && <span>{Math.round(run.progress)}%</span>}
                <strong>{run.message}</strong>
              </div>
              <KbLibraryIngestPipeline steps={uploadRunPipelineSteps(run)} compact />
            </div>
            {run.status === "queued" && (run.pendingIds?.length ?? 0) > 0 && (
              <div className="hc-kb-row-actions hc-kb-row-actions--always">
                <button type="button" className="hc-kb-topbar-btn" onClick={() => onOpenPending(run.pendingIds ?? [])}>
                  去处理
                </button>
              </div>
            )}
          </li>
        ))}
      </ul>
      <div className="hc-kb-upload-dialog-progress-foot">
        {summary.queued > 0 && (
          <button type="button" className="hc-kb-topbar-btn" onClick={() => onOpenPending(allPendingIds)}>
            去处理入库问题
          </button>
        )}
        {summary.processing > 0 && (
          <button type="button" className="hc-kb-topbar-btn" onClick={onOpenTasks}>
            查看处理记录
          </button>
        )}
        <button type="button" className="hc-kb-topbar-btn" onClick={onClearRuns} disabled={!settled}>
          清空进度
        </button>
        <button
          type="button"
          className="hc-kb-topbar-btn hc-kb-topbar-btn--primary"
          onClick={onClose}
          disabled={!settled}
        >
          {settled ? "完成" : "处理中…"}
        </button>
      </div>
    </section>
  );
}
