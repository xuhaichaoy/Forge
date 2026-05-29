import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { CheckCircle2, Loader2, Upload, XCircle } from "lucide-react";
import { KbPageShell } from "./kb-page-shell";
import {
  intakeYuxiKnowledgeFile,
  listYuxiPendingQueue,
  uploadYuxiKnowledgeFile,
  type YuxiBusinessLine,
  type YuxiIntakeResponse,
  type YuxiPendingItem,
  type YuxiPendingQueue,
  yuxiCategoryMeta,
} from "../lib/yuxi-client";

const MAX_FILE_BYTES = 50 * 1024 * 1024;

const BIZ_LINES = [
  { key: "training_presales", label: "售前" },
  { key: "bidding", label: "投标" },
] as const;
const SCENES_PRESALES = ["新增讲师资料", "更新讲师资料", "新增课程", "客户复盘", "方案归档", "其他"];
const SCENES_BID = ["新招标信息", "投标历史归档", "标书模板", "其他"];

interface UploadRun {
  id: string;
  filename: string;
  status: "uploading" | "done" | "failed";
  message: string;
  action?: string;
}

function QueueRow({
  item,
  mode,
}: {
  item: YuxiPendingItem;
  mode: YuxiPendingQueue;
}) {
  const filename = item.filename || item.extracted_text || `待办 #${item.id ?? "-"}`;
  const ext = fileExt(filename);
  const candidates = item.candidates ?? [];
  const top1 = candidates[0];
  const top2 = candidates[1];
  return (
    <div className="hc-kb-queue-row">
      <span className={`hc-kb-file-icon hc-kb-file-icon--${ext.toLowerCase()}`}>{ext}</span>
      <span className="hc-kb-queue-filename" title={filename}>{filename}</span>
      <span className="hc-kb-queue-reason">{queueReason(item, mode)}</span>
      <div className="hc-kb-queue-actions">
        {mode === "classify" && (
          <>
            {top1 && <button type="button" className="hc-kb-queue-btn hc-kb-queue-btn--primary">{candidateLabel(top1)}</button>}
            {top2 && <button type="button" className="hc-kb-queue-btn">{candidateLabel(top2)}</button>}
          </>
        )}
        {mode === "dup" && (
          <>
            <button type="button" className="hc-kb-queue-btn hc-kb-queue-btn--primary">替换</button>
            <button type="button" className="hc-kb-queue-btn">做副本</button>
          </>
        )}
        {mode === "force" && (
          <>
            <button type="button" className="hc-kb-queue-btn">手动分类</button>
            <button type="button" className="hc-kb-queue-btn" title="删除此文件" aria-label={`删除 ${filename}`}>
              <XCircle size={13} strokeWidth={2} aria-hidden="true" />
            </button>
          </>
        )}
        {mode === "entity" && (
          <button type="button" className="hc-kb-queue-btn hc-kb-queue-btn--primary">对齐实体</button>
        )}
        <button type="button" className="hc-kb-queue-btn" title="确认" aria-label="确认">
          <CheckCircle2 size={13} strokeWidth={2} aria-hidden="true" />
        </button>
      </div>
    </div>
  );
}

export function KbIngestView() {
  const [bizLine, setBizLine] = useState<YuxiBusinessLine>("training_presales");
  const [activeScene, setActiveScene] = useState<string>("");
  const [dragging, setDragging] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [runs, setRuns] = useState<UploadRun[]>([]);
  const [queues, setQueues] = useState<Record<YuxiPendingQueue, YuxiPendingItem[]>>({
    classify: [],
    entity: [],
    dup: [],
    force: [],
  });
  const fileInputRef = useRef<HTMLInputElement>(null);

  const scenes = bizLine === "training_presales" ? SCENES_PRESALES : SCENES_BID;
  const pendingCount = useMemo(() => Object.values(queues).reduce((sum, items) => sum + items.length, 0), [queues]);

  const loadQueues = useCallback(async () => {
    setError(null);
    try {
      const [classify, entity, dup, force] = await Promise.all([
        listYuxiPendingQueue("classify", { scope: "mine" }),
        listYuxiPendingQueue("entity", { scope: "mine" }),
        listYuxiPendingQueue("dup", { scope: "mine" }),
        listYuxiPendingQueue("force", { scope: "mine" }),
      ]);
      setQueues({
        classify: classify.items ?? [],
        entity: entity.items ?? [],
        dup: dup.items ?? [],
        force: force.items ?? [],
      });
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    }
  }, []);

  useEffect(() => {
    void loadQueues();
  }, [loadQueues]);

  const handleFiles = useCallback(async (files: FileList | File[]) => {
    const selected = Array.from(files);
    if (selected.length === 0) return;
    setUploading(true);
    setError(null);
    setRuns(selected.map((file) => ({
      id: `${file.name}:${file.lastModified}:${file.size}`,
      filename: file.name,
      status: "uploading",
      message: "上传中",
    })));

    for (const file of selected) {
      const id = `${file.name}:${file.lastModified}:${file.size}`;
      if (file.size > MAX_FILE_BYTES) {
        setRuns((prev) => updateRun(prev, id, { status: "failed", message: "超过 50 MB" }));
        continue;
      }
      try {
        const uploaded = await uploadYuxiKnowledgeFile(file);
        if (!uploaded.file_path || !uploaded.content_hash) {
          throw new Error("上传成功但缺少 file_path 或 content_hash");
        }
        const intake = await intakeYuxiKnowledgeFile({
          file_path: uploaded.file_path,
          filename: uploaded.filename || file.name,
          file_size: file.size,
          content_hash: uploaded.content_hash,
          business_line_hint: bizLine,
          scenario_hint: activeScene || null,
        });
        setRuns((prev) => updateRun(prev, id, {
          status: "done",
          message: intakeMessage(intake),
          action: intake.action,
        }));
      } catch (err) {
        setRuns((prev) => updateRun(prev, id, {
          status: "failed",
          message: err instanceof Error ? err.message : String(err),
        }));
      }
    }
    setUploading(false);
    await loadQueues();
  }, [activeScene, bizLine, loadQueues]);

  return (
    <KbPageShell
      title="知识库上传"
      ariaLabel="知识库资料上传"
      actions={
        <button type="button" className="hc-kb-topbar-btn hc-kb-topbar-btn--primary" onClick={() => fileInputRef.current?.click()} disabled={uploading}>
          {uploading ? <Loader2 size={13} strokeWidth={2.2} aria-hidden="true" /> : <Upload size={13} strokeWidth={2.2} aria-hidden="true" />}
          {uploading ? "入库中" : "新建入库批次"}
        </button>
      }
    >
      <div className="hc-kb-ingest-body">
        <input
          ref={fileInputRef}
          type="file"
          multiple
          accept=".doc,.docx,.pdf,.ppt,.pptx,.xls,.xlsx,.md,.txt"
          hidden
          onChange={(event) => {
            const files = event.currentTarget.files;
            if (files) void handleFiles(files);
            event.currentTarget.value = "";
          }}
        />

        <div className="hc-kb-ingest-meta">
          <span className="hc-kb-ingest-meta-label">业务线</span>
          <div className="hc-kb-ingest-chips" role="group" aria-label="业务线选择">
            {BIZ_LINES.map((line) => (
              <button
                key={line.key}
                type="button"
                className="hc-kb-ingest-chip"
                data-active={bizLine === line.key ? "true" : undefined}
                onClick={() => { setBizLine(line.key); setActiveScene(""); }}
              >
                {line.label}
              </button>
            ))}
          </div>
          <span className="hc-kb-ingest-meta-label" style={{ marginLeft: 8 }}>场景</span>
          <div className="hc-kb-ingest-chips" role="group" aria-label="场景选择">
            {scenes.map((scene) => (
              <button
                key={scene}
                type="button"
                className="hc-kb-ingest-chip"
                data-active={activeScene === scene ? "true" : undefined}
                onClick={() => setActiveScene(activeScene === scene ? "" : scene)}
              >
                {scene}
              </button>
            ))}
          </div>
        </div>

        {error && <div className="hc-kb-inline-alert" data-tone="danger">{error}</div>}

        <div
          className="hc-kb-dropzone"
          data-dragging={dragging ? "true" : undefined}
          role="button"
          tabIndex={0}
          aria-label="点击或拖拽文件上传"
          onClick={() => fileInputRef.current?.click()}
          onKeyDown={(event) => {
            if (event.key === "Enter" || event.key === " ") fileInputRef.current?.click();
          }}
          onDragOver={(event) => { event.preventDefault(); setDragging(true); }}
          onDragLeave={() => setDragging(false)}
          onDrop={(event) => {
            event.preventDefault();
            setDragging(false);
            void handleFiles(event.dataTransfer.files);
          }}
        >
          <div className="hc-kb-dropzone-icon">
            <Upload size={28} strokeWidth={1.6} aria-hidden="true" />
          </div>
          <div className="hc-kb-dropzone-title">点击选择文件，或直接拖拽进来</div>
          <div className="hc-kb-dropzone-hint">
            支持 docx / pdf / pptx / xlsx / md / txt · 单批最多 500 份 · 单文件 ≤ 50 MB
          </div>
          <div className="hc-kb-dropzone-hint" style={{ marginTop: 4 }}>
            已选：{[BIZ_LINES.find((line) => line.key === bizLine)?.label, activeScene].filter(Boolean).join(" · ")}
          </div>
        </div>

        {runs.length > 0 && (
          <div className="hc-kb-queue-section">
            <div className="hc-kb-queue-header">
              <span>本次入库</span>
              <span className="hc-kb-queue-count">{runs.length}</span>
            </div>
            {runs.map((run) => (
              <div key={run.id} className="hc-kb-queue-row">
                <span className={`hc-kb-status ${run.status === "failed" ? "hc-kb-status--fail" : run.status === "done" ? "hc-kb-status--ok" : "hc-kb-status--pending"}`}>
                  {run.status === "failed" ? "失败" : run.status === "done" ? "完成" : "处理中"}
                </span>
                <span className="hc-kb-queue-filename" title={run.filename}>{run.filename}</span>
                <span className="hc-kb-queue-reason">{run.message}</span>
              </div>
            ))}
          </div>
        )}

        <QueueSection title="分类确认" items={queues.classify} mode="classify" />
        <QueueSection title="实体对齐" items={queues.entity} mode="entity" />
        <QueueSection title="重复 / 版本确认" items={queues.dup} mode="dup" />
        <QueueSection title="强制分类" items={queues.force} mode="force" />

        {pendingCount === 0 && !uploading && (
          <div className="hc-kb-empty">
            <div className="hc-kb-empty-content">
              <div className="hc-kb-empty-title">暂无待处理入库事项</div>
              <div className="hc-kb-empty-subtitle">新上传资料会按后端分类、查重和解析结果进入对应队列。</div>
            </div>
          </div>
        )}
      </div>
    </KbPageShell>
  );
}

function QueueSection({ title, items, mode }: { title: string; items: YuxiPendingItem[]; mode: YuxiPendingQueue }) {
  if (items.length === 0) return null;
  return (
    <div className="hc-kb-queue-section">
      <div className="hc-kb-queue-header">
        <span>{title}</span>
        <span className="hc-kb-queue-count hc-kb-queue-count--warn">{items.length}</span>
      </div>
      {items.map((item) => (
        <QueueRow key={`${mode}:${item.id ?? item.filename}`} item={item} mode={mode} />
      ))}
    </div>
  );
}

function updateRun(runs: UploadRun[], id: string, patch: Partial<UploadRun>): UploadRun[] {
  return runs.map((run) => run.id === id ? { ...run, ...patch } : run);
}

function intakeMessage(response: YuxiIntakeResponse): string {
  if (response.action === "auto_ingested") return `已自动入库${response.file_id ? ` · ${response.file_id}` : ""}`;
  if (response.action === "queued_classify") return `进入分类确认队列 #${response.pending_id ?? "-"}`;
  if (response.action === "queued_dup") return `进入重复确认队列 #${response.pending_id ?? "-"}`;
  if (response.action === "queued_force") return response.failure_reason ? `进入强制分类：${response.failure_reason}` : `进入强制分类队列 #${response.pending_id ?? "-"}`;
  return response.action || "已提交入库";
}

function queueReason(item: YuxiPendingItem, mode: YuxiPendingQueue): string {
  if (mode === "classify") {
    const top = item.candidates?.[0];
    const score = typeof top?.score === "number" ? `置信度 ${Math.round(top.score * 100)}%` : "需要确认分类";
    return item.scenario_hint ? `${score} · ${item.scenario_hint}` : score;
  }
  if (mode === "dup") {
    return typeof item.similarity === "number" ? `相似度 ${Math.round(item.similarity * 100)}%` : "命中重复或相似版本";
  }
  if (mode === "entity") {
    return item.candidate_entity_type ? `候选实体：${item.candidate_entity_type}` : "需要确认实体关联";
  }
  return item.failure_reason || "需要人工指派知识库";
}

function candidateLabel(candidate: { label?: string; category?: string; score?: number }): string {
  const label = candidate.label || yuxiCategoryMeta(candidate.category)?.label || candidate.category || "候选分类";
  if (typeof candidate.score === "number") return `${label} ${Math.round(candidate.score * 100)}%`;
  return label;
}

function fileExt(filename: string): "DOC" | "PDF" | "PPT" | "XLS" | "MD" | "TXT" {
  const suffix = (filename.split(".").pop() || "").toLowerCase();
  if (["doc", "docx"].includes(suffix)) return "DOC";
  if (suffix === "pdf") return "PDF";
  if (["ppt", "pptx"].includes(suffix)) return "PPT";
  if (["xls", "xlsx", "csv"].includes(suffix)) return "XLS";
  if (["md", "markdown"].includes(suffix)) return "MD";
  return "TXT";
}
