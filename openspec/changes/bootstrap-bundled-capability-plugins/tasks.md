## 1. Pre-implementation Checks

- [x] 1.1 Read `docs/DEVELOPMENT.md`.
- [x] 1.2 Run GitNexus impact analysis for host bootstrap symbols.
- [x] 1.3 Compare global Codex config and isolated Forge config for marketplace/plugin entries.

## 2. Host Bootstrap

- [x] 2.1 Discover the local `openai-bundled` marketplace path from the Codex CLI home.
- [x] 2.2 Add missing `[marketplaces.openai-bundled]` to first-run and existing isolated configs only when the path exists.
- [x] 2.3 Add missing `[plugins."browser@openai-bundled"] enabled = true` without overwriting user settings.
- [x] 2.4 Keep Computer Use unseeded/explicitly install-only.

## 3. Verification

- [x] 3.1 Add Rust host tests for first-run config, existing config refresh, and missing marketplace behavior.
- [x] 3.2 Run host tests.
- [x] 3.3 Run relevant existing UI tests and typecheck if frontend files change.
