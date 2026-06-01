# Codex Bundle Host (dev affordance)

Host the **real Codex Desktop bundle** (its extracted Electron renderer assets) inside a SEPARATE Tauri window, wired to the same app-server transport as HiCodex's clean-room UI. Useful for side-by-side comparison and behavior reference while building the clean-room app.

**The clean-room `main` window is the untouched default.** Nothing in this feature runs unless the `open_codex_bundle_window` command is explicitly invoked. It opens a second window labeled `codex-bundle`; `main` is never modified.

## What it is

- A custom URI scheme `codexbundle://` (registered on the Tauri `Builder`) serves the extracted Codex Desktop web assets from disk.
- A dedicated webview window (`codex-bundle`, "Codex (bundle)", 1280x820) loads `codexbundle://localhost/index.html`.
- A bridge script (`apps/desktop/src-tauri/codex-bundle-bridge.js`, injected via `.initialization_script(...)`) adapts the bundle onto HiCodex's **existing** transport — no new app-server plumbing is added:
  - Outbound app-server messages -> the existing `host_send_raw` command (and `host_start_app_server` to boot the server).
  - Inbound app-server events <- the existing `hicodex://app-server-event` Tauri event.

```
Codex bundle window (codex-bundle)
        |  window.__TAURI__.core.invoke('host_send_raw', { message })
        |  window.__TAURI__.core.invoke('host_start_app_server', { config })
        v
   crates/host  AppServerHost  <—> codex app-server
        |
        |  emits "hicodex://app-server-event"
        v
   bridge listener -> bundle's expected inbound channel
```

## Extracting the bundle

The custom scheme serves files from the **`webview/` subdir** of an extraction root:

- Root: `HICODEX_CODEX_ASAR_OUT` if set, else `/private/tmp/codex-asar`.
- Web root: `<root>/webview/` (must contain `index.html` plus the hashed js/css/wasm/font assets).

Extract Codex Desktop's `app.asar` to that location (e.g. with `npx @electron/asar extract <app.asar> /private/tmp/codex-asar`) so that `/private/tmp/codex-asar/webview/index.html` exists. If it's missing, `open_codex_bundle_window` returns a descriptive error instead of opening a blank window.

## How to open it

From the running app's devtools console (works because `app.withGlobalTauri = true`):

```js
window.__TAURI__.core.invoke('open_codex_bundle_window')
```

Calling it again focuses the existing window instead of erroring. You can also wire it to a native menu item or a dev-only button; it's just a `#[tauri::command]`.

## Content-Type / MIME mapping

The scheme handler maps file extension -> Content-Type: `.js`/`.mjs` -> `text/javascript`, `.css` -> `text/css`, `.html` -> `text/html`, `.json`/`.map` -> `application/json`, `.wasm` -> `application/wasm`, `.woff2` -> `font/woff2`, `.svg` -> `image/svg+xml`, common image types, else `application/octet-stream`. `/` and unknown extension-less paths fall back to `index.html` (SPA routing). Missing files with an extension return `404`. Path traversal (`..`) is rejected.

## Implementation

- `apps/desktop/src-tauri/src/codex_bundle.rs` — scheme handler + `open_codex_bundle_window` command.
- `apps/desktop/src-tauri/capabilities/codex-bundle.json` — grants the `codex-bundle` window the same permission set as `main` (incl. `core:default` for event listen + invoke).
- `apps/desktop/src-tauri/codex-bundle-bridge.js` — the injected adapter (separately maintained).
- `tauri.conf.json` — `app.withGlobalTauri = true` so the injected bridge can use `window.__TAURI__`.
