import { HICODEX_DESKTOP_CONFIG_KEYS, readMigratedStorageValue } from "../state/hicodex-desktop-namespace";
import { isYuxiMockEnabled, resolveYuxiMock } from "./yuxi-mock";

export const DEFAULT_YUXI_BASE_URL = "http://127.0.0.1:5050";
export const YUXI_CONNECTION_STORAGE_KEY = HICODEX_DESKTOP_CONFIG_KEYS.yuxiConnection;

export type YuxiBusinessLine = "training_presales" | "bidding";
export type YuxiEntityType =
  | "teacher"
  | "course"
  | "case"
  | "customer"
  | "bid_project"
  | "bid_requirement"
  | "bid_risk"
  | "bid_competitor"
  | "bid_template";

export interface YuxiConnectionConfig {
  baseUrl: string;
  token: string;
}

export interface YuxiCategoryMeta {
  key: string;
  label: string;
  line: YuxiBusinessLine;
  kind: "instructor" | "course" | "case" | "customer" | "proposal" | "bid";
  description: string;
}

export const YUXI_CATEGORIES: readonly YuxiCategoryMeta[] = [
  { key: "lecturer", label: "讲师库", line: "training_presales", kind: "instructor", description: "讲师简介、专长、报价、可授课方向相关资料" },
  { key: "course", label: "课程库", line: "training_presales", kind: "course", description: "课程大纲、教学设计、目标人群、学时、活动安排" },
  { key: "case", label: "案例库", line: "training_presales", kind: "case", description: "已结案项目复盘、行业案例、客户反馈摘要" },
  { key: "customer", label: "客户与行业库", line: "training_presales", kind: "customer", description: "客户背景、行业研究、沟通纪要、组织架构" },
  { key: "proposal", label: "方案素材库", line: "training_presales", kind: "proposal", description: "已出过的方案文档、模板、章节素材" },
  { key: "bid_info", label: "招标信息库", line: "bidding", kind: "bid", description: "公开招标公告、采购需求书、资格预审文件" },
  { key: "bid_win", label: "历史赢标案例库", line: "bidding", kind: "bid", description: "过往赢标标书、关键应答内容、得分情况" },
  { key: "bid_template", label: "标书模板库", line: "bidding", kind: "bid", description: "标书模板、章节骨架、通用应答模板" },
  { key: "bid_risk", label: "废标风险库", line: "bidding", kind: "bid", description: "历史废标原因、合规风险点、低价异常情况" },
  { key: "bid_intel", label: "竞品谍报库", line: "bidding", kind: "bid", description: "竞争对手报价、技术方案、过往中标情况" },
  { key: "bid_review", label: "投标复盘库", line: "bidding", kind: "bid", description: "投标后复盘、得分构成、改进点" },
] as const;

export interface YuxiLibraryGovernance {
  ownerRole: string;
  updateRule: string;
  authorityRule: string;
  citationScope: string;
  qualityMetrics: readonly string[];
  externalSystems: readonly string[];
  uploadChecklist: readonly string[];
  matchSignals: readonly string[];
}

export const YUXI_LIBRARY_GOVERNANCE: Readonly<Record<string, YuxiLibraryGovernance>> = {
  lecturer: {
    ownerRole: "讲师运营 / 售前负责人",
    updateRule: "资料变化、报价变化、服务反馈后更新",
    authorityRule: "讲师后台为主，业务上传资料进入待确认",
    citationScope: "讲师推荐、方案包装、项目复盘",
    qualityMetrics: ["专长完整", "报价有效", "反馈可追溯"],
    externalSystems: ["讲师系统", "项目系统"],
    uploadChecklist: ["讲师姓名", "专长方向", "报价或合作方式", "可授课程", "来源证明"],
    matchSignals: ["行业经验", "课程匹配度", "反馈分", "报价区间"],
  },
  course: {
    ownerRole: "产品 / 课程运营",
    updateRule: "课程大纲、课时、适用对象变化后更新",
    authorityRule: "课程系统为主，历史方案补充应用场景",
    citationScope: "课程匹配、方案目录、售前答疑",
    qualityMetrics: ["大纲完整", "适用对象明确", "讲师关系完整"],
    externalSystems: ["课程系统", "讲师系统"],
    uploadChecklist: ["课程名称", "课程大纲", "目标人群", "学时", "可授讲师"],
    matchSignals: ["主题标签", "目标人群", "课时", "历史采购"],
  },
  case: {
    ownerRole: "项目运营 / 售前负责人",
    updateRule: "项目结束、客户反馈、复盘完成后更新",
    authorityRule: "项目复盘为主，方案资料补充可复用章节",
    citationScope: "相似案例、方案佐证、客户背书",
    qualityMetrics: ["客户行业明确", "结果可证明", "可复用点清楚"],
    externalSystems: ["项目系统", "CRM"],
    uploadChecklist: ["客户名称", "行业", "项目目标", "实施结果", "客户反馈"],
    matchSignals: ["行业相似", "目标相似", "规模相似", "复用素材"],
  },
  customer: {
    ownerRole: "销售 / 客户成功",
    updateRule: "客户组织、联系人、合作状态变化后更新",
    authorityRule: "CRM 为主，访谈纪要补充业务语境",
    citationScope: "客户洞察、行业背景、历史合作",
    qualityMetrics: ["客户名称统一", "行业标签准确", "历史关系完整"],
    externalSystems: ["CRM", "项目系统"],
    uploadChecklist: ["客户名称", "行业", "组织背景", "历史项目", "来源时间"],
    matchSignals: ["行业", "合作历史", "采购课程", "联系人角色"],
  },
  proposal: {
    ownerRole: "售前方案组",
    updateRule: "方案输出、版本复用、客户反馈后沉淀",
    authorityRule: "最新已交付版本为主，旧版本保留引用证据",
    citationScope: "方案生成、章节复用、内容包装",
    qualityMetrics: ["版本清楚", "客户场景明确", "可复用章节标注"],
    externalSystems: ["项目系统", "文件系统"],
    uploadChecklist: ["客户/行业", "方案场景", "版本", "可复用章节", "使用限制"],
    matchSignals: ["行业", "场景", "章节类型", "成功反馈"],
  },
  bid_info: {
    ownerRole: "投标经理",
    updateRule: "公告、答疑、澄清文件发布后更新",
    authorityRule: "招投标平台原文为主，人工摘要可辅助",
    citationScope: "拆标、资格审查、投标策略",
    qualityMetrics: ["公告完整", "截止时间明确", "资格条件提取"],
    externalSystems: ["招投标平台", "项目系统"],
    uploadChecklist: ["项目名称", "采购人", "截止时间", "资格条件", "评分办法"],
    matchSignals: ["行业", "采购范围", "资格要求", "评分权重"],
  },
  bid_win: {
    ownerRole: "投标经理 / 标书负责人",
    updateRule: "中标结果、评分反馈、复盘结论后更新",
    authorityRule: "中标归档材料为主，复盘补充经验",
    citationScope: "标书复用、评分策略、赢标证明",
    qualityMetrics: ["中标证据", "评分点清楚", "可复用章节"],
    externalSystems: ["项目系统", "投标平台"],
    uploadChecklist: ["项目名称", "中标结果", "评分项", "关键应答", "复用限制"],
    matchSignals: ["行业", "采购范围", "评分项", "章节命中"],
  },
  bid_template: {
    ownerRole: "标书中心",
    updateRule: "模板升级、格式要求变化后更新",
    authorityRule: "标书中心模板为主，项目模板需确认后推广",
    citationScope: "标书生成、章节骨架、格式校验",
    qualityMetrics: ["模板版本", "适用范围", "格式合规"],
    externalSystems: ["标书系统", "文件系统"],
    uploadChecklist: ["模板类型", "适用场景", "版本", "必填章节", "格式要求"],
    matchSignals: ["采购类型", "章节类型", "格式要求", "版本有效性"],
  },
  bid_risk: {
    ownerRole: "投标质控 / 法务",
    updateRule: "废标、澄清、合规问题发生后更新",
    authorityRule: "质控确认记录为主，案例归档作证据",
    citationScope: "废标风险检查、合规审查、投前提醒",
    qualityMetrics: ["风险分类", "触发条件", "处置建议"],
    externalSystems: ["投标平台", "法务系统"],
    uploadChecklist: ["风险类型", "触发条件", "后果", "处置建议", "来源案例"],
    matchSignals: ["资格条款", "格式要求", "价格异常", "历史废标点"],
  },
  bid_intel: {
    ownerRole: "市场 / 投标策略",
    updateRule: "竞品中标、报价、方案变化后更新",
    authorityRule: "公开来源和复盘证据优先，传闻需低权重",
    citationScope: "竞品分析、投标策略、价格判断",
    qualityMetrics: ["来源可信", "时间有效", "竞品维度完整"],
    externalSystems: ["招投标平台", "市场情报"],
    uploadChecklist: ["竞品名称", "项目", "报价/方案", "来源", "时间"],
    matchSignals: ["竞品", "行业", "价格区间", "技术路线"],
  },
  bid_review: {
    ownerRole: "投标经理 / 复盘负责人",
    updateRule: "每次投标结束后补充复盘",
    authorityRule: "项目复盘结论为主，过程材料作证据",
    citationScope: "投标策略、风险复盘、后续改进",
    qualityMetrics: ["得失原因", "改进动作", "责任归属"],
    externalSystems: ["项目系统", "投标平台"],
    uploadChecklist: ["项目名称", "结果", "得分", "问题原因", "改进动作"],
    matchSignals: ["评分项", "失败原因", "客户类型", "改进建议"],
  },
};

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
  updated_at?: string | null;
  uploaded_by?: string | null;
  uploader?: string | null;
  created_by?: string | null;
  batch_id?: string | null;
  content_hash?: string | null;
  duplicate_status?: string | null;
  pending_reason?: string | null;
  chunk_count?: number | null;
  page_count?: number | null;
}

export interface YuxiLibraryDocumentsResponse {
  items?: YuxiLibraryDocument[];
  total?: number;
}

export interface YuxiKnowledgeDatabase {
  db_id?: string | null;
  name?: string | null;
  description?: string | null;
  business_line?: string | null;
  category?: string | null;
  kb_type?: string | null;
  row_count?: number | null;
  file_count?: number | null;
  status?: string | null;
  created_at?: string | null;
  updated_at?: string | null;
  share_config?: Record<string, unknown> | null;
  additional_params?: Record<string, unknown> | null;
  embed_info?: Record<string, unknown> | null;
}

export interface YuxiKnowledgeDatabaseInput {
  database_name: string;
  description: string;
  embed_model_name?: string | null;
  kb_type?: string;
  additional_params?: Record<string, unknown>;
  llm_info?: Record<string, unknown> | null;
  share_config?: Record<string, unknown> | null;
  business_line?: YuxiBusinessLine | null;
  category?: string | null;
}

export interface YuxiKnowledgeDatabaseUpdate {
  name: string;
  description: string;
  llm_info?: Record<string, unknown> | null;
  additional_params?: Record<string, unknown> | null;
  share_config?: Record<string, unknown> | null;
}

export interface YuxiKnowledgeDatabasesResponse {
  databases?: YuxiKnowledgeDatabase[];
  message?: string;
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

export interface YuxiScoringDimension {
  key?: string;
  label?: string;
  weight?: number;
  desc?: string;
}

export interface YuxiScoringTemplate {
  id?: number;
  template_id?: number;
  name?: string;
  business_line?: string | null;
  version?: string | null;
  dimensions?: YuxiScoringDimension[];
  risk_cap?: number | null;
  status?: string | null;
}

export interface YuxiScoringRule {
  id?: number;
  rule_id?: number;
  rule_type?: string | null;
  name?: string;
  business_line?: string | null;
  condition?: unknown;
  action?: Record<string, unknown> | null;
  explanation?: string | null;
  configured_by?: string | null;
  enabled?: boolean;
}

export interface YuxiScoringTemplateInput {
  name: string;
  business_line: YuxiBusinessLine | string;
  version?: string | null;
  dimensions: YuxiScoringDimension[];
  risk_cap?: number | null;
  status?: string | null;
}

export interface YuxiScoringTemplatePatch {
  name?: string;
  version?: string | null;
  dimensions?: YuxiScoringDimension[];
  risk_cap?: number | null;
  status?: string | null;
}

export interface YuxiScoringRuleInput {
  rule_type: "veto" | "deduct" | "bonus" | "tag_merge" | string;
  name: string;
  business_line?: YuxiBusinessLine | string | null;
  condition?: unknown;
  action?: Record<string, unknown> | null;
  explanation?: string | null;
  configured_by?: string | null;
  enabled?: boolean;
}

export type YuxiScoringRulePatch = Partial<YuxiScoringRuleInput>;

export interface YuxiScoringTemplatesResponse {
  items?: YuxiScoringTemplate[];
}

export interface YuxiScoringRulesResponse {
  items?: YuxiScoringRule[];
}

export interface YuxiUploadResponse {
  file_path?: string;
  minio_path?: string;
  db_id?: string | null;
  content_hash?: string;
  filename?: string;
  original_filename?: string;
  final_url?: string;
  size?: number;
  has_same_name?: boolean;
  same_name_files?: unknown[];
}

export interface YuxiKnowledgeProcessResponse {
  message?: string;
  status?: string;
  task_id?: string;
  items?: unknown[];
  [key: string]: unknown;
}

export interface YuxiTask {
  id?: string;
  name?: string;
  type?: string;
  status?: "pending" | "running" | "success" | "failed" | "cancelled" | string;
  progress?: number;
  message?: string;
  created_at?: string | null;
  updated_at?: string | null;
  started_at?: string | null;
  completed_at?: string | null;
  payload?: Record<string, unknown>;
  result?: unknown;
  error?: string | null;
  cancel_requested?: boolean;
}

export interface YuxiTaskResponse {
  task?: YuxiTask;
}

export interface YuxiTasksResponse {
  tasks?: YuxiTask[];
  summary?: {
    total?: number;
    filtered_total?: number;
    status_counts?: Record<string, number>;
    type_counts?: Record<string, number>;
  };
}

export interface YuxiKnowledgeQueryParamsResponse {
  params?: Record<string, unknown>;
  message?: string;
}

export interface YuxiKnowledgeSampleQuestionsResponse {
  message?: string;
  questions?: string[];
  count?: number;
  db_id?: string;
  db_name?: string;
}

export interface YuxiSupportedFileTypesResponse {
  message?: string;
  file_types?: string[];
}

export interface YuxiKnowledgeTypesResponse {
  message?: string;
  kb_types?: Record<string, unknown>;
}

export interface YuxiKnowledgeStatsResponse {
  message?: string;
  stats?: {
    total_databases?: number;
    total_files?: number;
    kb_types?: Record<string, number>;
    [key: string]: unknown;
  };
}

export interface YuxiEmbeddingModelsStatusResponse {
  message?: string;
  status?: {
    total?: number;
    available?: number;
    models?: Record<string, unknown>;
    [key: string]: unknown;
  };
}

export interface YuxiMcpServer {
  name?: string;
  description?: string | null;
  transport?: string | null;
  url?: string | null;
  command?: string | null;
  args?: string[] | null;
  tags?: string[] | null;
  icon?: string | null;
  enabled?: boolean;
  disabled_tools?: string[] | null;
  created_at?: string | null;
  updated_at?: string | null;
  [key: string]: unknown;
}

export interface YuxiMcpServerPayload {
  name?: string;
  transport?: string | null;
  url?: string | null;
  command?: string | null;
  args?: string[] | null;
  env?: Record<string, string> | null;
  description?: string | null;
  headers?: Record<string, string> | null;
  timeout?: number | null;
  sse_read_timeout?: number | null;
  tags?: string[] | null;
  icon?: string | null;
}

export interface YuxiMcpServersResponse {
  success?: boolean;
  data?: YuxiMcpServer[];
  message?: string;
}

export interface YuxiMcpServerTestResponse {
  success?: boolean;
  message?: string;
  tool_count?: number;
  [key: string]: unknown;
}

export interface YuxiMcpServerStatusResponse {
  success?: boolean;
  enabled?: boolean;
  data?: YuxiMcpServer;
  message?: string;
}

export interface YuxiMcpTool {
  name?: string;
  id?: string;
  description?: string;
  enabled?: boolean;
  parameters?: Record<string, unknown>;
  required?: string[];
}

export interface YuxiMcpToolsResponse {
  success?: boolean;
  data?: YuxiMcpTool[];
  total?: number;
  message?: string;
  tool_count?: number;
  enabled_count?: number;
  disabled_count?: number;
}

export interface YuxiPresalesStatsResponse {
  entities?: {
    by_type?: Record<string, number>;
    total?: number;
  };
  pending?: YuxiPendingCountResponse;
  scoring?: {
    templates?: number;
    rules?: number;
  };
  [key: string]: unknown;
}

export interface YuxiKnowledgeQueryTestResponse {
  result?: unknown;
  status?: string;
  message?: string;
  [key: string]: unknown;
}

export interface YuxiFileAnalysisTag {
  group?: string;
  name?: string;
  confidence?: number;
}

export interface YuxiFileAnalysisEntity {
  entity_type?: string;
  canonical_name?: string;
  aliases?: string[];
  attributes?: Record<string, unknown>;
  confidence?: number;
  extracted_text?: string;
  chunk_id?: string | null;
}

export interface YuxiFileAnalysisResponse {
  status?: string;
  db_id?: string;
  file_id?: string;
  summary?: string;
  tags?: YuxiFileAnalysisTag[];
  risks?: string[];
  entities?: YuxiFileAnalysisEntity[];
}

export interface YuxiHydeQuestionsResponse {
  status?: string;
  db_id?: string;
  file_id?: string;
  questions?: string[];
}

export interface YuxiRecommendResponse {
  status?: string;
  query?: string;
  entity_type?: string;
  template?: YuxiScoringTemplate;
  ranked?: Array<{
    rank?: number | null;
    name?: string | null;
    entity_id?: number | null;
    entity_type?: string | null;
    weighted?: number;
    deductions?: number;
    bonuses?: number;
    final?: number;
    result?: string;
    vetoed?: boolean;
    veto_reason?: string | null;
    sub_detail?: Array<{ key?: string; label?: string; raw?: number; weight?: number; contrib?: number }>;
    triggered_rules?: Array<{ type?: string; rule?: string; points?: number }>;
  }>;
}

export interface YuxiEvaluationResponse<T = unknown> {
  message?: string;
  data?: T;
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
  entity_id?: number;
  canonical_name?: string;
  reasons?: string[];
}

export type YuxiPendingQueue = "classify" | "entity" | "dup" | "force";

export interface YuxiPendingItem {
  id?: number;
  file_path?: string | null;
  filename?: string | null;
  file_size?: number | null;
  candidates?: YuxiClassifyCandidate[] | null;
  suggested_db_id?: string | null;
  confirmed_db_id?: string | null;
  business_line_hint?: string | null;
  scenario_hint?: string | null;
  source_db_id?: string | null;
  source_file_id?: string | null;
  source_chunk_id?: string | null;
  target_db_id?: string | null;
  collision_file_id?: string | null;
  similarity?: number | null;
  similarity_breakdown?: Record<string, unknown> | null;
  failure_reason?: string | null;
  extracted_text?: string | null;
  extracted_attrs?: Record<string, unknown> | null;
  candidate_entity_type?: string | null;
  suggested_entity_id?: number | null;
  confirmed_entity_id?: number | null;
  manual_db_id?: string | null;
  status?: string | null;
  created_at?: string | null;
}

export interface YuxiConflictItem {
  id?: number;
  entity_id?: number;
  incoming_attrs?: Record<string, unknown> | null;
  diffs?: YuxiEntityAttributeDiff[] | null;
  source_db_id?: string | null;
  source_file_id?: string | null;
  status?: string | null;
  uploaded_by?: string | null;
  resolved_by?: string | null;
  resolved_fields?: Record<string, unknown> | null;
  created_at?: string | null;
  resolved_at?: string | null;
}

export interface YuxiPendingListResponse {
  items?: YuxiPendingItem[];
  total?: number;
}

export interface YuxiConflictListResponse {
  items?: YuxiConflictItem[];
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

export interface YuxiEntityReference {
  db_id?: string | null;
  file_id?: string | null;
  chunk_id?: string | null;
  relation?: string | null;
  confidence?: number | null;
  extracted_text?: string | null;
  created_at?: string | null;
  file_meta?: { filename?: string | null } | null;
}

export interface YuxiEntityDetail extends YuxiEntity {
  references?: YuxiEntityReference[];
}

export interface YuxiEntityMutationPayload {
  entity_type?: YuxiEntityType | string;
  canonical_name?: string;
  description?: string | null;
  aliases?: string[] | null;
  attributes?: Record<string, unknown> | null;
  authority_status?: string | null;
}

export interface YuxiRelatedEntity {
  id?: number;
  canonical_name?: string | null;
  entity_type?: string | null;
  co_occurrence?: number;
}

export interface YuxiEntityRelatedResponse {
  entity_id?: number;
  entity_type?: string | null;
  related?: Record<string, YuxiRelatedEntity[]>;
}

export interface YuxiEntityHistoryEntry {
  id?: number;
  change_type?: string | null;
  field?: string | null;
  old_value?: unknown;
  new_value?: unknown;
  operator_id?: string | null;
  reason?: string | null;
  created_at?: string | null;
}

export interface YuxiEntityHistoryResponse {
  entity_id?: number;
  history?: YuxiEntityHistoryEntry[];
}

export interface YuxiEntityAttributeDiff {
  field?: string;
  change?: "added" | "changed" | string;
  old?: unknown;
  new?: unknown;
}

export interface YuxiEntityAttributeDiffResponse {
  entity_id?: number;
  diffs?: YuxiEntityAttributeDiff[];
}

export interface YuxiKnowledgeDocumentChunk {
  id?: string;
  chunk_id?: string;
  chunk_order_index?: number;
  chunk_index?: number;
  content?: string;
  tokens?: number;
  [key: string]: unknown;
}

export interface YuxiKnowledgeDocumentDetail {
  meta?: Record<string, unknown> | null;
  lines?: YuxiKnowledgeDocumentChunk[];
  content?: string | null;
  message?: string;
  status?: string;
  [key: string]: unknown;
}

export interface YuxiKnowledgeFolderResponse {
  id?: string | null;
  folder_id?: string | null;
  file_id?: string | null;
  doc_id?: string | null;
  name?: string | null;
  [key: string]: unknown;
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

export function yuxiLibraryGovernance(category: string | null | undefined): YuxiLibraryGovernance | null {
  if (!category) return null;
  return YUXI_LIBRARY_GOVERNANCE[category] ?? null;
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
  if (value === "bid_project") return "投标项目";
  if (value === "bid_requirement") return "招标要求";
  if (value === "bid_risk") return "风险点";
  if (value === "bid_competitor") return "竞品";
  if (value === "bid_template") return "标书模板";
  return value || "实体";
}

export async function listYuxiLibraryDocuments(
  filters: {
    businessLine?: YuxiBusinessLine | null;
    category?: string | null;
    dbId?: string | null;
    limit?: number;
    offset?: number;
  } = {},
): Promise<YuxiLibraryDocumentsResponse> {
  const params = new URLSearchParams();
  if (filters.businessLine) params.set("business_line", filters.businessLine);
  if (filters.category) params.set("category", filters.category);
  if (filters.dbId) params.set("db_id", filters.dbId);
  params.set("limit", String(filters.limit ?? 200));
  params.set("offset", String(filters.offset ?? 0));
  return yuxiRequest<YuxiLibraryDocumentsResponse>(`/api/presales/library/documents?${params.toString()}`);
}

export async function listYuxiKnowledgeDatabases(): Promise<YuxiKnowledgeDatabasesResponse> {
  return yuxiRequest<YuxiKnowledgeDatabasesResponse>("/api/knowledge/databases");
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

export async function getYuxiPresalesStats(): Promise<YuxiPresalesStatsResponse> {
  return yuxiRequest<YuxiPresalesStatsResponse>("/api/presales/stats");
}

export async function listYuxiMcpServers(): Promise<YuxiMcpServersResponse> {
  return yuxiRequest<YuxiMcpServersResponse>("/api/system/mcp-servers");
}

export async function createYuxiMcpServer(payload: YuxiMcpServerPayload): Promise<YuxiMcpServerStatusResponse> {
  return yuxiRequest<YuxiMcpServerStatusResponse>("/api/system/mcp-servers", {
    method: "POST",
    body: JSON.stringify(payload),
  });
}

export async function updateYuxiMcpServer(name: string, payload: YuxiMcpServerPayload): Promise<YuxiMcpServerStatusResponse> {
  return yuxiRequest<YuxiMcpServerStatusResponse>(`/api/system/mcp-servers/${encodeURIComponent(name)}`, {
    method: "PUT",
    body: JSON.stringify(payload),
  });
}

export async function deleteYuxiMcpServer(name: string): Promise<Record<string, unknown>> {
  return yuxiRequest<Record<string, unknown>>(`/api/system/mcp-servers/${encodeURIComponent(name)}`, {
    method: "DELETE",
  });
}

export async function testYuxiMcpServer(name: string): Promise<YuxiMcpServerTestResponse> {
  return yuxiRequest<YuxiMcpServerTestResponse>(`/api/system/mcp-servers/${encodeURIComponent(name)}/test`, {
    method: "POST",
    body: JSON.stringify({}),
  });
}

export async function setYuxiMcpServerStatus(
  name: string,
  enabled: boolean,
): Promise<YuxiMcpServerStatusResponse> {
  return yuxiRequest<YuxiMcpServerStatusResponse>(`/api/system/mcp-servers/${encodeURIComponent(name)}/status`, {
    method: "PUT",
    body: JSON.stringify({ enabled }),
  });
}

export async function listYuxiMcpTools(name: string): Promise<YuxiMcpToolsResponse> {
  return yuxiRequest<YuxiMcpToolsResponse>(`/api/system/mcp-servers/${encodeURIComponent(name)}/tools`);
}

export async function refreshYuxiMcpTools(name: string): Promise<YuxiMcpToolsResponse> {
  return yuxiRequest<YuxiMcpToolsResponse>(`/api/system/mcp-servers/${encodeURIComponent(name)}/tools/refresh`, {
    method: "POST",
    body: JSON.stringify({}),
  });
}

export async function toggleYuxiMcpTool(
  name: string,
  toolName: string,
): Promise<YuxiMcpToolsResponse> {
  return yuxiRequest<YuxiMcpToolsResponse>(
    `/api/system/mcp-servers/${encodeURIComponent(name)}/tools/${encodeURIComponent(toolName)}/toggle`,
    {
      method: "PUT",
      body: JSON.stringify({}),
    },
  );
}

export async function createYuxiKnowledgeDatabase(payload: YuxiKnowledgeDatabaseInput): Promise<YuxiKnowledgeDatabase> {
  return yuxiRequest<YuxiKnowledgeDatabase>("/api/knowledge/databases", {
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
  });
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

export async function uploadYuxiKnowledgeFile(file: File, dbId?: string | null): Promise<YuxiUploadResponse> {
  const form = new FormData();
  form.set("file", file, file.name);
  const suffix = dbId ? `?db_id=${encodeURIComponent(dbId)}` : "";
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
      db_id: dbId ?? null,
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

async function yuxiRequest<T>(
  path: string,
  init: RequestInit = {},
  responseType: "json" | "blob" = "json",
): Promise<T> {
  const config = readYuxiConnectionConfig();
  if (responseType === "json" && isYuxiMockEnabled(config)) {
    const mocked = resolveYuxiMock<T>(path, init);
    if (mocked !== undefined) return mocked;
  }
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
  if (status === 401) return detailText || "系统未认证，请配置访问令牌";
  if (status === 403) return detailText || "当前账号没有权限访问 Yuxi 资料库";
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
