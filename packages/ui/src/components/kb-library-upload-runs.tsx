import type { LibraryUploadRun } from "./kb-library-model";
import { KbLibraryIngestPipeline, uploadRunPipelineSteps } from "./kb-library-ingest-pipeline";

export interface UploadRunSummary {
  done: number;
  failed: number;
  queued: number;
  processing: number;
}

export function UploadBatchTable({
  runs,
  onClear,
  onOpenPending,
  onOpenTasks,
  onChooseFiles,
}: {
  runs: LibraryUploadRun[];
  onClear: () => void;
  onOpenPending: (pendingIds: number[]) => void;
  onOpenTasks: () => void;
  onChooseFiles: () => void;
}) {
  const summary = summarizeUploadRuns(runs);
  const pendingIds = runs.flatMap((run) => run.pendingIds ?? []);
  return (
    <section className="hc-kb-upload-batch" aria-label="上传结果">
      <div className="hc-kb-upload-batch-head">
        <div>
          <strong>上传结果</strong>
          <span>
            {runs.length} 条资料 · 已入库 {summary.done} · 需处理 {summary.queued} · 失败 {summary.failed}
          </span>
        </div>
        <div className="hc-kb-row-actions hc-kb-row-actions--always">
          {summary.queued > 0 && (
            <button type="button" className="hc-kb-topbar-btn" onClick={() => onOpenPending(pendingIds)}>去处理</button>
          )}
          {summary.processing > 0 && (
            <button type="button" className="hc-kb-topbar-btn" onClick={onOpenTasks}>查看记录</button>
          )}
          {summary.failed > 0 && (
            <button type="button" className="hc-kb-topbar-btn" onClick={onChooseFiles}>重新选择文件</button>
          )}
          <button type="button" className="hc-kb-topbar-btn" onClick={onClear}>收起结果</button>
        </div>
      </div>
      <table className="hc-kb-table hc-kb-upload-batch-table">
        <thead>
          <tr>
            <th style={{ width: "10%" }}>状态</th>
            <th style={{ width: "32%" }}>资料</th>
            <th style={{ width: "18%" }}>目标知识库</th>
            <th>处理结果</th>
            <th style={{ width: "12%", textAlign: "right" }}>下一步</th>
          </tr>
        </thead>
        <tbody>
          {runs.map((run) => (
            <tr key={run.id}>
              <td>
                <span className={`hc-kb-status hc-kb-status--${uploadRunStatusTone(run.status)}`}>
                  {uploadRunStatusLabel(run.status)}
                </span>
              </td>
              <td>
                <div className="hc-kb-file-name" title={run.filename}>{run.filename}</div>
                <div className="hc-kb-file-meta">
                  {run.sourceType === "url" ? "网页" : "文件"} · {formatUploadTime(run.createdAt)}
                  {run.sameNameCount ? ` · 同名 ${run.sameNameCount}` : ""}
                </div>
              </td>
              <td>
                <span className="hc-kb-tag">{run.targetName}</span>
              </td>
              <td>
                <div className="hc-kb-upload-batch-message">
                  {typeof run.progress === "number" && <span>{Math.round(run.progress)}%</span>}
                  <strong>{run.message}</strong>
                </div>
                <KbLibraryIngestPipeline steps={uploadRunPipelineSteps(run)} compact />
              </td>
              <td>
                <div className="hc-kb-row-actions hc-kb-row-actions--always" style={{ justifyContent: "flex-end" }}>
                  {run.status === "queued" ? (
                    <button type="button" className="hc-kb-topbar-btn" onClick={() => onOpenPending(run.pendingIds ?? [])}>处理</button>
                  ) : run.taskId ? (
                    <button type="button" className="hc-kb-topbar-btn" onClick={onOpenTasks}>记录</button>
                  ) : run.status === "failed" ? (
                    <button type="button" className="hc-kb-topbar-btn" onClick={onChooseFiles}>重试</button>
                  ) : (
                    <span className="hc-kb-detail-muted">-</span>
                  )}
                </div>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </section>
  );
}

export function summarizeUploadRuns(runs: LibraryUploadRun[]): UploadRunSummary {
  return runs.reduce((acc, run) => {
    if (run.status === "done") acc.done += 1;
    else if (run.status === "failed") acc.failed += 1;
    else if (run.status === "queued") acc.queued += 1;
    else acc.processing += 1;
    return acc;
  }, { done: 0, failed: 0, queued: 0, processing: 0 });
}

export function uploadRunStatusLabel(status: LibraryUploadRun["status"]): string {
  if (status === "done") return "完成";
  if (status === "failed") return "失败";
  if (status === "queued") return "需处理";
  return "处理中";
}

export function uploadRunStatusTone(status: LibraryUploadRun["status"]): "ok" | "fail" | "pending" {
  if (status === "done") return "ok";
  if (status === "failed") return "fail";
  return "pending";
}

export function formatUploadTime(value: number): string {
  if (!value) return "未记录";
  return new Date(value).toLocaleTimeString("zh-CN", { hour: "2-digit", minute: "2-digit" });
}
