// Windows release builds must use the GUI subsystem — without this the app
// binary keeps a console and every launch drags a black console window along.
#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

use forge_host::AppServerHost;
use std::process::Command;
use std::sync::atomic::AtomicBool;
use std::sync::Mutex;
use tauri::{Emitter, Manager};

mod app_server;
mod browser_runtime;
mod codex_bundle;
mod command_error;
mod document_preview;
mod git_host;
mod global_state;
mod image_generation;
mod local_files;
mod native_shell;
mod projectless;
mod spreadsheet_preview;
mod thread_rollouts;
mod workspace_files;

use browser_runtime::BrowserRuntimeStore;

const APP_SERVER_EVENT_NAME: &str = "forge://app-server-event";

struct AppState {
    host: AppServerHost,
    browser_runtime: Mutex<BrowserRuntimeStore>,
    global_state: Mutex<global_state::GlobalStateStore>,
    browser_extension_backend_validated: AtomicBool,
}

impl Default for AppState {
    fn default() -> Self {
        Self {
            host: AppServerHost::new(),
            browser_runtime: Mutex::new(BrowserRuntimeStore::default()),
            global_state: Mutex::new(global_state::GlobalStateStore::default()),
            browser_extension_backend_validated: AtomicBool::new(false),
        }
    }
}

/// `Command::new` that never flashes a console window on Windows. A GUI-
/// subsystem parent gives console-subsystem children (git/gh/curl/cmd/...)
/// a brand-new console unless CREATE_NO_WINDOW is set; on other platforms
/// this is a plain `Command::new`.
pub(crate) fn new_command(program: impl AsRef<std::ffi::OsStr>) -> Command {
    #[allow(unused_mut)]
    let mut command = Command::new(program);
    #[cfg(target_os = "windows")]
    {
        use std::os::windows::process::CommandExt;
        const CREATE_NO_WINDOW: u32 = 0x0800_0000;
        command.creation_flags(CREATE_NO_WINDOW);
    }
    command
}

pub(crate) fn civil_from_days(days_since_epoch: i64) -> (i64, i64, i64) {
    let z = days_since_epoch + 719_468;
    let era = if z >= 0 { z } else { z - 146_096 } / 146_097;
    let doe = z - era * 146_097;
    let yoe = (doe - doe / 1_460 + doe / 36_524 - doe / 146_096) / 365;
    let y = yoe + era * 400;
    let doy = doe - (365 * yoe + yoe / 4 - yoe / 100);
    let mp = (5 * doy + 2) / 153;
    let day = doy - (153 * mp + 2) / 5 + 1;
    let month = mp + if mp < 10 { 3 } else { -9 };
    let year = y + if month <= 2 { 1 } else { 0 };
    (year, month, day)
}

fn main() {
    tauri::Builder::default()
        /*
         * Persistent on-disk logs (macOS: ~/Library/Logs/<identifier>/forge.log).
         * A distributed desktop app previously had ZERO log files — every
         * eprintln! vanished once the app ran outside a terminal, so field
         * issues (sidecar deaths, panics) left no trace to collect.
         */
        .plugin(
            tauri_plugin_log::Builder::new()
                .level(log::LevelFilter::Info)
                .targets([
                    tauri_plugin_log::Target::new(tauri_plugin_log::TargetKind::LogDir {
                        file_name: Some("forge".into()),
                    }),
                    tauri_plugin_log::Target::new(tauri_plugin_log::TargetKind::Stdout),
                ])
                .max_file_size(2_000_000)
                .rotation_strategy(tauri_plugin_log::RotationStrategy::KeepOne)
                .build(),
        )
        .register_uri_scheme_protocol("codexbundle", |_ctx, request| {
            codex_bundle::handle_bundle_request(&request)
        })
        .plugin(tauri_plugin_single_instance::init(
            native_shell::handle_single_instance_activation,
        ))
        .plugin(tauri_plugin_deep_link::init())
        .plugin(tauri_plugin_shell::init())
        .plugin(tauri_plugin_notification::init())
        .plugin(tauri_plugin_updater::Builder::new().build())
        .plugin(tauri_plugin_process::init())
        .on_menu_event(|app, event| {
            native_shell::handle_native_menu_event(app, event.id().as_ref());
        })
        .manage(AppState::default())
        .setup(|app| {
            // Panics must reach the log file: the default hook only writes to
            // stderr, which is invisible in a bundled app. Chain (not replace)
            // the previous hook so abort/backtrace behavior stays intact.
            let previous_panic_hook = std::panic::take_hook();
            std::panic::set_hook(Box::new(move |info| {
                log::error!(target: "panic", "{info}");
                previous_panic_hook(info);
            }));
            native_shell::install_native_menu(app)?;
            native_shell::install_deep_link_handlers(app);
            native_shell::log_unsupported_native_shell_boundaries();
            let handle = app.handle().clone();
            match browser_runtime::start_browser_iab_probe_server(handle.clone()) {
                Ok(path) => log::info!(
                    target: "browser-iab",
                    "probe backend listening at {}",
                    path.to_string_lossy()
                ),
                Err(error) => {
                    log::warn!(target: "browser-iab", "failed to start probe backend: {error}")
                }
            }
            if browser_runtime::browser_extension_backend_enabled() {
                match browser_runtime::start_browser_extension_backend_spike_server(handle.clone())
                {
                    Ok(path) => log::info!(
                        target: "browser-extension",
                        "host-compatible spike listening at {}",
                        path.to_string_lossy()
                    ),
                    Err(error) => log::warn!(
                        target: "browser-extension",
                        "failed to start host-compatible spike: {error}"
                    ),
                }
            }
            let state = app.state::<AppState>();
            state.host.forward_events(move |event| {
                // Sidecar lifecycle/errors are the field-debugging signal; the
                // JSON stream itself stays out of the log (volume + privacy).
                match &event {
                    forge_host::AppServerEvent::Lifecycle { message, .. } => {
                        log::info!(target: "app-server", "{message}");
                    }
                    forge_host::AppServerEvent::Error { message } => {
                        log::warn!(target: "app-server", "{message}");
                    }
                    _ => {}
                }
                let _ = handle.emit(APP_SERVER_EVENT_NAME, event);
            });
            // Experimental: host the real Codex Desktop bundle in a separate
            // window when FORGE_CODEX_BUNDLE (or the legacy HICODEX_CODEX_BUNDLE
            // spelling) is set. The clean-room `main` window is the untouched
            // default and is unaffected.
            if std::env::var("FORGE_CODEX_BUNDLE")
                .or_else(|_| std::env::var("HICODEX_CODEX_BUNDLE"))
                .is_ok()
            {
                if let Err(error) = codex_bundle::open_codex_bundle_window(app.handle().clone()) {
                    log::warn!(target: "codex-bundle", "failed to open window: {error}");
                }
            }
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            app_server::host_start_app_server,
            app_server::host_stop_app_server,
            app_server::host_status,
            app_server::host_send_raw,
            app_server::host_read_app_settings,
            app_server::host_write_app_settings,
            app_server::host_write_local_model_catalog,
            app_server::host_read_codex_auth_summary,
            app_server::host_read_installation_state,
            app_server::host_read_computer_use_readiness,
            app_server::host_repair_computer_use_bundle,
            app_server::host_open_computer_use_setup,
            global_state::host_read_global_state,
            global_state::host_write_global_state,
            global_state::host_write_queued_follow_ups_for_thread,
            global_state::host_acquire_queued_follow_up_send_lock,
            global_state::host_release_queued_follow_up_send_lock,
            browser_runtime::host_browser_runtime_status,
            browser_runtime::host_open_browser_tab,
            local_files::host_open_file_reference,
            local_files::host_reveal_path,
            native_shell::host_open_thread_window,
            native_shell::host_open_new_window,
            local_files::host_open_external_url,
            local_files::host_pick_file_references,
            local_files::host_pick_workspace_folder,
            local_files::host_read_image_data_url,
            local_files::host_read_file_metadata,
            local_files::host_read_text_file,
            local_files::host_read_spreadsheet_preview,
            local_files::host_read_file_bytes_base64,
            local_files::host_read_document_preview,
            git_host::host_git_status,
            git_host::host_git_list_branches,
            git_host::host_git_checkout_branch,
            git_host::host_git_default_branch,
            git_host::host_git_create_branch,
            git_host::host_gh_pr_status,
            git_host::host_apply_patch_action,
            git_host::host_create_pending_worktree,
            projectless::host_create_projectless_thread_cwd,
            thread_rollouts::host_find_rollout_for_thread,
            thread_rollouts::host_read_thread_tool_history,
            native_shell::host_notify_turn_completed,
            native_shell::host_handle_deep_link_url,
            image_generation::host_generate_image,
            workspace_files::host_workspace_list_dir,
            codex_bundle::open_codex_bundle_window
        ])
        .run(tauri::generate_context!())
        .expect("error while running Forge desktop");
}
