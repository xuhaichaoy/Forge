import { yuxiRequest } from "./yuxi-request";
import type {
  YuxiBusinessLine,
  YuxiEntityType,
  YuxiScoringTemplateInput,
  YuxiScoringTemplatePatch,
  YuxiScoringRuleInput,
  YuxiScoringRulePatch,
  YuxiScoringTemplatesResponse,
  YuxiScoringRulesResponse,
  YuxiPresalesStatsResponse,
  YuxiFileAnalysisResponse,
  YuxiHydeQuestionsResponse,
  YuxiRecommendResponse,
  YuxiIntakeResponse,
  YuxiPendingQueue,
  YuxiPendingListResponse,
  YuxiConflictListResponse,
  YuxiPendingCountResponse,
  YuxiEntityListResponse,
  YuxiEntityDetail,
  YuxiEntityMutationPayload,
  YuxiEntityRelatedResponse,
  YuxiEntityHistoryResponse,
  YuxiEntityAttributeDiffResponse,
} from "./yuxi-types";

export async function getYuxiPresalesStats(): Promise<YuxiPresalesStatsResponse> {
  return yuxiRequest<YuxiPresalesStatsResponse>("/api/presales/stats");
}

export async function listYuxiScoringTemplates(filters: {
  businessLine?: YuxiBusinessLine | null;
} = {}): Promise<YuxiScoringTemplatesResponse> {
  const params = new URLSearchParams();
  if (filters.businessLine) params.set("business_line", filters.businessLine);
  const query = params.toString();
  const suffix = query ? `?${query}` : "";
  return yuxiRequest<YuxiScoringTemplatesResponse>(`/api/presales/scoring/templates${suffix}`);
}

export async function listYuxiScoringRules(filters: {
  businessLine?: YuxiBusinessLine | null;
  enabledOnly?: boolean;
} = {}): Promise<YuxiScoringRulesResponse> {
  const params = new URLSearchParams();
  if (filters.businessLine) params.set("business_line", filters.businessLine);
  if (filters.enabledOnly) params.set("enabled_only", "true");
  const query = params.toString();
  const suffix = query ? `?${query}` : "";
  return yuxiRequest<YuxiScoringRulesResponse>(`/api/presales/scoring/rules${suffix}`);
}

export async function createYuxiScoringTemplate(payload: YuxiScoringTemplateInput): Promise<{ template_id?: number }> {
  return yuxiRequest<{ template_id?: number }>("/api/presales/scoring/templates", {
    method: "POST",
    body: JSON.stringify(payload),
  });
}

export async function updateYuxiScoringTemplate(
  templateId: number,
  payload: YuxiScoringTemplatePatch,
): Promise<{ template_id?: number }> {
  return yuxiRequest<{ template_id?: number }>(`/api/presales/scoring/templates/${templateId}`, {
    method: "PUT",
    body: JSON.stringify(payload),
  });
}

export async function createYuxiScoringRule(payload: YuxiScoringRuleInput): Promise<{ rule_id?: number }> {
  return yuxiRequest<{ rule_id?: number }>("/api/presales/scoring/rules", {
    method: "POST",
    body: JSON.stringify(payload),
  });
}

export async function updateYuxiScoringRule(
  ruleId: number,
  payload: YuxiScoringRulePatch,
): Promise<{ rule_id?: number }> {
  return yuxiRequest<{ rule_id?: number }>(`/api/presales/scoring/rules/${ruleId}`, {
    method: "PUT",
    body: JSON.stringify(payload),
  });
}

export async function deleteYuxiScoringRule(ruleId: number): Promise<Record<string, unknown>> {
  return yuxiRequest<Record<string, unknown>>(`/api/presales/scoring/rules/${ruleId}`, {
    method: "DELETE",
  });
}

export async function recommendYuxiPresales(payload: {
  query: string;
  entity_type: YuxiEntityType | string;
  business_line: YuxiBusinessLine | string;
  template_id?: number | null;
  top_k?: number;
}): Promise<YuxiRecommendResponse> {
  return yuxiRequest<YuxiRecommendResponse>("/api/presales/recommend", {
    method: "POST",
    body: JSON.stringify({
      query: payload.query,
      entity_type: payload.entity_type,
      business_line: payload.business_line,
      template_id: payload.template_id ?? null,
      top_k: payload.top_k ?? 10,
    }),
  });
}

export async function analyzeYuxiKnowledgeFile(payload: {
  dbId: string;
  fileId: string;
  maxChunks?: number;
}): Promise<YuxiFileAnalysisResponse> {
  return yuxiRequest<YuxiFileAnalysisResponse>("/api/presales/analyze-file", {
    method: "POST",
    body: JSON.stringify({
      db_id: payload.dbId,
      file_id: payload.fileId,
      max_chunks: payload.maxChunks ?? 8,
    }),
  });
}

export async function generateYuxiHydeQuestions(payload: {
  dbId: string;
  fileId: string;
  n?: number;
  maxChunks?: number;
}): Promise<YuxiHydeQuestionsResponse> {
  return yuxiRequest<YuxiHydeQuestionsResponse>("/api/presales/hyde-questions", {
    method: "POST",
    body: JSON.stringify({
      db_id: payload.dbId,
      file_id: payload.fileId,
      n: payload.n ?? 6,
      max_chunks: payload.maxChunks ?? 8,
    }),
  });
}

export async function intakeYuxiKnowledgeFile(payload: {
  file_path: string;
  filename: string;
  file_size: number;
  content_hash: string;
  business_line_hint?: YuxiBusinessLine | null;
  scenario_hint?: string | null;
  auto_ingest_db_id?: string | null;
}): Promise<YuxiIntakeResponse> {
  return yuxiRequest<YuxiIntakeResponse>("/api/presales/ingest/intake", {
    method: "POST",
    body: JSON.stringify(payload),
  });
}

export async function listYuxiPendingQueue(
  queue: YuxiPendingQueue,
  options: {
    scope?: "mine" | "team";
    status?: string | null;
    limit?: number;
    offset?: number;
    dbId?: string | null;
    category?: string | null;
    businessLine?: YuxiBusinessLine | null;
  } = {},
): Promise<YuxiPendingListResponse> {
  const params = new URLSearchParams();
  params.set("scope", options.scope ?? "mine");
  if (options.status != null) params.set("status", options.status);
  params.set("limit", String(options.limit ?? 50));
  params.set("offset", String(options.offset ?? 0));
  if (options.dbId) params.set("db_id", options.dbId);
  if (options.category) params.set("category", options.category);
  if (options.businessLine) params.set("business_line", options.businessLine);
  return yuxiRequest<YuxiPendingListResponse>(`/api/presales/ingest/pending/${queue}?${params.toString()}`);
}

export async function listYuxiConflicts(options: {
  status?: "pending" | "all" | "applied" | "rejected" | "skipped";
  limit?: number;
} = {}): Promise<YuxiConflictListResponse> {
  const params = new URLSearchParams();
  params.set("status", options.status ?? "pending");
  params.set("limit", String(options.limit ?? 50));
  return yuxiRequest<YuxiConflictListResponse>(`/api/presales/conflicts?${params.toString()}`);
}

export async function resolveYuxiConflict(
  pendingId: number,
  decision: "apply" | "reject" | "skip",
  options: { acceptedFields?: Record<string, unknown> | null; reason?: string | null } = {},
): Promise<Record<string, unknown>> {
  return yuxiRequest<Record<string, unknown>>(`/api/presales/conflicts/${pendingId}/resolve`, {
    method: "POST",
    body: JSON.stringify({
      decision,
      accepted_fields: options.acceptedFields ?? null,
      reason: options.reason ?? null,
    }),
  });
}

export async function countYuxiPending(options: {
  scope?: "mine" | "team";
  dbId?: string | null;
  category?: string | null;
  businessLine?: YuxiBusinessLine | null;
} = {}): Promise<YuxiPendingCountResponse> {
  const params = new URLSearchParams();
  params.set("scope", options.scope ?? "mine");
  if (options.dbId) params.set("db_id", options.dbId);
  if (options.category) params.set("category", options.category);
  if (options.businessLine) params.set("business_line", options.businessLine);
  return yuxiRequest<YuxiPendingCountResponse>(`/api/presales/ingest/pending/count?${params.toString()}`);
}

export async function confirmYuxiClassifyPending(pendingId: number, confirmedDbId: string): Promise<Record<string, unknown>> {
  return yuxiRequest<Record<string, unknown>>(`/api/presales/ingest/pending/classify/${pendingId}/confirm`, {
    method: "POST",
    body: JSON.stringify({ confirmed_db_id: confirmedDbId }),
  });
}

export async function rejectYuxiClassifyPending(pendingId: number): Promise<Record<string, unknown>> {
  return yuxiRequest<Record<string, unknown>>(`/api/presales/ingest/pending/classify/${pendingId}/reject`, {
    method: "POST",
    body: JSON.stringify({}),
  });
}

export async function confirmYuxiEntityPending(
  pendingId: number,
  decision: "confirm_existing" | "create_new" | "skip",
  targetEntityId?: number | null,
): Promise<Record<string, unknown>> {
  return yuxiRequest<Record<string, unknown>>(`/api/presales/ingest/pending/entity/${pendingId}/confirm`, {
    method: "POST",
    body: JSON.stringify({
      decision,
      target_entity_id: targetEntityId ?? null,
    }),
  });
}

export async function rejectYuxiEntityPending(pendingId: number): Promise<Record<string, unknown>> {
  return yuxiRequest<Record<string, unknown>>(`/api/presales/ingest/pending/entity/${pendingId}/reject`, {
    method: "POST",
    body: JSON.stringify({}),
  });
}

export async function resolveYuxiDupPending(
  pendingId: number,
  decision: "replace" | "kept_as_copy" | "archived" | "rejected",
): Promise<Record<string, unknown>> {
  return yuxiRequest<Record<string, unknown>>(`/api/presales/ingest/pending/dup/${pendingId}/resolve`, {
    method: "POST",
    body: JSON.stringify({ decision }),
  });
}

export async function confirmYuxiForcePending(pendingId: number, manualDbId: string): Promise<Record<string, unknown>> {
  return yuxiRequest<Record<string, unknown>>(`/api/presales/ingest/pending/force/${pendingId}/confirm`, {
    method: "POST",
    body: JSON.stringify({ manual_db_id: manualDbId }),
  });
}

export async function rejectYuxiForcePending(pendingId: number): Promise<Record<string, unknown>> {
  return yuxiRequest<Record<string, unknown>>(`/api/presales/ingest/pending/force/${pendingId}/reject`, {
    method: "POST",
    body: JSON.stringify({}),
  });
}

export async function listYuxiEntities(filters: {
  type?: YuxiEntityType | null;
  query?: string | null;
  dbId?: string | null;
  category?: string | null;
  businessLine?: YuxiBusinessLine | null;
  limit?: number;
  offset?: number;
} = {}): Promise<YuxiEntityListResponse> {
  const params = new URLSearchParams();
  if (filters.type) params.set("type", filters.type);
  if (filters.query) params.set("q", filters.query);
  if (filters.dbId) params.set("db_id", filters.dbId);
  if (filters.category) params.set("category", filters.category);
  if (filters.businessLine) params.set("business_line", filters.businessLine);
  params.set("limit", String(filters.limit ?? 50));
  params.set("offset", String(filters.offset ?? 0));
  return yuxiRequest<YuxiEntityListResponse>(`/api/presales/entities?${params.toString()}`);
}

export async function getYuxiEntity(entityId: number): Promise<YuxiEntityDetail> {
  return yuxiRequest<YuxiEntityDetail>(`/api/presales/entities/${entityId}`);
}

export async function getYuxiEntityRelated(entityId: number, limit = 50): Promise<YuxiEntityRelatedResponse> {
  const params = new URLSearchParams();
  params.set("limit", String(limit));
  return yuxiRequest<YuxiEntityRelatedResponse>(
    `/api/presales/entities/${entityId}/related?${params.toString()}`,
  );
}

export async function getYuxiEntityHistory(entityId: number, limit = 100): Promise<YuxiEntityHistoryResponse> {
  const params = new URLSearchParams();
  params.set("limit", String(limit));
  return yuxiRequest<YuxiEntityHistoryResponse>(
    `/api/presales/entities/${entityId}/history?${params.toString()}`,
  );
}

export async function diffYuxiEntityAttributes(
  entityId: number,
  incoming: Record<string, unknown>,
): Promise<YuxiEntityAttributeDiffResponse> {
  return yuxiRequest<YuxiEntityAttributeDiffResponse>(`/api/presales/entities/${entityId}/attr-diff`, {
    method: "POST",
    body: JSON.stringify({ incoming }),
  });
}

export async function applyYuxiEntityAttributes(
  entityId: number,
  fields: Record<string, unknown>,
  reason?: string | null,
): Promise<Record<string, unknown>> {
  return yuxiRequest<Record<string, unknown>>(`/api/presales/entities/${entityId}/attr-apply`, {
    method: "POST",
    body: JSON.stringify({ fields, reason: reason ?? null }),
  });
}

export async function createYuxiEntity(payload: YuxiEntityMutationPayload): Promise<{ entity_id?: number }> {
  return yuxiRequest<{ entity_id?: number }>("/api/presales/entities", {
    method: "POST",
    body: JSON.stringify(payload),
  });
}

export async function updateYuxiEntity(
  entityId: number,
  payload: YuxiEntityMutationPayload,
): Promise<{ entity_id?: number }> {
  return yuxiRequest<{ entity_id?: number }>(`/api/presales/entities/${entityId}`, {
    method: "PUT",
    body: JSON.stringify(payload),
  });
}

export async function deleteYuxiEntity(entityId: number): Promise<Record<string, unknown>> {
  return yuxiRequest<Record<string, unknown>>(`/api/presales/entities/${entityId}`, {
    method: "DELETE",
  });
}

export async function mergeYuxiEntity(
  entityId: number,
  targetEntityId: number,
  mergeAttributes = true,
): Promise<Record<string, unknown>> {
  return yuxiRequest<Record<string, unknown>>(`/api/presales/entities/${entityId}/merge`, {
    method: "POST",
    body: JSON.stringify({
      target_entity_id: targetEntityId,
      merge_attributes: mergeAttributes,
    }),
  });
}

export async function refreshYuxiEntityMetrics(entityId?: number | null): Promise<Record<string, unknown>> {
  return yuxiRequest<Record<string, unknown>>("/api/presales/entities/metrics/refresh", {
    method: "POST",
    body: JSON.stringify(entityId == null ? {} : { entity_id: entityId }),
  });
}

export async function changeYuxiEntityAuthority(
  entityId: number,
  status: "authoritative" | "candidate" | "stale" | "unconfirmed" | string,
  reason?: string | null,
): Promise<Record<string, unknown>> {
  return yuxiRequest<Record<string, unknown>>(`/api/presales/entities/${entityId}/authority`, {
    method: "POST",
    body: JSON.stringify({ status, reason: reason ?? null }),
  });
}
