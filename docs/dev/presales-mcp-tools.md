# 售前知识库 MCP 工具设计

本文定义售前 AI 工作台原型需要的 MCP 工具边界。目标不是做一个泛用搜索框，而是让每个 Skill 能稳定读取业务证据、判断缺口、产出文件，并在最终方案生成时保留可追溯依据。

## 1. 设计目标

售前流程仍然以 HiCodex 对话为入口：

```text
用户选择 Skill
  -> Skill 读取当前项目产物文件
  -> Skill 通过 MCP 查询 API 数据、文件知识库和人工口径
  -> Skill 判断资料是否足够
  -> 足够则输出本步骤产物文件
  -> 不足则停止并列缺口
```

关键原则：

- 不依赖超长对话记忆。每一步以上一步产物文件和 manifest 状态为事实来源。
- 未显式确认的上一步产物也可以继续读取，但必须提示“按当前文件继续”。
- 如果缺关键字段，Skill 停止并追问，不生成正式产物。
- API 数据、文件知识库、人工口径同时存在时，人工口径和最近合作证据优先。
- 对客方案只输出客户可看的内容；内部评分、负面反馈、引用依据保留在内部依据包。

## 2. 数据优先级

Skill 判断同一事实时按以下优先级合并：

1. 当前项目人工口径：售前或业务负责人明确补充的当前判断。
2. 最近同类合作案例：近 3-6 个月同讲师、同客户、同课程或同场景项目复盘。
3. API 实时数据：讲师库、项目管理系统、CRM、课纲库。
4. 业务确认过的文件知识库资料。
5. 平台旧资料、未确认上传资料、仅语义相似但缺证据的资料。

工具返回结果必须带 `sourcePriority` 和 `authorityStatus`，不能只返回相似度。

## 3. 通用返回结构

所有 MCP 工具建议返回统一 envelope：

```json
{
  "status": "ok",
  "summary": "可给模型直接阅读的短摘要",
  "data": {},
  "evidence": [],
  "missingInputs": [],
  "warnings": [],
  "sourceMeta": {
    "sourcePriority": "manual_preference|recent_case|api|confirmed_file|unconfirmed_file|stale_platform",
    "authorityStatus": "current|candidate|stale|unconfirmed|project_attachment_only",
    "asOf": "2026-05-19T00:00:00+08:00"
  }
}
```

`status` 建议取值：

| status | 含义 | Skill 行为 |
| --- | --- | --- |
| `ok` | 数据足够 | 可以继续生成本步骤产物 |
| `missing_input` | 缺关键输入 | 停止，列缺口，不生成正式产物 |
| `not_found` | 查不到目标 | 停止或要求用户补资料 |
| `stale_source` | 只有旧资料 | 可用于风险提示，不能当强依据 |
| `needs_human_review` | 有冲突或权限不明 | 停止，要求人工确认 |
| `permission_denied` | 无权限读取/引用 | 不得写入对客方案 |

证据项建议结构：

```json
{
  "evidenceId": "ev_001",
  "sourceType": "api|file|manual|project_artifact",
  "title": "王老师_金融领导力课纲_2026版.docx",
  "location": "第 3 页 / 金融跨部门协同",
  "excerpt": "简短引用或摘要",
  "entityRefs": ["teacher:wang", "course:financial-leadership"],
  "authorityStatus": "current",
  "clientUsable": true,
  "internalOnlyReason": null
}
```

## 4. 工具分组

### 4.1 项目产物与人工口径

这些工具不一定属于远端知识库，也可以由本地项目 MCP 或 app-layer overlay 实现。它们解决“每一步产物文件怎么被后续 Skill 稳定读取”的问题。

| 工具 | 用途 | 典型调用方 |
| --- | --- | --- |
| `presales.project_manifest.read` | 读取当前项目所有步骤产物、状态、hash、Skill 版本、依赖关系 | 所有 Skill |
| `presales.project_artifact.read` | 读取某一步当前产物文件，允许未确认但需返回状态 | 下游 Skill |
| `presales.project_artifact.write` | 写入当前 Skill 的产物文件和结构化 record | 所有产出型 Skill |
| `presales.project_artifact.hash` | 检测外部文件是否被修改 | 所有 Skill 启动前 |
| `presales.project_artifact.mark_status` | 标记草稿、按当前文件继续、已确认、上游已变更 | UI 或 Skill |
| `presales.manual_preference.record` | 记录当前项目人工口径 | 对话和 Skill |
| `presales.manual_preference.read` | 读取当前项目人工口径 | 所有 Skill |
| `presales.manual_preference.promote` | 将项目口径沉淀为长期讲师/客户/行业规则候选 | 人工确认后 |

`presales.project_manifest.read`

输入：

```json
{
  "projectId": "a-bank-2026-leadership"
}
```

输出要包含：

- 当前步骤文件列表。
- 每个文件的 `status`：`draft`、`usable_current`、`confirmed`、`modified_external`、`outdated_by_upstream`。
- `confirmedHash`、`currentHash`、`lastModifiedAt`。
- `skillName`、`skillVersion`、`schemaVersion`。
- 依赖了哪些上游文件 hash。

Skill 行为：

- 未确认但存在当前文件：可以读，但开头提示“将按当前文件继续”。
- 文件外部修改：重新计算 hash，提示“检测到外部修改，本轮读取最新版本”。
- 上游变更导致下游过期：启动正式生成前提示是否重跑相关步骤。

### 4.2 客户与需求上下文

| 工具 | 用途 | 典型调用方 |
| --- | --- | --- |
| `presales.customer_context.get` | 从 CRM/API 读取客户、部门、机会、历史合作 | `@需求分析` |
| `presales.requirement.extract_from_files` | 从用户上传资料和历史文件提取需求字段 | `@需求分析` |
| `presales.requirement.check_missing_inputs` | 判断需求是否足够进入下一步 | `@需求分析`、所有下游 Skill |
| `presales.similar_projects.find` | 找相似历史项目、方案、复盘 | `@需求分析`、`@讲师匹配` |

`presales.requirement.check_missing_inputs`

输入：

```json
{
  "projectId": "a-bank-2026-leadership",
  "targetStep": "teacher_matching",
  "knownFields": {
    "customerName": "A 银行",
    "trainingAudience": "中高层管理者约 80 人",
    "trainingDays": "2 天 1 晚",
    "budget": "45-60 万"
  }
}
```

输出：

```json
{
  "status": "missing_input",
  "missingInputs": [
    {
      "field": "customer_2026_strategy",
      "severity": "blocking",
      "whyItMatters": "无法判断培训主线是增长、降本、协同还是管理升级",
      "askUser": "请补充客户 2026 年战略重点，或上传最新沟通纪要。"
    }
  ],
  "canProceed": false
}
```

规则：

- 阻塞字段缺失时不生成正式产物。
- 可以生成“缺口清单.md”，但不能生成需求分析结论、讲师推荐或方案正文。

### 4.3 讲师查询与推荐

| 工具 | 用途 | 典型调用方 |
| --- | --- | --- |
| `presales.teacher_profile.get` | 获取讲师基础档案、方向、行业、课程、报价区间 | `@讲师匹配` |
| `presales.teacher_availability.get` | 获取档期、城市、交付方式、助教资源 | `@讲师匹配` |
| `presales.teacher_recent_cases.list` | 获取最近合作案例和复盘评价 | `@讲师匹配` |
| `presales.teacher_feedback.summarize` | 聚合客户评价、满意度、负面反馈 | `@讲师匹配` |
| `presales.teacher_rank` | 按业务规则和人工口径排序 3-5 个候选讲师 | `@讲师匹配` |
| `presales.teacher_risk.check` | 检查客户曾拒绝、合作暂停、报价风险、档期风险 | `@讲师匹配` |

`presales.teacher_rank`

输入：

```json
{
  "projectId": "a-bank-2026-leadership",
  "requirementArtifact": "01_需求分析.md",
  "constraints": {
    "industry": "银行",
    "topic": ["中高层领导力", "跨部门协同", "工作坊"],
    "deliveryDate": "2026-06-late",
    "city": "北京",
    "budget": "45-60 万",
    "candidateCount": 5
  },
  "weights": {
    "direction": 0.25,
    "industry": 0.2,
    "recentCase": 0.2,
    "teacherAbility": 0.2,
    "priceFit": 0.15
  }
}
```

输出必须包含：

- 3-5 个候选讲师。
- 每位讲师的总分、分项分、风险扣分。
- 推荐意见：第一推荐、预算内备选、局部模块备选、不推荐。
- 证据：API 字段、近期项目、文件片段、人工口径。
- 一票否决原因。
- 不能对客引用的内部信息要标记 `clientUsable: false`。

输出示例：

```json
{
  "status": "ok",
  "data": {
    "candidates": [
      {
        "teacherId": "teacher_wang",
        "name": "王老师",
        "recommendation": "first_choice",
        "score": 91,
        "scoreBreakdown": {
          "direction": 24,
          "industry": 20,
          "recentCase": 19,
          "teacherAbility": 17,
          "priceFit": 14,
          "riskDeduction": -3
        },
        "risks": ["报价略高", "6 月下旬档期需锁定"],
        "evidenceIds": ["ev_teacher_api_01", "ev_recent_case_03", "ev_syllabus_02"]
      }
    ]
  }
}
```

### 4.4 课程与课纲匹配

| 工具 | 用途 | 典型调用方 |
| --- | --- | --- |
| `presales.syllabus_candidates.find` | 按讲师、需求、天数、行业找课纲候选 | `@课程匹配` |
| `presales.course_module.search` | 搜课程模块、工作坊模块、案例模块 | `@课程匹配` |
| `presales.syllabus_gap.check` | 判断现有课纲能否覆盖需求 | `@课程匹配` |
| `presales.syllabus_compose_plan` | 给出复用/改写/新生成的模块组合建议 | `@课程匹配` |
| `presales.case_evidence.search` | 查找可用于课程中的行业案例 | `@课程匹配`、`@内容包装` |

`presales.syllabus_candidates.find`

输入：

```json
{
  "projectId": "a-bank-2026-leadership",
  "teacherIds": ["teacher_wang", "teacher_liu"],
  "requirementArtifact": "01_需求分析.md",
  "teacherArtifact": "02_讲师推荐.md",
  "constraints": {
    "trainingDays": "2 天 1 晚",
    "audience": "中高层管理者",
    "mustHave": ["真实案例复盘", "行动计划共创"],
    "avoid": ["纯理论模型"]
  }
}
```

输出要求：

- 标明每个模块来自哪个讲师课纲或案例库。
- 标明复用、局部改写、AI 新生成。
- 如果用 A 讲师的工具包给 B 讲师授课，必须解释原因，否则标记为风险。
- 输出每个模块的适用对象、时长、活动、交付成果。

### 4.5 文件知识库检索

| 工具 | 用途 | 典型调用方 |
| --- | --- | --- |
| `presales.file_search.hybrid` | 混合检索 Word/PPT/PDF/Excel/文本资料 | 所有 Skill |
| `presales.file_evidence.get` | 按 evidenceId 获取原文件位置、段落、页码、缩略图 | 所有 Skill |
| `presales.file_outline.get` | 获取文件结构化大纲，如 PPT 页、Word 标题层级 | 入库、课程匹配、方案输出 |
| `presales.file_chunk.resolve_business_section` | 判断片段属于讲师简介、课纲、案例、报价、反馈等 | 入库和检索 |
| `presales.file_authority.check` | 判断文件是否当前、过期、未确认、仅本轮附件 | 所有 Skill |

文件切分不能只按字数。需要保留业务 section：

- 讲师简介
- 课程目标
- 适用对象
- 课程大纲
- 项目背景
- 交付成果
- 客户反馈
- 报价/档期
- 对客可引用案例
- 风险/禁用规则
- 模板章节

`presales.file_search.hybrid`

输入：

```json
{
  "query": "银行中高层领导力 跨部门协同 工作坊 案例",
  "filters": {
    "businessLine": "training_presales",
    "entityTypes": ["teacher", "course", "case", "proposal"],
    "authorityStatus": ["current", "confirmed"],
    "clientUsable": true
  },
  "topK": 10,
  "searchMode": "hybrid"
}
```

输出要求：

- 每条结果带 `businessSection`。
- 每条结果带 `authorityStatus`。
- 每条结果带是否可写入对客方案。
- 每条结果带原文件定位，不允许只给无来源摘要。

### 4.6 权威数据与冲突处理

| 工具 | 用途 | 典型调用方 |
| --- | --- | --- |
| `presales.authority_status.get` | 查询实体或文件是否是当前权威数据 | 所有 Skill |
| `presales.source_conflict.detect` | 检测 API、文件、人工口径之间的冲突 | 所有 Skill |
| `presales.source_conflict.explain` | 输出冲突字段、影响、建议处理方式 | 待办中心、Skill |
| `presales.authority_candidate.submit` | 把业务上传的新资料作为更新候选 | 入库流程 |
| `presales.authority_update.apply` | 人工确认后更新当前权威记录 | 管理后台或待办中心 |

规则：

- Skill 可以读取未确认资料，但必须降低置信度并提示。
- 对客方案默认只能使用 `current` 或业务明确确认的 `confirmed` 资料。
- `candidate`、`stale`、`unconfirmed` 不得直接写成确定事实。

### 4.7 对客引用与安全口径

| 工具 | 用途 | 典型调用方 |
| --- | --- | --- |
| `presales.client_output_policy.check` | 判断内容能否写进对客方案 | `@方案输出`、`@内容包装` |
| `presales.client_safe_excerpt.rewrite` | 把内部证据改写成对客可读版本 | `@内容包装` |
| `presales.internal_evidence_pack.create` | 生成内部依据包，不给客户 | `@方案输出` |
| `presales.citation_pack.create` | 生成引用依据清单，关联最终方案章节 | `@方案输出` |

`presales.client_output_policy.check`

输入：

```json
{
  "contentItems": [
    {
      "text": "客户曾拒绝赵老师类似授课风格",
      "sourceEvidenceId": "ev_feedback_12",
      "targetDocument": "client_proposal"
    }
  ]
}
```

输出：

```json
{
  "status": "ok",
  "data": [
    {
      "allowed": false,
      "reason": "包含内部负面评价，不可对客",
      "suggestedRewrite": "已结合客户偏好，优先推荐更适合本次工作坊风格的讲师组合。"
    }
  ]
}
```

### 4.8 方案模板与文档生成

| 工具 | 用途 | 典型调用方 |
| --- | --- | --- |
| `presales.proposal_template.list` | 列出可用 Word/PPT 模板 | `@方案输出` |
| `presales.proposal_template.get_schema` | 获取模板字段、章节、必填项 | `@方案输出` |
| `presales.proposal_outline.compose` | 根据确认产物组合方案结构 | `@方案输出` |
| `presales.proposal_fill.validate` | 检查模板字段是否都能填充 | `@方案输出` |
| `presales.proposal_render.request` | 请求生成 docx/pptx/pdf 等最终文件 | `@方案输出` |

`presales.proposal_fill.validate`

输入：

```json
{
  "templateId": "training_proposal_standard_v3_2",
  "artifacts": [
    "01_需求分析.md",
    "02_讲师推荐.md",
    "03_课程方案.md",
    "04_交付计划与风险.md"
  ]
}
```

输出：

- 可填字段。
- 缺失字段。
- 只能内部使用、不能对客使用的字段。
- 哪些字段来自未显式确认文件。

### 4.9 入库与解析

这些工具主要服务管理后台和资料上传流程，Skill 运行时也可能调用只读结果。

| 工具 | 用途 |
| --- | --- |
| `presales.ingest_batch.create` | 创建批量上传任务 |
| `presales.ingest_file.parse` | 解析 docx/pptx/pdf/xlsx/txt |
| `presales.ingest_file.extract_entities` | 提取讲师、课程、客户、项目、案例、报价等实体 |
| `presales.ingest_file.suggest_tags` | 生成标签和业务 section |
| `presales.ingest_file.detect_duplicates` | 检测重复文件或同一实体新旧版本 |
| `presales.ingest_file.submit_review` | 低置信或冲突进入人工队列 |
| `presales.ingest_file.commit` | 人工确认后入库 |

入库结果至少要写入：

- 原文件对象存储 ID。
- 解析文本和结构化 section。
- 实体和关系。
- 标签。
- 权限和对客可引用范围。
- authority 状态。
- 审计记录。

### 4.10 评测与反馈闭环

| 工具 | 用途 |
| --- | --- |
| `presales.retrieval_test.run` | 用固定问题测试召回质量 |
| `presales.retrieval_test.record_expected` | 维护期望召回结果 |
| `presales.skill_output.feedback` | 记录业务对某次 Skill 输出的反馈 |
| `presales.project_outcome.record` | 记录方案是否中标、客户是否采纳、交付反馈 |
| `presales.scoring_template.evaluate` | 评估当前评分模板是否推荐准确 |

必须维护一组售前问题评测集：

- A 银行中高层领导力，找金融行业讲师。
- 预算 50 万，2 天 1 晚，找能做工作坊的老师。
- 王老师有哪些银行客户案例可对客引用。
- 有没有同类项目复盘反馈。
- 当前课纲是否适合高管共创场景。
- 某讲师最近是否有负面反馈或档期风险。

## 5. Skill 调用矩阵

| Skill | 启动前检查 | 核心 MCP 工具 | 输出文件 |
| --- | --- | --- | --- |
| `@需求分析` | 本轮输入、客户、目标、对象、预算、天数是否足够 | `presales.customer_context.get`、`presales.requirement.extract_from_files`、`presales.similar_projects.find`、`presales.requirement.check_missing_inputs`、`presales.manual_preference.read` | `01_需求分析.md`、`01_需求分析.json` |
| `@讲师匹配` | 是否有当前需求分析文件；讲师库、报价、档期、评价是否足够 | `presales.project_artifact.read`、`presales.teacher_rank`、`presales.teacher_recent_cases.list`、`presales.teacher_feedback.summarize`、`presales.teacher_risk.check`、`presales.file_search.hybrid` | `02_讲师推荐.md`、`02_讲师推荐.json` |
| `@课程匹配` | 是否有需求分析和讲师推荐；培训天数、讲师、课纲库是否足够 | `presales.syllabus_candidates.find`、`presales.course_module.search`、`presales.syllabus_gap.check`、`presales.case_evidence.search` | `03_课程方案.md`、`03_课程方案.json` |
| `@方案输出` | 需求、讲师、课程、交付、模板字段是否足够 | `presales.proposal_template.get_schema`、`presales.proposal_fill.validate`、`presales.client_output_policy.check`、`presales.citation_pack.create`、`presales.proposal_render.request` | `04_完整方案.docx`、`04_内部依据包.md`、`04_内部依据包.json` |
| `@内容包装` | 是否有完整方案和客户反馈；对客口径是否明确 | `presales.client_output_policy.check`、`presales.client_safe_excerpt.rewrite`、`presales.file_search.hybrid` | `05_对客版方案.docx` |

## 6. Skill 文案要求

每个 Skill 开头都应该声明当前读取规则：

```text
我会优先读取当前项目目录中的产物文件，不依赖长对话记忆。
如果上一步文件未显式确认，也会按当前文件继续。
如果检测到文件被外部修改，本轮会读取最新版本并标注状态。
如果关键字段缺失，我会停止并列出缺口，不生成正式产物。
```

每个 Skill 输出前必须列：

- 读取了哪些文件。
- 哪些文件是已确认、未确认、外部修改后未确认。
- 调用了哪些 MCP 数据源。
- 缺失字段是否阻塞。
- 本次会写入哪个产物文件。

## 7. 最小一期工具范围

一期不需要一次做完所有工具。建议先做这些：

1. `presales.project_manifest.read`
2. `presales.project_artifact.read`
3. `presales.project_artifact.write`
4. `presales.project_artifact.hash`
5. `presales.manual_preference.record`
6. `presales.manual_preference.read`
7. `presales.customer_context.get`
8. `presales.requirement.check_missing_inputs`
9. `presales.file_search.hybrid`
10. `presales.file_evidence.get`
11. `presales.teacher_rank`
12. `presales.syllabus_candidates.find`
13. `presales.client_output_policy.check`
14. `presales.proposal_template.get_schema`

这 14 个工具能支撑最小闭环：

```text
需求分析 -> 讲师推荐 -> 课程方案 -> 完整方案 -> 对客方案
```

二期再补入库审核、权威数据更新、检索评测和长期反馈闭环。

## 8. 仍需业务确认

这些点会影响 MCP schema 和工具拆分：

1. 人工口径是否区分当前项目、讲师长期画像、行业通用规则。
2. 哪些内容默认可以进入对客方案，哪些必须内部可见。
3. 讲师报价和档期的实时 API 是否稳定，是否允许文件补充覆盖。
4. 课纲库 API 是否能返回结构化模块，还是只能返回原文件。
5. 最终方案模板由谁维护，模板字段是否固定。
6. 业务是否需要保存每个 Skill 的结构化 JSON 产物，还是只允许内部隐藏保存。
