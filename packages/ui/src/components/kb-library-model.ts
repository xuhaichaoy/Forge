import {
  type YuxiBusinessLine,
  type YuxiLibraryDocument,
  yuxiCategoryMeta,
} from "../lib/yuxi-client";

export type BizLine = "all" | YuxiBusinessLine;

export interface FileRow {
  id: string;
  name: string;
  ext: "DOC" | "PDF" | "PPT" | "XLS" | "MD" | "TXT";
  date: string;
  updatedDate: string;
  source: string;
  uploadedBy: string;
  batchLabel: string;
  versionLabel: string;
  pendingReason: string;
  categories: Array<{ label: string; kind: "instructor" | "course" | "case" | "customer" | "proposal" | "bid" }>;
  bizLine: BizLine;
  raw: YuxiLibraryDocument;
}

export interface LibraryUploadRun {
  id: string;
  batchId: string;
  filename: string;
  targetName: string;
  sourceType: "file" | "url";
  status: "uploading" | "processing" | "queued" | "done" | "failed";
  message: string;
  createdAt: number;
  progress?: number | null;
  taskId?: string | null;
  pendingIds?: number[];
  sameNameCount?: number;
  contentHash?: string | null;
}

export interface LibraryGovernanceDraft {
  ownerRole: string;
  updateRule: string;
  authorityRule: string;
  citationScope: string;
  intakeMode: "auto" | "review_first";
  duplicateMode: "review" | "archive_exact";
  entityMode: "auto_align" | "review_all";
  confidenceMode: "balanced" | "strict";
  qualityMetrics: string[];
  externalSystems: string[];
  uploadChecklist: string[];
  matchSignals: string[];
}

export function toFileRow(file: YuxiLibraryDocument): FileRow {
  const meta = yuxiCategoryMeta(file.category);
  const name = file.filename || file.file_id || "未命名资料";
  return {
    id: `${file.db_id ?? "db"}:${file.file_id ?? name}`,
    name,
    ext: fileExt(name, file.file_type),
    date: formatDate(file.created_at),
    updatedDate: formatDate(file.updated_at || file.created_at),
    source: file.kb_name || "当前知识库",
    uploadedBy: file.uploaded_by || file.uploader || file.created_by || "未记录",
    batchLabel: file.batch_id || shortId(file.file_id) || "未记录",
    versionLabel: versionLabel(file),
    pendingReason: file.pending_reason || pendingReason(file.status),
    bizLine: file.business_line === "training_presales" || file.business_line === "bidding" ? file.business_line : "all",
    // 「所属知识库」列已用粗体展示库名（file.source）。这里只补一个分类标签，
    // 且当分类名与库名相同时（如单库分类）不再重复打标签，避免出现两个一样的胶囊。
    categories: (() => {
      const source = file.kb_name || "";
      const label = meta ? meta.label : file.category || "";
      const kind: FileRow["categories"][number]["kind"] = meta ? meta.kind : "proposal";
      return label && label !== source ? [{ label, kind }] : [];
    })(),
    raw: file,
  };
}

function versionLabel(file: YuxiLibraryDocument): string {
  if (file.duplicate_status) return duplicateStatusLabel(file.duplicate_status);
  if (file.content_hash) return "已留存版本";
  return "首次入库";
}

function pendingReason(status: string | null | undefined): string {
  if (status === "failed" || status === "error" || status === "error_parsing") return "解析或入库失败";
  if (status === "uploaded") return "待解析";
  if (status === "parsed") return "待入库";
  if (status === "processing" || status === "pending" || status === "running") return "处理中";
  return "无待处理";
}

function shortId(value: string | null | undefined): string {
  if (!value) return "";
  return value.length > 12 ? `${value.slice(0, 6)}...${value.slice(-4)}` : value;
}

function duplicateStatusLabel(value: string): string {
  const normalized = value.toLowerCase();
  const map: Record<string, string> = {
    duplicate: "发现重复",
    same_name: "同名资料",
    exact: "完全重复",
    kept_as_copy: "保留副本",
    archived: "已保留历史",
    replaced: "已替换旧版",
  };
  return map[normalized] || value;
}

export function summarizeSearchResult(value: unknown): string {
  if (typeof value === "string") return trimLong(value);
  if (Array.isArray(value)) {
    return trimLong(value.map((item) => summarizeSearchResult(item)).filter(Boolean).join("\n"));
  }
  if (value && typeof value === "object") {
    const record = value as Record<string, unknown>;
    for (const key of ["text", "content", "answer", "summary", "chunk"]) {
      if (typeof record[key] === "string") return trimLong(record[key]);
    }
    return trimLong(JSON.stringify(value));
  }
  return "无文本摘要";
}

export function updateUploadRun(
  runs: LibraryUploadRun[],
  id: string,
  patch: Partial<LibraryUploadRun>,
): LibraryUploadRun[] {
  return runs.map((run) => run.id === id ? { ...run, ...patch } : run);
}

function fileExt(filename: string, fileType: string | null | undefined): FileRow["ext"] {
  const suffix = (fileType || filename.split(".").pop() || "").toLowerCase();
  if (["doc", "docx"].includes(suffix)) return "DOC";
  if (suffix === "pdf") return "PDF";
  if (["ppt", "pptx"].includes(suffix)) return "PPT";
  if (["xls", "xlsx", "csv"].includes(suffix)) return "XLS";
  if (["md", "markdown"].includes(suffix)) return "MD";
  return "TXT";
}

function formatDate(value: string | null | undefined): string {
  if (!value) return "未记录时间";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleString("zh-CN", { year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit" });
}

function trimLong(value: string): string {
  const compact = value.replace(/\s+/g, " ").trim();
  return compact.length > 420 ? `${compact.slice(0, 420)}...` : compact;
}
