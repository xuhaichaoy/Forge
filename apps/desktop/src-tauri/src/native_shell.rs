use serde::Deserialize;
use serde_json::json;
#[cfg(not(target_os = "windows"))]
use tauri::menu::{MenuBuilder, MenuItemBuilder, PredefinedMenuItem, SubmenuBuilder};
use tauri::{AppHandle, Emitter, Manager, WebviewUrl, WebviewWindowBuilder};
use tauri_plugin_deep_link::DeepLinkExt;
use tauri_plugin_notification::NotificationExt;

const NATIVE_SHELL_EVENT_NAME: &str = "hicodex://native-shell-event";
const CODEX_DEEP_LINK_SCHEME: &str = "codex://";
const APP_CONNECT_OAUTH_CALLBACK_PATH: &str = "/aip/connectors/links/oauth/callback";
const APP_CONNECT_OAUTH_BROWSER_REDIRECT_PATH: &str = "/connector_platform_oauth_redirect";

const MENU_NEW_CHAT: &str = "hicodex:new-chat";
const MENU_NEW_WINDOW: &str = "hicodex:new-window";
const MENU_OPEN_FOLDER: &str = "hicodex:open-folder";
const MENU_SEARCH: &str = "hicodex:search";
const MENU_SETTINGS: &str = "hicodex:settings";
const MENU_RELOAD: &str = "hicodex:reload";
const MENU_TOGGLE_DEVTOOLS: &str = "hicodex:toggle-devtools";
const MENU_CLOSE: &str = "hicodex:close-window";
const MENU_QUIT: &str = "hicodex:quit";

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub(crate) struct TurnCompletionNotificationRequest {
    title: Option<String>,
    body: Option<String>,
    sound: Option<bool>,
    thread_id: Option<String>,
    turn_id: Option<String>,
    status: Option<String>,
}

// Mirrors Codex Desktop's `threadHeader.openInNewWindow` ("Open in new window").
// Codex (Electron) opens a BrowserWindow; HiCodex opens a second Tauri webview
// loading the same app, injecting the target thread id via an initialization
// script so the frontend can route to it on startup (reusing the existing
// deep-link routing) without a load-timing race. An already-open window for the
// thread is focused instead of duplicated.
#[tauri::command]
pub(crate) fn host_open_thread_window(app: AppHandle, thread_id: String) -> Result<(), String> {
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
pub(crate) fn host_open_new_window(app: AppHandle) -> Result<(), String> {
    open_new_window_impl(&app)
}

#[tauri::command]
pub(crate) fn host_notify_turn_completed(
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
pub(crate) fn host_handle_deep_link_url(app: AppHandle, url: String) -> Result<(), String> {
    handle_deep_link_url(&app, &url)
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

#[cfg(target_os = "windows")]
pub(crate) fn install_native_menu(_app: &mut tauri::App) -> tauri::Result<()> {
    // Tauri renders native menus as an in-window menu bar on Windows.
    Ok(())
}

#[cfg(not(target_os = "windows"))]
pub(crate) fn install_native_menu(app: &mut tauri::App) -> tauri::Result<()> {
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
    let toggle_devtools = MenuItemBuilder::with_id(MENU_TOGGLE_DEVTOOLS, "Toggle Developer Tools")
        .accelerator("CmdOrCtrl+Alt+I")
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
    let view_menu = SubmenuBuilder::new(handle, "View")
        .item(&reload)
        .item(&toggle_devtools)
        .build()?;
    let menu = MenuBuilder::new(handle)
        .item(&app_menu)
        .item(&file_menu)
        .item(&edit_menu)
        .item(&view_menu)
        .build()?;
    app.set_menu(menu)?;
    Ok(())
}

pub(crate) fn handle_native_menu_event(app: &AppHandle, id: &str) {
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
        MENU_TOGGLE_DEVTOOLS => toggle_main_window_devtools(app),
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

fn toggle_main_window_devtools(app: &AppHandle) {
    let Some(window) = app.get_webview_window("main") else {
        eprintln!("Forge native shell: main window unavailable for developer tools");
        return;
    };
    if window.is_devtools_open() {
        window.close_devtools();
    } else {
        window.open_devtools();
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

pub(crate) fn handle_single_instance_activation(app: &AppHandle, args: Vec<String>, cwd: String) {
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
    let Some((scheme, host, path)) = split_http_url_parts(url.trim()) else {
        return false;
    };
    let allowed_path =
        path == APP_CONNECT_OAUTH_CALLBACK_PATH || path == APP_CONNECT_OAUTH_BROWSER_REDIRECT_PATH;
    if !allowed_path {
        return false;
    }
    if scheme == "https" {
        return is_allowed_app_connect_oauth_host(&host);
    }
    scheme == "http" && is_loopback_host(&host)
}

fn split_http_url_parts(url: &str) -> Option<(&str, String, &str)> {
    let scheme_end = url.find("://")?;
    let scheme = &url[..scheme_end];
    if !scheme.eq_ignore_ascii_case("https") && !scheme.eq_ignore_ascii_case("http") {
        return None;
    }
    let rest = &url[scheme_end + 3..];
    let authority_end = rest.find(['/', '?', '#']).unwrap_or(rest.len());
    let authority = &rest[..authority_end];
    if authority.is_empty() || authority.contains('@') {
        return None;
    }
    let host = if let Some(stripped) = authority.strip_prefix('[') {
        let end = stripped.find(']')?;
        stripped[..end].to_ascii_lowercase()
    } else {
        authority
            .split(':')
            .next()
            .unwrap_or_default()
            .to_ascii_lowercase()
    };
    if host.is_empty() {
        return None;
    }
    let path_and_after = &rest[authority_end..];
    let path = if path_and_after.starts_with('/') {
        let path_end = path_and_after
            .find(['?', '#'])
            .unwrap_or(path_and_after.len());
        &path_and_after[..path_end]
    } else {
        "/"
    };
    Some((
        if scheme.eq_ignore_ascii_case("https") {
            "https"
        } else {
            "http"
        },
        host,
        path,
    ))
}

fn is_allowed_app_connect_oauth_host(host: &str) -> bool {
    host == "chatgpt.com" || host == "chat.openai.com"
}

fn is_loopback_host(host: &str) -> bool {
    host == "localhost" || host == "::1" || host == "127.0.0.1" || host.starts_with("127.")
}

pub(crate) fn install_deep_link_handlers(app: &tauri::App) {
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

pub(crate) fn log_unsupported_native_shell_boundaries() {
    eprintln!(
        "Forge native shell: release update endpoints/signing and product notification entitlement/distribution policy still need production configuration"
    );
}

#[cfg(test)]
mod tests {
    use super::is_supported_native_shell_url;

    #[test]
    fn recognizes_shell_links_and_connector_oauth_callbacks() {
        assert!(is_supported_native_shell_url("codex://threads/thread-1"));
        assert!(is_supported_native_shell_url(
            "https://chatgpt.com/aip/connectors/links/oauth/callback?state=s&code=c"
        ));
        assert!(is_supported_native_shell_url(
            "https://chatgpt.com/connector_platform_oauth_redirect?state=s&code=c"
        ));
        assert!(is_supported_native_shell_url(
            "http://127.0.0.1:8787/aip/connectors/links/oauth/callback?state=s&code=c"
        ));
        assert!(!is_supported_native_shell_url(
            "https://example.com/threads/thread-1"
        ));
        assert!(!is_supported_native_shell_url(
            "https://evil.example/?next=/aip/connectors/links/oauth/callback"
        ));
        assert!(!is_supported_native_shell_url(
            "https://evil.example/aip/connectors/links/oauth/callback?state=s&code=c"
        ));
    }
}
