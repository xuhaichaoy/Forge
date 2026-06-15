# Forge × 内部培训平台 API — MCP + Skill 演示

把 `~/Downloads/docs/` 里的真实业务（培训需求 / 课程 / 讲师 / 项目方案）抽象
成两层扩展点：

```
[你们的培训平台 API] ──HTTP──> [MCP server: 11 tools] ──MCP stdio──> [Codex app-server] ──> [Forge UI]
                                                                                              │
                                              [skill: annual-training-plan]                   │
                                                       └── 把 11 个工具串成"出年度方案"工作流
```

**MCP server**：把每个原子 API 调用封装成一个工具（搜需求 / 拉课程 / 匹配讲师 / 组方案……）。模型自动发现。

**Skill (`annual-training-plan`)**：一份 SKILL.md，告诉模型在什么场景按什么顺序串这些工具，跳过哪些边界，最终怎么渲染。

## 数据模型（与 `~/Downloads/docs/training_demands.json` 对齐）

| 实体 | 字段 |
|---|---|
| **TrainingDemand** | id, 序号, 赋能人群, 能力维度[], 培训课程方向, 培训内容大纲, 培训对象, 培训方式[], 时长×次数, 计划开展时间, 标包编号 |
| **Course** | id, 课程标题, 课程方向, 能力维度[], 大纲[], 推荐对象, 推荐时长, 支持的培训方式[], 源文档 |
| **Instructor** | id, 姓名, 单位[], 职称, 履历, 擅长领域[], 能力维度[], 单价（不含税/含税）, 档期不可用日期[], 历史交付次数 |
| **TrainingPlan** | id, demand, course, instructor, 排期窗口, 总天数, 预算（preTax/VAT/postTax）, warnings[] |

## 工具集（11 个 + 1 个聚合）

| Tool | 何时用 |
|---|---|
| `list_training_demands` | 按赋能人群 / 能力维度 / 窗口拉需求清单 |
| `get_training_demand` | 单条需求详情 |
| `search_courses` | 按关键词搜课程库 |
| `get_course` | 单门课程的大纲全文 |
| `match_courses_to_demand` | **核心**：给需求自动匹配 Top N 候选课程 + score + rationale |
| `search_instructors` | 按姓名 / 能力维度 / 课程方向搜讲师库 |
| `get_instructor` | 单个讲师完整档案 |
| `match_instructors_to_course` | **核心**：给课程 + 窗口自动匹配 Top N 讲师 + scheduleOk |
| `compose_training_plan` | 三选一组方案 + 后端算预算（preTax/VAT/postTax） |
| `list_training_plans` | 查历史已有方案 |
| `propose_annual_training_plan` | **聚合**：一键跑完 Step 1-4，返回全套方案 |

## Skill 工作流（`skill/annual-training-plan/SKILL.md`）

```
Step 1  list_training_demands({audienceGroup, capabilityDimension?})  → 需求清单
Step 2  对每条需求 → match_courses_to_demand → 评分挑课程
Step 3  对每个课程 → match_instructors_to_course → 评分挑讲师
Step 4  逐条 compose_training_plan → 拿到带预算的 TrainingPlan
Step 5  聚合（总预算 / 维度分布 / 月度分布 / 讲师统计）
Step 6  按固定模板渲染（总表 + 跳过项 + 预算分布 + 讲师 + 风险 + 数据来源）

或者一步到位：propose_annual_training_plan({audienceGroup}) 跳过 1-4，直接拿结果。
```

SKILL 还规定了：
- 用户输入的同义词映射（"党务" → `党建职能专项人才`）
- 课程匹配分差小时要让用户挑、分差大时自动选
- 内训需求跳过讲师匹配
- 金额一律千分位、人民币、含税
- 不允许凭印象编课程/讲师名
- 失败恢复策略（哪些错误跳过、哪些止损）

## 目录

```
examples/internal-api-demo/
├── README.md                         ← 本文件
├── mcp-server/
│   ├── package.json
│   ├── tsconfig.json
│   ├── dist/                         ← npm run build 产物（已经 build）
│   │   ├── server.js
│   │   └── api-client.js
│   └── src/
│       ├── server.ts                 ← tool 注册 / MCP 协议接线 / 聚合 tool
│       └── api-client.ts             ← **你只改这一个文件**：填你们真实 API
└── skill/
    └── annual-training-plan/
        └── SKILL.md                  ← 工作流
```

## 启动步骤

### 1. Build

```sh
cd examples/internal-api-demo/mcp-server
npm install
npm run build
```

### 2. 注册到 Forge

编辑 `~/Library/Application Support/HiCodex/codex-home/config.toml`：

```toml
[mcp_servers.training_api]
command = "node"
args    = ["/Users/haichao/Desktop/data/HiCodex/examples/internal-api-demo/mcp-server/dist/server.js"]

[mcp_servers.training_api.env]
INTERNAL_API_BASE_URL = "https://your-training-platform.internal/v1"
INTERNAL_API_TOKEN    = "REPLACE_ME"
# 可选：INTERNAL_API_TIMEOUT_MS = "15000"
```

### 3. 装 Skill

```sh
mkdir -p "$HOME/Library/Application Support/HiCodex/codex-home/skills/annual-training-plan"
cp examples/internal-api-demo/skill/annual-training-plan/SKILL.md \
   "$HOME/Library/Application Support/HiCodex/codex-home/skills/annual-training-plan/SKILL.md"
```

### 4. 重启 Forge

桌面 app 重启后会自动 spawn 新的 app-server，把 MCP server 拉起来。
你在右栏 Sources 里会看到 `training_api`。

## 试一下

发：

> 给"党建职能专项人才"出 2026 年的培训方案

预期模型行为：
1. 调用 `training_api.list_training_demands({ audienceGroup: "党建职能专项人才" })`
2. 列需求摘要表，问"全部"还是"挑几条"
3. 用户确认后，对每条 → `match_courses_to_demand` → 选课程
4. 对每个课程 → `match_instructors_to_course` → 选讲师（崔伟 / 余少华 / 史元春 / 黄民烈 ...）
5. 逐条 `compose_training_plan`
6. 渲染最终方案总表（需求 × 课程 × 讲师 × 预算）

中段过程区每一步都会出现 `Called training_api:xxx`，可展开看入参/返回。

## 接你们真实 API

只改 `src/api-client.ts` 一个文件。函数列表：

| 函数 | 你要做的事 |
|---|---|
| `listTrainingDemands(filter)` | 改成调你们的需求查询端点，把字段映射到 `TrainingDemand` 接口 |
| `getTrainingDemand(demandId)` | 改成调单条需求端点 |
| `searchCourses(query, limit)` | 改成你们的课程搜索 |
| `getCourse(courseId)` | 单课程详情 |
| `matchCoursesToDemand(demandId, limit)` | **推荐写在后端**：能力维度 + 关键词 + 方向相似度评分。客户端如果没这能力，可以在这个函数里**自己做**：先 `getTrainingDemand` 再 `searchCourses(keywords)` 然后用启发式打分。 |
| `searchInstructors(filter)` | 讲师库搜索 |
| `getInstructor(instructorId)` | 讲师详情 |
| `matchInstructorsToCourse(courseId, opts)` | 同 match_courses，推荐后端做；后端如果没有可以在 client 用启发式 |
| `composeTrainingPlan(input)` | POST 一份方案到后端持久化，并由后端返回完整 TrainingPlan + 预算 |
| `listTrainingPlans(filter)` | 历史方案查询 |

如果某些端点你们暂时没有，**保留接口签名 + 抛 `not implemented`**，server.ts
会把错误透到 UI，SKILL 会按"跳过"分支处理，不会卡死。

## 扩展方向

- **加更多 SKILL**：例如 `instructor-availability-report.md`（讲师档期回顾）、
  `course-coverage-gap.md`（哪些能力维度课程库覆盖不足）、`budget-variance.md`
  （方案预算 vs 标包预算偏差）。每个独立 SKILL.md，复用同一套 MCP 工具。
- **加更多工具**：`compute_plan_revision({ planId, ...overrides })` 出方案
  修订对比；`export_plan_to_excel({ planId })` 导出 .xlsx 给法务/采购。
- **审批流**：让 `compose_training_plan` 第一次调用时返回 `proposed-plan`
  ThreadItem（Codex 协议原生支持），UI 上用户点 Approve 才落库。
- **打包发布**：把 MCP server + SKILL 打成一个 Forge plugin，团队成员
  一键安装。

## 排障

- **工具没出现**：`node dist/server.js` 单跑，应该挂住等 stdio。然后用
  `npx @modelcontextprotocol/inspector node dist/server.js` 验证 `tools/list`
  返回 12 个工具。
- **鉴权失败**：`[mcp_servers.training_api.env]` 块的环境变量会传给子进程，
  但如果 Forge 是从 Finder 启动的（不是 shell），不会继承你 `~/.zshrc` 里
  的 export。统一在 `config.toml` 的 env 块里显式写。
- **模型不触发 SKILL**：SKILL `description` 是触发依据。如果你们的真实
  词汇不同（"赋能人群" → "员工分类"），编辑 SKILL.md `description` 加进
  你们的术语。
