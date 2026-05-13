/*
 * ============================================================================
 *  YOUR INTERNAL TRAINING-PLATFORM API ADAPTER
 * ============================================================================
 *
 * This is the ONLY file you should need to edit when wiring the demo to your
 * real backend. Everything in `server.ts` calls into this module and treats
 * the implementation as a black box.
 *
 * The demo is built around the corporate-training domain inferred from
 * `~/Downloads/docs/`:
 *   - 培训需求 (TrainingDemand) — rows of the demand spreadsheet
 *   - 课程 (Course) — outlines / project proposals
 *   - 讲师 (Instructor) — trainer profiles (the 1.讲师.docx style table)
 *   - 培训方案 (TrainingPlan) — the assembled demand × course × instructor
 *     tuple with budget / scheduling
 *
 * Replace the placeholder URLs / headers / response shapes with whatever your
 * internal API uses. Do NOT change function names or return-type shapes —
 * `server.ts` and the SKILL.md rely on them. You can ADD fields freely.
 *
 * Default config:
 *   INTERNAL_API_BASE_URL = "https://api.internal.example.com/v1"
 *   INTERNAL_API_TOKEN    = "<bearer token>"
 *   INTERNAL_API_TIMEOUT_MS = "10000"
 * ============================================================================
 */

const DEFAULT_BASE_URL = process.env.INTERNAL_API_BASE_URL
  ?? "https://api.internal.example.com/v1";

const REQUEST_TIMEOUT_MS = Number.parseInt(
  process.env.INTERNAL_API_TIMEOUT_MS ?? "10000",
  10,
);

/* ============================================================================
 *  Types — what the rest of the server (and the SKILL) expects to come back.
 *  Names mirror the column headers in the source spreadsheet / docs so the
 *  model can quote them verbatim in its final answer.
 * ============================================================================ */

export type AudienceGroup =
  | "干部及骨干人才"
  | "党建职能专项人才"
  | "人力职能专项人才"
  | "在线营销服务人才"
  | "一线生产转型人才"
  | "数智科技人才"
  | "其他";

export type DeliveryFormat =
  | "外聘面授"
  | "内训面授"
  | "外聘面授/内训面授"
  | "外聘面授+实战指导"
  | "线上自主学习"
  | "面授+线上+实践社群"
  | "其他";

export interface TrainingDemand {
  /** Stable id; the spreadsheet's `excel_row` works fine. */
  id: string;
  /** 序号 from the source spreadsheet. */
  serialNo: string;
  audienceGroup: AudienceGroup;
  /** 能力维度 (e.g. "思政能力" / "数智化思维" / "宣传能力"). */
  capabilityDimensions: string[];
  /** 培训课程方向 — short label. May be empty when the demand is too generic. */
  courseDirection: string;
  /** 培训内容 — the long-form content/outline string from the spreadsheet. */
  contentOutline: string;
  /** 培训对象 — narrower than audienceGroup; the actual seat-holders. */
  attendees: string;
  deliveryFormats: DeliveryFormat[];
  /** 培训时长（天/次） */
  durationDaysPerSession: number;
  /** 培训次数 */
  sessionCount: number;
  /** 培训总天数 — usually `duration × count` but the spreadsheet can override. */
  totalDays: number | null;
  /** 是否包含内训 */
  internal: boolean;
  /** 是否需要外聘讲师 */
  external: boolean;
  /** 培训计划开展时间（预估）e.g. "6-9月" or "Q3". */
  plannedWindow: string;
  /** 标包编号 — bid lot identifier when applicable. */
  bidLot: string | null;
}

export interface Course {
  id: string;
  /** 课程名 / 项目名 */
  title: string;
  /** 课程方向 — used to match demands. */
  direction: string;
  /** 能力维度 this course satisfies. */
  capabilityDimensions: string[];
  /** Bulleted outline. Each item is one teaching chunk. */
  outline: string[];
  /** Suggested audience description. */
  recommendedAudience: string;
  /** Suggested duration in days (recommendation only; the demand wins). */
  recommendedDurationDays: number;
  /** Default delivery formats this course supports. */
  supportedDeliveryFormats: DeliveryFormat[];
  /** Whether the course has a battle-tested external instructor roster. */
  hasExternalRoster: boolean;
  /** Source document this course was lifted from (for audit). */
  sourceDocument: string | null;
}

export interface InstructorRate {
  /** 不含税单价（元/天） */
  preTaxPerDayCny: number;
  /** 增值税税率，例如 0.06 */
  vatRate: number;
  /** 含税单价（元/天） */
  postTaxPerDayCny: number;
}

export interface Instructor {
  id: string;
  /** 讲师姓名 */
  name: string;
  /** 曾任/现任单位 */
  affiliations: string[];
  /** 职称（正高 / 副高 / 研究员 / …） */
  title: string;
  /** 从业经历介绍 — multi-paragraph bio. */
  bio: string;
  /** Topic tags derived from bio, used by `match_instructors_to_course`. */
  expertiseTags: string[];
  /** Capability dimensions the instructor covers. */
  capabilityDimensions: string[];
  rate: InstructorRate | null;
  /** ISO date list of pre-blocked unavailable days. */
  unavailableDates: string[];
  /** Number of past engagements with the org. */
  pastEngagementCount: number;
}

export interface CourseMatch {
  course: Course;
  /** 0-100 confidence score. */
  score: number;
  /** Human-readable rationale for why this course fits the demand. */
  rationale: string;
}

export interface InstructorMatch {
  instructor: Instructor;
  /** 0-100 confidence score. */
  score: number;
  rationale: string;
  /** True if the instructor has no calendar conflict with the demand's plannedWindow. */
  scheduleOk: boolean;
}

export interface TrainingPlanInput {
  demandId: string;
  courseId: string;
  instructorId: string;
  /** Optional override; defaults to the demand's planned window. */
  scheduledWindow?: string;
  /** Optional override for session count. */
  sessionCount?: number;
  /** Optional override for duration per session (days). */
  durationDaysPerSession?: number;
  notes?: string;
}

export interface TrainingPlan {
  /** Server-assigned id once persisted. */
  id: string;
  demand: TrainingDemand;
  course: Course;
  instructor: Instructor;
  scheduledWindow: string;
  sessionCount: number;
  durationDaysPerSession: number;
  totalDays: number;
  /** Server-side budget breakdown. */
  budget: TrainingPlanBudget;
  /** Open issues / warnings the model should surface to the user. */
  warnings: string[];
  /** ISO timestamp of last update. */
  updatedAtIso: string;
  notes?: string;
}

export interface TrainingPlanBudget {
  preTaxCny: number;
  vatCny: number;
  postTaxCny: number;
  rate: InstructorRate | null;
  /** Per-day cost line items so the report can show a breakdown. */
  lineItems: Array<{ label: string; cny: number }>;
}

export interface DemandFilter {
  audienceGroup?: AudienceGroup;
  capabilityDimension?: string;
  plannedWindow?: string;
  /** Restrict to demands marked as needing an external trainer. */
  externalOnly?: boolean;
  limit?: number;
}

/* ============================================================================
 *  Implementation — the functions `server.ts` calls.
 *  Replace the fetch URLs / parsing with your real endpoints.
 * ============================================================================ */

export async function listTrainingDemands(
  filter: DemandFilter = {},
): Promise<TrainingDemand[]> {
  const query = new URLSearchParams();
  if (filter.audienceGroup) query.set("audienceGroup", filter.audienceGroup);
  if (filter.capabilityDimension) query.set("capabilityDimension", filter.capabilityDimension);
  if (filter.plannedWindow) query.set("plannedWindow", filter.plannedWindow);
  if (filter.externalOnly) query.set("externalOnly", "1");
  if (filter.limit) query.set("limit", String(filter.limit));
  const payload = await requestJson<{ data: TrainingDemand[] }>(
    "GET",
    `/training/demands?${query.toString()}`,
  );
  return payload.data ?? [];
}

export async function getTrainingDemand(demandId: string): Promise<TrainingDemand> {
  return requestJson<TrainingDemand>(
    "GET",
    `/training/demands/${encodeURIComponent(demandId)}`,
  );
}

export async function searchCourses(query: string, limit = 10): Promise<Course[]> {
  const payload = await requestJson<{ data: Course[] }>(
    "GET",
    `/training/courses/search?q=${encodeURIComponent(query)}&limit=${limit}`,
  );
  return payload.data ?? [];
}

export async function getCourse(courseId: string): Promise<Course> {
  return requestJson<Course>("GET", `/training/courses/${encodeURIComponent(courseId)}`);
}

export async function matchCoursesToDemand(
  demandId: string,
  limit = 5,
): Promise<CourseMatch[]> {
  const payload = await requestJson<{ data: CourseMatch[] }>(
    "GET",
    `/training/match/courses?demandId=${encodeURIComponent(demandId)}&limit=${limit}`,
  );
  return payload.data ?? [];
}

export async function searchInstructors(filter: {
  query?: string;
  capabilityDimension?: string;
  courseDirection?: string;
  limit?: number;
}): Promise<Instructor[]> {
  const query = new URLSearchParams();
  if (filter.query) query.set("q", filter.query);
  if (filter.capabilityDimension) query.set("capabilityDimension", filter.capabilityDimension);
  if (filter.courseDirection) query.set("courseDirection", filter.courseDirection);
  if (filter.limit) query.set("limit", String(filter.limit));
  const payload = await requestJson<{ data: Instructor[] }>(
    "GET",
    `/training/instructors/search?${query.toString()}`,
  );
  return payload.data ?? [];
}

export async function getInstructor(instructorId: string): Promise<Instructor> {
  return requestJson<Instructor>(
    "GET",
    `/training/instructors/${encodeURIComponent(instructorId)}`,
  );
}

export async function matchInstructorsToCourse(
  courseId: string,
  options: { plannedWindow?: string; limit?: number } = {},
): Promise<InstructorMatch[]> {
  const query = new URLSearchParams({ courseId });
  if (options.plannedWindow) query.set("plannedWindow", options.plannedWindow);
  if (options.limit) query.set("limit", String(options.limit));
  const payload = await requestJson<{ data: InstructorMatch[] }>(
    "GET",
    `/training/match/instructors?${query.toString()}`,
  );
  return payload.data ?? [];
}

export async function composeTrainingPlan(input: TrainingPlanInput): Promise<TrainingPlan> {
  return requestJson<TrainingPlan>("POST", `/training/plans`, input);
}

export async function listTrainingPlans(
  filter: { audienceGroup?: AudienceGroup; demandId?: string; limit?: number } = {},
): Promise<TrainingPlan[]> {
  const query = new URLSearchParams();
  if (filter.audienceGroup) query.set("audienceGroup", filter.audienceGroup);
  if (filter.demandId) query.set("demandId", filter.demandId);
  if (filter.limit) query.set("limit", String(filter.limit));
  const payload = await requestJson<{ data: TrainingPlan[] }>(
    "GET",
    `/training/plans?${query.toString()}`,
  );
  return payload.data ?? [];
}

/* ============================================================================
 *  HTTP helper. Replace this with whatever transport your backend uses
 *  (gRPC stubs, internal RPC SDK, direct SQL pool, etc.). The rest of the
 *  module only relies on the return shapes above.
 * ============================================================================ */

class HttpError extends Error {
  constructor(public readonly status: number, message: string) {
    super(message);
    this.name = "HttpError";
  }
}

async function requestJson<T>(method: "GET" | "POST", pathname: string, body?: unknown): Promise<T> {
  const url = `${DEFAULT_BASE_URL.replace(/\/+$/, "")}${pathname}`;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
  try {
    const response = await fetch(url, {
      method,
      headers: defaultHeaders(),
      body: body == null ? undefined : JSON.stringify(body),
      signal: controller.signal,
    });
    if (!response.ok) {
      const text = await response.text().catch(() => "");
      throw new HttpError(response.status, `${method} ${pathname} → ${response.status}${text ? `: ${text}` : ""}`);
    }
    return (await response.json()) as T;
  } finally {
    clearTimeout(timer);
  }
}

function defaultHeaders(): Record<string, string> {
  const token = process.env.INTERNAL_API_TOKEN ?? "";
  const headers: Record<string, string> = {
    "Accept": "application/json",
    "Content-Type": "application/json",
    "User-Agent": "hicodex-training-api-mcp/0.1",
  };
  if (token.trim().length > 0) {
    headers.Authorization = `Bearer ${token.trim()}`;
  }
  return headers;
}

/* ============================================================================
 *  AI 研修营设计扩展（v0.2 — refactored）
 *
 *  设计原则：
 *    1. MCP 工具不读用户本地文件 — 数据从两条渠道进入模型：
 *       (a) 用户在对话里粘贴 / @ 上传（HiCodex 自动 OCR/提取）→ 模型直接看到
 *       (b) 51CTO 真实企培后台 API（讲师 + 课程）— 模型按需调用
 *    2. 算法工具（match/rank/compose）是纯函数：模型把数据作为参数传进去。
 *       工具不假设数据来源，只做服务端可以更稳定做的计算。
 * ============================================================================ */

export interface ProvenanceSource {
  id: string;
  kind: "db" | "api" | "document" | "algorithm" | "embedding" | "human-curated";
  label: string;
  ref: string;
  accessedAt: string;
  algorithm?: string;
  confidence?: number;
}

export interface Provenance {
  sources: ProvenanceSource[];
  fieldMap?: Record<string, string[]>;
}

export const SIX_DIMENSIONS = [
  "知识与理解",
  "伦理与道德",
  "技能与经验",
  "创新能力与系统思维能力",
  "团队协作与交流能力",
  "可持续发展与终身学习能力",
] as const;
export type SixDimension = (typeof SIX_DIMENSIONS)[number];

export interface CourseLike {
  id?: string;
  title: string;
  objective?: string;
  outline?: string;
  duration?: string;
  audience?: string;
  category?: string;
  modules?: string;
}

export interface LecturerLike {
  id?: string;
  name: string;
  unitOrCompany?: string;
  title?: string;
  bio?: string;
  category?: "academic" | "industry" | "academic-industry-hybrid" | "unknown";
  isAcademician?: boolean;
  expertise?: string[];
  facePrice?: number;
  score?: number;
  cooperateNum?: number;
  positiveNum?: number;
  negativeNum?: number;
  domains?: Array<{ id?: string; label: string } | string>;
  source?: string;
}

/* ──────────────────────────────────────────────────────────────────────────
 *  Tool 1: search_51cto_lecturers — 真实 51CTO 讲师 API（2970+ 位）
 * ────────────────────────────────────────────────────────────────────────── */

const CTO51_BASE = process.env.CTO51_BASE_URL ?? "https://saas-admin-api.51cto.com";
const CTO51_TOKEN = process.env.CTO51_BEARER ?? "";

export interface Cto51Lecturer {
  id: string;
  name: string;
  jobTitle: string;
  companyName: string;
  province: string;
  city: string;
  facePrice: number;
  domain: Array<{ id: string; label: string }>;
  profile: string;
  qualification?: string;
  goodAtCourse?: string;
  experience?: string;
  score?: number;
  cooperateNum?: number;
  collaborationNum?: number;
  totalDays?: number;
  totalAmount?: number;
  positiveNum?: number;
  negativeNum?: number;
  hasCourse?: boolean;
  lastCollaborationTime?: number;
  financeTop100?: boolean;
  telecomTop100?: boolean;
  manufacturingTop100?: boolean;
}

export interface Cto51Page {
  content: Cto51Lecturer[];
  total: number;
}

export async function search51ctoLecturers(args: {
  keyword?: string;
  courseName?: string;
  page?: number;
  size?: number;
}): Promise<{ content: Cto51Lecturer[]; total: number; provenance: Provenance }> {
  if (!CTO51_TOKEN) {
    throw new Error("CTO51_BEARER env not set — configure mcp_servers env in config.toml");
  }
  const params = new URLSearchParams({
    page: String(args.page ?? 0),
    size: String(args.size ?? 20),
    keyword: args.keyword ?? "",
    courseName: args.courseName ?? "",
  });
  const url = `${CTO51_BASE.replace(/\/+$/, "")}/devpc/user/lecturers?${params}`;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
  try {
    const response = await fetch(url, {
      headers: {
        Accept: "application/json, text/plain, */*",
        Authorization: `bearer ${CTO51_TOKEN}`,
        Referer: "https://saas-admin.51cto.com/",
        "X-Ops-Version": "v1.0.0",
        "User-Agent": "hicodex-training-api-mcp/0.2",
      },
      signal: controller.signal,
    });
    if (!response.ok) {
      const text = await response.text().catch(() => "");
      throw new HttpError(response.status, `51CTO lecturers → ${response.status}${text ? `: ${text.slice(0, 200)}` : ""}`);
    }
    const payload = (await response.json()) as { errCode: number; message: string; data: Cto51Page };
    if (payload.errCode !== 0) {
      throw new Error(`51CTO errCode=${payload.errCode} message=${payload.message}`);
    }
    return {
      content: payload.data?.content ?? [],
      total: payload.data?.total ?? 0,
      provenance: {
        sources: [{
          id: "s-51cto-api",
          kind: "api",
          label: "51CTO 企培后台 · 讲师库",
          ref: `GET /devpc/user/lecturers?keyword=${args.keyword ?? ""}&courseName=${args.courseName ?? ""}`,
          accessedAt: new Date().toISOString(),
        }],
      },
    };
  } finally {
    clearTimeout(timer);
  }
}

/* ──────────────────────────────────────────────────────────────────────────
 *  Tool 2: search_51cto_courses — 真实 51CTO 课程 API（927 门）
 *  查询参数：searchContent (keyword), type (ALL), minPrice/maxPrice,
 *  timeRange (ONE_YEAR / SIX_MONTHS / ALL), sortBy (LATEST / HOT / ...)。
 * ────────────────────────────────────────────────────────────────────────── */

export interface Cto51Course {
  id: string;
  courseName: string;
  courseDescription: string;
  courseOutline: string;
  courseDuration: string;
  lecturerId: string;
  lecturerName: string;
  lecturerPrice?: number;
  createTime: string;
  updateTime: string;
  downloadCount?: number;
  outLineFile?: unknown;
}

export async function search51ctoCourses(args: {
  searchContent?: string;
  page?: number;
  size?: number;
  type?: string;
  minPrice?: number;
  maxPrice?: number;
  timeRange?: "ALL" | "SIX_MONTHS" | "ONE_YEAR";
  sortBy?: "LATEST";
}): Promise<{ content: Cto51Course[]; total: number; provenance: Provenance }> {
  if (!CTO51_TOKEN) {
    throw new Error("CTO51_BEARER env not set — configure mcp_servers env in config.toml");
  }
  // Only sortBy=LATEST is supported by the 51CTO course API. Other values
  // (HOT / PRICE_DESC / PRICE_ASC / POPULAR) return errCode=-1 "请求参数不正确".
  // We accept the arg for forward-compat but always send LATEST.
  const params = new URLSearchParams({
    page: String(args.page ?? 0),
    size: String(args.size ?? 20),
    type: args.type ?? "ALL",
    minPrice: String(args.minPrice ?? 0),
    maxPrice: String(args.maxPrice ?? 100000),
    timeRange: args.timeRange ?? "ONE_YEAR",
    sortBy: "LATEST",
  });
  if (args.searchContent && args.searchContent.trim().length > 0) {
    params.set("searchContent", args.searchContent.trim());
  }
  const url = `${CTO51_BASE.replace(/\/+$/, "")}/devpc/user/lecturer/course/list?${params}`;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
  try {
    const response = await fetch(url, {
      headers: {
        Accept: "application/json, text/plain, */*",
        Authorization: `bearer ${CTO51_TOKEN}`,
        Referer: "https://saas-admin.51cto.com/",
        "X-Ops-Version": "v1.0.0",
        "User-Agent": "hicodex-training-api-mcp/0.2",
      },
      signal: controller.signal,
    });
    if (!response.ok) {
      const text = await response.text().catch(() => "");
      throw new HttpError(response.status, `51CTO courses → ${response.status}${text ? `: ${text.slice(0, 200)}` : ""}`);
    }
    const payload = (await response.json()) as { errCode: number; message: string; data: { content: Cto51Course[]; total: number } };
    if (payload.errCode !== 0) {
      throw new Error(`51CTO errCode=${payload.errCode} message=${payload.message}`);
    }
    return {
      content: payload.data?.content ?? [],
      total: payload.data?.total ?? 0,
      provenance: {
        sources: [{
          id: "s-51cto-course-api",
          kind: "api",
          label: "51CTO 企培后台 · 课程库",
          ref: `GET /devpc/user/lecturer/course/list?searchContent=${args.searchContent ?? ""}&sortBy=${args.sortBy ?? "LATEST"}`,
          accessedAt: new Date().toISOString(),
        }],
      },
    };
  } finally {
    clearTimeout(timer);
  }
}

/* ──────────────────────────────────────────────────────────────────────────
 *  Tool 3: match_courses_to_dimensions — 纯函数
 *  输入：模型从对话上下文 / 51CTO 搜索结果整理出的课程数组；输出：每个维度
 *  的 Top N 匹配。模型负责数据采集，工具负责打分。
 * ────────────────────────────────────────────────────────────────────────── */

export interface CourseDimensionMatch {
  course: CourseLike;
  dimension: SixDimension;
  score: number;
  rationale: string;
  hitKeywords: string[];
}

const DIMENSION_KEYWORD_MAP: Record<SixDimension, RegExp> = {
  "知识与理解": /原理|架构|基础|演进|概览|认知|框架|生态|核心概念|基本概念|入门|理论/g,
  "伦理与道德": /合规|伦理|安全|风险|治理|监管|可信|偏见|红线|价值观|对齐|隐私|审计/g,
  "技能与经验": /实战|实操|实践|案例|开发|部署|工程|落地|流程|工具|平台|动手|编码|建模|微调|调优/g,
  "创新能力与系统思维能力": /创新|系统思维|架构设计|战略|场景挖掘|方法论|顶层设计|全景|思维|设计思维/g,
  "团队协作与交流能力": /团队|协作|沟通|跨部门|协同|工作坊|分享|演讲|表达|讨论|领导力/g,
  "可持续发展与终身学习能力": /持续|进阶|演进|未来|趋势|学习路径|发展|长期|生命周期|演化/g,
};

export async function matchCoursesToDimensions(args: {
  courses: CourseLike[];
  dimensions?: SixDimension[];
  audience?: string;
  preferDuration?: string;
  limitPerDimension?: number;
}): Promise<{
  byDimension: Record<SixDimension, CourseDimensionMatch[]>;
  uncovered: SixDimension[];
  provenance: Provenance;
}> {
  const dims = (args.dimensions && args.dimensions.length > 0
    ? args.dimensions
    : [...SIX_DIMENSIONS]) as SixDimension[];
  const limit = args.limitPerDimension ?? 3;
  const byDimension = {} as Record<SixDimension, CourseDimensionMatch[]>;
  const uncovered: SixDimension[] = [];

  for (const dim of dims) {
    const pattern = DIMENSION_KEYWORD_MAP[dim];
    const matches: CourseDimensionMatch[] = [];
    for (const c of args.courses) {
      const blob = [c.title, c.objective ?? "", c.outline ?? "", c.modules ?? ""].join(" ");
      const hits = Array.from(blob.matchAll(pattern), (m) => m[0]);
      if (hits.length === 0) continue;
      const uniqueHits = Array.from(new Set(hits));
      let score = Math.min(uniqueHits.length * 20, 70);
      const rationale: string[] = [`命中维度关键词 ${uniqueHits.length} 个：${uniqueHits.slice(0, 5).join("、")}`];
      if (args.audience && c.audience && args.audience.split(/[\s,，、]/).some((k) => k && c.audience!.includes(k))) {
        score += 15;
        rationale.push(`培训对象契合`);
      }
      if (args.preferDuration && c.duration === args.preferDuration) {
        score += 10;
        rationale.push(`时长契合（${c.duration}）`);
      }
      matches.push({ course: c, dimension: dim, score, rationale: rationale.join(" · "), hitKeywords: uniqueHits });
    }
    matches.sort((a, b) => b.score - a.score);
    byDimension[dim] = matches.slice(0, limit);
    if (matches.length === 0) uncovered.push(dim);
  }

  return {
    byDimension,
    uncovered,
    provenance: {
      sources: [{
        id: "s-dim-match-v2",
        kind: "algorithm",
        label: "课程→维度匹配 v2",
        algorithm: "维度关键词正则计数 × 20（cap 70）+ 培训对象命中 15 + 时长契合 10。每维度独立打分。",
        ref: "api-client.ts#matchCoursesToDimensions",
        accessedAt: new Date().toISOString(),
      }],
    },
  };
}

/* ──────────────────────────────────────────────────────────────────────────
 *  Tool 4: rank_lecturers_for_topic — 纯函数
 *  输入：讲师候选数组（可以来自 51CTO API 也可以是模型从对话里 parse 的
 *  学院派 list），按 topic 综合排序。
 * ────────────────────────────────────────────────────────────────────────── */

export interface LecturerRanked {
  lecturer: LecturerLike;
  score: number;
  rationale: string;
  hitDomains: string[];
}

export async function rankLecturersForTopic(args: {
  lecturers: LecturerLike[];
  topic: string;
  weights?: {
    rating?: number;        // default 10
    cooperation?: number;   // default 5
    feedback?: number;      // default 2
    domainHit?: number;     // default 30
    academicianBonus?: number; // default 50
  };
  limit?: number;
}): Promise<{ ranked: LecturerRanked[]; provenance: Provenance }> {
  const w = {
    rating: args.weights?.rating ?? 10,
    cooperation: args.weights?.cooperation ?? 5,
    feedback: args.weights?.feedback ?? 2,
    domainHit: args.weights?.domainHit ?? 30,
    academicianBonus: args.weights?.academicianBonus ?? 50,
  };
  const topicRegex = new RegExp(args.topic.split(/[\s,，、]/).filter(Boolean).join("|") || args.topic, "i");

  const ranked: LecturerRanked[] = args.lecturers.map((l) => {
    const domains = (l.domains ?? []).map((d) => typeof d === "string" ? d : d.label);
    const hitDomains = domains.filter((d) => topicRegex.test(d));
    const bioHit = (l.bio ?? "").length > 0 && topicRegex.test(l.bio ?? "");
    const score =
      (l.score ?? 0) * w.rating +
      (l.cooperateNum ?? 0) * w.cooperation +
      ((l.positiveNum ?? 0) - (l.negativeNum ?? 0)) * w.feedback +
      (hitDomains.length > 0 ? w.domainHit : 0) +
      (bioHit ? w.domainHit * 0.5 : 0) +
      (l.isAcademician ? w.academicianBonus : 0);
    const rationale: string[] = [];
    if (l.isAcademician) rationale.push("院士级专家");
    if (hitDomains.length > 0) rationale.push(`命中域：${hitDomains.slice(0, 3).join("/")}`);
    if (l.cooperateNum && l.cooperateNum > 0) rationale.push(`合作 ${l.cooperateNum} 次`);
    if (l.score && l.score > 0) rationale.push(`评分 ${l.score}`);
    return { lecturer: l, score: Number(score.toFixed(1)), rationale: rationale.join(" · "), hitDomains };
  }).sort((a, b) => b.score - a.score);

  return {
    ranked: ranked.slice(0, args.limit ?? 20),
    provenance: {
      sources: [{
        id: "s-lecturer-rank-v2",
        kind: "algorithm",
        label: "讲师→主题排序 v2",
        algorithm: `score = rating*${w.rating} + cooperateNum*${w.cooperation} + (pos-neg)*${w.feedback} + domainHit*${w.domainHit} + bioHit*${w.domainHit * 0.5} + isAcademician*${w.academicianBonus}`,
        ref: "api-client.ts#rankLecturersForTopic",
        accessedAt: new Date().toISOString(),
      }],
    },
  };
}

/* ──────────────────────────────────────────────────────────────────────────
 *  Tool 5: compose_camp_schedule — 纯函数
 *  输入：课程候选、讲师阵容、研修营骨架参数；输出：完整 schedule + 评估
 *  方案 + 成果册模板 + warnings。所有数据由模型提供，工具只组织结构。
 * ────────────────────────────────────────────────────────────────────────── */

export interface CampSession {
  day: number;
  slot: "上午" | "下午" | "晚上";
  durationHours: number;
  trackName: string;
  trackKind: "共性课" | "深度课" | "实践" | "考察" | "汇报";
  format: "集中授课" | "案例分析" | "专题研讨" | "探索实践" | "研学考察" | "团队攻关";
  online: boolean;
  dimension: SixDimension;
  topic: string;
  outline?: string;
  courseRef?: string;
  lecturerName?: string;
}

export interface CampLineup {
  academic: LecturerLike[];
  industry: LecturerLike[];
}

export interface CampSchedulePlan {
  topic: string;
  totalDays: number;
  branches: string[];
  dimensionsCovered: SixDimension[];
  schedule: CampSession[];
  evaluationPlan: string[];
  outputDeliverable: string[];
  warnings: string[];
  provenance: Provenance;
}

export async function composeCampSchedule(args: {
  topic: string;
  days: number;
  branches: string[];
  commonCourses: Array<{ dimension: SixDimension; course: CourseLike; lecturer?: LecturerLike }>;
  deepCourses: Array<{ branch: string; course: CourseLike; lecturer?: LecturerLike }>;
  blendOnlineOffline?: boolean;
}): Promise<CampSchedulePlan> {
  const blend = args.blendOnlineOffline ?? true;
  const slotsPerDay: Array<"上午" | "下午"> = ["上午", "下午"];
  const schedule: CampSession[] = [];

  // 共性课：均匀分布到前 (days - 1) 天，每天 2 个时段，剩余追加
  const commonDays = Math.max(args.days - 1, 1);
  const totalCommonSlots = commonDays * 2;
  for (let i = 0; i < args.commonCourses.length; i++) {
    const { dimension, course, lecturer } = args.commonCourses[i];
    const slotIndex = i % totalCommonSlots;
    schedule.push({
      day: Math.floor(slotIndex / 2) + 1,
      slot: slotsPerDay[slotIndex % 2],
      durationHours: 3,
      trackName: "共性课",
      trackKind: "共性课",
      format: dimension === "团队协作与交流能力" ? "专题研讨" : "集中授课",
      online: blend && i % 3 === 2,
      dimension,
      topic: course.title,
      outline: truncate(course.objective ?? course.outline ?? "", 160),
      courseRef: course.id,
      lecturerName: lecturer?.name,
    });
  }

  // 深度课：均匀填入第 1..(days-1) 天的剩余时段，超出则进第 days 天
  let deepCursor = 0;
  for (let bi = 0; bi < args.deepCourses.length; bi++) {
    const { branch, course, lecturer } = args.deepCourses[bi];
    // Find next free day/slot after commonDays mostly filled
    let day = (deepCursor % commonDays) + 1;
    let slot = slotsPerDay[deepCursor % 2];
    // Bias deep courses to 第 2..(days-1) 天
    if (args.days >= 3) {
      day = Math.min(2 + Math.floor(deepCursor / 2), args.days - 1);
    }
    deepCursor++;
    schedule.push({
      day,
      slot,
      durationHours: 3,
      trackName: branch,
      trackKind: "深度课",
      format: "案例分析",
      online: false,
      dimension: "技能与经验",
      topic: course.title,
      outline: truncate(course.objective ?? course.outline ?? "", 160),
      courseRef: course.id,
      lecturerName: lecturer?.name,
    });
  }

  // 第 N 天：团队攻关 + 成果汇报
  schedule.push({
    day: args.days,
    slot: "上午",
    durationHours: 3,
    trackName: "团队攻关",
    trackKind: "实践",
    format: "团队攻关",
    online: false,
    dimension: "团队协作与交流能力",
    topic: `${args.topic} 落地方案设计 — 分组工作坊`,
    outline: "按学员所在场景设计 AI 落地 mini-project，由讲师导师组现场点评",
  });
  schedule.push({
    day: args.days,
    slot: "下午",
    durationHours: 3,
    trackName: "成果汇报",
    trackKind: "汇报",
    format: "团队攻关",
    online: false,
    dimension: "创新能力与系统思维能力",
    topic: "学员成果路演 + 优秀作品评选",
    outline: "每组 15 分钟路演 + 5 分钟评委提问；评选优秀学员、优秀成果、典型案例",
  });

  schedule.sort((a, b) => a.day - b.day || slotOrder(a.slot) - slotOrder(b.slot));

  const dimensionsCovered = Array.from(new Set(schedule.map((s) => s.dimension))) as SixDimension[];
  const warnings: string[] = [];
  if (blend && schedule.every((s) => !s.online)) {
    warnings.push("blendOnlineOffline=true 但 schedule 未出现线上 session，请手动调整某些 session.online=true");
  }
  if (args.commonCourses.length < 6) {
    warnings.push(`共性课只覆盖 ${args.commonCourses.length}/6 维度，建议补全`);
  }
  if (args.deepCourses.length < args.branches.length * 2) {
    warnings.push(`深度课覆盖不足：${args.branches.length} 个分班共 ${args.deepCourses.length} 门，建议每分班 ≥ 2 门`);
  }

  return {
    topic: args.topic,
    totalDays: args.days,
    branches: args.branches,
    dimensionsCovered,
    schedule,
    evaluationPlan: [
      "课程参与度：每日签到 + 课中互动评分",
      "学习成果评估：每日小测 + 课题作业 + 团队攻关成果路演",
      "优秀学员评选：参与度 (30%) + 作业质量 (30%) + 路演评分 (40%)",
      "优秀成果挖掘：评委选出 Top 3 团队作品，深度访谈整理成案例",
    ],
    outputDeliverable: [
      "成果册一套（PDF 8-12 页）：摘要 + 每位学员反思笔记 + Top 3 案例 + 评委点评 + 后续行动清单",
      "学员花名册 + 优秀学员证书",
      "讲师阵容名片合集",
      "课程录像 / 课件包索引",
    ],
    warnings,
    provenance: {
      sources: [{
        id: "s-camp-composer-v2",
        kind: "algorithm",
        label: "研修营编排算法 v2",
        algorithm: `共性课均匀分布前 ${Math.max(args.days - 1, 1)} 天 × 2 时段，深度课填入第 2..(days-1) 天；第 ${args.days} 天固定为团队攻关上午+成果汇报下午`,
        ref: "api-client.ts#composeCampSchedule",
        accessedAt: new Date().toISOString(),
      }],
    },
  };
}

/* ──────────────────────────────────────────────────────────────────────────
 *  Helpers
 * ────────────────────────────────────────────────────────────────────────── */

function truncate(s: string, n: number): string {
  if (!s) return "";
  return s.length > n ? s.slice(0, n) + "…" : s;
}

function slotOrder(slot: "上午" | "下午" | "晚上"): number {
  return slot === "上午" ? 0 : slot === "下午" ? 1 : 2;
}
