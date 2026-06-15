#!/usr/bin/env node
import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import {
  CallToolRequestSchema,
  ListResourcesRequestSchema,
  ListToolsRequestSchema,
  ReadResourceRequestSchema,
} from "@modelcontextprotocol/sdk/types.js";
import { z } from "zod";

import {
  composeTrainingPlan,
  getCourse,
  getInstructor,
  getTrainingDemand,
  listTrainingDemands,
  listTrainingPlans,
  matchCoursesToDemand,
  matchInstructorsToCourse,
  searchCourses,
  searchInstructors,
  type AudienceGroup,
  type DeliveryFormat,
  // v0.2 — AI 研修营设计（refactored, no local files）
  search51ctoLecturers,
  search51ctoCourses,
  matchCoursesToDimensions,
  rankLecturersForTopic,
  composeCampSchedule,
  SIX_DIMENSIONS,
} from "./api-client.js";

/* ============================================================================
 *  Forge / Codex Desktop MCP demo: 教育培训方案编排工具集
 *
 *  Domain (from ~/Downloads/docs):
 *    - 培训需求 (TrainingDemand)  ← rows in the demand spreadsheet
 *    - 课程       (Course)         ← course outlines / project proposals
 *    - 讲师       (Instructor)     ← trainer profiles (1.讲师.docx)
 *    - 培训方案   (TrainingPlan)   ← demand × course × instructor + budget
 *
 *  Each tool is one atomic step; the paired SKILL.md walks the model through
 *  the multi-step compose-an-annual-plan workflow.
 *
 *  Architecture parity with what Codex Desktop expects:
 *    - Each tool publishes a strict input Zod schema converted to JSON
 *      Schema so the model has reliable arg contracts.
 *    - Long descriptive `description` fields drive tool discovery — the
 *      model reads them and decides when to fire each tool.
 *    - One resource (`internal://training/about`) is exposed so the
 *      AppShell RightPanel can pull a "what is this MCP" card.
 *    - Errors come back as `{ isError: true, content: [{type:"text", text}] }`
 *      so Codex Desktop renders them with the red error chrome.
 * ============================================================================ */

const server = new Server(
  {
    name: "forge-training-api-demo",
    version: "0.1.0",
  },
  {
    capabilities: {
      tools: {},
      resources: {},
    },
  },
);

/* ============================================================================
 *  Reusable Zod fragments
 * ============================================================================ */

const AudienceGroupSchema = z.enum([
  "干部及骨干人才",
  "党建职能专项人才",
  "人力职能专项人才",
  "在线营销服务人才",
  "一线生产转型人才",
  "数智科技人才",
  "其他",
]) satisfies z.ZodType<AudienceGroup>;

const DeliveryFormatSchema = z.enum([
  "外聘面授",
  "内训面授",
  "外聘面授/内训面授",
  "外聘面授+实战指导",
  "线上自主学习",
  "面授+线上+实践社群",
  "其他",
]) satisfies z.ZodType<DeliveryFormat>;

/* ============================================================================
 *  Tool inputs
 * ============================================================================ */

const ListTrainingDemandsInput = z.object({
  audienceGroup: AudienceGroupSchema.optional()
    .describe("筛选赋能人群。常用值：干部及骨干人才 / 党建职能专项人才 / 在线营销服务人才 等。"),
  capabilityDimension: z.string().optional()
    .describe("筛选能力维度，例如 '思政能力'、'宣传能力'、'数智化思维'、'管理能力'。"),
  plannedWindow: z.string().optional()
    .describe("筛选计划开展时间窗口，例如 '6-9月'、'Q3'、'2026H1'。"),
  externalOnly: z.boolean().optional()
    .describe("只看需要外聘讲师的需求。"),
  limit: z.number().int().min(1).max(200).optional()
    .describe("返回条数上限，默认 50。"),
});

const GetTrainingDemandInput = z.object({
  demandId: z.string().min(1).describe("需求 ID（用 list_training_demands 返回的 id）。"),
});

const SearchCoursesInput = z.object({
  query: z.string().min(1)
    .describe("课程关键词，例如 '思政'、'AI 大模型'、'数据治理'、'党建宣传'。"),
  limit: z.number().int().min(1).max(50).optional(),
});

const GetCourseInput = z.object({
  courseId: z.string().min(1),
});

const MatchCoursesToDemandInput = z.object({
  demandId: z.string().min(1).describe("需求 ID。"),
  limit: z.number().int().min(1).max(20).optional()
    .describe("返回候选课程数，默认 5。每个匹配会带 score 和 rationale。"),
});

const SearchInstructorsInput = z.object({
  query: z.string().optional()
    .describe("讲师姓名 / 单位 / 关键词模糊匹配。"),
  capabilityDimension: z.string().optional()
    .describe("按能力维度筛选讲师库。"),
  courseDirection: z.string().optional()
    .describe("按课程方向筛选可承接讲师。"),
  limit: z.number().int().min(1).max(50).optional(),
});

const GetInstructorInput = z.object({
  instructorId: z.string().min(1),
});

const MatchInstructorsToCourseInput = z.object({
  courseId: z.string().min(1),
  plannedWindow: z.string().optional()
    .describe("课程拟定开展时间窗口，会带进档期冲突检查。"),
  limit: z.number().int().min(1).max(20).optional(),
});

const ComposeTrainingPlanInput = z.object({
  demandId: z.string().min(1),
  courseId: z.string().min(1),
  instructorId: z.string().min(1),
  scheduledWindow: z.string().optional()
    .describe("最终排期窗口（覆盖需求里 plannedWindow 时填）。"),
  sessionCount: z.number().int().min(1).max(50).optional()
    .describe("覆盖需求里的 sessionCount。"),
  durationDaysPerSession: z.number().min(0.25).max(30).optional()
    .describe("覆盖需求里的 durationDaysPerSession。半天 = 0.5。"),
  notes: z.string().optional()
    .describe("方案备注，会原样回写到方案的 notes 字段。"),
});

const ListTrainingPlansInput = z.object({
  audienceGroup: AudienceGroupSchema.optional(),
  demandId: z.string().optional(),
  limit: z.number().int().min(1).max(200).optional(),
});

const ProposeAnnualPlanInput = z.object({
  audienceGroup: AudienceGroupSchema
    .describe("要出年度方案的赋能人群。"),
  plannedWindow: z.string().optional()
    .describe("整体计划窗口，例如 '2026 全年'。仅用作汇总文档的标题。"),
  capabilityDimensions: z.array(z.string()).optional()
    .describe("可选：限定到几个能力维度。默认全部。"),
});

interface ToolSpec<I extends z.ZodTypeAny> {
  name: string;
  description: string;
  inputSchema: I;
  handler: (input: z.infer<I>) => Promise<unknown>;
}

const tools: ToolSpec<z.ZodTypeAny>[] = [
  {
    name: "list_training_demands",
    description:
      "【需求清单】按赋能人群 / 能力维度 / 计划窗口列出培训需求行（来源：年度培训需求表）。返回每条需求的完整字段：序号、内容大纲、培训对象、时长×次数、内训/外聘、计划开展时间、标包编号等。是年度方案编排的第 1 步。",
    inputSchema: ListTrainingDemandsInput,
    handler: (input) => listTrainingDemands(input),
  },
  {
    name: "get_training_demand",
    description:
      "【需求详情】拉取单条培训需求的完整字段。当 list_training_demands 已经返回但你只想引用某一条的完整内容大纲时使用。",
    inputSchema: GetTrainingDemandInput,
    handler: (input) => getTrainingDemand(input.demandId),
  },
  {
    name: "search_courses",
    description:
      "【课程搜索】按关键词在课程库中查课程（来源：各项目方案 doc/ppt 拆分出的课程目录）。返回课程标题、方向、能力维度、大纲、推荐对象、推荐时长、支持的培训方式、是否有外聘讲师 roster。",
    inputSchema: SearchCoursesInput,
    handler: (input) => searchCourses(input.query, input.limit),
  },
  {
    name: "get_course",
    description:
      "【课程详情】根据 courseId 拉课程完整大纲。在已经知道课程 id 但需要把大纲完整放进最终方案时使用。",
    inputSchema: GetCourseInput,
    handler: (input) => getCourse(input.courseId),
  },
  {
    name: "match_courses_to_demand",
    description:
      "【需求→课程匹配】给一条培训需求，由服务端按能力维度 / 课程方向 / 培训对象 / 时长契合度自动评分，返回 Top N 候选课程，每个带 score (0-100) 和 rationale。年度方案编排的第 2 步。优先用它，不要在 chat 里凭关键词猜。",
    inputSchema: MatchCoursesToDemandInput,
    handler: (input) => matchCoursesToDemand(input.demandId, input.limit ?? 5),
  },
  {
    name: "search_instructors",
    description:
      "【讲师搜索】在讲师库里查讲师（来源：1.讲师.docx 等历史档案）。返回姓名、单位、职称、履历、擅长领域、能力维度、档期不可用日期、单价（含税/不含税）等。可按姓名 / 能力维度 / 课程方向筛选。",
    inputSchema: SearchInstructorsInput,
    handler: (input) => searchInstructors(input),
  },
  {
    name: "get_instructor",
    description:
      "【讲师详情】根据 instructorId 拉讲师完整档案。在最终方案里引用讲师履历段落时使用。",
    inputSchema: GetInstructorInput,
    handler: (input) => getInstructor(input.instructorId),
  },
  {
    name: "match_instructors_to_course",
    description:
      "【课程→讲师匹配】给一个课程 + 计划窗口，由服务端按擅长领域 / 能力维度 / 档期是否冲突 / 历史交付次数自动评分，返回 Top N 候选讲师，每个带 score / rationale / scheduleOk。年度方案编排的第 3 步。",
    inputSchema: MatchInstructorsToCourseInput,
    handler: (input) => matchInstructorsToCourse(input.courseId, {
      plannedWindow: input.plannedWindow,
      limit: input.limit,
    }),
  },
  {
    name: "compose_training_plan",
    description:
      "【组方案】把 demandId × courseId × instructorId 三选一组合成一份完整的 TrainingPlan：自动计算 totalDays、预算 (preTax / VAT / postTax)、合并需求的培训对象 / 培训方式、并回写到服务端。返回完整 plan + warnings（档期冲突 / 预算超限等）。",
    inputSchema: ComposeTrainingPlanInput,
    handler: (input) => composeTrainingPlan(input),
  },
  {
    name: "list_training_plans",
    description:
      "【方案查询】查已经存在的培训方案。按赋能人群或某条 demandId 过滤。用于回顾去年/历史方案，避免重复编排。",
    inputSchema: ListTrainingPlansInput,
    handler: (input) => listTrainingPlans(input),
  },
];

const toolsByName = new Map(tools.map((tool) => [tool.name, tool]));

/* ============================================================================
 *  Aggregate tool — propose_annual_training_plan
 *
 *  Single-call convenience: pulls all demands for an audience group, runs
 *  per-demand course+instructor matching, and returns a complete annual
 *  package the model can render directly. Skips human pick-one logic — when
 *  multiple courses or instructors tie, takes the highest-score candidate.
 *  The SKILL recommends iterating per-demand and letting the model pick
 *  when the score gap is small; this tool is the "just run it" shortcut.
 * ============================================================================ */

tools.push({
  name: "propose_annual_training_plan",
  description:
    "【年度方案打包】聚合工具：给一个赋能人群（可选能力维度过滤），后端把它名下所有培训需求拉出来、逐条匹配最佳课程、再为每个课程匹配最佳讲师、组方案、汇总预算。返回 { plans: TrainingPlan[], skipped: [{demandId, reason}], totalBudgetCny }。当用户说'帮我出 X 人群的 2026 年完整培训方案'时直接用这个。",
  inputSchema: ProposeAnnualPlanInput,
  handler: async (input) => {
    const demands = await listTrainingDemands({
      audienceGroup: input.audienceGroup,
      limit: 200,
    });
    const filtered = input.capabilityDimensions && input.capabilityDimensions.length > 0
      ? demands.filter((demand) => demand.capabilityDimensions.some((dim) => input.capabilityDimensions?.includes(dim)))
      : demands;

    const plans = [] as Array<Awaited<ReturnType<typeof composeTrainingPlan>>>;
    const skipped: Array<{ demandId: string; reason: string }> = [];

    for (const demand of filtered) {
      try {
        const courseMatches = await matchCoursesToDemand(demand.id, 3);
        const bestCourse = courseMatches.at(0);
        if (!bestCourse) {
          skipped.push({ demandId: demand.id, reason: "未找到合适课程" });
          continue;
        }
        const instructorMatches = await matchInstructorsToCourse(bestCourse.course.id, {
          plannedWindow: demand.plannedWindow,
          limit: 3,
        });
        const bestInstructor = instructorMatches.find((match) => match.scheduleOk) ?? instructorMatches.at(0);
        if (!bestInstructor) {
          skipped.push({ demandId: demand.id, reason: "未找到合适讲师" });
          continue;
        }
        const plan = await composeTrainingPlan({
          demandId: demand.id,
          courseId: bestCourse.course.id,
          instructorId: bestInstructor.instructor.id,
        });
        plans.push(plan);
      } catch (error) {
        skipped.push({
          demandId: demand.id,
          reason: error instanceof Error ? error.message : String(error),
        });
      }
    }

    const totalPostTaxCny = plans.reduce((sum, plan) => sum + (plan.budget.postTaxCny ?? 0), 0);

    return {
      audienceGroup: input.audienceGroup,
      plannedWindow: input.plannedWindow ?? null,
      plans,
      skipped,
      summary: {
        demandCount: filtered.length,
        planCount: plans.length,
        skippedCount: skipped.length,
        totalPostTaxCny: Number(totalPostTaxCny.toFixed(2)),
      },
    };
  },
});

toolsByName.set("propose_annual_training_plan", tools[tools.length - 1]);


/* ============================================================================
 *  v0.2 — AI 研修营设计工具集（refactored）
 *
 *  设计原则：MCP 不读用户文件。数据要么来自模型对话上下文（用户粘贴 / @ 附
 *  件），要么来自 51CTO 真实企培后台 API。算法工具是纯函数，模型把数据作
 *  为参数传进来。
 * ============================================================================ */

const SixDimensionSchema = z.enum([...SIX_DIMENSIONS] as [string, ...string[]]);

const CourseLikeSchema = z.object({
  id: z.string().optional(),
  title: z.string(),
  objective: z.string().optional(),
  outline: z.string().optional(),
  duration: z.string().optional(),
  audience: z.string().optional(),
  category: z.string().optional(),
  modules: z.string().optional(),
});

const LecturerLikeSchema = z.object({
  id: z.string().optional(),
  name: z.string(),
  unitOrCompany: z.string().optional(),
  title: z.string().optional(),
  bio: z.string().optional(),
  category: z.enum(["academic", "industry", "academic-industry-hybrid", "unknown"]).optional(),
  isAcademician: z.boolean().optional(),
  expertise: z.array(z.string()).optional(),
  facePrice: z.number().optional(),
  score: z.number().optional(),
  cooperateNum: z.number().optional(),
  positiveNum: z.number().optional(),
  negativeNum: z.number().optional(),
  domains: z.array(z.union([
    z.string(),
    z.object({ id: z.string().optional(), label: z.string() }),
  ])).optional(),
  source: z.string().optional(),
});

const Search51ctoLecturersInput = z.object({
  keyword: z.string().optional().describe("讲师姓名或专业方向关键词，例如 AI、大模型、Agent、风控。"),
  courseName: z.string().optional().describe("课程名关键词。"),
  page: z.number().int().min(0).max(200).optional().describe("页码（从 0 开始）。"),
  size: z.number().int().min(1).max(50).optional().describe("每页条数，默认 20。"),
});

const Search51ctoCoursesInput = z.object({
  searchContent: z.string().optional().describe("课程标题/描述/大纲 全文关键词搜索。注意参数名是 searchContent，不是 keyword。"),
  type: z.string().optional().describe("课程类型，默认 ALL。"),
  minPrice: z.number().optional().describe("讲师单价下限（元），默认 0。"),
  maxPrice: z.number().optional().describe("讲师单价上限（元），默认 100000。"),
  timeRange: z.enum(["ALL", "SIX_MONTHS", "ONE_YEAR"]).optional().describe("课程创建时间范围，默认 ONE_YEAR。"),
  sortBy: z.enum(["LATEST"]).optional().describe("排序方式。当前 51CTO API 只接受 LATEST；其他值（HOT/PRICE_DESC/PRICE_ASC/POPULAR）会返回 400 请求参数不正确。默认 LATEST。"),
  page: z.number().int().min(0).max(200).optional(),
  size: z.number().int().min(1).max(50).optional(),
});

const MatchCoursesToDimensionsInput = z.object({
  courses: z.array(CourseLikeSchema).describe("课程候选数组。由模型从对话上下文（用户粘贴 / @ 附件）或上一步 search_51cto_courses 调用结果整理后传入。"),
  dimensions: z.array(SixDimensionSchema).optional()
    .describe("要打分的维度子集，默认全部 6 个：知识与理解 / 伦理与道德 / 技能与经验 / 创新能力与系统思维能力 / 团队协作与交流能力 / 可持续发展与终身学习能力。"),
  audience: z.string().optional().describe("培训对象描述，如研发工程师、产品经理、管理层。"),
  preferDuration: z.string().optional().describe("偏好课程时长，如 1 / 2 / 3。"),
  limitPerDimension: z.number().int().min(1).max(20).optional().describe("每个维度返回多少 Top 匹配，默认 3。"),
});

const RankLecturersForTopicInput = z.object({
  lecturers: z.array(LecturerLikeSchema).describe("讲师候选数组。可以混合不同来源：51CTO 拉的产业讲师 + 用户提供的学院派 list。每条必须至少有 name。"),
  topic: z.string().describe("研修主题关键词，用于 domain 命中和 bio 匹配。"),
  weights: z.object({
    rating: z.number().optional(),
    cooperation: z.number().optional(),
    feedback: z.number().optional(),
    domainHit: z.number().optional(),
    academicianBonus: z.number().optional(),
  }).optional().describe("可调权重。默认 rating=10, cooperation=5, feedback=2, domainHit=30, academicianBonus=50。"),
  limit: z.number().int().min(1).max(60).optional(),
});

const ComposeCampScheduleInput = z.object({
  topic: z.string().describe("研修营主题，如 2026 AI 三天研修营。"),
  days: z.number().int().min(1).max(15).describe("总天数。"),
  branches: z.array(z.string()).describe("分班名称（建议 ≥ 2 个），如 ['AI 应用开发分班', 'AI 战略与场景分班']。"),
  commonCourses: z.array(z.object({
    dimension: SixDimensionSchema,
    course: CourseLikeSchema,
    lecturer: LecturerLikeSchema.optional(),
  })).describe("共性课列表，每个维度对应 1 门课（建议 6 门覆盖全维度），可选附配讲师。"),
  deepCourses: z.array(z.object({
    branch: z.string(),
    course: CourseLikeSchema,
    lecturer: LecturerLikeSchema.optional(),
  })).describe("深度课列表（建议每个分班 ≥ 2 门）。"),
  blendOnlineOffline: z.boolean().optional().describe("是否要求线上线下混合，默认 true（部分共性课会标 online=true）。"),
});

tools.push({
  name: "search_51cto_lecturers",
  description:
    "【51CTO·企培讲师库】调用真实 51CTO 企培后台讲师 API（2970+ 位讲师）。每条返回 id / 姓名 / 公司 / 职务 / 面授单价 / domain 标签 / profile 简历 / 合作次数 / 评分 / 行业 Top100 等丰富字段。按 keyword（专业方向）或 courseName（课程名）搜索；page/size 分页。产业派讲师的主要来源；学院派讲师由用户在对话里提供。",
  inputSchema: Search51ctoLecturersInput,
  handler: (input) => search51ctoLecturers(input as Parameters<typeof search51ctoLecturers>[0]),
});
toolsByName.set("search_51cto_lecturers", tools[tools.length - 1]);

tools.push({
  name: "search_51cto_courses",
  description:
    "【51CTO·企培课程库】调用真实 51CTO 课程 API（927 门）。关键词参数名是 searchContent，不是 keyword。每条返回 id / courseName / courseDescription / courseOutline / courseDuration / lecturerName / lecturerPrice / outLineFile（可能含 PPT 链接）等。支持按 timeRange（ONE_YEAR/SIX_MONTHS/ALL）、价格区间过滤。sortBy 当前只支持 LATEST（HOT 等其他值会被 51CTO API 拒绝）。用户没单独提供课程清单时调这个。",
  inputSchema: Search51ctoCoursesInput,
  handler: (input) => search51ctoCourses(input as Parameters<typeof search51ctoCourses>[0]),
});
toolsByName.set("search_51cto_courses", tools[tools.length - 1]);

tools.push({
  name: "match_courses_to_dimensions",
  description:
    "【课程→6 维度批量匹配】纯函数。输入：模型提供的课程候选数组（来自对话上下文或 search_51cto_courses 结果）+ 要打分的维度子集。输出：每个维度的 Top N 匹配，带 score / rationale / hitKeywords，以及 uncovered（哪些维度课程库覆盖不足）。研修营『共性课』挑选的入口；模型负责喂数据，工具负责打分。比 6 次单维度查询节省 5 个工具调用。",
  inputSchema: MatchCoursesToDimensionsInput,
  handler: (input) => matchCoursesToDimensions(input as Parameters<typeof matchCoursesToDimensions>[0]),
});
toolsByName.set("match_courses_to_dimensions", tools[tools.length - 1]);

tools.push({
  name: "rank_lecturers_for_topic",
  description:
    "【讲师→主题综合排序】纯函数。输入：讲师候选数组（51CTO 拉的产业讲师 + 用户提供的学院派 list，混合都行）+ 主题关键词 + 可选权重。输出：按综合分降序排列，每条带 rationale 和 hitDomains。默认权重：rating=10, cooperation=5, feedback=2, domainHit=30, academicianBonus=50。研修营讲师阵容排序的入口；模型负责采集候选，工具负责评分。",
  inputSchema: RankLecturersForTopicInput,
  handler: (input) => rankLecturersForTopic(input as Parameters<typeof rankLecturersForTopic>[0]),
});
toolsByName.set("rank_lecturers_for_topic", tools[tools.length - 1]);

tools.push({
  name: "compose_camp_schedule",
  description:
    "【组装研修营 schedule】纯函数。输入：模型已经匹配好的共性课列表（每个维度对应 1 门 + 可选讲师）+ 深度课列表（每个分班 ≥ 2 门 + 可选讲师）+ 骨架参数（topic/days/branches/blendOnlineOffline）。输出：按天 × 时段排好的 schedule + evaluationPlan + outputDeliverable + warnings + provenance。调用前模型必须先：① 调 search_51cto_courses 或读用户提供的课程清单；② 调 match_courses_to_dimensions 选共性课；③ 决定深度课；④ 调 search_51cto_lecturers 或读用户讲师；⑤ 调 rank_lecturers_for_topic 排序；最后把讲师塞进 commonCourses[].lecturer 和 deepCourses[].lecturer 里调这个工具。",
  inputSchema: ComposeCampScheduleInput,
  handler: (input) => composeCampSchedule(input as Parameters<typeof composeCampSchedule>[0]),
});
toolsByName.set("compose_camp_schedule", tools[tools.length - 1]);

/* ============================================================================
 *  Tool registration boilerplate
 * ============================================================================ */

server.setRequestHandler(ListToolsRequestSchema, async () => ({
  tools: tools.map((tool) => ({
    name: tool.name,
    description: tool.description,
    inputSchema: zodToJsonSchema(tool.inputSchema),
  })),
}));

server.setRequestHandler(CallToolRequestSchema, async (request) => {
  const tool = toolsByName.get(request.params.name);
  if (!tool) {
    return errorContent(`Unknown tool: ${request.params.name}`);
  }
  const parsed = tool.inputSchema.safeParse(request.params.arguments ?? {});
  if (!parsed.success) {
    return errorContent(`Invalid arguments for ${tool.name}: ${parsed.error.message}`);
  }
  try {
    const result = await tool.handler(parsed.data);
    return {
      content: [
        {
          type: "text",
          text: JSON.stringify(result ?? null, null, 2),
        },
      ],
    };
  } catch (error) {
    return errorContent(error instanceof Error ? error.message : String(error));
  }
});

/* ============================================================================
 *  Resources — one human-readable "what is this MCP" card.
 * ============================================================================ */

const ABOUT_URI = "internal://training/about";

server.setRequestHandler(ListResourcesRequestSchema, async () => ({
  resources: [
    {
      uri: ABOUT_URI,
      name: "教育培训方案 MCP — 总览",
      description:
        "演示 MCP server：对接内部培训需求 / 课程 / 讲师库，配合 annual-training-plan skill 编排年度方案。",
      mimeType: "text/markdown",
    },
  ],
}));

server.setRequestHandler(ReadResourceRequestSchema, async (request) => {
  if (request.params.uri !== ABOUT_URI) {
    throw new Error(`Unknown resource: ${request.params.uri}`);
  }
  return {
    contents: [
      {
        uri: ABOUT_URI,
        mimeType: "text/markdown",
        text: aboutMarkdown(),
      },
    ],
  };
});

function aboutMarkdown(): string {
  return [
    "# 教育培训方案 MCP",
    "",
    "对接内部培训平台 API。配合 SKILL `annual-training-plan` 编排年度方案。",
    "",
    "## 实体",
    "- **培训需求 (TrainingDemand)**：来源年度需求表的每一行（赋能人群 × 能力维度 × 培训内容...）",
    "- **课程 (Course)**：课程库（标题、方向、大纲、推荐对象、推荐时长）",
    "- **讲师 (Instructor)**：讲师库（姓名、单位、职称、履历、擅长领域、档期、报价）",
    "- **培训方案 (TrainingPlan)**：需求 × 课程 × 讲师 + 排期 + 预算",
    "",
    "## 工具（按调用顺序）",
    ...tools.map((tool) => `- **${tool.name}** — ${tool.description.split("。")[0]}。`),
    "",
    "## 典型工作流",
    "1. `list_training_demands({ audienceGroup })` → 列需求清单",
    "2. 对每条需求 → `match_courses_to_demand` → 选课程",
    "3. 对每个课程 → `match_instructors_to_course` → 选讲师",
    "4. `compose_training_plan` → 组方案 + 预算",
    "5. 渲染汇总表（需求 × 课程 × 讲师 × 时长 × 预算）",
    "",
    "或者一步到位：`propose_annual_training_plan({ audienceGroup })`。",
    "",
    "## Auth",
    "在 `[mcp_servers.X.env]` 设置 `INTERNAL_API_TOKEN` / `INTERNAL_API_BASE_URL`。",
  ].join("\n");
}

/* ============================================================================
 *  Zod → JSON-Schema helper (kept tiny — we only use the primitives our
 *  tool inputs actually use).
 * ============================================================================ */

function zodToJsonSchema(schema: z.ZodTypeAny): unknown {
  if (schema instanceof z.ZodObject) {
    const shape = schema._def.shape() as Record<string, z.ZodTypeAny>;
    const properties: Record<string, unknown> = {};
    const required: string[] = [];
    for (const [key, value] of Object.entries(shape)) {
      properties[key] = zodToJsonSchema(value);
      if (!(value instanceof z.ZodOptional) && !(value instanceof z.ZodDefault)) {
        required.push(key);
      }
    }
    return {
      type: "object",
      properties,
      ...(required.length > 0 ? { required } : {}),
      additionalProperties: false,
    };
  }
  if (schema instanceof z.ZodDefault) return zodToJsonSchema(schema._def.innerType);
  if (schema instanceof z.ZodOptional) return zodToJsonSchema(schema._def.innerType);
  if (schema instanceof z.ZodEnum) {
    return {
      type: "string",
      enum: schema._def.values,
      ...(schema.description ? { description: schema.description } : {}),
    };
  }
  if (schema instanceof z.ZodString) {
    return {
      type: "string",
      ...(schema.description ? { description: schema.description } : {}),
    };
  }
  if (schema instanceof z.ZodNumber) {
    return {
      type: "number",
      ...(schema.description ? { description: schema.description } : {}),
    };
  }
  if (schema instanceof z.ZodBoolean) {
    return {
      type: "boolean",
      ...(schema.description ? { description: schema.description } : {}),
    };
  }
  if (schema instanceof z.ZodArray) {
    return {
      type: "array",
      items: zodToJsonSchema(schema._def.type),
      ...(schema.description ? { description: schema.description } : {}),
    };
  }
  return {};
}

function errorContent(message: string) {
  return {
    isError: true,
    content: [
      {
        type: "text",
        text: message,
      },
    ],
  };
}

/* ============================================================================
 *  stdio transport. Codex spawns this process and pipes JSON-RPC over
 *  stdin/stdout — no port, no auth-on-the-wire.
 * ============================================================================ */

const transport = new StdioServerTransport();
server.connect(transport).catch((error) => {
  console.error("[forge-training-api-mcp] fatal:", error);
  process.exit(1);
});
