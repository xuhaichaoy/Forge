use base64::{engine::general_purpose, Engine as _};
use hicodex_host::{
    AppServerEvent, AppServerHost, AppServerStartConfig, HostStatus, LocalModelCatalogConfig,
    ThreadToolHistory,
};
use serde_json::Value;
use std::fs;
use std::path::Path;
use std::process::Command;
use tauri::State;

struct AppState {
    host: AppServerHost,
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
fn host_claim_event_stream(state: State<'_, AppState>) -> u64 {
    state.host.claim_event_stream()
}

#[tauri::command]
fn host_poll_events(
    state: State<'_, AppState>,
    max_events: Option<usize>,
    stream_id: Option<u64>,
) -> Vec<AppServerEvent> {
    state
        .host
        .drain_events(max_events.unwrap_or(128), stream_id)
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
fn host_pick_file_references(
    kind: Option<String>,
    multiple: Option<bool>,
) -> Result<Vec<String>, String> {
    pick_file_references(kind.as_deref(), multiple.unwrap_or(true))
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

#[cfg(not(target_os = "macos"))]
fn pick_file_references(_kind: Option<&str>, _multiple: bool) -> Result<Vec<String>, String> {
    Err("file picker is not implemented for this platform yet".to_string())
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

fn main() {
    tauri::Builder::default()
        .plugin(tauri_plugin_shell::init())
        .manage(AppState::default())
        .invoke_handler(tauri::generate_handler![
            host_start_app_server,
            host_stop_app_server,
            host_status,
            host_send_raw,
            host_claim_event_stream,
            host_poll_events,
            host_write_local_model_catalog,
            host_open_file_reference,
            host_pick_file_references,
            host_read_image_data_url,
            host_read_thread_tool_history
        ])
        .run(tauri::generate_context!())
        .expect("error while running HiCodex desktop");
}
