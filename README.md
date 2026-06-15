# Forge

Forge is a Codex-core desktop shell. The app is intentionally small: the
Codex app-server is the execution kernel, Rust owns the desktop/sidecar host,
and React renders the conversation surface.

## Architecture

An npm + Cargo workspace:

| Path | Role |
|------|------|
| `apps/desktop` | Tauri 2 desktop app and Vite frontend entrypoint |
| `packages/ui` | Codex-like React UI — reducers, settings, and the JSON-RPC client |
| `packages/codex-protocol` | Generated Codex app-server v2 TypeScript protocol types |
| `crates/host` | Rust sidecar host that drives `codex app-server --listen stdio://` |

The desktop binary (`crates/host` + `apps/desktop/src-tauri`) launches the
Codex CLI (`codex`) as a sidecar and bridges its app-server events to the
React UI.

## Prerequisites

- **Node.js ≥ 20.19**
- **Rust** (stable) with the platform toolchain:
  - macOS — Xcode Command Line Tools
  - Windows — the **MSVC** toolchain + Visual Studio Build Tools ("Desktop
    development with C++"); WebView2 runtime (bundled with Windows 11)
- A **Codex CLI binary** (`codex`) for the sidecar — built from the upstream
  `codex-rs` workspace, or supplied directly (see [Codex sidecar](#codex-sidecar)).

## Development

```sh
npm install
npm run sync:protocol   # regenerate protocol types from codex-rs
npm run dev             # Vite dev server (browser preview of the UI)
```

Run the real desktop shell (Tauri window) with:

```sh
npm run tauri:dev
```

## Codex sidecar

Forge runs the Codex CLI as a sidecar. Stage the bundled binary with:

```sh
npm run sidecar:prepare
```

By default this builds `codex` from `../codex/codex-rs`. Override the source:

- `FORGE_CODEX_SOURCE_DIR=/path/to/codex/codex-rs` — build from a custom checkout
- `FORGE_CODEX_BIN=/path/to/codex` — skip building and copy an existing binary
  (e.g. `codex.exe` on Windows)

The legacy `HICODEX_*` environment variable names are still accepted as
compatibility aliases everywhere the build/release scripts and the runtime
host read `FORGE_*`; `FORGE_*` takes precedence when both are set.

At runtime the host resolves the binary in this order (the bundled name is
`codex` on Unix, `codex.exe` on Windows):

1. `codex_bin` from the start config
2. `FORGE_CODEX_BIN` (the legacy `HICODEX_CODEX_BIN` name is still honored as
   a fallback)
3. bundled `binaries/codex[.exe]` next to the app binary (or under macOS
   `Contents/Resources/binaries`)
4. `binaries/codex[.exe]` / `apps/desktop/src-tauri/binaries/codex[.exe]` during
   local development
5. `/Applications/Codex.app/Contents/Resources/codex` (macOS)
6. `codex` on `PATH`

Run against a local Codex debug binary with
`FORGE_CODEX_BIN=/path/to/codex npm run tauri:dev`.

### Codex home

Forge keeps an isolated Codex home. For compatibility with existing local
installs, the current default storage paths still use the legacy app namespace:

- macOS — `~/Library/Application Support/HiCodex/codex-home`
- Windows / Linux — `<home>/.hicodex/codex-home` (`home` is `%USERPROFILE%` on
  Windows, `$HOME` elsewhere)

Override with `FORGE_CODEX_HOME` (the legacy `HICODEX_CODEX_HOME` name is
still accepted).

## Building / packaging

Tauri apps must be packaged **on the target OS** — cross-compiling the GUI
bundle (WebView2 linkage, NSIS/MSI installers) is not supported. The sidecar
binary is not committed (`.gitignore` excludes `binaries/*`), so run
`npm run sidecar:prepare` on each build machine first.

**macOS** → `.dmg` + `.app`:

```sh
npm run sidecar:prepare
npm run tauri:build
```

For a signed, auto-updating release see `scripts/release.sh` and
`.github/workflows/macos-release.yml`.

**Windows** → NSIS `.exe` + `.msi`:

```bat
set FORGE_CODEX_SOURCE_DIR=C:\path\to\codex\codex-rs
npm run sidecar:prepare
npm install
npm run tauri:build
```

Bundles land under the workspace-root `target/release/bundle/` (or
`target/<triple>/release/bundle/` when building with `--target`) —
`dmg/`, `macos/`, `nsis/`, `msi/`.

## Scripts

| Script | Does |
|--------|------|
| `npm run dev` | Vite dev server for the UI |
| `npm run tauri:dev` | Run the Tauri desktop app (dev) |
| `npm run tauri:build` | Build the desktop bundle for the current OS |
| `npm run sidecar:prepare` | Build/copy the Codex `codex` sidecar into `binaries/` |
| `npm run sync:protocol` | Regenerate `packages/codex-protocol` types from codex-rs |
| `npm run typecheck` | Typecheck all workspaces |
| `npm run test` | Root script tests + workspace tests + `cargo test --workspace` |
| `npm run test:scripts` | Node test runner over `scripts/*.test.mjs` |
| `npm run test:e2e` | Browser-level smoke (system Chrome via Playwright) against the Vite preview |
| `npm run lint` | clippy `-D warnings` + JS/TS lint + TS runtime-cycle check + release.sh syntax |
| `npm run format` / `npm run format:check` | `cargo fmt` apply / verify |
| `npm run sidecar:smoke` | Boot the bundled Codex sidecar and verify the `initialize` handshake |

## Development guide

Before changing code, read [docs/DEVELOPMENT.md](docs/DEVELOPMENT.md) — the
single source of truth for architecture boundaries, UI parity rules, config
policy, file splitting, and verification.
