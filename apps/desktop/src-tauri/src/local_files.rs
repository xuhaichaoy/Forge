use base64::{engine::general_purpose, Engine as _};
use serde::Serialize;
use std::fs;
use std::io::Read;
use std::path::Path;

use crate::command_error::HostCommandError;
use crate::document_preview::{read_document_preview, DocumentPreview};
use crate::new_command;
use crate::spreadsheet_preview::{read_spreadsheet_preview, SpreadsheetPreview};

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub(crate) struct LocalFileMetadata {
    is_file: bool,
    size_bytes: Option<u64>,
    mime_type: Option<String>,
}

#[tauri::command(async)]
pub(crate) fn host_open_file_reference(
    path: String,
    line: Option<u32>,
) -> Result<(), HostCommandError> {
    let trimmed = path.trim();
    if trimmed.is_empty() {
        return Err(HostCommandError::invalid_input("file path is empty"));
    }
    let target = Path::new(trimmed);
    if !target.exists() {
        return Err(HostCommandError::not_found(format!(
            "file does not exist: {trimmed}"
        )));
    }
    let line_suffix = line
        .filter(|value| *value > 0)
        .map(|value| format!(":{value}"))
        .unwrap_or_default();
    let display_target = format!("{trimmed}{line_suffix}");
    open_path(target).map_err(|error| {
        HostCommandError::process_failed(format!("failed to open {display_target}: {error}"))
    })
}

// Mirrors Codex Desktop's `workspace-file-reveal-path` context-menu action
// (workspace-file-context-menu-*.js): reveal a file/folder in the OS file
// manager, selecting the item where the platform supports it.
#[tauri::command(async)]
pub(crate) fn host_reveal_path(path: String) -> Result<(), HostCommandError> {
    let trimmed = path.trim();
    if trimmed.is_empty() {
        return Err(HostCommandError::invalid_input("file path is empty"));
    }
    let target = Path::new(trimmed);
    if !target.exists() {
        return Err(HostCommandError::not_found(format!(
            "path does not exist: {trimmed}"
        )));
    }
    reveal_path(target).map_err(|error| {
        HostCommandError::process_failed(format!("failed to reveal {trimmed}: {error}"))
    })
}

#[tauri::command(async)]
pub(crate) fn host_open_external_url(url: String) -> Result<(), HostCommandError> {
    let target = normalized_external_url(&url).map_err(HostCommandError::invalid_input)?;
    open_external_url(&target).map_err(|error| {
        HostCommandError::process_failed(format!("failed to open external URL: {error}"))
    })
}

#[tauri::command(async)]
pub(crate) fn host_pick_file_references(
    kind: Option<String>,
    multiple: Option<bool>,
) -> Result<Vec<String>, HostCommandError> {
    pick_file_references(kind.as_deref(), multiple.unwrap_or(true))
        .map_err(HostCommandError::process_failed)
}

#[tauri::command(async)]
pub(crate) fn host_pick_workspace_folder() -> Result<Option<String>, HostCommandError> {
    pick_workspace_folder().map_err(HostCommandError::process_failed)
}

#[tauri::command(async)]
pub(crate) fn host_read_image_data_url(path: String) -> Result<String, HostCommandError> {
    let trimmed = path.trim();
    if trimmed.is_empty() {
        return Err(HostCommandError::invalid_input("image path is empty"));
    }
    let target = Path::new(trimmed);
    if !target.is_file() {
        return Err(HostCommandError::not_found(format!(
            "image file does not exist: {trimmed}"
        )));
    }
    let mime = image_mime_type(target).ok_or_else(|| {
        HostCommandError::unsupported(format!("unsupported image type: {trimmed}"))
    })?;
    let bytes = fs::read(target)
        .map_err(|error| HostCommandError::io_failed(format!("failed to read image: {error}")))?;
    Ok(format!(
        "data:{mime};base64,{}",
        general_purpose::STANDARD.encode(bytes)
    ))
}

#[tauri::command(async)]
pub(crate) fn host_read_file_metadata(path: String) -> Result<LocalFileMetadata, HostCommandError> {
    let trimmed = path.trim();
    if trimmed.is_empty() {
        return Err(HostCommandError::invalid_input("file path is empty"));
    }
    let target = Path::new(trimmed);
    let metadata = fs::metadata(target).map_err(|error| {
        HostCommandError::io_failed(format!("failed to read file metadata: {error}"))
    })?;
    let is_file = metadata.is_file();
    Ok(LocalFileMetadata {
        is_file,
        size_bytes: if is_file { Some(metadata.len()) } else { None },
        mime_type: file_mime_type(target).map(ToOwned::to_owned),
    })
}

#[tauri::command(async)]
pub(crate) fn host_read_text_file(
    path: String,
    max_bytes: Option<u64>,
) -> Result<String, HostCommandError> {
    let trimmed = path.trim();
    if trimmed.is_empty() {
        return Err(HostCommandError::invalid_input("text file path is empty"));
    }
    let target = Path::new(trimmed);
    if !target.is_file() {
        return Err(HostCommandError::not_found(format!(
            "text file does not exist: {trimmed}"
        )));
    }

    if is_word_document_path(target) {
        return read_document_preview(target, 200, 1_000)
            .map(DocumentPreview::into_plain_text)
            .map_err(HostCommandError::process_failed);
    }

    let max_bytes = max_bytes.unwrap_or(120_000).clamp(1, 240_000);
    let mut file = fs::File::open(target).map_err(|error| {
        HostCommandError::io_failed(format!("failed to open text file: {error}"))
    })?;
    let mut bytes = Vec::new();
    Read::by_ref(&mut file)
        .take(max_bytes + 1)
        .read_to_end(&mut bytes)
        .map_err(|error| {
            HostCommandError::io_failed(format!("failed to read text file: {error}"))
        })?;

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

#[tauri::command(async)]
pub(crate) fn host_read_spreadsheet_preview(
    path: String,
    max_rows: Option<usize>,
    max_cols: Option<usize>,
) -> Result<SpreadsheetPreview, HostCommandError> {
    let trimmed = path.trim();
    if trimmed.is_empty() {
        return Err(HostCommandError::invalid_input("spreadsheet path is empty"));
    }
    let target = Path::new(trimmed);
    if !target.is_file() {
        return Err(HostCommandError::not_found(format!(
            "spreadsheet file does not exist: {trimmed}"
        )));
    }

    let max_rows = max_rows.unwrap_or(80).clamp(1, 400);
    let max_cols = max_cols.unwrap_or(24).clamp(1, 120);
    read_spreadsheet_preview(target, max_rows, max_cols).map_err(HostCommandError::process_failed)
}

// CODEX-REF: webview/assets/open-workspace-file-DOOUD1lA.js — Codex Desktop streams
// xlsx bytes to its WASM Popcorn workbook viewer. Forge's reduced preview parses
// the workbook in the renderer with SheetJS, so we need raw bytes back. The CSP
// blocks `fetch()` against the asset protocol, so we expose a small base64
// fetcher that mirrors the existing `host_read_image_data_url` pattern and is
// capped so we never load a multi-hundred-MB workbook into JS.
#[tauri::command(async)]
pub(crate) fn host_read_file_bytes_base64(
    path: String,
    max_bytes: Option<u64>,
) -> Result<String, HostCommandError> {
    let trimmed = path.trim();
    if trimmed.is_empty() {
        return Err(HostCommandError::invalid_input("file path is empty"));
    }
    let target = Path::new(trimmed);
    if !target.is_file() {
        return Err(HostCommandError::not_found(format!(
            "file does not exist: {trimmed}"
        )));
    }
    // Cap to ~16 MiB so an accidentally giant workbook can't pin the renderer.
    let max_bytes = max_bytes
        .unwrap_or(16 * 1024 * 1024)
        .clamp(1, 64 * 1024 * 1024);
    let mut file = fs::File::open(target)
        .map_err(|error| HostCommandError::io_failed(format!("failed to open file: {error}")))?;
    let mut bytes = Vec::new();
    Read::by_ref(&mut file)
        .take(max_bytes + 1)
        .read_to_end(&mut bytes)
        .map_err(|error| HostCommandError::io_failed(format!("failed to read file: {error}")))?;
    if bytes.len() as u64 > max_bytes {
        return Err(HostCommandError::unsupported(format!(
            "file exceeds preview limit ({} bytes)",
            max_bytes
        )));
    }
    Ok(general_purpose::STANDARD.encode(bytes))
}

#[tauri::command(async)]
pub(crate) fn host_read_document_preview(
    path: String,
    max_paragraphs: Option<usize>,
    max_chars_per_paragraph: Option<usize>,
) -> Result<DocumentPreview, HostCommandError> {
    let trimmed = path.trim();
    if trimmed.is_empty() {
        return Err(HostCommandError::invalid_input("document path is empty"));
    }
    let target = Path::new(trimmed);
    if !target.is_file() {
        return Err(HostCommandError::not_found(format!(
            "document file does not exist: {trimmed}"
        )));
    }

    let max_paragraphs = max_paragraphs.unwrap_or(80).clamp(1, 400);
    let max_chars_per_paragraph = max_chars_per_paragraph.unwrap_or(400).clamp(20, 4_000);
    read_document_preview(target, max_paragraphs, max_chars_per_paragraph)
        .map_err(HostCommandError::process_failed)
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
    let output = new_command("osascript")
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
    let output = new_command("osascript")
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
        new_command("open").arg(path).spawn().map(|_| ())
    }
    #[cfg(target_os = "windows")]
    {
        new_command("cmd")
            .args(["/C", "start", "", &path.to_string_lossy()])
            .spawn()
            .map(|_| ())
    }
    #[cfg(all(unix, not(target_os = "macos")))]
    {
        new_command("xdg-open").arg(path).spawn().map(|_| ())
    }
}

pub(crate) fn open_existing_path(path: &str) -> Result<(), HostCommandError> {
    let target = Path::new(path);
    if !target.exists() {
        return Err(HostCommandError::not_found(format!(
            "path does not exist: {path}"
        )));
    }
    open_path(target).map_err(|error| {
        HostCommandError::process_failed(format!("failed to open {path}: {error}"))
    })
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
        new_command("open").arg("-R").arg(path).spawn().map(|_| ())
    }
    #[cfg(target_os = "windows")]
    {
        new_command("explorer")
            .arg(format!("/select,{}", path.to_string_lossy()))
            .spawn()
            .map(|_| ())
    }
    #[cfg(all(unix, not(target_os = "macos")))]
    {
        let target = path.parent().unwrap_or(path);
        new_command("xdg-open").arg(target).spawn().map(|_| ())
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
        new_command("open").arg(url).spawn().map(|_| ())
    }
    #[cfg(target_os = "windows")]
    {
        // Do not use `cmd /C start`: OAuth URLs contain `&`, which cmd treats
        // as a command separator and passes to the browser truncated.
        let (program, args) = windows_external_url_command(url);
        new_command(program).args(args).spawn().map(|_| ())
    }
    #[cfg(all(unix, not(target_os = "macos")))]
    {
        new_command("xdg-open").arg(url).spawn().map(|_| ())
    }
}

#[cfg(target_os = "windows")]
fn windows_external_url_command(url: &str) -> (&'static str, [&str; 2]) {
    ("rundll32", ["url.dll,FileProtocolHandler", url])
}

#[cfg(target_os = "macos")]
pub(crate) fn open_macos_system_settings_url(url: &str) -> Result<(), HostCommandError> {
    new_command("open")
        .arg(url)
        .spawn()
        .map(|_| ())
        .map_err(|error| {
            HostCommandError::process_failed(format!("failed to open System Settings: {error}"))
        })
}

#[cfg(not(target_os = "macos"))]
pub(crate) fn open_macos_system_settings_url(_url: &str) -> Result<(), HostCommandError> {
    Err(HostCommandError::unsupported(
        "Computer Use permission setup is only available on macOS.",
    ))
}

#[cfg(test)]
mod tests {
    #[cfg(target_os = "windows")]
    #[test]
    fn windows_external_url_opening_does_not_route_through_cmd() {
        let url = "https://auth.openai.com/oauth/authorize?client_id=codex&redirect_uri=http%3A%2F%2Flocalhost%3A1455%2Fauth%2Fcallback&state=abc";
        let (program, args) = super::windows_external_url_command(url);

        assert_eq!(program, "rundll32");
        assert_eq!(args, ["url.dll,FileProtocolHandler", url]);
    }
}
