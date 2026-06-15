use serde::{Deserialize, Serialize};
use std::sync::atomic::{AtomicU64, Ordering};
use tauri::{AppHandle, Emitter, Manager, WebviewUrl, WebviewWindowBuilder};

use crate::AppState;

use super::socket::{
    browser_extension_backend_socket_path, browser_iab_probe_socket_path,
    existing_browser_extension_backend_socket_path, existing_browser_iab_probe_socket_path,
    BrowserBackendKind,
};

const BROWSER_RUNTIME_EVENT_NAME: &str = "forge://browser-runtime-event";

#[derive(Debug, Clone, Default)]
pub(crate) struct BrowserRuntimeStore {
    pub(crate) tabs: Vec<BrowserRuntimeTab>,
    pub(crate) active_tab_id: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub(crate) struct BrowserRuntimeTab {
    pub(crate) tab_id: String,
    pub(crate) title: String,
    pub(crate) url: String,
    pub(crate) display_url: String,
    pub(crate) open: bool,
    pub(crate) is_agent_working: bool,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub(crate) struct BrowserRuntimeStatus {
    available: bool,
    pub(crate) active_tab_id: Option<String>,
    pub(crate) tabs: Vec<BrowserRuntimeTab>,
    error: Option<String>,
    iab_backend_registered: bool,
    iab_backend_path: Option<String>,
    iab_backend_mode: Option<String>,
    extension_backend_registered: bool,
    extension_backend_validated: bool,
    extension_backend_path: Option<String>,
    extension_backend_mode: Option<String>,
}

static BROWSER_TAB_COUNTER: AtomicU64 = AtomicU64::new(1);

pub(crate) fn open_browser_tab_impl(
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

pub(crate) fn browser_window_label(tab_id: &str) -> String {
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

pub(crate) fn refresh_browser_runtime_store(app: &AppHandle, state: &AppState) {
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

pub(crate) fn mark_browser_tab_closed(state: &AppState, tab_id: &str) {
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

pub(crate) fn browser_runtime_status_from_store(
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

pub(crate) fn emit_browser_runtime_event(app: &AppHandle, state: &AppState, error: Option<String>) {
    let status = browser_runtime_status_from_store(state, error);
    let _ = app.emit(BROWSER_RUNTIME_EVENT_NAME, status);
}

#[cfg(test)]
mod tests {
    use super::{browser_display_url, normalized_browser_url};

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
    fn browser_runtime_refresh_does_not_reopen_closed_tabs() {
        assert!(super::refreshed_browser_tab_open_state(true, true));
        assert!(!super::refreshed_browser_tab_open_state(true, false));
        assert!(!super::refreshed_browser_tab_open_state(false, true));
        assert!(!super::refreshed_browser_tab_open_state(false, false));
    }
}
