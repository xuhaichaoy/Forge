import { yuxiRequest } from "./yuxi-request";
import type {
  YuxiBusinessLine,
  YuxiLibraryDocument,
  YuxiLibraryDocumentsResponse,
  YuxiSearchResponse,
  YuxiUploadResponse,
  YuxiKnowledgeProcessResponse,
  YuxiTaskResponse,
  YuxiTasksResponse,
  YuxiKnowledgeDocumentDetail,
  YuxiKnowledgeFolderResponse,
} from "./yuxi-types";

export async function listYuxiLibraryDocuments(
  filters: {
    businessLine?: YuxiBusinessLine | null;
    category?: string | null;
    dbId?: string | null;
    limit?: number;
    offset?: number;
  } = {},
): Promise<YuxiLibraryDocumentsResponse> {
  // presales-dev keeps /api/presales/library/documents (the full document listing,
  // incl. file_size/category/business_line/entities/duplicate_status). Its `db_id`
  // query + response field carry the kb_id VALUE, which matches what the databases
  // adapter below surfaces as db_id — so the original call works unchanged.
  const params = new URLSearchParams();
  if (filters.businessLine) params.set("business_line", filters.businessLine);
  if (filters.category) params.set("category", filters.category);
  if (filters.dbId) params.set("db_id", filters.dbId);
  params.set("limit", String(filters.limit ?? 200));
  params.set("offset", String(filters.offset ?? 0));
  return yuxiRequest<YuxiLibraryDocumentsResponse>(`/api/presales/library/documents?${params.toString()}`);
}

export async function getYuxiTask(taskId: string): Promise<YuxiTaskResponse> {
  return yuxiRequest<YuxiTaskResponse>(`/api/tasks/${encodeURIComponent(taskId)}`);
}

export async function listYuxiTasks(filters: {
  status?: string | null;
  dbId?: string | null;
  category?: string | null;
  businessLine?: YuxiBusinessLine | null;
  limit?: number;
} = {}): Promise<YuxiTasksResponse> {
  const params = new URLSearchParams();
  if (filters.status) params.set("status", filters.status);
  if (filters.dbId) params.set("db_id", filters.dbId);
  if (filters.category) params.set("category", filters.category);
  if (filters.businessLine) params.set("business_line", filters.businessLine);
  params.set("limit", String(filters.limit ?? 50));
  return yuxiRequest<YuxiTasksResponse>(`/api/tasks?${params.toString()}`);
}

export async function cancelYuxiTask(taskId: string): Promise<Record<string, unknown>> {
  return yuxiRequest<Record<string, unknown>>(`/api/tasks/${encodeURIComponent(taskId)}/cancel`, {
    method: "POST",
    body: JSON.stringify({}),
  });
}

export async function deleteYuxiTask(taskId: string): Promise<Record<string, unknown>> {
  return yuxiRequest<Record<string, unknown>>(`/api/tasks/${encodeURIComponent(taskId)}`, {
    method: "DELETE",
  });
}

export async function searchYuxiLibrary(filters: {
  query: string;
  businessLine?: YuxiBusinessLine | null;
  category?: string | null;
  dbId?: string | null;
  topKPerKb?: number;
  maxKbs?: number;
}): Promise<YuxiSearchResponse> {
  // presales-dev keeps the cross-library /api/presales/library/search (grouped results).
  // db_ids carries the kb_id VALUE (same as the databases adapter surfaces as db_id).
  return yuxiRequest<YuxiSearchResponse>("/api/presales/library/search", {
    method: "POST",
    body: JSON.stringify({
      query: filters.query,
      business_lines: filters.businessLine ? [filters.businessLine] : null,
      categories: filters.category ? [filters.category] : null,
      db_ids: filters.dbId ? [filters.dbId] : null,
      top_k_per_kb: filters.topKPerKb ?? 5,
      max_kbs: filters.maxKbs ?? 10,
    }),
  });
}

export async function uploadYuxiKnowledgeFile(file: File, dbId?: string | null): Promise<YuxiUploadResponse> {
  const form = new FormData();
  form.set("file", file, file.name);
  // New Yuxi keys the upload target by kb_id (was db_id).
  const suffix = dbId ? `?kb_id=${encodeURIComponent(dbId)}` : "";
  return yuxiRequest<YuxiUploadResponse>(`/api/knowledge/files/upload${suffix}`, {
    method: "POST",
    body: form,
  });
}

export async function fetchYuxiKnowledgeUrl(url: string, dbId?: string | null): Promise<YuxiUploadResponse> {
  return yuxiRequest<YuxiUploadResponse>("/api/knowledge/files/fetch-url", {
    method: "POST",
    body: JSON.stringify({
      url,
      kb_id: dbId ?? null,
    }),
  });
}

export async function processYuxiKnowledgeDocuments(
  dbId: string,
  items: string[],
  params: Record<string, unknown> = {},
): Promise<YuxiKnowledgeProcessResponse> {
  return yuxiRequest<YuxiKnowledgeProcessResponse>(`/api/knowledge/databases/${encodeURIComponent(dbId)}/documents`, {
    method: "POST",
    body: JSON.stringify({
      items,
      params: {
        content_type: "file",
        auto_index: true,
        ...params,
      },
    }),
  });
}

export async function parseYuxiKnowledgeDocuments(dbId: string, fileIds: string[]): Promise<YuxiKnowledgeProcessResponse> {
  return yuxiRequest<YuxiKnowledgeProcessResponse>(
    `/api/knowledge/databases/${encodeURIComponent(dbId)}/documents/parse`,
    {
      method: "POST",
      body: JSON.stringify(fileIds),
    },
  );
}

export async function indexYuxiKnowledgeDocuments(
  dbId: string,
  fileIds: string[],
  params: Record<string, unknown> = {},
): Promise<YuxiKnowledgeProcessResponse> {
  return yuxiRequest<YuxiKnowledgeProcessResponse>(
    `/api/knowledge/databases/${encodeURIComponent(dbId)}/documents/index`,
    {
      method: "POST",
      body: JSON.stringify({ file_ids: fileIds, params }),
    },
  );
}

export async function batchDeleteYuxiKnowledgeDocuments(
  dbId: string,
  fileIds: string[],
): Promise<Record<string, unknown>> {
  return yuxiRequest<Record<string, unknown>>(
    `/api/knowledge/databases/${encodeURIComponent(dbId)}/documents/batch`,
    {
      method: "DELETE",
      body: JSON.stringify(fileIds),
    },
  );
}

export async function createYuxiKnowledgeFolder(
  dbId: string,
  folderName: string,
  parentId?: string | null,
): Promise<YuxiKnowledgeFolderResponse> {
  return yuxiRequest<YuxiKnowledgeFolderResponse>(
    `/api/knowledge/databases/${encodeURIComponent(dbId)}/folders`,
    {
      method: "POST",
      body: JSON.stringify({
        folder_name: folderName,
        parent_id: parentId ?? null,
      }),
    },
  );
}

export async function moveYuxiKnowledgeDocument(
  dbId: string,
  docId: string,
  newParentId: string | null,
): Promise<Record<string, unknown>> {
  return yuxiRequest<Record<string, unknown>>(
    `/api/knowledge/databases/${encodeURIComponent(dbId)}/documents/${encodeURIComponent(docId)}/move`,
    {
      method: "PUT",
      body: JSON.stringify({ new_parent_id: newParentId }),
    },
  );
}

export async function getYuxiKnowledgeDocumentDetail(file: YuxiLibraryDocument): Promise<YuxiKnowledgeDocumentDetail> {
  if (!file.db_id || !file.file_id) {
    throw new Error("缺少资料库或文件信息，无法查看资料详情");
  }
  return yuxiRequest<YuxiKnowledgeDocumentDetail>(
    `/api/knowledge/databases/${encodeURIComponent(file.db_id)}/documents/${encodeURIComponent(file.file_id)}`,
  );
}

export async function deleteYuxiKnowledgeDocument(file: YuxiLibraryDocument): Promise<Record<string, unknown>> {
  if (!file.db_id || !file.file_id) {
    throw new Error("缺少资料库或文件信息，无法删除");
  }
  return yuxiRequest<Record<string, unknown>>(
    `/api/knowledge/databases/${encodeURIComponent(file.db_id)}/documents/${encodeURIComponent(file.file_id)}`,
    { method: "DELETE" },
  );
}

export async function downloadYuxiKnowledgeDocument(file: YuxiLibraryDocument): Promise<Blob> {
  if (!file.db_id || !file.file_id) {
    throw new Error("缺少资料库或文件信息，无法下载");
  }
  return yuxiRequest<Blob>(
    `/api/knowledge/databases/${encodeURIComponent(file.db_id)}/documents/${encodeURIComponent(file.file_id)}/download`,
    {},
    "blob",
  );
}
