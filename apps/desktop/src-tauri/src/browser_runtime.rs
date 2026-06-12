use base64::{engine::general_purpose, Engine as _};
use serde::{Deserialize, Serialize};
use serde_json::{json, Value};
use std::env;
use std::fs;
use std::io::{Read, Write};
use std::path::{Path, PathBuf};
use std::sync::atomic::{AtomicU64, Ordering};
use std::sync::mpsc;
use std::thread;
use std::time::{Duration, SystemTime, UNIX_EPOCH};
use tauri::{AppHandle, Emitter, Manager, State, WebviewUrl, WebviewWindowBuilder};

use crate::{new_command, AppState};

#[cfg(unix)]
use std::os::unix::fs::{FileTypeExt, PermissionsExt};
#[cfg(unix)]
use std::os::unix::net::{UnixListener, UnixStream};

const BROWSER_RUNTIME_EVENT_NAME: &str = "hicodex://browser-runtime-event";
const BROWSER_IAB_MODE: &str = "probe";
const BROWSER_EXTENSION_BACKEND_MODE: &str = "host-compatible-spike";
const BROWSER_EXTENSION_BACKEND_ENV: &str = "HICODEX_BROWSER_EXTENSION_BACKEND_SPIKE";
const BROWSER_IAB_DEFAULT_CODEX_APP_BUILD_FLAVOR: &str = "prod";
const BROWSER_IAB_PIPE_DIR_NAME: &str = "codex-browser-use";
const BROWSER_IAB_DEFAULT_URL: &str = "https://example.com";
const BROWSER_IAB_EVAL_TIMEOUT: Duration = Duration::from_secs(8);

#[derive(Debug, Clone, Default)]
pub(crate) struct BrowserRuntimeStore {
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
pub(crate) struct BrowserRuntimeStatus {
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

static BROWSER_TAB_COUNTER: AtomicU64 = AtomicU64::new(1);

#[tauri::command]
pub(crate) fn host_browser_runtime_status(
    app: AppHandle,
    state: State<'_, AppState>,
) -> BrowserRuntimeStatus {
    refresh_browser_runtime_store(&app, &state);
    browser_runtime_status_from_store(&state, None)
}

#[tauri::command]
pub(crate) fn host_open_browser_tab(
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
    if sanitized.trim_matches('-').is_empty() {
        "active".to_string()
    } else {
        sanitized
    }
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
pub(crate) fn start_browser_iab_probe_server(app: AppHandle) -> Result<PathBuf, String> {
    start_browser_backend_socket_server(app, BrowserBackendKind::IabProbe)
}

#[cfg(unix)]
pub(crate) fn start_browser_extension_backend_spike_server(
    app: AppHandle,
) -> Result<PathBuf, String> {
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
pub(crate) fn start_browser_iab_probe_server(_app: AppHandle) -> Result<PathBuf, String> {
    Err("Browser iab native pipe probe is only implemented for Unix sockets.".to_string())
}

#[cfg(not(unix))]
pub(crate) fn start_browser_extension_backend_spike_server(
    _app: AppHandle,
) -> Result<PathBuf, String> {
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

pub(crate) fn browser_extension_backend_enabled() -> bool {
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
        "Forge Browser iab probe supports only basic read-only Runtime.evaluate calls.".to_string()
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
    let output = new_command("/usr/sbin/screencapture")
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
        browser_iab_tab_id_from_target_id, browser_iab_tabs_from_store, normalized_browser_url,
        BrowserIabScreenshotRegion, BrowserRuntimeStore, BrowserRuntimeTab,
    };
    use serde_json::{json, Value};
    use std::fs;
    use std::path::PathBuf;
    use std::time::{SystemTime, UNIX_EPOCH};

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
}
