import { yuxiRequest } from "./yuxi-request";
import type {
  YuxiKnowledgeDatabase,
  YuxiKnowledgeDatabaseInput,
  YuxiKnowledgeDatabaseUpdate,
  YuxiKnowledgeDatabasesResponse,
  RawYuxiKnowledgeDatabase,
  YuxiKnowledgeQueryParamsResponse,
  YuxiKnowledgeSampleQuestionsResponse,
  YuxiSupportedFileTypesResponse,
  YuxiKnowledgeTypesResponse,
  YuxiKnowledgeStatsResponse,
  YuxiEmbeddingModelsStatusResponse,
  YuxiKnowledgeQueryTestResponse,
  YuxiEvaluationResponse,
} from "./yuxi-types";

export async function listYuxiKnowledgeDatabases(): Promise<YuxiKnowledgeDatabasesResponse> {
  // New knowledge router keys databases by `kb_id` (not db_id). Adapter: surface it as
  // db_id so the existing UI (and the presales endpoints, whose db_id field carries the
  // same kb_id value) stay consistent; document count is `row_count` (no file_count).
  const res = await yuxiRequest<{ databases?: RawYuxiKnowledgeDatabase[]; message?: string }>(
    "/api/knowledge/databases",
  );
  const databases = (res.databases ?? []).map(normalizeYuxiKnowledgeDatabase);
  return { databases, message: res.message };
}

export function normalizeYuxiKnowledgeDatabase(raw: RawYuxiKnowledgeDatabase): YuxiKnowledgeDatabase {
  return {
    ...raw,
    db_id: raw.kb_id ?? raw.db_id ?? null,
    name: raw.name ?? raw.database_name ?? null,
  };
}

export async function getYuxiSupportedFileTypes(): Promise<YuxiSupportedFileTypesResponse> {
  return yuxiRequest<YuxiSupportedFileTypesResponse>("/api/knowledge/files/supported-types");
}

export async function getYuxiKnowledgeTypes(): Promise<YuxiKnowledgeTypesResponse> {
  return yuxiRequest<YuxiKnowledgeTypesResponse>("/api/knowledge/types");
}

export async function getYuxiKnowledgeStats(): Promise<YuxiKnowledgeStatsResponse> {
  return yuxiRequest<YuxiKnowledgeStatsResponse>("/api/knowledge/stats");
}

export async function getYuxiEmbeddingModelsStatus(): Promise<YuxiEmbeddingModelsStatusResponse> {
  return yuxiRequest<YuxiEmbeddingModelsStatusResponse>("/api/knowledge/embedding-models/status");
}

export async function createYuxiKnowledgeDatabase(payload: YuxiKnowledgeDatabaseInput): Promise<YuxiKnowledgeDatabase> {
  const res = await yuxiRequest<RawYuxiKnowledgeDatabase | { database?: RawYuxiKnowledgeDatabase }>(
    "/api/knowledge/databases",
    {
      method: "POST",
      body: JSON.stringify({
        database_name: payload.database_name,
        description: payload.description,
        embed_model_name: payload.kb_type === "dify" ? payload.embed_model_name ?? null : payload.embed_model_name,
        kb_type: payload.kb_type ?? "lightrag",
        additional_params: payload.additional_params ?? {},
        llm_info: payload.llm_info ?? null,
        share_config: payload.share_config ?? null,
        business_line: payload.business_line ?? null,
        category: payload.category ?? null,
      }),
    },
  );
  const raw: RawYuxiKnowledgeDatabase = "database" in res && res.database
    ? res.database
    : res as RawYuxiKnowledgeDatabase;
  return normalizeYuxiKnowledgeDatabase(raw);
}

export async function updateYuxiKnowledgeDatabase(
  dbId: string,
  payload: YuxiKnowledgeDatabaseUpdate,
): Promise<{ message?: string; database?: YuxiKnowledgeDatabase }> {
  return yuxiRequest<{ message?: string; database?: YuxiKnowledgeDatabase }>(
    `/api/knowledge/databases/${encodeURIComponent(dbId)}`,
    {
      method: "PUT",
      body: JSON.stringify({
        name: payload.name,
        description: payload.description,
        llm_info: payload.llm_info ?? null,
        additional_params: payload.additional_params ?? null,
        share_config: payload.share_config ?? null,
      }),
    },
  );
}

export async function deleteYuxiKnowledgeDatabase(dbId: string): Promise<Record<string, unknown>> {
  return yuxiRequest<Record<string, unknown>>(
    `/api/knowledge/databases/${encodeURIComponent(dbId)}`,
    { method: "DELETE" },
  );
}

export async function exportYuxiKnowledgeDatabase(
  dbId: string,
  format: "csv" | "xlsx" | "md" | "txt" = "xlsx",
): Promise<Blob> {
  const params = new URLSearchParams();
  params.set("format", format);
  return yuxiRequest<Blob>(
    `/api/knowledge/databases/${encodeURIComponent(dbId)}/export?${params.toString()}`,
    {},
    "blob",
  );
}

export async function getYuxiKnowledgeQueryParams(dbId: string): Promise<YuxiKnowledgeQueryParamsResponse> {
  return yuxiRequest<YuxiKnowledgeQueryParamsResponse>(
    `/api/knowledge/databases/${encodeURIComponent(dbId)}/query-params`,
  );
}

export async function updateYuxiKnowledgeQueryParams(
  dbId: string,
  params: Record<string, unknown>,
): Promise<Record<string, unknown>> {
  return yuxiRequest<Record<string, unknown>>(
    `/api/knowledge/databases/${encodeURIComponent(dbId)}/query-params`,
    {
      method: "PUT",
      body: JSON.stringify(params),
    },
  );
}

export async function queryTestYuxiKnowledgeDatabase(payload: {
  dbId: string;
  query: string;
  meta?: Record<string, unknown>;
}): Promise<YuxiKnowledgeQueryTestResponse> {
  return yuxiRequest<YuxiKnowledgeQueryTestResponse>(
    `/api/knowledge/databases/${encodeURIComponent(payload.dbId)}/query-test`,
    {
      method: "POST",
      body: JSON.stringify({
        query: payload.query,
        meta: payload.meta ?? {},
      }),
    },
  );
}

export async function getYuxiSampleQuestions(dbId: string): Promise<YuxiKnowledgeSampleQuestionsResponse> {
  return yuxiRequest<YuxiKnowledgeSampleQuestionsResponse>(
    `/api/knowledge/databases/${encodeURIComponent(dbId)}/sample-questions`,
  );
}

export async function generateYuxiSampleQuestions(
  dbId: string,
  count = 8,
): Promise<YuxiKnowledgeSampleQuestionsResponse> {
  return yuxiRequest<YuxiKnowledgeSampleQuestionsResponse>(
    `/api/knowledge/databases/${encodeURIComponent(dbId)}/sample-questions`,
    {
      method: "POST",
      body: JSON.stringify({ count }),
    },
  );
}

export async function listYuxiEvaluationBenchmarks(dbId: string): Promise<YuxiEvaluationResponse<unknown[]>> {
  return yuxiRequest<YuxiEvaluationResponse<unknown[]>>(
    `/api/evaluation/databases/${encodeURIComponent(dbId)}/benchmarks`,
  );
}

export async function generateYuxiEvaluationBenchmark(
  dbId: string,
  params: Record<string, unknown> = {},
): Promise<YuxiEvaluationResponse<unknown>> {
  return yuxiRequest<YuxiEvaluationResponse<unknown>>(
    `/api/evaluation/databases/${encodeURIComponent(dbId)}/benchmarks/generate`,
    {
      method: "POST",
      body: JSON.stringify(params),
    },
  );
}

export async function uploadYuxiEvaluationBenchmark(
  dbId: string,
  file: File,
  name: string,
  description?: string | null,
): Promise<YuxiEvaluationResponse<unknown>> {
  const form = new FormData();
  form.set("file", file, file.name);
  form.set("name", name);
  if (description) form.set("description", description);
  return yuxiRequest<YuxiEvaluationResponse<unknown>>(
    `/api/evaluation/databases/${encodeURIComponent(dbId)}/benchmarks/upload`,
    {
      method: "POST",
      body: form,
    },
  );
}

export async function downloadYuxiEvaluationBenchmark(benchmarkId: string): Promise<Blob> {
  return yuxiRequest<Blob>(
    `/api/evaluation/benchmarks/${encodeURIComponent(benchmarkId)}/download`,
    {},
    "blob",
  );
}

export async function deleteYuxiEvaluationBenchmark(benchmarkId: string): Promise<YuxiEvaluationResponse<null>> {
  return yuxiRequest<YuxiEvaluationResponse<null>>(
    `/api/evaluation/benchmarks/${encodeURIComponent(benchmarkId)}`,
    { method: "DELETE" },
  );
}

export async function listYuxiEvaluationHistory(dbId: string): Promise<YuxiEvaluationResponse<unknown[]>> {
  return yuxiRequest<YuxiEvaluationResponse<unknown[]>>(
    `/api/evaluation/databases/${encodeURIComponent(dbId)}/history`,
  );
}

export async function listYuxiEvaluationResults(
  dbId: string,
  taskId: string,
  options: { page?: number; pageSize?: number; errorOnly?: boolean } = {},
): Promise<YuxiEvaluationResponse<unknown>> {
  const params = new URLSearchParams();
  params.set("page", String(options.page ?? 1));
  params.set("page_size", String(options.pageSize ?? 20));
  if (options.errorOnly) params.set("error_only", "true");
  return yuxiRequest<YuxiEvaluationResponse<unknown>>(
    `/api/evaluation/databases/${encodeURIComponent(dbId)}/results/${encodeURIComponent(taskId)}?${params.toString()}`,
  );
}

export async function runYuxiEvaluation(
  dbId: string,
  params: { benchmark_id?: string | null; model_config?: Record<string, unknown> } = {},
): Promise<YuxiEvaluationResponse<{ task_id?: string }>> {
  return yuxiRequest<YuxiEvaluationResponse<{ task_id?: string }>>(
    `/api/evaluation/databases/${encodeURIComponent(dbId)}/run`,
    {
      method: "POST",
      body: JSON.stringify({
        benchmark_id: params.benchmark_id ?? null,
        model_config: params.model_config ?? {},
      }),
    },
  );
}
