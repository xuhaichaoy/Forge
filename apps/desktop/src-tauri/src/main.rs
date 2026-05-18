use base64::{engine::general_purpose, Engine as _};
use hicodex_host::{
    AppServerHost, AppServerStartConfig, CodexAuthSummary, HostInstallationState, HostStatus,
    LocalModelCatalogConfig, ThreadToolHistory,
};
use serde::{Deserialize, Serialize};
use serde_json::{json, Value};
use std::env;
use std::fs;
use std::io::{Read, Write};
use std::path::{Path, PathBuf};
use std::process::{Command, Stdio};
use std::time::{SystemTime, UNIX_EPOCH};
use tauri::menu::{MenuBuilder, MenuItemBuilder, SubmenuBuilder};
use tauri::{AppHandle, Emitter, Manager, State};
use tauri_plugin_deep_link::DeepLinkExt;
use tauri_plugin_notification::NotificationExt;

mod document_preview;
mod spreadsheet_preview;

use document_preview::{read_document_preview, DocumentPreview};
use spreadsheet_preview::{read_spreadsheet_preview, SpreadsheetPreview};

const APP_SERVER_EVENT_NAME: &str = "hicodex://app-server-event";
const NATIVE_SHELL_EVENT_NAME: &str = "hicodex://native-shell-event";
const CODEX_DEEP_LINK_SCHEME: &str = "codex://";
const APP_CONNECT_OAUTH_CALLBACK_PATH: &str = "/aip/connectors/links/oauth/callback";
const APP_CONNECT_OAUTH_BROWSER_REDIRECT_PATH: &str = "/connector_platform_oauth_redirect";

const MENU_NEW_CHAT: &str = "hicodex:new-chat";
const MENU_SEARCH: &str = "hicodex:search";
const MENU_SETTINGS: &str = "hicodex:settings";
const MENU_RELOAD: &str = "hicodex:reload";
const MENU_CLOSE: &str = "hicodex:close-window";
const MENU_QUIT: &str = "hicodex:quit";

struct AppState {
    host: AppServerHost,
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

impl Default for AppState {
    fn default() -> Self {
        Self {
            host: AppServerHost::new(),
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
    let title = notification_text(request.title, "Codex turn completed", 96);
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
    let output_path = output_dir.join(format!("ig_{}.png", image_content_hash(&image_bytes)));
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
        file_url_from_path, host_generate_image, image_generations_endpoint,
        is_supported_native_shell_url, ImageGenerationRequest,
    };
    use serde_json::json;
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
        assert_eq!(fs::read(&saved_images[0]).unwrap(), b"PNGDATA");
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
    let quit = MenuItemBuilder::with_id(MENU_QUIT, "Quit HiCodex")
        .accelerator("CmdOrCtrl+Q")
        .build(handle)?;
    let new_chat = MenuItemBuilder::with_id(MENU_NEW_CHAT, "New Chat")
        .accelerator("CmdOrCtrl+N")
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

    let app_menu = SubmenuBuilder::new(handle, "HiCodex")
        .item(&settings)
        .separator()
        .item(&quit)
        .build()?;
    let file_menu = SubmenuBuilder::new(handle, "File")
        .item(&new_chat)
        .item(&search)
        .separator()
        .item(&close)
        .build()?;
    let view_menu = SubmenuBuilder::new(handle, "View").item(&reload).build()?;
    let menu = MenuBuilder::new(handle)
        .item(&app_menu)
        .item(&file_menu)
        .item(&view_menu)
        .build()?;
    app.set_menu(menu)?;
    Ok(())
}

fn handle_native_menu_event(app: &AppHandle, id: &str) {
    match id {
        MENU_NEW_CHAT => emit_native_shell_action(app, "newChat", true, None, None),
        MENU_SEARCH => emit_native_shell_action(app, "search", true, None, None),
        MENU_SETTINGS => emit_native_shell_action(app, "settings", true, None, None),
        MENU_RELOAD => emit_unsupported_native_menu_action(
            app,
            "reload",
            "Reload is unsupported because HiCodex has no separate browser panel.",
        ),
        MENU_CLOSE => emit_unsupported_native_menu_action(
            app,
            "closeWindow",
            "Close Window is unsupported because HiCodex has no safe tab target.",
        ),
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
    eprintln!("HiCodex native shell: {message}");
}

fn handle_deep_link_url(app: &AppHandle, url: &str) -> Result<(), String> {
    let trimmed = url.trim();
    if !is_supported_native_shell_url(trimmed) {
        return Err(
            "native shell URL must be a codex:// link or connector OAuth callback".to_string(),
        );
    }
    emit_native_shell_action(app, "openDeepLink", true, None, Some(trimmed));
    eprintln!("HiCodex native shell: received deep link {trimmed}");
    Ok(())
}

fn handle_deep_link_urls<'a, I>(app: &AppHandle, urls: I)
where
    I: IntoIterator<Item = &'a str>,
{
    for url in urls {
        if let Err(error) = handle_deep_link_url(app, url) {
            eprintln!("HiCodex native shell: ignored deep link {url}: {error}");
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
    eprintln!("HiCodex native shell: focused existing instance from cwd {cwd}");
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
            eprintln!("HiCodex native shell: failed to read startup deep links: {error}");
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
        "HiCodex native shell: release update endpoints/signing and product notification entitlement/distribution policy still need production configuration"
    );
}

fn main() {
    tauri::Builder::default()
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
            let state = app.state::<AppState>();
            state.host.forward_events(move |event| {
                let _ = handle.emit(APP_SERVER_EVENT_NAME, event);
            });
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
            host_open_file_reference,
            host_open_external_url,
            host_pick_file_references,
            host_pick_workspace_folder,
            host_read_image_data_url,
            host_read_file_metadata,
            host_read_text_file,
            host_read_spreadsheet_preview,
            host_read_document_preview,
            host_find_rollout_for_thread,
            host_read_thread_tool_history,
            host_notify_turn_completed,
            host_handle_deep_link_url,
            host_generate_image
        ])
        .run(tauri::generate_context!())
        .expect("error while running HiCodex desktop");
}
