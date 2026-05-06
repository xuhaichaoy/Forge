# HiCodex Development Guide

This is the single source of truth for developing HiCodex. Read it before changing code. Keep it practical, current, and non-duplicative.

## 1. Product Boundary

HiCodex is a Codex Desktop shell, not a new agent runtime.

- Execution kernel: Codex `app-server`.
- Desktop host: Tauri + Rust.
- UI: React + TypeScript.
- Protocol truth: `/Users/haichao/Desktop/data/codex/codex-rs/app-server-protocol/schema/typescript`.
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
- Right rail order is `Progress -> Branch details -> Artifacts -> Sources`.
- Empty `Progress`, `Artifacts`, and `Sources` sections should be hidden.
- `Progress` comes from latest `todo-list.plan[]`, not arbitrary activity logs.
- `Artifacts` and `Sources` show 6 items by default, then show more/less.

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
