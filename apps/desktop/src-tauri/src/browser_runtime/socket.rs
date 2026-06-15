use serde_json::{json, Value};
use std::env;
use std::fs;
use std::io::{Read, Write};
use std::path::{Path, PathBuf};
use std::sync::atomic::Ordering;
use std::thread;
use tauri::{AppHandle, Manager};

use crate::AppState;

use super::cdp::{
    browser_iab_execute_cdp, browser_iab_execute_unhandled_command,
    browser_iab_tab_from_runtime_tab, browser_iab_tab_id, browser_iab_tabs_from_store,
};
use super::store::{
    emit_browser_runtime_event, open_browser_tab_impl, refresh_browser_runtime_store,
};

#[cfg(unix)]
use std::os::unix::fs::{FileTypeExt, PermissionsExt};
#[cfg(unix)]
use std::os::unix::net::{UnixListener, UnixStream};

const BROWSER_IAB_MODE: &str = "probe";
const BROWSER_EXTENSION_BACKEND_MODE: &str = "host-compatible-spike";
const BROWSER_EXTENSION_BACKEND_ENV: &str = "FORGE_BROWSER_EXTENSION_BACKEND_SPIKE";
/// Legacy env name from before the Forge rebrand; still honored as a fallback.
const BROWSER_EXTENSION_BACKEND_ENV_LEGACY: &str = "HICODEX_BROWSER_EXTENSION_BACKEND_SPIKE";
const BROWSER_IAB_DEFAULT_CODEX_APP_BUILD_FLAVOR: &str = "prod";
const BROWSER_IAB_PIPE_DIR_NAME: &str = "codex-browser-use";
const BROWSER_IAB_DEFAULT_URL: &str = "https://example.com";

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub(crate) enum BrowserBackendKind {
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

    pub(crate) fn mode(self) -> &'static str {
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

pub(crate) fn browser_iab_probe_socket_path() -> PathBuf {
    browser_backend_socket_path(BrowserBackendKind::IabProbe)
}

pub(crate) fn browser_extension_backend_socket_path() -> PathBuf {
    browser_backend_socket_path(BrowserBackendKind::ExtensionHostCompatible)
}

fn browser_backend_socket_path(kind: BrowserBackendKind) -> PathBuf {
    // The "hicodex-" socket-name prefix is a deliberate legacy value: it is
    // cross-process visible (the codex browser host scans this shared pipe
    // dir) and the startup cleanup below keys on it, so it survives the Forge
    // rebrand unchanged.
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

pub(crate) fn existing_browser_iab_probe_socket_path() -> Option<String> {
    existing_browser_backend_socket_path(BrowserBackendKind::IabProbe)
}

pub(crate) fn existing_browser_extension_backend_socket_path() -> Option<String> {
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
        if file_name == keep_name || !is_app_owned_browser_socket_name(file_name, kind) {
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

// Matches only sockets this app created (the deliberate legacy "hicodex-"
// prefix, see browser_backend_socket_path) so startup cleanup never touches
// other apps' sockets in the shared pipe dir.
#[cfg(unix)]
fn is_app_owned_browser_socket_name(file_name: &str, kind: BrowserBackendKind) -> bool {
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
                    log::warn!(
                        target: "browser-socket",
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
    // Wire-visible metadata key sent to the codex browser host; the legacy
    // "hicodex" spelling is deliberate (protocol surface, see keep-list).
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
        json!("forge-host-compatible-extension"),
    );
    metadata.insert(
        "extensionInstanceId".to_string(),
        json!(format!("forge-host-compatible-{}", std::process::id())),
    );
    metadata.insert("source".to_string(), json!("forge-host-compatible-spike"));
    // Wire-visible metadata key sent to the codex browser host; the legacy
    // "hicodex" spelling is deliberate (protocol surface, see keep-list).
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
        .or_else(|_| env::var(BROWSER_EXTENSION_BACKEND_ENV_LEGACY))
        .ok()
        .map(|value| {
            let normalized = value.trim().to_ascii_lowercase();
            !matches!(normalized.as_str(), "" | "0" | "false" | "no" | "off")
        })
        .unwrap_or(false)
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
    use super::{browser_extension_backend_info_result, browser_iab_info_result};
    use serde_json::json;
    use std::fs;
    use std::path::PathBuf;
    use std::time::{SystemTime, UNIX_EPOCH};

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
            "forge-host-compatible-extension"
        );
        assert_eq!(info["metadata"]["source"], "forge-host-compatible-spike");
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
    fn browser_iab_pipe_dir_matches_browser_client_scan_path() {
        #[cfg(unix)]
        assert_eq!(
            super::browser_iab_pipe_dir(),
            std::path::PathBuf::from("/tmp/codex-browser-use")
        );
    }

    #[cfg(unix)]
    #[test]
    fn browser_iab_startup_cleanup_removes_only_stale_app_owned_sockets() {
        // pid+nanos alone can collide with parallel tests; keep the
        // destructive remove_dir_all scoped to a unique dir.
        static TEMP_DIR_SEQ: std::sync::atomic::AtomicU64 = std::sync::atomic::AtomicU64::new(0);
        let seq = TEMP_DIR_SEQ.fetch_add(1, std::sync::atomic::Ordering::Relaxed);
        let nanos = SystemTime::now()
            .duration_since(UNIX_EPOCH)
            .map(|value| value.as_nanos())
            .unwrap_or_default();
        let dir = PathBuf::from(format!("/tmp/hcbiab-{}-{nanos}-{seq}", std::process::id()));
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
