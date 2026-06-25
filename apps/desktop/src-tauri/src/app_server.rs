use forge_host::{
    AppServerStartConfig, CodexAuthSummary, ComputerUseReadiness, ComputerUseRepairResult,
    HostInstallationState, HostStatus, LocalModelCatalogConfig,
};
use serde_json::Value;
use tauri::State;

use crate::command_error::HostCommandError;
use crate::local_files::{open_existing_path, open_macos_system_settings_url};
use crate::AppState;

#[tauri::command(async)]
pub(crate) fn host_start_app_server(
    state: State<'_, AppState>,
    config: AppServerStartConfig,
) -> Result<HostStatus, HostCommandError> {
    state.host.start(config).map_err(HostCommandError::from)
}

#[tauri::command(async)]
pub(crate) fn host_stop_app_server(
    state: State<'_, AppState>,
) -> Result<HostStatus, HostCommandError> {
    state.host.stop().map_err(HostCommandError::from)
}

#[tauri::command(async)]
pub(crate) fn host_restart_app_server_if_running(
    state: State<'_, AppState>,
) -> Result<HostStatus, HostCommandError> {
    state
        .host
        .restart_if_running()
        .map_err(HostCommandError::from)
}

// Deliberately sync (main thread): fast in-memory status snapshot (Mutex read +
// non-blocking child try_wait). The installation-state refresh inside is
// memoized per codex_home, so steady-state polling does no filesystem I/O.
#[tauri::command]
pub(crate) fn host_status(state: State<'_, AppState>) -> HostStatus {
    state.host.status()
}

// Deliberately sync (main thread): a quick line write to the app-server stdin
// pipe. Staying on the main thread serializes invocations in IPC arrival order,
// preserving the JSONL write order the app-server protocol relies on (e.g.
// sendUserTurn before interrupt); `(async)` would allow pool-thread reordering.
#[tauri::command]
pub(crate) fn host_send_raw(
    state: State<'_, AppState>,
    message: Value,
) -> Result<(), HostCommandError> {
    state
        .host
        .send_json(message)
        .map_err(HostCommandError::from)
}

#[tauri::command(async)]
pub(crate) fn host_read_app_settings(
    state: State<'_, AppState>,
    codex_home: Option<String>,
) -> Result<String, HostCommandError> {
    state
        .host
        .read_app_settings(codex_home)
        .map_err(HostCommandError::from)
}

#[tauri::command(async)]
pub(crate) fn host_write_app_settings(
    state: State<'_, AppState>,
    codex_home: Option<String>,
    settings_json: String,
) -> Result<(), HostCommandError> {
    state
        .host
        .write_app_settings(codex_home, settings_json)
        .map_err(HostCommandError::from)
}

#[tauri::command(async)]
pub(crate) fn host_write_local_model_catalog(
    state: State<'_, AppState>,
    codex_home: Option<String>,
    config: LocalModelCatalogConfig,
) -> Result<String, HostCommandError> {
    state
        .host
        .write_local_model_catalog(codex_home, config)
        .map_err(HostCommandError::from)
}

#[tauri::command(async)]
pub(crate) fn host_read_codex_auth_summary(
    state: State<'_, AppState>,
    codex_home: Option<String>,
) -> Result<CodexAuthSummary, HostCommandError> {
    state
        .host
        .read_codex_auth_summary(codex_home)
        .map_err(HostCommandError::from)
}

#[tauri::command(async)]
pub(crate) fn host_read_installation_state(
    state: State<'_, AppState>,
    codex_home: Option<String>,
) -> Result<HostInstallationState, HostCommandError> {
    state
        .host
        .read_or_init_installation_state(codex_home)
        .map_err(HostCommandError::from)
}

#[tauri::command(async)]
pub(crate) fn host_read_computer_use_readiness(
    state: State<'_, AppState>,
    codex_home: Option<String>,
) -> Result<ComputerUseReadiness, HostCommandError> {
    state
        .host
        .read_computer_use_readiness(codex_home)
        .map_err(HostCommandError::from)
}

#[tauri::command(async)]
pub(crate) fn host_repair_computer_use_bundle(
    state: State<'_, AppState>,
    codex_home: Option<String>,
) -> Result<ComputerUseRepairResult, HostCommandError> {
    state
        .host
        .repair_computer_use_bundle(codex_home)
        .map_err(HostCommandError::from)
}

#[tauri::command(async)]
pub(crate) fn host_open_computer_use_setup(
    state: State<'_, AppState>,
    codex_home: Option<String>,
    target: String,
) -> Result<(), HostCommandError> {
    let target = target.trim();
    if target.is_empty() {
        return Err(HostCommandError::invalid_input(
            "computer use setup target is empty",
        ));
    }
    match target {
        "helper" | "app" => {
            let readiness = state
                .host
                .read_computer_use_readiness(codex_home)
                .map_err(HostCommandError::from)?;
            let path = readiness.helper_app_path.ok_or_else(|| {
                HostCommandError::not_found("Computer Use helper app is not available.")
            })?;
            open_existing_path(&path)
        }
        "installer" => {
            let readiness = state
                .host
                .read_computer_use_readiness(codex_home)
                .map_err(HostCommandError::from)?;
            let path = readiness.installer_app_path.ok_or_else(|| {
                HostCommandError::not_found("Computer Use installer app is not available.")
            })?;
            open_existing_path(&path)
        }
        "screenRecording" | "screenRecordingSettings" => open_macos_system_settings_url(
            "x-apple.systempreferences:com.apple.preference.security?Privacy_ScreenCapture",
        ),
        "accessibility" | "accessibilitySettings" => open_macos_system_settings_url(
            "x-apple.systempreferences:com.apple.preference.security?Privacy_Accessibility",
        ),
        _ => Err(HostCommandError::invalid_input(format!(
            "unsupported computer use setup target: {target}"
        ))),
    }
}
