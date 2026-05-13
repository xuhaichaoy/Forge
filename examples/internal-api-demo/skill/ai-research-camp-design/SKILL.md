---
name: ai-research-camp-design
description: 设计 AI / 人工智能领域的多日研修营完整方案。围绕 6 个能力维度组织课程模块（知识与理解 / 伦理与道德 / 技能与经验 / 创新能力与系统思维能力 / 团队协作与交流能力 / 可持续发展与终身学习能力），输出共性课 + 分班深度课 + 讲师阵容 + 评估方案 + 成果册大纲。触发关键词：AI 研修营、人工智能研修营、AI 集训营、AI 高研班、AI 领军人才培训、人工智能高级研修、ai research camp、AI training camp。可调用工具：search_51cto_courses / search_51cto_lecturers / match_courses_to_dimensions / rank_lecturers_for_topic / compose_camp_schedule。
argument-hint: "<研修营主题> [天数] [分班] [学员对象]"
user-invocable: true
---

# AI 研修营设计方法论

本 SKILL 教模型**如何**设计一份 AI 研修营方案。它**不规定数据从哪来**：
- 用户可以直接在对话里粘贴讲师资料 / 课程清单
- 用户可以 @ 附件上传 docx / xlsx / PDF（HiCodex 会自动提取文本到上下文）
- 用户什么都没给时，调 51CTO API（讲师 + 课程两个真实端点）

工具只做两件模型独立完成不稳定的事：① 调 51CTO API；② 跑评分 / 排序 / 编排算法。

## 设计原则（必须遵守）

1. **课程模块化**：所有课程归到 6 个能力维度之一
   - 知识与理解 · 伦理与道德 · 技能与经验
   - 创新能力与系统思维能力 · 团队协作与交流能力 · 可持续发展与终身学习能力
2. **分层授课**：共性课（全员）+ 深度课（分班，建议 ≥ 2 班）
3. **形式多样**：集中授课 / 案例分析 / 专题研讨 / 探索实践 / 研学考察 / 团队攻关
4. **线上线下结合**：用户没明确要求时默认混合，至少 ~30% session 标线上
5. **评估闭环**：参与度 + 成果作品 + 路演评分；末日产出成果册

## 何时触发

用户输入命中以下任一：
- "给我设计一个 AI 研修营 / 集训 / 高研班"
- "针对 X 人群做一个 AI 培训方案"
- "AI 领域 N 天研修营 / 培训"
- "AI 领军人才培养"
- 显式 `/ai-research-camp-design`

**不要触发**：单独搜某个 AI 讲师/课程 → 直接调对应单点工具。

## 工作流

### Step 0 — 提交 plan（强制）

调内置 `update_plan` 工具提交 7 步 plan：

1. 解析项目需求 — pending
2. 搜集课程候选（用户输入 + 必要时 51CTO） — pending
3. 课程 → 6 维度匹配（共性课） — pending
4. 分班深度课选定 — pending
5. 搜集讲师候选（用户输入 + 必要时 51CTO） — pending
6. 讲师阵容排序与挑选 — pending
7. 编排 schedule + 评估 + 成果册 + 渲染 — pending

完成一步就重调 update_plan 把它标 completed，下一步标 in_progress。

### Step 1 — 解析需求

从用户输入抽以下结构（按存在 / 缺失分别处理）：

- **研修主题**（必需）—— 用户原话提炼
- **天数** —— 用户给就用，没给问一次
- **分班** —— 用户给数量 + 方向就用；没给默认 2 个（"AI 应用开发分班" / "AI 战略与场景分班"）
- **学员对象** —— 例如"研发"、"产品"、"管理层"、"全员"
- **线上线下要求** —— 默认混合
- **特殊评估要求** —— 例如"加赛课"、"出版成果册"

复述给用户确认后再进 Step 2。

### Step 2 — 搜集课程候选

按优先级走：

1. **用户已在对话里提供课程清单**（粘贴文本 / @ 附件）→ 从上下文里 parse 出结构化 `courses[]` 数组，每条至少有 `title`，可选 `objective / outline / duration / audience / category`
2. **用户没提供** → 调 `search_51cto_courses({ searchContent: 主题关键词, size: 50 })` 拉候选
3. **既有用户输入也想用 51CTO 扩充** → 两路合并

确认候选范围：告诉用户"我从 [来源] 识别出 N 门课，主题分布如下..."

### Step 3 — 课程 → 6 维度匹配（共性课）

调一次 `match_courses_to_dimensions({ courses: <Step 2 候选>, dimensions: <6 维度全集或子集>, audience, limitPerDimension: 3 })`。

工具会返回每个维度的 Top N，每条带 score / rationale / hitKeywords，以及 `uncovered` 数组（哪些维度课程库覆盖不足）。

挑选规则：
- 每个维度取 Top 1 作为共性课
- 如果 Top 1 分数 < 40，标 warning "X 维度课程库匹配度偏低"
- `uncovered` 里的维度向用户提问"是否补充该维度课程？"

### Step 4 — 分班深度课

按用户给的分班方向：
- 调 `search_51cto_courses({ searchContent: 分班关键词 })` 拉候选
- 或从 Step 2 的总候选里再过滤
- 每分班选 2-3 门（**优先时长 ≥ 1 天**）

不调 `match_courses_to_dimensions`（深度课不是按维度选，是按分班方向选）。

### Step 5 — 搜集讲师候选

学院派来源：
- **优先用户提供**（粘贴 / 附件中的讲师资料）→ parse 成 `LecturerLike[]`，每条至少有 `name`，可附 `unitOrCompany / title / bio / isAcademician / expertise / domains`
- 用户没给 → 调 `search_51cto_lecturers({ keyword: 主题, size: 30 })` 拿一批，再根据 `companyName / jobTitle` 判断哪些是高校（含"大学"、"学院"、"研究院"等）

产业派来源：
- 一律调 `search_51cto_lecturers({ keyword: 主题, size: 50 })` 真实拉
- 也可以多次调，分别 `keyword="大模型"`、`keyword="Agent"`、`keyword="AI 治理"` 累加候选

### Step 6 — 讲师排序与挑选

调 `rank_lecturers_for_topic({ lecturers: <学院派 + 产业派合并>, topic, limit: 30 })`。

工具按综合分排序（rating × 10 + 合作次数 × 5 + domain 命中 30 + 院士加分 50 等）。

从排序结果挑：
- 前 N 个有 `isAcademician=true` 或 `category=academic` 的 → 学院派阵容
- 前 N 个 `category=industry`（51CTO 来的默认归 industry）→ 产业派阵容
- 用户要求"10 高校 + 10 产业"时按此数量取，不足时标 warning

### Step 7 — 编排 + 渲染

把 Step 3 选定的 6 门共性课、Step 4 选定的深度课、Step 6 选定的讲师阵容，组装成 `compose_camp_schedule` 的输入：

```ts
compose_camp_schedule({
  topic, days, branches,
  commonCourses: [
    { dimension: "知识与理解", course: {...}, lecturer: {...} },
    { dimension: "伦理与道德", course: {...}, lecturer: {...} },
    ...
  ],
  deepCourses: [
    { branch: "AI 应用开发分班", course: {...}, lecturer: {...} },
    { branch: "AI 应用开发分班", course: {...}, lecturer: {...} },
    { branch: "AI 战略与场景分班", course: {...}, lecturer: {...} },
    ...
  ],
  blendOnlineOffline: true,
})
```

工具返回 `schedule[]` + `evaluationPlan[]` + `outputDeliverable[]` + `warnings[]` + `provenance`。

**讲师分配启发式**（在 Step 6 → Step 7 之间做）：
- 共性课的 "知识与理解"、"伦理与道德"、"可持续发展" 维度 → 优先配学院派
- 共性课的 "技能与经验"、"创新能力" → 优先配产业派
- 深度课 → 学院派 + 产业派各占 ~一半

最终按下面模板渲染。

## 渲染模板

```markdown
# <研修营主题>

**天数**：N · **分班**：M · **学员**：<对象> · **维度覆盖**：6

## 设计要点

- 6 维度课程模块（共性课）+ N 分班深度课（深度课）
- 形式多样：集中授课 / 案例分析 / 专题研讨 / 探索实践 / 团队攻关
- 线上线下混合：约 N% 线上、其余线下
- 学员实践：第 N 天团队攻关 + 成果路演

## 课程模块（6 维度共性课）

| # | 维度 | 课程 | 时长 | 讲师 | 形式 | 出处 |
|---|---|---|---|---|---|---|
| 1 | 知识与理解 | <title> [s-course] | 3h | <name>（<unit>）[s-instr] | 集中授课 | |
| ... | ... | ... | ... | ... | ... | |

## 分班深度课

### <分班 A>

| 课程 | 时长 | 讲师 | 形式 |
|---|---|---|---|
| ... | ... | ... | ... |

### <分班 B>

...

## 讲师阵容

### 高校 / 院士级（10 位）

| # | 姓名 | 单位 | 职称 | 擅长领域 | 出处 |
|---|---|---|---|---|---|
| ... | ... | ... | ... | ... | [sN] |

### 产业 / 科技机构专家（10 位）

| # | 姓名 | 公司 | 职务 | 擅长领域 | 面授单价 | 51CTO 评分 | 出处 |
|---|---|---|---|---|---|---|---|
| ... | ... | ... | ... | ... | ¥X,XXX | <score> | [s-51cto] |

## N 天日程总表

| Day | 时段 | 内容 | 形式 | 维度 | 讲师 | 线上/线下 |
|---|---|---|---|---|---|---|
| 1 | 上午 | ... | ... | ... | ... | ... |
| ... | ... | ... | ... | ... | ... | ... |

## 学员研修评估方案

- 课程参与度：每日签到 + 课中互动评分
- 学习成果评估：每日小测 + 课题作业 + 团队攻关成果路演
- 优秀学员评选标准：参与度 (30%) + 作业质量 (30%) + 路演评分 (40%)
- 优秀成果挖掘：评委选出 Top 3 团队作品，深度访谈整理成案例

## 成果册大纲

- 研修营摘要（目标、议程、学员构成）
- 每位学员的反思笔记 / 个人收获
- Top 3 团队成果案例（详细方案 + 评委点评）
- 讲师阵容名片合集
- 课程录像 / 课件包索引
- 后续行动清单

## 风险与提示

<列出 compose_camp_schedule 返回的 warnings + 自己识别的风险>

## 数据来源

[s-51cto-lecturer-api] 51CTO 企培讲师库 · GET /devpc/user/lecturers · <N 条引用>
[s-51cto-course-api] 51CTO 企培课程库 · GET /devpc/user/lecturer/course/list · <N 条引用>
[s-user-input] 用户在对话提供（粘贴 / @ 附件） · <N 条引用>
[s-dim-match-v2] 课程→维度匹配算法 v2
[s-lecturer-rank-v2] 讲师→主题排序算法 v2
[s-camp-composer-v2] 研修营编排算法 v2
```

## 用户中途介入（重要）

任何时候用户消息出现下列意图，立刻照办，不按 SKILL 默认走：

- "我已经有 X 了" / "跳过 Step X" → 不调对应工具，用用户提供的数据
- "重做 Step X" / "X 不对" → 仅对受影响范围重跑相关工具
- "换掉讲师 X" / "加一位 Y" → 再调一次 `search_51cto_lecturers` 用姓名筛，或用户提供的 list 里挑
- "<某维度>课程不合适" → 重调 `match_courses_to_dimensions` 改 `audience` 或 `preferDuration`
- "把 Day N 改成线上" → 直接改 schedule[i].online，不重跑工具
- "全部重跑" → 从 Step 1 开始
- "暂停" / "我看下" → 不进下一步，等用户确认

**SKILL 是参考工作流，不是强制流程。用户指令永远优先。**

## 来源标注（强制）

每个具体事实（讲师名、课程名、单价、评分、维度匹配 score、能力维度名）后面**必须**加 `[sN]`：
- `[s-51cto-lecturer-api]` —— 51CTO 讲师 API
- `[s-51cto-course-api]` —— 51CTO 课程 API
- `[s-user-input]` —— 用户对话/附件提供
- `[s-dim-match-v2]` —— 维度匹配算法
- `[s-lecturer-rank-v2]` —— 讲师排序算法
- `[s-camp-composer-v2]` —— 编排算法

末尾必须有 `## 数据来源` 章节列全。

**不允许凭印象描述。不允许引用 SKILL 没让你调的工具返回。** 工具没返回的字段宁可标 `[来源缺失]` 也不能编。

## 约定

- 金额：人民币、千分位、含税。51CTO 单价直接显示 `¥X,XXX`
- 讲师隐私：51CTO 库里 "对外不能使用真名" 的讲师，引用时用化名 + 公司 + 职务
- 不可凭空生成讲师/课程名：所有名字必须来自工具返回或用户输入
- 用户提供数据格式不严格时（粘贴的混乱文本），你负责 parse 成结构化记录后再调工具

## 失败恢复

- `search_51cto_*` 失败 → 检查 token / 网络，重试 1 次；仍失败 → 在最终方案标 "51CTO API 当前不可用，讲师/课程候选仅来自用户提供"
- `match_courses_to_dimensions` 某维度 0 命中 → 在最终方案 warnings 标该维度需要补课程
- `rank_lecturers_for_topic` 院士不足 → 在最终方案标 "学院派 N 位中包含院士 M 位"
- `compose_camp_schedule` warnings 非空 → 全部列入最终方案的"风险与提示"章节
- 重试规则：同一工具 + 同一参数最多 1 次。要重试就改参数。
