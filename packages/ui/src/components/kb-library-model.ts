import {
  type YuxiBusinessLine,
  type YuxiLibraryDocument,
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
    // 导航已按 Yuxi 真实库分组，「所属知识库」列已用粗体展示库名（file.source）。
    // 这里不再用写死类目映射；仅当平台返回的 category 字段与库名不同时补一个原样标签。
    categories: (() => {
      const source = file.kb_name || "";
      const label = file.category || "";
      return label && label !== source ? [{ label, kind: "proposal" as const }] : [];
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
  if (status === "failed" || status === "error" || status === "error_parsing" || status === "error_indexing")
    return "解析或入库失败";
  if (status === "uploaded") return "待解析";
  if (status === "parsed") return "待入库";
  if (
    status === "processing" ||
    status === "pending" ||
    status === "running" ||
    status === "indexing" ||
    status === "parsing" ||
    status === "waiting"
  )
    return "处理中";
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
  const date = parseYuxiTimestamp(value);
  if (!date) return value;
  return date.toLocaleString("zh-CN", { year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit" });
}

/**
 * Yuxi 返回的 created_at/updated_at 是 UTC 时间，但有时不带时区标记
 * （形如 `2026-06-04T10:37:00` 或 `2026-06-04 10:37:00`）。JS 的
 * `new Date("2026-06-04T10:37:00")` 会把无时区的串当成「本地时间」解析，
 * 于是把 UTC 的钟面值原样当本地显示——这正是「上传时间差 8 小时」的根因
 * （北京 18:37 上传，Yuxi 存的是 10:37 UTC，无标记被当本地→显示 10:37）。
 *
 * 这里统一把无时区标记的串补上 `Z`（按 UTC 解析），随后由调用方的
 * `toLocaleString` 自然转换到运行环境本地时区（北京 UTC+8）。已带 `Z`/
 * `+hh:mm` 等偏移的串保持不变。解析失败返回 null，由调用方回退显示原串。
 */
export function parseYuxiTimestamp(value: string | null | undefined): Date | null {
  if (!value) return null;
  const trimmed = value.trim();
  if (!trimmed) return null;
  const normalized = normalizeUtcTimestamp(trimmed);
  const date = new Date(normalized);
  if (Number.isNaN(date.getTime())) {
    const fallback = new Date(trimmed);
    return Number.isNaN(fallback.getTime()) ? null : fallback;
  }
  return date;
}

function normalizeUtcTimestamp(value: string): string {
  // 已经带显式时区（Z 或 ±hh[:mm]）的不动。
  if (/[zZ]$/.test(value) || /[+-]\d{2}:?\d{2}$/.test(value)) return value;
  // 仅当形如日期时间（含小时分钟）时才补 UTC 标记，避免把纯日期（如
  // `2026-06-04`，本就是 UTC 午夜）再次偏移；纯日期交给原生解析即可。
  const dateTime = value.match(/^(\d{4}-\d{2}-\d{2})[ T](\d{2}:\d{2}(?::\d{2}(?:\.\d+)?)?)$/);
  if (dateTime) return `${dateTime[1]}T${dateTime[2]}Z`;
  return value;
}

function trimLong(value: string): string {
  const compact = value.replace(/\s+/g, " ").trim();
  return compact.length > 420 ? `${compact.slice(0, 420)}...` : compact;
}
