use base64::{engine::general_purpose, Engine as _};
use hicodex_host::{
    AppServerHost, AppServerStartConfig, CodexAuthSummary, ComputerUseReadiness,
    ComputerUseRepairResult, HostInstallationState, HostStatus, LocalModelCatalogConfig,
    ThreadToolHistory,
};
use serde::{Deserialize, Serialize};
use serde_json::{json, Value};
use std::env;
use std::fs;
use std::io::{Read, Write};
use std::path::{Path, PathBuf};
use std::process::{Command, Stdio};
use std::sync::atomic::{AtomicBool, AtomicU64, Ordering};
use std::sync::{mpsc, Mutex};
use std::thread;
use std::time::{Duration, SystemTime, UNIX_EPOCH};
use tauri::menu::{MenuBuilder, MenuItemBuilder, PredefinedMenuItem, SubmenuBuilder};
use tauri::{AppHandle, Emitter, Manager, State, WebviewUrl, WebviewWindowBuilder};
use tauri_plugin_deep_link::DeepLinkExt;
use tauri_plugin_notification::NotificationExt;

mod codex_bundle;
mod document_preview;
mod spreadsheet_preview;

use document_preview::{read_document_preview, DocumentPreview};
use spreadsheet_preview::{read_spreadsheet_preview, SpreadsheetPreview};

#[cfg(unix)]
use std::os::unix::fs::{FileTypeExt, PermissionsExt};
#[cfg(unix)]
use std::os::unix::net::{UnixListener, UnixStream};

const APP_SERVER_EVENT_NAME: &str = "hicodex://app-server-event";
const NATIVE_SHELL_EVENT_NAME: &str = "hicodex://native-shell-event";
const BROWSER_RUNTIME_EVENT_NAME: &str = "hicodex://browser-runtime-event";
const BROWSER_IAB_MODE: &str = "probe";
const BROWSER_EXTENSION_BACKEND_MODE: &str = "host-compatible-spike";
const BROWSER_EXTENSION_BACKEND_ENV: &str = "HICODEX_BROWSER_EXTENSION_BACKEND_SPIKE";
const BROWSER_IAB_DEFAULT_CODEX_APP_BUILD_FLAVOR: &str = "prod";
const BROWSER_IAB_PIPE_DIR_NAME: &str = "codex-browser-use";
const BROWSER_IAB_DEFAULT_URL: &str = "https://example.com";
const BROWSER_IAB_EVAL_TIMEOUT: Duration = Duration::from_secs(8);
const CODEX_DEEP_LINK_SCHEME: &str = "codex://";
const APP_CONNECT_OAUTH_CALLBACK_PATH: &str = "/aip/connectors/links/oauth/callback";
const APP_CONNECT_OAUTH_BROWSER_REDIRECT_PATH: &str = "/connector_platform_oauth_redirect";

const MENU_NEW_CHAT: &str = "hicodex:new-chat";
const MENU_NEW_WINDOW: &str = "hicodex:new-window";
const MENU_OPEN_FOLDER: &str = "hicodex:open-folder";
const MENU_SEARCH: &str = "hicodex:search";
const MENU_SETTINGS: &str = "hicodex:settings";
const MENU_RELOAD: &str = "hicodex:reload";
const MENU_CLOSE: &str = "hicodex:close-window";
const MENU_QUIT: &str = "hicodex:quit";

struct AppState {
    host: AppServerHost,
    browser_runtime: Mutex<BrowserRuntimeStore>,
    browser_extension_backend_validated: AtomicBool,
}

#[derive(Debug, Clone, Default)]
struct BrowserRuntimeStore {
    tabs: Vec<BrowserRuntimeTab>,
    active_tab_id: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
struct BrowserRuntimeTab {
    tab_id: String,
    title: String,
    url: String,
    display_url: String,
    open: bool,
    is_agent_working: bool,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
struct BrowserRuntimeStatus {
    available: bool,
    active_tab_id: Option<String>,
    tabs: Vec<BrowserRuntimeTab>,
    error: Option<String>,
    iab_backend_registered: bool,
    iab_backend_path: Option<String>,
    iab_backend_mode: Option<String>,
    extension_backend_registered: bool,
    extension_backend_validated: bool,
    extension_backend_path: Option<String>,
    extension_backend_mode: Option<String>,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
enum BrowserBackendKind {
    IabProbe,
    ExtensionHostCompatible,
}

impl BrowserBackendKind {
    fn socket_suffix(self) -> &'static str {
        match self {
            Self::IabProbe => "iab",
            Self::ExtensionHostCompatible => "extension",
        }
    }

    fn backend_type(self) -> &'static str {
        match self {
            Self::IabProbe => "iab",
            Self::ExtensionHostCompatible => "extension",
        }
    }

    fn mode(self) -> &'static str {
        match self {
            Self::IabProbe => BROWSER_IAB_MODE,
            Self::ExtensionHostCompatible => BROWSER_EXTENSION_BACKEND_MODE,
        }
    }

    fn log_prefix(self) -> &'static str {
        match self {
            Self::IabProbe => "browser-iab",
            Self::ExtensionHostCompatible => "browser-extension",
        }
    }
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
struct LocalFileMetadata {
    is_file: bool,
    size_bytes: Option<u64>,
    mime_type: Option<String>,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
struct TurnCompletionNotificationRequest {
    title: Option<String>,
    body: Option<String>,
    sound: Option<bool>,
    thread_id: Option<String>,
    turn_id: Option<String>,
    status: Option<String>,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
struct ImageGenerationRequest {
    base_url: String,
    api_key: Option<String>,
    payload: Value,
    codex_home: Option<String>,
    thread_id: Option<String>,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
struct HostGitStatus {
    cwd: String,
    repo_root: Option<String>,
    branch: Option<String>,
    sha: Option<String>,
    upstream: Option<String>,
    ahead: u32,
    behind: u32,
    changed_files: Vec<HostGitChangedFile>,
    has_diff: bool,
    diff: String,
    // codex thread-env-icon — true when the cwd is a LINKED git worktree.
    is_worktree: bool,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
struct HostGitChangedFile {
    status: String,
    path: String,
    old_path: Option<String>,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
struct CreatePendingWorktreeRequest {
    cwd: String,
    branch_name: Option<String>,
    base_ref: Option<String>,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
struct CreatePendingWorktreeResponse {
    repo_root: String,
    path: String,
    branch_name: String,
    base_ref: String,
    base_sha: String,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
struct CreateProjectlessThreadCwdRequest {
    directory_name: Option<String>,
    prompt: Option<String>,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
struct CreateProjectlessThreadCwdResponse {
    cwd: String,
    output_directory: String,
    workspace_root: String,
}

impl Default for AppState {
    fn default() -> Self {
        Self {
            host: AppServerHost::new(),
            browser_runtime: Mutex::new(BrowserRuntimeStore::default()),
            browser_extension_backend_validated: AtomicBool::new(false),
        }
    }
}

#[tauri::command]
fn host_start_app_server(
    state: State<'_, AppState>,
    config: AppServerStartConfig,
) -> Result<HostStatus, String> {
    state.host.start(config).map_err(|error| error.to_string())
}

#[tauri::command]
fn host_stop_app_server(state: State<'_, AppState>) -> Result<HostStatus, String> {
    state.host.stop().map_err(|error| error.to_string())
}

#[tauri::command]
fn host_status(state: State<'_, AppState>) -> HostStatus {
    state.host.status()
}

#[tauri::command]
fn host_send_raw(state: State<'_, AppState>, message: Value) -> Result<(), String> {
    state
        .host
        .send_json(message)
        .map_err(|error| error.to_string())
}

#[tauri::command]
fn host_write_local_model_catalog(
    state: State<'_, AppState>,
    codex_home: Option<String>,
    config: LocalModelCatalogConfig,
) -> Result<String, String> {
    state
        .host
        .write_local_model_catalog(codex_home, config)
        .map_err(|error| error.to_string())
}

#[tauri::command]
fn host_read_codex_auth_summary(
    state: State<'_, AppState>,
    codex_home: Option<String>,
) -> Result<CodexAuthSummary, String> {
    state
        .host
        .read_codex_auth_summary(codex_home)
        .map_err(|error| error.to_string())
}

#[tauri::command]
fn host_read_installation_state(
    state: State<'_, AppState>,
    codex_home: Option<String>,
) -> Result<HostInstallationState, String> {
    state
        .host
        .read_or_init_installation_state(codex_home)
        .map_err(|error| error.to_string())
}

#[tauri::command]
fn host_read_computer_use_readiness(
    state: State<'_, AppState>,
    codex_home: Option<String>,
) -> Result<ComputerUseReadiness, String> {
    state
        .host
        .read_computer_use_readiness(codex_home)
        .map_err(|error| error.to_string())
}

#[tauri::command]
fn host_repair_computer_use_bundle(
    state: State<'_, AppState>,
    codex_home: Option<String>,
) -> Result<ComputerUseRepairResult, String> {
    state
        .host
        .repair_computer_use_bundle(codex_home)
        .map_err(|error| error.to_string())
}

#[tauri::command]
fn host_open_computer_use_setup(
    state: State<'_, AppState>,
    codex_home: Option<String>,
    target: String,
) -> Result<(), String> {
    let target = target.trim();
    if target.is_empty() {
        return Err("computer use setup target is empty".to_string());
    }
    match target {
        "helper" | "app" => {
            let readiness = state
                .host
                .read_computer_use_readiness(codex_home)
                .map_err(|error| error.to_string())?;
            let path = readiness
                .helper_app_path
                .ok_or_else(|| "Computer Use helper app is not available.".to_string())?;
            open_existing_path(&path)
        }
        "installer" => {
            let readiness = state
                .host
                .read_computer_use_readiness(codex_home)
                .map_err(|error| error.to_string())?;
            let path = readiness
                .installer_app_path
                .ok_or_else(|| "Computer Use installer app is not available.".to_string())?;
            open_existing_path(&path)
        }
        "screenRecording" | "screenRecordingSettings" => open_macos_system_settings_url(
            "x-apple.systempreferences:com.apple.preference.security?Privacy_ScreenCapture",
        ),
        "accessibility" | "accessibilitySettings" => open_macos_system_settings_url(
            "x-apple.systempreferences:com.apple.preference.security?Privacy_Accessibility",
        ),
        _ => Err(format!("unsupported computer use setup target: {target}")),
    }
}

#[tauri::command]
fn host_open_file_reference(path: String, line: Option<u32>) -> Result<(), String> {
    let trimmed = path.trim();
    if trimmed.is_empty() {
        return Err("file path is empty".to_string());
    }
    let target = Path::new(trimmed);
    if !target.exists() {
        return Err(format!("file does not exist: {trimmed}"));
    }
    let line_suffix = line
        .filter(|value| *value > 0)
        .map(|value| format!(":{value}"))
        .unwrap_or_default();
    let display_target = format!("{trimmed}{line_suffix}");
    open_path(target).map_err(|error| format!("failed to open {display_target}: {error}"))
}

// Mirrors Codex Desktop's `workspace-file-reveal-path` context-menu action
// (workspace-file-context-menu-*.js): reveal a file/folder in the OS file
// manager, selecting the item where the platform supports it.
#[tauri::command]
fn host_reveal_path(path: String) -> Result<(), String> {
    let trimmed = path.trim();
    if trimmed.is_empty() {
        return Err("file path is empty".to_string());
    }
    let target = Path::new(trimmed);
    if !target.exists() {
        return Err(format!("path does not exist: {trimmed}"));
    }
    reveal_path(target).map_err(|error| format!("failed to reveal {trimmed}: {error}"))
}

// Mirrors Codex Desktop's `threadHeader.openInNewWindow` ("Open in new window").
// Codex (Electron) opens a BrowserWindow; HiCodex opens a second Tauri webview
// loading the same app, injecting the target thread id via an initialization
// script so the frontend can route to it on startup (reusing the existing
// deep-link routing) without a load-timing race. An already-open window for the
// thread is focused instead of duplicated.
#[tauri::command]
fn host_open_thread_window(app: AppHandle, thread_id: String) -> Result<(), String> {
    let thread_id = thread_id.trim();
    if thread_id.is_empty() {
        return Err("thread id is empty".to_string());
    }
    let label = format!("thread-{thread_id}");
    if let Some(existing) = app.get_webview_window(&label) {
        let _ = existing.set_focus();
        return Ok(());
    }
    let encoded = serde_json::to_string(thread_id).map_err(|error| error.to_string())?;
    let init_script = format!("window.__HICODEX_INITIAL_THREAD__ = {encoded};");
    WebviewWindowBuilder::new(&app, &label, WebviewUrl::default())
        .title("Forge")
        .inner_size(1280.0, 820.0)
        .initialization_script(&init_script)
        .build()
        .map_err(|error| format!("failed to open thread window: {error}"))?;
    Ok(())
}

// codex newWindow (⌘⇧N) — open a fresh app window. Codex (Electron) opens a new
// BrowserWindow; HiCodex opens a new Tauri webview that injects a new-chat signal so the
// frontend starts a fresh conversation on startup. Each window needs a unique label.
static NEW_WINDOW_COUNTER: std::sync::atomic::AtomicU64 = std::sync::atomic::AtomicU64::new(0);
static BROWSER_TAB_COUNTER: AtomicU64 = AtomicU64::new(1);

fn open_new_window_impl(app: &AppHandle) -> Result<(), String> {
    let n = NEW_WINDOW_COUNTER.fetch_add(1, std::sync::atomic::Ordering::Relaxed);
    let label = format!("new-window-{n}");
    WebviewWindowBuilder::new(app, &label, WebviewUrl::default())
        .title("Forge")
        .inner_size(1280.0, 820.0)
        .initialization_script("window.__HICODEX_INITIAL_NEW_CHAT__ = true;")
        .build()
        .map_err(|error| format!("failed to open new window: {error}"))?;
    Ok(())
}

#[tauri::command]
fn host_open_new_window(app: AppHandle) -> Result<(), String> {
    open_new_window_impl(&app)
}

#[tauri::command]
fn host_browser_runtime_status(app: AppHandle, state: State<'_, AppState>) -> BrowserRuntimeStatus {
    refresh_browser_runtime_store(&app, &state);
    browser_runtime_status_from_store(&state, None)
}

#[tauri::command]
fn host_open_browser_tab(
    app: AppHandle,
    state: State<'_, AppState>,
    url: Option<String>,
    tab_id: Option<String>,
) -> Result<BrowserRuntimeStatus, String> {
    open_browser_tab_impl(&app, &state, url, tab_id)
}

fn open_browser_tab_impl(
    app: &AppHandle,
    state: &AppState,
    url: Option<String>,
    tab_id: Option<String>,
) -> Result<BrowserRuntimeStatus, String> {
    let existing_tab_id = tab_id
        .as_deref()
        .map(str::trim)
        .filter(|value| !value.is_empty())
        .map(ToOwned::to_owned);
    if url.as_deref().map(str::trim).unwrap_or_default().is_empty() {
        let Some(tab_id) = existing_tab_id else {
            return Ok(browser_runtime_status_from_store(state, None));
        };
        let label = browser_window_label(&tab_id);
        if let Some(window) = app.get_webview_window(&label) {
            let _ = window.set_focus();
            {
                let mut store = state
                    .browser_runtime
                    .lock()
                    .expect("browser runtime mutex poisoned");
                store.active_tab_id = Some(tab_id);
            }
            emit_browser_runtime_event(app, state, None);
            return Ok(browser_runtime_status_from_store(state, None));
        }
        mark_browser_tab_closed(state, &tab_id);
        emit_browser_runtime_event(app, state, None);
        return Ok(browser_runtime_status_from_store(state, None));
    }

    let target = normalized_browser_url(url.as_deref().unwrap_or_default())?;
    let parsed_url = target
        .parse()
        .map_err(|error| format!("failed to parse Browser URL: {error}"))?;
    let tab_id = existing_tab_id.unwrap_or_else(next_browser_tab_id);
    let label = browser_window_label(&tab_id);
    if let Some(window) = app.get_webview_window(&label) {
        window
            .navigate(parsed_url)
            .map_err(|error| format!("failed to navigate Browser tab: {error}"))?;
        window
            .set_focus()
            .map_err(|error| format!("failed to focus Browser tab: {error}"))?;
    } else {
        let app_for_close = app.clone();
        let tab_id_for_close = tab_id.clone();
        WebviewWindowBuilder::new(app, &label, WebviewUrl::External(parsed_url))
            .title("Browser")
            .inner_size(1180.0, 780.0)
            .on_document_title_changed({
                let app_for_title = app.clone();
                let tab_id_for_title = tab_id.clone();
                move |_window, title| {
                    let state_for_title = app_for_title.state::<AppState>();
                    update_browser_tab_title(&state_for_title, &tab_id_for_title, title);
                    emit_browser_runtime_event(&app_for_title, &state_for_title, None);
                }
            })
            .on_page_load({
                let app_for_load = app.clone();
                let tab_id_for_load = tab_id.clone();
                move |window, _payload| {
                    if let Ok(url) = window.url() {
                        let state_for_load = app_for_load.state::<AppState>();
                        update_browser_tab_url(&state_for_load, &tab_id_for_load, url.to_string());
                        emit_browser_runtime_event(&app_for_load, &state_for_load, None);
                    }
                }
            })
            .build()
            .map_err(|error| format!("failed to open Browser tab: {error}"))?
            .on_window_event(move |event| {
                if matches!(
                    event,
                    tauri::WindowEvent::Destroyed | tauri::WindowEvent::CloseRequested { .. }
                ) {
                    let state_for_close = app_for_close.state::<AppState>();
                    mark_browser_tab_closed(&state_for_close, &tab_id_for_close);
                    emit_browser_runtime_event(&app_for_close, &state_for_close, None);
                }
            });
    }
    upsert_browser_tab(state, &tab_id, &target, Some("Browser".to_string()), true);
    emit_browser_runtime_event(app, state, None);
    Ok(browser_runtime_status_from_store(state, None))
}

#[tauri::command]
fn host_open_external_url(url: String) -> Result<(), String> {
    let target = normalized_external_url(&url)?;
    open_external_url(&target).map_err(|error| format!("failed to open external URL: {error}"))
}

#[tauri::command]
fn host_pick_file_references(
    kind: Option<String>,
    multiple: Option<bool>,
) -> Result<Vec<String>, String> {
    pick_file_references(kind.as_deref(), multiple.unwrap_or(true))
}

#[tauri::command]
fn host_pick_workspace_folder() -> Result<Option<String>, String> {
    pick_workspace_folder()
}

#[tauri::command]
fn host_read_image_data_url(path: String) -> Result<String, String> {
    let trimmed = path.trim();
    if trimmed.is_empty() {
        return Err("image path is empty".to_string());
    }
    let target = Path::new(trimmed);
    if !target.is_file() {
        return Err(format!("image file does not exist: {trimmed}"));
    }
    let mime =
        image_mime_type(target).ok_or_else(|| format!("unsupported image type: {trimmed}"))?;
    let bytes = fs::read(target).map_err(|error| format!("failed to read image: {error}"))?;
    Ok(format!(
        "data:{mime};base64,{}",
        general_purpose::STANDARD.encode(bytes)
    ))
}

#[tauri::command]
fn host_read_file_metadata(path: String) -> Result<LocalFileMetadata, String> {
    let trimmed = path.trim();
    if trimmed.is_empty() {
        return Err("file path is empty".to_string());
    }
    let target = Path::new(trimmed);
    let metadata =
        fs::metadata(target).map_err(|error| format!("failed to read file metadata: {error}"))?;
    let is_file = metadata.is_file();
    Ok(LocalFileMetadata {
        is_file,
        size_bytes: if is_file { Some(metadata.len()) } else { None },
        mime_type: file_mime_type(target).map(ToOwned::to_owned),
    })
}

#[tauri::command]
fn host_notify_turn_completed(
    app: AppHandle,
    request: TurnCompletionNotificationRequest,
) -> Result<(), String> {
    let title = notification_text(request.title, "Forge turn completed", 96);
    let body = notification_text(request.body, "The background turn has finished.", 240);
    let builder = app.notification().builder().title(title).body(body);
    let builder = if request.sound.unwrap_or(true) {
        builder.sound("default")
    } else {
        builder
    };
    builder
        .show()
        .map_err(|error| format!("failed to show turn notification: {error}"))?;
    let _ = app.emit(
        NATIVE_SHELL_EVENT_NAME,
        json!({
            "action": "turnCompletedNotification",
            "supported": true,
            "threadId": request.thread_id,
            "turnId": request.turn_id,
            "status": request.status,
        }),
    );
    Ok(())
}

#[tauri::command]
fn host_handle_deep_link_url(app: AppHandle, url: String) -> Result<(), String> {
    handle_deep_link_url(&app, &url)
}

#[tauri::command]
fn host_read_text_file(path: String, max_bytes: Option<u64>) -> Result<String, String> {
    let trimmed = path.trim();
    if trimmed.is_empty() {
        return Err("text file path is empty".to_string());
    }
    let target = Path::new(trimmed);
    if !target.is_file() {
        return Err(format!("text file does not exist: {trimmed}"));
    }

    if is_word_document_path(target) {
        return read_document_preview(target, 200, 1_000).map(DocumentPreview::into_plain_text);
    }

    let max_bytes = max_bytes.unwrap_or(120_000).clamp(1, 240_000);
    let mut file =
        fs::File::open(target).map_err(|error| format!("failed to open text file: {error}"))?;
    let mut bytes = Vec::new();
    Read::by_ref(&mut file)
        .take(max_bytes + 1)
        .read_to_end(&mut bytes)
        .map_err(|error| format!("failed to read text file: {error}"))?;

    let truncated = bytes.len() as u64 > max_bytes;
    if truncated {
        bytes.truncate(max_bytes as usize);
    }
    let mut text = String::from_utf8_lossy(&bytes).to_string();
    if truncated {
        text.push_str("\n\n[Preview truncated]");
    }
    Ok(text)
}

#[tauri::command]
fn host_read_spreadsheet_preview(
    path: String,
    max_rows: Option<usize>,
    max_cols: Option<usize>,
) -> Result<SpreadsheetPreview, String> {
    let trimmed = path.trim();
    if trimmed.is_empty() {
        return Err("spreadsheet path is empty".to_string());
    }
    let target = Path::new(trimmed);
    if !target.is_file() {
        return Err(format!("spreadsheet file does not exist: {trimmed}"));
    }

    let max_rows = max_rows.unwrap_or(80).clamp(1, 400);
    let max_cols = max_cols.unwrap_or(24).clamp(1, 120);
    read_spreadsheet_preview(target, max_rows, max_cols)
}

// CODEX-REF: webview/assets/open-workspace-file-DOOUD1lA.js — Codex Desktop streams
// xlsx bytes to its WASM Popcorn workbook viewer. HiCodex's reduced preview parses
// the workbook in the renderer with SheetJS, so we need raw bytes back. The CSP
// blocks `fetch()` against the asset protocol, so we expose a small base64
// fetcher that mirrors the existing `host_read_image_data_url` pattern and is
// capped so we never load a multi-hundred-MB workbook into JS.
#[tauri::command]
fn host_read_file_bytes_base64(path: String, max_bytes: Option<u64>) -> Result<String, String> {
    let trimmed = path.trim();
    if trimmed.is_empty() {
        return Err("file path is empty".to_string());
    }
    let target = Path::new(trimmed);
    if !target.is_file() {
        return Err(format!("file does not exist: {trimmed}"));
    }
    // Cap to ~16 MiB so an accidentally giant workbook can't pin the renderer.
    let max_bytes = max_bytes
        .unwrap_or(16 * 1024 * 1024)
        .clamp(1, 64 * 1024 * 1024);
    let mut file =
        fs::File::open(target).map_err(|error| format!("failed to open file: {error}"))?;
    let mut bytes = Vec::new();
    Read::by_ref(&mut file)
        .take(max_bytes + 1)
        .read_to_end(&mut bytes)
        .map_err(|error| format!("failed to read file: {error}"))?;
    if bytes.len() as u64 > max_bytes {
        return Err(format!("file exceeds preview limit ({} bytes)", max_bytes));
    }
    Ok(general_purpose::STANDARD.encode(bytes))
}

#[tauri::command]
fn host_read_document_preview(
    path: String,
    max_paragraphs: Option<usize>,
    max_chars_per_paragraph: Option<usize>,
) -> Result<DocumentPreview, String> {
    let trimmed = path.trim();
    if trimmed.is_empty() {
        return Err("document path is empty".to_string());
    }
    let target = Path::new(trimmed);
    if !target.is_file() {
        return Err(format!("document file does not exist: {trimmed}"));
    }

    let max_paragraphs = max_paragraphs.unwrap_or(80).clamp(1, 400);
    let max_chars_per_paragraph = max_chars_per_paragraph.unwrap_or(400).clamp(20, 4_000);
    read_document_preview(target, max_paragraphs, max_chars_per_paragraph)
}

#[tauri::command]
fn host_git_status(cwd: String) -> Result<HostGitStatus, String> {
    read_host_git_status(&cwd)
}

// codex: composer-footer-branch-switcher-CamXBKfA.js — branch picker host APIs.
// Mirrors the Desktop branch switcher's data model (`use-git-current-branch`,
// `use-git-recent-branches`, `use-git-default-branch`): one shot returns the
// current branch + every local branch with its last-commit epoch so the
// renderer can sort recents to the top without a separate `reflog` call.
// codex: branch-picker-extension — `is_remote` flips on for the `git branch -r`
// scan so the renderer can render the remote section as a dedicated heading.
#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
struct GitBranchInfo {
    name: String,
    last_commit_ms: Option<i64>,
    is_current: bool,
    /// True when the entry came from `git branch -r` (e.g. `origin/feature-x`).
    /// codex: composer-footer-branch-switcher-CamXBKfA.js — "Remote branches"
    /// section is keyed off this flag in the renderer.
    is_remote: bool,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
struct GitBranchesResponse {
    current: Option<String>,
    branches: Vec<GitBranchInfo>,
}

// codex: branch-picker-extension — `host_git_default_branch` payload mirrors
// Codex Desktop's `useGitDefaultBranch` hook. We surface a single optional
// string so the renderer can render the "Default" chip without inventing a
// per-branch field on the branches list.
#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
struct GitDefaultBranchResponse {
    default_branch: Option<String>,
}

// codex: composer-footer-branch-switcher-CamXBKfA.js — list local branches.
// Returns ({ current, branches[] }) so the picker can render "current" first
// then sort the rest by `lastCommitMs` desc (matches Codex's recents order).
// `cwd` may be anywhere inside the worktree; we resolve to repo root before
// calling git so worktrees / nested invocations behave the same.
// codex: branch-picker-extension — `include_remote` opts into a second
// `git branch -r --list` pass; the response merges local + remote into a
// single `branches[]` so the renderer can group via `isRemote`.
#[tauri::command]
fn host_git_list_branches(
    cwd: String,
    include_remote: Option<bool>,
) -> Result<GitBranchesResponse, String> {
    let cwd = cwd.trim();
    if cwd.is_empty() {
        return Err("cwd is empty".to_string());
    }
    let cwd_path = Path::new(cwd);
    let Some(repo_root) = git_repo_root(cwd_path)? else {
        // codex: not-a-git-repo → renderer hides the chip via `current=None`
        return Ok(GitBranchesResponse {
            current: None,
            branches: Vec::new(),
        });
    };
    let repo_path = Path::new(&repo_root);

    // Custom format keeps a single round-trip: `<name>\t<committerdate-epoch>`.
    // `--list` keeps it local-only (Codex's picker only shows local branches in
    // the static mode we mirror here; remotes are wired in via include_remote).
    let output = run_git(
        repo_path,
        &[
            "branch",
            "--list",
            "--sort=-committerdate",
            "--format=%(refname:short)%09%(committerdate:unix)",
        ],
    )?;
    if !output.status.success() {
        return Err(format_git_failure("failed to list git branches", &output));
    }

    let current = git_stdout_optional(repo_path, &["branch", "--show-current"])?;
    let stdout = String::from_utf8_lossy(&output.stdout);
    let mut branches: Vec<GitBranchInfo> = Vec::new();
    for raw_line in stdout.lines() {
        let line = raw_line.trim_end();
        if line.is_empty() {
            continue;
        }
        // Trim the "*" / "+" markers `git branch` would normally print; the
        // custom format strips them but be defensive against detached-HEAD
        // entries like "(HEAD detached at <sha>)" which we skip.
        if line.starts_with('(') {
            continue;
        }
        let (name_part, epoch_part) = match line.find('\t') {
            Some(idx) => (&line[..idx], Some(&line[idx + 1..])),
            None => (line, None),
        };
        let name = name_part.trim().to_string();
        if name.is_empty() {
            continue;
        }
        let last_commit_ms = epoch_part
            .map(str::trim)
            .filter(|value| !value.is_empty())
            .and_then(|value| value.parse::<i64>().ok())
            .map(|seconds| seconds.saturating_mul(1000));
        let is_current = current.as_deref() == Some(name.as_str());
        branches.push(GitBranchInfo {
            name,
            last_commit_ms,
            is_current,
            is_remote: false,
        });
    }

    // codex: branch-picker-extension — opt-in remote scan. We skip the
    // `origin/HEAD` symbolic ref (e.g. `origin/HEAD -> origin/main`) since it
    // is not a real branch the user would want to check out.
    if include_remote.unwrap_or(false) {
        let remote_output = run_git(
            repo_path,
            &[
                "branch",
                "-r",
                "--list",
                "--sort=-committerdate",
                "--format=%(refname:short)%09%(committerdate:unix)",
            ],
        )?;
        if !remote_output.status.success() {
            return Err(format_git_failure(
                "failed to list git remote branches",
                &remote_output,
            ));
        }
        let remote_stdout = String::from_utf8_lossy(&remote_output.stdout);
        for raw_line in remote_stdout.lines() {
            let line = raw_line.trim_end();
            if line.is_empty() {
                continue;
            }
            if line.starts_with('(') {
                continue;
            }
            let (name_part, epoch_part) = match line.find('\t') {
                Some(idx) => (&line[..idx], Some(&line[idx + 1..])),
                None => (line, None),
            };
            let name = name_part.trim().to_string();
            if name.is_empty() {
                continue;
            }
            // codex: skip the symbolic head pointer; the rendered list would
            // otherwise show "origin/HEAD -> origin/main" which would not
            // round-trip through `git checkout -b`.
            if name.contains("->") || name.ends_with("/HEAD") {
                continue;
            }
            let last_commit_ms = epoch_part
                .map(str::trim)
                .filter(|value| !value.is_empty())
                .and_then(|value| value.parse::<i64>().ok())
                .map(|seconds| seconds.saturating_mul(1000));
            branches.push(GitBranchInfo {
                name,
                last_commit_ms,
                is_current: false,
                is_remote: true,
            });
        }
    }

    Ok(GitBranchesResponse { current, branches })
}

// codex: branch-picker-extension — Codex Desktop's `useGitDefaultBranch`.
// Resolves to whatever `origin/HEAD` points at (the common case for a cloned
// repo) and falls back to the user's `init.defaultBranch` git config if the
// remote symbolic ref isn't set (e.g. local-only repos).
#[tauri::command]
fn host_git_default_branch(cwd: String) -> Result<GitDefaultBranchResponse, String> {
    let cwd = cwd.trim();
    if cwd.is_empty() {
        return Err("cwd is empty".to_string());
    }
    let cwd_path = Path::new(cwd);
    let Some(repo_root) = git_repo_root(cwd_path)? else {
        return Ok(GitDefaultBranchResponse {
            default_branch: None,
        });
    };
    let repo_path = Path::new(&repo_root);
    // `--short` strips the `refs/remotes/origin/` prefix, leaving e.g. "main".
    let symbolic = git_stdout_optional(
        repo_path,
        &["symbolic-ref", "--short", "refs/remotes/origin/HEAD"],
    )
    .unwrap_or(None);
    let default_branch = match symbolic {
        Some(value) => {
            // Trim the leading `origin/` so the renderer can match against the
            // local branch list. Codex Desktop's `useGitDefaultBranch` exposes
            // the bare branch name (e.g. "main"), not the remote ref.
            let trimmed = value
                .split_once('/')
                .map(|(_, rest)| rest.to_string())
                .unwrap_or(value);
            Some(trimmed)
        }
        None => {
            // codex: fall back to git's user config when origin/HEAD is unset.
            git_stdout_optional(repo_path, &["config", "init.defaultBranch"]).unwrap_or(None)
        }
    };
    Ok(GitDefaultBranchResponse { default_branch })
}

// codex: branch-picker-extension — Codex Desktop "Create new branch" action.
// Mirrors `git checkout -b <name> [<basedOn>]`. `basedOn` is forwarded as a
// final positional so the renderer can support "create from remote" (passing
// e.g. `origin/feature-x`) without inventing a separate command.
#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
struct CreateGitBranchRequest {
    cwd: String,
    branch_name: String,
    #[serde(default)]
    based_on: Option<String>,
}

#[tauri::command]
fn host_git_create_branch(request: CreateGitBranchRequest) -> Result<(), String> {
    let cwd = request.cwd.trim();
    if cwd.is_empty() {
        return Err("cwd is empty".to_string());
    }
    let branch_name = request.branch_name.trim();
    if branch_name.is_empty() {
        return Err("branch name is empty".to_string());
    }
    if branch_name.starts_with('-') {
        return Err("branch name must not start with '-'".to_string());
    }
    if branch_name
        .chars()
        .any(|ch| ch.is_control() || ch.is_whitespace())
    {
        return Err("branch name contains unsupported whitespace".to_string());
    }
    let cwd_path = Path::new(cwd);
    let repo_root =
        git_repo_root(cwd_path)?.ok_or_else(|| format!("not a git repository: {cwd}"))?;
    let repo_path = Path::new(&repo_root);
    // codex: build args dynamically — keeping `&str` borrows tied to owned
    // trimmed strings so the slice still references valid memory.
    let based_on = request
        .based_on
        .as_deref()
        .map(str::trim)
        .filter(|value| !value.is_empty());
    if let Some(value) = based_on {
        if value.starts_with('-') {
            return Err("base branch must not start with '-'".to_string());
        }
    }
    let mut args: Vec<&str> = vec!["checkout", "-b", branch_name];
    if let Some(value) = based_on {
        args.push(value);
    }
    let output = run_git(repo_path, &args)?;
    if !output.status.success() {
        return Err(format_git_failure("failed to create branch", &output));
    }
    Ok(())
}

// codex: local-conversation-thread-CecHj6JI.js#J#ga — PR status host API.
// Mirrors Codex Desktop's `pullRequestStatus` widget (Environment section row
// 4) which surfaces the current branch's GitHub PR. Codex Desktop uses a
// dedicated `gh-cli-status-*` chunk under the hood; HiCodex shells out to the
// `gh` CLI in the renderer's cwd to keep the host bridge minimal.
//
// IPC shape (after serde rename_all = "camelCase"):
//   { currentBranch: string | null, pr: { number, title, url, isDraft,
//     mergeable, state, headRefName } | null }
//
// Returns Ok with `pr: None` when gh reports "no pull requests" or the cwd is
// not a git repo (Codex hides the widget in those cases); returns Err for the
// hard-failure cases (gh not installed, gh exited unexpectedly) so the
// renderer can choose between silent-hide and surfaced-error.
#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
struct GhPrInfo {
    number: u64,
    title: String,
    url: String,
    is_draft: bool,
    /// `MERGEABLE` / `CONFLICTING` / `UNKNOWN` — gh's `--json mergeable` value.
    /// Kept as Option<String> so a missing field falls through to null in JSON
    /// (Codex's `mergeable` ternary tolerates null).
    mergeable: Option<String>,
    /// `OPEN` / `CLOSED` / `MERGED` — drives Codex's status badge color.
    state: String,
    head_ref_name: String,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
struct GhPrStatusResponse {
    current_branch: Option<String>,
    pr: Option<GhPrInfo>,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
struct GhPrStatusPayload {
    #[serde(default)]
    current_branch: Option<GhPrEntry>,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
struct GhPrEntry {
    number: u64,
    title: String,
    url: String,
    #[serde(default)]
    is_draft: bool,
    #[serde(default)]
    mergeable: Option<String>,
    state: String,
    head_ref_name: String,
}

// codex: local-conversation-thread-CecHj6JI.js#J#ga — PR status host API.
// Runs `gh pr status --json ...` inside `cwd` and projects the
// `currentBranch` entry into the camelCase IPC shape the renderer expects.
// Error contract:
//   - gh missing from PATH → Err("gh CLI not installed")
//   - cwd not a git repo → Err("not a git repository")
//   - any other gh failure → Err with gh's stderr
//   - "no pull requests for current branch" → Ok({ ..., pr: None })
#[tauri::command]
fn host_gh_pr_status(cwd: String) -> Result<GhPrStatusResponse, String> {
    let cwd = cwd.trim();
    if cwd.is_empty() {
        return Err("cwd is empty".to_string());
    }
    let cwd_path = Path::new(cwd);
    if !cwd_path.is_dir() {
        return Err(format!("cwd is not a directory: {cwd}"));
    }
    // codex: ga — Codex Desktop short-circuits when the workspace isn't a git
    // repo (its widget pulls a `currentBranch` first); we mirror that so the
    // renderer can keep a single error path.
    let repo_root = git_repo_root(cwd_path)?;
    if repo_root.is_none() {
        return Err("not a git repository".to_string());
    }
    // Resolve the current branch so the renderer can decide whether to show
    // the row even when `pr` is None (e.g. "no PR for <branch>" copy).
    let current_branch =
        git_stdout_optional(cwd_path, &["branch", "--show-current"]).unwrap_or(None);

    let output = match Command::new("gh")
        .arg("pr")
        .arg("status")
        .arg("--json")
        .arg("number,title,url,isDraft,mergeable,state,headRefName")
        .current_dir(cwd_path)
        .output()
    {
        Ok(output) => output,
        Err(error) => {
            // ErrorKind::NotFound is the canonical "binary missing" signal on
            // every OS we ship; surface that as the dedicated Codex copy.
            if error.kind() == std::io::ErrorKind::NotFound {
                return Err("gh CLI not installed".to_string());
            }
            return Err(format!("failed to run gh: {error}"));
        }
    };

    if !output.status.success() {
        let stderr = String::from_utf8_lossy(&output.stderr).to_string();
        let stderr_lower = stderr.to_ascii_lowercase();
        // codex: ga — gh prints "no pull requests" on stderr when the branch
        // has no PR; Codex Desktop treats that as `pullRequestStatus = null`,
        // not as an error.
        if stderr_lower.contains("no pull request")
            || stderr_lower.contains("no open pull requests")
        {
            return Ok(GhPrStatusResponse {
                current_branch,
                pr: None,
            });
        }
        if stderr_lower.contains("not a git repository") {
            return Err("not a git repository".to_string());
        }
        let detail = stderr.trim();
        return Err(if detail.is_empty() {
            format!("gh pr status exited with status {}", output.status)
        } else {
            format!("gh pr status failed: {detail}")
        });
    }

    let stdout = String::from_utf8_lossy(&output.stdout);
    let trimmed = stdout.trim();
    if trimmed.is_empty() {
        return Ok(GhPrStatusResponse {
            current_branch,
            pr: None,
        });
    }
    let payload: GhPrStatusPayload = serde_json::from_str(trimmed)
        .map_err(|error| format!("gh pr status returned invalid JSON: {error}"))?;
    let pr = payload.current_branch.map(|entry| GhPrInfo {
        number: entry.number,
        title: entry.title,
        url: entry.url,
        is_draft: entry.is_draft,
        mergeable: entry.mergeable,
        state: entry.state,
        head_ref_name: entry.head_ref_name,
    });
    Ok(GhPrStatusResponse { current_branch, pr })
}

// codex: composer-footer-branch-switcher-CamXBKfA.js — switch to an existing
// local branch. We deliberately do NOT pass `-f`: if the working tree has
// uncommitted changes that would be overwritten, git's stderr propagates up
// to the renderer so it can show the failure inline (matches Codex's "Switch
// failed: please commit or stash" toast).
#[tauri::command]
fn host_git_checkout_branch(cwd: String, branch_name: String) -> Result<(), String> {
    let cwd = cwd.trim();
    if cwd.is_empty() {
        return Err("cwd is empty".to_string());
    }
    let branch_name = branch_name.trim();
    if branch_name.is_empty() {
        return Err("branch name is empty".to_string());
    }
    if branch_name.starts_with('-') {
        return Err("branch name must not start with '-'".to_string());
    }
    if branch_name
        .chars()
        .any(|ch| ch.is_control() || ch.is_whitespace())
    {
        return Err("branch name contains unsupported whitespace".to_string());
    }
    let cwd_path = Path::new(cwd);
    let repo_root =
        git_repo_root(cwd_path)?.ok_or_else(|| format!("not a git repository: {cwd}"))?;
    let repo_path = Path::new(&repo_root);
    let output = run_git(repo_path, &["checkout", branch_name])?;
    if !output.status.success() {
        return Err(format_git_failure("failed to checkout branch", &output));
    }
    Ok(())
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
struct PatchActionRequest {
    /// "revert" → git apply --reverse；"reapply" → git apply (forward).
    /// Mirrors Codex Desktop `failure.action` field (local-conversation-thread
    /// byte ~422600).
    action: String,
    /// Unified-diff text exactly as it was streamed to the user (the same value
    /// HiCodex stores on `turn/diff/updated` notifications).
    diff: String,
    /// Working directory the patch should be applied in (passed to `git -C`).
    cwd: String,
}

#[derive(Debug, Serialize, Default)]
#[serde(rename_all = "camelCase")]
struct PatchActionResult {
    /// Echo back so the renderer dispatcher can disambiguate undo/reapply.
    action: String,
    /// Files git apply confirmed as cleanly applied. Codex `failure.result.appliedPaths`.
    applied_paths: Vec<String>,
    /// Files git left untouched. Codex `failure.result.skippedPaths`.
    skipped_paths: Vec<String>,
    /// Files git could not apply / reverse (whole-patch failure goes here).
    /// Codex `failure.result.conflictedPaths`.
    conflicted_paths: Vec<String>,
    /// Raw `git apply` stderr (mapped to Codex `failure.result.execOutput.output`).
    #[serde(skip_serializing_if = "Option::is_none")]
    exec_output: Option<PatchActionExecOutput>,
    /// `"not-git-repo"` triggers the dedicated Codex copy
    /// (`codex.unifiedDiff.revertPatchNotGitRepo` / `reapplyPatchNotGitRepo`);
    /// other strings are passed through as-is.
    #[serde(skip_serializing_if = "Option::is_none")]
    error_code: Option<String>,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
struct PatchActionExecOutput {
    output: String,
}

/// Apply or reverse a unified-diff against the current working tree.
///
/// HiCodex equivalent of the host-side patch action Codex Desktop relies on
/// for its `revertChanges` / `reapplyChanges` toolbar (the Undo/Reapply
/// buttons rendered inside the turn-diff card). The transactional model
/// matches Codex's `hS` Failure Dialog (`local-conversation-thread-BX7YNcUw.js`
/// byte ~422600): success returns every file in the diff under `appliedPaths`;
/// any whole-patch failure surfaces the entire path set under `conflictedPaths`
/// so the renderer can open the failure dialog with the conflicted heading.
/// We intentionally avoid `git apply --reject` partial mode (which would leave
/// `.rej` files lying around) — the resulting UX matches Codex's stricter
/// "all-or-nothing" behavior.
#[tauri::command]
fn host_apply_patch_action(request: PatchActionRequest) -> Result<PatchActionResult, String> {
    let reverse = match request.action.as_str() {
        "revert" => true,
        "reapply" => false,
        other => return Err(format!("invalid patch action: {other}")),
    };
    let cwd = request.cwd.trim();
    if cwd.is_empty() {
        return Err("cwd is empty".to_string());
    }
    let cwd_path = Path::new(cwd);
    if !cwd_path.is_dir() {
        return Err(format!("cwd is not a directory: {cwd}"));
    }

    let repo_root = match git_repo_root(cwd_path)? {
        Some(root) => root,
        None => {
            return Ok(PatchActionResult {
                action: request.action,
                error_code: Some("not-git-repo".to_string()),
                ..Default::default()
            });
        }
    };
    let repo_path = Path::new(&repo_root);

    let diff_paths = parse_unified_diff_paths(&request.diff);

    // Try clean apply. We deliberately omit `--reject` so a partial failure
    // doesn't leave reject files on disk; Codex's Dialog reports the whole
    // path set as conflicted in that case (no skipped vs conflicted split).
    let mut args: Vec<&str> = vec!["apply"];
    if reverse {
        args.push("--reverse");
    }
    let output = git_apply_with_stdin(repo_path, &args, &request.diff)?;

    if output.status.success() {
        return Ok(PatchActionResult {
            action: request.action,
            applied_paths: diff_paths,
            ..Default::default()
        });
    }

    let stderr_text = String::from_utf8_lossy(&output.stderr).trim().to_string();
    Ok(PatchActionResult {
        action: request.action,
        conflicted_paths: diff_paths,
        exec_output: Some(PatchActionExecOutput {
            output: if stderr_text.is_empty() {
                format!("git apply exited with status {}", output.status)
            } else {
                stderr_text
            },
        }),
        ..Default::default()
    })
}

fn git_apply_with_stdin(
    cwd: &Path,
    args: &[&str],
    diff: &str,
) -> Result<std::process::Output, String> {
    let mut child = Command::new("git")
        .arg("-C")
        .arg(cwd)
        .args(args)
        .stdin(Stdio::piped())
        .stdout(Stdio::piped())
        .stderr(Stdio::piped())
        .spawn()
        .map_err(|error| format!("failed to spawn git apply: {error}"))?;
    if let Some(mut stdin) = child.stdin.take() {
        stdin
            .write_all(diff.as_bytes())
            .map_err(|error| format!("failed to write diff to git apply stdin: {error}"))?;
    }
    child
        .wait_with_output()
        .map_err(|error| format!("git apply wait failed: {error}"))
}

/// Extract distinct destination paths from a unified diff.
///
/// We look for `diff --git a/<path> b/<path>` headers; the `b/`-side path is
/// the post-image filename which is what `git apply` actually addresses. Falls
/// back to bare `+++ b/<path>` headers when the `diff --git` line is missing
/// (rare but seen on partial protocol payloads).
fn parse_unified_diff_paths(diff: &str) -> Vec<String> {
    let mut paths: Vec<String> = Vec::new();
    let mut seen = std::collections::HashSet::new();
    let mut push_unique = |path: String, paths: &mut Vec<String>| {
        if !path.is_empty() && seen.insert(path.clone()) {
            paths.push(path);
        }
    };
    for line in diff.lines() {
        if let Some(rest) = line.strip_prefix("diff --git ") {
            if let Some(path) = diff_git_b_side_path(rest) {
                push_unique(path, &mut paths);
            }
            continue;
        }
        if let Some(rest) = line.strip_prefix("+++ ") {
            if let Some(stripped) = rest.strip_prefix("b/") {
                push_unique(stripped.to_string(), &mut paths);
            } else if rest != "/dev/null" {
                push_unique(rest.to_string(), &mut paths);
            }
        }
    }
    paths
}

/// Parse the b-side path out of a `diff --git a/<x> b/<y>` line, accounting
/// for the quoted-path form git produces when the filename contains spaces.
fn diff_git_b_side_path(rest: &str) -> Option<String> {
    // Quoted form: "a/foo bar" "b/baz qux"
    if let Some(stripped) = rest.strip_prefix('"') {
        if let Some(close_idx) = stripped.find("\" ") {
            let after_a = &stripped[close_idx + 2..];
            return Some(unquote_diff_path(after_a));
        }
    }
    // Unquoted form: a/path b/path. Find the " b/" separator; everything after
    // it is the b-side path (which may itself be quoted).
    if let Some(idx) = rest.find(" b/") {
        return Some(unquote_diff_path(&rest[idx + 3..]));
    }
    None
}

fn unquote_diff_path(value: &str) -> String {
    let trimmed = value.trim();
    if let Some(stripped) = trimmed.strip_prefix("b/") {
        return stripped.trim().to_string();
    }
    if trimmed.starts_with('"') && trimmed.ends_with('"') && trimmed.len() >= 2 {
        let inner = &trimmed[1..trimmed.len() - 1];
        return inner.strip_prefix("b/").unwrap_or(inner).to_string();
    }
    trimmed.to_string()
}

#[tauri::command]
fn host_create_pending_worktree(
    request: CreatePendingWorktreeRequest,
) -> Result<CreatePendingWorktreeResponse, String> {
    create_pending_worktree(request)
}

#[tauri::command]
fn host_create_projectless_thread_cwd(
    request: CreateProjectlessThreadCwdRequest,
) -> Result<CreateProjectlessThreadCwdResponse, String> {
    create_projectless_thread_cwd(request, SystemTime::now())
}

/// Mirror Codex Desktop's projectless working-directory generator (bundle `Iy`):
/// a thread with no workspace gets a unique `~/Documents/Codex/<YYYY-MM-DD>/<slug>/`
/// directory with `outputs/` and `work/` subdirectories, so file references resolve
/// against a real session cwd instead of $HOME (Codex never uses $HOME as cwd).
fn create_projectless_thread_cwd(
    request: CreateProjectlessThreadCwdRequest,
    now: SystemTime,
) -> Result<CreateProjectlessThreadCwdResponse, String> {
    let home = env::var_os("HOME")
        .map(PathBuf::from)
        .filter(|path| !path.as_os_str().is_empty())
        .ok_or_else(|| "HOME is not set".to_string())?;
    // codex `My`: ~/Documents/Codex is the projectless workspace root.
    let workspace_root = home.join("Documents").join("Codex");
    // codex `Fy`/`Ny`: a per-day subdirectory, YYYY-MM-DD.
    let seconds = now
        .duration_since(UNIX_EPOCH)
        .map(|duration| duration.as_secs() as i64)
        .unwrap_or(0);
    let (year, month, day) = civil_from_days(seconds.div_euclid(86_400));
    let date_dir = workspace_root.join(format!("{year:04}-{month:02}-{day:02}"));
    let slug = projectless_slug(request.directory_name.as_deref(), request.prompt.as_deref());
    std::fs::create_dir_all(&date_dir)
        .map_err(|err| format!("failed to create projectless date directory: {err}"))?;
    // codex `Iy`: first attempt is the bare slug, then `${slug}-${n+1}`, up to 100.
    for attempt in 0..100 {
        let name = if attempt == 0 {
            slug.clone()
        } else {
            format!("{slug}-{}", attempt + 1)
        };
        let cwd = date_dir.join(&name);
        if cwd.exists() {
            continue;
        }
        std::fs::create_dir(&cwd)
            .map_err(|err| format!("failed to create projectless thread directory: {err}"))?;
        // createSplitDirectories=true (codex default): deliverables in outputs/, scratch in work/.
        let output_directory = cwd.join("outputs");
        std::fs::create_dir_all(&output_directory)
            .map_err(|err| format!("failed to create outputs directory: {err}"))?;
        std::fs::create_dir_all(cwd.join("work"))
            .map_err(|err| format!("failed to create work directory: {err}"))?;
        return Ok(CreateProjectlessThreadCwdResponse {
            cwd: cwd.to_string_lossy().to_string(),
            output_directory: output_directory.to_string_lossy().to_string(),
            workspace_root: workspace_root.to_string_lossy().to_string(),
        });
    }
    Err("Unable to create a unique projectless thread directory".to_string())
}

/// codex `Py`: slug from directoryName (first 6 lowercase alphanumeric words) or
/// prompt (all such words), joined with `-` and capped at 80 chars; empty → "new-chat".
fn projectless_slug(directory_name: Option<&str>, prompt: Option<&str>) -> String {
    let (source, max_words) = match directory_name.map(str::trim).filter(|value| !value.is_empty()) {
        Some(name) => (name, Some(6usize)),
        None => (prompt.unwrap_or(""), None),
    };
    let mut words: Vec<String> = Vec::new();
    let mut current = String::new();
    for ch in source.chars() {
        if ch.is_ascii_alphanumeric() {
            current.push(ch.to_ascii_lowercase());
        } else if !current.is_empty() {
            words.push(std::mem::take(&mut current));
        }
    }
    if !current.is_empty() {
        words.push(current);
    }
    if let Some(max) = max_words {
        words.truncate(max);
    }
    let mut slug = words.join("-");
    if slug.len() > 80 {
        slug.truncate(80); // slug is ASCII (alnum + '-'), so a byte cut is a char boundary.
    }
    if slug.is_empty() {
        "new-chat".to_string()
    } else {
        slug
    }
}

#[cfg(test)]
mod projectless_slug_tests {
    use super::projectless_slug;

    #[test]
    fn directory_name_takes_first_six_words() {
        assert_eq!(
            projectless_slug(Some("My Big Report For The Q3 Board Meeting"), None),
            "my-big-report-for-the-q3",
        );
    }

    #[test]
    fn prompt_keeps_all_words_and_splits_on_non_alnum() {
        // Underscores / dots / CJK are not [a-z0-9] → word separators (matches codex Py).
        assert_eq!(
            projectless_slug(None, Some("修改一下 util/config/archery_token.txt 内容")),
            "util-config-archery-token-txt",
        );
    }

    #[test]
    fn empty_or_symbol_only_falls_back_to_new_chat() {
        assert_eq!(projectless_slug(None, Some("！！！ 。。。")), "new-chat");
        assert_eq!(projectless_slug(None, None), "new-chat");
        assert_eq!(projectless_slug(Some("   "), Some("")), "new-chat");
    }
}

/// Recover the rollout JSONL path for a given thread by scanning the
/// HiCodex sessions directory. Used as a fallback when `Thread.path` is
/// missing in client state (e.g. the thread was loaded from a stale local
/// snapshot) but the rollout file still exists on disk. The app-server's
/// `thread/resume {path}` (codex-rs:thread_processor.rs:2810
/// `read_thread_by_rollout_path`) bypasses the in-memory + `session_index`
/// lookup that is producing "thread not found".
///
/// Returns `Ok(None)` (rather than `Err`) when the file is not found so the
/// caller can decide whether to fall through to a friendlier error.
#[tauri::command]
fn host_find_rollout_for_thread(
    codex_home: Option<String>,
    thread_id: String,
) -> Result<Option<String>, String> {
    let id = thread_id.trim();
    if id.is_empty() {
        return Ok(None);
    }
    let sessions_root = match codex_home
        .as_deref()
        .map(str::trim)
        .filter(|s| !s.is_empty())
    {
        Some(home) => Path::new(home).join("sessions"),
        None => match env::var_os("HOME") {
            Some(home) => {
                Path::new(&home).join("Library/Application Support/HiCodex/codex-home/sessions")
            }
            None => return Ok(None),
        },
    };
    if !sessions_root.is_dir() {
        return Ok(None);
    }
    find_rollout_recursive(&sessions_root, id, 4).map_err(|err| err.to_string())
}

fn find_rollout_recursive(
    dir: &Path,
    thread_id: &str,
    max_depth: usize,
) -> std::io::Result<Option<String>> {
    if max_depth == 0 {
        return Ok(None);
    }
    let mut dirs: Vec<std::path::PathBuf> = Vec::new();
    for entry in fs::read_dir(dir)? {
        let entry = entry?;
        let file_type = entry.file_type()?;
        if file_type.is_dir() {
            dirs.push(entry.path());
            continue;
        }
        if !file_type.is_file() {
            continue;
        }
        let path = entry.path();
        let Some(name) = path.file_name().and_then(|v| v.to_str()) else {
            continue;
        };
        // `rollout-<iso-date>-<thread-id>.jsonl`
        if name.starts_with("rollout-") && name.contains(thread_id) && name.ends_with(".jsonl") {
            return Ok(Some(path.to_string_lossy().to_string()));
        }
    }
    for sub in dirs {
        if let Some(found) = find_rollout_recursive(&sub, thread_id, max_depth - 1)? {
            return Ok(Some(found));
        }
    }
    Ok(None)
}

fn read_host_git_status(cwd: &str) -> Result<HostGitStatus, String> {
    let cwd = cwd.trim();
    if cwd.is_empty() {
        return Err("cwd is empty".to_string());
    }

    let cwd_path = Path::new(cwd);
    let Some(repo_root) = git_repo_root(cwd_path)? else {
        return Ok(non_git_status(cwd));
    };
    let repo_path = Path::new(&repo_root);
    let branch = git_stdout_optional(repo_path, &["branch", "--show-current"])?;
    let sha = git_stdout_optional(repo_path, &["rev-parse", "HEAD"])?;
    let upstream = git_stdout_optional(
        repo_path,
        &[
            "rev-parse",
            "--abbrev-ref",
            "--symbolic-full-name",
            "@{upstream}",
        ],
    )?;
    let (ahead, behind) = if upstream.is_some() {
        let counts = git_stdout_optional(
            repo_path,
            &["rev-list", "--left-right", "--count", "HEAD...@{upstream}"],
        )?
        .unwrap_or_default();
        parse_ahead_behind_counts(&counts)
    } else {
        (0, 0)
    };
    let changed_files = read_changed_git_files(repo_path)?;
    let diff = read_git_diff(repo_path, sha.is_some())?;
    let has_diff = !changed_files.is_empty() || !diff.trim().is_empty();
    // Compute before moving `repo_root` into the struct (repo_path borrows it).
    let is_worktree = git_is_linked_worktree(repo_path);

    Ok(HostGitStatus {
        cwd: cwd.to_string(),
        repo_root: Some(repo_root),
        branch,
        sha,
        upstream,
        ahead,
        behind,
        changed_files,
        has_diff,
        diff,
        is_worktree,
    })
}

fn create_pending_worktree(
    request: CreatePendingWorktreeRequest,
) -> Result<CreatePendingWorktreeResponse, String> {
    let cwd = request.cwd.trim();
    if cwd.is_empty() {
        return Err("cwd is empty".to_string());
    }
    let repo_root =
        git_repo_root(Path::new(cwd))?.ok_or_else(|| format!("not a git repository: {cwd}"))?;
    let repo_path = PathBuf::from(&repo_root);
    let base_ref = normalize_base_ref(request.base_ref.as_deref())?;
    let commit_ref = format!("{base_ref}^{{commit}}");
    let base_sha = git_stdout_required(
        &repo_path,
        &["rev-parse", "--verify", &commit_ref],
        "failed to resolve worktree base ref",
    )?;
    let repo_name = repo_path
        .file_name()
        .and_then(|value| value.to_str())
        .unwrap_or("repo");
    let default_name = default_pending_worktree_name(repo_name, SystemTime::now());
    let base_name = request
        .branch_name
        .as_deref()
        .map(str::trim)
        .filter(|value| !value.is_empty())
        .map(|value| sanitize_pending_worktree_name(value, &default_name))
        .unwrap_or(default_name);
    let (worktree_path, branch_name) = unique_pending_worktree_target(&repo_path, &base_name)?;

    let output = Command::new("git")
        .arg("-C")
        .arg(&repo_path)
        .args(["worktree", "add", "-b"])
        .arg(&branch_name)
        .arg(&worktree_path)
        .arg(&base_ref)
        .output()
        .map_err(|error| format!("failed to run git worktree add: {error}"))?;
    if !output.status.success() {
        return Err(format_git_failure(
            "failed to create pending worktree",
            &output,
        ));
    }

    Ok(CreatePendingWorktreeResponse {
        repo_root,
        path: worktree_path.to_string_lossy().to_string(),
        branch_name,
        base_ref,
        base_sha,
    })
}

fn non_git_status(cwd: &str) -> HostGitStatus {
    HostGitStatus {
        cwd: cwd.to_string(),
        repo_root: None,
        branch: None,
        sha: None,
        upstream: None,
        ahead: 0,
        behind: 0,
        changed_files: Vec::new(),
        has_diff: false,
        diff: String::new(),
        is_worktree: false,
    }
}

// codex thread-env-icon (worktree env, tooltip "running in a local git worktree") —
// detect whether `repo_path` is a LINKED git worktree (created via `git worktree
// add`). A linked worktree's git dir lives under the main repo's
// `.git/worktrees/<name>`, whereas the main working tree's git dir is the repo's
// own `.git`; `--absolute-git-dir` resolves the per-worktree path so we can tell.
fn git_is_linked_worktree(repo_path: &Path) -> bool {
    run_git(repo_path, &["rev-parse", "--absolute-git-dir"])
        .ok()
        .filter(|output| output.status.success())
        .map(|output| command_stdout(&output))
        .map(|git_dir| {
            git_dir.contains("/.git/worktrees/") || git_dir.contains("\\.git\\worktrees\\")
        })
        .unwrap_or(false)
}

fn git_repo_root(cwd: &Path) -> Result<Option<String>, String> {
    let output = run_git(cwd, &["rev-parse", "--show-toplevel"])?;
    if !output.status.success() {
        return Ok(None);
    }
    let repo_root = command_stdout(&output);
    Ok((!repo_root.is_empty()).then_some(repo_root))
}

fn read_changed_git_files(repo_path: &Path) -> Result<Vec<HostGitChangedFile>, String> {
    let output = run_git(
        repo_path,
        &["status", "--porcelain=v1", "-z", "--untracked-files=all"],
    )?;
    if !output.status.success() {
        return Err(format_git_failure("failed to read git status", &output));
    }
    Ok(parse_git_status_porcelain_z(&output.stdout))
}

fn read_git_diff(repo_path: &Path, has_head: bool) -> Result<String, String> {
    let output = if has_head {
        run_git(
            repo_path,
            &["diff", "--no-ext-diff", "--no-color", "HEAD", "--"],
        )?
    } else {
        run_git(repo_path, &["diff", "--no-ext-diff", "--no-color", "--"])?
    };
    if output.status.success() {
        return Ok(String::from_utf8_lossy(&output.stdout).to_string());
    }
    Err(format_git_failure("failed to read git diff", &output))
}

fn run_git(cwd: &Path, args: &[&str]) -> Result<std::process::Output, String> {
    Command::new("git")
        .arg("-C")
        .arg(cwd)
        .args(args)
        .output()
        .map_err(|error| format!("failed to run git: {error}"))
}

fn git_stdout_optional(cwd: &Path, args: &[&str]) -> Result<Option<String>, String> {
    let output = run_git(cwd, args)?;
    if !output.status.success() {
        return Ok(None);
    }
    let text = command_stdout(&output);
    Ok((!text.is_empty()).then_some(text))
}

fn git_stdout_required(cwd: &Path, args: &[&str], context: &str) -> Result<String, String> {
    let output = run_git(cwd, args)?;
    if output.status.success() {
        let text = command_stdout(&output);
        if !text.is_empty() {
            return Ok(text);
        }
    }
    Err(format_git_failure(context, &output))
}

fn command_stdout(output: &std::process::Output) -> String {
    String::from_utf8_lossy(&output.stdout).trim().to_string()
}

fn format_git_failure(context: &str, output: &std::process::Output) -> String {
    let stderr = String::from_utf8_lossy(&output.stderr).trim().to_string();
    let stdout = String::from_utf8_lossy(&output.stdout).trim().to_string();
    let detail = if stderr.is_empty() { stdout } else { stderr };
    if detail.is_empty() {
        format!("{context}: git exited with status {}", output.status)
    } else {
        format!("{context}: {detail}")
    }
}

fn parse_git_status_porcelain_z(output: &[u8]) -> Vec<HostGitChangedFile> {
    let entries = output
        .split(|byte| *byte == 0)
        .filter(|entry| !entry.is_empty())
        .collect::<Vec<_>>();
    let mut files = Vec::new();
    let mut index = 0;
    while index < entries.len() {
        let entry = entries[index];
        if entry.len() < 4 {
            index += 1;
            continue;
        }
        let status_raw = String::from_utf8_lossy(&entry[..2]).to_string();
        let status = status_raw.trim().to_string();
        let path_start = if entry.get(2) == Some(&b' ') { 3 } else { 2 };
        let path = String::from_utf8_lossy(&entry[path_start..]).to_string();
        let is_rename_or_copy = status_raw
            .as_bytes()
            .iter()
            .any(|byte| matches!(*byte, b'R' | b'C'));
        let old_path = if is_rename_or_copy && index + 1 < entries.len() {
            index += 1;
            Some(String::from_utf8_lossy(entries[index]).to_string())
        } else {
            None
        };
        files.push(HostGitChangedFile {
            status,
            path,
            old_path,
        });
        index += 1;
    }
    files
}

fn parse_ahead_behind_counts(value: &str) -> (u32, u32) {
    let mut parts = value.split_whitespace();
    let ahead = parts
        .next()
        .and_then(|part| part.parse::<u32>().ok())
        .unwrap_or(0);
    let behind = parts
        .next()
        .and_then(|part| part.parse::<u32>().ok())
        .unwrap_or(0);
    (ahead, behind)
}

fn normalize_base_ref(value: Option<&str>) -> Result<String, String> {
    let base_ref = value
        .map(str::trim)
        .filter(|value| !value.is_empty())
        .unwrap_or("HEAD");
    if base_ref.len() > 240 {
        return Err("baseRef is too long".to_string());
    }
    if base_ref.starts_with('-') {
        return Err("baseRef must not start with '-'".to_string());
    }
    if base_ref
        .chars()
        .any(|ch| ch.is_control() || ch.is_whitespace())
    {
        return Err("baseRef contains unsupported whitespace or control characters".to_string());
    }
    Ok(base_ref.to_string())
}

fn unique_pending_worktree_target(
    repo_path: &Path,
    base_name: &str,
) -> Result<(PathBuf, String), String> {
    let parent = repo_path
        .parent()
        .ok_or_else(|| "repository root has no parent directory".to_string())?;
    for attempt in 0..1000 {
        let candidate = if attempt == 0 {
            base_name.to_string()
        } else {
            format!("{base_name}-{}", attempt + 1)
        };
        let path = parent.join(&candidate);
        if path.exists() || git_branch_exists(repo_path, &candidate)? {
            continue;
        }
        return Ok((path, candidate));
    }
    Err("failed to allocate a unique pending worktree name".to_string())
}

fn git_branch_exists(repo_path: &Path, branch_name: &str) -> Result<bool, String> {
    let branch_ref = format!("refs/heads/{branch_name}");
    let output = run_git(repo_path, &["show-ref", "--verify", "--quiet", &branch_ref])?;
    Ok(output.status.success())
}

fn default_pending_worktree_name(repo_name: &str, now: SystemTime) -> String {
    let repo = sanitize_pending_worktree_name(repo_name, "repo");
    format!("{repo}-worktree-{}", format_worktree_timestamp(now))
}

fn sanitize_pending_worktree_name(value: &str, fallback: &str) -> String {
    let mut sanitized = String::new();
    let mut last_dash = false;
    for ch in value.trim().chars() {
        let mapped = if ch.is_ascii_alphanumeric() || matches!(ch, '_' | '.') {
            ch
        } else if ch == '-' {
            '-'
        } else {
            '-'
        };
        if mapped == '-' {
            if !last_dash {
                sanitized.push('-');
            }
            last_dash = true;
        } else {
            sanitized.push(mapped);
            last_dash = false;
        }
        if sanitized.len() >= 96 {
            break;
        }
    }
    while sanitized.contains("..") {
        sanitized = sanitized.replace("..", ".");
    }
    let sanitized = sanitized
        .trim_matches(|ch| matches!(ch, '-' | '_' | '.'))
        .to_string();
    let mut sanitized = if sanitized.is_empty() {
        fallback.to_string()
    } else {
        sanitized
    };
    if sanitized.to_ascii_lowercase().ends_with(".lock") {
        sanitized.push_str("-branch");
    }
    sanitized
}

fn format_worktree_timestamp(time: SystemTime) -> String {
    let seconds = time
        .duration_since(UNIX_EPOCH)
        .map(|duration| duration.as_secs() as i64)
        .unwrap_or(0);
    let days = seconds.div_euclid(86_400);
    let seconds_of_day = seconds.rem_euclid(86_400);
    let (year, month, day) = civil_from_days(days);
    let hour = seconds_of_day / 3_600;
    let minute = (seconds_of_day % 3_600) / 60;
    let second = seconds_of_day % 60;
    format!("{year:04}{month:02}{day:02}-{hour:02}{minute:02}{second:02}")
}

fn civil_from_days(days_since_epoch: i64) -> (i64, i64, i64) {
    let z = days_since_epoch + 719_468;
    let era = if z >= 0 { z } else { z - 146_096 } / 146_097;
    let doe = z - era * 146_097;
    let yoe = (doe - doe / 1_460 + doe / 36_524 - doe / 146_096) / 365;
    let y = yoe + era * 400;
    let doy = doe - (365 * yoe + yoe / 4 - yoe / 100);
    let mp = (5 * doy + 2) / 153;
    let day = doy - (153 * mp + 2) / 5 + 1;
    let month = mp + if mp < 10 { 3 } else { -9 };
    let year = y + if month <= 2 { 1 } else { 0 };
    (year, month, day)
}

#[cfg(test)]
mod find_rollout_tests {
    use super::find_rollout_recursive;
    use std::fs;
    use std::io::Write;
    use std::path::PathBuf;
    use std::time::{SystemTime, UNIX_EPOCH};

    fn temp_dir() -> PathBuf {
        let nanos = SystemTime::now()
            .duration_since(UNIX_EPOCH)
            .map(|value| value.as_nanos())
            .unwrap_or_default();
        let base = std::env::temp_dir().join(format!(
            "hicodex-find-rollout-{}-{nanos}",
            std::process::id()
        ));
        let _ = fs::remove_dir_all(&base);
        fs::create_dir_all(&base).unwrap();
        base
    }

    fn touch(path: &PathBuf) {
        if let Some(parent) = path.parent() {
            fs::create_dir_all(parent).unwrap();
        }
        let mut file = fs::File::create(path).unwrap();
        writeln!(file, "{{}}").unwrap();
    }

    #[test]
    fn locates_rollout_by_thread_id_through_year_month_day_layout() {
        let root = temp_dir();
        let target = root
            .join("2026/05/13")
            .join("rollout-2026-05-13T06-43-27-019e1e5c-0434-7623-9622-bba23d1dc878.jsonl");
        let unrelated = root
            .join("2026/05/13")
            .join("rollout-2026-05-13T06-44-00-aaaaaaaa-0000-0000-0000-000000000000.jsonl");
        touch(&target);
        touch(&unrelated);

        let found =
            find_rollout_recursive(&root, "019e1e5c-0434-7623-9622-bba23d1dc878", 4).unwrap();
        assert_eq!(found, Some(target.to_string_lossy().to_string()));
    }

    #[test]
    fn returns_none_when_no_file_matches() {
        let root = temp_dir();
        let unrelated = root
            .join("2026/05/13")
            .join("rollout-2026-05-13T06-44-00-xyz.jsonl");
        touch(&unrelated);
        let found = find_rollout_recursive(&root, "thread-missing", 4).unwrap();
        assert!(found.is_none());
    }

    #[test]
    fn respects_max_depth_to_avoid_runaway_traversal() {
        let root = temp_dir();
        let deep = root.join("a/b/c/d/e/rollout-2026-05-13T06-44-00-deepid.jsonl");
        touch(&deep);
        // max_depth = 2 stops before reaching the deep file (a/b only).
        assert!(find_rollout_recursive(&root, "deepid", 2)
            .unwrap()
            .is_none());
        // max_depth = 8 reaches it.
        assert_eq!(
            find_rollout_recursive(&root, "deepid", 8).unwrap(),
            Some(deep.to_string_lossy().to_string()),
        );
    }
}

#[tauri::command]
fn host_read_thread_tool_history(
    state: State<'_, AppState>,
    codex_home: Option<String>,
    thread_id: String,
    thread_path: Option<String>,
) -> Result<ThreadToolHistory, String> {
    state
        .host
        .read_thread_tool_history(codex_home, thread_id, thread_path)
        .map_err(|error| error.to_string())
}

#[tauri::command]
fn host_generate_image(request: ImageGenerationRequest) -> Result<Value, String> {
    let endpoint = image_generations_endpoint(&request.base_url)?;
    let body = serde_json::to_vec(&request.payload)
        .map_err(|error| format!("failed to serialize image request: {error}"))?;
    let header_path = write_image_request_headers(request.api_key.as_deref())?;
    let header_arg = format!("@{}", header_path.to_string_lossy());
    let mut command = Command::new("curl");
    command
        .args([
            "--fail-with-body",
            "--silent",
            "--show-error",
            "--connect-timeout",
            "30",
            "--max-time",
            "180",
            "--request",
            "POST",
            "--header",
            &header_arg,
            "--data-binary",
            "@-",
            &endpoint,
        ])
        .stdin(Stdio::piped())
        .stdout(Stdio::piped())
        .stderr(Stdio::piped());

    let mut child = match command.spawn() {
        Ok(child) => child,
        Err(error) => {
            let _ = fs::remove_file(&header_path);
            return Err(format!("failed to start image request: {error}"));
        }
    };
    let mut stdin = child.stdin.take().ok_or_else(|| {
        let _ = fs::remove_file(&header_path);
        "failed to open image request stdin".to_string()
    })?;
    if let Err(error) = stdin.write_all(&body) {
        let _ = fs::remove_file(&header_path);
        return Err(format!("failed to write image request body: {error}"));
    }
    drop(stdin);

    let output = match child.wait_with_output() {
        Ok(output) => output,
        Err(error) => {
            let _ = fs::remove_file(&header_path);
            return Err(format!("failed to wait for image request: {error}"));
        }
    };
    let _ = fs::remove_file(&header_path);
    if !output.status.success() {
        let stderr = String::from_utf8_lossy(&output.stderr).trim().to_string();
        let stdout = String::from_utf8_lossy(&output.stdout).trim().to_string();
        let detail = [stderr, stdout]
            .into_iter()
            .filter(|value| !value.is_empty())
            .collect::<Vec<_>>()
            .join(": ");
        return Err(if detail.is_empty() {
            format!("image generation backend returned {}", output.status)
        } else {
            detail
        });
    }

    let response = serde_json::from_slice(&output.stdout)
        .map_err(|error| format!("image generation backend returned invalid JSON: {error}"))?;
    persist_image_generation_response(
        response,
        request.codex_home.as_deref(),
        request.thread_id.as_deref(),
    )
}

fn write_image_request_headers(api_key: Option<&str>) -> Result<std::path::PathBuf, String> {
    let mut content = String::from("Content-Type: application/json\n");
    if let Some(token) = api_key.map(str::trim).filter(|value| !value.is_empty()) {
        content.push_str("Authorization: Bearer ");
        content.push_str(token);
        content.push('\n');
    }
    let path = temp_file_path("hicodex-image-headers", "txt");
    fs::write(&path, content)
        .map_err(|error| format!("failed to write image request headers: {error}"))?;
    Ok(path)
}

fn temp_file_path(prefix: &str, extension: &str) -> std::path::PathBuf {
    let nanos = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|value| value.as_nanos())
        .unwrap_or_default();
    env::temp_dir().join(format!(
        "{prefix}-{}-{nanos}.{extension}",
        std::process::id()
    ))
}

fn image_generations_endpoint(base_url: &str) -> Result<String, String> {
    let trimmed = base_url.trim().trim_end_matches('/');
    if trimmed.is_empty() {
        return Err("image generation base URL is empty".to_string());
    }
    if !(trimmed.starts_with("http://") || trimmed.starts_with("https://")) {
        return Err("image generation base URL must start with http:// or https://".to_string());
    }
    Ok(format!("{trimmed}/images/generations"))
}

fn persist_image_generation_response(
    mut response: Value,
    codex_home: Option<&str>,
    thread_id: Option<&str>,
) -> Result<Value, String> {
    let Some(codex_home) = codex_home.map(str::trim).filter(|value| !value.is_empty()) else {
        return Ok(response);
    };
    let Some(data) = response.get_mut("data").and_then(Value::as_array_mut) else {
        return Ok(response);
    };
    let Some(first) = data.first_mut().and_then(Value::as_object_mut) else {
        return Ok(response);
    };
    let image_b64 = first
        .get("b64_json")
        .or_else(|| first.get("b64Json"))
        .and_then(Value::as_str)
        .map(str::trim)
        .filter(|value| !value.is_empty());
    let Some(image_b64) = image_b64 else {
        return Ok(response);
    };
    let image_bytes = general_purpose::STANDARD
        .decode(image_b64)
        .map_err(|error| format!("image generation backend returned invalid b64_json: {error}"))?;
    let output_dir = image_generation_output_dir(codex_home, thread_id);
    fs::create_dir_all(&output_dir)
        .map_err(|error| format!("failed to create image output directory: {error}"))?;
    let extension = image_generation_response_extension(first).unwrap_or("png");
    let output_path = output_dir.join(format!(
        "ig_{}.{}",
        image_content_hash(&image_bytes),
        extension
    ));
    if !output_path.exists() {
        fs::write(&output_path, &image_bytes)
            .map_err(|error| format!("failed to save generated image: {error}"))?;
    }
    first.insert(
        "url".to_string(),
        Value::String(file_url_from_path(&output_path)),
    );
    Ok(response)
}

fn image_generation_output_dir(codex_home: &str, thread_id: Option<&str>) -> PathBuf {
    let thread_dir = thread_id
        .map(sanitize_image_generation_path_segment)
        .filter(|value| !value.is_empty())
        .unwrap_or_else(|| "unthreaded".to_string());
    Path::new(codex_home)
        .join("generated_images")
        .join(thread_dir)
}

fn sanitize_image_generation_path_segment(value: &str) -> String {
    let mut sanitized = String::new();
    for ch in value.trim().chars().take(120) {
        if ch.is_ascii_alphanumeric() || matches!(ch, '-' | '_' | '.') {
            sanitized.push(ch);
        } else {
            sanitized.push('_');
        }
    }
    sanitized.trim_matches('.').to_string()
}

fn image_content_hash(bytes: &[u8]) -> String {
    let mut hash = 0xcbf2_9ce4_8422_2325_u64;
    for byte in bytes {
        hash ^= u64::from(*byte);
        hash = hash.wrapping_mul(0x0000_0100_0000_01b3);
    }
    format!("{hash:016x}")
}

fn image_generation_response_extension(
    image: &serde_json::Map<String, Value>,
) -> Option<&'static str> {
    [
        "mimeType",
        "mime_type",
        "contentType",
        "content_type",
        "mime",
    ]
    .into_iter()
    .filter_map(|key| image.get(key).and_then(Value::as_str))
    .find_map(image_mime_extension)
}

fn image_mime_extension(value: &str) -> Option<&'static str> {
    let mime = value.split(';').next()?.trim().to_ascii_lowercase();
    match mime.as_str() {
        "image/avif" => Some("avif"),
        "image/bmp" => Some("bmp"),
        "image/gif" => Some("gif"),
        "image/heic" => Some("heic"),
        "image/heif" => Some("heif"),
        "image/jpeg" | "image/jpg" => Some("jpg"),
        "image/png" => Some("png"),
        "image/svg+xml" => Some("svg"),
        "image/tiff" => Some("tiff"),
        "image/webp" => Some("webp"),
        _ => None,
    }
}

fn file_url_from_path(path: &Path) -> String {
    let path = path.to_string_lossy();
    let mut url = String::from("file://");
    for byte in path.as_bytes() {
        match *byte {
            b'A'..=b'Z' | b'a'..=b'z' | b'0'..=b'9' | b'-' | b'.' | b'_' | b'~' | b'/' => {
                url.push(char::from(*byte));
            }
            _ => {
                url.push_str(&format!("%{byte:02X}"));
            }
        }
    }
    url
}

#[cfg(test)]
mod tests {
    use super::{
        browser_display_url, browser_extension_backend_info_result,
        browser_iab_accessibility_snapshot_script, browser_iab_dom_box_model_result_from_payload,
        browser_iab_dom_content_quads_result_from_payload, browser_iab_dom_document_result,
        browser_iab_dom_frame_owner_result_from_payload, browser_iab_dom_frame_owner_script,
        browser_iab_dom_node_for_location_result_from_payload,
        browser_iab_dom_node_for_location_script, browser_iab_dom_node_result_from_payload,
        browser_iab_dom_query_selector_result_from_payload,
        browser_iab_dom_scroll_into_view_script, browser_iab_eval_callback_script,
        browser_iab_frame_tree_result, browser_iab_info_result,
        browser_iab_is_playwright_aria_snapshot_expression,
        browser_iab_is_playwright_injection_check_expression,
        browser_iab_is_playwright_injection_install_expression,
        browser_iab_is_same_document_navigation, browser_iab_layout_metrics_from_value,
        browser_iab_logical_window_region, browser_iab_minimal_playwright_injection_script,
        browser_iab_navigation_events, browser_iab_parse_eval_callback_result,
        browser_iab_playwright_evaluate_command_result, browser_iab_remote_object_from_value,
        browser_iab_rewrite_playwright_async_wrapper, browser_iab_runtime_evaluate_result,
        browser_iab_runtime_evaluate_result_from_payload, browser_iab_runtime_evaluate_script,
        browser_iab_same_document_navigation_events, browser_iab_screenshot_format_and_extension,
        browser_iab_screenshot_region, browser_iab_synthesize_scroll_gesture_script,
        browser_iab_tab_id_from_target_id, browser_iab_tabs_from_store,
        default_pending_worktree_name, file_url_from_path, host_generate_image,
        image_generations_endpoint, is_supported_native_shell_url, normalized_browser_url,
        parse_ahead_behind_counts, parse_git_status_porcelain_z, persist_image_generation_response,
        sanitize_pending_worktree_name, BrowserIabScreenshotRegion, BrowserRuntimeStore,
        BrowserRuntimeTab, HostGitChangedFile, ImageGenerationRequest,
    };
    use serde_json::{json, Value};
    use std::fs;
    use std::io::{Read, Write};
    use std::net::TcpListener;
    use std::path::PathBuf;
    use std::thread;
    use std::time::Duration;
    use std::time::{SystemTime, UNIX_EPOCH};

    fn temp_dir() -> PathBuf {
        let nanos = SystemTime::now()
            .duration_since(UNIX_EPOCH)
            .map(|value| value.as_nanos())
            .unwrap_or_default();
        let base =
            std::env::temp_dir().join(format!("hicodex-image-test-{}-{nanos}", std::process::id()));
        let _ = fs::remove_dir_all(&base);
        fs::create_dir_all(&base).unwrap();
        base
    }

    #[test]
    fn builds_image_generation_endpoint_from_base_url() {
        assert_eq!(
            image_generations_endpoint(" http://127.0.0.1:8890/v1/// ").unwrap(),
            "http://127.0.0.1:8890/v1/images/generations"
        );
    }

    #[test]
    fn rejects_non_http_image_generation_base_url() {
        assert!(image_generations_endpoint("file:///tmp/socket").is_err());
    }

    #[test]
    fn normalizes_browser_urls_to_http_or_https() {
        assert_eq!(
            normalized_browser_url("example.com/path").unwrap(),
            "https://example.com/path"
        );
        assert_eq!(
            normalized_browser_url("localhost:5173").unwrap(),
            "http://localhost:5173"
        );
        assert_eq!(
            normalized_browser_url("127.0.0.1:5173").unwrap(),
            "http://127.0.0.1:5173"
        );
        assert_eq!(
            normalized_browser_url("[::1]:5173").unwrap(),
            "http://[::1]:5173"
        );
        assert_eq!(
            normalized_browser_url("http://example.com").unwrap(),
            "http://example.com"
        );
        assert_eq!(
            normalized_browser_url("file:///tmp/index.html").unwrap(),
            "file:///tmp/index.html"
        );
        assert!(normalized_browser_url("https://example.com/a b").is_err());
    }

    #[test]
    fn projects_browser_display_url() {
        assert_eq!(browser_display_url("https://example.com/"), "example.com");
        assert_eq!(
            browser_display_url("http://example.com/path"),
            "example.com/path"
        );
    }

    #[test]
    fn browser_iab_info_echoes_session_metadata() {
        let info = browser_iab_info_result(&json!({
            "session_id": "session-1",
            "turn_id": "turn-1",
        }));

        assert_eq!(info["type"], "iab");
        assert_eq!(info["name"], "Forge Browser");
        assert_eq!(info["metadata"]["codexSessionId"], "session-1");
        assert_eq!(info["metadata"]["codexAppBuildFlavor"], "prod");
        assert_eq!(info["metadata"]["hicodexIabMode"], "probe");
        assert_eq!(info["capabilities"]["browser"].as_array().unwrap().len(), 0);
        assert_eq!(info["capabilities"]["tab"].as_array().unwrap().len(), 0);
    }

    #[test]
    fn browser_extension_backend_info_identifies_host_compatible_spike() {
        let info = browser_extension_backend_info_result(&json!({
            "session_id": "session-1",
        }));

        assert_eq!(info["type"], "extension");
        assert_eq!(info["name"], "Forge Browser Extension Spike");
        assert_eq!(
            info["metadata"]["extensionId"],
            "hicodex-host-compatible-extension"
        );
        assert_eq!(info["metadata"]["source"], "hicodex-host-compatible-spike");
        assert_eq!(
            info["metadata"]["hicodexExtensionBackendMode"],
            "host-compatible-spike"
        );
        assert!(info["metadata"]["codexSessionId"].is_null());
        assert!(info["metadata"]["hicodexIabMode"].is_null());
        assert_eq!(info["capabilities"]["browser"].as_array().unwrap().len(), 0);
        assert_eq!(info["capabilities"]["tab"].as_array().unwrap().len(), 0);
    }

    #[test]
    fn browser_iab_tabs_use_numeric_ids_and_active_marker() {
        let store = BrowserRuntimeStore {
            active_tab_id: Some("active-9".to_string()),
            tabs: vec![
                BrowserRuntimeTab {
                    tab_id: "active-7".to_string(),
                    title: "Closed".to_string(),
                    url: "https://closed.example".to_string(),
                    display_url: "closed.example".to_string(),
                    open: false,
                    is_agent_working: false,
                },
                BrowserRuntimeTab {
                    tab_id: "active-9".to_string(),
                    title: "Docs".to_string(),
                    url: "https://platform.openai.com/docs".to_string(),
                    display_url: "platform.openai.com/docs".to_string(),
                    open: true,
                    is_agent_working: false,
                },
            ],
        };

        let tabs = browser_iab_tabs_from_store(&store);

        assert_eq!(tabs.len(), 1);
        assert_eq!(tabs[0]["id"], 9);
        assert_eq!(tabs[0]["active"], true);
        assert_eq!(tabs[0]["title"], "Docs");
        assert_eq!(tabs[0]["url"], "https://platform.openai.com/docs");
    }

    #[test]
    fn browser_iab_cdp_helpers_project_basic_navigation_state() {
        let tab = BrowserRuntimeTab {
            tab_id: "active-9".to_string(),
            title: "Docs".to_string(),
            url: "https://platform.openai.com/docs".to_string(),
            display_url: "platform.openai.com/docs".to_string(),
            open: true,
            is_agent_working: false,
        };

        let frame_tree = browser_iab_frame_tree_result(2, &tab);
        assert_eq!(frame_tree["frameTree"]["frame"]["id"], "hicodex-frame-2");
        assert_eq!(frame_tree["frameTree"]["frame"]["url"], tab.url);

        let document_state = browser_iab_runtime_evaluate_result(
            &tab,
            "({ href: window.location.href, readyState: document.readyState })",
            None,
        );
        assert_eq!(document_state["result"]["value"]["href"], tab.url);
        assert_eq!(document_state["result"]["value"]["readyState"], "complete");

        let events = browser_iab_navigation_events(2, &tab.url);
        assert_eq!(events.len(), 4);
        assert_eq!(events[0]["method"], "onCDPEvent");
        assert_eq!(events[0]["params"]["method"], "Page.frameStartedLoading");
        assert_eq!(events[3]["params"]["method"], "Page.loadEventFired");
        assert!(browser_iab_is_same_document_navigation(
            "https://platform.openai.com/docs#old",
            "https://platform.openai.com/docs#new",
        ));
        assert!(!browser_iab_is_same_document_navigation(&tab.url, &tab.url));
        let same_document_events =
            browser_iab_same_document_navigation_events(2, "https://platform.openai.com/docs#new");
        assert_eq!(same_document_events.len(), 1);
        assert_eq!(
            same_document_events[0]["params"]["method"],
            "Page.navigatedWithinDocument"
        );
        assert_eq!(
            browser_iab_tab_id_from_target_id("hicodex-target-2"),
            Some(2)
        );
    }

    #[test]
    fn browser_iab_cdp_helpers_project_eval_and_layout_values() {
        let eval_success = browser_iab_runtime_evaluate_result_from_payload(json!({
            "ok": true,
            "remoteObject": {
                "type": "object",
                "value": {
                    "title": "Docs",
                },
            },
        }));
        assert_eq!(eval_success["result"]["value"]["title"], "Docs");
        assert_eq!(
            browser_iab_playwright_evaluate_command_result(eval_success)
                .unwrap()
                .get("value")
                .and_then(|value| value.get("title"))
                .and_then(Value::as_str),
            Some("Docs")
        );

        let eval_failure = browser_iab_runtime_evaluate_result_from_payload(json!({
            "ok": false,
            "text": "boom",
            "description": "stack",
        }));
        assert_eq!(eval_failure["exceptionDetails"]["text"], "boom");
        assert!(browser_iab_playwright_evaluate_command_result(eval_failure).is_err());

        assert_eq!(
            browser_iab_remote_object_from_value(&json!(["a"]))["subtype"],
            "array"
        );
        let eval_script = browser_iab_runtime_evaluate_script("Promise.resolve(1)");
        assert!(!eval_script.contains("(async ()"));
        assert!(eval_script.contains("cannot await Promise"));
        assert!(browser_iab_runtime_evaluate_script(
            "const arg = undefined;\nconst __playwrightEvaluate = (() => document.title);\nreturn await __playwrightEvaluate(arg);",
        )
        .contains("new Function"));
        let readonly_wrapper = r#"(() => {
  const runUserScript = async () => {
    return await (async function () {
      "use strict";
      const arg = undefined;
      const __playwrightEvaluate = (() => window.location.href);
      return await __playwrightEvaluate(arg);
      return window.location.href;
    }).call(windowObject);
  };

  return runUserScript().then(serializeResult);
})()"#;
        let rewritten_readonly_wrapper =
            browser_iab_rewrite_playwright_async_wrapper(readonly_wrapper)
                .expect("readonly evaluate wrapper should be rewritten");
        assert!(rewritten_readonly_wrapper.contains("const runUserScript = () => {"));
        assert!(rewritten_readonly_wrapper.contains("return (function () {"));
        assert!(rewritten_readonly_wrapper.contains("return __playwrightEvaluate(arg);"));
        assert!(rewritten_readonly_wrapper.contains("return serializeResult(runUserScript());"));
        assert!(!rewritten_readonly_wrapper.contains("runUserScript().then"));
        assert!(
            browser_iab_eval_callback_script("(() => ({ ok: true }))()").contains("JSON.stringify")
        );
        assert_eq!(
            browser_iab_parse_eval_callback_result("").unwrap(),
            serde_json::Value::Null
        );
        assert_eq!(
            browser_iab_parse_eval_callback_result(r#""{\"ok\":true,\"value\":7}""#).unwrap()
                ["value"],
            7
        );
        assert!(browser_iab_is_playwright_aria_snapshot_expression(
            "window.__codexPlaywrightInjected.ariaSnapshot(document.body, { mode: 'ai' })"
        ));
        assert!(!browser_iab_is_playwright_aria_snapshot_expression(
            "document.title"
        ));
        assert!(browser_iab_is_playwright_injection_check_expression(
            "!!window.__codexPlaywrightInjected"
        ));
        assert!(browser_iab_is_playwright_injection_install_expression(
            "window.__codexPlaywrightInjected = new PlaywrightInjected.InjectedScript(window, {})"
        ));
        let rewritten = browser_iab_rewrite_playwright_async_wrapper(
            "(async () => { const injected = window.__codexPlaywrightInjected; return await ((i) => document.title)(injected, null); })()",
        )
        .unwrap();
        assert!(rewritten.starts_with("(() =>"));
        assert!(rewritten.contains("return ((i) => document.title)"));
        let evaluate_wrapper = browser_iab_rewrite_playwright_async_wrapper(
            "(async () => { const arg = undefined;\nconst __playwrightEvaluate = (() => window.location.href);\nreturn await __playwrightEvaluate(arg); })()",
        )
        .unwrap();
        assert!(evaluate_wrapper.starts_with("(() =>"));
        assert!(evaluate_wrapper.contains("return __playwrightEvaluate(arg);"));
        let raw_evaluate = browser_iab_rewrite_playwright_async_wrapper(
            "const arg = undefined;\nconst __playwrightEvaluate = (() => document.title);\nreturn await __playwrightEvaluate(arg);",
        )
        .unwrap();
        assert!(raw_evaluate.starts_with("(() =>"));
        assert!(raw_evaluate.contains("return __playwrightEvaluate(arg);"));
        let snapshot_script = browser_iab_accessibility_snapshot_script();
        assert!(snapshot_script.contains("aria-label"));
        assert!(snapshot_script.contains("remoteObject"));
        assert!(browser_iab_minimal_playwright_injection_script().contains("ariaSnapshot"));

        let metrics = browser_iab_layout_metrics_from_value(&json!({
            "pageX": 3,
            "pageY": 5,
            "clientWidth": 800,
            "clientHeight": 600,
            "contentWidth": 1200,
            "contentHeight": 1600,
            "scale": 2,
        }));
        assert_eq!(
            metrics["cssVisualViewport"]["clientWidth"].as_f64(),
            Some(800.0)
        );
        assert_eq!(metrics["cssContentSize"]["height"].as_f64(), Some(1600.0));
    }

    #[test]
    fn browser_iab_dom_helpers_project_minimal_nodes_and_geometry() {
        let tab = BrowserRuntimeTab {
            tab_id: "active-9".to_string(),
            title: "Docs".to_string(),
            url: "https://platform.openai.com/docs".to_string(),
            display_url: "platform.openai.com/docs".to_string(),
            open: true,
            is_agent_working: false,
        };

        let document = browser_iab_dom_document_result(9, &tab);
        assert_eq!(document["root"]["nodeId"], 1);
        assert_eq!(document["root"]["backendNodeId"], 1);
        assert_eq!(document["root"]["frameId"], "hicodex-frame-9");

        let query = browser_iab_dom_query_selector_result_from_payload(json!({
            "ok": true,
            "nodeId": 7,
        }))
        .unwrap();
        assert_eq!(query["nodeId"], 7);

        let node = browser_iab_dom_node_result_from_payload(json!({
            "ok": true,
            "node": {
                "nodeId": 7,
                "backendNodeId": 7,
                "nodeType": 1,
                "nodeName": "BUTTON",
                "attributes": ["id", "save"],
            },
        }))
        .unwrap();
        assert_eq!(node["node"]["backendNodeId"], 7);
        assert_eq!(node["node"]["attributes"][1], "save");

        let node_for_location = browser_iab_dom_node_for_location_result_from_payload(json!({
            "ok": true,
            "nodeId": 8,
            "backendNodeId": 8,
            "frameId": "hicodex-frame-9",
        }))
        .unwrap();
        assert_eq!(node_for_location["backendNodeId"], 8);
        assert_eq!(node_for_location["frameId"], "hicodex-frame-9");

        let frame_owner = browser_iab_dom_frame_owner_result_from_payload(json!({
            "ok": true,
            "nodeId": 11,
            "backendNodeId": 11,
        }))
        .unwrap();
        assert_eq!(frame_owner["backendNodeId"], 11);

        let quads = browser_iab_dom_content_quads_result_from_payload(json!({
            "ok": true,
            "quads": [[10, 20, 110, 20, 110, 70, 10, 70]],
        }))
        .unwrap();
        assert_eq!(quads["quads"][0][4], 110);

        let box_model = browser_iab_dom_box_model_result_from_payload(json!({
            "ok": true,
            "model": {
                "border": [10, 20, 110, 20, 110, 70, 10, 70],
                "width": 100,
                "height": 50,
            },
        }))
        .unwrap();
        assert_eq!(box_model["model"]["width"], 100);

        assert!(browser_iab_dom_query_selector_result_from_payload(json!({
            "ok": false,
            "text": "bad selector",
        }))
        .is_err());
    }

    #[test]
    fn browser_iab_scroll_scripts_cover_browser_client_paths() {
        let point_scroll = browser_iab_synthesize_scroll_gesture_script(&json!({
            "x": 300,
            "y": 400,
            "xDistance": 0,
            "yDistance": -240,
        }));
        assert!(point_scroll.contains("scrollBy"));
        assert!(point_scroll.contains("-Number(params.yDistance"));

        let node_scroll = browser_iab_dom_scroll_into_view_script(&json!({
            "backendNodeId": 7,
        }));
        assert!(node_scroll.contains("scrollIntoView"));
        assert!(node_scroll.contains("__hicodexCdpRegistry"));

        let node_for_location = browser_iab_dom_node_for_location_script(
            9,
            &json!({
                "x": 12,
                "y": 24,
            }),
        );
        assert!(node_for_location.contains("elementFromPoint"));
        assert!(node_for_location.contains("hicodex-frame-9"));

        let frame_owner = browser_iab_dom_frame_owner_script(
            9,
            &json!({
                "frameId": "hicodex-frame-9-child-7",
            }),
        );
        assert!(frame_owner.contains("iframe,frame"));
        assert!(frame_owner.contains("DOM.getFrameOwner requires a child frameId"));
    }

    #[test]
    fn browser_iab_screenshot_helpers_project_visible_window_capture() {
        assert_eq!(
            browser_iab_screenshot_format_and_extension(&json!({})),
            ("png", "png")
        );
        assert_eq!(
            browser_iab_screenshot_format_and_extension(&json!({ "format": "jpeg" })),
            ("jpg", "jpg")
        );

        let logical_window = browser_iab_logical_window_region(20, 40, 1600, 1200, 2.0);
        assert_eq!(
            logical_window,
            BrowserIabScreenshotRegion {
                x: 10,
                y: 20,
                width: 800,
                height: 600,
            }
        );

        let unclipped = browser_iab_screenshot_region(logical_window, &json!({}));
        assert_eq!(
            unclipped,
            BrowserIabScreenshotRegion {
                x: 10,
                y: 20,
                width: 800,
                height: 600,
            }
        );

        let clipped = browser_iab_screenshot_region(
            logical_window,
            &json!({
                "clip": {
                    "x": 100,
                    "y": 50,
                    "width": 300,
                    "height": 100,
                }
            }),
        );
        assert_eq!(
            clipped,
            BrowserIabScreenshotRegion {
                x: 10,
                y: 20,
                width: 300,
                height: 100,
            }
        );

        let clamped = browser_iab_screenshot_region(
            BrowserIabScreenshotRegion {
                x: 0,
                y: 0,
                width: 200,
                height: 120,
            },
            &json!({
                "clip": {
                    "x": 180,
                    "y": 100,
                    "width": 200,
                    "height": 200,
                }
            }),
        );
        assert_eq!(
            clamped,
            BrowserIabScreenshotRegion {
                x: 0,
                y: 0,
                width: 200,
                height: 120,
            }
        );
    }

    #[test]
    fn browser_iab_pipe_dir_matches_browser_client_scan_path() {
        #[cfg(unix)]
        assert_eq!(
            super::browser_iab_pipe_dir(),
            std::path::PathBuf::from("/tmp/codex-browser-use")
        );
    }

    #[test]
    fn browser_runtime_refresh_does_not_reopen_closed_tabs() {
        assert!(super::refreshed_browser_tab_open_state(true, true));
        assert!(!super::refreshed_browser_tab_open_state(true, false));
        assert!(!super::refreshed_browser_tab_open_state(false, true));
        assert!(!super::refreshed_browser_tab_open_state(false, false));
    }

    #[cfg(unix)]
    #[test]
    fn browser_iab_startup_cleanup_removes_only_stale_hicodex_sockets() {
        let nanos = SystemTime::now()
            .duration_since(UNIX_EPOCH)
            .map(|value| value.as_nanos())
            .unwrap_or_default();
        let dir = PathBuf::from(format!("/tmp/hcbiab-{}-{nanos}", std::process::id()));
        let _ = fs::remove_dir_all(&dir);
        fs::create_dir_all(&dir).unwrap();
        let stale = dir.join("hicodex-111-iab.sock");
        let keep = dir.join("hicodex-222-iab.sock");
        let extension_stale = dir.join("hicodex-111-extension.sock");
        let extension_keep = dir.join("hicodex-222-extension.sock");
        let other = dir.join("other-iab.sock");
        let regular = dir.join("hicodex-333-iab.sock");

        let _stale_listener = std::os::unix::net::UnixListener::bind(&stale).unwrap();
        let _keep_listener = std::os::unix::net::UnixListener::bind(&keep).unwrap();
        let _extension_stale_listener =
            std::os::unix::net::UnixListener::bind(&extension_stale).unwrap();
        let _extension_keep_listener =
            std::os::unix::net::UnixListener::bind(&extension_keep).unwrap();
        let _other_listener = std::os::unix::net::UnixListener::bind(&other).unwrap();
        fs::write(&regular, "not a socket").unwrap();

        let removed = super::remove_stale_browser_iab_probe_sockets(&dir, &keep);

        assert_eq!(removed, 1);
        assert!(!stale.exists());
        assert!(keep.exists());
        assert!(extension_stale.exists());
        assert!(extension_keep.exists());
        let removed = super::remove_stale_browser_extension_backend_sockets(&dir, &extension_keep);

        assert_eq!(removed, 1);
        assert!(!extension_stale.exists());
        assert!(extension_keep.exists());
        assert!(keep.exists());
        assert!(other.exists());
        assert!(regular.exists());
        let _ = fs::remove_dir_all(dir);
    }

    #[test]
    fn sanitizes_pending_worktree_branch_and_path_names() {
        assert_eq!(
            sanitize_pending_worktree_name(" ../feature/foo:bar.lock ", "fallback"),
            "feature-foo-bar.lock-branch"
        );
        assert_eq!(
            sanitize_pending_worktree_name("a..b   c", "fallback"),
            "a.b-c"
        );
        assert_eq!(
            sanitize_pending_worktree_name(" ../.. ", "fallback"),
            "fallback"
        );
    }

    #[test]
    fn parses_git_status_porcelain_z_entries() {
        let files = parse_git_status_porcelain_z(
            b" M src/lib.rs\0R  renamed file.rs\0old file.rs\0?? new.txt\0",
        );
        assert_eq!(
            files,
            vec![
                HostGitChangedFile {
                    status: "M".to_string(),
                    path: "src/lib.rs".to_string(),
                    old_path: None,
                },
                HostGitChangedFile {
                    status: "R".to_string(),
                    path: "renamed file.rs".to_string(),
                    old_path: Some("old file.rs".to_string()),
                },
                HostGitChangedFile {
                    status: "??".to_string(),
                    path: "new.txt".to_string(),
                    old_path: None,
                },
            ]
        );
    }

    #[test]
    fn parses_ahead_behind_counts() {
        assert_eq!(parse_ahead_behind_counts("3\t12\n"), (3, 12));
        assert_eq!(parse_ahead_behind_counts("bad data"), (0, 0));
        assert_eq!(parse_ahead_behind_counts("7"), (7, 0));
    }

    #[test]
    fn builds_nonempty_default_pending_worktree_name() {
        let name = default_pending_worktree_name("???", UNIX_EPOCH);
        assert_eq!(name, "repo-worktree-19700101-000000");
    }

    #[test]
    fn recognizes_shell_links_and_connector_oauth_callbacks() {
        assert!(is_supported_native_shell_url("codex://threads/thread-1"));
        assert!(is_supported_native_shell_url(
            "https://chatgpt.com/aip/connectors/links/oauth/callback?state=s&code=c"
        ));
        assert!(is_supported_native_shell_url(
            "https://chatgpt.com/connector_platform_oauth_redirect?state=s&code=c"
        ));
        assert!(!is_supported_native_shell_url(
            "https://example.com/threads/thread-1"
        ));
    }

    #[test]
    fn host_generate_image_posts_to_configured_image_endpoint() {
        let listener = TcpListener::bind("127.0.0.1:0").unwrap();
        let address = listener.local_addr().unwrap();
        let server = thread::spawn(move || {
            let (mut stream, _) = listener.accept().unwrap();
            stream
                .set_read_timeout(Some(Duration::from_secs(2)))
                .unwrap();
            let mut request = String::new();
            let mut buffer = [0_u8; 4096];
            loop {
                match stream.read(&mut buffer) {
                    Ok(0) => break,
                    Ok(count) => {
                        request.push_str(&String::from_utf8_lossy(&buffer[..count]));
                        if request.contains("\r\n\r\n")
                            && request.contains("\"prompt\":\"blue sky\"")
                        {
                            break;
                        }
                    }
                    Err(error)
                        if error.kind() == std::io::ErrorKind::WouldBlock
                            || error.kind() == std::io::ErrorKind::TimedOut =>
                    {
                        break;
                    }
                    Err(error) => panic!("failed to read image request: {error}"),
                }
            }

            let body = r#"{"data":[{"b64_json":"UE5HREFUQQ=="}]}"#;
            let response = format!(
                "HTTP/1.1 200 OK\r\nContent-Type: application/json\r\nContent-Length: {}\r\nConnection: close\r\n\r\n{}",
                body.len(),
                body
            );
            stream.write_all(response.as_bytes()).unwrap();
            request
        });

        let codex_home = temp_dir();
        let result = host_generate_image(ImageGenerationRequest {
            base_url: format!("http://{address}/v1"),
            api_key: Some("local-secret".to_string()),
            payload: json!({
                "prompt": "blue sky",
                "n": 1,
                "size": "1024x1024",
            }),
            codex_home: Some(codex_home.to_string_lossy().to_string()),
            thread_id: Some("thread/with spaces".to_string()),
        })
        .unwrap();
        let request = server.join().unwrap();

        assert!(request.starts_with("POST /v1/images/generations "));
        assert!(request.contains("Authorization: Bearer local-secret"));
        assert_eq!(result["data"][0]["b64_json"], "UE5HREFUQQ==");
        let output_dir = codex_home
            .join("generated_images")
            .join("thread_with_spaces");
        let saved_images = fs::read_dir(output_dir)
            .unwrap()
            .map(|entry| entry.unwrap().path())
            .collect::<Vec<_>>();
        assert_eq!(saved_images.len(), 1);
        assert_eq!(
            saved_images[0].extension().and_then(|ext| ext.to_str()),
            Some("png")
        );
        assert_eq!(fs::read(&saved_images[0]).unwrap(), b"PNGDATA");
        assert_eq!(
            result["data"][0]["url"],
            file_url_from_path(&saved_images[0])
        );
    }

    #[test]
    fn persists_generated_images_with_response_mime_extension() {
        let codex_home = temp_dir();
        let result = persist_image_generation_response(
            json!({
                "data": [{
                    "b64_json": "V0VCUERBVEE=",
                    "mimeType": "image/webp; charset=binary"
                }]
            }),
            Some(codex_home.to_string_lossy().as_ref()),
            Some("thread-webp"),
        )
        .unwrap();
        let output_dir = codex_home.join("generated_images").join("thread-webp");
        let saved_images = fs::read_dir(output_dir)
            .unwrap()
            .map(|entry| entry.unwrap().path())
            .collect::<Vec<_>>();
        assert_eq!(saved_images.len(), 1);
        assert_eq!(
            saved_images[0].extension().and_then(|ext| ext.to_str()),
            Some("webp")
        );
        assert_eq!(fs::read(&saved_images[0]).unwrap(), b"WEBPDATA");
        assert_eq!(
            result["data"][0]["url"],
            file_url_from_path(&saved_images[0])
        );
    }
}

#[cfg(target_os = "macos")]
fn pick_file_references(kind: Option<&str>, multiple: bool) -> Result<Vec<String>, String> {
    let is_image_picker = matches!(kind, Some("image" | "images"));
    let prompt = if is_image_picker {
        "Select images to attach"
    } else {
        "Select files to attach"
    };
    let type_filter = if is_image_picker {
        " of type {\"png\", \"jpg\", \"jpeg\", \"gif\", \"webp\", \"heic\", \"heif\", \"bmp\", \"tif\", \"tiff\", \"svg\"}"
    } else {
        ""
    };
    let multiple_clause = if multiple {
        " with multiple selections allowed"
    } else {
        ""
    };
    let choose_file = format!("choose file with prompt \"{prompt}\"{type_filter}{multiple_clause}");
    let choose_statement = if multiple {
        format!("set selectedFiles to {choose_file}")
    } else {
        format!("set selectedFiles to {{{choose_file}}}")
    };
    let output = Command::new("osascript")
        .args([
            "-e",
            &choose_statement,
            "-e",
            "set output to \"\"",
            "-e",
            "repeat with selectedFile in selectedFiles",
            "-e",
            "set output to output & POSIX path of selectedFile & linefeed",
            "-e",
            "end repeat",
            "-e",
            "return output",
        ])
        .output()
        .map_err(|error| format!("failed to open file picker: {error}"))?;

    if !output.status.success() {
        let stderr = String::from_utf8_lossy(&output.stderr).trim().to_string();
        if stderr.to_lowercase().contains("user canceled") {
            return Ok(Vec::new());
        }
        return Err(if stderr.is_empty() {
            format!("file picker exited with status {}", output.status)
        } else {
            stderr
        });
    }

    Ok(String::from_utf8_lossy(&output.stdout)
        .lines()
        .map(str::trim)
        .filter(|path| !path.is_empty())
        .map(ToOwned::to_owned)
        .collect())
}

#[cfg(target_os = "macos")]
fn pick_workspace_folder() -> Result<Option<String>, String> {
    let output = Command::new("osascript")
        .args([
            "-e",
            "set selectedFolder to choose folder with prompt \"Use an existing folder\"",
            "-e",
            "return POSIX path of selectedFolder",
        ])
        .output()
        .map_err(|error| format!("failed to open folder picker: {error}"))?;

    if !output.status.success() {
        let stderr = String::from_utf8_lossy(&output.stderr).trim().to_string();
        if stderr.to_lowercase().contains("user canceled") {
            return Ok(None);
        }
        return Err(if stderr.is_empty() {
            format!("folder picker exited with status {}", output.status)
        } else {
            stderr
        });
    }

    let path = String::from_utf8_lossy(&output.stdout).trim().to_string();
    Ok((!path.is_empty()).then_some(path))
}

#[cfg(not(target_os = "macos"))]
fn pick_file_references(_kind: Option<&str>, _multiple: bool) -> Result<Vec<String>, String> {
    Err("file picker is not implemented for this platform yet".to_string())
}

#[cfg(not(target_os = "macos"))]
fn pick_workspace_folder() -> Result<Option<String>, String> {
    Err("folder picker is not implemented for this platform yet".to_string())
}

fn image_mime_type(path: &Path) -> Option<&'static str> {
    let extension = path.extension()?.to_string_lossy().to_lowercase();
    match extension.as_str() {
        "avif" => Some("image/avif"),
        "bmp" => Some("image/bmp"),
        "gif" => Some("image/gif"),
        "heic" => Some("image/heic"),
        "heif" => Some("image/heif"),
        "jpg" | "jpeg" => Some("image/jpeg"),
        "png" => Some("image/png"),
        "svg" => Some("image/svg+xml"),
        "tif" | "tiff" => Some("image/tiff"),
        "webp" => Some("image/webp"),
        _ => None,
    }
}

fn file_mime_type(path: &Path) -> Option<&'static str> {
    if let Some(mime) = image_mime_type(path) {
        return Some(mime);
    }
    let extension = path.extension()?.to_string_lossy().to_lowercase();
    match extension.as_str() {
        "csv" => Some("text/csv"),
        "doc" => Some("application/msword"),
        "docx" => Some("application/vnd.openxmlformats-officedocument.wordprocessingml.document"),
        "html" | "htm" => Some("text/html"),
        "ipynb" => Some("application/x-ipynb+json"),
        "json" => Some("application/json"),
        "md" | "markdown" | "mdx" => Some("text/markdown"),
        "pdf" => Some("application/pdf"),
        "pptx" => Some("application/vnd.openxmlformats-officedocument.presentationml.presentation"),
        "tsv" => Some("text/tab-separated-values"),
        "txt" => Some("text/plain"),
        "xlsx" => Some("application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"),
        _ => None,
    }
}

fn is_word_document_path(path: &Path) -> bool {
    let extension = path
        .extension()
        .map(|value| value.to_string_lossy().to_lowercase())
        .unwrap_or_default();
    matches!(extension.as_str(), "doc" | "docx")
}

fn open_path(path: &Path) -> std::io::Result<()> {
    #[cfg(target_os = "macos")]
    {
        Command::new("open").arg(path).spawn().map(|_| ())
    }
    #[cfg(target_os = "windows")]
    {
        Command::new("cmd")
            .args(["/C", "start", "", &path.to_string_lossy()])
            .spawn()
            .map(|_| ())
    }
    #[cfg(all(unix, not(target_os = "macos")))]
    {
        Command::new("xdg-open").arg(path).spawn().map(|_| ())
    }
}

fn open_existing_path(path: &str) -> Result<(), String> {
    let target = Path::new(path);
    if !target.exists() {
        return Err(format!("path does not exist: {path}"));
    }
    open_path(target).map_err(|error| format!("failed to open {path}: {error}"))
}

/// Reveal `path` in the OS file manager. Mirrors Codex Desktop's platform
/// switch in `workspace-file-context-menu-*.js` (`C(platform)`): macOS reveals
/// and selects the item in Finder (`open -R`), Windows selects it in Explorer
/// (`explorer /select,`), and other Unix opens the containing directory in the
/// system file manager (xdg-open has no portable "select this item" verb, so
/// we fall back to the parent directory).
fn reveal_path(path: &Path) -> std::io::Result<()> {
    #[cfg(target_os = "macos")]
    {
        Command::new("open").arg("-R").arg(path).spawn().map(|_| ())
    }
    #[cfg(target_os = "windows")]
    {
        Command::new("explorer")
            .arg(format!("/select,{}", path.to_string_lossy()))
            .spawn()
            .map(|_| ())
    }
    #[cfg(all(unix, not(target_os = "macos")))]
    {
        let target = path.parent().unwrap_or(path);
        Command::new("xdg-open").arg(target).spawn().map(|_| ())
    }
}

fn normalized_external_url(value: &str) -> Result<String, String> {
    let trimmed = value.trim();
    if trimmed.is_empty() {
        return Err("external URL is empty".to_string());
    }
    if trimmed
        .chars()
        .any(|value| value.is_control() || value.is_whitespace())
    {
        return Err("external URL contains unsupported whitespace".to_string());
    }
    if !(trimmed.starts_with("http://") || trimmed.starts_with("https://")) {
        return Err("external URL must use http or https".to_string());
    }
    Ok(trimmed.to_string())
}

fn open_external_url(url: &str) -> std::io::Result<()> {
    #[cfg(target_os = "macos")]
    {
        Command::new("open").arg(url).spawn().map(|_| ())
    }
    #[cfg(target_os = "windows")]
    {
        Command::new("cmd")
            .args(["/C", "start", "", url])
            .spawn()
            .map(|_| ())
    }
    #[cfg(all(unix, not(target_os = "macos")))]
    {
        Command::new("xdg-open").arg(url).spawn().map(|_| ())
    }
}

#[cfg(target_os = "macos")]
fn open_macos_system_settings_url(url: &str) -> Result<(), String> {
    Command::new("open")
        .arg(url)
        .spawn()
        .map(|_| ())
        .map_err(|error| format!("failed to open System Settings: {error}"))
}

#[cfg(not(target_os = "macos"))]
fn open_macos_system_settings_url(_url: &str) -> Result<(), String> {
    Err("Computer Use permission setup is only available on macOS.".to_string())
}

fn normalized_browser_url(value: &str) -> Result<String, String> {
    let trimmed = value.trim();
    if trimmed.is_empty() {
        return Err("Browser URL is empty".to_string());
    }
    if trimmed
        .chars()
        .any(|value| value.is_control() || value.is_whitespace())
    {
        return Err("Browser URL contains unsupported whitespace".to_string());
    }
    let lower = trimmed.to_ascii_lowercase();
    let with_scheme = if lower.starts_with("http://")
        || lower.starts_with("https://")
        || lower.starts_with("file://")
    {
        trimmed.to_string()
    } else if trimmed.contains("://") {
        return Err("Browser URL must use http, https, or file".to_string());
    } else if browser_target_looks_local(trimmed) {
        format!("http://{trimmed}")
    } else {
        format!("https://{trimmed}")
    };
    if !(with_scheme.starts_with("http://")
        || with_scheme.starts_with("https://")
        || with_scheme.starts_with("file://"))
    {
        return Err("Browser URL must use http, https, or file".to_string());
    }
    Ok(with_scheme)
}

fn browser_target_looks_local(value: &str) -> bool {
    let authority = value.split(['/', '?', '#']).next().unwrap_or_default();
    let host = if authority.starts_with('[') {
        authority
            .split(']')
            .next()
            .unwrap_or_default()
            .trim_start_matches('[')
    } else {
        authority.split(':').next().unwrap_or_default()
    }
    .to_ascii_lowercase();
    host == "localhost" || host == "::1" || host == "0.0.0.0" || host.starts_with("127.")
}

fn next_browser_tab_id() -> String {
    let n = BROWSER_TAB_COUNTER.fetch_add(1, Ordering::Relaxed);
    format!("active-{n}")
}

fn browser_window_label(tab_id: &str) -> String {
    format!("browser-{}", sanitize_window_label(tab_id))
}

fn sanitize_window_label(value: &str) -> String {
    let sanitized: String = value
        .chars()
        .map(|ch| {
            if ch.is_ascii_alphanumeric() || ch == '-' || ch == '_' {
                ch
            } else {
                '-'
            }
        })
        .collect();
    sanitized
        .trim_matches('-')
        .is_empty()
        .then_some("active".to_string())
        .unwrap_or(sanitized)
}

fn browser_display_url(url: &str) -> String {
    url.trim()
        .trim_start_matches("https://")
        .trim_start_matches("http://")
        .trim_end_matches('/')
        .to_string()
}

fn refresh_browser_runtime_store(app: &AppHandle, state: &AppState) {
    let mut store = state
        .browser_runtime
        .lock()
        .expect("browser runtime mutex poisoned");
    for tab in &mut store.tabs {
        tab.open = refreshed_browser_tab_open_state(
            tab.open,
            app.get_webview_window(&browser_window_label(&tab.tab_id))
                .is_some(),
        );
    }
    if let Some(active) = store.active_tab_id.as_deref() {
        let active_open = store
            .tabs
            .iter()
            .any(|tab| tab.tab_id == active && tab.open);
        if !active_open {
            store.active_tab_id = store
                .tabs
                .iter()
                .find(|tab| tab.open)
                .map(|tab| tab.tab_id.clone());
        }
    }
}

fn refreshed_browser_tab_open_state(currently_open: bool, window_exists: bool) -> bool {
    currently_open && window_exists
}

fn upsert_browser_tab(
    state: &AppState,
    tab_id: &str,
    url: &str,
    title: Option<String>,
    open: bool,
) {
    let mut store = state
        .browser_runtime
        .lock()
        .expect("browser runtime mutex poisoned");
    let display_url = browser_display_url(url);
    if let Some(tab) = store.tabs.iter_mut().find(|tab| tab.tab_id == tab_id) {
        tab.url = url.to_string();
        tab.display_url = display_url;
        tab.open = open;
        if let Some(title) = title.filter(|value| !value.trim().is_empty()) {
            tab.title = title;
        }
    } else {
        store.tabs.push(BrowserRuntimeTab {
            tab_id: tab_id.to_string(),
            title: title
                .filter(|value| !value.trim().is_empty())
                .unwrap_or_else(|| "Browser".to_string()),
            url: url.to_string(),
            display_url,
            open,
            is_agent_working: false,
        });
    }
    store.active_tab_id = Some(tab_id.to_string());
}

fn update_browser_tab_title(state: &AppState, tab_id: &str, title: String) {
    let trimmed = title.trim();
    if trimmed.is_empty() {
        return;
    }
    let mut store = state
        .browser_runtime
        .lock()
        .expect("browser runtime mutex poisoned");
    if let Some(tab) = store.tabs.iter_mut().find(|tab| tab.tab_id == tab_id) {
        tab.title = trimmed.to_string();
    }
}

fn update_browser_tab_url(state: &AppState, tab_id: &str, url: String) {
    let mut store = state
        .browser_runtime
        .lock()
        .expect("browser runtime mutex poisoned");
    if let Some(tab) = store.tabs.iter_mut().find(|tab| tab.tab_id == tab_id) {
        tab.url = url.clone();
        tab.display_url = browser_display_url(&url);
        tab.open = true;
        store.active_tab_id = Some(tab_id.to_string());
    }
}

fn mark_browser_tab_closed(state: &AppState, tab_id: &str) {
    let mut store = state
        .browser_runtime
        .lock()
        .expect("browser runtime mutex poisoned");
    if let Some(tab) = store.tabs.iter_mut().find(|tab| tab.tab_id == tab_id) {
        tab.open = false;
    }
    if store.active_tab_id.as_deref() == Some(tab_id) {
        store.active_tab_id = store
            .tabs
            .iter()
            .find(|tab| tab.open)
            .map(|tab| tab.tab_id.clone());
    }
}

fn browser_runtime_status_from_store(
    state: &AppState,
    error: Option<String>,
) -> BrowserRuntimeStatus {
    let store = state
        .browser_runtime
        .lock()
        .expect("browser runtime mutex poisoned");
    browser_runtime_status_from_store_locked(
        &store,
        error,
        state
            .browser_extension_backend_validated
            .load(Ordering::SeqCst),
    )
}

fn browser_runtime_status_from_store_locked(
    store: &BrowserRuntimeStore,
    error: Option<String>,
    extension_backend_validated: bool,
) -> BrowserRuntimeStatus {
    let extension_backend_registered = browser_extension_backend_socket_path().exists();
    BrowserRuntimeStatus {
        available: true,
        active_tab_id: store.active_tab_id.clone(),
        tabs: store.tabs.clone(),
        error,
        iab_backend_registered: browser_iab_probe_socket_path().exists(),
        iab_backend_path: existing_browser_iab_probe_socket_path(),
        iab_backend_mode: Some(BrowserBackendKind::IabProbe.mode().to_string()),
        extension_backend_registered,
        extension_backend_validated: extension_backend_registered && extension_backend_validated,
        extension_backend_path: existing_browser_extension_backend_socket_path(),
        extension_backend_mode: extension_backend_registered.then(|| {
            BrowserBackendKind::ExtensionHostCompatible
                .mode()
                .to_string()
        }),
    }
}

fn emit_browser_runtime_event(app: &AppHandle, state: &AppState, error: Option<String>) {
    let status = browser_runtime_status_from_store(state, error);
    let _ = app.emit(BROWSER_RUNTIME_EVENT_NAME, status);
}

fn browser_iab_probe_socket_path() -> PathBuf {
    browser_backend_socket_path(BrowserBackendKind::IabProbe)
}

fn browser_extension_backend_socket_path() -> PathBuf {
    browser_backend_socket_path(BrowserBackendKind::ExtensionHostCompatible)
}

fn browser_backend_socket_path(kind: BrowserBackendKind) -> PathBuf {
    browser_iab_pipe_dir().join(format!(
        "hicodex-{}-{}.sock",
        std::process::id(),
        kind.socket_suffix()
    ))
}

#[cfg(unix)]
fn browser_iab_pipe_dir() -> PathBuf {
    PathBuf::from("/tmp").join(BROWSER_IAB_PIPE_DIR_NAME)
}

#[cfg(not(unix))]
fn browser_iab_pipe_dir() -> PathBuf {
    env::temp_dir().join(BROWSER_IAB_PIPE_DIR_NAME)
}

fn existing_browser_iab_probe_socket_path() -> Option<String> {
    existing_browser_backend_socket_path(BrowserBackendKind::IabProbe)
}

fn existing_browser_extension_backend_socket_path() -> Option<String> {
    existing_browser_backend_socket_path(BrowserBackendKind::ExtensionHostCompatible)
}

fn existing_browser_backend_socket_path(kind: BrowserBackendKind) -> Option<String> {
    let path = browser_backend_socket_path(kind);
    path.exists().then(|| path.to_string_lossy().to_string())
}

#[cfg(all(unix, test))]
fn remove_stale_browser_iab_probe_sockets(dir: &Path, keep_socket_path: &Path) -> usize {
    remove_stale_browser_backend_sockets(dir, keep_socket_path, BrowserBackendKind::IabProbe)
}

#[cfg(all(unix, test))]
fn remove_stale_browser_extension_backend_sockets(dir: &Path, keep_socket_path: &Path) -> usize {
    remove_stale_browser_backend_sockets(
        dir,
        keep_socket_path,
        BrowserBackendKind::ExtensionHostCompatible,
    )
}

#[cfg(unix)]
fn remove_stale_browser_backend_sockets(
    dir: &Path,
    keep_socket_path: &Path,
    kind: BrowserBackendKind,
) -> usize {
    let keep_name = keep_socket_path
        .file_name()
        .and_then(|value| value.to_str())
        .unwrap_or_default();
    let Ok(entries) = fs::read_dir(dir) else {
        return 0;
    };
    let mut removed = 0;
    for entry in entries.flatten() {
        let path = entry.path();
        let Some(file_name) = path.file_name().and_then(|value| value.to_str()) else {
            continue;
        };
        if file_name == keep_name || !is_hicodex_browser_socket_name(file_name, kind) {
            continue;
        }
        let Ok(file_type) = entry.file_type() else {
            continue;
        };
        if !file_type.is_socket() {
            continue;
        }
        if fs::remove_file(&path).is_ok() {
            removed += 1;
        }
    }
    removed
}

#[cfg(unix)]
fn is_hicodex_browser_socket_name(file_name: &str, kind: BrowserBackendKind) -> bool {
    file_name.starts_with("hicodex-")
        && file_name.ends_with(&format!("-{}.sock", kind.socket_suffix()))
}

#[cfg(unix)]
fn start_browser_iab_probe_server(app: AppHandle) -> Result<PathBuf, String> {
    start_browser_backend_socket_server(app, BrowserBackendKind::IabProbe)
}

#[cfg(unix)]
fn start_browser_extension_backend_spike_server(app: AppHandle) -> Result<PathBuf, String> {
    start_browser_backend_socket_server(app, BrowserBackendKind::ExtensionHostCompatible)
}

#[cfg(unix)]
fn start_browser_backend_socket_server(
    app: AppHandle,
    kind: BrowserBackendKind,
) -> Result<PathBuf, String> {
    let socket_path = browser_backend_socket_path(kind);
    let dir = socket_path.parent().ok_or_else(|| {
        format!(
            "Browser {} socket path has no parent directory.",
            kind.backend_type()
        )
    })?;
    fs::create_dir_all(dir).map_err(|error| {
        format!(
            "failed to create Browser {} socket directory {}: {error}",
            kind.backend_type(),
            dir.to_string_lossy()
        )
    })?;
    fs::set_permissions(dir, fs::Permissions::from_mode(0o700)).map_err(|error| {
        format!(
            "failed to secure Browser {} socket directory {}: {error}",
            kind.backend_type(),
            dir.to_string_lossy()
        )
    })?;
    let _ = remove_stale_browser_backend_sockets(dir, &socket_path, kind);
    if socket_path.exists() {
        fs::remove_file(&socket_path).map_err(|error| {
            format!(
                "failed to remove stale Browser {} socket {}: {error}",
                kind.backend_type(),
                socket_path.to_string_lossy()
            )
        })?;
    }
    let listener = UnixListener::bind(&socket_path).map_err(|error| {
        format!(
            "failed to bind Browser {} socket {}: {error}",
            kind.backend_type(),
            socket_path.to_string_lossy()
        )
    })?;
    let server_path = socket_path.clone();
    thread::spawn(move || {
        for incoming in listener.incoming() {
            match incoming {
                Ok(stream) => {
                    let app = app.clone();
                    thread::spawn(move || match kind {
                        BrowserBackendKind::IabProbe => {
                            handle_browser_iab_probe_connection(app, stream)
                        }
                        BrowserBackendKind::ExtensionHostCompatible => {
                            handle_browser_backend_connection(app, stream, kind)
                        }
                    });
                }
                Err(error) => {
                    eprintln!(
                        "[{}] failed to accept connection: {error}",
                        kind.log_prefix()
                    );
                    break;
                }
            }
        }
        let _ = fs::remove_file(server_path);
    });
    Ok(socket_path)
}

#[cfg(not(unix))]
fn start_browser_iab_probe_server(_app: AppHandle) -> Result<PathBuf, String> {
    Err("Browser iab native pipe probe is only implemented for Unix sockets.".to_string())
}

#[cfg(not(unix))]
fn start_browser_extension_backend_spike_server(_app: AppHandle) -> Result<PathBuf, String> {
    Err("Browser extension native pipe spike is only implemented for Unix sockets.".to_string())
}

#[cfg(unix)]
fn handle_browser_iab_probe_connection(app: AppHandle, stream: UnixStream) {
    handle_browser_backend_connection(app, stream, BrowserBackendKind::IabProbe)
}

#[cfg(unix)]
fn handle_browser_backend_connection(
    app: AppHandle,
    mut stream: UnixStream,
    kind: BrowserBackendKind,
) {
    loop {
        let mut header = [0_u8; 4];
        if stream.read_exact(&mut header).is_err() {
            break;
        }
        let frame_len = u32::from_ne_bytes(header) as usize;
        if frame_len > 2 * 1024 * 1024 {
            let response = json_rpc_error(
                Value::Null,
                -32000,
                &format!("Browser {} frame is too large.", kind.backend_type()),
            );
            let _ = write_browser_iab_frame(&mut stream, &response);
            break;
        }
        let mut payload = vec![0_u8; frame_len];
        if stream.read_exact(&mut payload).is_err() {
            break;
        }
        let request = match serde_json::from_slice::<Value>(&payload) {
            Ok(request) => request,
            Err(error) => {
                let response = json_rpc_error(
                    Value::Null,
                    -32700,
                    &format!(
                        "failed to parse Browser {} JSON-RPC frame: {error}",
                        kind.backend_type()
                    ),
                );
                let _ = write_browser_iab_frame(&mut stream, &response);
                continue;
            }
        };
        let responses = match kind {
            BrowserBackendKind::IabProbe => browser_iab_probe_messages(&app, &request),
            BrowserBackendKind::ExtensionHostCompatible => {
                browser_backend_messages(&app, &request, kind)
            }
        };
        for response in responses {
            if write_browser_iab_frame(&mut stream, &response).is_err() {
                return;
            }
        }
    }
}

#[cfg(unix)]
fn write_browser_iab_frame(stream: &mut UnixStream, response: &Value) -> std::io::Result<()> {
    let payload = serde_json::to_vec(response)
        .map_err(|error| std::io::Error::new(std::io::ErrorKind::InvalidData, error))?;
    let len = u32::try_from(payload.len()).unwrap_or(u32::MAX);
    stream.write_all(&len.to_ne_bytes())?;
    stream.write_all(&payload)?;
    stream.flush()
}

fn browser_iab_probe_messages(app: &AppHandle, request: &Value) -> Vec<Value> {
    browser_backend_messages(app, request, BrowserBackendKind::IabProbe)
}

fn browser_backend_messages(
    app: &AppHandle,
    request: &Value,
    kind: BrowserBackendKind,
) -> Vec<Value> {
    let id = request.get("id").cloned().unwrap_or(Value::Null);
    let method = request
        .get("method")
        .and_then(Value::as_str)
        .unwrap_or_default();
    let params = request.get("params").cloned().unwrap_or_else(|| json!({}));
    match method {
        "getInfo" => {
            if kind == BrowserBackendKind::ExtensionHostCompatible {
                let state = app.state::<AppState>();
                state
                    .browser_extension_backend_validated
                    .store(true, Ordering::SeqCst);
                emit_browser_runtime_event(app, &state, None);
            }
            vec![json_rpc_success(
                id,
                browser_backend_info_result(&params, kind),
            )]
        }
        "ping" => vec![json_rpc_success(id, json!("pong"))],
        "getTabs" | "getUserTabs" => {
            let state = app.state::<AppState>();
            refresh_browser_runtime_store(app, &state);
            let store = state
                .browser_runtime
                .lock()
                .expect("browser runtime mutex poisoned");
            vec![json_rpc_success(
                id,
                Value::Array(browser_iab_tabs_from_store(&store)),
            )]
        }
        "createTab" => {
            let state = app.state::<AppState>();
            match open_browser_tab_impl(
                app,
                &state,
                Some(BROWSER_IAB_DEFAULT_URL.to_string()),
                None,
            ) {
                Ok(status) => {
                    let tab = status
                        .active_tab_id
                        .as_deref()
                        .and_then(|active_id| {
                            status.tabs.iter().enumerate().find(|(_, candidate)| {
                                candidate.tab_id == active_id && candidate.open
                            })
                        })
                        .and_then(|(index, active)| {
                            browser_iab_tab_from_runtime_tab(
                                active,
                                browser_iab_tab_id(active, index + 1),
                                true,
                            )
                        });
                    vec![json_rpc_success(
                        id,
                        tab.unwrap_or_else(|| json!({ "id": 1, "active": true })),
                    )]
                }
                Err(error) => vec![json_rpc_error(id, -32000, &error)],
            }
        }
        "attach" | "attachTarget" | "detach" | "detachTarget" | "nameSession" | "finalizeTabs"
        | "moveMouse" => {
            vec![json_rpc_success(id, json!({}))]
        }
        "executeCdp" => match browser_iab_execute_cdp(app, &params) {
            Ok((mut notifications, result)) => {
                notifications.push(json_rpc_success(id, result));
                notifications
            }
            Err(error) => vec![json_rpc_error(id, -32000, &error)],
        },
        "executeUnhandledCommand" => match browser_iab_execute_unhandled_command(app, &params) {
            Ok(result) => vec![json_rpc_success(id, result)],
            Err(error) => vec![json_rpc_error(id, -32000, &error)],
        },
        "claimUserTab" | "getUserHistory" => {
            vec![browser_iab_unsupported_response(id)]
        }
        "" => vec![json_rpc_error(
            id,
            -32600,
            &format!("Browser {} request is missing method.", kind.backend_type()),
        )],
        other => vec![json_rpc_error(
            id,
            -32601,
            &format!(
                "unsupported Browser {} method: {other}",
                kind.backend_type()
            ),
        )],
    }
}

#[cfg(test)]
fn browser_iab_info_result(params: &Value) -> Value {
    browser_backend_info_result(params, BrowserBackendKind::IabProbe)
}

#[cfg(test)]
fn browser_extension_backend_info_result(params: &Value) -> Value {
    browser_backend_info_result(params, BrowserBackendKind::ExtensionHostCompatible)
}

fn browser_backend_info_result(params: &Value, kind: BrowserBackendKind) -> Value {
    match kind {
        BrowserBackendKind::IabProbe => browser_iab_backend_info_result(params),
        BrowserBackendKind::ExtensionHostCompatible => browser_extension_backend_info_payload(),
    }
}

fn browser_iab_backend_info_result(params: &Value) -> Value {
    let mut metadata = serde_json::Map::new();
    if let Some(session_id) = params.get("session_id").and_then(Value::as_str) {
        metadata.insert("codexSessionId".to_string(), json!(session_id));
    }
    metadata.insert(
        "codexAppBuildFlavor".to_string(),
        json!(browser_iab_codex_app_build_flavor()),
    );
    metadata.insert("hicodexIabMode".to_string(), json!(BROWSER_IAB_MODE));
    json!({
        "name": "Forge Browser",
        "type": "iab",
        "metadata": metadata,
        "capabilities": {
            "browser": [],
            "tab": []
        }
    })
}

fn browser_extension_backend_info_payload() -> Value {
    let mut metadata = serde_json::Map::new();
    metadata.insert(
        "extensionId".to_string(),
        json!("hicodex-host-compatible-extension"),
    );
    metadata.insert(
        "extensionInstanceId".to_string(),
        json!(format!("hicodex-host-compatible-{}", std::process::id())),
    );
    metadata.insert("source".to_string(), json!("hicodex-host-compatible-spike"));
    metadata.insert(
        "hicodexExtensionBackendMode".to_string(),
        json!(BROWSER_EXTENSION_BACKEND_MODE),
    );
    json!({
        "name": "Forge Browser Extension Spike",
        "type": "extension",
        "metadata": metadata,
        "capabilities": {
            "browser": [],
            "tab": []
        }
    })
}

fn browser_iab_codex_app_build_flavor() -> String {
    env::var("BROWSER_USE_CODEX_APP_BUILD_FLAVOR")
        .ok()
        .map(|value| value.trim().to_string())
        .filter(|value| !value.is_empty())
        .unwrap_or_else(|| BROWSER_IAB_DEFAULT_CODEX_APP_BUILD_FLAVOR.to_string())
}

fn browser_extension_backend_enabled() -> bool {
    env::var(BROWSER_EXTENSION_BACKEND_ENV)
        .ok()
        .map(|value| {
            let normalized = value.trim().to_ascii_lowercase();
            !matches!(normalized.as_str(), "" | "0" | "false" | "no" | "off")
        })
        .unwrap_or(false)
}

fn browser_iab_tabs_from_store(store: &BrowserRuntimeStore) -> Vec<Value> {
    store
        .tabs
        .iter()
        .filter(|tab| tab.open)
        .enumerate()
        .filter_map(|(index, tab)| {
            browser_iab_tab_from_runtime_tab(
                tab,
                browser_iab_tab_id(tab, index + 1),
                store.active_tab_id.as_deref() == Some(&tab.tab_id),
            )
        })
        .collect()
}

fn browser_iab_tab_from_runtime_tab(
    tab: &BrowserRuntimeTab,
    id: usize,
    active: bool,
) -> Option<Value> {
    if !tab.open {
        return None;
    }
    Some(json!({
        "id": id,
        "active": active,
        "title": tab.title,
        "url": tab.url,
    }))
}

fn browser_iab_execute_cdp(app: &AppHandle, params: &Value) -> Result<(Vec<Value>, Value), String> {
    let method = params
        .get("method")
        .and_then(Value::as_str)
        .ok_or_else(|| "executeCdp requires method.".to_string())?;
    let tab_id = browser_iab_cdp_tab_id(params)
        .ok_or_else(|| "executeCdp requires target.tabId.".to_string())?;
    let command_params = params
        .get("commandParams")
        .or_else(|| params.get("params"))
        .cloned()
        .unwrap_or_else(|| json!({}));
    match method {
        "Emulation.setFocusEmulationEnabled"
        | "Page.enable"
        | "Runtime.enable"
        | "Target.setAutoAttach" => Ok((Vec::new(), json!({}))),
        "Page.createIsolatedWorld" => Ok((
            Vec::new(),
            json!({
                "executionContextId": tab_id,
            }),
        )),
        "Page.getFrameTree" => {
            let state = app.state::<AppState>();
            refresh_browser_runtime_store(app, &state);
            let store = state
                .browser_runtime
                .lock()
                .expect("browser runtime mutex poisoned");
            let tab = browser_iab_runtime_tab_for_id(&store, tab_id)
                .ok_or_else(|| format!("Browser iab tab {tab_id} is not open."))?;
            Ok((Vec::new(), browser_iab_frame_tree_result(tab_id, tab)))
        }
        "Page.getLayoutMetrics" => {
            let state = app.state::<AppState>();
            refresh_browser_runtime_store(app, &state);
            let store = state
                .browser_runtime
                .lock()
                .expect("browser runtime mutex poisoned");
            let tab = browser_iab_runtime_tab_for_id(&store, tab_id)
                .ok_or_else(|| format!("Browser iab tab {tab_id} is not open."))?;
            Ok((
                Vec::new(),
                browser_iab_layout_metrics_result(app, tab)
                    .unwrap_or_else(|_| browser_iab_default_layout_metrics_result()),
            ))
        }
        "Runtime.evaluate" => {
            let state = app.state::<AppState>();
            refresh_browser_runtime_store(app, &state);
            let store = state
                .browser_runtime
                .lock()
                .expect("browser runtime mutex poisoned");
            let tab = browser_iab_runtime_tab_for_id(&store, tab_id)
                .ok_or_else(|| format!("Browser iab tab {tab_id} is not open."))?;
            let expression = command_params
                .get("expression")
                .and_then(Value::as_str)
                .unwrap_or_default();
            let result = browser_iab_runtime_evaluate_app_result(app, tab, expression)
                .unwrap_or_else(|error| {
                    browser_iab_runtime_evaluate_result(tab, expression, Some(error))
                });
            Ok((Vec::new(), result))
        }
        "Page.navigate" => {
            let url = command_params
                .get("url")
                .and_then(Value::as_str)
                .ok_or_else(|| "Page.navigate requires url.".to_string())?;
            let state = app.state::<AppState>();
            let (internal_tab_id, current_url) = {
                let store = state
                    .browser_runtime
                    .lock()
                    .expect("browser runtime mutex poisoned");
                let tab = browser_iab_runtime_tab_for_id(&store, tab_id)
                    .map(|tab| tab.tab_id.clone())
                    .ok_or_else(|| format!("Browser iab tab {tab_id} is not open."))?;
                let current_url = browser_iab_runtime_tab_for_id(&store, tab_id)
                    .map(|tab| tab.url.clone())
                    .unwrap_or_default();
                (tab, current_url)
            };
            open_browser_tab_impl(app, &state, Some(url.to_string()), Some(internal_tab_id))?;
            let events = if browser_iab_is_same_document_navigation(&current_url, url) {
                browser_iab_same_document_navigation_events(tab_id, url)
            } else {
                browser_iab_navigation_events(tab_id, url)
            };
            Ok((events, json!({ "frameId": browser_iab_frame_id(tab_id) })))
        }
        "Page.reload" => {
            let state = app.state::<AppState>();
            let (internal_tab_id, url) = {
                let store = state
                    .browser_runtime
                    .lock()
                    .expect("browser runtime mutex poisoned");
                let tab = browser_iab_runtime_tab_for_id(&store, tab_id)
                    .ok_or_else(|| format!("Browser iab tab {tab_id} is not open."))?;
                (tab.tab_id.clone(), tab.url.clone())
            };
            open_browser_tab_impl(app, &state, Some(url.clone()), Some(internal_tab_id))?;
            Ok((browser_iab_navigation_events(tab_id, &url), json!({})))
        }
        "Page.navigateToHistoryEntry" => {
            let entry_id = command_params
                .get("entryId")
                .and_then(Value::as_u64)
                .unwrap_or(1);
            if entry_id == 1 {
                Ok((Vec::new(), json!({})))
            } else {
                Err(format!(
                    "Forge Browser iab probe only exposes the current navigation history entry; entry {entry_id} is not available."
                ))
            }
        }
        "Page.getNavigationHistory" => {
            let state = app.state::<AppState>();
            refresh_browser_runtime_store(app, &state);
            let store = state
                .browser_runtime
                .lock()
                .expect("browser runtime mutex poisoned");
            let tab = browser_iab_runtime_tab_for_id(&store, tab_id)
                .ok_or_else(|| format!("Browser iab tab {tab_id} is not open."))?;
            Ok((
                Vec::new(),
                json!({
                    "currentIndex": 0,
                    "entries": [{
                        "id": 1,
                        "url": tab.url,
                        "title": tab.title,
                    }],
                }),
            ))
        }
        "DOM.getDocument" => {
            let state = app.state::<AppState>();
            refresh_browser_runtime_store(app, &state);
            let store = state
                .browser_runtime
                .lock()
                .expect("browser runtime mutex poisoned");
            let tab = browser_iab_runtime_tab_for_id(&store, tab_id)
                .ok_or_else(|| format!("Browser iab tab {tab_id} is not open."))?;
            Ok((Vec::new(), browser_iab_dom_document_result(tab_id, tab)))
        }
        "DOM.querySelector" => {
            let tab = browser_iab_runtime_tab_clone_for_id(app, tab_id)?;
            let payload = browser_iab_eval_with_callback(
                app,
                &tab,
                browser_iab_dom_query_selector_script(&command_params),
            )?;
            Ok((
                Vec::new(),
                browser_iab_dom_query_selector_result_from_payload(payload)?,
            ))
        }
        "DOM.describeNode" => {
            let tab = browser_iab_runtime_tab_clone_for_id(app, tab_id)?;
            let payload = browser_iab_eval_with_callback(
                app,
                &tab,
                browser_iab_dom_describe_node_script(tab_id, &command_params),
            )?;
            Ok((
                Vec::new(),
                browser_iab_dom_node_result_from_payload(payload)?,
            ))
        }
        "DOM.getNodeForLocation" => {
            let tab = browser_iab_runtime_tab_clone_for_id(app, tab_id)?;
            let payload = browser_iab_eval_with_callback(
                app,
                &tab,
                browser_iab_dom_node_for_location_script(tab_id, &command_params),
            )?;
            Ok((
                Vec::new(),
                browser_iab_dom_node_for_location_result_from_payload(payload)?,
            ))
        }
        "DOM.getFrameOwner" => {
            let tab = browser_iab_runtime_tab_clone_for_id(app, tab_id)?;
            let payload = browser_iab_eval_with_callback(
                app,
                &tab,
                browser_iab_dom_frame_owner_script(tab_id, &command_params),
            )?;
            Ok((
                Vec::new(),
                browser_iab_dom_frame_owner_result_from_payload(payload)?,
            ))
        }
        "DOM.getContentQuads" => {
            let tab = browser_iab_runtime_tab_clone_for_id(app, tab_id)?;
            let payload = browser_iab_eval_with_callback(
                app,
                &tab,
                browser_iab_dom_geometry_script(&command_params, "quads"),
            )?;
            Ok((
                Vec::new(),
                browser_iab_dom_content_quads_result_from_payload(payload)?,
            ))
        }
        "DOM.getBoxModel" => {
            let tab = browser_iab_runtime_tab_clone_for_id(app, tab_id)?;
            let payload = browser_iab_eval_with_callback(
                app,
                &tab,
                browser_iab_dom_geometry_script(&command_params, "boxModel"),
            )?;
            Ok((
                Vec::new(),
                browser_iab_dom_box_model_result_from_payload(payload)?,
            ))
        }
        "DOM.scrollIntoViewIfNeeded" => {
            let tab = browser_iab_runtime_tab_clone_for_id(app, tab_id)?;
            let payload = browser_iab_eval_with_callback(
                app,
                &tab,
                browser_iab_dom_scroll_into_view_script(&command_params),
            )?;
            browser_iab_expect_ok_payload(payload, "DOM.scrollIntoViewIfNeeded failed.")?;
            Ok((Vec::new(), json!({})))
        }
        "Target.getTargets" => {
            let state = app.state::<AppState>();
            refresh_browser_runtime_store(app, &state);
            let store = state
                .browser_runtime
                .lock()
                .expect("browser runtime mutex poisoned");
            Ok((
                Vec::new(),
                json!({
                    "targetInfos": browser_iab_targets_from_store(&store),
                }),
            ))
        }
        "Input.dispatchMouseEvent" => {
            let state = app.state::<AppState>();
            refresh_browser_runtime_store(app, &state);
            let store = state
                .browser_runtime
                .lock()
                .expect("browser runtime mutex poisoned");
            let tab = browser_iab_runtime_tab_for_id(&store, tab_id)
                .ok_or_else(|| format!("Browser iab tab {tab_id} is not open."))?;
            browser_iab_eval_with_callback(
                app,
                tab,
                browser_iab_mouse_event_script(&command_params),
            )?;
            Ok((Vec::new(), json!({})))
        }
        "Input.synthesizeScrollGesture" => {
            let tab = browser_iab_runtime_tab_clone_for_id(app, tab_id)?;
            let payload = browser_iab_eval_with_callback(
                app,
                &tab,
                browser_iab_synthesize_scroll_gesture_script(&command_params),
            )?;
            browser_iab_expect_ok_payload(payload, "Input.synthesizeScrollGesture failed.")?;
            Ok((Vec::new(), json!({})))
        }
        "Input.dispatchKeyEvent" | "Input.insertText" => {
            let state = app.state::<AppState>();
            refresh_browser_runtime_store(app, &state);
            let store = state
                .browser_runtime
                .lock()
                .expect("browser runtime mutex poisoned");
            let tab = browser_iab_runtime_tab_for_id(&store, tab_id)
                .ok_or_else(|| format!("Browser iab tab {tab_id} is not open."))?;
            let script = if method == "Input.insertText" {
                let text = command_params
                    .get("text")
                    .and_then(Value::as_str)
                    .unwrap_or_default();
                browser_iab_insert_text_script(text)
            } else {
                browser_iab_key_event_script(&command_params)
            };
            browser_iab_eval_with_callback(app, tab, script)?;
            Ok((Vec::new(), json!({})))
        }
        "Page.handleJavaScriptDialog" => Ok((Vec::new(), json!({}))),
        "Runtime.releaseObject"
        | "Page.addScriptToEvaluateOnNewDocument"
        | "Page.removeScriptToEvaluateOnNewDocument" => Ok((
            Vec::new(),
            json!({
                "identifier": "hicodex-probe-script"
            }),
        )),
        "Page.close" => {
            browser_iab_close_tab(app, tab_id)?;
            Ok((Vec::new(), json!({})))
        }
        "Target.closeTarget" => {
            let close_tab_id = command_params
                .get("targetId")
                .and_then(Value::as_str)
                .and_then(browser_iab_tab_id_from_target_id)
                .unwrap_or(tab_id);
            browser_iab_close_tab(app, close_tab_id)?;
            Ok((Vec::new(), json!({ "success": true })))
        }
        "Page.captureScreenshot" => {
            let state = app.state::<AppState>();
            refresh_browser_runtime_store(app, &state);
            let store = state
                .browser_runtime
                .lock()
                .expect("browser runtime mutex poisoned");
            let tab = browser_iab_runtime_tab_for_id(&store, tab_id)
                .ok_or_else(|| format!("Browser iab tab {tab_id} is not open."))?;
            Ok((
                Vec::new(),
                browser_iab_capture_screenshot_result(app, tab, &command_params)?,
            ))
        }
        other => Err(format!(
            "Forge Browser iab probe does not support CDP method {other} yet."
        )),
    }
}

fn browser_iab_execute_unhandled_command(app: &AppHandle, params: &Value) -> Result<Value, String> {
    let command_type = params
        .get("type")
        .and_then(Value::as_str)
        .unwrap_or_default();
    match command_type {
        "playwright_evaluate" => {
            let tab_id = params
                .get("tab_id")
                .and_then(Value::as_str)
                .and_then(|value| value.parse::<usize>().ok())
                .ok_or_else(|| "playwright_evaluate requires numeric tab_id.".to_string())?;
            let script = params
                .get("script")
                .and_then(Value::as_str)
                .ok_or_else(|| "playwright_evaluate requires script.".to_string())?;
            let tab = browser_iab_runtime_tab_clone_for_id(app, tab_id)?;
            let cdp_result = browser_iab_runtime_evaluate_app_result(app, &tab, script)
                .unwrap_or_else(|error| {
                    browser_iab_runtime_evaluate_result(&tab, script, Some(error))
                });
            browser_iab_playwright_evaluate_command_result(cdp_result)
        }
        "playwright_wait_for_load_state" => Ok(json!({})),
        other => Err(format!(
            "Forge Browser iab probe does not support Browser command {other} yet."
        )),
    }
}

fn browser_iab_playwright_evaluate_command_result(cdp_result: Value) -> Result<Value, String> {
    if let Some(exception) = cdp_result.get("exceptionDetails") {
        let text = exception
            .get("text")
            .and_then(Value::as_str)
            .unwrap_or("playwright_evaluate failed.");
        return Err(text.to_string());
    }
    let remote_object = cdp_result
        .get("result")
        .ok_or_else(|| "playwright_evaluate returned no result.".to_string())?;
    let value = if remote_object.get("type").and_then(Value::as_str) == Some("undefined") {
        Value::Null
    } else {
        remote_object.get("value").cloned().unwrap_or(Value::Null)
    };
    Ok(json!({ "value": value }))
}

fn browser_iab_cdp_tab_id(params: &Value) -> Option<usize> {
    params
        .get("target")
        .and_then(|target| target.get("tabId"))
        .and_then(Value::as_u64)
        .and_then(|value| usize::try_from(value).ok())
        .filter(|value| *value > 0)
}

fn browser_iab_runtime_tab_for_id(
    store: &BrowserRuntimeStore,
    iab_tab_id: usize,
) -> Option<&BrowserRuntimeTab> {
    store
        .tabs
        .iter()
        .filter(|tab| tab.open)
        .enumerate()
        .find_map(|(index, tab)| (browser_iab_tab_id(tab, index + 1) == iab_tab_id).then_some(tab))
}

fn browser_iab_runtime_tab_clone_for_id(
    app: &AppHandle,
    iab_tab_id: usize,
) -> Result<BrowserRuntimeTab, String> {
    let state = app.state::<AppState>();
    refresh_browser_runtime_store(app, &state);
    let store = state
        .browser_runtime
        .lock()
        .expect("browser runtime mutex poisoned");
    browser_iab_runtime_tab_for_id(&store, iab_tab_id)
        .cloned()
        .ok_or_else(|| format!("Browser iab tab {iab_tab_id} is not open."))
}

fn browser_iab_tab_id(tab: &BrowserRuntimeTab, fallback: usize) -> usize {
    tab.tab_id
        .strip_prefix("active-")
        .and_then(|value| value.parse::<usize>().ok())
        .filter(|value| *value > 0)
        .unwrap_or(fallback)
}

fn browser_iab_frame_id(tab_id: usize) -> String {
    format!("hicodex-frame-{tab_id}")
}

fn browser_iab_loader_id(tab_id: usize) -> String {
    format!("hicodex-loader-{tab_id}")
}

fn browser_iab_target_id(tab_id: usize) -> String {
    format!("hicodex-target-{tab_id}")
}

fn browser_iab_tab_id_from_target_id(target_id: &str) -> Option<usize> {
    target_id
        .strip_prefix("hicodex-target-")
        .and_then(|value| value.parse::<usize>().ok())
        .filter(|value| *value > 0)
}

fn browser_iab_frame_tree_result(tab_id: usize, tab: &BrowserRuntimeTab) -> Value {
    json!({
        "frameTree": {
            "frame": {
                "id": browser_iab_frame_id(tab_id),
                "loaderId": browser_iab_loader_id(tab_id),
                "url": tab.url,
                "securityOrigin": browser_iab_security_origin(&tab.url),
                "mimeType": "text/html",
            }
        }
    })
}

fn browser_iab_security_origin(url: &str) -> String {
    url.parse::<tauri::Url>()
        .ok()
        .and_then(|parsed| {
            let host = parsed.host_str()?;
            Some(format!("{}://{}", parsed.scheme(), host))
        })
        .unwrap_or_default()
}

fn browser_iab_runtime_evaluate_app_result(
    app: &AppHandle,
    tab: &BrowserRuntimeTab,
    expression: &str,
) -> Result<Value, String> {
    if browser_iab_is_playwright_injection_check_expression(expression) {
        return Ok(json!({
            "result": {
                "type": "boolean",
                "value": true,
            },
        }));
    }
    if browser_iab_is_playwright_injection_install_expression(expression) {
        let payload = browser_iab_eval_with_callback(
            app,
            tab,
            browser_iab_minimal_playwright_injection_script(),
        );
        return Ok(match payload {
            Ok(payload) => browser_iab_runtime_evaluate_result_from_payload(payload),
            Err(_) => json!({
                "result": {
                    "type": "undefined",
                },
            }),
        });
    }
    let rewritten_expression = browser_iab_rewrite_playwright_async_wrapper(expression);
    let expression = rewritten_expression.as_deref().unwrap_or(expression);
    let is_aria_snapshot = browser_iab_is_playwright_aria_snapshot_expression(expression);
    let script = if is_aria_snapshot {
        browser_iab_accessibility_snapshot_script()
    } else {
        browser_iab_runtime_evaluate_script(expression)
    };
    let payload = match browser_iab_eval_with_callback(app, tab, script) {
        Ok(payload) => payload,
        Err(_) if is_aria_snapshot => {
            return Ok(json!({
                "result": {
                    "type": "string",
                    "value": "",
                },
            }));
        }
        Err(error) => return Err(error),
    };
    Ok(browser_iab_runtime_evaluate_result_from_payload(payload))
}

fn browser_iab_is_playwright_aria_snapshot_expression(expression: &str) -> bool {
    expression.contains("ariaSnapshot")
}

fn browser_iab_is_playwright_injection_check_expression(expression: &str) -> bool {
    expression.contains("!!window.__codexPlaywrightInjected")
}

fn browser_iab_is_playwright_injection_install_expression(expression: &str) -> bool {
    expression.contains("__codexPlaywrightInjected")
        && (expression.contains("var PlaywrightInjected")
            || expression.contains("new PlaywrightInjected")
            || expression.contains("InjectedScript(window"))
}

fn browser_iab_rewrite_playwright_async_wrapper(expression: &str) -> Option<String> {
    let trimmed = expression.trim_start();
    if trimmed.starts_with("(async () =>") && expression.contains("return await ") {
        return Some(expression.replacen("(async () =>", "(() =>", 1).replacen(
            "return await ",
            "return ",
            1,
        ));
    }
    if expression.contains("const runUserScript = async () => {")
        && expression.contains("return await (async function () {")
        && expression.contains("return runUserScript().then(serializeResult);")
    {
        return Some(
            expression
                .replace(
                    "const runUserScript = async () => {",
                    "const runUserScript = () => {",
                )
                .replace("return await (async function () {", "return (function () {")
                .replace(
                    "return await __playwrightEvaluate(arg);",
                    "return __playwrightEvaluate(arg);",
                )
                .replace(
                    "return runUserScript().then(serializeResult);",
                    "return serializeResult(runUserScript());",
                ),
        );
    }
    if expression.contains("const __playwrightEvaluate =")
        && expression.contains("return await __playwrightEvaluate(arg);")
    {
        let rewritten = expression.replace(
            "return await __playwrightEvaluate(arg);",
            "return __playwrightEvaluate(arg);",
        );
        return Some(format!("(() => {{\n{rewritten}\n}})()"));
    }
    None
}

fn browser_iab_runtime_evaluate_result(
    tab: &BrowserRuntimeTab,
    expression: &str,
    fallback_error: Option<String>,
) -> Value {
    if expression.contains("window.location.href") && expression.contains("document.readyState") {
        return json!({
            "result": {
                "type": "object",
                "value": {
                    "href": tab.url,
                    "readyState": "complete",
                }
            }
        });
    }
    if expression.contains("window.devicePixelRatio") {
        return json!({
            "result": {
                "type": "number",
                "value": 1,
            }
        });
    }
    if expression.contains("document.title") {
        return json!({
            "result": {
                "type": "string",
                "value": tab.title,
            }
        });
    }
    let text = fallback_error.unwrap_or_else(|| {
        "Forge Browser iab probe supports only basic read-only Runtime.evaluate calls."
            .to_string()
    });
    json!({
        "exceptionDetails": {
            "text": text,
        }
    })
}

fn browser_iab_runtime_evaluate_result_from_payload(payload: Value) -> Value {
    if payload.get("ok").and_then(Value::as_bool) == Some(true) {
        if let Some(remote_object) = payload.get("remoteObject") {
            return json!({
                "result": remote_object,
            });
        }
        return json!({
            "result": browser_iab_remote_object_from_value(payload.get("value").unwrap_or(&Value::Null)),
        });
    }
    if payload.get("ok").and_then(Value::as_bool) == Some(false) {
        let text = payload
            .get("text")
            .and_then(Value::as_str)
            .unwrap_or("Runtime.evaluate failed.");
        let description = payload
            .get("description")
            .and_then(Value::as_str)
            .unwrap_or(text);
        return json!({
            "exceptionDetails": {
                "text": text,
                "exception": {
                    "type": "object",
                    "description": description,
                },
            },
        });
    }
    json!({
        "result": browser_iab_remote_object_from_value(&payload),
    })
}

fn browser_iab_remote_object_from_value(value: &Value) -> Value {
    match value {
        Value::Null => json!({
            "type": "object",
            "subtype": "null",
            "value": Value::Null,
        }),
        Value::Bool(value) => json!({
            "type": "boolean",
            "value": value,
        }),
        Value::Number(value) => json!({
            "type": "number",
            "value": value,
        }),
        Value::String(value) => json!({
            "type": "string",
            "value": value,
        }),
        Value::Array(_) => json!({
            "type": "object",
            "subtype": "array",
            "value": value,
        }),
        Value::Object(_) => json!({
            "type": "object",
            "value": value,
        }),
    }
}

fn browser_iab_eval_with_callback(
    app: &AppHandle,
    tab: &BrowserRuntimeTab,
    script: String,
) -> Result<Value, String> {
    let label = browser_window_label(&tab.tab_id);
    let window = app
        .get_webview_window(&label)
        .ok_or_else(|| format!("Browser iab tab {} has no live webview window.", tab.tab_id))?;
    let (tx, rx) = mpsc::channel();
    let callback_script = browser_iab_eval_callback_script(&script);
    window
        .eval_with_callback(callback_script, move |result| {
            let _ = tx.send(result);
        })
        .map_err(|error| format!("failed to evaluate Browser iab JavaScript: {error}"))?;
    let raw = rx
        .recv_timeout(BROWSER_IAB_EVAL_TIMEOUT)
        .map_err(|_| "timed out waiting for Browser iab JavaScript evaluation.".to_string())?;
    browser_iab_parse_eval_callback_result(&raw).map_err(|error| {
        format!("failed to parse Browser iab JavaScript evaluation result {raw:?}: {error}")
    })
}

fn browser_iab_eval_callback_script(script: &str) -> String {
    let script = browser_iab_json_string_literal(script);
    let mut wrapper = String::from(
        r#"(() => {
  const __hicodexEvalSource = "#,
    );
    wrapper.push_str(&script);
    wrapper.push_str(
        r#";
  try {
    const __hicodexEvalResult = (0, eval)(__hicodexEvalSource);
    return JSON.stringify(__hicodexEvalResult === undefined ? null : __hicodexEvalResult);
  } catch (error) {
    return JSON.stringify({
      ok: false,
      text: error && error.message ? String(error.message) : String(error),
      description: error && error.stack ? String(error.stack) : String(error),
    });
  }
})()"#,
    );
    wrapper
}

fn browser_iab_parse_eval_callback_result(raw: &str) -> Result<Value, serde_json::Error> {
    if raw.trim().is_empty() {
        return Ok(Value::Null);
    }
    let parsed = serde_json::from_str::<Value>(raw)?;
    if let Some(nested) = parsed
        .as_str()
        .map(str::trim)
        .filter(|value| !value.is_empty())
    {
        if let Ok(value) = serde_json::from_str::<Value>(nested) {
            return Ok(value);
        }
    }
    Ok(parsed)
}

fn browser_iab_runtime_evaluate_script(expression: &str) -> String {
    let expression = browser_iab_json_string_literal(expression);
    let mut script = String::from(
        r#"(() => {
  const __hicodexExpression = "#,
    );
    script.push_str(&expression);
    script.push_str(
        r#";
  const __hicodexSerialize = (value, depth = 0) => {
    if (value === undefined) return { type: "undefined" };
    if (value === null) return { type: "object", subtype: "null", value: null };
    const valueType = typeof value;
    if (valueType === "string" || valueType === "number" || valueType === "boolean") {
      return { type: valueType, value };
    }
    if (valueType === "bigint") return { type: "bigint", description: String(value) };
    if (valueType === "function") return { type: "function", description: value.name || "function" };
    if (valueType === "symbol") return { type: "symbol", description: String(value) };
    if (depth > 3) return { type: "object", description: Object.prototype.toString.call(value) };
    try {
      return {
        type: "object",
        subtype: Array.isArray(value) ? "array" : undefined,
        value: JSON.parse(JSON.stringify(value)),
      };
    } catch {
      return { type: "object", description: Object.prototype.toString.call(value) };
    }
  };
  try {
    const __hicodexSource = String(__hicodexExpression || "");
    const __hicodexTrimmed = __hicodexSource.trim();
    const __hicodexValue = __hicodexTrimmed.startsWith("const arg")
      && __hicodexTrimmed.includes("const __playwrightEvaluate =")
      && __hicodexTrimmed.includes("return ")
        ? (new Function(__hicodexTrimmed.replace("return await __playwrightEvaluate(arg);", "return __playwrightEvaluate(arg);")))()
        : (0, eval)(__hicodexSource);
    if (__hicodexValue && typeof __hicodexValue.then === "function") {
      return {
        ok: false,
        text: "Forge Browser iab probe cannot await Promise results from Runtime.evaluate.",
        description: "Use a synchronous expression or a supported Browser iab evaluate path.",
      };
    }
    return { ok: true, remoteObject: __hicodexSerialize(__hicodexValue) };
  } catch (error) {
    return {
      ok: false,
      text: error && error.message ? String(error.message) : String(error),
      description: error && error.stack ? String(error.stack) : String(error),
    };
  }
})()"#,
    );
    script
}

fn browser_iab_accessibility_snapshot_script() -> String {
    r#"(() => {
  const maxLines = 180;
  const maxCandidates = 480;
  const lines = [];
  const textNameRoles = new Set(["heading", "button", "link", "listitem"]);
  const normalize = (value) => String(value || "").replace(/\s+/g, " ").trim();
  const visible = (element) => {
    if (!element || element.nodeType !== Node.ELEMENT_NODE) return true;
    const style = window.getComputedStyle(element);
    if (style.display === "none" || style.visibility === "hidden" || style.opacity === "0") return false;
    const rect = element.getBoundingClientRect();
    return rect.width > 0 && rect.height > 0;
  };
  const roleFor = (element) => {
    const explicit = normalize(element.getAttribute("role"));
    if (explicit) return explicit;
    const tag = element.tagName;
    if (/^H[1-6]$/.test(tag)) return "heading";
    if (tag === "A" && element.hasAttribute("href")) return "link";
    if (tag === "BUTTON") return "button";
    if (tag === "TEXTAREA") return "textbox";
    if (tag === "SELECT") return "combobox";
    if (tag === "NAV") return "navigation";
    if (tag === "MAIN") return "main";
    if (tag === "ARTICLE") return "article";
    if (tag === "SECTION") return "region";
    if (tag === "UL" || tag === "OL") return "list";
    if (tag === "LI") return "listitem";
    if (tag === "IMG") return "img";
    if (tag === "INPUT") {
      const type = normalize(element.getAttribute("type")).toLowerCase();
      if (type === "checkbox") return "checkbox";
      if (type === "radio") return "radio";
      if (type === "submit" || type === "button") return "button";
      return "textbox";
    }
    return "";
  };
  const nameFor = (element, role) => {
    const labelledBy = normalize(element.getAttribute("aria-labelledby"));
    if (labelledBy) {
      const text = labelledBy
        .split(/\s+/)
        .map((id) => normalize(document.getElementById(id)?.textContent))
        .filter(Boolean)
        .join(" ");
      if (text) return text;
    }
    const direct = normalize(element.getAttribute("aria-label"))
      || normalize(element.getAttribute("alt"))
      || normalize(element.getAttribute("title"))
      || normalize(element.getAttribute("placeholder"))
      || normalize(element.value);
    if (direct) return direct;
    if (!textNameRoles.has(role)) return "";
    const text = normalize(element.textContent);
    if (role && text) return text.slice(0, 120);
    return "";
  };
  const pushLine = (role, name, extra = "") => {
    if (lines.length >= maxLines) return;
    const quoted = name ? ` "${name.replace(/"/g, '\\"')}"` : "";
    lines.push(`- ${role}${quoted}${extra}`);
  };
  const selector = [
    "[role]",
    "[aria-label]",
    "[aria-labelledby]",
    "a[href]",
    "button",
    "input",
    "textarea",
    "select",
    "summary",
    "h1,h2,h3,h4,h5,h6",
    "nav",
    "main",
    "article",
    "section",
    "li",
    "img[alt]"
  ].join(",");
  const addCandidate = (element) => {
    if (lines.length >= maxLines || !visible(element)) return;
    const role = roleFor(element);
    if (!role) return;
    const name = nameFor(element, role);
    let extra = "";
    if (role === "heading") {
      const level = Number(element.tagName.slice(1));
      if (Number.isFinite(level)) extra = ` [level=${level}]`;
    }
    pushLine(role, name, extra);
  };
  try {
    const candidates = Array.from(document.querySelectorAll(selector)).slice(0, maxCandidates);
    for (const element of candidates) addCandidate(element);
    if (lines.length === 0) {
      const text = normalize((document.body || document.documentElement)?.textContent).slice(0, 240);
      if (text) pushLine("text", text);
    }
    return { ok: true, remoteObject: { type: "string", value: lines.join("\n") } };
  } catch (error) {
    return {
      ok: false,
      text: error && error.message ? String(error.message) : String(error),
      description: error && error.stack ? String(error.stack) : String(error),
    };
  }
})()"#
    .to_string()
}

fn browser_iab_minimal_playwright_injection_script() -> String {
    r#"(() => {
  const normalize = (value) => String(value || "").replace(/\s+/g, " ").trim();
  const snapshot = (root) => {
    const scope = root && root.nodeType ? root : document.body || document.documentElement;
    const lines = [];
    const add = (role, name) => {
      if (lines.length >= 120) return;
      const text = normalize(name).slice(0, 140).replace(/"/g, '\\"');
      lines.push(text ? `- ${role} "${text}"` : `- ${role}`);
    };
    const selector = [
      "[role]",
      "[aria-label]",
      "a[href]",
      "button",
      "input",
      "textarea",
      "select",
      "h1,h2,h3,h4,h5,h6",
      "img[alt]"
    ].join(",");
    const roleFor = (element) => {
      const explicit = normalize(element.getAttribute("role"));
      if (explicit) return explicit;
      const tag = element.tagName;
      if (/^H[1-6]$/.test(tag)) return "heading";
      if (tag === "A" && element.hasAttribute("href")) return "link";
      if (tag === "BUTTON") return "button";
      if (tag === "TEXTAREA") return "textbox";
      if (tag === "SELECT") return "combobox";
      if (tag === "IMG") return "img";
      if (tag === "INPUT") {
        const type = normalize(element.getAttribute("type")).toLowerCase();
        if (type === "checkbox") return "checkbox";
        if (type === "radio") return "radio";
        if (type === "submit" || type === "button") return "button";
        return "textbox";
      }
      return "generic";
    };
    const nameFor = (element, role) => {
      const direct = normalize(element.getAttribute("aria-label"))
        || normalize(element.getAttribute("alt"))
        || normalize(element.getAttribute("title"))
        || normalize(element.getAttribute("placeholder"))
        || normalize(element.value);
      if (direct) return direct;
      if (role === "heading" || role === "button" || role === "link") {
        return normalize(element.textContent);
      }
      return "";
    };
    try {
      const candidates = Array.from((scope || document).querySelectorAll(selector)).slice(0, 360);
      for (const element of candidates) {
        const style = window.getComputedStyle(element);
        const rect = element.getBoundingClientRect();
        if (style.display === "none" || style.visibility === "hidden" || rect.width <= 0 || rect.height <= 0) continue;
        const role = roleFor(element);
        add(role, nameFor(element, role));
      }
    } catch {}
    if (lines.length === 0) {
      add("text", normalize(scope?.textContent || document.title || "").slice(0, 240));
    }
    return lines.join("\n");
  };
  Object.defineProperty(window, "__codexPlaywrightInjected", {
    configurable: true,
    enumerable: false,
    value: { ariaSnapshot: snapshot },
    writable: true,
  });
  return { ok: true, remoteObject: { type: "undefined" } };
})()"#
    .to_string()
}

fn browser_iab_dom_document_result(tab_id: usize, tab: &BrowserRuntimeTab) -> Value {
    json!({
        "root": {
            "nodeId": 1,
            "backendNodeId": 1,
            "nodeType": 9,
            "nodeName": "#document",
            "localName": "",
            "nodeValue": "",
            "documentURL": tab.url,
            "baseURL": tab.url,
            "frameId": browser_iab_frame_id(tab_id),
            "childNodeCount": 1,
        }
    })
}

fn browser_iab_dom_query_selector_result_from_payload(payload: Value) -> Result<Value, String> {
    browser_iab_expect_ok_payload(payload, "DOM.querySelector failed.").map(|payload| {
        json!({
            "nodeId": payload.get("nodeId").and_then(Value::as_u64).unwrap_or(0),
        })
    })
}

fn browser_iab_dom_node_result_from_payload(payload: Value) -> Result<Value, String> {
    browser_iab_expect_ok_payload(payload, "DOM.describeNode failed.").and_then(|payload| {
        let node = payload
            .get("node")
            .cloned()
            .ok_or_else(|| "DOM.describeNode returned no node.".to_string())?;
        Ok(json!({ "node": node }))
    })
}

fn browser_iab_dom_node_for_location_result_from_payload(payload: Value) -> Result<Value, String> {
    browser_iab_expect_ok_payload(payload, "DOM.getNodeForLocation failed.").map(|payload| {
        let backend_node_id = payload
            .get("backendNodeId")
            .and_then(Value::as_u64)
            .unwrap_or(0);
        let node_id = payload
            .get("nodeId")
            .and_then(Value::as_u64)
            .unwrap_or(backend_node_id);
        let frame_id = payload
            .get("frameId")
            .and_then(Value::as_str)
            .unwrap_or_default();
        json!({
            "backendNodeId": backend_node_id,
            "nodeId": node_id,
            "frameId": frame_id,
        })
    })
}

fn browser_iab_dom_frame_owner_result_from_payload(payload: Value) -> Result<Value, String> {
    browser_iab_expect_ok_payload(payload, "DOM.getFrameOwner failed.").map(|payload| {
        let backend_node_id = payload
            .get("backendNodeId")
            .and_then(Value::as_u64)
            .unwrap_or(0);
        let node_id = payload
            .get("nodeId")
            .and_then(Value::as_u64)
            .unwrap_or(backend_node_id);
        json!({
            "backendNodeId": backend_node_id,
            "nodeId": node_id,
        })
    })
}

fn browser_iab_dom_content_quads_result_from_payload(payload: Value) -> Result<Value, String> {
    browser_iab_expect_ok_payload(payload, "DOM.getContentQuads failed.").and_then(|payload| {
        let quads = payload
            .get("quads")
            .cloned()
            .ok_or_else(|| "DOM.getContentQuads returned no quads.".to_string())?;
        Ok(json!({ "quads": quads }))
    })
}

fn browser_iab_dom_box_model_result_from_payload(payload: Value) -> Result<Value, String> {
    browser_iab_expect_ok_payload(payload, "DOM.getBoxModel failed.").and_then(|payload| {
        let model = payload
            .get("model")
            .cloned()
            .ok_or_else(|| "DOM.getBoxModel returned no model.".to_string())?;
        Ok(json!({ "model": model }))
    })
}

fn browser_iab_expect_ok_payload(payload: Value, fallback: &str) -> Result<Value, String> {
    if payload.get("ok").and_then(Value::as_bool) == Some(true) {
        return Ok(payload);
    }
    Err(payload
        .get("text")
        .and_then(Value::as_str)
        .unwrap_or(fallback)
        .to_string())
}

fn browser_iab_dom_query_selector_script(params: &Value) -> String {
    let params = browser_iab_json_value_literal(params);
    let mut script = String::from(
        r#"(() => {
"#,
    );
    script.push_str(browser_iab_dom_registry_prelude());
    script.push_str(
        r#"
  const params = "#,
    );
    script.push_str(&params);
    script.push_str(
        r#";
  try {
    const registry = __hicodexCdpRegistry();
    const selector = String(params.selector || "");
    if (!selector) return { ok: false, text: "DOM.querySelector requires selector." };
    const root = registry.nodeFor(Number(params.nodeId || params.backendNodeId || 1)) || document;
    const element = typeof root.querySelector === "function" ? root.querySelector(selector) : null;
    if (!element) return { ok: true, nodeId: 0 };
    return { ok: true, nodeId: registry.idFor(element) };
  } catch (error) {
    return { ok: false, text: error && error.message ? String(error.message) : String(error) };
  }
})()"#,
    );
    script
}

fn browser_iab_dom_describe_node_script(tab_id: usize, params: &Value) -> String {
    let params = browser_iab_json_value_literal(params);
    let frame_id = browser_iab_json_string_literal(&browser_iab_frame_id(tab_id));
    let mut script = String::from(
        r#"(() => {
"#,
    );
    script.push_str(browser_iab_dom_registry_prelude());
    script.push_str(
        r#"
  const params = "#,
    );
    script.push_str(&params);
    script.push_str(
        r#";
  const frameId = "#,
    );
    script.push_str(&frame_id);
    script.push_str(
        r#";
  try {
    const registry = __hicodexCdpRegistry();
    const id = Number(params.nodeId || params.backendNodeId || 1);
    const node = registry.nodeFor(id);
    if (!node) return { ok: false, text: "DOM node is not available." };
    return { ok: true, node: registry.describe(node, id, frameId) };
  } catch (error) {
    return { ok: false, text: error && error.message ? String(error.message) : String(error) };
  }
})()"#,
    );
    script
}

fn browser_iab_dom_node_for_location_script(tab_id: usize, params: &Value) -> String {
    let params = browser_iab_json_value_literal(params);
    let frame_id = browser_iab_json_string_literal(&browser_iab_frame_id(tab_id));
    let mut script = String::from(
        r#"(() => {
"#,
    );
    script.push_str(browser_iab_dom_registry_prelude());
    script.push_str(
        r#"
  const params = "#,
    );
    script.push_str(&params);
    script.push_str(
        r#";
  const frameId = "#,
    );
    script.push_str(&frame_id);
    script.push_str(
        r#";
  try {
    const x = Number(params.x);
    const y = Number(params.y);
    if (!Number.isFinite(x) || !Number.isFinite(y)) {
      return { ok: false, text: "DOM.getNodeForLocation requires finite x and y." };
    }
    const registry = __hicodexCdpRegistry();
    const element = document.elementFromPoint(x, y);
    if (!element) return { ok: true, nodeId: 0, backendNodeId: 0, frameId };
    const id = registry.idFor(element);
    return { ok: true, nodeId: id, backendNodeId: id, frameId };
  } catch (error) {
    return { ok: false, text: error && error.message ? String(error.message) : String(error) };
  }
})()"#,
    );
    script
}

fn browser_iab_dom_frame_owner_script(tab_id: usize, params: &Value) -> String {
    let params = browser_iab_json_value_literal(params);
    let frame_id = browser_iab_json_string_literal(&browser_iab_frame_id(tab_id));
    let mut script = String::from(
        r#"(() => {
"#,
    );
    script.push_str(browser_iab_dom_registry_prelude());
    script.push_str(
        r#"
  const params = "#,
    );
    script.push_str(&params);
    script.push_str(
        r#";
  const frameId = "#,
    );
    script.push_str(&frame_id);
    script.push_str(
        r#";
  try {
    const requestedFrameId = String(params.frameId || "");
    if (!requestedFrameId || requestedFrameId === frameId) {
      return { ok: false, text: "DOM.getFrameOwner requires a child frameId." };
    }
    const registry = __hicodexCdpRegistry();
    const frames = Array.from(document.querySelectorAll("iframe,frame"));
    for (const frame of frames) {
      const id = registry.idFor(frame);
      if (requestedFrameId === `${frameId}-child-${id}`) {
        return { ok: true, nodeId: id, backendNodeId: id };
      }
    }
    return { ok: false, text: "DOM frame owner is not available in the lightweight Browser iab registry." };
  } catch (error) {
    return { ok: false, text: error && error.message ? String(error.message) : String(error) };
  }
})()"#,
    );
    script
}

fn browser_iab_dom_geometry_script(params: &Value, kind: &str) -> String {
    let params = browser_iab_json_value_literal(params);
    let kind = browser_iab_json_string_literal(kind);
    let mut script = String::from(
        r#"(() => {
"#,
    );
    script.push_str(browser_iab_dom_registry_prelude());
    script.push_str(
        r#"
  const params = "#,
    );
    script.push_str(&params);
    script.push_str(
        r#";
  const kind = "#,
    );
    script.push_str(&kind);
    script.push_str(
        r#";
  try {
    const registry = __hicodexCdpRegistry();
    const id = Number(params.nodeId || params.backendNodeId || 1);
    const node = registry.nodeFor(id);
    if (!node) return { ok: false, text: "DOM node is not available." };
    const geometry = registry.geometry(node);
    if (!geometry) return { ok: false, text: "DOM node geometry is not available." };
    if (kind === "quads") return { ok: true, quads: [geometry.quad] };
    return {
      ok: true,
      model: {
        content: geometry.quad,
        padding: geometry.quad,
        border: geometry.quad,
        margin: geometry.quad,
        width: geometry.width,
        height: geometry.height,
      },
    };
  } catch (error) {
    return { ok: false, text: error && error.message ? String(error.message) : String(error) };
  }
})()"#,
    );
    script
}

fn browser_iab_dom_scroll_into_view_script(params: &Value) -> String {
    let params = browser_iab_json_value_literal(params);
    let mut script = String::from(
        r#"(() => {
"#,
    );
    script.push_str(browser_iab_dom_registry_prelude());
    script.push_str(
        r#"
  const params = "#,
    );
    script.push_str(&params);
    script.push_str(
        r#";
  try {
    const registry = __hicodexCdpRegistry();
    const id = Number(params.nodeId || params.backendNodeId || 1);
    const node = registry.nodeFor(id);
    const element = registry.elementFor(node);
    if (!element) return { ok: false, text: "DOM node is not scrollable into view." };
    element.scrollIntoView({ block: "center", inline: "center", behavior: "instant" });
    return { ok: true };
  } catch (error) {
    return { ok: false, text: error && error.message ? String(error.message) : String(error) };
  }
})()"#,
    );
    script
}

fn browser_iab_synthesize_scroll_gesture_script(params: &Value) -> String {
    let params = browser_iab_json_value_literal(params);
    let mut script = String::from(
        r#"(() => {
  const params = "#,
    );
    script.push_str(&params);
    script.push_str(
        r#";
  try {
    const x = Number(params.x || window.innerWidth / 2 || 0);
    const y = Number(params.y || window.innerHeight / 2 || 0);
    const left = -Number(params.xDistance || 0);
    const top = -Number(params.yDistance || 0);
    const findScrollable = (node) => {
      let current = node && node.nodeType === 1 ? node : document.scrollingElement || document.documentElement;
      while (current && current !== document.body && current !== document.documentElement) {
        const style = window.getComputedStyle(current);
        const overflowY = style.overflowY || "";
        const overflowX = style.overflowX || "";
        const canY = /(auto|scroll|overlay)/.test(overflowY) && current.scrollHeight > current.clientHeight;
        const canX = /(auto|scroll|overlay)/.test(overflowX) && current.scrollWidth > current.clientWidth;
        if (canY || canX) return current;
        current = current.parentElement;
      }
      return document.scrollingElement || document.documentElement;
    };
    const target = findScrollable(document.elementFromPoint(x, y));
    if (target === document.documentElement || target === document.body || target === document.scrollingElement) {
      window.scrollBy({ left, top, behavior: "instant" });
    } else {
      target.scrollBy({ left, top, behavior: "instant" });
    }
    return { ok: true };
  } catch (error) {
    return { ok: false, text: error && error.message ? String(error.message) : String(error) };
  }
})()"#,
    );
    script
}

fn browser_iab_dom_registry_prelude() -> &'static str {
    r#"
  const __hicodexCdpRegistry = () => {
    const key = "__hicodexCdpNodeRegistry";
    const create = () => {
      const state = {
        document,
        nextId: 2,
        ids: new WeakMap(),
        nodes: new Map(),
      };
      state.ids.set(document, 1);
      state.nodes.set(1, document);
      return state;
    };
    let state = globalThis[key];
    if (!state || state.document !== document) {
      state = create();
      Object.defineProperty(globalThis, key, {
        configurable: true,
        enumerable: false,
        value: state,
        writable: true,
      });
    }
    state.idFor = (node) => {
      if (!node || typeof node !== "object") return 0;
      const existing = state.ids.get(node);
      if (existing) return existing;
      const id = state.nextId++;
      state.ids.set(node, id);
      state.nodes.set(id, node);
      return id;
    };
    state.nodeFor = (id) => {
      const numeric = Number(id || 1);
      return state.nodes.get(numeric) || null;
    };
    state.elementFor = (node) => {
      if (!node) return null;
      if (node.nodeType === Node.DOCUMENT_NODE) return document.documentElement || document.body;
      if (node.nodeType === Node.ELEMENT_NODE) return node;
      return node.parentElement || null;
    };
    state.describe = (node, id, frameId) => {
      const attributes = [];
      if (node.attributes) {
        for (const attr of Array.from(node.attributes)) {
          attributes.push(attr.name, attr.value);
        }
      }
      const description = {
        nodeId: Number(id || state.idFor(node)),
        backendNodeId: Number(id || state.idFor(node)),
        nodeType: Number(node.nodeType || 0),
        nodeName: String(node.nodeName || ""),
        localName: String(node.localName || ""),
        nodeValue: String(node.nodeValue || ""),
        childNodeCount: Number(node.childNodes ? node.childNodes.length : 0),
      };
      if (attributes.length > 0) description.attributes = attributes;
      if (node.nodeType === Node.DOCUMENT_NODE) {
        description.documentURL = String(document.location.href || "");
        description.baseURL = String(document.baseURI || document.location.href || "");
        description.frameId = frameId;
      }
      if (node instanceof HTMLIFrameElement || node instanceof HTMLFrameElement) {
        description.frameId = frameId + "-child-" + Number(id || state.idFor(node));
      }
      return description;
    };
    state.geometry = (node) => {
      const element = state.elementFor(node);
      if (!element || typeof element.getBoundingClientRect !== "function") return null;
      const rect = element.getBoundingClientRect();
      const left = Number(rect.left || 0);
      const top = Number(rect.top || 0);
      const right = Number(rect.right || left + Math.max(Number(rect.width || 0), 1));
      const bottom = Number(rect.bottom || top + Math.max(Number(rect.height || 0), 1));
      const width = Math.max(Number(rect.width || right - left || 1), 1);
      const height = Math.max(Number(rect.height || bottom - top || 1), 1);
      return {
        quad: [left, top, right, top, right, bottom, left, bottom],
        width,
        height,
      };
    };
    return state;
  };
"#
}

fn browser_iab_layout_metrics_result(
    app: &AppHandle,
    tab: &BrowserRuntimeTab,
) -> Result<Value, String> {
    let payload = browser_iab_eval_with_callback(app, tab, browser_iab_layout_metrics_script())?;
    if payload.get("ok").and_then(Value::as_bool) == Some(true) {
        if let Some(value) = payload.get("value") {
            return Ok(browser_iab_layout_metrics_from_value(value));
        }
    }
    Err(payload
        .get("text")
        .and_then(Value::as_str)
        .unwrap_or("Page.getLayoutMetrics evaluation failed.")
        .to_string())
}

fn browser_iab_layout_metrics_script() -> String {
    r#"(() => {
  try {
    const doc = document.documentElement || document.body;
    const body = document.body || doc;
    const viewport = window.visualViewport;
    const pageX = Number(window.scrollX || viewport?.pageLeft || 0);
    const pageY = Number(window.scrollY || viewport?.pageTop || 0);
    const clientWidth = Number(viewport?.width || window.innerWidth || doc?.clientWidth || 1280);
    const clientHeight = Number(viewport?.height || window.innerHeight || doc?.clientHeight || 720);
    const contentWidth = Math.max(
      Number(doc?.scrollWidth || 0),
      Number(body?.scrollWidth || 0),
      Number(doc?.clientWidth || 0),
      clientWidth
    );
    const contentHeight = Math.max(
      Number(doc?.scrollHeight || 0),
      Number(body?.scrollHeight || 0),
      Number(doc?.clientHeight || 0),
      clientHeight
    );
    return {
      ok: true,
      value: {
        pageX,
        pageY,
        clientWidth,
        clientHeight,
        contentWidth,
        contentHeight,
        scale: Number(viewport?.scale || 1),
      },
    };
  } catch (error) {
    return {
      ok: false,
      text: error && error.message ? String(error.message) : String(error),
    };
  }
})()"#
        .to_string()
}

fn browser_iab_layout_metrics_from_value(value: &Value) -> Value {
    let page_x = value.get("pageX").and_then(Value::as_f64).unwrap_or(0.0);
    let page_y = value.get("pageY").and_then(Value::as_f64).unwrap_or(0.0);
    let client_width = value
        .get("clientWidth")
        .and_then(Value::as_f64)
        .filter(|value| *value > 0.0)
        .unwrap_or(1280.0);
    let client_height = value
        .get("clientHeight")
        .and_then(Value::as_f64)
        .filter(|value| *value > 0.0)
        .unwrap_or(720.0);
    let content_width = value
        .get("contentWidth")
        .and_then(Value::as_f64)
        .filter(|value| *value > 0.0)
        .unwrap_or(client_width);
    let content_height = value
        .get("contentHeight")
        .and_then(Value::as_f64)
        .filter(|value| *value > 0.0)
        .unwrap_or(client_height);
    let scale = value.get("scale").and_then(Value::as_f64).unwrap_or(1.0);
    json!({
        "layoutViewport": {
            "pageX": page_x,
            "pageY": page_y,
            "clientWidth": client_width,
            "clientHeight": client_height,
        },
        "visualViewport": {
            "pageX": page_x,
            "pageY": page_y,
            "clientWidth": client_width,
            "clientHeight": client_height,
            "scale": scale,
        },
        "contentSize": {
            "x": 0,
            "y": 0,
            "width": content_width,
            "height": content_height,
        },
        "cssLayoutViewport": {
            "pageX": page_x,
            "pageY": page_y,
            "clientWidth": client_width,
            "clientHeight": client_height,
        },
        "cssVisualViewport": {
            "pageX": page_x,
            "pageY": page_y,
            "clientWidth": client_width,
            "clientHeight": client_height,
            "scale": scale,
        },
        "cssContentSize": {
            "x": 0,
            "y": 0,
            "width": content_width,
            "height": content_height,
        },
    })
}

fn browser_iab_default_layout_metrics_result() -> Value {
    browser_iab_layout_metrics_from_value(&json!({
        "pageX": 0,
        "pageY": 0,
        "clientWidth": 1280,
        "clientHeight": 720,
        "contentWidth": 1280,
        "contentHeight": 720,
        "scale": 1,
    }))
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
struct BrowserIabScreenshotRegion {
    x: i32,
    y: i32,
    width: u32,
    height: u32,
}

fn browser_iab_capture_screenshot_result(
    app: &AppHandle,
    tab: &BrowserRuntimeTab,
    params: &Value,
) -> Result<Value, String> {
    let bytes = browser_iab_capture_screenshot_bytes(app, tab, params)?;
    Ok(json!({
        "data": general_purpose::STANDARD.encode(bytes),
    }))
}

#[cfg(target_os = "macos")]
fn browser_iab_capture_screenshot_bytes(
    app: &AppHandle,
    tab: &BrowserRuntimeTab,
    params: &Value,
) -> Result<Vec<u8>, String> {
    let label = browser_window_label(&tab.tab_id);
    let window = app
        .get_webview_window(&label)
        .ok_or_else(|| format!("Browser iab tab {} has no live webview window.", tab.tab_id))?;
    let _ = window.show();
    let _ = window.set_focus();
    thread::sleep(Duration::from_millis(120));
    let position = window
        .inner_position()
        .map_err(|error| format!("failed to read Browser window position: {error}"))?;
    let size = window
        .inner_size()
        .map_err(|error| format!("failed to read Browser window size: {error}"))?;
    let region = browser_iab_logical_window_region(
        position.x,
        position.y,
        size.width,
        size.height,
        window.scale_factor().unwrap_or(1.0),
    );
    let region = browser_iab_screenshot_region(region, params);
    let (capture_type, extension) = browser_iab_screenshot_format_and_extension(params);
    let nanos = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|value| value.as_nanos())
        .unwrap_or_default();
    let output_path = env::temp_dir().join(format!(
        "hicodex-browser-iab-screenshot-{}-{nanos}.{extension}",
        std::process::id()
    ));
    let rect = format!(
        "{},{},{},{}",
        region.x, region.y, region.width, region.height
    );
    let output = Command::new("/usr/sbin/screencapture")
        .args(["-x", "-t", capture_type, "-R", &rect])
        .arg(&output_path)
        .output()
        .map_err(|error| format!("failed to run macOS screencapture: {error}"))?;
    if !output.status.success() {
        let _ = fs::remove_file(&output_path);
        let stderr = String::from_utf8_lossy(&output.stderr).trim().to_string();
        let detail = if stderr.is_empty() {
            output.status.to_string()
        } else {
            stderr
        };
        return Err(format!(
            "macOS screencapture failed for Browser iab visible-window screenshot: {detail}. Check Screen Recording permission for Forge."
        ));
    }
    let bytes = fs::read(&output_path)
        .map_err(|error| format!("failed to read Browser iab screenshot: {error}"))?;
    let _ = fs::remove_file(&output_path);
    if bytes.is_empty() {
        return Err(
            "macOS screencapture produced an empty Browser iab screenshot; check Screen Recording permission."
                .to_string(),
        );
    }
    Ok(bytes)
}

#[cfg(not(target_os = "macos"))]
fn browser_iab_capture_screenshot_bytes(
    _app: &AppHandle,
    _tab: &BrowserRuntimeTab,
    _params: &Value,
) -> Result<Vec<u8>, String> {
    Err(
        "Forge Browser iab visible-window screenshots are only implemented for macOS right now."
            .to_string(),
    )
}

fn browser_iab_logical_window_region(
    window_x: i32,
    window_y: i32,
    window_width: u32,
    window_height: u32,
    device_scale_factor: f64,
) -> BrowserIabScreenshotRegion {
    let scale = if device_scale_factor.is_finite() && device_scale_factor > 0.0 {
        device_scale_factor
    } else {
        1.0
    };
    BrowserIabScreenshotRegion {
        x: ((window_x as f64) / scale).round() as i32,
        y: ((window_y as f64) / scale).round() as i32,
        width: (((window_width.max(1) as f64) / scale).round() as u32).max(1),
        height: (((window_height.max(1) as f64) / scale).round() as u32).max(1),
    }
}

fn browser_iab_screenshot_region(
    window: BrowserIabScreenshotRegion,
    params: &Value,
) -> BrowserIabScreenshotRegion {
    let width = window.width.max(1);
    let height = window.height.max(1);
    let Some(clip) = params.get("clip").filter(|value| value.is_object()) else {
        return BrowserIabScreenshotRegion {
            x: window.x,
            y: window.y,
            width,
            height,
        };
    };
    // CDP clip x/y are page coordinates, while screencapture needs screen coordinates.
    let clip_width = browser_iab_positive_size(clip.get("width"), width);
    let clip_height = browser_iab_positive_size(clip.get("height"), height);
    BrowserIabScreenshotRegion {
        x: window.x,
        y: window.y,
        width: clip_width.min(width).max(1),
        height: clip_height.min(height).max(1),
    }
}

fn browser_iab_positive_size(value: Option<&Value>, fallback: u32) -> u32 {
    value
        .and_then(Value::as_f64)
        .filter(|value| value.is_finite() && *value > 0.0)
        .map(|value| value.round() as u32)
        .filter(|value| *value > 0)
        .unwrap_or(fallback)
}

fn browser_iab_screenshot_format_and_extension(params: &Value) -> (&'static str, &'static str) {
    match params
        .get("format")
        .and_then(Value::as_str)
        .unwrap_or("png")
        .to_ascii_lowercase()
        .as_str()
    {
        "jpeg" | "jpg" => ("jpg", "jpg"),
        _ => ("png", "png"),
    }
}

fn browser_iab_mouse_event_script(params: &Value) -> String {
    let params = browser_iab_json_value_literal(params);
    let mut script = String::from(
        r#"(() => {
  const params = "#,
    );
    script.push_str(&params);
    script.push_str(
        r#";
  const typeMap = {
    mouseMoved: "mousemove",
    mousePressed: "mousedown",
    mouseReleased: "mouseup",
    mouseWheel: "wheel",
  };
  const x = Number(params.x || 0);
  const y = Number(params.y || 0);
  const domType = typeMap[params.type] || String(params.type || "mousemove");
  const target = document.elementFromPoint(x, y) || document.activeElement || document.body || document.documentElement;
  if (!target) return { ok: false, text: "No DOM target is available for mouse event." };
  const buttonName = params.button || "none";
  const button = buttonName === "left" ? 0 : buttonName === "middle" ? 1 : buttonName === "right" ? 2 : -1;
  if (domType === "wheel") {
    target.dispatchEvent(new WheelEvent("wheel", {
      bubbles: true,
      cancelable: true,
      clientX: x,
      clientY: y,
      deltaX: Number(params.deltaX || 0),
      deltaY: Number(params.deltaY || 0),
      view: window,
    }));
    return { ok: true };
  }
  target.dispatchEvent(new MouseEvent(domType, {
    bubbles: true,
    cancelable: true,
    clientX: x,
    clientY: y,
    button: Math.max(button, 0),
    buttons: Number(params.buttons || 0),
    detail: Number(params.clickCount || 0),
    view: window,
  }));
  if (params.type === "mouseReleased" && Number(params.clickCount || 0) > 0) {
    target.dispatchEvent(new MouseEvent("click", {
      bubbles: true,
      cancelable: true,
      clientX: x,
      clientY: y,
      button: Math.max(button, 0),
      detail: Number(params.clickCount || 1),
      view: window,
    }));
    if (Number(params.clickCount || 0) > 1) {
      target.dispatchEvent(new MouseEvent("dblclick", {
        bubbles: true,
        cancelable: true,
        clientX: x,
        clientY: y,
        button: Math.max(button, 0),
        detail: 2,
        view: window,
      }));
    }
  }
  return { ok: true };
})()"#,
    );
    script
}

fn browser_iab_key_event_script(params: &Value) -> String {
    let params = browser_iab_json_value_literal(params);
    let mut script = String::from(
        r#"(() => {
  const params = "#,
    );
    script.push_str(&params);
    script.push_str(
        r#";
  const target = document.activeElement || document.body || document.documentElement;
  if (!target) return { ok: false, text: "No active DOM target is available for key event." };
  const typeMap = {
    rawKeyDown: "keydown",
    keyDown: "keydown",
    char: "keypress",
    keyUp: "keyup",
  };
  const domType = typeMap[params.type] || String(params.type || "keydown");
  const event = new KeyboardEvent(domType, {
    bubbles: true,
    cancelable: true,
    key: params.key || params.text || "",
    code: params.code || "",
    ctrlKey: Boolean((params.modifiers || 0) & 2),
    shiftKey: Boolean((params.modifiers || 0) & 8),
    altKey: Boolean((params.modifiers || 0) & 1),
    metaKey: Boolean((params.modifiers || 0) & 4),
  });
  target.dispatchEvent(event);
  if ((params.type === "char" || params.type === "keyDown" || params.type === "rawKeyDown") && params.text) {
    const text = String(params.text);
    if (typeof target.value === "string") {
      const start = typeof target.selectionStart === "number" ? target.selectionStart : target.value.length;
      const end = typeof target.selectionEnd === "number" ? target.selectionEnd : start;
      target.value = target.value.slice(0, start) + text + target.value.slice(end);
      const next = start + text.length;
      if (typeof target.setSelectionRange === "function") target.setSelectionRange(next, next);
      target.dispatchEvent(new InputEvent("input", { bubbles: true, cancelable: true, data: text, inputType: "insertText" }));
    } else if (target.isContentEditable && document.execCommand) {
      document.execCommand("insertText", false, text);
    }
  }
  return { ok: true };
})()"#,
    );
    script
}

fn browser_iab_insert_text_script(text: &str) -> String {
    let text = browser_iab_json_string_literal(text);
    let mut script = String::from(
        r#"(() => {
  const text = "#,
    );
    script.push_str(&text);
    script.push_str(
        r#";
  const target = document.activeElement || document.body || document.documentElement;
  if (!target) return { ok: false, text: "No active DOM target is available for text insertion." };
  if (typeof target.value === "string") {
    const start = typeof target.selectionStart === "number" ? target.selectionStart : target.value.length;
    const end = typeof target.selectionEnd === "number" ? target.selectionEnd : start;
    target.value = target.value.slice(0, start) + text + target.value.slice(end);
    const next = start + text.length;
    if (typeof target.setSelectionRange === "function") target.setSelectionRange(next, next);
    target.dispatchEvent(new InputEvent("input", { bubbles: true, cancelable: true, data: text, inputType: "insertText" }));
  } else if (target.isContentEditable && document.execCommand) {
    document.execCommand("insertText", false, text);
  }
  return { ok: true };
})()"#,
    );
    script
}

fn browser_iab_json_string_literal(value: &str) -> String {
    serde_json::to_string(value).unwrap_or_else(|_| "\"\"".to_string())
}

fn browser_iab_json_value_literal(value: &Value) -> String {
    serde_json::to_string(value).unwrap_or_else(|_| "{}".to_string())
}

fn browser_iab_targets_from_store(store: &BrowserRuntimeStore) -> Vec<Value> {
    store
        .tabs
        .iter()
        .filter(|tab| tab.open)
        .enumerate()
        .map(|(index, tab)| {
            let tab_id = browser_iab_tab_id(tab, index + 1);
            json!({
                "targetId": browser_iab_target_id(tab_id),
                "type": "page",
                "title": tab.title,
                "url": tab.url,
                "attached": true,
                "canAccessOpener": false,
                "tabId": tab_id,
            })
        })
        .collect()
}

fn browser_iab_navigation_events(tab_id: usize, url: &str) -> Vec<Value> {
    vec![
        browser_iab_cdp_event(
            tab_id,
            "Page.frameStartedLoading",
            json!({ "frameId": browser_iab_frame_id(tab_id) }),
        ),
        browser_iab_cdp_event(
            tab_id,
            "Page.frameNavigated",
            json!({
                "frame": {
                    "id": browser_iab_frame_id(tab_id),
                    "loaderId": browser_iab_loader_id(tab_id),
                    "url": url,
                    "securityOrigin": browser_iab_security_origin(url),
                    "mimeType": "text/html",
                }
            }),
        ),
        browser_iab_cdp_event(
            tab_id,
            "Page.domContentEventFired",
            json!({ "timestamp": 0 }),
        ),
        browser_iab_cdp_event(tab_id, "Page.loadEventFired", json!({ "timestamp": 0 })),
    ]
}

fn browser_iab_same_document_navigation_events(tab_id: usize, url: &str) -> Vec<Value> {
    vec![browser_iab_cdp_event(
        tab_id,
        "Page.navigatedWithinDocument",
        json!({
            "frameId": browser_iab_frame_id(tab_id),
            "url": url,
            "navigationType": "fragment",
        }),
    )]
}

fn browser_iab_is_same_document_navigation(current_url: &str, next_url: &str) -> bool {
    if current_url == next_url {
        return false;
    }
    let current_base = current_url.split('#').next().unwrap_or(current_url);
    let next_base = next_url.split('#').next().unwrap_or(next_url);
    !current_base.is_empty() && current_base == next_base
}

fn browser_iab_cdp_event(tab_id: usize, method: &str, params: Value) -> Value {
    json!({
        "jsonrpc": "2.0",
        "method": "onCDPEvent",
        "params": {
            "source": {
                "tabId": tab_id,
            },
            "method": method,
            "params": params,
        },
    })
}

fn browser_iab_close_tab(app: &AppHandle, tab_id: usize) -> Result<(), String> {
    let state = app.state::<AppState>();
    let internal_tab_id = {
        let store = state
            .browser_runtime
            .lock()
            .expect("browser runtime mutex poisoned");
        browser_iab_runtime_tab_for_id(&store, tab_id)
            .map(|tab| tab.tab_id.clone())
            .ok_or_else(|| format!("Browser iab tab {tab_id} is not open."))?
    };
    let label = browser_window_label(&internal_tab_id);
    if let Some(window) = app.get_webview_window(&label) {
        window
            .close()
            .map_err(|error| format!("failed to close Browser tab: {error}"))?;
    }
    mark_browser_tab_closed(&state, &internal_tab_id);
    emit_browser_runtime_event(app, &state, None);
    Ok(())
}

fn browser_iab_unsupported_response(id: Value) -> Value {
    json_rpc_error(
        id,
        -32000,
        "Forge Browser iab probe supports discovery, tab inventory, basic navigation, page JS evaluation, layout metrics, visible-window screenshots, and basic event input; full DOM snapshots, full-page capture, user tab claiming, and file transfer are not implemented yet.",
    )
}

fn json_rpc_success(id: Value, result: Value) -> Value {
    json!({
        "jsonrpc": "2.0",
        "id": id,
        "result": result,
    })
}

fn json_rpc_error(id: Value, code: i64, message: &str) -> Value {
    json!({
        "jsonrpc": "2.0",
        "id": id,
        "error": {
            "code": code,
            "message": message,
        },
    })
}

fn notification_text(value: Option<String>, fallback: &str, max_chars: usize) -> String {
    let mut text = value
        .as_deref()
        .map(str::trim)
        .filter(|value| !value.is_empty())
        .unwrap_or(fallback)
        .to_string();
    if text.chars().count() > max_chars {
        text = text.chars().take(max_chars).collect();
        text.push_str("...");
    }
    text
}

fn install_native_menu(app: &mut tauri::App) -> tauri::Result<()> {
    let handle = app.handle();
    let settings = MenuItemBuilder::with_id(MENU_SETTINGS, "Settings")
        .accelerator("CmdOrCtrl+,")
        .build(handle)?;
    let quit = MenuItemBuilder::with_id(MENU_QUIT, "Quit Forge")
        .accelerator("CmdOrCtrl+Q")
        .build(handle)?;
    let new_chat = MenuItemBuilder::with_id(MENU_NEW_CHAT, "New Chat")
        .accelerator("CmdOrCtrl+N")
        .build(handle)?;
    // codex newWindow (⌘⇧N). Native + webview both bind it (same as New Chat's ⌘N); the
    // native menu consumes the accelerator on desktop, so the webview command is the
    // browser/palette path and there is no double-open.
    let new_window = MenuItemBuilder::with_id(MENU_NEW_WINDOW, "New Window")
        .accelerator("CmdOrCtrl+Shift+N")
        .build(handle)?;
    let open_folder = MenuItemBuilder::with_id(MENU_OPEN_FOLDER, "Open Folder…")
        .accelerator("CmdOrCtrl+O")
        .build(handle)?;
    let search = MenuItemBuilder::with_id(MENU_SEARCH, "Search")
        .accelerator("CmdOrCtrl+K")
        .build(handle)?;
    let close = MenuItemBuilder::with_id(MENU_CLOSE, "Close Window")
        .accelerator("CmdOrCtrl+W")
        .build(handle)?;
    let reload = MenuItemBuilder::with_id(MENU_RELOAD, "Reload")
        .accelerator("CmdOrCtrl+R")
        .build(handle)?;
    let undo = PredefinedMenuItem::undo(handle, None)?;
    let redo = PredefinedMenuItem::redo(handle, None)?;
    let edit_separator = PredefinedMenuItem::separator(handle)?;
    let cut = PredefinedMenuItem::cut(handle, None)?;
    let copy = PredefinedMenuItem::copy(handle, None)?;
    let paste = PredefinedMenuItem::paste(handle, None)?;
    let select_all = PredefinedMenuItem::select_all(handle, None)?;

    let app_menu = SubmenuBuilder::new(handle, "Forge")
        .item(&settings)
        .separator()
        .item(&quit)
        .build()?;
    let file_menu = SubmenuBuilder::new(handle, "File")
        .item(&new_chat)
        .item(&new_window)
        .item(&open_folder)
        .item(&search)
        .separator()
        .item(&close)
        .build()?;
    let edit_menu = SubmenuBuilder::new(handle, "Edit")
        .item(&undo)
        .item(&redo)
        .item(&edit_separator)
        .item(&cut)
        .item(&copy)
        .item(&paste)
        .item(&select_all)
        .build()?;
    let view_menu = SubmenuBuilder::new(handle, "View").item(&reload).build()?;
    let menu = MenuBuilder::new(handle)
        .item(&app_menu)
        .item(&file_menu)
        .item(&edit_menu)
        .item(&view_menu)
        .build()?;
    app.set_menu(menu)?;
    Ok(())
}

fn handle_native_menu_event(app: &AppHandle, id: &str) {
    match id {
        MENU_NEW_CHAT => emit_native_shell_action(app, "newChat", true, None, None),
        MENU_NEW_WINDOW => {
            let _ = open_new_window_impl(app);
        }
        MENU_OPEN_FOLDER => emit_native_shell_action(app, "openFolder", true, None, None),
        MENU_SEARCH => emit_native_shell_action(app, "search", true, None, None),
        MENU_SETTINGS => emit_native_shell_action(app, "settings", true, None, None),
        MENU_RELOAD => emit_unsupported_native_menu_action(
            app,
            "reload",
            "Reload is unsupported because Forge has no separate browser panel.",
        ),
        MENU_CLOSE => {
            // codex closeTabOrWindow (⌘W). §M-44/§M-55 added real secondary windows
            // (thread-* / new-window-*); ⌘W closes the focused secondary window. The main
            // window stays guarded (closing it is the app-exit path; ⌘Q handles that), so
            // ⌘W on main keeps the prior no-tab-target message rather than killing the app.
            let focused_secondary = app
                .webview_windows()
                .into_values()
                .find(|window| window.label() != "main" && window.is_focused().unwrap_or(false));
            if let Some(window) = focused_secondary {
                let _ = window.close();
            } else {
                emit_unsupported_native_menu_action(
                    app,
                    "closeWindow",
                    "Close Window is unsupported for the main window because Forge has no tab target.",
                );
            }
        }
        MENU_QUIT => app.exit(0),
        _ => {}
    }
}

fn emit_native_shell_action(
    app: &AppHandle,
    action: &str,
    supported: bool,
    message: Option<&str>,
    url: Option<&str>,
) {
    let _ = activate_main_window(app);
    let _ = app.emit(
        NATIVE_SHELL_EVENT_NAME,
        json!({
            "action": action,
            "supported": supported,
            "message": message,
            "url": url,
        }),
    );
}

fn activate_main_window(app: &AppHandle) -> tauri::Result<()> {
    if let Some(window) = app.get_webview_window("main") {
        window.unminimize()?;
        window.show()?;
        window.set_focus()?;
    }
    Ok(())
}

fn emit_unsupported_native_menu_action(app: &AppHandle, action: &str, message: &str) {
    emit_native_shell_action(app, action, false, Some(message), None);
    eprintln!("Forge native shell: {message}");
}

fn handle_deep_link_url(app: &AppHandle, url: &str) -> Result<(), String> {
    let trimmed = url.trim();
    if !is_supported_native_shell_url(trimmed) {
        return Err(
            "native shell URL must be a codex:// link or connector OAuth callback".to_string(),
        );
    }
    emit_native_shell_action(app, "openDeepLink", true, None, Some(trimmed));
    eprintln!("Forge native shell: received deep link {trimmed}");
    Ok(())
}

fn handle_deep_link_urls<'a, I>(app: &AppHandle, urls: I)
where
    I: IntoIterator<Item = &'a str>,
{
    for url in urls {
        if let Err(error) = handle_deep_link_url(app, url) {
            eprintln!("Forge native shell: ignored deep link {url}: {error}");
        }
    }
}

fn handle_single_instance_activation(app: &AppHandle, args: Vec<String>, cwd: String) {
    let _ = activate_main_window(app);
    let deep_link_args = args
        .iter()
        .map(String::as_str)
        .filter(|arg| is_supported_native_shell_url(arg.trim()));
    handle_deep_link_urls(app, deep_link_args);
    eprintln!("Forge native shell: focused existing instance from cwd {cwd}");
}

fn is_supported_native_shell_url(url: &str) -> bool {
    url.starts_with(CODEX_DEEP_LINK_SCHEME) || is_app_connect_oauth_callback_url(url)
}

fn is_app_connect_oauth_callback_url(url: &str) -> bool {
    let lower = url.trim().to_ascii_lowercase();
    if !(lower.starts_with("https://") || lower.starts_with("http://")) {
        return false;
    }
    lower.contains(APP_CONNECT_OAUTH_CALLBACK_PATH)
        || lower.contains(APP_CONNECT_OAUTH_BROWSER_REDIRECT_PATH)
}

fn install_deep_link_handlers(app: &tauri::App) {
    match app.deep_link().get_current() {
        Ok(Some(urls)) => {
            let url_strings: Vec<String> =
                urls.iter().map(|url| url.as_str().to_string()).collect();
            handle_deep_link_urls(app.handle(), url_strings.iter().map(String::as_str));
        }
        Ok(None) => {}
        Err(error) => {
            eprintln!("Forge native shell: failed to read startup deep links: {error}");
        }
    }

    let handle = app.handle().clone();
    app.deep_link().on_open_url(move |event| {
        let url_strings: Vec<String> = event
            .urls()
            .iter()
            .map(|url| url.as_str().to_string())
            .collect();
        handle_deep_link_urls(&handle, url_strings.iter().map(String::as_str));
    });
}

fn log_unsupported_native_shell_boundaries() {
    eprintln!(
        "Forge native shell: release update endpoints/signing and product notification entitlement/distribution policy still need production configuration"
    );
}

// ============================================================================
// codex: use-workspace-file-search-C73UkUkc — the hard-coded directory excludes
// used when walking a workspace. Mirrors Codex Desktop's exclusion set so
// `node_modules`, `.git`, build outputs, etc. never show up in the file tree.
// ============================================================================
const WORKSPACE_DIR_EXCLUDES: &[&str] = &[
    ".git",
    ".hg",
    ".next",
    ".pnpm-store",
    ".svn",
    ".turbo",
    ".yarn",
    "build",
    "coverage",
    "dist",
    "node_modules",
];

#[derive(Serialize)]
struct WorkspaceDirEntry {
    // codex: workspace-directory-tree :j entries shape — `{ type, path }` with
    // `type ∈ {'directory','file'}`. We also send `name` so the renderer does
    // not have to split the path again.
    #[serde(rename = "type")]
    kind: &'static str,
    path: String,
    name: String,
}

#[derive(Serialize)]
struct WorkspaceListDirResponse {
    entries: Vec<WorkspaceDirEntry>,
}

#[tauri::command]
fn host_workspace_list_dir(
    root: String,
    dir_path: String,
    include_hidden: bool,
) -> Result<WorkspaceListDirResponse, String> {
    // codex: workspace-directory-tree-CHHgPVoD :_e — non-recursive direct-children
    // listing keyed on (root, dirPath). Renderer drives recursion via expand.
    let root_trimmed = root.trim();
    if root_trimmed.is_empty() {
        return Err("workspace root is empty".to_string());
    }
    let root_path = Path::new(root_trimmed);
    if !root_path.is_dir() {
        return Err(format!("workspace root is not a directory: {root_trimmed}"));
    }

    let dir_trimmed = dir_path.trim();
    let abs_dir = if dir_trimmed.is_empty() {
        root_path.to_path_buf()
    } else {
        // Reject `..` segments outright to avoid escaping the workspace root.
        if dir_trimmed
            .split(['/', '\\'])
            .any(|segment| segment == "..")
        {
            return Err("workspace path cannot contain '..' segments".to_string());
        }
        root_path.join(dir_trimmed)
    };
    if !abs_dir.is_dir() {
        return Err(format!("not a directory: {}", abs_dir.display()));
    }

    let mut entries: Vec<WorkspaceDirEntry> = Vec::new();
    let read_iter =
        fs::read_dir(&abs_dir).map_err(|error| format!("failed to read directory: {error}"))?;
    for raw_entry in read_iter {
        let entry =
            raw_entry.map_err(|error| format!("failed to read directory entry: {error}"))?;
        let file_name = entry.file_name();
        let name = file_name.to_string_lossy().to_string();

        // codex: use-workspace-file-search excluded names — applied to directories
        // (we still allow hidden files when `include_hidden` is true so users can
        // see `.npmrc`, `.gitignore`, etc.).
        if !include_hidden && name.starts_with('.') {
            continue;
        }
        let file_type = match entry.file_type() {
            Ok(ft) => ft,
            Err(_) => continue,
        };
        let is_dir = file_type.is_dir();
        if is_dir && WORKSPACE_DIR_EXCLUDES.contains(&name.as_str()) {
            continue;
        }

        // Build the relative-to-root path with POSIX separators so the renderer
        // can use string comparison consistently across platforms.
        let abs_child = entry.path();
        let rel_path = abs_child
            .strip_prefix(root_path)
            .map(|p| p.to_string_lossy().replace('\\', "/"))
            .unwrap_or_else(|_| name.clone());

        entries.push(WorkspaceDirEntry {
            kind: if is_dir { "directory" } else { "file" },
            path: rel_path,
            name,
        });
    }

    // codex: workspace-directory-tree :_e default ordering — directories first,
    // then case-insensitive by name. Keeps the renderer stable across runs.
    entries.sort_by(|a, b| {
        let dir_a = a.kind == "directory";
        let dir_b = b.kind == "directory";
        match (dir_a, dir_b) {
            (true, false) => std::cmp::Ordering::Less,
            (false, true) => std::cmp::Ordering::Greater,
            _ => a.name.to_lowercase().cmp(&b.name.to_lowercase()),
        }
    });

    Ok(WorkspaceListDirResponse { entries })
}

fn main() {
    tauri::Builder::default()
        .register_uri_scheme_protocol("codexbundle", |_ctx, request| {
            codex_bundle::handle_bundle_request(&request)
        })
        .plugin(tauri_plugin_single_instance::init(
            handle_single_instance_activation,
        ))
        .plugin(tauri_plugin_deep_link::init())
        .plugin(tauri_plugin_shell::init())
        .plugin(tauri_plugin_notification::init())
        .plugin(tauri_plugin_updater::Builder::new().build())
        .plugin(tauri_plugin_process::init())
        .on_menu_event(|app, event| {
            handle_native_menu_event(app, event.id().as_ref());
        })
        .manage(AppState::default())
        .setup(|app| {
            install_native_menu(app)?;
            install_deep_link_handlers(app);
            log_unsupported_native_shell_boundaries();
            let handle = app.handle().clone();
            match start_browser_iab_probe_server(handle.clone()) {
                Ok(path) => eprintln!(
                    "[browser-iab] probe backend listening at {}",
                    path.to_string_lossy()
                ),
                Err(error) => eprintln!("[browser-iab] failed to start probe backend: {error}"),
            }
            if browser_extension_backend_enabled() {
                match start_browser_extension_backend_spike_server(handle.clone()) {
                    Ok(path) => eprintln!(
                        "[browser-extension] host-compatible spike listening at {}",
                        path.to_string_lossy()
                    ),
                    Err(error) => eprintln!(
                        "[browser-extension] failed to start host-compatible spike: {error}"
                    ),
                }
            }
            let state = app.state::<AppState>();
            state.host.forward_events(move |event| {
                let _ = handle.emit(APP_SERVER_EVENT_NAME, event);
            });
            // Experimental: host the real Codex Desktop bundle in a separate
            // window when HICODEX_CODEX_BUNDLE is set. The clean-room `main`
            // window is the untouched default and is unaffected.
            if std::env::var("HICODEX_CODEX_BUNDLE").is_ok() {
                if let Err(error) = codex_bundle::open_codex_bundle_window(app.handle().clone()) {
                    eprintln!("[codex-bundle] failed to open window: {error}");
                }
            }
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            host_start_app_server,
            host_stop_app_server,
            host_status,
            host_send_raw,
            host_write_local_model_catalog,
            host_read_codex_auth_summary,
            host_read_installation_state,
            host_read_computer_use_readiness,
            host_repair_computer_use_bundle,
            host_open_computer_use_setup,
            host_browser_runtime_status,
            host_open_browser_tab,
            host_open_file_reference,
            host_reveal_path,
            host_open_thread_window,
            host_open_new_window,
            host_open_external_url,
            host_pick_file_references,
            host_pick_workspace_folder,
            host_read_image_data_url,
            host_read_file_metadata,
            host_read_text_file,
            host_read_spreadsheet_preview,
            host_read_file_bytes_base64,
            host_read_document_preview,
            host_git_status,
            host_git_list_branches,
            host_git_checkout_branch,
            host_git_default_branch,
            host_git_create_branch,
            host_gh_pr_status,
            host_apply_patch_action,
            host_create_pending_worktree,
            host_create_projectless_thread_cwd,
            host_find_rollout_for_thread,
            host_read_thread_tool_history,
            host_notify_turn_completed,
            host_handle_deep_link_url,
            host_generate_image,
            host_workspace_list_dir,
            codex_bundle::open_codex_bundle_window
        ])
        .run(tauri::generate_context!())
        .expect("error while running Forge desktop");
}
