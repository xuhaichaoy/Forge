/**
 * 演示数据层（mock）。
 *
 * 当没有配置真实后端 token 时（演示态），`yuxiRequest` 会把读请求短路到这里，
 * 返回一套自洽的示例数据，让知识库 / 档案中心 / 待办在没有后端的情况下也能展示填充后的形态。
 * 配置了 token（真后端）后自动关闭；也可在「系统」弹层里手动开关。
 *
 * 注意：这里只覆盖三个资料管理视图初次加载与基本交互用到的端点，
 * 未覆盖的端点返回 `undefined`，由 `yuxiRequest` 继续走真实 fetch。
 */
import type {
  YuxiClassifyCandidate,
  YuxiConflictItem,
  YuxiEntity,
  YuxiEntityDetail,
  YuxiKnowledgeDatabase,
  YuxiLibraryDocument,
  YuxiPendingItem,
  YuxiSearchGroup,
  YuxiTask,
} from "./yuxi-client";

const MOCK_FLAG_KEY = "hicodex.yuxi.mock";

function storage(): Storage | null {
  if (typeof window === "undefined") return null;
  try {
    return window.localStorage;
  } catch {
    return null;
  }
}

/** 显式开关状态：`true`/`false` 为手动设置，`null` 为跟随默认（演示态）。 */
export function readYuxiMockState(): boolean | null {
  const raw = storage()?.getItem(MOCK_FLAG_KEY);
  if (raw === "on") return true;
  if (raw === "off") return false;
  return null;
}

export function setYuxiMockState(value: boolean | null): void {
  const store = storage();
  if (!store) return;
  if (value == null) store.removeItem(MOCK_FLAG_KEY);
  else store.setItem(MOCK_FLAG_KEY, value ? "on" : "off");
}

/** 演示数据是否生效：显式开关优先；未设置时，未配置 token 即视为演示态。 */
export function isYuxiMockEnabled(config: { token?: string | null }): boolean {
  const explicit = readYuxiMockState();
  if (explicit != null) return explicit;
  return !(config.token ?? "").trim();
}

// ---------------------------------------------------------------------------
// 时间助手：相对当前时间生成，演示里显示「2 天前 / 刚刚」更自然
// ---------------------------------------------------------------------------

function daysAgo(days: number, hours = 0): string {
  return new Date(Date.now() - (days * 24 + hours) * 3600_000).toISOString();
}

// ---------------------------------------------------------------------------
// 知识库
// ---------------------------------------------------------------------------

interface LibDef {
  db_id: string;
  name: string;
  category: string;
  line: "training_presales" | "bidding";
  description: string;
}

const LIBRARIES: LibDef[] = [
  { db_id: "kb_lecturer", name: "讲师库", category: "lecturer", line: "training_presales", description: "讲师简介、专长、报价、可授课方向" },
  { db_id: "kb_course", name: "课程库", category: "course", line: "training_presales", description: "课程大纲、教学设计、目标人群、学时" },
  { db_id: "kb_case", name: "案例库", category: "case", line: "training_presales", description: "已结案项目复盘、行业案例、客户反馈" },
  { db_id: "kb_customer", name: "客户与行业库", category: "customer", line: "training_presales", description: "客户背景、行业研究、组织架构" },
  { db_id: "kb_proposal", name: "方案素材库", category: "proposal", line: "training_presales", description: "已出方案、模板、章节素材" },
  { db_id: "kb_bid_info", name: "招标信息库", category: "bid_info", line: "bidding", description: "招标公告、采购需求书、资格预审" },
  { db_id: "kb_bid_win", name: "历史赢标案例库", category: "bid_win", line: "bidding", description: "赢标标书、关键应答、得分情况" },
  { db_id: "kb_bid_template", name: "标书模板库", category: "bid_template", line: "bidding", description: "标书模板、章节骨架、通用应答" },
];

interface DocSeed {
  name: string;
  type: string;
  status: string;
  days: number;
  by: string;
  pages?: number;
  chunks?: number;
}

const DOC_SEEDS: Record<string, DocSeed[]> = {
  kb_lecturer: [
    { name: "张明_讲师简介.pdf", type: "PDF", status: "indexed", days: 2, by: "讲师运营", pages: 4, chunks: 18 },
    { name: "李华_专长与报价.docx", type: "DOC", status: "indexed", days: 3, by: "讲师运营", pages: 2, chunks: 9 },
    { name: "王芳_授课视频脚本.pptx", type: "PPT", status: "processing", days: 0, by: "售前小林" },
    { name: "讲师报价单_2024.xlsx", type: "XLS", status: "indexed", days: 6, by: "讲师运营", pages: 1, chunks: 12 },
    { name: "陈强_客户评价汇总.docx", type: "DOC", status: "indexed", days: 9, by: "售前小林", pages: 3, chunks: 14 },
    { name: "赵敏_履历.pdf", type: "PDF", status: "failed", days: 1, by: "讲师运营" },
  ],
  kb_course: [
    { name: "AI领导力转型_课纲.docx", type: "DOC", status: "indexed", days: 3, by: "课程运营", pages: 5, chunks: 22 },
    { name: "财务管理实战_大纲.pdf", type: "PDF", status: "indexed", days: 7, by: "课程运营", pages: 6, chunks: 26 },
    { name: "数字化营销_教学设计.pptx", type: "PPT", status: "indexed", days: 11, by: "产品组", pages: 8, chunks: 30 },
    { name: "高管领导力_课程介绍.docx", type: "DOC", status: "processing", days: 0, by: "课程运营" },
  ],
  kb_case: [
    { name: "某银行_高管培训复盘.pptx", type: "PPT", status: "indexed", days: 4, by: "项目运营", pages: 12, chunks: 40 },
    { name: "制造业_数字化案例.pdf", type: "PDF", status: "indexed", days: 8, by: "项目运营", pages: 7, chunks: 28 },
    { name: "金融客户_反馈摘要.docx", type: "DOC", status: "indexed", days: 15, by: "售前小林", pages: 2, chunks: 8 },
  ],
  kb_customer: [
    { name: "某金融集团_客户背景.docx", type: "DOC", status: "indexed", days: 5, by: "销售", pages: 3, chunks: 13 },
    { name: "新能源行业_研究报告.pdf", type: "PDF", status: "indexed", days: 12, by: "客户成功", pages: 18, chunks: 52 },
  ],
  kb_proposal: [
    { name: "领导力方案_模板v3.docx", type: "DOC", status: "indexed", days: 6, by: "方案组", pages: 9, chunks: 33 },
    { name: "数字化转型_方案章节.pptx", type: "PPT", status: "indexed", days: 10, by: "方案组", pages: 14, chunks: 44 },
  ],
  kb_bid_info: [
    { name: "某政府_采购需求书.pdf", type: "PDF", status: "indexed", days: 3, by: "投标经理", pages: 22, chunks: 64 },
    { name: "招标公告_2024Q2.pdf", type: "PDF", status: "indexed", days: 5, by: "投标经理", pages: 6, chunks: 20 },
    { name: "资格预审文件.docx", type: "DOC", status: "processing", days: 0, by: "标书中心" },
  ],
  kb_bid_win: [
    { name: "中标标书_某银行培训.pdf", type: "PDF", status: "indexed", days: 7, by: "标书负责人", pages: 48, chunks: 120 },
    { name: "赢标复盘_关键应答.docx", type: "DOC", status: "indexed", days: 13, by: "投标经理", pages: 5, chunks: 19 },
  ],
  kb_bid_template: [
    { name: "主标模板_通用.docx", type: "DOC", status: "indexed", days: 9, by: "标书中心", pages: 16, chunks: 50 },
    { name: "商务响应_章节模板.docx", type: "DOC", status: "indexed", days: 20, by: "标书中心", pages: 8, chunks: 27 },
  ],
};

function buildDocuments(): YuxiLibraryDocument[] {
  const docs: YuxiLibraryDocument[] = [];
  for (const lib of LIBRARIES) {
    const seeds = DOC_SEEDS[lib.db_id] ?? [];
    seeds.forEach((seed, index) => {
      docs.push({
        db_id: lib.db_id,
        kb_name: lib.name,
        business_line: lib.line,
        category: lib.category,
        file_id: `${lib.db_id}_doc_${index + 1}`,
        filename: seed.name,
        file_type: seed.type,
        file_size: 80_000 + index * 23_000,
        status: seed.status,
        created_at: daysAgo(seed.days),
        updated_at: daysAgo(seed.days),
        uploaded_by: seed.by,
        batch_id: `B-${lib.db_id.slice(3, 7)}-${index + 1}`,
        content_hash: `h${lib.db_id}${index}`,
        chunk_count: seed.chunks ?? null,
        page_count: seed.pages ?? null,
      });
    });
  }
  return docs;
}

const DOCUMENTS: YuxiLibraryDocument[] = buildDocuments();

function buildDatabases(): YuxiKnowledgeDatabase[] {
  return LIBRARIES.map((lib) => ({
    db_id: lib.db_id,
    name: lib.name,
    description: lib.description,
    business_line: lib.line,
    category: lib.category,
    kb_type: "lightrag",
    file_count: DOCUMENTS.filter((doc) => doc.db_id === lib.db_id).length,
    row_count: DOCUMENTS.filter((doc) => doc.db_id === lib.db_id).length,
    status: "active",
    created_at: daysAgo(30),
    updated_at: daysAgo(1),
  }));
}

const DATABASES: YuxiKnowledgeDatabase[] = buildDatabases();

// ---------------------------------------------------------------------------
// 档案（实体）
// ---------------------------------------------------------------------------

type MockEntity = YuxiEntity & { _category: string; _businessLine: "training_presales" | "bidding" };

function entity(
  id: number,
  type: string,
  name: string,
  category: string,
  line: "training_presales" | "bidding",
  authority: string,
  refs: number,
  attributes: Record<string, unknown>,
  description: string,
): MockEntity {
  return {
    id,
    entity_type: type,
    canonical_name: name,
    description,
    authority_status: authority,
    attributes,
    metrics: { referenced_count: refs, recent_30d_count: Math.max(0, refs - 1), distinct_files: Math.max(1, Math.round(refs / 2)) },
    aliases: [],
    reference_count: refs,
    updated_at: daysAgo(id % 14),
    _category: category,
    _businessLine: line,
  };
}

const ENTITIES: MockEntity[] = [
  entity(1, "teacher", "张明", "lecturer", "training_presales", "authoritative", 6, { specialty: "金融领导力 / 高管教练", industry: "金融", quote: "3 万/天", region: "华东" }, "资深金融行业领导力讲师"),
  entity(2, "teacher", "李华", "lecturer", "training_presales", "candidate", 2, { specialty: "制造业数字化", industry: "制造业", quote: "2.5 万/天" }, "制造业数字化转型方向讲师，待核对"),
  entity(3, "teacher", "王芳", "lecturer", "training_presales", "authoritative", 4, { specialty: "消费品营销", industry: "消费品", quote: "2 万/天", region: "华南" }, "消费品营销实战讲师"),
  entity(4, "teacher", "陈强", "lecturer", "training_presales", "authoritative", 3, { specialty: "财务管理", industry: "通用", quote: "2.8 万/天" }, "财务管理与预算实战讲师"),
  entity(5, "teacher", "赵敏", "lecturer", "training_presales", "candidate", 1, { specialty: "AI 应用", industry: "互联网" }, "AI 应用方向新增讲师，待核对"),
  entity(6, "course", "AI 领导力转型", "course", "training_presales", "authoritative", 5, { audience: "高管", duration: "16h", teacher: "张明" }, "面向高管的 AI 领导力课程"),
  entity(7, "course", "财务管理实战", "course", "training_presales", "authoritative", 3, { audience: "中层", duration: "12h", teacher: "陈强" }, "财务管理实战课程"),
  entity(8, "course", "数字化营销", "course", "training_presales", "candidate", 2, { audience: "中层", duration: "8h" }, "数字化营销课程，待核对讲师"),
  entity(9, "course", "高管领导力", "course", "training_presales", "authoritative", 4, { audience: "高管", duration: "16h", teacher: "王芳" }, "高管领导力发展课程"),
  entity(10, "case", "某银行高管培训", "case", "training_presales", "authoritative", 3, { industry: "金融", scale: "200 人", result: "满意度 4.8" }, "某银行高管培训项目复盘"),
  entity(11, "case", "制造业数字化案例", "case", "training_presales", "authoritative", 2, { industry: "制造业", scale: "120 人" }, "制造业数字化转型培训案例"),
  entity(12, "case", "金融客户反馈", "case", "training_presales", "candidate", 1, { industry: "金融" }, "金融客户反馈摘要，待核对"),
  entity(13, "customer", "某金融集团", "customer", "training_presales", "authoritative", 4, { industry: "金融", level: "战略", status: "活跃" }, "战略级金融客户"),
  entity(14, "customer", "新能源某企业", "customer", "training_presales", "candidate", 2, { industry: "新能源", level: "重点" }, "新能源行业重点客户，待核对"),
  entity(15, "bid_project", "某政府培训采购项目", "bid_win", "bidding", "authoritative", 3, { purchaser: "某市政府", status: "已中标", score: "技术 92" }, "已中标的政府培训采购项目"),
  entity(16, "bid_project", "某国企人才发展项目", "bid_win", "bidding", "candidate", 2, { purchaser: "某国企", status: "在投" }, "在投的国企人才发展项目"),
  entity(17, "bid_requirement", "资格条件·注册资金", "bid_info", "bidding", "authoritative", 2, { type: "资格", risk: "高" }, "注册资金不低于 1000 万的资格要求"),
  entity(18, "bid_requirement", "评分办法·技术 60%", "bid_info", "bidding", "authoritative", 3, { type: "技术", weight: "60%" }, "技术分占比 60% 的评分办法"),
  entity(19, "bid_competitor", "某竞品培训机构", "bid_intel", "bidding", "candidate", 2, { type: "培训机构", industry: "政企" }, "政企赛道主要竞品，待核对"),
  entity(20, "bid_template", "主标通用模板", "bid_template", "bidding", "authoritative", 5, { type: "主标", scope: "通用" }, "通用主标模板"),
  entity(21, "bid_risk", "盖章缺失风险", "bid_risk", "bidding", "authoritative", 4, { type: "格式", severity: "一票否决" }, "投标文件盖章缺失的废标风险"),
];

function entityCategoryFor(type: string | null | undefined): string {
  const found = ENTITIES.find((item) => item.entity_type === type);
  return found?._category ?? "lecturer";
}

// ---------------------------------------------------------------------------
// 待办 / 待处理（pending 队列 + 字段冲突）
// ---------------------------------------------------------------------------

const candidate = (c: YuxiClassifyCandidate): YuxiClassifyCandidate => c;

let DUP_ITEMS: YuxiPendingItem[] = [
  {
    id: 101,
    filename: "张明_讲师简介.pdf",
    file_size: 92_000,
    source_db_id: "kb_lecturer",
    target_db_id: "kb_lecturer",
    collision_file_id: "kb_lecturer_doc_1",
    similarity: 0.95,
    status: "pending",
    created_at: daysAgo(0, 2),
  },
];

let ENTITY_ITEMS: YuxiPendingItem[] = [
  {
    id: 102,
    filename: "李华_专长与报价.docx",
    source_db_id: "kb_lecturer",
    extracted_text: "李华",
    extracted_attrs: { industry: "制造业", specialty: "数字化转型" },
    candidate_entity_type: "teacher",
    suggested_entity_id: 2,
    candidates: [candidate({ entity_id: 2, canonical_name: "李华（制造业）", category: "lecturer", score: 0.82 })],
    status: "pending",
    created_at: daysAgo(0, 5),
  },
];

let CLASSIFY_ITEMS: YuxiPendingItem[] = [
  {
    id: 103,
    filename: "报价单_2024.xlsx",
    business_line_hint: "training_presales",
    suggested_db_id: "kb_lecturer",
    candidates: [
      candidate({ category: "lecturer", label: "讲师库", db_id: "kb_lecturer", score: 0.6, reason: "含讲师报价信息" }),
      candidate({ category: "course", label: "课程库", db_id: "kb_course", score: 0.3, reason: "含课程名称" }),
    ],
    status: "pending",
    created_at: daysAgo(1),
  },
];

let FORCE_ITEMS: YuxiPendingItem[] = [
  {
    id: 104,
    filename: "扫描件_资格证明.pdf",
    business_line_hint: "bidding",
    source_db_id: "kb_bid_info",
    failure_reason: "无法读取正文（疑似扫描件，需 OCR 或人工指派知识库）",
    status: "pending",
    created_at: daysAgo(0, 8),
  },
];

let CONFLICT_ITEMS: YuxiConflictItem[] = [
  {
    id: 201,
    entity_id: 1,
    incoming_attrs: { quote: "3.5 万/天" },
    diffs: [{ field: "quote", change: "changed", old: "3 万/天", new: "3.5 万/天" }],
    source_db_id: "kb_lecturer",
    source_file_id: "kb_lecturer_doc_2",
    status: "pending",
    uploaded_by: "讲师运营",
    created_at: daysAgo(0, 3),
  },
];

function pendingByQueue(queue: string): YuxiPendingItem[] {
  if (queue === "dup") return DUP_ITEMS;
  if (queue === "entity") return ENTITY_ITEMS;
  if (queue === "classify") return CLASSIFY_ITEMS;
  if (queue === "force") return FORCE_ITEMS;
  return [];
}

function dbIdsOfPending(item: YuxiPendingItem): string[] {
  const ids = [item.suggested_db_id, item.confirmed_db_id, item.source_db_id, item.target_db_id, item.manual_db_id];
  for (const c of item.candidates ?? []) ids.push(c.db_id ?? null);
  return ids.filter((value): value is string => typeof value === "string" && value.length > 0);
}

// ---------------------------------------------------------------------------
// 任务（处理记录）
// ---------------------------------------------------------------------------

const TASKS: YuxiTask[] = [
  { id: "t1", name: "解析 张明_讲师简介.pdf", type: "parse", status: "success", progress: 100, created_at: daysAgo(2), completed_at: daysAgo(2), payload: { db_id: "kb_lecturer" } },
  { id: "t2", name: "入库 AI领导力转型_课纲.docx", type: "index", status: "success", progress: 100, created_at: daysAgo(3), completed_at: daysAgo(3), payload: { db_id: "kb_course" } },
  { id: "t3", name: "解析 高管领导力_课程介绍.docx", type: "parse", status: "running", progress: 60, created_at: daysAgo(0), payload: { db_id: "kb_course" } },
  { id: "t4", name: "解析 赵敏_履历.pdf", type: "parse", status: "failed", progress: 0, created_at: daysAgo(1), error: "无法读取正文", payload: { db_id: "kb_lecturer" } },
];

// ---------------------------------------------------------------------------
// 搜索
// ---------------------------------------------------------------------------

function buildSearchGroups(query: string): YuxiSearchGroup[] {
  const q = query.trim().toLowerCase();
  const matched = DOCUMENTS.filter((doc) => {
    if (!q) return true;
    return (doc.filename ?? "").toLowerCase().includes(q) || (doc.kb_name ?? "").toLowerCase().includes(q);
  }).slice(0, 12);
  const byLib = new Map<string, YuxiLibraryDocument[]>();
  for (const doc of matched) {
    const key = doc.db_id ?? "";
    const list = byLib.get(key) ?? [];
    list.push(doc);
    byLib.set(key, list);
  }
  const groups: YuxiSearchGroup[] = [];
  for (const [dbId, docs] of byLib) {
    const lib = LIBRARIES.find((l) => l.db_id === dbId);
    groups.push({
      business_line: lib?.line ?? null,
      category: lib?.category ?? null,
      label: lib?.name ?? "知识库",
      results: docs.map((doc) => ({
        db_id: dbId,
        kb_name: lib?.name ?? "知识库",
        result: {
          filename: doc.filename,
          score: 0.7 + Math.min(0.25, (doc.chunk_count ?? 10) / 200),
          chunk_id: `${doc.file_id}#1`,
          results: [
            { content: `命中片段：${doc.filename} 中与「${query}」相关的内容…`, score: 0.78 },
          ],
        },
      })),
    });
  }
  return groups;
}

// ---------------------------------------------------------------------------
// 解析器
// ---------------------------------------------------------------------------

function parseBody(init: RequestInit): Record<string, unknown> {
  if (typeof init.body !== "string") return {};
  try {
    return JSON.parse(init.body) as Record<string, unknown>;
  } catch {
    return {};
  }
}

function removeById<T extends { id?: number }>(list: T[], id: number): T[] {
  return list.filter((item) => item.id !== id);
}

/**
 * 返回 mock 响应；若该路径未覆盖则返回 `undefined`，调用方继续走真实 fetch。
 */
export function resolveYuxiMock<T>(path: string, init: RequestInit): T | undefined {
  let url: URL;
  try {
    url = new URL(path, "http://mock.local");
  } catch {
    return undefined;
  }
  const pathname = url.pathname;
  const sp = url.searchParams;
  const method = (init.method ?? "GET").toUpperCase();
  const ok = { ok: true } as unknown as T;

  // --- 知识库列表 ---
  if (pathname === "/api/knowledge/databases") {
    return { databases: DATABASES } as T;
  }

  // --- 资料文档 ---
  if (pathname === "/api/presales/library/documents") {
    let items = DOCUMENTS;
    const bl = sp.get("business_line");
    const cat = sp.get("category");
    const db = sp.get("db_id");
    if (bl) items = items.filter((doc) => doc.business_line === bl);
    if (cat) items = items.filter((doc) => doc.category === cat);
    if (db) items = items.filter((doc) => doc.db_id === db);
    return { items, total: items.length } as T;
  }

  // --- 搜索 ---
  if (pathname === "/api/presales/library/search" && method === "POST") {
    const body = parseBody(init);
    const query = typeof body.query === "string" ? body.query : "";
    return { query, total_kbs_searched: DATABASES.length, groups: buildSearchGroups(query), errors: [] } as T;
  }

  // --- 任务（处理记录）---
  if (pathname === "/api/tasks") {
    const db = sp.get("db_id");
    const tasks = db ? TASKS.filter((task) => (task.payload?.db_id as string | undefined) === db) : TASKS;
    const statusCounts: Record<string, number> = {};
    for (const task of tasks) statusCounts[task.status ?? "unknown"] = (statusCounts[task.status ?? "unknown"] ?? 0) + 1;
    return { tasks, summary: { total: tasks.length, filtered_total: tasks.length, status_counts: statusCounts } } as T;
  }

  // --- pending 队列 ---
  const pendingMatch = pathname.match(/^\/api\/presales\/ingest\/pending\/(classify|entity|dup|force)$/);
  if (pendingMatch) {
    const db = sp.get("db_id");
    let items = pendingByQueue(pendingMatch[1]);
    if (db) items = items.filter((item) => dbIdsOfPending(item).includes(db));
    return { items, total: items.length } as T;
  }

  if (pathname === "/api/presales/ingest/pending/count") {
    return {
      classify: CLASSIFY_ITEMS.length,
      entity: ENTITY_ITEMS.length,
      dup: DUP_ITEMS.length,
      force: FORCE_ITEMS.length,
      total: CLASSIFY_ITEMS.length + ENTITY_ITEMS.length + DUP_ITEMS.length + FORCE_ITEMS.length,
    } as T;
  }

  // --- pending 处理动作（移除对应项，模拟"处理完消失"）---
  const pendingAction = pathname.match(/^\/api\/presales\/ingest\/pending\/(classify|entity|dup|force)\/(\d+)\/(confirm|reject|resolve)$/);
  if (pendingAction && method === "POST") {
    const id = Number(pendingAction[2]);
    if (pendingAction[1] === "dup") DUP_ITEMS = removeById(DUP_ITEMS, id);
    else if (pendingAction[1] === "entity") ENTITY_ITEMS = removeById(ENTITY_ITEMS, id);
    else if (pendingAction[1] === "classify") CLASSIFY_ITEMS = removeById(CLASSIFY_ITEMS, id);
    else if (pendingAction[1] === "force") FORCE_ITEMS = removeById(FORCE_ITEMS, id);
    return ok;
  }

  // --- 字段冲突 ---
  if (pathname === "/api/presales/conflicts") {
    return { items: CONFLICT_ITEMS, total: CONFLICT_ITEMS.length } as T;
  }
  const conflictResolve = pathname.match(/^\/api\/presales\/conflicts\/(\d+)\/resolve$/);
  if (conflictResolve && method === "POST") {
    CONFLICT_ITEMS = removeById(CONFLICT_ITEMS, Number(conflictResolve[1]));
    return ok;
  }

  // --- 实体列表 ---
  if (pathname === "/api/presales/entities") {
    const type = sp.get("type");
    const cat = sp.get("category");
    const bl = sp.get("business_line");
    const q = sp.get("q");
    let items = ENTITIES.slice();
    if (type) items = items.filter((item) => item.entity_type === type);
    if (cat) items = items.filter((item) => item._category === cat);
    if (bl) items = items.filter((item) => item._businessLine === bl);
    if (q) {
      const ql = q.toLowerCase();
      items = items.filter((item) => (item.canonical_name ?? "").toLowerCase().includes(ql) || (item.description ?? "").toLowerCase().includes(ql));
    }
    return { items, total: items.length } as T;
  }

  // --- 实体详情 / 关联 / 历史 ---
  const entityDetail = pathname.match(/^\/api\/presales\/entities\/(\d+)$/);
  if (entityDetail && method === "GET") {
    const id = Number(entityDetail[1]);
    const found = ENTITIES.find((item) => item.id === id);
    if (!found) return { id } as T;
    const detail: YuxiEntityDetail = {
      ...found,
      references: [
        { db_id: found._category === "lecturer" ? "kb_lecturer" : `kb_${found._category}`, file_id: `ref_${id}_1`, relation: "mention", confidence: 0.9, extracted_text: `${found.canonical_name} 的相关描述…`, created_at: daysAgo(id % 10), file_meta: { filename: `${found.canonical_name}_来源.pdf` } },
        { db_id: `kb_${found._category}`, file_id: `ref_${id}_2`, relation: "evidence", confidence: 0.8, extracted_text: `引用 ${found.canonical_name} 的佐证片段…`, created_at: daysAgo((id % 10) + 3), file_meta: { filename: "项目复盘.docx" } },
      ],
    };
    return detail as T;
  }
  const entityRelated = pathname.match(/^\/api\/presales\/entities\/(\d+)\/related$/);
  if (entityRelated) {
    const id = Number(entityRelated[1]);
    const others = ENTITIES.filter((item) => item.id !== id).slice(0, 3);
    return {
      entity_id: id,
      related: {
        co_occurrence: others.map((item) => ({ id: item.id, canonical_name: item.canonical_name, entity_type: item.entity_type, co_occurrence: 2 })),
      },
    } as T;
  }
  const entityHistory = pathname.match(/^\/api\/presales\/entities\/(\d+)\/history$/);
  if (entityHistory) {
    const id = Number(entityHistory[1]);
    return {
      history: [
        { id: 1, change_type: "create", field: null, operator_id: "系统", reason: "首次从资料抽取", created_at: daysAgo(20) },
        { id: 2, change_type: "update", field: "quote", old_value: "2.8 万/天", new_value: "3 万/天", operator_id: "讲师运营", reason: "报价更新", created_at: daysAgo(id % 12) },
      ],
    } as T;
  }

  // --- 评分模板 / 规则（演示里留空即可）---
  if (pathname === "/api/presales/scoring/templates") return { items: [] } as T;
  if (pathname === "/api/presales/scoring/rules") return { items: [] } as T;

  // --- 资料详情（正文 / 分段 / 元信息）---
  const docDetail = pathname.match(/^\/api\/knowledge\/databases\/[^/]+\/documents\/([^/]+)$/);
  if (docDetail && method === "GET") {
    const fileId = decodeURIComponent(docDetail[1]);
    const doc = DOCUMENTS.find((d) => d.file_id === fileId);
    const name = doc?.filename ?? "资料";
    const segCount = Math.min(6, Math.max(3, Math.round((doc?.chunk_count ?? 12) / 4)));
    const lines = Array.from({ length: segCount }, (_, i) => ({
      chunk_id: `${fileId}#${i + 1}`,
      chunk_index: i,
      content: `【${name} · 第 ${i + 1} 段】演示正文片段，用于展示资料详情的分段与内容定位。接入真实来源系统后会替换为实际抽取内容。`,
      tokens: 120 + i * 18,
    }));
    return {
      status: "success",
      meta: { filename: name, file_type: doc?.file_type, pages: doc?.page_count, uploaded_by: doc?.uploaded_by, knowledge_base: doc?.kb_name },
      content: `${name}（演示正文预览）\n\n${lines.map((l) => l.content).join("\n\n")}`,
      lines,
    } as T;
  }

  // --- 摘要 / 标签 / 风险 / 抽取档案 ---
  if (pathname === "/api/presales/analyze-file" && method === "POST") {
    const body = parseBody(init);
    const fileId = typeof body.file_id === "string" ? body.file_id : "";
    const doc = DOCUMENTS.find((d) => d.file_id === fileId);
    const cat = doc?.category ?? "lecturer";
    const line = doc?.business_line === "bidding" ? "投标" : "售前";
    const ents = ENTITIES.filter((e) => e._category === cat).slice(0, 3).map((e) => ({
      entity_type: e.entity_type ?? "entity",
      canonical_name: e.canonical_name ?? "",
      attributes: e.attributes ?? {},
      confidence: 0.86,
      extracted_text: e.description ?? "",
    }));
    return {
      status: "success",
      db_id: doc?.db_id,
      file_id: fileId,
      summary: `「${doc?.filename ?? "资料"}」演示摘要：已读取正文与表格，识别出关键信息，可用于检索与档案关联。`,
      tags: [
        { group: "业务线", name: line, confidence: 0.95 },
        { group: "分类", name: categoryLabel(cat), confidence: 0.9 },
        { group: "类型", name: doc?.file_type ?? "DOC", confidence: 0.8 },
      ],
      risks: ["部分字段缺来源证明，建议补充", "信息可能随业务更新，注意时效"],
      entities: ents,
    } as T;
  }

  // --- 可问问题（HyDE）---
  if (pathname === "/api/presales/hyde-questions" && method === "POST") {
    const body = parseBody(init);
    const doc = DOCUMENTS.find((d) => d.file_id === (typeof body.file_id === "string" ? body.file_id : ""));
    const label = doc?.filename ?? "这份资料";
    return {
      status: "success",
      questions: [
        `「${label}」适合哪些客户场景？`,
        "其中的关键数据 / 报价有哪些？",
        "和历史项目或案例有什么关联？",
        "有哪些可复用的内容片段？",
      ],
    } as T;
  }

  // --- 新建知识库（写入内存，演示里能立刻看到）---
  if (pathname === "/api/knowledge/databases" && method === "POST") {
    const body = parseBody(init);
    const db: YuxiKnowledgeDatabase = {
      db_id: `kb_new_${DATABASES.length + 1}`,
      name: typeof body.database_name === "string" ? body.database_name : "新建知识库",
      description: typeof body.description === "string" ? body.description : "",
      business_line: body.business_line === "bidding" ? "bidding" : "training_presales",
      category: typeof body.category === "string" ? body.category : "lecturer",
      kb_type: "lightrag",
      file_count: 0,
      row_count: 0,
      status: "active",
      created_at: daysAgo(0),
      updated_at: daysAgo(0),
    };
    DATABASES.push(db);
    return db as T;
  }

  // --- 单个任务 ---
  const taskById = pathname.match(/^\/api\/tasks\/([^/]+)$/);
  if (taskById && method === "GET") {
    const id = decodeURIComponent(taskById[1]);
    const task = TASKS.find((t) => t.id === id) ?? ({ id, status: "success", progress: 100 } as YuxiTask);
    return { task } as T;
  }

  // --- 兜底：演示态下不再漏到真后端 ---
  // 写操作（确认/拒绝/删除/上传等）一律返回成功；未覆盖的读操作返回空对象，
  // 让 `?.items ?? []` 之类的取值安全降级为"暂无数据"，而不是报错。
  if (method !== "GET") return { ok: true, status: "success" } as T;
  return {} as T;
}

function categoryLabel(cat: string): string {
  return LIBRARIES.find((lib) => lib.category === cat)?.name ?? cat;
}
