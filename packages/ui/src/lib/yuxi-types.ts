export type YuxiBusinessLine = "training_presales" | "bidding";
export type YuxiEntityType =
  | "teacher"
  | "course"
  | "training_requirement"
  | "case"
  | "customer"
  | "bid_project"
  | "bid_requirement"
  | "bid_risk"
  | "bid_competitor"
  | "bid_template";

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

export type RawYuxiKnowledgeDatabase = YuxiKnowledgeDatabase & {
  kb_id?: string | null;
  database_name?: string | null;
};

export interface YuxiSearchSnippet {
  text?: string;
  /** false = 语义近邻兜底（不含查询原词），渲染时标"弱相关" */
  matched?: boolean;
  filename?: string;
  file_path?: string;
  /** Yuxi 文件 ID，配合 chunk_id 可打开文件详情并定位段落 */
  file_id?: string;
  chunk_id?: string;
}

export interface YuxiSearchGroup {
  business_line?: string | null;
  category?: string | null;
  label?: string | null;
  results?: Array<{
    db_id?: string | null;
    kb_name?: string | null;
    /** Yuxi 服务端已把各 KB 异构结果规整为统一片段 */
    snippets?: YuxiSearchSnippet[];
    /** 旧字段：仅当后端未升级时存在，作降级解析用 */
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
  if (value === "training_requirement") return "培训需求";
  if (value === "case") return "案例";
  if (value === "customer") return "客户";
  if (value === "bid_project") return "投标项目";
  if (value === "bid_requirement") return "招标要求";
  if (value === "bid_risk") return "风险点";
  if (value === "bid_competitor") return "竞品";
  if (value === "bid_template") return "标书模板";
  return value || "实体";
}
