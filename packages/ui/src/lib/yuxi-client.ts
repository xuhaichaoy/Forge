import { HICODEX_DESKTOP_CONFIG_KEYS, readMigratedStorageValue } from "../state/hicodex-desktop-namespace";

export const DEFAULT_YUXI_BASE_URL = "http://127.0.0.1:5050";
export const YUXI_CONNECTION_STORAGE_KEY = HICODEX_DESKTOP_CONFIG_KEYS.yuxiConnection;

export type YuxiBusinessLine = "training_presales" | "bidding";
export type YuxiEntityType = "teacher" | "course" | "case" | "customer";

export interface YuxiConnectionConfig {
  baseUrl: string;
  token: string;
}

export interface YuxiCategoryMeta {
  key: string;
  label: string;
  line: YuxiBusinessLine;
  kind: "instructor" | "course" | "case" | "customer" | "proposal" | "bid";
}

export const YUXI_CATEGORIES: readonly YuxiCategoryMeta[] = [
  { key: "lecturer", label: "讲师库", line: "training_presales", kind: "instructor" },
  { key: "course", label: "课程库", line: "training_presales", kind: "course" },
  { key: "case", label: "案例库", line: "training_presales", kind: "case" },
  { key: "customer", label: "客户与行业库", line: "training_presales", kind: "customer" },
  { key: "proposal", label: "方案素材库", line: "training_presales", kind: "proposal" },
  { key: "wording", label: "话术与包装库", line: "training_presales", kind: "proposal" },
  { key: "bid_info", label: "招标信息库", line: "bidding", kind: "bid" },
  { key: "bid_win", label: "历史赢标案例库", line: "bidding", kind: "bid" },
  { key: "bid_template", label: "标书模板库", line: "bidding", kind: "bid" },
  { key: "bid_risk", label: "废标风险库", line: "bidding", kind: "bid" },
  { key: "bid_intel", label: "竞品谍报库", line: "bidding", kind: "bid" },
  { key: "bid_review", label: "投标复盘库", line: "bidding", kind: "bid" },
] as const;

export interface YuxiLibraryDocument {
  db_id?: string | null;
  kb_name?: string | null;
  business_line?: string | null;
  category?: string | null;
  file_id?: string | null;
  filename?: string | null;
  file_type?: string | null;
  file_size?: number | null;
  status?: string | null;
  created_at?: string | null;
}

export interface YuxiLibraryDocumentsResponse {
  items?: YuxiLibraryDocument[];
  total?: number;
}

export interface YuxiSearchGroup {
  business_line?: string | null;
  category?: string | null;
  label?: string | null;
  results?: Array<{
    db_id?: string | null;
    kb_name?: string | null;
    result?: unknown;
  }>;
}

export interface YuxiSearchResponse {
  query?: string;
  total_kbs_searched?: number;
  groups?: YuxiSearchGroup[];
  errors?: Array<{ db_id?: string; error?: string }>;
}

export interface YuxiUploadResponse {
  file_path?: string;
  minio_path?: string;
  content_hash?: string;
  filename?: string;
  original_filename?: string;
  has_same_name?: boolean;
  same_name_files?: unknown[];
}

export interface YuxiIntakeResponse {
  action?: "auto_ingested" | "queued_classify" | "queued_dup" | "queued_force" | string;
  filename?: string;
  target_db_id?: string | null;
  candidates?: YuxiClassifyCandidate[] | null;
  duplicates?: unknown[] | null;
  pending_id?: number | null;
  pending_ids?: number[] | null;
  file_id?: string | null;
  failure_reason?: string | null;
}

export interface YuxiClassifyCandidate {
  category?: string;
  label?: string;
  business_line?: string;
  score?: number;
  reason?: string;
  db_id?: string;
}

export type YuxiPendingQueue = "classify" | "entity" | "dup" | "force";

export interface YuxiPendingItem {
  id?: number;
  filename?: string | null;
  file_size?: number | null;
  candidates?: YuxiClassifyCandidate[] | null;
  suggested_db_id?: string | null;
  business_line_hint?: string | null;
  scenario_hint?: string | null;
  target_db_id?: string | null;
  collision_file_id?: string | null;
  similarity?: number | null;
  failure_reason?: string | null;
  extracted_text?: string | null;
  candidate_entity_type?: string | null;
  status?: string | null;
  created_at?: string | null;
}

export interface YuxiPendingListResponse {
  items?: YuxiPendingItem[];
  total?: number;
}

export interface YuxiPendingCountResponse {
  classify?: number;
  entity?: number;
  dup?: number;
  force?: number;
  total?: number;
}

export interface YuxiEntity {
  id?: number;
  entity_type?: string | null;
  canonical_name?: string | null;
  description?: string | null;
  authority_status?: string | null;
  attributes?: Record<string, unknown> | null;
  metrics?: Record<string, unknown> | null;
  aliases?: string[];
  reference_count?: number;
  updated_at?: string | null;
}

export interface YuxiEntityListResponse {
  items?: YuxiEntity[];
  total?: number;
}

export class YuxiApiError extends Error {
  readonly status: number;
  readonly detail: unknown;

  constructor(message: string, status: number, detail: unknown) {
    super(message);
    this.name = "YuxiApiError";
    this.status = status;
    this.detail = detail;
  }
}

export function readYuxiConnectionConfig(
  storage: Pick<Storage, "getItem"> | null | undefined = browserStorage(),
): YuxiConnectionConfig {
  const raw = readMigratedStorageValue(storage, YUXI_CONNECTION_STORAGE_KEY);
  if (!raw) return { baseUrl: DEFAULT_YUXI_BASE_URL, token: "" };
  try {
    const parsed = JSON.parse(raw) as Partial<YuxiConnectionConfig>;
    return {
      baseUrl: normalizeYuxiBaseUrl(parsed.baseUrl),
      token: typeof parsed.token === "string" ? parsed.token : "",
    };
  } catch {
    return { baseUrl: DEFAULT_YUXI_BASE_URL, token: "" };
  }
}

export function writeYuxiConnectionConfig(
  config: YuxiConnectionConfig,
  storage: Pick<Storage, "setItem"> | null | undefined = browserStorage(),
): void {
  if (!storage) return;
  storage.setItem(YUXI_CONNECTION_STORAGE_KEY, JSON.stringify({
    baseUrl: normalizeYuxiBaseUrl(config.baseUrl),
    token: config.token.trim(),
  }));
}

export function normalizeYuxiBaseUrl(value: string | null | undefined): string {
  const trimmed = (value ?? "").trim() || DEFAULT_YUXI_BASE_URL;
  return trimmed.replace(/\/+$/, "");
}

export function yuxiCategoryMeta(category: string | null | undefined): YuxiCategoryMeta | null {
  if (!category) return null;
  return YUXI_CATEGORIES.find((item) => item.key === category) ?? null;
}

export function yuxiBusinessLineLabel(value: string | null | undefined): string {
  if (value === "training_presales") return "售前";
  if (value === "bidding") return "投标";
  return value || "未分业务线";
}

export function yuxiEntityTypeLabel(value: string | null | undefined): string {
  if (value === "teacher") return "讲师";
  if (value === "course") return "课程";
  if (value === "case") return "案例";
  if (value === "customer") return "客户";
  return value || "实体";
}

export async function listYuxiLibraryDocuments(
  filters: {
    businessLine?: YuxiBusinessLine | null;
    category?: string | null;
    limit?: number;
    offset?: number;
  } = {},
): Promise<YuxiLibraryDocumentsResponse> {
  const params = new URLSearchParams();
  if (filters.businessLine) params.set("business_line", filters.businessLine);
  if (filters.category) params.set("category", filters.category);
  params.set("limit", String(filters.limit ?? 200));
  params.set("offset", String(filters.offset ?? 0));
  return yuxiRequest<YuxiLibraryDocumentsResponse>(`/api/presales/library/documents?${params.toString()}`);
}

export async function searchYuxiLibrary(filters: {
  query: string;
  businessLine?: YuxiBusinessLine | null;
  category?: string | null;
  topKPerKb?: number;
  maxKbs?: number;
}): Promise<YuxiSearchResponse> {
  return yuxiRequest<YuxiSearchResponse>("/api/presales/library/search", {
    method: "POST",
    body: JSON.stringify({
      query: filters.query,
      business_lines: filters.businessLine ? [filters.businessLine] : null,
      categories: filters.category ? [filters.category] : null,
      top_k_per_kb: filters.topKPerKb ?? 5,
      max_kbs: filters.maxKbs ?? 10,
    }),
  });
}

export async function uploadYuxiKnowledgeFile(file: File): Promise<YuxiUploadResponse> {
  const form = new FormData();
  form.set("file", file, file.name);
  return yuxiRequest<YuxiUploadResponse>("/api/knowledge/files/upload", {
    method: "POST",
    body: form,
  });
}

export async function intakeYuxiKnowledgeFile(payload: {
  file_path: string;
  filename: string;
  file_size: number;
  content_hash: string;
  business_line_hint?: YuxiBusinessLine | null;
  scenario_hint?: string | null;
}): Promise<YuxiIntakeResponse> {
  return yuxiRequest<YuxiIntakeResponse>("/api/presales/ingest/intake", {
    method: "POST",
    body: JSON.stringify(payload),
  });
}

export async function listYuxiPendingQueue(
  queue: YuxiPendingQueue,
  options: { scope?: "mine" | "team"; limit?: number } = {},
): Promise<YuxiPendingListResponse> {
  const params = new URLSearchParams();
  params.set("scope", options.scope ?? "mine");
  params.set("limit", String(options.limit ?? 50));
  return yuxiRequest<YuxiPendingListResponse>(`/api/presales/ingest/pending/${queue}?${params.toString()}`);
}

export async function countYuxiPending(options: { scope?: "mine" | "team" } = {}): Promise<YuxiPendingCountResponse> {
  const params = new URLSearchParams();
  params.set("scope", options.scope ?? "mine");
  return yuxiRequest<YuxiPendingCountResponse>(`/api/presales/ingest/pending/count?${params.toString()}`);
}

export async function listYuxiEntities(filters: {
  type?: YuxiEntityType | null;
  query?: string | null;
  limit?: number;
  offset?: number;
} = {}): Promise<YuxiEntityListResponse> {
  const params = new URLSearchParams();
  if (filters.type) params.set("type", filters.type);
  if (filters.query) params.set("q", filters.query);
  params.set("limit", String(filters.limit ?? 50));
  params.set("offset", String(filters.offset ?? 0));
  return yuxiRequest<YuxiEntityListResponse>(`/api/presales/entities?${params.toString()}`);
}

export async function downloadYuxiKnowledgeDocument(file: YuxiLibraryDocument): Promise<Blob> {
  if (!file.db_id || !file.file_id) {
    throw new Error("缺少知识库或文件 ID，无法下载");
  }
  return yuxiRequest<Blob>(
    `/api/knowledge/databases/${encodeURIComponent(file.db_id)}/documents/${encodeURIComponent(file.file_id)}/download`,
    {},
    "blob",
  );
}

async function yuxiRequest<T>(
  path: string,
  init: RequestInit = {},
  responseType: "json" | "blob" = "json",
): Promise<T> {
  const config = readYuxiConnectionConfig();
  const headers = new Headers(init.headers);
  if (!(init.body instanceof FormData) && !headers.has("Content-Type")) {
    headers.set("Content-Type", "application/json");
  }
  const token = config.token.trim();
  if (token) headers.set("Authorization", `Bearer ${token}`);

  const response = await fetch(`${normalizeYuxiBaseUrl(config.baseUrl)}${path}`, {
    ...init,
    headers,
  });
  if (!response.ok) {
    const detail = await readErrorDetail(response);
    throw new YuxiApiError(yuxiErrorMessage(response.status, detail), response.status, detail);
  }
  if (responseType === "blob") return await response.blob() as T;
  if (response.status === 204) return undefined as T;
  return await response.json() as T;
}

async function readErrorDetail(response: Response): Promise<unknown> {
  const contentType = response.headers.get("content-type") ?? "";
  try {
    if (contentType.includes("application/json")) return await response.json();
    return await response.text();
  } catch {
    return null;
  }
}

function yuxiErrorMessage(status: number, detail: unknown): string {
  const detailText = detailMessage(detail);
  if (status === 401) return detailText || "Yuxi 未认证，请配置 API Token";
  if (status === 403) return detailText || "当前账号没有权限访问 Yuxi 知识库";
  return detailText || `Yuxi 请求失败 (${status})`;
}

function detailMessage(detail: unknown): string {
  if (typeof detail === "string") return detail;
  if (detail && typeof detail === "object") {
    const record = detail as Record<string, unknown>;
    const raw = record.detail ?? record.message;
    if (typeof raw === "string") return raw;
  }
  return "";
}

function browserStorage(): Storage | null {
  if (typeof window === "undefined") return null;
  try {
    return window.localStorage;
  } catch {
    return null;
  }
}
