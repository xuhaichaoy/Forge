
分工：

```text
MinIO    = 文件仓库，存原文件和解析后的 Markdown
Postgres = 业务账本，存知识库、文件、chunk、状态、图谱记录
Milvus   = 检索引擎，存 chunk 向量和 BM25 索引，用来搜
Neo4j    = 关系地图，存实体和实体之间的关系
```

**完整流程**
**第 0 步：你从 HiCodex 目录选文件**
你选择的是 `/Users/haichao/Desktop/data/HiCodex` 里的文件。
但注意：Yuxi 后端**不是直接读取这个路径**。浏览器会把文件内容读出来，当成 `File` 对象上传。

这么做的好处：后端不依赖你本机路径，部署到服务器也能用。

**第 1 步：上传原始文件**
请求：

```text
POST /api/knowledge/files/upload?kb_id=xxx
```

做了什么：

```text
读取文件字节
检查文件类型
检查大小
计算 SHA-256 content_hash
检查同一个知识库里有没有相同内容
把原始文件上传到 MinIO
```

存到哪里：

```text
MinIO:
knowledgebases/<kb_id>/upload/<文件名_时间戳.ext>
```

为什么这么做：
先把原文件保存起来，后续解析失败、重新解析、下载原文件、预览原文件，都可以从 MinIO 取。

**第 2 步：返回上传结果给前端**
后端返回类似：

```json
{
  "file_path": "http://localhost:9000/knowledgebases/kb_xxx/upload/a_123.docx",
  "content_hash": "...",
  "size": 12345,
  "filename": "a.docx"
}
```

这一步还没有入库，也没有搜索能力。
它只是告诉前端：“文件已经放进文件仓库了”。

**第 3 步：提交知识库处理任务**
前端再调用：

```text
POST /api/knowledge/databases/{kb_id}/documents
```

带上刚才的 `file_path`、`content_hash`、处理参数、是否自动入库。

做了什么：
创建一个异步任务，因为解析 PDF、Excel、OCR、embedding 可能很慢，不能卡住页面。

存到哪里：

```text
Postgres / system task 记录任务状态
```

好处：用户可以在任务中心看到进度，比如“添加记录 / 解析 / 入库”。

**第 4 步：添加文件记录**
做了什么：

```text
生成 file_id
记录文件名
记录 MinIO 原文件地址
记录 content_hash
记录文件状态 uploaded
记录所属知识库 kb_id
```

存到哪里：

```text
Postgres:
knowledge_files
```

为什么这么做：
从这里开始，这个文件正式成为知识库里的一个“文件对象”。

好处：
后面页面能显示文件列表、状态、上传时间、是否解析成功、是否已入库。

**第 5 步：解析原文件**
系统从 MinIO 把原文件下载到临时目录，然后按扩展名解析。

大概是：

```text
docx / pptx / xlsx -> Docling
pdf               -> PyPDFLoader，或者按配置走 OCR
图片              -> 必须启用 OCR
csv               -> pandas
html              -> markdownify
doc               -> catdoc
zip               -> 解压后找 Markdown 和图片
```

做了什么：
把各种格式都转换成一份 Markdown 文本。

为什么要转 Markdown：
因为原文件格式太乱。Word、PDF、Excel、PPT、图片都不一样。
后面的分块、embedding、BM25、图谱抽取，最好都面对同一种文本格式。

Markdown 的好处：

```text
保留标题、段落、表格、列表
大模型容易读
分块器容易切
前端容易预览
后续检索统一处理
```

**第 6 步：保存解析后的 Markdown**
存到哪里：

```text
MinIO:
knowledgebases/<kb_id>/parsed/<file_id>.md
```

同时更新：

```text
Postgres knowledge_files:
status = parsed
markdown_file = 解析后 Markdown 的 MinIO 地址
```

好处：
以后重新入库时，不用每次重新解析原始 Word/PDF，可以直接读 Markdown。

**第 7 步：如果没勾选“上传后自动入库”，流程暂停**
这时候文件状态是：

```text
原文件在 MinIO
Markdown 在 MinIO
文件记录在 Postgres
但还没有 chunk
还没有 embedding
还不能被普通知识库搜索命中
```

用户之后可以手动点“入库”。

**第 8 步：如果勾选自动入库，开始切 chunk**
系统读取 Markdown，然后交给分块器。

做了什么：
把一整篇 Markdown 切成很多小段。

比如一份文件变成：

```text
file_abc_chunk_0
file_abc_chunk_1
file_abc_chunk_2
...
```

每个 chunk 大概包含：

```json
{
  "chunk_id": "file_abc_chunk_0",
  "file_id": "file_abc",
  "chunk_index": 0,
  "content": "这一段正文",
  "start_char_pos": 0,
  "end_char_pos": 300
}
```

为什么要切 chunk：
一篇文档太长，用户搜索时通常只需要其中几段。
如果整篇文档做一个向量，搜索会很粗；切小块后，可以精确命中段落。

好处：

```text
召回更准
引用更准
大模型上下文更省
图谱抽取也更细
```

**第 9 步：给每个 chunk 做 embedding**
做了什么：
把 chunk 正文转成一串数字向量。

比如：

```text
“AI 投标知识库建设方案”
```

会变成：

```text
[0.012, -0.231, 0.088, ...]
```

为什么这么做：
向量表达语义。用户搜“智能投标资料”，即使原文没有完全一样的词，也能找到意思接近的 chunk。

存到哪里：
embedding 会写入 Milvus。

**第 10 步：chunk 分批双写到 Postgres 和 Milvus**
这一步非常关键。

Postgres 存：

```text
knowledge_chunks:
chunk_id
file_id
kb_id
chunk_index
content 正文
位置
是否已建图谱 graph_indexed
实体 id ent_ids
抽取结果 extraction_result
```

Milvus 存：

```text
id
content
chunk_id
file_id
chunk_index
embedding
content_sparse
```

为什么要双写：

```text
Postgres 适合管理、展示、状态追踪、删除、统计
Milvus 适合高速检索
```

也就是说：

```text
Postgres = 管数据
Milvus   = 搜数据
```

现在的实现已经不是“一个文件全部 chunks 一次性 embedding / 一次性写入”。
为了支撑更大的文件量和后续 TB 级体量，索引链路已经改成**有界批处理**：

```text
Markdown
  -> 切 chunks
  -> 按批次取 chunk content
  -> 批量 embedding
  -> 当前批次写 Postgres
  -> 当前批次写 Milvus
  -> 下一批
```

默认批大小：

```text
YUXI_KB_INDEX_BATCH_SIZE = 64
YUXI_KB_DB_BATCH_SIZE    = 500
```

这样做的好处：

```text
大文件不会一次性占满内存
embedding 调用有上限
Postgres 不会一次性塞巨大 IN 查询或巨大 ORM 批
失败时更容易定位到具体批次
后续可以继续演进成 chunk 级断点续跑
```

当前已经开始做 chunk 正文存储分层。
小 chunk 仍然可以直接存在 Postgres；超过阈值的大 chunk 会把完整正文溢出到 MinIO，Postgres 只保留预览、完整字节数和对象路径：

```text
Postgres = chunk 元数据、状态、位置、预览、content_size、content_object_path
MinIO    = 大 chunk 完整正文
Milvus   = 检索字段、向量、BM25 内容索引
```

读取时由仓储自动回填完整正文：

```text
查询 knowledge_chunks
  -> 如果 content_object_path 为空，直接用 Postgres content
  -> 如果 content_object_path 不为空，从 MinIO 下载完整正文
  -> 对调用方仍然表现为 chunk.content
```

相关参数：

```text
YUXI_KB_CHUNK_INLINE_MAX_BYTES
YUXI_KB_CHUNK_INLINE_PREVIEW_CHARS
YUXI_KB_CHUNK_CONTENT_HYDRATION_CONCURRENCY
```

也就是说，当前已经完成“批处理、查询预算、元数据索引查询、chunk 正文分层”的基础改造，但还不是 TB 级最终形态。

**第 11 步：Milvus 同时建立两种检索能力**
Milvus 里对同一份 chunk 做两种索引：

```text
embedding 向量索引
content_sparse BM25 稀疏索引
```

向量索引用来找语义相似。
BM25 用来找关键词匹配。

好处：
用户搜索时可以选三种模式：

```text
vector  = 语义相似
keyword = 关键词匹配
hybrid  = 语义 + 关键词融合
```

**第 12 步：用户搜索**
请求：

```text
POST /api/knowledge/databases/{kb_id}/query
```

用户输入：

```text
“有没有和投标知识库相关的资料？”
```

系统做：

```text
读取知识库查询参数
判断 search_mode
可能读取 file_name 过滤条件
决定 top_k、阈值、是否 rerank、是否启用图谱检索
```

**第 13 步：普通检索**
如果是 `vector`：

```text
用户问题 -> embedding -> Milvus 向量检索 -> 返回相似 chunk
```

如果是 `keyword`：

```text
用户问题 -> Milvus BM25 -> 返回关键词匹配 chunk
```

如果是 `hybrid`：

```text
用户问题 -> 同时走向量检索和 BM25
然后用 WeightedRanker 融合排序
```

返回的是 chunk，不是整篇文档。

每个结果大概是：

```json
{
  "content": "命中的 chunk 正文",
  "metadata": {
    "source": "文件名",
    "chunk_id": "...",
    "file_id": "...",
    "chunk_index": 3
  },
  "score": 0.82
}
```

**第 14 步：可选 reranker**
如果开启重排，系统会把召回的一批 chunk 再交给 reranker 模型。

做了什么：

```text
query + chunk 列表 -> reranker -> 每个 chunk 一个 rerank_score
```

为什么这么做：
Milvus 是召回，reranker 是精排。
召回负责“先找一批可能相关的”，精排负责“把最相关的排前面”。

**第 15 步：返回搜索结果**
最终返回给前端：

```text
命中的 chunk 正文
来源文件
chunk_id
file_id
分数
```

前端展示时，你看到的就是“这个问题命中了哪些资料片段”。

**图谱/GraphRAG 是额外分支**
普通搜索到这里已经能工作。
图谱不是必须的，它是在 chunk 入库后额外构建。

**第 16 步：配置图谱抽取器**
请求：

```text
POST /api/knowledge/databases/{kb_id}/graph-build/config
```

做了什么：

```text
选择 LLM 模型
可配置 schema
锁定图谱抽取配置
```

存到哪里：

```text
Postgres knowledge_bases.additional_params.graph_build_config
```

为什么要锁定：
避免今天用 A schema 抽一半，明天换 B schema，又混在同一个图谱里。

**第 17 步：启动图谱构建**
请求：

```text
POST /api/knowledge/databases/{kb_id}/graph-build/index
```

做了什么：
找出 `knowledge_chunks` 里还没建过图谱的 chunk：

```text
graph_indexed != true
```

然后逐个 chunk 抽取实体和关系。

**第 18 步：LLM 从 chunk 里抽实体关系**
比如 chunk 内容是：

```text
王老师为华为讲授了 AI 投标课程。
```

LLM 输出类似：

```json
{
  "relations": [
    {
      "source": {"text": "王老师", "label": "Lecturer"},
      "target": {"text": "AI 投标课程", "label": "Course"},
      "text": "王老师讲授 AI 投标课程",
      "label": "讲授"
    }
  ]
}
```

然后系统会标准化：

```text
实体名小写/去空格
实体去重
关系去重
计算 entity_id
计算 triple_id
```

**第 19 步：图谱数据写 Neo4j**
Neo4j 存真正的图结构：

```text
Chunk 节点
Entity 节点
Chunk -> Entity 的 MENTIONS 边
Entity -> Entity 的 RELATION 边
```

比如：

```text
chunk_1 -> MENTIONS -> 王老师
王老师 -> 讲授 -> AI投标课程
```

为什么用 Neo4j：
Neo4j 擅长查关系，比如：

```text
王老师关联哪些课程？
某客户关联哪些案例？
从 A 到 B 有没有路径？
```

**第 20 步：图谱数据写 Postgres**
Postgres 也会存一份图谱账本：

```text
knowledge_graph_entities
knowledge_graph_entity_mentions
knowledge_graph_triples
knowledge_graph_triple_mentions
```

为什么 Neo4j 有了，Postgres 还要存：
Postgres 更适合做业务管理和追踪来源。

它能回答：

```text
这个实体来自哪个 chunk？
这个三元组来自哪个文件？
删除某个文件时要删哪些图谱引用？
某个 chunk 是否已经建图谱？
图谱实体/关系数量是多少？
```

**第 21 步：图谱实体/三元组也写 Milvus**
系统还会把实体和三元组文本做 embedding，然后写两个 Milvus 集合：

```text
<kb_id>_entity
<kb_id>_triple
```

为什么图谱也要进 Milvus：
因为用户问题不一定能精确命中实体名。

比如用户搜：

```text
“哪个老师讲过投标相关课程？”
```

不一定直接包含“王老师”这个词。
通过实体/关系向量检索，可以语义召回相关实体和三元组。

**第 22 步：开启 GraphRAG 后搜索怎么变**
如果查询参数里开启：

```text
use_graph_retrieval = true
```

普通搜索后，会多走一条图谱链路：

```text
用户问题
  -> 搜 Milvus 的 entity/triple 集合
  -> 找到相关实体和关系
  -> 以这些实体作为种子
  -> 去 Neo4j 找 2-hop 子图
  -> 用 Personalized PageRank 算哪些 chunk 更重要
  -> 得到图谱召回的 chunk
  -> 和普通 chunk 检索结果融合
```

这样能找出“关键词没那么像，但关系上很相关”的资料。

**最后压成一条主线**
完整主线是：

```text
HiCodex 本地文件
  -> 浏览器上传字节
  -> MinIO 存原文件
  -> Postgres 记文件记录
  -> Parser/OCR 转 Markdown
  -> MinIO 存 Markdown
  -> 分块器切 chunk
  -> embedding 模型把 chunk 转向量
  -> Postgres 存 chunk 明细
  -> Milvus 存 chunk 向量和 BM25 索引
  -> 用户搜索
  -> Milvus 返回相关 chunk
  -> 可选 reranker 精排
  -> 返回搜索结果
```

图谱主线是：

```text
已入库 chunk
  -> LLM 抽实体关系
  -> Neo4j 存关系网络
  -> Postgres 存图谱账本和来源
  -> Milvus 存实体/三元组向量
  -> 搜索时可用图谱扩散补充召回
```

最核心的一句话：

**文件先变成 Markdown，Markdown 再变成 chunk，chunk 再变成向量；MinIO 存文件，Postgres 管记录，Milvus 负责搜，Neo4j 负责关系。**

---

## 当前实现里还要分清的三套数据

上面的流程主要讲的是“知识库文档检索”和“知识库图谱”。
但在 HiCodex / Yuxi 当前实现里，容易被混在一起的其实有三套数据：

```text
1. 知识库文件与 chunk
   表：knowledge_files / knowledge_chunks
   用途：文件列表、文件状态、原文片段、普通知识库检索

2. 知识库图谱
   表：knowledge_graph_entities / knowledge_graph_triples / mentions 表
   图：Neo4j 里的 MilvusKB 子图
   向量集合：<kb_id>_entity / <kb_id>_triple
   用途：GraphRAG、graph_subgraph、关系扩散补充召回

3. 档案中心实体库
   表：presales_entity / presales_document_entity_link
   用途：讲师、课程、客户、案例、培训需求等业务实体档案
```

这三套数据有关联，但不是同一个东西。

最容易误判的是：
`kb_search` 返回里的 `entities` / `relationships`，属于知识库检索或知识库图谱结果，不等于档案中心实体库。

如果查档案中心，应该看到的是：

```text
entity_list
entity_get
entity_related
entity_history
```

如果查知识库文件或源文件片段，通常看到的是：

```text
kb_list
kb_search
kb_info
file_info
file_chunks
analyze_file
graph_subgraph
```

## HiCodex 里有三种常见查询入口

### 入口一：知识库页面搜索

HiCodex 知识库页面的搜索不是直接调单库：

```text
POST /api/knowledge/databases/{kb_id}/query
```

而是调跨库聚合入口：

```text
POST /api/presales/library/search
```

它会按业务线、分类、知识库 ID 过滤，然后对可访问的知识库做检索。
返回结果仍然以文件、chunk、来源片段为核心。

适合问：

```text
这份文件里写了什么？
有没有和某个关键词相关的原文片段？
某个培训项目的原始表格内容是什么？
```

### 入口二：档案中心搜索

档案中心走的是：

```text
GET /api/presales/entities
GET /api/presales/entities/{id}
GET /api/presales/entities/{id}/related
```

它查的是结构化业务实体，不是全文 chunk。

适合问：

```text
某个讲师讲过哪些课程？
某个客户有哪些培训需求？
某个课程关联了哪些案例？
```

档案中心里的“来源文件 / 原文定位”会再回到知识库文件和 chunk。
所以关系是：

```text
档案实体
  -> presales_document_entity_link
  -> db_id / file_id / chunk_id
  -> 知识库源文件片段
```

### 入口三：对话里的 Yuxi MCP 工具

在 HiCodex 对话里，模型能不能查 Yuxi，取决于 MCP 配置和工具调用。
判断它到底查了哪里，不看回答文字，直接看工具名。

```text
kb_search / file_chunks
  = 查知识库源文件和 chunk

graph_subgraph
  = 查知识库图谱子图

entity_list / entity_related
  = 查档案中心实体库

recommend_candidates / evaluate_proposal_score
  = 查档案中心候选并按评分模板排序
```

例如直接问“福建分中心有哪些重点项目”时，如果实际调用是：

```text
kb_list -> kb_search -> file_chunks -> analyze_file -> graph_subgraph
```

那它查的是知识库里的源文件和知识库图谱，不是档案中心实体库。

## 上传入库后还有业务治理分支

前面的主线是底层知识库链路。
但 HiCodex 的知识库管理还额外做了一层售前 / 投标业务治理。

实际上传后大致是：

```text
浏览器选择文件
  -> /api/knowledge/files/upload?kb_id=xxx
  -> MinIO 保存原文件
  -> 返回 file_path / content_hash / same_name_files
```

然后分两种情况。

### 没有同名/重复风险

前端直接提交处理任务：

```text
POST /api/knowledge/databases/{kb_id}/documents
```

并带：

```json
{
  "params": {
    "content_type": "file",
    "auto_index": true
  }
}
```

后端任务分四阶段：

```text
第一阶段：添加文件记录
第二阶段：解析文件
第三阶段：自动入库
第四阶段：实体抽取与对齐
```

第四阶段很重要：
它不影响文件是否入库成功，但影响档案中心有没有真实实体。

也就是说：

```text
知识库可搜索成功
  不等于
档案中心已经有实体
```

档案中心要有数据，还需要实体抽取结果写入：

```text
presales_entity
presales_document_entity_link
```

### 有同名/重复风险

前端会走 intake：

```text
POST /api/presales/ingest/intake
```

intake 的职责是：

```text
分类
查重
决定是否自动入库
进入分类确认队列
进入重复版本队列
进入强制分类队列
```

可能返回：

```text
auto_ingested
queued_classify
queued_dup
queued_force
```

所以不是所有上传都会马上进入“解析 -> 入库”。
有些会先进入待处理队列，等业务确认目标知识库、重复版本处理方式或实体对齐方式。

## 图谱 / GraphRAG 的前置条件

GraphRAG 不是文件入库后天然可用。
它至少需要：

```text
1. 文件已经解析并入库成 chunk
2. 图谱抽取配置已经锁定
3. graph-build/index 已经跑过
4. knowledge_chunks.graph_indexed 已经更新
5. Neo4j 里有对应 MilvusKB 子图
6. Milvus 里有 <kb_id>_entity / <kb_id>_triple 集合
```

查询时打开：

```text
use_graph_retrieval = true
```

系统才会在普通 chunk 检索之外，额外走：

```text
实体/三元组向量召回
  -> 作为种子进入 Neo4j 2-hop 子图
  -> Personalized PageRank
  -> 得到图谱召回 chunk
  -> 和普通检索结果融合
```

如果图谱没有构建、实体/三元组集合为空、PPR 依赖不可用，系统应该退回普通 chunk 检索。

## 排查时先问这几个问题

### 1. 文件有没有真正进知识库？

看：

```text
knowledge_files.status
MinIO upload 文件
MinIO parsed/<file_id>.md
```

### 2. 文件能不能被搜索？

看：

```text
knowledge_chunks 是否有该 file_id
Milvus 主集合是否有该 file_id 的 chunk
/api/knowledge/databases/{kb_id}/query-test 是否返回结果
```

### 3. 档案中心为什么没有实体？

不要只看知识库是否 indexed。
还要看：

```text
presales_entity
presales_document_entity_link
实体抽取日志
第四阶段“实体抽取与对齐”是否执行
```

### 4. 对话到底查了什么库？

看工具名：

```text
kb_search / file_chunks      -> 知识库源文件
graph_subgraph               -> 知识库图谱
entity_list / entity_related -> 档案中心实体库
```

### 5. 搜索慢或超时怎么办？

区分入口：

```text
知识库页面搜索：/api/presales/library/search，有单库超时和并发预算；超时后取消该库查询
对话 MCP kb_search：可能走更深的语义检索，慢模型下会更容易超时
档案中心 entity_list/entity_related：结构化查询，正常应是毫秒级
```

当前为了避免大规模搜索时后台任务堆积，知识库页面搜索已经取消“超时后继续后台预热”的做法。
现在的策略是：

```text
最多搜索 max_kbs 个库
每次只允许有限并发搜索
单库超过超时时间就跳过
不会在请求结束后继续堆积后台 aquery 任务
```

相关服务端预算：

```text
YUXI_LIBRARY_SEARCH_CONCURRENCY
YUXI_KB_MAX_RECALL_TOP_K
YUXI_KB_MAX_BM25_TOP_K
YUXI_KB_MAX_GRAPH_NODES
YUXI_KB_MAX_FILE_NAME_FILTER_IDS
```

这些参数的意义是：即使前端或持久化配置给了很大的 topK / recall / 图谱扩散规模，后端也会把单次查询夹在可控范围内。

### 6. 文件列表、文件名过滤、重复检测慢怎么办？

这些路径已经从“扫内存里的全量 files_meta”改成“查数据库索引”：

```text
重复文件检测       -> knowledge_files(kb_id, content_hash)
同名文件检测       -> knowledge_files(kb_id, lower(filename))
文件名过滤         -> knowledge_files 按 kb_id + filename 查 file_id
文件详情读取       -> DB 按 kb_id + file_id 查询
知识库 row_count   -> DB count
文件树列表         -> DB 按 parent_id 查询
```

这意味着后续即使文件数增长，页面和上传入口也不会因为全量扫描 files_meta 先卡死。

## 推荐更新后的总口径

更准确的一句话是：

**文件先进入知识库，成为可搜索的 Markdown 和 chunk；chunk 现在按批写入 Postgres 与 Milvus，大 chunk 正文会溢出到 MinIO，普通检索走 Milvus 向量/BM25，文件列表和元数据查询走数据库索引。图谱是知识库上的增强分支，档案中心是另一个业务实体层，只有实体抽取和对齐成功后，知识库文件里的内容才会沉淀成讲师、课程、客户、案例、培训需求等可复用档案。当前实现已经完成 TB 级基础改造，但 TB 级最终形态还需要继续做索引任务状态机、Milvus collection/partition 策略和压测指标体系。**
