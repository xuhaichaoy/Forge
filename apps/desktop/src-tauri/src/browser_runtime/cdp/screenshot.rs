use base64::{engine::general_purpose, Engine as _};
use serde_json::{json, Value};
use std::env;
use std::fs;
use std::thread;
use std::time::{Duration, SystemTime, UNIX_EPOCH};
use tauri::{AppHandle, Manager};

use crate::new_command;

use super::super::store::{browser_window_label, BrowserRuntimeTab};

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
struct BrowserIabScreenshotRegion {
    x: i32,
    y: i32,
    width: u32,
    height: u32,
}

pub(crate) fn browser_iab_capture_screenshot_result(
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
        "forge-browser-iab-screenshot-{}-{nanos}.{extension}",
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

#[cfg(test)]
mod tests {
    use super::{
        browser_iab_logical_window_region, browser_iab_screenshot_format_and_extension,
        browser_iab_screenshot_region, BrowserIabScreenshotRegion,
    };
    use serde_json::json;

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
}
