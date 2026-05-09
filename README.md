# HiCodex

HiCodex is a Codex-core desktop shell. The app is intentionally small:
Codex app-server is the execution kernel, Rust owns the desktop/sidecar host,
and React renders the conversation surface.

## Shape

- `apps/desktop` - Tauri desktop app and Vite entrypoint.
- `packages/ui` - Codex-like React UI, reducers, settings, and JSON-RPC client.
- `packages/codex-protocol` - generated Codex app-server v2 TypeScript protocol types.
- `crates/host` - Rust sidecar host for `codex app-server --listen stdio://`.

## First Run

```sh
npm install
npm run sync:protocol
npm run dev
```

Use the real desktop shell with:

```sh
npm run tauri:dev
```

Prepare the packaged sidecar binary with:

```sh
npm run sidecar:prepare
```

The sidecar host looks for Codex in this order:

1. `HICODEX_CODEX_BIN`
2. bundled `binaries/codex` next to the app binary or under macOS `Contents/Resources`
3. `apps/desktop/src-tauri/binaries/codex` during local development
4. `/Applications/Codex.app/Contents/Resources/codex`
5. `codex` on `PATH`

Use `HICODEX_CODEX_BIN=/path/to/codex npm run tauri:dev` to run against a
local Codex debug binary.

Set `HICODEX_CODEX_HOME` if you want to override the isolated Codex home.
By default HiCodex uses `~/Library/Application Support/HiCodex/codex-home` on
macOS.

## Development Guide

Before changing code, read [docs/DEVELOPMENT.md](docs/DEVELOPMENT.md). It is
the single source of truth for architecture boundaries, UI parity rules, config
policy, file splitting, and verification.
