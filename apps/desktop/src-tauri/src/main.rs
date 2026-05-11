use base64::{engine::general_purpose, Engine as _};
use hicodex_host::{
    AppServerHost, AppServerStartConfig, HostStatus, LocalModelCatalogConfig, ThreadToolHistory,
};
use serde::{Deserialize, Serialize};
use serde_json::Value;
use std::env;
use std::fs;
use std::io::{Read, Write};
use std::path::Path;
use std::process::{Command, Stdio};
use std::time::{SystemTime, UNIX_EPOCH};
use tauri::{Emitter, Manager, State};

const APP_SERVER_EVENT_NAME: &str = "hicodex://app-server-event";

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
struct ImageGenerationRequest {
    base_url: String,
    api_key: Option<String>,
    payload: Value,
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
fn host_read_text_file(path: String, max_bytes: Option<u64>) -> Result<String, String> {
    let trimmed = path.trim();
    if trimmed.is_empty() {
        return Err("text file path is empty".to_string());
    }
    let target = Path::new(trimmed);
    if !target.is_file() {
        return Err(format!("text file does not exist: {trimmed}"));
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

    serde_json::from_slice(&output.stdout)
        .map_err(|error| format!("image generation backend returned invalid JSON: {error}"))
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

#[cfg(test)]
mod tests {
    use super::{host_generate_image, image_generations_endpoint, ImageGenerationRequest};
    use serde_json::json;
    use std::io::{Read, Write};
    use std::net::TcpListener;
    use std::thread;
    use std::time::Duration;

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

            let body = r#"{"data":[{"b64_json":"PNGDATA"}]}"#;
            let response = format!(
                "HTTP/1.1 200 OK\r\nContent-Type: application/json\r\nContent-Length: {}\r\nConnection: close\r\n\r\n{}",
                body.len(),
                body
            );
            stream.write_all(response.as_bytes()).unwrap();
            request
        });

        let result = host_generate_image(ImageGenerationRequest {
            base_url: format!("http://{address}/v1"),
            api_key: Some("local-secret".to_string()),
            payload: json!({
                "prompt": "blue sky",
                "n": 1,
                "size": "1024x1024",
            }),
        })
        .unwrap();
        let request = server.join().unwrap();

        assert!(request.starts_with("POST /v1/images/generations "));
        assert!(request.contains("Authorization: Bearer local-secret"));
        assert_eq!(result["data"][0]["b64_json"], "PNGDATA");
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

fn file_mime_type(path: &Path) -> Option<&'static str> {
    if let Some(mime) = image_mime_type(path) {
        return Some(mime);
    }
    let extension = path.extension()?.to_string_lossy().to_lowercase();
    match extension.as_str() {
        "csv" => Some("text/csv"),
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
        .setup(|app| {
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
            host_open_file_reference,
            host_pick_file_references,
            host_read_image_data_url,
            host_read_file_metadata,
            host_read_text_file,
            host_read_thread_tool_history,
            host_generate_image
        ])
        .run(tauri::generate_context!())
        .expect("error while running HiCodex desktop");
}
