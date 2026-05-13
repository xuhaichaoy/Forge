# Skill × MCP — 设计笔记

本文整理基于本 demo（`examples/internal-api-demo/`）讨论得出的、把 HiCodex
接到一个内部业务系统时的设计原则。重点回答：

- Skill 和 MCP 各自是什么、怎么协作
- 用户能不能"灵活"使用 Skill（跳步 / 修正 / 中途介入）
- 内部系统有几千上百万行数据时，MCP 工具怎么设计才不爆 context
- 怎么给每条结果加 **来源凭证**（provenance），做可审计

---

## 1. Skill 和 MCP 的分层

```
┌──────────────────────────────────────────────────────────────┐
│  用户输入                                                     │
│     │                                                         │
│     ▼                                                         │
│  ┌────────────────┐    匹配 description / @ 选中              │
│  │   Skill        │    "annual-training-plan"                 │
│  │ (SKILL.md)     │──────────────┐                            │
│  └────────────────┘              │                            │
│         │ 注入 system prompt     │                            │
│         ▼                        ▼                            │
│  ┌────────────────────────────────────────────┐               │
│  │  模型（GPT-5.5 / Claude / ...）            │               │
│  │  - 按 SKILL 指引                          │               │
│  │  - 调 MCP 工具拿数据                       │               │
│  │  - 决定每一步要做什么                      │               │
│  └────────────────────────────────────────────┘               │
│         │ 调用 tool                                           │
│         ▼                                                     │
│  ┌────────────────┐  stdio JSON-RPC                           │
│  │  MCP Server    │──────HTTP──→ 你们的业务系统               │
│  │ (Node 子进程)   │                                          │
│  │ - 11 个工具    │                                          │
│  │ - 过滤/排序/打分│                                          │
│  └────────────────┘                                          │
└──────────────────────────────────────────────────────────────┘
```

| 层 | 是什么 | 写在哪 | 谁来执行 |
|---|---|---|---|
| **Skill** | 一份 markdown 指令，告诉模型在某个场景按什么顺序做事 | `SKILL.md` (frontmatter + 正文) | 没人执行——它是 prompt 的一部分 |
| **MCP Server** | 一个独立进程，把业务能力包装成工具 | `mcp-server/src/server.ts` | Node 子进程，HiCodex 启动时拉起 |
| **Tool (MCP 工具)** | 一个具体函数：`list_training_demands`, `match_instructors_to_course` ... | `mcp-server/src/api-client.ts` | 模型按需调用 |

**关键认知**：

- Skill **不执行代码**。它是建议、流程图、检查清单——给模型看的。
- MCP **不知道 Skill 存在**。它只是被叫到时返回结构化数据。
- 模型是**唯一的"编排者"**：读 SKILL，决定调哪个工具，处理结果，决定下一步。

---

## 2. Skill 的灵活性

> Skill 是"参考手册"，不是"自动化流水线"。

### 2.1 三种灵活姿势（每种都原生支持，不需要写额外代码）

#### 姿势 A：跳过前面，从中间步骤开始

用户直接把自带的数据贴进来：

```
我已经有这份培训需求了：
- demand-001：党务工作者，思政能力，1天×3次，6-9月
- demand-002：宣传干事，宣传能力，1天×2次，3-5月
直接从课程匹配开始，跳过列需求那步。
```

模型读 SKILL → 看到 Step 1 (list_training_demands) 用户已自带 → **跳过它**，
直接进 Step 2 用提供的 demand id 调 `match_courses_to_demand`。

#### 姿势 B：某一步输出不达预期，要修正

**局部重做**：

```
第3条需求的课程匹配不对，"知行工作研习班"应该匹配给党务岗位。
重新给 demand-003 匹配课程，排除该课程。
```

模型：再次调 `match_courses_to_demand({ demandId: "demand-003" })` 调整候选，
然后只重组 demand-003 这一条的方案，其他保留。

**推翻整步**：

```
课程匹配阶段不对，能力维度筛错了。所有需求重新匹配，
只考虑"数智化思维"和"创新思维"两个维度。
```

模型：从 Step 2 重跑，所有 demand 重新匹配 → Step 3/4 自动跟着重跑。

**替换具体选择**：

```
demand-005 的讲师不要崔伟，换余少华，标 warning。
```

模型：调 `compose_training_plan({ demandId, instructorId: "yu-shaohua" })` 重新出预算 + warning。

#### 姿势 C：边走边停

```
先列需求清单就好，别急着匹配课程，等我看完。
```

模型：跑完 Step 1 立刻停。

### 2.2 这种灵活性的实现机制

1. **每轮重读 SKILL**：用户的纠正消息进 chat，模型下一轮把 SKILL + 历史 +
   用户纠正一起看。
2. **MCP 工具是幂等的**：同样参数随时再调一次。改参数就出新结果。
3. **`update_plan` 维护步骤状态**（如果 SKILL Step 0 要求建 plan）：模型能
   把"第 3 步"打回 `in_progress`，UI 进度条也跟着 rewind。

### 2.3 SKILL.md 怎么写才支持灵活性

不要把所有边界都写死。原则：

- 写清楚 **默认路径（happy path）**
- 列出 **典型决策点**（"打分 ≥ 75 自动选，60-75 让用户挑，< 60 跳过"）
- **显式声明用户可介入**（见下面模板）

**推荐在 SKILL.md 末尾加这一段**：

```markdown
## 用户中途介入

任何时候用户消息里出现下列意图，立刻按用户说的来，不按 SKILL 默认走：

- "跳过 Step X" / "我已经有 X 了" → 不调对应工具，用用户提供的数据
- "重做 Step X" / "X 不对" → 仅对受影响范围重新调用相关工具
- "把 demand-N 的 X 换成 Y" → 仅重算 demand-N 这一条
- "暂停" / "先停在 Step X" / "我看下" → 不进下一步，等用户确认
- "全部重跑" → 从 Step 1 重新开始

SKILL 是参考工作流，**不是强制流程**。用户的具体指令永远优先。
```

写得越像"建议而非法律"，模型越能配合纠正。

### 2.4 进度可视化：让右栏 Progress 区点亮

HiCodex 右栏 **Progress** section 只在 ThreadItem 类型为 `todo-list` 时显示
（`rail-projection.ts:29-33`）。这种 ThreadItem 是模型调内置 `update_plan`
工具产生的。

要让 Progress 跟着 SKILL 流程亮起来，**在 SKILL.md 头部加一步 Step 0**：

```markdown
### Step 0 — 提交 plan

开始 Step 1 之前，先调内置 `update_plan` 工具提交 N 步 plan：
1. 列需求清单 — pending
2. 逐条匹配课程 — pending
...

每完成一步，再调一次 update_plan：把刚完成的步改成 completed，下一步改成 in_progress。
```

效果：用户发完输入后，**右栏立刻出现 N 个 todo 项**，每步跑完打钩。

---

## 3. MCP 工具设计：几千 / 几万 / 几百万行数据怎么查

### 3.1 核心原则

**MCP server 是"智能代理"，不是"原始 DB 端点"**：

| 错误 | 正确 |
|---|---|
| `list_instructors()` 一次返回 3000 条 | `list_top_instructors({ metric, limit: 10 })` 后端 ORDER BY 后返回 10 条 |
| 让模型自己从 3000 条里筛 | 后端 SQL/ES/向量库**先**筛/排，模型只看候选 |
| 模型自己打分 | 后端打分，工具返回 `{ score: 0-100, rationale: "..." }` |
| 一次塞全部字段 | 第一次返回摘要，模型决定要细节再调 `get_X` |

### 3.2 设计模式

#### 模式 A：`list_top_X` —— ranking 类工具

回答"最热门 / 最高分 / 最近活跃"等聚合问题。

```ts
tool list_top_instructors({
  metric: "delivery_count" | "rating" | "recent_use" | "popularity",
  timeWindow?: "30d" | "90d" | "1y" | "all",  // 默认 1y
  capabilityDimension?: string,
  unit?: string,
  limit: number,                                // 默认 10
}) → Array<{
  instructorId: string,
  name: string,
  unit: string,
  deliveryCount: number,
  avgRating: number,
  topCapabilities: string[],
  rationale: string,
}>
```

后端 SQL：

```sql
SELECT i.*, COUNT(d.id) AS delivery_count, AVG(d.rating) AS avg_rating
FROM instructors i
JOIN deliveries d ON d.instructor_id = i.id
WHERE d.completed_at > NOW() - INTERVAL '1 year'
  AND ($capability IS NULL OR EXISTS (
    SELECT 1 FROM instructor_capabilities ic
    WHERE ic.instructor_id = i.id AND ic.dimension = $capability
  ))
GROUP BY i.id
ORDER BY delivery_count DESC
LIMIT 10;
```

模型一次拿 10 条 → 直接回答用户「最热门的是 X / Y / Z」，附 rationale。

#### 模式 B：`match_X_to_Y` —— 匹配 + 评分

回答"X 跟 Y 的契合度"。重点是**评分逻辑写在后端**。

```ts
tool match_instructors_to_course({
  courseId: string,
  plannedWindow?: string,
  limit: number,                       // 默认 5
}) → Array<{
  instructorId: string,
  name: string,
  unit: string,
  score: number,                       // 0-100
  scheduleOk: boolean,
  rationale: string,
  components: {                        // 分项得分，让用户审计
    capabilityOverlap: number,
    domainKeyword: number,
    historyDelivery: number,
    rating: number,
    scheduleBonus: number,
  }
}>
```

后端打分公式（举例）：

```
score = 0.4 × Jaccard(course.dimensions, instructor.dimensions)
      + 0.3 × cosine(embed(course.outline), embed(instructor.bio))
      + 0.2 × log(1 + recent_same_direction_count)
      + 0.1 × avg_rating
- 5 × schedule_conflict_penalty

ORDER BY score DESC LIMIT 5
```

#### 模式 C：`search_X` —— 自由文本搜索

```ts
tool search_instructors({
  query?: string,
  capabilityDimension?: string,
  courseDirection?: string,
  limit: number,
}) → Array<{ ... 摘要字段 ... }>
```

#### 模式 D：`get_X` —— drill-down 拿完整详情

```ts
tool get_instructor({ instructorId: string }) → { ...full record... }
```

**两段式调用**：模型先 `search` 或 `list_top` 拿候选 → 选定 → 才调 `get_X`
拿完整档案。避免把完整数据全塞进 context。

#### 模式 E：聚合工具——服务端做 GROUP BY

不要让模型对 N 条结果再求和/平均/分组。开专门工具：

```ts
tool summarize_plans_by_dimension({ planIds: string[] }) → {
  byDimension: Record<string, { count: number, totalBudget: number }>,
  byMonth: Record<string, { count: number, totalBudget: number }>,
  byInstructor: Record<string, { count: number, totalBudget: number }>,
}
```

### 3.3 容量参考

| 数据量 | 推荐架构 |
|---|---|
| < 1k 行 | MCP 直接查 Postgres/MySQL，单次过滤 |
| 1k - 100k 行 | DB + 单字段索引 + ORDER BY + LIMIT |
| 100k - 1M 行 | DB + 复合索引 / Elasticsearch / 物化视图 |
| 1M - 10M 行 + 语义检索 | ES + 向量库（pgvector / Qdrant）双层 |
| > 10M 行 | OLAP（ClickHouse）做聚合 + 业务库 |

对"几千条"级别——**单库索引 + ORDER BY + LIMIT 就够，不需要向量库**。

### 3.4 设计 6 条铁律

1. **每个工具回答一个商业问题**，不是提供原始端点。工具名 = 用户问句。
   - 错：`query_instructors(sql_where_clause)`
   - 对：`list_top_instructors({metric, ...})` / `match_instructors_to_course({courseId})`

2. **过滤 / 排序 / 打分 一律 server 端做**。理由：稳定、可解释、高效、安全。

3. **结果必须带 `score + rationale`**。模型不用自己编理由——用 rationale 直接展示给用户。

4. **两段式：列表 + 详情**。`list_top_X` → 摘要 → 模型选 → `get_X` 拿完整记录。

5. **过滤参数用枚举 / 受控字典**。
   ```ts
   capabilityDimension: enum["思政能力", "宣传能力", ...]   ← 好
   capabilityDimension: string                              ← 凑合
   arbitraryFilter: string                                  ← 灾难
   ```

6. **聚合就再开一个工具**。后端 GROUP BY 比模型逐条求和更快更准。

### 3.5 MCP vs RAG

| | MCP（本架构） | RAG |
|---|---|---|
| 数据类型 | 结构化（DB 表/行/字段） | 非结构化（文档段落） |
| 检索方式 | 精确过滤 + 排序 + 评分 | 向量相似度 |
| 适合 | "查老师/查课程/算预算" | "合同里关于违约条款" |
| 可解释 | 高（rationale + components） | 中（相似度分数） |

业务对象走 MCP；当需要"按自然语言搜大纲长文本"时，把 **embedding 检索包装成一个 MCP 工具**：

```ts
tool semantic_search_course_outlines({ query, limit }) → ...
```

这样 MCP 保持是唯一入口，RAG 是其中一种检索手段。

---

## 4. Provenance（来源凭证）

让每条工具返回的事实都**自带出处**，模型在回答里**强制标注 `[sN]`**，前端把所有 sources 提取到右栏 Sources 区。

### 4.1 Schema

```ts
type Source = {
  id: string;                  // 稳定 ID，正文里 [s1] 引用
  kind:
    | "db"                     // 数据库行
    | "api"                    // 你们后端 HTTP API
    | "document"               // PDF/DOCX/PPT 原始文档
    | "algorithm"              // 后端算法（如匹配评分）
    | "embedding"              // 向量库
    | "human-curated";         // 人工标注/规则库
  label: string;               // 人话名字，"讲师档案库"、"2025 财年课程目录.xlsx"
  ref: string;                 // URL / 文件路径 / 表名:主键 / API endpoint
  accessedAt: string;          // ISO 时间戳
  algorithm?: string;          // kind=algorithm 时：公式简写
  confidence?: number;         // 0-1，可选
};

type Provenance = {
  sources: Source[];                              // 这条记录用到的全部 source
  fieldMap?: Record<string, string[]>;            // 字段名 → source id 数组
};
```

### 4.2 工具返回示例

```json
{
  "instructorId": "cui-wei",
  "name": "崔伟",
  "unit": "清华大学 x-lab",
  "score": 87,
  "scheduleOk": true,
  "rationale": "能力维度命中 3/3，'数智化战略' 与课程方向匹配",
  "components": {
    "capabilityOverlap": 35,
    "domainKeyword": 28,
    "history": 14,
    "rating": 10
  },
  "provenance": {
    "sources": [
      {
        "id": "s1",
        "kind": "db",
        "label": "讲师档案库",
        "ref": "instructors:cui-wei",
        "accessedAt": "2026-05-13T14:20:11Z"
      },
      {
        "id": "s2",
        "kind": "document",
        "label": "1.讲师.docx",
        "ref": "/Users/haichao/Downloads/docs/1.讲师.docx#cui-wei",
        "accessedAt": "2026-05-13T14:20:11Z"
      },
      {
        "id": "s3",
        "kind": "algorithm",
        "label": "讲师→课程评分 v2",
        "algorithm": "0.4×capJaccard + 0.3×kwSim + 0.2×log(history) + 0.1×rating",
        "accessedAt": "2026-05-13T14:20:11Z"
      },
      {
        "id": "s4",
        "kind": "api",
        "label": "档期日历",
        "ref": "POST /scheduling/check?id=cui-wei&window=2026-06..2026-09",
        "accessedAt": "2026-05-13T14:20:11Z"
      }
    ],
    "fieldMap": {
      "name": ["s1"],
      "unit": ["s1"],
      "score": ["s3"],
      "components": ["s3"],
      "scheduleOk": ["s4"]
    }
  }
}
```

### 4.3 SKILL.md 强制要求模型标注

在 SKILL.md 加一段（强制段）：

```markdown
## 来源标注（强制）

每次给用户呈现工具返回的具体事实（讲师名 / 课程大纲 / 评分 / 预算……），
**必须在事实后立刻加 `[sN]`**，N 是该工具返回 provenance.sources 里对应 source 的 id。

最终方案末尾必须有 ## 数据来源 章节，把本轮对话中用过的所有 source 列出：

[s1] 讲师档案库 · instructors:cui-wei · 2026-05-13 14:20
[s2] 1.讲师.docx · /Users/haichao/Downloads/docs/1.讲师.docx#cui-wei
[s3] 讲师→课程评分 v2 · 0.4×capJaccard + 0.3×kwSim + 0.2×log(history) + 0.1×rating
[s4] 档期日历 · POST /scheduling/check
...

如果用户问"为什么选 X"，引用对应 source id 给出 rationale + 出处。
不允许凭印象描述，不允许引用 SKILL 没让你调的工具返回。
```

### 4.4 UI 上的呈现

**正文里**——模型写：

```
推荐 **崔伟**（清华大学 x-lab）[s1]，与课程能力维度命中 3/3 [s3]，
档期 2026-06 至 2026-09 可用 [s4]，历史交付集中在党建宣传方向 [s2]。
```

**右栏 Sources section**——前端把整轮 tool result 里所有 `provenance.sources` 去重收集，渲染成列表：

```
📂 讲师档案库 · 4 次引用
📄 1.讲师.docx · 2 次引用
⚙️ 讲师→课程评分 v2 · 5 次引用
🌐 档期日历 · 8 次引用
```

每条可点击跳转：
- `kind = document` → docx 预览面板（已有，`apps/desktop/src-tauri/src/document_preview.rs`）
- `kind = db` → 单条详情
- `kind = api` → 显示请求/响应
- `kind = algorithm` → 显示公式 + 输入

**最终方案表格里**——每个单元格 hover 出 tooltip 显示对应 source。

### 4.5 分阶段实施

| Phase | 改什么 | 工作量 |
|---|---|---|
| **Phase 1** | MCP 协议层：`Source/Provenance` 类型 + 11 函数返回值加 `provenance` + zod schema + SKILL.md 加强制段 | ~30 分钟 |
| **Phase 2** | HiCodex 前端：右栏 Sources 区按 source.id 分行展示，可点击 (`rail-projection.ts:76-85` 扩展) | ~30-60 分钟 |
| **Phase 3** | 持久化：每条最终方案在 DB 里一起存 sources 数组，历史可追溯 | 按业务系统而定 |

完成 Phase 1 后，**即使前端不改**，正文里的 `[s1][s2]` + 末尾 `## 数据来源` 列表已经是完整的审计闭环。

### 4.6 安全 / 注意事项

- **不放敏感数据**：`ref` 别带密码 / token / PII。`label` 是业务可见名。
- **算法 source 要版本化**：评分公式改了，把 `label` 从 v2 升 v3，老方案别突然变。
- **不可凭空捏造 source**：SKILL 里再强制一遍——"工具没返回 provenance 时，宁可标 `[来源缺失]` 也不准编"。

---

## 5. 落到本 demo 的状态

### 5.1 已实现

- ✅ MCP server：11 个工具 + 1 个聚合工具，按"商业问题"命名
- ✅ 工具签名遵循模式 A/B/C/D（`list_top_*` / `match_*_to_*` / `search_*` / `get_*`）
- ✅ Match 类工具已带 `score + rationale + scheduleOk` 等字段
- ✅ SKILL.md：6 步工作流、决策点（评分阈值）、跳过/失败恢复规则、用户中途介入预留
- ✅ MCP server 注册到 `~/Library/Application Support/HiCodex/codex-home/config.toml`
- ✅ 烟雾测试：`tools/list` 正常返回 11 个工具

### 5.2 待办

- ⏳ **Step 0（plan）**：SKILL.md 加 `update_plan` 引导，点亮右栏 Progress
- ⏳ **Mock 数据模式**：`api-client.ts` 切到读 `~/Downloads/docs/training_demands.json` 真实 34 条 + 内置课程/讲师 mock，免等真 API
- ⏳ **Phase 1 provenance**：11 个函数加 `provenance` 返回；SKILL.md 加来源标注强制段
- ⏳ **Phase 2 UI**：HiCodex 右栏 Sources 按 source.id 分行（目前一个 MCP server 只占一行）
- ⏳ **`list_top_*` 类工具**：`list_top_instructors`、`list_top_courses` 等热门类查询

---

## 6. 参考文件

```
examples/internal-api-demo/
├── DESIGN.md                                    ← 本文
├── README.md                                    ← 启动步骤
├── mcp-server/
│   ├── src/server.ts                            ← 工具注册 + JSON-RPC
│   └── src/api-client.ts                        ← 11 个业务函数（改这一个文件接真 API）
└── skill/annual-training-plan/SKILL.md          ← 工作流定义
```

HiCodex 相关代码：

| 主题 | 文件 |
|---|---|
| 右栏 Sources / Progress 投影逻辑 | `packages/ui/src/state/rail-projection.ts` |
| 右栏 UI 渲染 | `packages/ui/src/components/right-rail.tsx` |
| 文件预览（docx/xlsx） | `apps/desktop/src-tauri/src/document_preview.rs` |
| Skill 加载位置 | `~/Library/Application Support/HiCodex/codex-home/skills/` |
| MCP 配置 | `~/Library/Application Support/HiCodex/codex-home/config.toml` |
