# HiCodex KB 可拔插化 — 架构建议

> 生成方式:18-agent design workflow(1 grounding → 4 套设计 → 每套 3-lens 评审 → 1 综合),2026-06-26。
> 设计评分:Package extraction (@forge/kb) = **7** · Runtime config-gate = 6 · Plugin Host = 6 · Build-time SKU = 5.7。
> 这是**调查/设计文档,未实现任何代码**。文中 `file:line` 为生成时快照,动手前请按当前代码复核。

---

## 核心判断(先讲结论)

四个设计在一个判断上**完全一致且都被代码证实**:conversation core(`state/codex-reducer-*`、`thread-workflow-*`、`project-conversation.ts`、`conversation-view.tsx`、`thread-item-view.tsx`)**零** KB/yuxi/team-service import。所以"KB 表面可拔插"是简单部分。

四个设计也在**同一个致命点**上翻车,已逐一核验:

1. **模型供给(头号 kill-shot)**:`use-model-picker-view-model.ts:112-115` 刻意规定 `hicodex_local` 只有在 `personalProviderConfigured`(config.toml 里有真实条目)时才进 `readyProviders`——代码注释明说工厂占位符曾让 fresh install "silently send to a dead 127.0.0.1 endpoint"。所以**单纯去掉 auth gate ≠ 拿到可用模型**,会落到 `noReadyProvider=true`、send 被禁。四个设计都把 hicodex_local 当成开箱即用的兜底,**都是错的**。

2. **真正的耦合结(所有抽取型设计的共同 kill-shot)**:模型层把 `yuxi-client` barrel 拖进了 core。链路已核实:
   `model-selection-context.ts:6` / `use-model-picker-view-model.ts` / `model-workflow.ts` / `use-team-model-gateway.ts` / `use-forge-app-model-context.ts` / `use-forge-app-approvals-settings.ts` → `team-model-gateway.ts` → 读 `readTeamServiceConnectionConfig`(`team-service-connection.ts:1-4` **import 自 `./yuxi-client`**)+ `team-service-session.ts`。
   这意味着 Design 2/3/4 任何"把 yuxi-* 移走 / tree-shake"都会触发 `@forge/ui → @forge/kb` 反向 package cycle,被仓库自带的 `lint:ts-cycles` 打红。**这是必须先拆的结,而四个设计都把它当一行 file move 低估了。**

3. **被低估的好消息(模型供给其实有解)**:`use-model-picker-view-model.ts:120-122` 显示,当 `oauthAuthMethod` 存在或 `codexAuthSummary` 有 OpenAI 凭据时,`DEFAULT_SUBSCRIPTION_PROVIDER_ID` / `DEFAULT_SUBSCRIPTION_HTTP_PROVIDER_ID`(ChatGPT 订阅 · `codex login` OAuth)进入 ready。**这条路不需要 team backend**。所以"无 Yuxi 也能对话"是真能成立的——前提是把模型 onboarding 做对,而不是赌 hicodex_local 在跑。

---

## 1. 推荐架构(目标结构 + 为什么)

**推荐 = Design 2(`@forge/kb` package extraction + dependency inversion)作为终态骨架,但分阶段落地,且前置一个所有设计都漏掉的"连接 seam 拆分"阶段。**

为什么是 Design 2 而非其它:

- **vs Design 3(build-time SKU)**:字面诉求是"PLUGGABLE / plug in when wanted"——这是**运行时**语义。Design 3 的 `@forge/edition` Vite alias 产出两个二进制,"换 KB = 换安装包",直接违背诉求(adversary 已点名 goal-shape mismatch)。而且它赌 minified bundle grep `'yuxi'` 能守住 tree-shake,既可能 false-green(标识符被改名)又会 false-red(模型层 barrel 泄漏)。**否决为终态,但保留它的一个好机制**:CI 里 grep 产物的 KB 字符串断言,留作未来 community build 的可选护栏。
- **vs Design 4(5-point plugin host)**:方向对,但为一个插件造 identity/model/settings/mcp/nav 五个扩展点是明确的 YAGNI(连它自己的 risk #1 都承认)。Design 4 的价值是"运行时 registry + 单组合根 import 即开关"——这点**采纳进 Design 2**,但 registry 只做 nav+route 两个扩展点,其余保持 thin pass-through。
- **vs Design 1(runtime config-gate)**:它是**最好的 Phase 1**(最小 diff、默认无行为变化、可逆),但终态不够——KB 代码仍全量进 bundle,"pluggable" 退化成 "render-hidden",且 Rust flag 只在 JS bundle 里、host 读不到。**采纳为 Phase 1,不采纳为终态。**

**目标 repo 结构(终态):**

```
packages/codex-protocol        (@forge/codex-protocol)        不变
packages/ui                    (@forge/ui)
  src/state, src/components/conversation-view.tsx, ...        conversation core,零 KB
  src/plugins/feature-registry.ts + feature-plugin.ts        新增:registry(nav+route 两点)
  src/model/*                                                 模型层,核心 provider(local/openai_http)
  src/lib/team-base-url.ts                                    新增:中性 URL/默认值(从 yuxi-client 下沉)
packages/kb                    (@forge/kb)  新增 downstream package
  src/lib/yuxi-*.ts (8)                                       从 @forge/ui 移入
  src/components/kb-*.tsx (30) + kb-*.ts (16) + kb-views.css  从 @forge/ui 移入(实际 ~54 文件,非 38)
  src/lib/kb-connection.ts                                    KB 独立 namespace
  src/kb-plugin.ts                                            manifest:注册 4 tab + route + KB 设置面板 + MCP descriptor
apps/desktop/src/main.tsx                                     唯一 import @forge/kb 的地方 = KB 总开关
crates/host                                                   token-presence 驱动的 MCP gating(已可用,保留)
```

依赖单向:`@forge/kb → @forge/ui → @forge/codex-protocol`。core 零 KB import,`lint:ts-cycles` 绿。

---

## 2. 认证决策(crux)——你需要拍板的那个岔路

> **这是唯一需要你决定的点。下面给出推荐,并把两条臂的成本摊开。**

### 岔路 A:保留强制登录 + 只拆 KB(低风险臂)
保持 `TeamServiceAuthGate` 强制,team gateway 模型恒可用,**只**把 KB 连接拆成独立 namespace + KB 表面可拔插。
- **成本**:不满足"conversation without Yuxi"——没登录还是进不去。本质只解决了"KB 可拔插"的一半,回避了"无后端从哪拿模型"。
- **优点**:一次绕开 401 hub 重连、丢订阅、模型供给三大难题。**如果真实意图其实是"团队场景下让 KB 能独立换后端",这条最稳。**

### 岔路 B:登录可选 + standalone/local 模式(推荐)
demote auth gate 为非阻塞;无 team 登录时进 conversation。
- **模型从哪来(已核实的三条无-team 路径)**:
  1. **ChatGPT 订阅 OAuth**(`codex login`)→ `DEFAULT_SUBSCRIPTION_HTTP_PROVIDER_ID` 进 ready,**不碰 team backend**。这是最现实的开箱路径。
  2. **BYO personal provider**(在现有 model settings 里粘贴 API key / 本地 OpenAI-compatible 端点),写真实 config.toml 条目 → `personalProviderConfigured=true`。
  3. hicodex_local **仅当**用户/安装流程真的存了 config.toml 条目且 127.0.0.1:8890 在跑——**不能默认假定它就绪**。
- **成本(必须连带交付,否则就是"选了重臂又欠交付")**:
  - 把 Enterprise 的 "sign in" 空状态换成 **core 的 "add a model / 登录订阅" first-run onboarding**(对接路径 1/2),绝不能自动把 hicodex_local 标 ready(那会复活已修掉的 dead-endpoint bug)。
  - team gateway 必须从 core 模型层解耦(见 Phase 2),否则 cycle。
  - 401 hub 订阅必须迁到常驻宿主(见 Phase 2),否则 demote gate 后丢失全局干净登出。

**推荐:走 B,但严格分阶段——Phase 1 先用最小手段拿到"能对话",把模型 onboarding 做对;重活(seam 拆分、package 抽取)放 Phase 2/3。** 理由:B 才是字面诉求,且代码证明它可达(路径 1/2 真实存在);A 只是 B 失败时的退路。

---

## 3. 要切的 seams(current → target)

| seam | 现状 | 目标 |
|---|---|---|
| **连接读取(结的核心)** | `team-service-connection.ts:1-4` import `./yuxi-client`;`team-service-auth.ts:5-8,143,163` 用 `DEFAULT_YUXI_BASE_URL`/`normalizeYuxiBaseUrl`/`writeYuxiConnectionConfig` 镜像 token | 新建 `packages/ui/src/lib/team-base-url.ts`(中性 URL util + 默认 base,**替换硬编码 `192.168.61.214:5050`**),team-service-* 全部改引它;删除 `team-service-auth.ts:143-146,160-167` 对 yuxi 的镜像/清空;`team-service-connection.ts` 不再 fallback 到 yuxi。**做完后 team-service-* 与 yuxi-client 零耦合。** |
| **team model gateway** | `team-model-gateway.ts` 经 `team-service-connection` 间接拖 yuxi barrel;`TEAM_MODEL_GATEWAY_PROVIDER_ID` 被 `model-selection-context.ts:6`/`use-model-picker-view-model.ts:118`/`model-workflow.ts`/`use-team-model-gateway.ts`/`use-forge-app-model-context.ts`/`use-forge-app-approvals-settings.ts` 直引 | provider id 常量下沉到 `model/team-gateway-constants.ts`(无依赖叶子);gateway 改读 `team-base-url` 而非 yuxi;**gateway 留在 @forge/ui 模型层**(它是 team backend 一部分,不进 @forge/kb),仅作"signed-in 才 ready 的 additive provider"。注意:gateway **不随 KB 移走**——只切它对 yuxi-client 的边。 |
| **401 hub** | producers:`yuxi-request.ts:39` + `team-model-gateway.ts:250`;唯一 subscriber 在 `team-service-auth-gate.tsx` | 订阅迁到常驻宿主(`ForgeApp.tsx` 顶层 effect 或 `ServicesProvider`),与 gate 是否挂载无关;KB 的 401 走 KB 自己的失效处理(KB token 死不应注销 team session),`yuxi-request.ts` 随 KB 移入 `@forge/kb` 后改调 KB-local handler。 |
| **auth gate** | `team-service-auth-gate.tsx:202-204` 硬 gate 包裹整 app(`ForgeApp.tsx:1307-1313`) | Phase 1:加 `loginMode==='optional'` 分支渲染 children + 非阻塞 CTA;终态:gate 内的登录表单 UI(`234-348`,form/register/DingTalk/service-URL)抽成可从 account menu 唤起的 `SignInPanel`(这是被 "one branch" 框架隐藏的真实工作量)。 |
| **KB 表面(tabs)** | `app-navigation-rail.tsx:15-24` 硬编码 4 tab;`ForgeApp.tsx:1226-1234` 硬编码 content ladder;**`state/app-navigation-preferences.ts` 的 `PERSISTABLE_APP_TABS`** 是第二真相源 | nav = core workbench + `registry.navExtensions()`;content = `registry.contentFor(tab)`;`PERSISTABLE_APP_TABS` 改为 registry 派生;**registry 对"已持久化但未注册的 tab 回退 workbench"**(否则 KB-off 首屏空白)。 |
| **KB client/components** | `lib/yuxi-*.ts`(8)、`components/kb-*.tsx`(30)+ `kb-*.ts`(16)+ `kb-views.css` 在 @forge/ui | 全量移入 `packages/kb`(实际 ~54 文件,**非设计宣称的 38**;漏算的 16 个 `kb-*.ts` 都 import `../lib/yuxi-client`,必须一起搬)。 |
| **KB MCP gating** | `profile.rs:130-149` `sync_yuxi_mcp_config`/`disable_yuxi_mcp_config`/`YUXI_MCP_*`;`host.rs:215-222` 仅 token 非空才注入 `YUXI_MCP_TOKEN`;`host.rs:741-781` team_auth→yuxi 两键解析 | **基本不动**——现有 token-presence 驱动已经是天然 gating:无 KB token 即 MCP 关。仅把 `host.rs:741-781` 改成只读 KB 独立 key(局部干净改动)。**不要**把 config.toml 的 table 名/env 名 yuxi→kb 改掉(那是与外部 yuxi MCP 进程 + codex bundle 的线路契约)。 |

---

## 4. 分阶段迁移计划(每阶段可独立 ship、可回滚)

### Phase 0 — 证模型可达(S,半天,纯验证不改码)
启动 codex sidecar,用 `codex login`(ChatGPT 订阅)走一个 turn,确认 `DEFAULT_SUBSCRIPTION_HTTP_PROVIDER_ID` 路径无 team token 可发消息;再验一个 BYO personal provider。**这一步定生死**:若两条都不通,退回认证岔路 A。
- Files:无(运行验证)。

### Phase 1 — 最小可用的"conversation without Yuxi"(M,可逆,默认零行为变化)
目标:不动 package 结构,拿到一个能在无登录下对话的 build。
1. `packages/ui/src/lib/runtime-edition.ts`(新):`resolveEdition()` 从 `import.meta.env.VITE_FORGE_KB`(沿用 `build-info` 已有的 `import.meta.env` 读法)+ app-settings override,返回 `{kbEnabled, loginMode}`,默认 `{true,'required'}`(no-op)。
2. `team-service-auth-gate.tsx:202-204`:加 `loginMode==='optional'` escape,渲染 children + 非阻塞 sign-in CTA。
3. `ForgeApp.tsx`:读 edition;`loginMode==='optional'` 且 `noReadyProvider` 时,显示 **"add a model / 登录订阅" onboarding** 而非 "sign in" 墙(对接 Phase 0 验证过的路径)。**绝不自动把 hicodex_local 标 ready。**
4. `app-navigation-rail.tsx:15-24` + `ForgeApp.tsx:1226-1234`:`!kbEnabled` 时过滤掉 knowledge/ingest/archive/todo;`app-navigation-preferences.ts` 的持久化 tab 在 KB-off 时回退 workbench。
5. 401 订阅迁到常驻宿主(为 demote gate 做准备)。
- Files:`runtime-edition.ts`(new)、`ForgeApp.tsx`、`team-service-auth-gate.tsx`、`app-navigation-rail.tsx`、`state/app-navigation-preferences.ts`、`state/forge-desktop-namespace.ts`。
- **可 ship**:`VITE_FORGE_KB` 未设 → 登录可选 + KB 隐藏 + 本地/订阅模型;设了 → 今日行为。KB 代码仍在 bundle(render-hidden,可接受的临时态)。

### Phase 2 — 切连接 seam(M/L,无用户可见变化,纯解耦)
这是所有 package 抽取的**前置必做**,把"结"拆开。
1. 新建 `team-base-url.ts`,team-service-* 改引;删 `team-service-auth.ts` 的 yuxi 镜像/兜底(143-146,123-130,160-167);`team-service-connection.ts` 去 yuxi fallback。
2. provider id 下沉 `team-gateway-constants.ts`;gateway 改读 `team-base-url`,切断对 yuxi-client 的间接边。
3. KB 获得独立 namespace `kb-connection.ts`;`yuxi-request.ts` 改读它 + KB-local 401 处理。
4. `host.rs:741-781` 改读 KB 独立 key(带 legacy `yuxi.connection` back-compat 读)。
- Files:`team-base-url.ts`(new)、`team-service-auth.ts`、`team-service-connection.ts`、`team-model-gateway.ts`、`model-selection-context.ts`、`model/team-gateway-constants.ts`(new)、`yuxi-request.ts`、`crates/host/src/host.rs`。
- **验收**:`lint:ts-cycles` 仍绿;此时 @forge/ui 内 yuxi-client 的消费方**只剩** KB 自己。

### Phase 3 — 抽取 @forge/kb + registry(L,终态)
1. `packages/ui/src/plugins/feature-plugin.ts` + `feature-registry.ts`(零 UI 依赖叶子,加进 `check-ts-runtime-cycles.mjs` allowlist)。
2. `ForgeApp.tsx`/`app-navigation-rail.tsx` 的 nav/content 改 registry 驱动;`AppNavigationTab` union 放宽为 `'workbench' | string`。
3. 新建 `packages/kb`(package.json + tsconfig,`packages/*` glob 无需改);移入 ~54 个 yuxi-*/kb-* 文件 + `kb-views.css`;`kb-plugin.ts` 注册 4 tab + route + KB 设置面板 + MCP descriptor。
4. `apps/desktop/src/main.tsx`:import `@forge/kb` 并 register——**唯一** KB wiring 点,删它即 tree-shake 整个 KB。
5. `team-service-auth-gate.tsx` 的登录表单抽成 `SignInPanel`,从 account menu 唤起。
- Files:见第 1 节目标结构;`tsconfig.base.json`、`scripts/check-ts-runtime-cycles.mjs`、`apps/desktop/src/main.tsx`。
- **可选护栏(借 Design 3)**:CI 加"grep @forge/kb-free build 产物无 KB 路径"断言,为未来 community 安装包守 tree-shake。

### Phase 4(可选,defer)— Rust descriptor 泛化
仅当真要支持第三方 MCP 插件时,才把 `sync_yuxi_mcp_config` 泛化为 descriptor 驱动。**当前不做**(YAGNI;token-presence gating 已够,且涉及外部进程线路契约,风险高收益低)。

---

## 5. 风险与残留耦合(诚实清单)

**仍然耦合(有意保留):**
- **team auth + team model gateway 继续共享 team backend** ——它们本就是 team backend,只摘 KB,符合"partially reverse"的原意。
- **gateway 留在 @forge/ui**:无登录用户用不了 team 模型(by design)。
- **`@forge/kb` 依赖 `@forge/ui`**:KB 是 downstream 插件,不是独立 app,不能脱离 @forge/ui 单发。
- **Rust 端 `[mcp_servers.yuxi]` table 名/env 名保持**:那是与外部 yuxi MCP 进程的线路契约,不随 TS 改名。

**真实风险:**
- **模型供给是整个 B 臂的命门**:若 Phase 0 证明 codex login + BYO 都不通,"无 Yuxi 对话"开箱即死(noReadyProvider 或对死端点 "Reconnecting N/5")。Phase 0 必须先过。
- **404→空白 / cycle / 文件数低估**:Phase 2/3 已专门针对这三个被四设计漏掉的点(PERSISTABLE_APP_TABS 回退、yuxi-client barrel 切边、~54 文件而非 38)。
- **`DEFAULT_YUXI_BASE_URL` 硬编码 LAN IP `192.168.61.214:5050`**:拆分时 team-service 需要自己合理的默认 URL,别继承这个内网地址。
- **gate 登录 UI 重定位是真工作量**(form/register/DingTalk/service-URL,~110 行),不是"加一个分支",已计入 Phase 3。

**打包/分发含义:**
- 终态是**运行时可拔插**(一个 app,`@forge/kb` import 决定是否带 KB),符合诉求。
- 若未来要"零 KB 字节的 community 安装包",再叠加 Design 3 的 CI grep 护栏即可,无需改架构——这正是把 Design 2 选为骨架的好处:运行时与构建时两种分发可叠加,而 Design 3 反过来做不到运行时插拔。

---

## 一句话总结

以 **Design 2 的 `@forge/kb` 抽取**为终态骨架,**Design 1 的最小 optional-login + render-gate** 为可立即上线的 Phase 1,中间插入一个所有设计都漏掉的 **Phase 2 连接 seam 拆分**(切断 `team-service-connection → yuxi-client` barrel、下沉 gateway 常量、迁 401 订阅)来根除 cycle;认证走**可选登录**,模型靠已核实的 `codex login`(ChatGPT 订阅)或 BYO key 而非赌 hicodex_local;Rust 保持 token-presence gating 不动。**Phase 0 验模型先行,否则退守岔路 A。**
