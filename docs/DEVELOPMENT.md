# HiCodex Development Guide

This is the single source of truth for developing HiCodex. Read it before changing code. Keep it practical, current, and non-duplicative.

## 1. Product Boundary

HiCodex is a Codex Desktop shell, not a new agent runtime.

- Execution kernel: Codex `app-server`.
- Desktop host: Tauri + Rust.
- UI: React + TypeScript.
- Protocol truth: local Codex checkout `../codex/codex-rs/app-server-protocol/schema/typescript`.
- Shipped desktop UI truth: `/Applications/Codex.app/Contents/Resources/app.asar`.

Do not port HiClow runtime chains into this repo:

- No `QueryLoopExecutor`.
- No `AgentTask.steps/answer` as a second source of truth.
- No `ActorChatPanel`.
- No separate AI store that competes with Codex `Thread / Turn / ThreadItem`.

When a feature needs agent behavior, first ask: can app-server already do this through protocol/config? If yes, use that. If not, build an app-layer overlay before considering Codex core changes.

## 2. Architecture

Current ownership:

| Path | Responsibility |
| --- | --- |
| `apps/desktop` | Tauri shell, app entry, Vite config, packaging. |
| `crates/host` | Rust sidecar lifecycle, isolated Codex home, local profile bootstrap, stdio JSON-RPC transport. |
| `packages/codex-protocol` | TypeScript protocol facade/generated types. Keep aligned with local Codex protocol. |
| `packages/ui` | React UI, JSON-RPC client, reducers, app-layer projection, settings. |
| `docs/DEVELOPMENT.md` | This guide. Avoid adding new docs unless this file becomes too large. |

Data flow:

```text
Codex app-server
  -> JSON-RPC notifications / requests
  -> packages/ui state reducer
  -> clean-room projection layer
  -> React panels and controls
```

The UI may project app-server facts, but it must not invent durable facts. Runtime state comes from app-server payloads; UI state only stores view preferences, pending client state, and app-level configuration drafts.

## 3. Documentation Policy

Prefer one document: this file.

Add a new doc only when all are true:

- The topic is large enough to make this file hard to scan.
- The child doc owns a distinct topic.
- The child doc is linked from this file.
- No content is copied between docs.

If a new doc is needed, use this structure:

```text
docs/DEVELOPMENT.md        # index and global rules
docs/dev/<topic>.md        # one topic, no repeated global rules
```

Linked topic docs:

- [docs/dev/presales-mcp-tools.md](dev/presales-mcp-tools.md): MCP tool boundary for the presales knowledge-base prototype and Skill file workflow.
- [docs/dev/codex-alignment-dispatcher.md](dev/codex-alignment-dispatcher.md): 5-channel streaming delta dispatcher and item-level notification rules.
- [docs/dev/codex-alignment-reasoning.md](dev/codex-alignment-reasoning.md): Reasoning ThreadItem (dead code), Thinking placeholder classifier, exploration card, shared animation infra.
- [docs/dev/codex-alignment-plan.md](dev/codex-alignment-plan.md): Plan summary card behavior, 10 i18n strings, and Open-button stub rule.
- [docs/dev/codex-alignment-unified-diff.md](dev/codex-alignment-unified-diff.md): Inline diff card and Failure Dialog (41 i18n strings, tone classes, Undo/Reapply backend contract).
- [docs/dev/codex-alignment-collab-agent.md](dev/codex-alignment-collab-agent.md): Collab agent rowAction vs header verb tables (Failed-state divergence).
- [docs/dev/codex-alignment-image-generation.md](dev/codex-alignment-image-generation.md): `case 'generated-image': return null` rule, right-rail Artifacts cap, turn-level gallery, lightbox.
- [docs/dev/codex-alignment-gap-matrix.md](dev/codex-alignment-gap-matrix.md): Implementation status and remaining gaps across all intermediate-output surfaces.

Do not add ad hoc handoff docs, scratch notes, copied agent outputs, or extracted `app.asar` content. Temporary investigation output belongs under `/private/tmp`, not in the repo.

## 4. Source Of Truth Rules

Use evidence before implementation.

For protocol and runtime behavior:

- Inspect local Codex protocol files before hand-writing request/notification shapes.
- Do not assume field names from screenshots.
- If generated protocol is stale, sync it instead of adding broad `any` objects.
- Check both the root generated facade and `generated/v2` before declaring a method or field absent. v2-only surfaces such as permission profiles, app notifications, account rate limits, and connector metadata must be verified against the upstream schema, not inferred from older local helpers.

For UI parity:

- Inspect installed Codex Desktop chunks in `app.asar`.
- Implement clean-room equivalents; never copy minified code.
- Keep a short evidence note in this guide only when it changes a durable rule.

Codex Desktop evidence workflow:

- Run `node scripts/extract-codex-asar.mjs` to extract `/Applications/Codex.app/Contents/Resources/app.asar` to `/private/tmp/codex-asar`. Pass `--force` to refresh after a Codex update and `--pretty` when a prettified mirror is useful. Override paths with `HICODEX_CODEX_ASAR` / `HICODEX_CODEX_ASAR_OUT`.
- Use that directory (not the repo) as the source of truth when reasoning about render groups, sidebar order, composer behavior, etc. PR descriptions may cite chunk filenames as the snapshot inspected for that change, but the durable rule should cite stable evidence such as routes, JSON-RPC methods, config keys, ICU/defaultMessage strings, data attributes, CSS custom properties, or visible behavior.
- Never paste minified code into the repo or docs; only describe derived rules.
- Do not make minified function names, prettified line numbers, or chunk hashes the permanent contract. They are search breadcrumbs for one Desktop build and must be re-verified after an app update.

Codex Desktop UI parity map (current state):

This map records durable behavior rules. Chunk globs identify evidence areas only; do not treat minified symbols, line offsets, or chunk hashes as stable APIs, and do not add new rules that depend only on one extracted build.

| Desktop area | HiCodex implementation | Key rule |
| --- | --- | --- |
| `app-server-manager-signals-*.js` (collab event family) | `crates/host/src/lib.rs::RolloutToolReplay::handle_collab_*` + `handle_*_agent_function_call*` | Rollout JSONL `collab_agent_spawn_end` / `collab_agent_interaction_end` / `collab_waiting_end` / `collab_close_end` / `collab_resume_end`, plus persisted `response_item.function_call` pairs such as `spawn_agent` / `wait_agent`, are replayed into `collabAgentToolCall` items so spawn rows survive a refresh or session switch. |
| `local-conversation-thread-*.js` + `AnimatePresence-*.js` | `packages/ui/src/components/turn-collapse.tsx` + `animated-disclosure.tsx` + `conversation-view.tsx` | Per-turn collapse state is page-local and keyed by `(threadId, turnId)`. Completed turns default collapsed unless pending/app-tool content requires an explicit user toggle. Active turns render worked-for as a divider; completed turns attach the collapse toggle to that label. Disclosure motion, spacing, web-search pluralization, collapsed activity label parts, and truncation should follow Desktop behavior, but symbol names and line offsets are only breadcrumbs. |
| `local-conversation-thread-*.js` + `user-message-attachments-*.js` | `packages/ui/src/components/message-unit.tsx` + `user-message-content-render.tsx` | User attachments render in a separate right-aligned strip before the `max-width: 77%` user bubble. User status chips and the copy/edit/timestamp action row share the same below-message strip, but status chips stay as siblings of the action row so they do not reorder Copy/Edit. Status text stays visible while buttons and timestamps are hover/focus affordances. Assistant action order is copy, clickable artifacts action, fork, auto-review stats, timestamp; timestamp does not create an actions row by itself. Message actions are hover/focus affordances, not always-visible cards, and copy actions show the Desktop-style `Copied to clipboard` toast. |
| `local-conversation-thread-*.js` + `virtualized-turns-*.js` | `packages/ui/src/components/conversation-view.tsx` | Turn rows use Desktop's virtual list constants: 280px estimated row height, 12px gap, 2-row overscan, `data-turn-key`, `data-content-search-turn-key`, measured height cache keyed by turn key, bottom-distance range calculation, near-bottom scroll anchoring, and `content-visibility: auto` / `contain-intrinsic-size: auto 240px`. Render units expose `data-content-search-unit-key` and `data-content-search-turn-key` for search. `data-item-ids` is a HiCodex-only attribute kept for jump-to-source debugging in dev tooling; Desktop never emits it and it must not be treated as a parity contract. |
| `local-conversation-thread-*.js` content search data attrs | `packages/ui/src/HiCodexApp.tsx` + `command-panel.ts` | Cmd/Ctrl+F opens a thread-find command panel over currently rendered `[data-content-search-unit-key]` units. Entries search the visible transcript text and jump back to the matching unit with a temporary highlight. This is a local find-in-thread surface; it does not invent server-side transcript search. |
| `thread-page-header-*.js` + `thread-layout-*.js` + `thread-scroll-layout-*.js` + `scroll-to-bottom-buton-*.js` | `packages/ui/src/components/conversation-chrome.tsx` + `thread-scroll-layout.tsx` + `HiCodexApp.tsx` | Conversation chrome is a single compact row: project chip plus optional start/secondary/trailing affordances. Never render a second `cwd` row, an editable cwd input, or a chrome top-right turn-running pill. The workspace path appears at most once across chrome, empty-state hero, and toolbar combined. Turn-running is signaled via the scroll-to-bottom button's working-dots, not as chrome chrome. Always-visible kebab/`MoreHorizontal` thread-action menus do not belong in chrome; thread actions live on the sidebar row context-menu and on turn-row affordances. Conversation content and composer share one thread scroll system. Content and footer use Desktop's current thread tokens (`--thread-content-max-width: none`, toolbar padding 16px, chat font 13px); scroll container uses Desktop's `flex-col-reverse` distance-from-bottom semantics where bottom is `scrollTop = 0`; footer uses `data-thread-scroll-footer`, sticky bottom placement, focus-within scroll-padding reset, measured footer height plus 16px scroll padding, page-scoped distance restoration, 24px bottom-distance threshold, scroll controller callbacks, and a 32px centered scroll-to-bottom button. |
| `loading-page-*.js` + `composer-*.js` start-conversation flow | `packages/ui/src/hooks/use-turn-submission.ts` + `HiCodexApp.tsx` | Before a local conversation is materialized, the main transcript area should show a centered loading shell for runtime connection and `thread/start` handoff states. This is a transient state surface only; do not replace it with a marketing or onboarding page. |
| `app-shell-*.js` + `app-main-*.js` + `sidebar-signals-*.js` + `sidebar-project-groups-*.js` + `sidebar-thread-keys-*.js` + `use-workspace-file-search-*.js` | `packages/ui/src/components/sidebar.tsx` + `packages/ui/src/components/command-panel.tsx` + `packages/ui/src/state/sidebar-projection.ts` + `sidebar-preferences.ts` | Left thread rail follows Desktop sizing, top nav order, Search-as-command-menu behavior, account/profile footer before Settings, persisted organize/sort/collapsed/section preferences, `updated_at` sorting, sub-agent filtering, project/recent/current-workspace grouping, compact relative update time, and row status projection. Cmd/Ctrl+K and the native Search menu open a searchable command menu over commands, past chats, and backend-backed workspace file search (`fuzzyFileSearch`). File results attach Desktop-style composer mentions instead of inventing a new `UserInput` type. `codex://threads/{id}` URLs route to known threads or resume/read by id once the shell delivers the URL. Header and row actions are hover/focus affordances. Omit actions that need missing HiCodex host/protocol flows such as new worktree or new window, and do not add badges or disabled nav items without matching Desktop data. |
| `user-message-attachments-*.js` + `app-main-*.js` | `packages/ui/src/components/message-unit.tsx` + `thread-workflow.ts::editLastUserTurn` | Edit is allowed only for the latest non-running user turn. The inline editor replaces the user bubble and reuses the prompt editor surface rather than a plain textarea; submit follows Desktop order: `thread/read` for the original input, `thread/rollback` one turn, then `turn/start` with the first text input replaced and structured inputs preserved. Long user messages collapse at 20 lines; timestamp formatting uses today / recent weekday / older date buckets. |
| `app-server-manager-signals-*.js` + `local-conversation-thread-*.js` | `packages/ui/src/state/thread-workflow.ts::forkThreadFromTurn` + `message-unit.tsx` | Assistant fork action uses the Desktop sequence: `thread/fork` from latest, then `thread/rollback` the forked thread by the number of later turns. |
| `composer-*.js` + `prompt-editor-*.js` + `add-project-menu-items-*.js` | `packages/ui/src/components/composer.tsx` + `prompt-editor.tsx` + `pending-request-stack.tsx` + `HiCodexApp.tsx` + `composer-external-footer.tsx` | Main thread composer defaults to Desktop's multiline local conversation surface; `auto-single-line` remains explicit. Footer order is context controls, editor, submit. Queued follow-ups and pending requests live above the composer. Request panels replace the normal input surface while active. Prompt editing uses the Desktop-style ProseMirror/contenteditable behavior for paste, files/images, keyboard submit/newline, placeholders, focus, and single-line overflow. The external footer exposes project selection before local-work, branch, model, and reasoning context. |
| `composer-*.js` + `app-server-manager-signals-*.js` | `packages/ui/src/state/approval-requests.ts` + `pending-request-stack.tsx` | Command approval choices mirror Desktop decision ids: run once, conversation/session approval, `acceptWithExecpolicyAmendment`, and `applyNetworkPolicyAmendment` when app-server provides proposed policy amendments. Network approvals show one-time, conversation host, and future host allowlist options and return the exact nested app-server decision objects. |
| `split-items-into-render-groups-*.js` + `local-conversation-thread-*.js` | `packages/ui/src/state/project-conversation.ts::splitTurnItems` + `components/thread-item-view.tsx` | Turns are first split into Desktop render buckets, then projected in conversation order with Desktop's 12px turn gap and 16px tool/assistant block gap. The transcript emits user items, high-risk model reroutes, agent activity, automation updates, assistant output, tool outputs, post-assistant items, eligible MCP elicitations, plans, live thinking placeholders, diffs, and remote/personality/fork events. `modelRerouted` items render only when `reason === "highRiskCyberActivity"`; do not surface other reroute reasons as transcript banners. `unifiedDiffItem` renders when `!hasBlockingRequest && conversationDetailLevel !== "STEPS_PROSE"`; do not gate it on assistant presence. Do not introduce a synthetic `hook` ThreadItem type — Desktop expresses hook activity as `hookStats` / `hookRuns` fields on existing user-message items, never as a standalone item. Pending permission / approval / user-input requests stay out of transcript rows and only feed blocking-request state above the composer. Real `todo-list` items both drive right-rail Progress and render as an inline collapsible plan card; do not short-circuit them out of the conversation stream. Segments with no user message keep the legacy linear path for old imported/orphan assistant data. |
| `composer-*.js` | `queued-follow-up-stack.tsx` + `queued-followups.ts` + `turn-submission.ts` | Queued follow-up rows mirror Desktop semantics: hover-only actions, drag reorder, paused retry affordance, row actions menu with queueing on/off, queue vs steer as separate follow-up submit actions, and Desktop-style `Queue` / `Steer` tooltip labels. |
| `split-items-into-render-groups-*.js` + `local-conversation-thread-*.js` | `tool-activity-grouping.ts` + `event-unit.tsx` + `tool-activity-detail.tsx` | Standalone reasoning items do not render as raw rows unless they are the synthetic thinking placeholder. Reasoning is folded into surrounding exploration/mergeable activity or skipped. Adjacent exec, exploration, web-search, and collapsed activity rows merge into one collapsed activity bucket with cross-type summary counts. Detail rendering filters reasoning rows out, read/search/list use the Desktop exploration group type, active exploration previews open, completed exploration starts collapsed, and MCP/web-search details keep their Desktop-style grouping. |
| `markdown-*.js` / React Markdown micromark autolinks | `packages/ui/src/components/message-unit.tsx::parseMarkdownInline` | Assistant markdown supports CommonMark angle autolinks for URL schemes and email addresses while leaving non-autolink HTML tags as plain text in the lightweight renderer. |
| `markdown-*.js` sanitized basic HTML schema | `packages/ui/src/components/message-unit.tsx::parseBasicInlineHtml` | Basic inline HTML allowed by Desktop's sanitized markdown path (`br`, emphasis tags, `sub`, `sup`, `u`) renders as inline formatting while unsupported tags remain plain text. |
| `markdown-*.js` ordered list renderer | `packages/ui/src/components/message-unit.tsx::parseMarkdownBlocks` | Ordered lists preserve non-default starting numbers via `<ol start>` instead of always restarting at 1. |
| `markdown-*.js` link renderer | `packages/ui/src/components/message-unit.tsx::MarkdownLink` | Markdown links should stay compact and action-like rather than plain underlined text. Desktop's durable rule is safe URL handling plus compact link affordances; favicon fetching is not a Desktop contract and must not be treated as required parity. |
| `markdown-*.js` math extension + `katex-*.js` | `packages/ui/src/components/message-unit.tsx::parseMarkdownMathBlock` + inline math parsing | Assistant markdown treats `$$...$$`, `\[...\]`, `$...$`, and `\(...\)` as math surfaces instead of plain text and renders them through KaTeX with non-throwing errors. |
| `markdown-*.js` sanitized details renderer | `packages/ui/src/components/message-unit.tsx::parseMarkdownDetailsBlock` | Sanitized `<details><summary>` markdown renders as a compact expandable block with a chevron instead of leaking raw HTML into assistant output. |
| `markdown-*.js` media renderer + `image-preview-dialog-*` | `packages/ui/src/components/message-unit.tsx::MarkdownImageView` | Consecutive markdown media lines render as a compact grid, images lazy-load behind a zoomable preview trigger, the preview dialog closes on backdrop/Esc, and video URLs/data URLs use a video element with controls instead of a broken image surface. |
| `code-snippet-*.js` + `highlight-code-*.js` | `packages/ui/src/components/message-unit.tsx::CodeSnippet` | Code fences render in a token-like bordered snippet with header, wrap toggle, copy action, selected-text copy preference, Desktop-compatible `hljs-*` token scopes for common languages, and SVG image preview for `svg` fences or `xml/html` fences whose content starts with `<svg`. |
| `markdown-*.js` Mermaid fence path | `packages/ui/src/components/message-unit.tsx::MermaidDiagram` + `sanitizeMermaidCode` | `mermaid` fences render through the public Mermaid package with Desktop-style strict security, deterministic ids, `htmlLabels: false`, stripped `click` bindings, and blocked `securityLevel` overrides. HiCodex keeps a clean-room flowchart preview/code fallback for failed renders; do not copy bundled Mermaid implementation from `app.asar`. |
| `local-environments-*.js` thread sort + `is-subagent-conversation-*.js` | `packages/ui/src/state/sidebar-projection.ts` | `updated_at desc` (with `created_at` fallback) and sub-agent threads (`threadSource === "subagent"`, or with `agentNickname`/`agentRole`) hidden from the main sidebar list. |
| `local-conversation-page-*.js` background-agent action | `packages/ui/src/components/background-agent-panel.tsx` + `HiCodexApp.tsx` | Multi-agent row clicks hydrate the child thread into a background-agent panel; they must not switch the main active thread route. |
| `local-conversation-page-*.js` side-chat action + `command-messages-*.js` | `packages/ui/src/state/thread-workflow.ts::startSideConversation` + `background-agent-panel.tsx` + `HiCodexApp.tsx` | Side chat opens the current local thread as an ephemeral right-panel conversation: `thread/fork` with `path: null`, `persistExtendedHistory: false`, `threadSource: "user"`, `ephemeral: true`, appends Desktop side-conversation developer instructions, and injects a synthetic user boundary via `thread/inject_items`. The side panel must not select or replace the main thread. |
| `use-skills-*.js` + `skill-utils-*.js` + `skills-page-*.js` | `packages/ui/src/state/slash-request-workflow.ts` + `command-panel.ts` + `HiCodexApp.tsx` | `/skills reload` maps to `skills/list.forceReload`; skill rows use protocol metadata such as `interface.displayName`, scope, default prompt, dependencies, load errors, insert Desktop-style default prompt text plus a `$skill` prompt link without duplicating an existing link, do not attach the selected skill as a separate structured composer input, expose Desktop-style enable/disable secondary actions backed by `skills/config/write` followed by a forced `skills/list` refresh, and treat `skills/changed` as an invalidation signal that refreshes an open Skills panel. |
| `permissions-mode-helpers-*.js` + `permissions-mode-defaults-*.js` | `packages/ui/src/state/permissions-mode.ts` + `HiCodexApp.tsx` | `/permissions` projects Desktop's read-only / auto / granular / full-access mode order and writes the matching `sandbox_mode`, `approval_policy`, `approvals_reviewer`, and workspace-write sandbox defaults through `config/batchWrite`. Desktop also derives a `custom` mode (degraded status when the (`sandbox_mode`, `approval_policy`, `approvals_reviewer`) tuple does not match a preset) and gates `guardian-approvals` on workspace `requirements`. HiCodex may surface these as read-only status badges, but do not expose them as separately selectable modes without the upstream gating. |
| `composer-*.js` + `use-personality-*.js` | `packages/ui/src/state/personality.ts` + `slash-request-workflow.ts` + `HiCodexApp.tsx` | `/personality` exposes Desktop's Friendly and Pragmatic rows, marks the current choice, appends the current-model not-applicable suffix for `gpt-5.2` / `gpt-5.1*`, writes `personality` through config, clears legacy `model_personality`, refreshes user config, and injects Desktop's synthetic personality-changed event into the transcript. |
| `composer-*.js` + `app-server-manager-signals-*.js` | `packages/ui/src/state/slash-request-workflow.ts` + `thread-workflow.ts` + `command-panel.ts` | `/memories` exposes Desktop's Use memories and Generate memories controls. New chats use `config` entries `memories.use_memories` / `memories.generate_memories`; existing chats keep Use memories fixed and call `thread/memoryMode/set` with `enabled` / `disabled` for future memory-generation eligibility. |
| `locale-resolver-*.js` + `use-resolved-theme-variant-*.js` + `app-main-*.js` | `packages/ui/src/state/i18n.ts` + `components/i18n-provider.tsx` + `state/theme.ts` + `HiCodexApp.tsx` | Locale and theme are app-shell preferences, not per-thread facts. HiCodex resolves `en-US` / `zh-CN` from stored/browser locale, exposes a local `formatMessage` provider for `hc.*` IDs, persists `system` / `light` / `dark` appearance locally, follows `prefers-color-scheme` in system mode, writes `data-theme` / `data-theme-mode` on the shell root, and `/theme` opens the command panel without requiring app-server connectivity. |
| `app-main-*.js` feedback form | `packages/ui/src/state/slash-request-workflow.ts` + `command-panel.ts` | `/feedback` opens a local feedback report panel. Until HiCodex owns Codex Desktop's upload endpoint, the supported path is to copy diagnostics (thread id, workspace, runtime status, recent UI logs) and open the Codex GitHub issue template with the thread id in the `steps` parameter. |
| `welcome-page-*.js` + `onboarding-state-*.js` + `nux-gate-*.js` | `packages/ui/src/state/onboarding.ts` + `components/onboarding-empty-state.tsx` | First-run state uses Desktop's durable local keys (`last_completed_onboarding`, `electron:onboarding-projectless-completed`, `electron:onboarding-welcome-pending`, `electron:onboarding-hide-first-new-thread-promos`). HiCodex keeps this as a lightweight pre-conversation empty state and dismissible first-new-thread banner; do not replace the thread surface with a marketing landing page. The empty-state hero must use Desktop ICU slogans (`home.hero.letsBuild`, `home.hero.whatShouldWeBuild`, `home.hero.whatShouldWeWorkOnInProject`) rather than ad hoc copy such as `Start a chat`, and must not duplicate the composer's `+ New chat` / `Choose folder` affordances while the composer is mounted. The workspace path appears at most once across hero, chrome, and toolbar combined. |
| `prompt-editor-*.js` + `use-file-mention-autocomplete-*.js` + `use-workspace-file-search-*.js` + `use-skills-*.js` + `apps-queries-*.js` + `use-plugins-*.js` | `packages/ui/src/components/composer.tsx` + `prompt-editor.tsx` + `composer-workflow.ts` + `mention-options.ts` + `HiCodexApp.tsx` | `@` on the active input line opens the inline mention picker. File candidates come from app-server fuzzy search; skills, apps, and plugins come from their list endpoints and insert Desktop-style prompt links (`$skill`, `$app`, `@plugin`) rather than new protocol-level `UserInput` types. Prompt mention chips must survive ProseMirror serialization/deserialization. |
| Right rail + `composer-*.js` | `packages/ui/src/state/right-rail.ts` + `rail-projection.ts` + `background-agents.ts` + `background-terminals.ts` + `components/right-rail.tsx` + `HiCodexApp.tsx` | Section order is Progress, Git, Outputs, Side chats, Background tasks, Sources. Git and Outputs are mutually exclusive: Git is shown for Git-backed thread context, while Outputs is the non-git output/artifact section. Progress, Side chats, and Background tasks collapse when empty; mounted Outputs/Sources render Desktop empty rows such as `No artifacts yet` / `No sources yet`. Progress shows a completed-task summary plus all plan rows, with completed rows struck through; Side chats show active parent side-panel threads and use a spinner when in progress; Background tasks combines receiver threads and running terminals, with terminal stop as a row action. Outputs/Sources use a 6-item preview. The rail is a responsive floating panel with Desktop side-space thresholds: overlay below 180px, shift below 400px, gutter at 400px and above. Pinned state is persisted; unpinned mode floats without reserving thread layout space. Headers are sticky, text-only, and separated by inset rules. File icons are monochrome approximations, and preview panels remount when reopened so rewritten files are re-read. |
| `diff-unified-*.js` + `review-file-source-tab-*.js` | `packages/ui/src/components/file-preview-panel.tsx` | Diff preview file headers expose hover/focus actions for opening the file in the editor and copying the diff path. The open action resolves relative diff paths through the thread cwd/workspace roots before calling the host file opener. |
| Queued follow-up duplicate detection | `packages/ui/src/state/queued-followups.ts::isQueuedFollowUpDuplicate` | Canonical `(text, attachments)` key used to skip duplicate follow-ups while a turn is still streaming. |
| App connection + toasts | `packages/ui/src/lib/codex-json-rpc-client.ts` + `HiCodexApp.tsx` + `components/app-toast-viewport.tsx` | Host lifecycle/error events refresh sidecar status, the UI polls `host_status`, auto-reconnects with backoff after a lost connection, marks known threads `notLoaded` after reconnect before resuming the active thread, and renders recent user-facing `state.logs[]` as transient toasts. Sidecar lifecycle status is a HiCodex-only surface (Codex Desktop's equivalent lives in tray/Activity Monitor): expose it as a sidebar-footer micro-indicator plus toasts on transitions across running / connecting / reconnecting / starting / error / offline. Do not render sidecar state as a chrome top-right pill — that placement collides with Desktop's turn-running indicator (scroll-to-bottom working-dots). |
| Debug surfaces | `packages/ui/src/lib/codex-json-rpc-client.ts` + `packages/ui/src/state/slash-request-workflow.ts` + `packages/ui/src/state/rpc-debug.ts` + `packages/ui/src/state/build-info.ts` | `/debug-config` reads effective config layers from app-server and includes the local HiCodex build version, mode, channel, flavor, and build id. `/rpc` is a local session inspector over recent JSON-RPC and host events; it must not require a live app-server connection and must keep only a bounded in-memory history. |
| `app-server-manager-signals-*.js` notification table | `packages/ui/src/state/codex-reducer.ts::applyNotification` | Item lifecycle case extended with `item/autoApprovalReview/*`, `item/commandExecution|fileChange|permissions/requestApproval`, `item/tool/call`, `item/tool/requestUserInput`. `thread/goal/updated` and `thread/goal/cleared` must drive the user-message goal pill projection; do not silently no-op the cases. Deprecated `thread/compacted` is folded into a completed `contextCompaction` item so old compaction notifications still leave a transcript event. |
| `mcp-settings-*.js` + `mcp-server-form-*.js` | `packages/ui/src/components/mcp-server-config-form.tsx` + `state/mcp-skills-management.ts` | MCP server config writes go through `config/batchWrite` and must include `filePath` and `expectedVersion` so concurrent edits don't silently overwrite each other. The per-server form must surface `enabled_tools`, `disabled_tools`, `startup_timeout_sec` / `startup_timeout_ms`, and `tool_timeout_sec` alongside transport, command, args, env, and headers. Restart prompts after MCP edits reuse the existing toast surface — do not invent a separate banner. |

Known gaps and deliberate boundaries:

- Apps and connector OAuth: app metadata comes from paged `app/list`; connector enablement writes `apps.{id}.enabled`; `app/list/updated`, `mcpServer/oauthLogin/completed`, and claimed app-connect OAuth callbacks invalidate app/MCP surfaces. Desktop connector OAuth completion uses the HTTP callback path `/aip/connectors/links/oauth/callback`; HiCodex intentionally claims `codex://app-connect-oauth...` and browser callback URLs, de-dupes by OAuth `state`, and refreshes app/plugin panels after the callback. Remaining parity is the product-owned connector start/finish HTTP bridge (`/aip/connectors/links/oauth` and `/callback`) or a protocol-owned equivalent; do not invent local `app/authenticateUrl` / `app/openUrl` JSON-RPC methods from screenshots or old notes.
- Sidebar persisted view state: `packages/ui/src/state/sidebar-preferences.ts` owns the Desktop-style keys `sidebar-organize-mode-v1`, `thread-sort-key`, `sidebar-collapsed-groups`, and `sidebar-section-order-v1` with a legacy migration path. Keep future sidebar preferences in that module; do not reintroduce page-local durable state or scattered localStorage calls.
- Automations and schedule: HiCodex has a read-only preview surface for schedules when app-server data exists, transcript `automation-update` rendering, and the Desktop-style active-thread heartbeat eligibility selector (local host, resumed conversation, no pending request, no running turn). Full parity still needs real management routes/endpoints for creating, editing, enabling/disabling, and cron/heartbeat execution management; a feature-gated sidebar label alone is not parity.
- Native shell: native menu/accelerators, Cmd/Ctrl+K command-menu delivery, command-menu file search, turn-completion system notification plumbing, local notification policy/sound preferences, single-instance activation, OS-level `codex://` URL delivery, `codex://threads/{id}` runtime routing, and local `.app`/DMG packaging validation are present. Auto-update packaging is config-driven: local `tauri.conf.json` keeps updater artifacts/endpoints disabled, while release builds must inject real `HICODEX_UPDATER_ENDPOINTS`, updater public/private keys, and macOS signing identity/certificate through `apps/desktop/scripts/tauri-release-config.mjs`. Do not commit placeholder endpoints or private signing material. Still-missing product-owned shell work is notification entitlement/distribution policy.
- Account, quota, and sign-out: account state now owns `account/read`, `account/rateLimits/read`, `account/rateLimits/updated`, sidebar avatar/profile summary, quota tone, a footer account menu, and sign-out. Remaining parity is Desktop-level quota banner behavior and product-owned upgrade/billing flows.
- High-fidelity Office previews: HiCodex may offer lower-fidelity previews or OS/native open behavior, but do not chase Codex Desktop's high-fidelity docx/pptx renderer in Tauri unless product explicitly accepts the runtime cost and maintenance surface.
- ChatGPT upgrade/billing surfaces and mobile remote-control flows are product-scope decisions, not automatic parity requirements for this desktop shell wave.
- Native mention metadata sync for installed app/plugin icons and localized labels remains tracked separately.

Known useful Codex Desktop chunks:

| Area | asar path |
| --- | --- |
| Local conversation page | `webview/assets/local-conversation-page-*.js` |
| Composer and pending requests | `webview/assets/composer-*.js` |
| Render groups | `webview/assets/split-items-into-render-groups-*.js` |
| Conversation markdown | `webview/assets/conversation-markdown-*.js` |
| Commands | `webview/assets/command-messages-*.js` |
| App shell | `webview/assets/app-shell-*.js` |
| Thread keys | `webview/assets/sidebar-thread-keys-*.js` |
| App/server notifications | `webview/assets/app-server-manager-signals-*.js` |
| Connector OAuth | `webview/assets/app-connect-oauth-*.js`, `webview/assets/apps-queries-*.js` |
| Sidebar persisted state | `webview/assets/sidebar-signals-*.js`, `webview/assets/sidebar-project-groups-*.js` |
| Artifacts | `webview/assets/artifact-tab-content*.js`, `webview/assets/artifacts-*.js` |
| Locale labels | `webview/assets/zh-CN-*.js` |

UI contract from Codex Desktop:

```text
ThreadItems
  -> render groups
  -> conversation page
  -> composer / right rail / sidebar state
```

Consequences:

- Do not render raw `ThreadItem[]` directly in components.
- Use a projection layer for render groups and right-rail data.
- Pending user input, approval, MCP elicitation, and permission requests belong above the composer.
- Right rail order is `Progress -> Git -> Outputs -> Side chats -> Background tasks -> Sources`.
- Git and Outputs are mutually exclusive; do not render both summary sections in one rail.
- Empty `Progress`, Side chats, and Background tasks sections should be hidden; mounted `Outputs` and `Sources` show Desktop empty-state rows.
- `Progress` comes from latest `todo-list.plan[]`, not arbitrary activity logs.
- `Progress` shows a completed-task summary plus all plan items; right-rail pinned state controls whether the rail reserves layout space; `Side chats` shows active parent side-panel threads; `Background tasks` combines real receiver threads and running unified exec commands; `Outputs` and `Sources` show 6 items by default, then show more/less.

## 5. Code Organization

Split files by responsibility, not by arbitrary size. A file should have one reason to change.

Use these boundaries:

- Host lifecycle and filesystem bootstrap: `crates/host`.
- Tauri command registration: `apps/desktop/src-tauri/src/main.rs`.
- JSON-RPC transport in UI: `packages/ui/src/lib`.
- App reducer and durable UI state: `packages/ui/src/state`.
- Projection from app-server facts to UI view models: `packages/ui/src/state/render-groups.ts` or sibling projection files.
- React components: keep large reusable views out of `HiCodexApp.tsx` once they become independently testable.

When to split:

- A component owns a distinct workflow, such as composer, pending request card, right rail, settings.
- A helper has domain semantics, such as model catalog, render groups, approval response mapping.
- A file becomes hard to review because unrelated concerns are mixed.

Do not split just to create folders. Do not keep adding code to `HiCodexApp.tsx` when a workflow can be named and tested separately.

## 6. No Hardcoded Runtime Data

Hardcoded defaults are allowed only as bootstraps with clear ownership.

Allowed:

- Default local gateway values used to create first-run config.
- Default model catalog entry in `crates/host` for isolated HiCodex home.
- Static UI labels.
- Feature gates and seed local team placeholder until the real team layer exists.

Not allowed:

- Hardcoded user workspace paths inside reusable components.
- Hardcoded model names in UI logic when the value should come from config.
- Mock thread/task data in production reducers.
- Duplicating app-server state in another long-lived store.
- Hidden assumptions about approval payloads instead of protocol-backed helpers.

If a value may change per user or team, make it config-driven. If a default is needed, centralize it and document why.

## 7. Model And Team Configuration

Model configuration is app-layer overlay plus Codex config writes.

Rules:

- Write `models.json` before writing `model_catalog_json`.
- Use `config/batchWrite` for model-related settings when possible.
- `model_catalog_json` is loaded by Codex core at startup; after changing it, restart app-server for a fully reliable model metadata refresh.
- Keep custom provider fields compatible with Codex config: `base_url`, `wire_api`, `experimental_bearer_token`, `requires_openai_auth`.
- Do not patch Codex core for team logic in phase one.

Team configuration belongs above Codex core:

- active team
- entitlements
- team model profiles
- shared config/policy overlay

The effective Codex profile is selected/written by HiCodex. Codex core should remain upgradeable.

## 8. Approval And Tool Requests

Server requests are app-server initiated JSON-RPC requests. Treat them as a state machine, not as plain logs.

Current request families:

- `item/commandExecution/requestApproval`
- `item/fileChange/requestApproval`
- `item/tool/requestUserInput`
- `mcpServer/elicitation/request`
- `item/permissions/requestApproval`
- `item/tool/call`

Rules:

- UI shows a typed summary, not raw JSON as the primary content.
- Buttons use Codex-like semantics: allow/cancel.
- MCP elicitations may carry Desktop-specific `_meta` such as `codex_approval_kind`, connector labels, tool parameter display text, and `persist` modes. Surface those as typed request details and return selected persist mode in the response `_meta` instead of dropping it.
- MCP URL action elicitations are a two-step UI: the primary action first opens the URL externally and changes to Continue, then the second submit sends the accept response. Do not treat URL actions as plain Allow/Cancel approvals.
- Response payloads must match protocol types.
- Unknown request types must fail visibly and safely, never silently auto-approve.

## 9. UI Design Rules

HiCodex is an operational desktop tool. It should feel quiet, dense, and repeatable.

- No landing pages.
- No decorative hero layouts.
- No nested cards.
- Use icons for common tool actions.
- Keep cards at 8px radius or less unless a local design rule changes.
- Text must not overlap or disappear at supported window sizes.
- Avoid raw JSON in main user-facing surfaces; expose technical detail behind expansion.
- Keep colors restrained but not one-note.

When matching Codex Desktop, prioritize behavior and information architecture before pixel perfection.

HiCodex-only settings surfaces that have no Desktop counterpart (Models, Images, Approvals, Experimental, notifications) are legitimate local additions. Document each in §13 rather than adding ad hoc panels — every HiCodex-only surface must be reachable from a single Settings entry and must not impersonate a Desktop section name.

## 10. Testing And Verification

Run the smallest useful checks for the change, then broaden when shared behavior is touched.

Common commands:

```sh
npm run typecheck
npm run build
cargo fmt --all -- --check
cargo test --workspace
```

Run UI manually when touching:

- composer behavior
- pending approvals
- right rail
- sidecar start/stop
- model settings

When `tauri:dev` fails on port `5178`, first check whether the existing server is already HiCodex. The dev script may reuse it.

## 11. Search And Editing

Before broad scans:

- Read `.gitignore`.
- Respect `.gitignore`, `.ignore`, `.rgignore`.
- Avoid heavy directories: `node_modules/`, `dist/`, `target/`, `src-tauri/target/`, generated protocol output unless explicitly needed.

Prefer:

- `rg` for search.
- Narrow file globs.
- Reading exact protocol files or extracted Codex chunks.
- `apply_patch` for manual edits.

Do not:

- Write files with ad hoc shell heredocs.
- Commit extracted app bundle chunks.
- Reformat unrelated files.
- Revert user changes.

## 12. Change Checklist

Before coding:

- Read this guide.
- Identify the source of truth: app-server protocol, Codex Desktop chunk, or existing HiCodex code.
- Decide whether the change belongs in host, protocol, projection, UI, or config overlay.

During coding:

- Keep durable state in one place.
- Split named workflows into files when they become independent.
- Avoid hardcoded user/project data.
- Prefer protocol-backed helpers over loose object construction.

Before finishing:

- Run relevant checks.
- Mention any checks that were not run.
- If model catalog changed, remind that app-server restart may be needed.

## 13. HiCodex-only UI Primitives

These are durable local additions with no Codex Desktop counterpart. They are listed here so future contributors do not delete them as "drift" or document them as "parity". Anything not in this section that has no Desktop counterpart should be questioned before shipping.

CSS and tokens:

- `hc-*` class namespace (≈340 classes). Required to keep clean-room CSS isolated from any Desktop-inspired chunk imports. Do not rename to Desktop names.
- `--hc-*` custom property family. Lockstep with Codex tokens where they exist (`--hc-codex-transition-duration` mirrors the framer-motion preset duration; `DISCLOSURE_EXIT_MS` in `animated-disclosure.tsx` must equal that duration in ms).
- `data-theme` + `data-theme-mode` on the shell root are the canonical theme selector pair. `data-hc-theme` is legacy; do not add new selectors against it.

Data attributes:

- `data-thread-find-target`, `data-thread-find-composer`, `data-thread-find-skip` — HiCodex-only plumbing for the local find-in-thread command panel. Desktop's equivalent lives in `review-file-tree-side-pane-*.js` with a different attribute scheme; do not chase Desktop names.
- `data-right-rail-mode` — HiCodex right-rail responsive mode (`overlay` / `shift` / `gutter`). Driven by `RIGHT_RAIL_*` breakpoints in `state/right-rail.ts`. Desktop does not encode the mode as a DOM attribute.
- `data-csp-*` (six attributes on MCP widget frames). **Security contract** — these define the per-frame CSP envelope HiCodex applies before mounting an MCP app widget. They must stay in sync with the iframe sandbox flags. Changing them is a security review surface, not a styling change.

Hooks and components:

- `useDismissibleLayer` — a 28-line minimal click-outside / Esc hook used while HiCodex has no Floating-UI installation. When a real popover primitive lands (see right-rail and chip popover work), migrate consumers and delete this hook.
- `AnimatedDisclosure` — clean-room replacement for Desktop's framer-motion disclosure. Keep its exit-animation duration in lockstep with `--hc-codex-transition-duration`.
- `OnboardingEmptyState` — pre-conversation hero. Constrained by the empty-state rule in the parity row covering `welcome-page-*.js`; must use Desktop ICU slogans, not ad hoc copy.

HiCodex-only settings surfaces (referenced from §9):

- Models — local model catalog editor plus provider config (`base_url`, `wire_api`, `experimental_bearer_token`, `requires_openai_auth`). Desktop has no equivalent.
- Images — local image-generation provider/key configuration.
- Approvals — local approval defaults beyond Desktop's permission modes.
- Experimental — toggles for in-flight features that are deliberately not in Desktop parity scope.
- Notifications — local OS notification policy and sound preferences (Codex Desktop equivalents live in tray/Activity Monitor).

Layer surfaces:

- The sidecar lifecycle pill is HiCodex-only and lives in the sidebar footer / transient toasts, never in chrome top-right.
- `hc-in-progress-diff` inline diff aside is a clean-room approximation of Desktop's `createPortal` live-diff preview; if a portal primitive ships, migrate to it.
- The `+ New chat` / `Choose folder` empty-state buttons must only appear when there is no mounted composer; never alongside one.

When adding a new HiCodex-only primitive, add it to this section in the same PR. If the addition replaces a Desktop primitive, prefer renaming HiCodex usage to match the Desktop name rather than maintaining a parallel HiCodex-only abstraction.
