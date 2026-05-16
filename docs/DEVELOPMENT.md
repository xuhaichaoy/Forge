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

Do not add ad hoc handoff docs, scratch notes, copied agent outputs, or extracted `app.asar` content. Temporary investigation output belongs under `/private/tmp`, not in the repo.

## 4. Source Of Truth Rules

Use evidence before implementation.

For protocol and runtime behavior:

- Inspect local Codex protocol files before hand-writing request/notification shapes.
- Do not assume field names from screenshots.
- If generated protocol is stale, sync it instead of adding broad `any` objects.

For UI parity:

- Inspect installed Codex Desktop chunks in `app.asar`.
- Implement clean-room equivalents; never copy minified code.
- Keep a short evidence note in this guide only when it changes a durable rule.

Codex Desktop evidence workflow:

- Run `node scripts/extract-codex-asar.mjs` to extract `/Applications/Codex.app/Contents/Resources/app.asar` to `/private/tmp/codex-asar`. Pass `--force` to refresh after a Codex update. Override paths with `HICODEX_CODEX_ASAR` / `HICODEX_CODEX_ASAR_OUT`.
- Use that directory (not the repo) as the source of truth when reasoning about render groups, sidebar order, composer behavior, etc. Cite chunk filenames in PR descriptions.
- Never paste minified code into the repo or docs; only describe derived rules.

Codex Desktop UI parity map (current state):

| Desktop area | HiCodex implementation | Key rule |
| --- | --- | --- |
| `app-server-manager-signals-*.js` (collab event family) | `crates/host/src/lib.rs::RolloutToolReplay::handle_collab_*` + `handle_*_agent_function_call*` | Rollout JSONL `collab_agent_spawn_end` / `collab_agent_interaction_end` / `collab_waiting_end` / `collab_close_end` / `collab_resume_end`, plus persisted `response_item.function_call` pairs such as `spawn_agent` / `wait_agent`, are replayed into `collabAgentToolCall` items so spawn rows survive a refresh or session switch. |
| `local-conversation-thread-*.js` (`OT/kT/Ph`) + `AnimatePresence-*.js` | `packages/ui/src/components/turn-collapse.tsx` + `animated-disclosure.tsx` + `conversation-view.tsx` | Per-turn collapse state is page-local and keyed by `(threadId, turnId)`; chevron toggle attached to the worked-for label. Default-collapsed once the turn has a final assistant message and is no longer streaming, except pending/app-tool content uses Desktop's prevent-auto-collapse behavior until the user explicitly toggles it. Do not persist stale collapse choices across reloads. Turn/tool disclosure uses Desktop-style height/opacity motion instead of instant removal. The Ph toggle is always followed by a full-width `border-t` divider rule — Desktop renders Ph and the rule together as a Fragment in both collapsed and expanded states. Chevron uses the small icon size with explicit `rotate-0` (collapsed) / `rotate-90` (expanded). Web-search-group label pluralizes by `counts.webSearches` per Desktop `:3816` ICU template `{count, plural, one {Searched web # time} other {Searched web # times}}` — never always-singular. Single-item collapsed-tool-activity exec rows expose `summary.labelParts = { action, detail }` mirroring Desktop's `<action>Ran</action> <detail>{command}</detail>` template (`:3766` + `O_`/`D_` renderers at `:4207-4211`), and the renderer paints the action span muted (`#98998f`) while the detail span inherits foreground. Conversation chrome title must read the latest user message from `state.threadsRuntime[id].items` (not from already-projected RenderUnits, which expose `item`/`items` inconsistently). In-progress worked-for renders as the non-interactive `WorkedForDivider` (Codex `Ah` at `:3315-3326` invoked from the per-item render loop `:7434`): live "Working for {time}" / "Working" / "Worked for {time}" label per `kh` `:3305-3313` over a 1px rule. After the final assistant arrives, the worked-for label feeds the `Ph` collapse toggle (`:8408`); the divider does not double-render. Collapsed-tool-activity rows let `mask-image` handle truncation alone (Codex `:3781`); HiCodex scopes `text-overflow: clip` under `[data-group-type="collapsed-tool-activity"]` so the legacy `…` overlay disappears. `--conversation-tool-assistant-gap` is **16px**, matching Codex Desktop's `:root` declaration in `app-main-*.css` (`:root{...;--conversation-block-gap:12px;--conversation-tool-assistant-gap:16px}`). Earlier rounds misread the `var(--conversation-tool-assistant-gap, 8px)` fallback at `local-conversation-thread.pretty.js:4270/7829/8238` as the effective value, but those are fallbacks — the `:root` declaration provides 16px so the real gap between adjacent agent-body rows is 16px, not 8px. `--hc-codex-transition` = `500ms cubic-bezier(0.19, 1, 0.22, 1)` is the framer-motion `yo` object exported by `animations-y0LC3gHS.js` and imported at `local-conversation-thread.pretty.js:89` (`t as yo`); apply it to disclosure motions (`.hc-disclosure-motion`, `.hc-worked-for-fade`) and keep `DISCLOSURE_EXIT_MS` in `animated-disclosure.tsx` synced to 500. `TurnCollapseToggle` carries `focus-visible:ring-2` matching `Ph` `:3375` (`focus-visible:ring-2 focus-visible:ring-token-focus-border`). The collapse rule is followed by a Codex `F_` spacer (`local-conversation-thread.pretty.js:4269-4271`) of height `var(--conversation-tool-assistant-gap, 8px)` (`:8238`) — `$T` inserts it at `:8410` (`c2 ? <F_ size={NT} key="agent-body-toggle-gap"/> : null`) between the rule and the agent body whenever `showToggle === true`. |
| `local-conversation-thread-*.js` + `user-message-attachments-*.js` (`VT/dw/zb/Te/Hb`) | `packages/ui/src/components/message-unit.tsx` + `user-message-content-render.tsx` | User attachments render in a separate right-aligned strip before the `max-width: 77%` user bubble. User status chips and the copy/edit/timestamp action row share the same below-message strip, but status chips stay as siblings of the action row so they do not reorder Copy/Edit. Status text stays visible while buttons and timestamps are hover/focus affordances. Assistant actions follow `Hb` slot order: copy, clickable artifacts action, fork, auto-review stats, timestamp; timestamp does not create an actions row by itself. Message actions are hover/focus affordances, not always-visible cards, and copy actions show the Desktop-style `Copied to clipboard` toast. |
| `local-conversation-thread-*.js` (`Xu/uE/YT`) + `virtualized-turns-*.js` | `packages/ui/src/components/conversation-view.tsx` | Turn rows use Desktop's virtual list constants: 280px estimated row height, 12px gap, 2-row overscan, `data-turn-key`, `data-content-search-turn-key`, measured height cache keyed by turn key, bottom-distance range calculation, near-bottom scroll anchoring, and `content-visibility: auto` / `contain-intrinsic-size: auto 240px`. Render units expose `data-content-search-unit-key` and `data-item-ids` for search and source targeting. |
| `thread-page-header-*.js` + `thread-layout-*.js` + `thread-scroll-layout-*.js` + `scroll-to-bottom-buton-*.js` | `packages/ui/src/components/conversation-chrome.tsx` + `thread-scroll-layout.tsx` + `HiCodexApp.tsx` | Conversation chrome uses Desktop's compact one-row thread toolbar shape rather than a two-line cwd banner. Conversation content and composer share one thread scroll system. Content and footer use Desktop's current thread tokens (`--thread-content-max-width: none`, toolbar padding 16px, chat font 13px); scroll container uses Desktop's `flex-col-reverse` distance-from-bottom semantics where bottom is `scrollTop = 0`; footer uses `data-thread-scroll-footer`, sticky bottom placement, focus-within scroll-padding reset, measured footer height plus 16px scroll padding, page-scoped distance restoration, 24px bottom-distance threshold, scroll controller callbacks, and a 32px centered scroll-to-bottom button. |
| `app-shell-*.js` (`_n`) + `app-main-*.js` (`gy/_y/vy/Cg/Tg/e_/O_/k_/gS/nS/Gv/Hv`, `Db/Eb`) + `local-conversation-thread-*.js` (`tu/Eu/Yl/xu/cu`) + `composer-*.js` (`Mp/Pp/Fp/Ip`) + `sidebar-signals-*.js` + `sidebar-project-groups-*.js` + `sidebar-thread-keys-*.js` + `format-relative-date-time-*.js` | `packages/ui/src/components/sidebar.tsx` + `packages/ui/src/state/sidebar-projection.ts` | Left thread rail follows Desktop's 300px default / 240px minimum panel sizing, top nav order (`New chat` -> `Search` -> `Plugins/Skills` and available feature-gated entries such as `Automations`), Search opening a chat command menu instead of an inline sidebar input, bottom Settings placement, `updated_at` sort, sub-agent filtering, local project grouping, compact relative update time, and row status projection for active/loading, system-error, and `hasUnreadTurn` payloads. The Projects section header actions are hover/focus affordances: collapse/reopen groups, filter/sort menu, and add-project menu backed only by implemented local folder selection. Thread row geometry follows Desktop's `tu` token shape (`h-token-nav-row`, `px-row-x`, `py-row-y`, `text-sm`, title `text-base leading-5`) rather than custom `hc-*` row CSS; rows hide meta on hover/focus while exposing Desktop-style pin/archive hover affordances and a context menu ordered as pin, rename, archive, unread, filesystem/copy, then local fork. Actions that require missing HiCodex host/protocol flows such as new worktree and new window stay omitted. Do not add row badges, counters, or disabled nav items unless the shipped Desktop chunk has the same default behavior and HiCodex has the corresponding protocol data. |
| `user-message-attachments-*.js` (`Te/Ce/ve/Se`) + `app-main-*.js` (`edit-last-user-turn-for-host/QE`) | `packages/ui/src/components/message-unit.tsx` + `thread-workflow.ts::editLastUserTurn` | Edit is allowed only for the latest non-running user turn. The inline editor replaces the user bubble and reuses the prompt editor surface rather than a plain textarea; submit follows Desktop order: `thread/read` for the original input, `thread/rollback` one turn, then `turn/start` with the first text input replaced and structured inputs preserved. Long user messages collapse at 20 lines; timestamp formatting uses today / recent weekday / older date buckets. |
| `app-server-manager-signals-*.js` (`Wf/qf/Kf`) + `local-conversation-thread-*.js` (`onForkTurnMessage`) | `packages/ui/src/state/thread-workflow.ts::forkThreadFromTurn` + `message-unit.tsx` | Assistant fork action uses the Desktop sequence: `thread/fork` from latest, then `thread/rollback` the forked thread by the number of later turns. |
| `composer-*.js` (`PU/MU/KH/YT/kU/DU/KT/HH/qw/qV/ez/nE/eE`, `Db/Mb`) + `prompt-editor-*.js` (`Ad/Pd/Fd`) + `add-project-menu-items-*.js` | `packages/ui/src/components/composer.tsx` + `prompt-editor.tsx` + `pending-request-stack.tsx` + `HiCodexApp.tsx` + `composer-external-footer.tsx` | Main thread composer defaults to Desktop's multiline local conversation surface; `auto-single-line` remains an explicit variant and uses Desktop's measured-width rule. Footer controls follow Desktop order (left context controls -> editor -> right submit), submit uses Desktop's 28px round foreground button with arrow-up for send/queue and square stop icon for streaming stop, queued follow-ups live in the above-composer queue portal, pending requests replace the normal composer input surface with Desktop-style request input panels (question title, compact detail rows, numbered options, Cancel/Esc before primary Enter), placeholder wording follows Desktop's `nE` new-task/local-follow-up branches, file drag-over shows Desktop's `qw` surface overlay with the Shift keycap hint and `Drop to attach` action, prompt input uses the Desktop-style `.ProseMirror` contenteditable shell with `data-virtualkeyboard`, `data-codex-composer`, Shift/Alt+Enter newline, Mod+Enter submit, plain-text paste, pasted image/file events from the editor, placeholder, focus, and single-line overflow rules, and the external footer exposes the Desktop project selector (`Search projects`, local project rows, `Use an existing folder`) before local-work plus branch/model context. |
| `composer-*.js` (`kH/MH`, approval menus) + `app-server-manager-signals-*.js` | `packages/ui/src/state/approval-requests.ts` + `pending-request-stack.tsx` | Command approval choices mirror Desktop decision ids: run once, conversation/session approval, `acceptWithExecpolicyAmendment`, and `applyNetworkPolicyAmendment` when app-server provides proposed policy amendments. Network approvals show one-time, conversation host, and future host allowlist options and return the exact nested app-server decision objects. |
| `split-items-into-render-groups-*.js` (`qe`) + `local-conversation-thread-*.js` (`VT/YT/$T`) | `packages/ui/src/state/project-conversation.ts::splitTurnItems` | Turns are first split into Desktop buckets (`preUserItems`, `userItems`, `agentItems`, `assistantItem`, `toolOutputItems`, `postAssistantItems`, pending requests, plans, diff, remote/personality/fork events), then projected in `VT` order with Desktop's 12px turn gap and 16px tool/assistant block gap. Segments with no user message keep the legacy linear path for old imported/orphan assistant data. |
| `composer-*.js` (`NH/FH/IH/LH/KT`) | `queued-follow-up-stack.tsx` + `queued-followups.ts` + `turn-submission.ts` | Queued follow-up rows mirror Desktop semantics: hover-only actions, drag reorder, paused retry affordance, row actions menu with queueing on/off, queue vs steer as separate follow-up submit actions, and Desktop-style `Queue` / `Steer` tooltip labels. |
| `split-items-into-render-groups-*.js` (`Ge/Ke/we/ke`) + `local-conversation-thread-*.js` (`y_/S_/w_/T_/_C`, `Iw/ng/Uw`) | `tool-activity-grouping.ts` + `event-unit.tsx` + `tool-activity-detail.tsx` | Standalone reasoning render units are skipped entirely (`event-unit.tsx::ToolActivityView` returns null when `groupType === "reasoning"` and the unit lacks a `_syntheticKind === "thinking-placeholder"` item) to match Codex `Jw` at `local-conversation-thread.pretty.js:7881` which maps `entry.item.type === "reasoning"` to `F2 = null`. Reasoning content is either folded into the surrounding exploration group via `Ge` in split-items-into-render-groups, or silently dropped; the live "Thinking…" UX comes from the separate `desktopThinkingPlaceholderItem` (project-conversation.ts:540, mirror of Codex `ZT` at `:8335` driven by `oT` `:8000-8002`). Adjacent mergeable agent body items (exec / exploration / web-search-group / collapsed-tool-activity) are aggregated into a single `collapsed-tool-activity` bucket per Codex `W` segment grouping in `split-items-into-render-groups-C1Yh6v3t.js` (`function K` + `function W`), with `summarizeToolActivity`'s new `groupTypeOverride` honoring the bucket type so the summary label uses the cross-type count formatter ("Ran 1 command, searched web 4 times") rather than a per-type single label. Real reasoning items are appended to the active mergeable bucket so the summary count keeps building (Codex `Ge` :7782) but `toolActivityDetailItems` filters reasoning out of the rendered detail rows (`Jw` :7881 `F2 = null`); without this filter the `ItemBlock` fallback serialized reasoning items as raw JSON. Read/search/list commands use the Desktop `exploration` group type, read-file counts dedupe by cwd-normalized path, completed exploration starts collapsed, active exploration opens as a preview, pending MCP calls group by source server, and web search details strip `site:` filters into a domain suffix plus infer the Desktop Google favicon URL from open/find URLs, query URLs, or `site:` filters. |
| `markdown-*.js` / React Markdown micromark autolinks | `packages/ui/src/components/message-unit.tsx::parseMarkdownInline` | Assistant markdown supports CommonMark angle autolinks for URL schemes and email addresses while leaving non-autolink HTML tags as plain text in the lightweight renderer. |
| `markdown-*.js` sanitized basic HTML schema (`P_`) | `packages/ui/src/components/message-unit.tsx::parseBasicInlineHtml` | Basic inline HTML allowed by Desktop's sanitized markdown path (`br`, emphasis tags, `sub`, `sup`, `u`) renders as inline formatting while unsupported tags remain plain text. |
| `markdown-*.js` ordered list renderer (`Wh/Uh`) | `packages/ui/src/components/message-unit.tsx::parseMarkdownBlocks` | Ordered lists preserve non-default starting numbers via `<ol start>` instead of always restarting at 1. |
| `markdown-*.js` link renderer (`Sd/xd/yd`) | `packages/ui/src/components/message-unit.tsx::MarkdownLink` | External markdown links render as compact icon+label affordances with an origin favicon fallback instead of plain underlined text only. |
| `markdown-*.js` math extension + `katex-*.js` | `packages/ui/src/components/message-unit.tsx::parseMarkdownMathBlock` + inline math parsing | Assistant markdown treats `$$...$$`, `\[...\]`, `$...$`, and `\(...\)` as math surfaces instead of plain text and renders them through KaTeX with non-throwing errors. |
| `markdown-*.js` sanitized details renderer (`I_`) | `packages/ui/src/components/message-unit.tsx::parseMarkdownDetailsBlock` | Sanitized `<details><summary>` markdown renders as a compact expandable block with a chevron instead of leaking raw HTML into assistant output. |
| `markdown-*.js` media renderer (`G_/J_/Y_`) + `image-preview-dialog-*` | `packages/ui/src/components/message-unit.tsx::MarkdownImageView` | Consecutive markdown media lines render as a compact grid, images lazy-load behind a zoomable preview trigger, the preview dialog closes on backdrop/Esc, and video URLs/data URLs use a video element with controls instead of a broken image surface. |
| `code-snippet-*.js` + `highlight-code-*.js` | `packages/ui/src/components/message-unit.tsx::CodeSnippet` | Code fences render in a token-like bordered snippet with header, wrap toggle, copy action, selected-text copy preference, Desktop-compatible `hljs-*` token scopes for common languages, and SVG image preview for `svg` fences or `xml/html` fences whose content starts with `<svg`. |
| `markdown-*.js` Mermaid fence path (`yh/lh/vh`) | `packages/ui/src/components/message-unit.tsx::MermaidDiagram` + `sanitizeMermaidCode` | `mermaid` fences render through the public Mermaid package with Desktop-style strict security, deterministic ids, `htmlLabels: false`, stripped `click` bindings, and blocked `securityLevel` overrides. HiCodex keeps a clean-room flowchart preview/code fallback for failed renders; do not copy bundled Mermaid implementation from `app.asar`. |
| `local-environments-*.js` thread sort + `is-subagent-conversation-*.js` | `packages/ui/src/state/sidebar-projection.ts` | `updated_at desc` (with `created_at` fallback) and sub-agent threads (`threadSource === "subagent"`, or with `agentNickname`/`agentRole`) hidden from the main sidebar list. |
| `local-conversation-page-*.js` (`onOpenBackgroundAgent`) | `packages/ui/src/components/background-agent-panel.tsx` + `HiCodexApp.tsx` | Multi-agent row clicks hydrate the child thread into a background-agent panel; they must not switch the main active thread route. |
| `local-conversation-page-*.js` (`openSideChat`) + `command-messages-*.js` | `packages/ui/src/state/thread-workflow.ts::startSideConversation` + `background-agent-panel.tsx` + `HiCodexApp.tsx` | Side chat opens the current local thread as an ephemeral right-panel conversation: `thread/fork` with `path: null`, `persistExtendedHistory: false`, `threadSource: "user"`, `ephemeral: true`, appends Desktop side-conversation developer instructions, and injects a synthetic user boundary via `thread/inject_items`. The side panel must not select or replace the main thread. |
| `use-skills-*.js` + `skill-utils-*.js` + `skills-page-*.js` | `packages/ui/src/state/slash-request-workflow.ts` + `command-panel.ts` + `HiCodexApp.tsx` | `/skills reload` maps to `skills/list.forceReload`; skill rows use protocol metadata such as `interface.displayName`, scope, default prompt, dependencies, load errors, insert Desktop-style default prompt text plus a `$skill` prompt link without duplicating an existing link, do not attach the selected skill as a separate structured composer input, expose Desktop-style enable/disable secondary actions backed by `skills/config/write` followed by a forced `skills/list` refresh, and treat `skills/changed` as an invalidation signal that refreshes an open Skills panel. |
| `permissions-mode-helpers-*.js` + `permissions-mode-defaults-*.js` | `packages/ui/src/state/permissions-mode.ts` + `HiCodexApp.tsx` | `/permissions` projects Desktop's read-only / auto / granular / full-access mode order and writes the matching `sandbox_mode`, `approval_policy`, `approvals_reviewer`, and workspace-write sandbox defaults through `config/batchWrite`. |
| `composer-*.js` (`IL`) + `use-personality-*.js` | `packages/ui/src/state/personality.ts` + `slash-request-workflow.ts` + `HiCodexApp.tsx` | `/personality` exposes Desktop's Friendly and Pragmatic rows, marks the current choice, appends the current-model not-applicable suffix for `gpt-5.2` / `gpt-5.1*`, writes `personality` through config, clears legacy `model_personality`, refreshes user config, and injects Desktop's synthetic personality-changed event into the transcript. |
| `prompt-editor-*.js` + `use-file-mention-autocomplete-*.js` + `use-workspace-file-search-*.js` + `use-skills-*.js` + `apps-queries-*.js` + `use-plugins-*.js` | `packages/ui/src/components/composer.tsx` + `prompt-editor.tsx` + `composer-workflow.ts` + `mention-options.ts` + `HiCodexApp.tsx` | `@` on the active input line opens an inline mention picker with Desktop-style debounce, active row movement, and selection removal of the typed trigger. File candidates come from app-server `fuzzyFileSearch` over the current cwd; skill candidates come from `skills/list` like Desktop's skill mention list, preserve scope/default-prompt metadata, and insert the Desktop `$skill` prompt reference as text instead of emitting a structured `UserInput.skill`. App candidates come from `app/list` and insert Desktop-style `$app` prompt links such as `[$figma](app://figma)` without inventing a protocol-level `UserInput.app`. Plugin candidates come from `plugin/list`, use Desktop prompt paths such as `plugin://browser-use`, and insert `@plugin` prompt links rather than protocol-level inputs. Prompt mention chips survive ProseMirror serialization/deserialization. |
| Right rail `Jd/Mf/Kd/Jf/Yf/Hd/Gd` + `Rd=6` + `composer-*.js` (`zw/Uw/Ww`) | `packages/ui/src/state/right-rail.ts` + `rail-projection.ts` + `background-agents.ts` + `background-terminals.ts` + `components/right-rail.tsx` + `HiCodexApp.tsx` | Section order Progress → Branch details → Artifacts → Side chats → Background tasks → Sources, empty sections collapsed, Progress shows all plan rows, Side chats show ephemeral side-panel threads for the active parent, Background tasks combines real `collabAgentToolCall` receiver threads and running unified exec commands, opens background-agent panels for receiver threads, surfaces child-thread latest-turn diff stats as `+N/-N` when app-server payloads expose them, and keeps the stop action for background terminals, Artifacts/Sources use 6-item preview with Show {N} more / Show less, file vs website dedup. The rail is a 300px floating summary panel with a 16px right gap; below the 1370px app-width breakpoint it is hidden and does not reserve thread space; wider layouts follow Desktop side-space thresholds overlay `<180px`, shift `<360px`, gutter otherwise. Section headers mirror Codex `Jd` (`local-conversation-thread.pretty.js:1654-1666`): `sticky top-0 z-10`, 28px min-height (`h-7`), 8px header gap (`gap-2`), opaque rail-matching background so scrolled content does not bleed through; toggle button carries `focus-visible:outline-2 outline-offset-2` per `:1660`. HiCodex preserves its smaller 13px/650 title typography rather than copying Codex's `text-base` (16px) so the rail keeps its lighter aesthetic. Section header title is **text-only** — Codex `Kd` callers at `:1806, :2103, :2107, :2109, :2111, :2113, :2115` pass a bare `<X i18n .../>` to the `title` prop; the per-section lucide leading icon is not in Codex source and was removed. Section separator is a 0.5px `::after` pseudo-element with 16px horizontal inset, hidden on the last section, per Codex `:1649`. Artifact file rows pick a lucide icon by extension (`FileSpreadsheet` / `FileArchive` / `FileCode` / `FileText`) to approximate Codex's `ys(path)` per-file-type icon at `:1584-1585`; Codex's colored native-electron icons (`use-native-apps.electron-*.js`) cannot be replicated with lucide so HiCodex stays monochrome on this surface. The artifact preview panel is keyed by `${entry.id}:${artifactPreviewNonce}` and the nonce is bumped on every `setArtifactPreview(entry)` (`HiCodexApp.tsx::setArtifactPreview`) so re-opening the same artifact after the model rewrote the file on disk remounts the panel and re-runs the read-file `useEffect`s; without the nonce the path-only effect deps kept the previous file content cached. Container visual chrome is sourced from `:2099/2117`: `shadow-md` (light), `backdrop-blur-sm` (4px), 50% background opacity in non-overlay mode — HiCodex previously used a much heavier `0 16px 34px` shadow, 12px blur, 76% opacity. Section content uses `gap: 1px` between rail rows per Codex `:1645` (`flex flex-col gap-px px-4`). Padding model matches Codex: container is `padding: 12px 0` (py-3 only) per `:2099`, section header is `padding: 0 8px 2px 16px` (ps-4 pe-2 pb-0.5) per `:1666`, section content is `padding: 0 16px` (px-4) per `:1645`, so the `::after` separator at `inset-inline: 16px` sits flush with the header's left edge. Artifact / file-reference preview panels (rail-direct siblings) carry their own `margin: 0 12px 14px` to keep their previous edge inset after the container lost horizontal padding. |
| Composer `steeringUserMessage Jp` dedup | `packages/ui/src/state/queued-followups.ts::isQueuedFollowUpDuplicate` | Canonical `(text, attachments)` key used to skip duplicate follow-ups while a turn is still streaming. |
| `app-server-manager-signals-*.js` notification table | `packages/ui/src/state/codex-reducer.ts::applyNotification` | Item lifecycle case extended with `item/autoApprovalReview/*`, `item/commandExecution|fileChange|permissions/requestApproval`, `item/tool/call`, `item/tool/requestUserInput`, `thread/goal/*`; deprecated `thread/compacted` is folded into a completed `contextCompaction` item so old compaction notifications still leave a transcript event. |

Out of scope for the current parity wave (tracked separately): native mention metadata sync for installed app/plugin icons and localized labels.

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
- Right rail order is `Progress -> Branch details -> Artifacts -> Side chats -> Background tasks -> Sources`.
- Empty `Progress`, `Artifacts`, and `Sources` sections should be hidden.
- `Progress` comes from latest `todo-list.plan[]`, not arbitrary activity logs.
- `Progress` shows all plan items; `Side chats` shows active parent side-panel threads; `Background tasks` combines real receiver threads and running unified exec commands; `Artifacts` and `Sources` show 6 items by default, then show more/less.

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
