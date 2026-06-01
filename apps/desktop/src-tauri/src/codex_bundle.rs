//! Optional dev affordance: host the *real* Codex Desktop web bundle in a
//! SEPARATE Tauri window, wired to the same app-server transport as the
//! clean-room main window (via `host_send_raw` + the
//! `hicodex://app-server-event` event). The clean-room main window is the
//! untouched default; nothing here runs unless the
//! `open_codex_bundle_window` command is explicitly invoked.
//!
//! Design:
//! - We extract Codex Desktop's `app.asar` somewhere on disk (see
//!   `HICODEX_CODEX_ASAR_OUT`) and serve its `webview/` subdir over a custom
//!   URI scheme `codexbundle://` registered on the Tauri `Builder`.
//! - A dedicated webview window labeled `codex-bundle` loads
//!   `codexbundle://localhost/index.html` and gets a small bridge script
//!   injected (`codex-bundle-bridge.js`) that adapts the bundle's expectations
//!   onto our existing Tauri commands/events.
//!
//! See `docs/dev/codex-bundle-host.md`.

use std::path::{Path, PathBuf};

use tauri::http::{header, Request, Response, StatusCode};
use tauri::{AppHandle, Manager, Runtime, UriSchemeContext, WebviewUrl, WebviewWindowBuilder};

/// Custom URI scheme used to serve the extracted Codex Desktop web bundle.
const BUNDLE_SCHEME: &str = "codexbundle";
/// Window label for the bundle host window.
const BUNDLE_WINDOW_LABEL: &str = "codex-bundle";
/// Default extraction root when `HICODEX_CODEX_ASAR_OUT` is unset.
const DEFAULT_ASAR_OUT: &str = "/private/tmp/codex-asar";

/// Resolve the directory that holds the extracted Codex Desktop bundle.
///
/// Honors `HICODEX_CODEX_ASAR_OUT`, falling back to `/private/tmp/codex-asar`.
fn asar_out_dir() -> PathBuf {
    std::env::var_os("HICODEX_CODEX_ASAR_OUT")
        .map(PathBuf::from)
        .unwrap_or_else(|| PathBuf::from(DEFAULT_ASAR_OUT))
}

/// The web root we serve from: the `webview/` subdir of the extraction root.
///
/// Codex Desktop's Electron `app.asar` keeps its renderer assets under
/// `webview/` (index.html + hashed js/css/wasm/fonts). We treat that as the
/// document root for the `codexbundle://` scheme.
fn web_root() -> PathBuf {
    asar_out_dir().join("webview")
}

/// Guess a Content-Type from a file extension. Mirrors the small set of types
/// the Codex renderer bundle actually ships, defaulting to a binary stream.
fn content_type_for(path: &Path) -> &'static str {
    match path
        .extension()
        .and_then(|ext| ext.to_str())
        .map(str::to_ascii_lowercase)
        .as_deref()
    {
        Some("js") | Some("mjs") => "text/javascript",
        Some("css") => "text/css",
        Some("html") | Some("htm") => "text/html",
        Some("json") | Some("map") => "application/json",
        Some("wasm") => "application/wasm",
        Some("woff2") => "font/woff2",
        Some("woff") => "font/woff",
        Some("ttf") => "font/ttf",
        Some("otf") => "font/otf",
        Some("svg") => "image/svg+xml",
        Some("png") => "image/png",
        Some("jpg") | Some("jpeg") => "image/jpeg",
        Some("gif") => "image/gif",
        Some("webp") => "image/webp",
        Some("ico") => "image/x-icon",
        Some("txt") => "text/plain",
        _ => "application/octet-stream",
    }
}

/// Normalize the request URI into a path relative to the web root.
///
/// SPA semantics: `/` and any extension-less path that does not resolve to a
/// real file falls back to `index.html` so client-side routing works. We also
/// guard against path traversal by rejecting any component that is `..`.
fn resolve_request_path(root: &Path, uri_path: &str) -> Option<PathBuf> {
    // Strip the leading `/` and any query/fragment (the http crate already
    // splits those off via `uri().path()`, but be defensive).
    let raw = uri_path.split(['?', '#']).next().unwrap_or(uri_path);
    let trimmed = raw.trim_start_matches('/');

    // Root or empty -> index.html
    if trimmed.is_empty() {
        return Some(root.join("index.html"));
    }

    // Reject path-traversal attempts before joining.
    if trimmed.split('/').any(|seg| seg == "..") {
        return None;
    }
    let candidate = root.join(trimmed);

    if candidate.is_file() {
        return Some(candidate);
    }

    // Extension-less unknown path -> SPA fallback to index.html.
    if candidate.extension().is_none() {
        return Some(root.join("index.html"));
    }

    // Has an extension but does not exist -> let caller emit 404.
    Some(candidate)
}

/// Build the HTTP response for a `codexbundle://` request by reading the
/// matching file from the web root. Returns 200 with bytes, or 404 when the
/// file is missing (and not covered by the SPA fallback).
fn serve_bundle_file(uri_path: &str) -> Response<Vec<u8>> {
    let root = web_root();

    let Some(file_path) = resolve_request_path(&root, uri_path) else {
        return not_found(b"forbidden path".to_vec());
    };

    match std::fs::read(&file_path) {
        Ok(bytes) => {
            let mime = content_type_for(&file_path);
            Response::builder()
                .status(StatusCode::OK)
                .header(header::CONTENT_TYPE, mime)
                // Allow the custom-scheme origin to talk to itself / ipc.
                .header(header::ACCESS_CONTROL_ALLOW_ORIGIN, "*")
                .header(header::CACHE_CONTROL, "no-cache")
                .body(bytes)
                .unwrap_or_else(|_| not_found(b"response build error".to_vec()))
        }
        Err(_) => not_found(
            format!("not found: {}", file_path.display())
                .into_bytes(),
        ),
    }
}

fn not_found(body: Vec<u8>) -> Response<Vec<u8>> {
    Response::builder()
        .status(StatusCode::NOT_FOUND)
        .header(header::CONTENT_TYPE, "text/plain")
        .header(header::ACCESS_CONTROL_ALLOW_ORIGIN, "*")
        .body(body)
        .expect("static 404 response is always valid")
}

/// Register the `codexbundle://` custom URI scheme on the Tauri builder so the
/// bundle window can load the extracted Codex Desktop web assets.
///
/// Wire this in `main.rs` right alongside the other builder calls, e.g.:
/// ```ignore
/// tauri::Builder::default()
///     // ...plugins, manage, setup...
///     .register_uri_scheme_protocol("codexbundle", |_ctx, request| {
///         codex_bundle::handle_bundle_request(request)
///     })
/// ```
/// or simply `codex_bundle::register(builder)`.
#[must_use]
#[allow(dead_code)] // alternative wiring; main.rs uses the inline register_uri_scheme_protocol form
pub fn register<R: Runtime>(builder: tauri::Builder<R>) -> tauri::Builder<R> {
    builder.register_uri_scheme_protocol(
        BUNDLE_SCHEME,
        |_ctx: UriSchemeContext<'_, R>, request: Request<Vec<u8>>| {
            handle_bundle_request(&request)
        },
    )
}

/// Standalone handler, exposed so `main.rs` can inline the registration if it
/// prefers a closure over `register()`.
pub fn handle_bundle_request(request: &Request<Vec<u8>>) -> Response<Vec<u8>> {
    serve_bundle_file(request.uri().path())
}

/// Open (or focus, if already open) the separate window that hosts the real
/// Codex Desktop bundle.
///
/// Loads `codexbundle://localhost/index.html` and injects the bridge script
/// that adapts the bundle onto our existing app-server transport. The
/// clean-room `main` window is never touched by this command.
#[tauri::command]
pub fn open_codex_bundle_window(app: AppHandle) -> Result<(), String> {
    // Focus an existing instance instead of erroring on duplicate label.
    if let Some(window) = app.get_webview_window(BUNDLE_WINDOW_LABEL) {
        window
            .unminimize()
            .and_then(|_| window.show())
            .and_then(|_| window.set_focus())
            .map_err(|error| format!("failed to focus codex bundle window: {error}"))?;
        return Ok(());
    }

    // Surface a clear error early if the bundle has not been extracted yet,
    // rather than opening a blank window.
    let root = web_root();
    if !root.join("index.html").is_file() {
        return Err(format!(
            "codex bundle not found: expected {} (set HICODEX_CODEX_ASAR_OUT or extract app.asar to /private/tmp/codex-asar)",
            root.join("index.html").display()
        ));
    }

    let url: tauri::Url = format!("{BUNDLE_SCHEME}://localhost/index.html")
        .parse()
        .map_err(|error| format!("invalid codex bundle url: {error}"))?;

    WebviewWindowBuilder::new(&app, BUNDLE_WINDOW_LABEL, WebviewUrl::CustomProtocol(url))
        .title("Codex (bundle)")
        .inner_size(1280.0, 820.0)
        .initialization_script(include_str!("../codex-bundle-bridge.js"))
        .build()
        .map_err(|error| format!("failed to open codex bundle window: {error}"))?;

    Ok(())
}
