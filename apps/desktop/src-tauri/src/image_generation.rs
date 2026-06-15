use base64::{engine::general_purpose, Engine as _};
use serde::Deserialize;
use serde_json::Value;
use std::env;
use std::fs::{self, OpenOptions};
use std::io::Write;
use std::path::{Path, PathBuf};
use std::process::Stdio;
use std::time::{SystemTime, UNIX_EPOCH};

use crate::command_error::HostCommandError;

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub(crate) struct ImageGenerationRequest {
    base_url: String,
    api_key: Option<String>,
    payload: Value,
    codex_home: Option<String>,
    thread_id: Option<String>,
}

#[tauri::command(async)]
pub(crate) fn host_generate_image(
    request: ImageGenerationRequest,
) -> Result<Value, HostCommandError> {
    let endpoint =
        image_generations_endpoint(&request.base_url).map_err(HostCommandError::invalid_input)?;
    let body = serde_json::to_vec(&request.payload).map_err(|error| {
        HostCommandError::parse_failed(format!("failed to serialize image request: {error}"))
    })?;
    let header_path = write_image_request_headers(request.api_key.as_deref())
        .map_err(HostCommandError::io_failed)?;
    let header_arg = format!("@{}", header_path.to_string_lossy());
    let mut command = crate::new_command("curl");
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
            return Err(HostCommandError::process_failed(format!(
                "failed to start image request: {error}"
            )));
        }
    };
    let mut stdin = child.stdin.take().ok_or_else(|| {
        let _ = fs::remove_file(&header_path);
        HostCommandError::process_failed("failed to open image request stdin")
    })?;
    if let Err(error) = stdin.write_all(&body) {
        let _ = fs::remove_file(&header_path);
        return Err(HostCommandError::process_failed(format!(
            "failed to write image request body: {error}"
        )));
    }
    drop(stdin);

    let output = match child.wait_with_output() {
        Ok(output) => output,
        Err(error) => {
            let _ = fs::remove_file(&header_path);
            return Err(HostCommandError::process_failed(format!(
                "failed to wait for image request: {error}"
            )));
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
        return Err(HostCommandError::process_failed(if detail.is_empty() {
            format!("image generation backend returned {}", output.status)
        } else {
            detail
        }));
    }

    let response = serde_json::from_slice(&output.stdout).map_err(|error| {
        HostCommandError::parse_failed(format!(
            "image generation backend returned invalid JSON: {error}"
        ))
    })?;
    persist_image_generation_response(
        response,
        request.codex_home.as_deref(),
        request.thread_id.as_deref(),
    )
    .map_err(HostCommandError::io_failed)
}

fn write_image_request_headers(api_key: Option<&str>) -> Result<std::path::PathBuf, String> {
    let mut content = String::from("Content-Type: application/json\n");
    if let Some(token) = api_key.map(str::trim).filter(|value| !value.is_empty()) {
        if token.contains(['\r', '\n']) {
            return Err("image generation API key cannot contain line breaks".to_string());
        }
        content.push_str("Authorization: Bearer ");
        content.push_str(token);
        content.push('\n');
    }
    let path = temp_file_path("forge-image-headers", "txt");
    let mut options = OpenOptions::new();
    options.write(true).create_new(true);
    #[cfg(unix)]
    {
        use std::os::unix::fs::OpenOptionsExt;
        options.mode(0o600);
    }
    let mut file = options
        .open(&path)
        .map_err(|error| format!("failed to write image request headers: {error}"))?;
    file.write_all(content.as_bytes())
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
    if trimmed.starts_with("https://") {
        return Ok(format!("{trimmed}/images/generations"));
    }
    if trimmed.starts_with("http://") {
        if http_base_url_is_loopback(trimmed) {
            return Ok(format!("{trimmed}/images/generations"));
        }
        return Err(
            "image generation base URL must use https unless it targets localhost".to_string(),
        );
    }
    Err("image generation base URL must start with http:// or https://".to_string())
}

fn http_base_url_is_loopback(value: &str) -> bool {
    let Some(rest) = value.strip_prefix("http://") else {
        return false;
    };
    let authority = rest.split(['/', '?', '#']).next().unwrap_or_default();
    if authority.is_empty() || authority.contains('@') {
        return false;
    }
    let host = if let Some(stripped) = authority.strip_prefix('[') {
        let Some(end) = stripped.find(']') else {
            return false;
        };
        &stripped[..end]
    } else {
        authority.split(':').next().unwrap_or_default()
    };
    let host = host.to_ascii_lowercase();
    host == "localhost" || host == "::1" || host == "127.0.0.1" || host.starts_with("127.")
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
        file_url_from_path, host_generate_image, image_generations_endpoint,
        persist_image_generation_response, write_image_request_headers, ImageGenerationRequest,
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
        // pid+nanos alone can collide across parallel test threads; the
        // counter keeps the destructive remove_dir_all from hitting another
        // test's fixture.
        static TEMP_DIR_SEQ: std::sync::atomic::AtomicU64 = std::sync::atomic::AtomicU64::new(0);
        let seq = TEMP_DIR_SEQ.fetch_add(1, std::sync::atomic::Ordering::Relaxed);
        let nanos = SystemTime::now()
            .duration_since(UNIX_EPOCH)
            .map(|value| value.as_nanos())
            .unwrap_or_default();
        let base = std::env::temp_dir().join(format!(
            "forge-image-test-{}-{nanos}-{seq}",
            std::process::id()
        ));
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
        assert_eq!(
            image_generations_endpoint("https://api.example.test/v1").unwrap(),
            "https://api.example.test/v1/images/generations"
        );
    }

    #[test]
    fn rejects_non_http_image_generation_base_url() {
        assert!(image_generations_endpoint("file:///tmp/socket").is_err());
        assert!(image_generations_endpoint("http://api.example.test/v1").is_err());
        assert!(image_generations_endpoint("http://user@localhost:8890/v1").is_err());
    }

    /// Structured-error contract: base-URL validation rejections carry the
    /// stable "invalid_input" code with the unchanged message text.
    #[test]
    fn host_generate_image_rejects_invalid_base_url_with_invalid_input_code() {
        let error = host_generate_image(ImageGenerationRequest {
            base_url: "file:///tmp/socket".to_string(),
            api_key: None,
            payload: json!({}),
            codex_home: None,
            thread_id: None,
        })
        .unwrap_err();
        assert_eq!(error.code, "invalid_input");
        assert_eq!(
            error.message,
            "image generation base URL must start with http:// or https://"
        );
    }

    #[test]
    fn rejects_header_injection_in_api_key() {
        assert!(write_image_request_headers(Some("ok\nX-Injected: yes")).is_err());
    }

    #[cfg(unix)]
    #[test]
    fn writes_image_request_headers_with_private_permissions() {
        use std::os::unix::fs::PermissionsExt;

        let path = write_image_request_headers(Some("local-secret")).unwrap();
        let mode = fs::metadata(&path).unwrap().permissions().mode() & 0o777;
        assert_eq!(mode, 0o600);
        let content = fs::read_to_string(&path).unwrap();
        assert!(content.contains("Authorization: Bearer local-secret"));
        let _ = fs::remove_file(path);
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
