---
name: annual-training-plan
description: 编排年度教育培训方案（需求 × 课程 × 讲师 × 排期 × 预算）。触发关键词：'年度培训方案'、'培训规划'、'XX 人群的培训计划'、'帮我给 XX 出方案'、'整理 2026 年培训重点项目'、'按赋能人群拉培训方案'、'annual training plan'、'training proposal'。使用 `training-api` MCP server 的工具：list_training_demands / match_courses_to_demand / match_instructors_to_course / compose_training_plan / propose_annual_training_plan。
argument-hint: "<赋能人群> [能力维度] [计划窗口]"
user-invocable: true
---

# 年度教育培训方案编排

本 SKILL 把"按赋能人群出年度培训方案"这条复杂工作流拆成可观测的多步：
**需求清单 → 课程匹配 → 讲师匹配 → 组方案 → 汇总预算 → 渲染**。
每一步都对应 `training-api` MCP 上的一个工具，所有数据都从内部 API 拉，
绝不在 chat 里凭印象编课程名或讲师名。

## 何时触发

用户输入命中任意一种：
- "给 X 人群出年度培训方案" / "X 这个赋能人群的 2026 培训规划"
- "帮我把 X 的培训需求整理成方案"
- "按 X 人群拉一份完整的培训方案"
- "X 的 Q3 培训怎么安排" / "X 这个季度的能力建设方案"
- 显式 `/annual-training-plan`

**不要**触发的场景：
- 用户只问某一条需求 / 某一门课 / 某一位讲师的事 →
  直接用对应单点工具（`get_training_demand` / `get_course` / `get_instructor`）。
- 用户只想搜课程或讲师 → 用 `search_courses` / `search_instructors`。
- 用户要看历史已存方案 → 用 `list_training_plans`。

## 输入解析

从用户输入里抽：

1. **赋能人群**（必需）。允许值固定 7 个：
   `干部及骨干人才` / `党建职能专项人才` / `人力职能专项人才` /
   `在线营销服务人才` / `一线生产转型人才` / `数智科技人才` / `其他`。
   如果用户写的是同义词（"党务人员" → `党建职能专项人才`、"营销" →
   `在线营销服务人才`、"IT/数智化条线" → `数智科技人才`），自己映射一次，
   并在第一句话里告诉用户你做了映射。

2. **能力维度**（可选，可多选）。常见值：
   `思政能力` / `宣传能力` / `履职能力` / `管理能力` / `数智化思维` /
   `互联网思维` / `创新思维` / `生态思维` / `用户体验思维/客户意识` /
   `安全生产` / `职工关爱项目` / `内训师赋能项目`。
   用户没提就别填。

3. **计划窗口**（可选）。"Q3" → `7-9月`；"上半年" → `1-6月`；
   "2026 全年" → `2026 全年`。这个只影响汇总文档标题和 `propose_annual_training_plan` 的过滤，
   不影响每条需求自身的 `plannedWindow`（那个由数据决定）。

## 主流程

### Step 1 — 列需求清单

调 `training-api.list_training_demands({ audienceGroup, capabilityDimension? })`。

- 返回空 → 停。告诉用户该人群在数据里没有登记的需求，建议
  (a) 换人群确认 (b) 让 HR 先补需求登记。
- 返回 1 条 → 直接进 Step 2。
- 返回 N 条 → 在回话里先**列一张需求摘要表**（序号 / 能力维度 / 培训对象 /
  时长×次数 / 计划窗口 / 内训or外聘），让用户确认范围，再继续。
  如果用户说"全部"或没有进一步限定，自动进 Step 2 处理全部。

### Step 2 — 逐条需求匹配课程

对 Step 1 选定的每一条需求 `d`：

1. 调 `training-api.match_courses_to_demand({ demandId: d.id, limit: 5 })`。
2. 检查返回的 `score`：
   - 最高分 ≥ 75 且与第二名差 ≥ 10：自动选最高分。
   - 最高分 ≥ 60 但与第二名差 < 10：列前 3 候选给用户挑（标题 / score /
     rationale）。如果用户没回，**先选最高分**继续，并在最终方案里标
     `warning: 与第二名分差小`。
   - 最高分 < 60：跳过这条需求，记入 `skipped`，原因写 "无足够匹配课程"。

把每条需求选定的课程缓存在内存里作 `selectedCourses[d.id]`。

### Step 3 — 逐课程匹配讲师

对每个 `selectedCourses[d.id]`：

1. 调 `training-api.match_instructors_to_course({ courseId, plannedWindow: d.plannedWindow, limit: 5 })`。
2. 过滤 `scheduleOk === true` 的候选；如果都为 false，把"档期冲突"
   写进该条需求的 warning，依然按最高分选一个。
3. 选最高分讲师；如果用户提过具体讲师名（在原始 prompt 里），优先选名字匹配的。
4. 如果该需求的 `external === false`（纯内训），跳过这步，instructorId 用
   `internal:auto` 占位，由 `compose_training_plan` 决定。

### Step 4 — 组方案

对每条 `(demand, course, instructor)` 三元组：

调 `training-api.compose_training_plan({ demandId, courseId, instructorId })`。

服务端返回完整 `TrainingPlan`（已经算好 totalDays、preTax/VAT/postTax 预算、
warnings 数组）。**直接用服务端返回的预算，不要在 chat 里重算**。

如果某个 demand 在 Step 2 或 Step 3 被跳过，记录到 `skipped` 列表，不调
`compose_training_plan`。

### Step 5 — 汇总

把所有 `plans` 聚合：
- `totalPostTaxCny = sum(plan.budget.postTaxCny)`
- 按能力维度分组列计数
- 按计划窗口（月份）分桶
- 按讲师汇总（同一讲师承接的课程数 / 总天数 / 单点预算）

### Step 6 — 渲染

按下面模板输出。**所有金额带千分位**。**讲师只在底表里写姓名 + 单位**，
不要把履历原文塞进总表。

```
# <赋能人群> 培训方案 — <计划窗口>

**需求数**：N  ·  **方案数**：M  ·  **跳过**：K  ·  **总预算（含税）**：¥X,XXX,XXX

## 方案总表

| # | 能力维度 | 课程 | 讲师 | 培训对象 | 时长×次数 | 计划窗口 | 培训方式 | 预算（含税） |
|---|---|---|---|---|---|---|---|---|
| 1 | 思政能力 | 知行工作研习班 | 崔伟（清华x-lab） | 党务工作者 | 1天×3次 | 6-9月 | 外聘面授 | ¥XX,XXX |
| 2 | ... | ... | ... | ... | ... | ... | ... | ... |

## 跳过的需求

| 序号 | 原因 |
|---|---|
| ... | 无足够匹配课程 |

## 预算分布

按能力维度（含税）：
- 思政能力 ¥XX,XXX
- 宣传能力 ¥XX,XXX
- ...

按月份：
- 6 月 ¥XX,XXX (Y 个项目)
- 7 月 ...

## 主要讲师

- **崔伟** · 清华大学 x-lab · 承接 N 课程，共 X 天，¥XX,XXX
- **余少华** · 中国工程院院士 · 承接 …

## 风险与提示

- < 这里列所有 warnings：档期冲突 / 课程匹配差 / 预算超 ARR 等 >

## 数据来源（点击查看每一步工具调用）
- list_training_demands(audienceGroup="<...>", capabilityDimension="<...>")
- match_courses_to_demand × N
- match_instructors_to_course × M
- compose_training_plan × M
```

## 一步到位的快捷路径

当用户明显在催"直接给我结果别问那么多"时，跳过 Step 1 - Step 4 的逐步交互，
直接调：

```
training-api.propose_annual_training_plan({
  audienceGroup: <赋能人群>,
  plannedWindow: <可选>,
  capabilityDimensions: <可选>
})
```

服务端会一次性把整个 Step 1-4 跑完，返回 `{ plans, skipped, summary }`。
拿到结果直接进 Step 5+Step 6 的渲染。

代价是：每条需求自动选最高分课程 + 最高分讲师，不允许用户介入选择。
这条快捷路径**只在用户明确要"一键出方案"或"先看默认方案"时用**；其他时候
保持 Step 1 - Step 4 的逐步流程，让用户对关键选择点有掌控。

## 约定

- **金额**：人民币、千分位、含税单价为主。引用单价时同时给出"不含税×天数"
  和"含税单价"（核对依据）。
- **隐私 / 讲师档案**：履历段落不进入总表；只在用户追问"为什么选 XX"时
  调 `get_instructor` 拉详情贴回话。
- **不可凭空生成讲师名 / 课程名**：所有名字都必须来自工具返回。如果工具
  没返回，宁可标"待补"，绝不编。
- **数据源标注**：最终报告底部列出本次用到的所有工具调用名 + 入参，方便
  PM 复核。

## 失败恢复

- `list_training_demands` 返回空 → 见 Step 1 处理。
- `match_courses_to_demand` 全部 score < 60 → 列出来让用户决定（保留低分 / 换需求 / 跳过）。
- `match_instructors_to_course` 全部 scheduleOk: false → 在 warning 标注，
  继续按最高分选，但建议用户调整 `plannedWindow`。
- `compose_training_plan` 抛错 → 把错误原文展示给用户，跳过这条需求。
  不要静默吞错。
- 重试规则：同一工具 + 同一参数最多调用 1 次。要重试就改参数。
