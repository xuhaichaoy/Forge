use hicodex_host::{
    AppServerStartConfig, CodexAuthSummary, ComputerUseReadiness, ComputerUseRepairResult,
    HostInstallationState, HostStatus, LocalModelCatalogConfig,
};
use serde_json::Value;
use tauri::State;

use crate::local_files::{open_existing_path, open_macos_system_settings_url};
use crate::AppState;

#[tauri::command]
pub(crate) fn host_start_app_server(
    state: State<'_, AppState>,
    config: AppServerStartConfig,
) -> Result<HostStatus, String> {
    state.host.start(config).map_err(|error| error.to_string())
}

#[tauri::command]
pub(crate) fn host_stop_app_server(state: State<'_, AppState>) -> Result<HostStatus, String> {
    state.host.stop().map_err(|error| error.to_string())
}

#[tauri::command]
pub(crate) fn host_status(state: State<'_, AppState>) -> HostStatus {
    state.host.status()
}

#[tauri::command]
pub(crate) fn host_send_raw(state: State<'_, AppState>, message: Value) -> Result<(), String> {
    state
        .host
        .send_json(message)
        .map_err(|error| error.to_string())
}

#[tauri::command]
pub(crate) fn host_read_app_settings(
    state: State<'_, AppState>,
    codex_home: Option<String>,
) -> Result<String, String> {
    state
        .host
        .read_app_settings(codex_home)
        .map_err(|error| error.to_string())
}

#[tauri::command]
pub(crate) fn host_write_app_settings(
    state: State<'_, AppState>,
    codex_home: Option<String>,
    settings_json: String,
) -> Result<(), String> {
    state
        .host
        .write_app_settings(codex_home, settings_json)
        .map_err(|error| error.to_string())
}

#[tauri::command]
pub(crate) fn host_write_local_model_catalog(
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
pub(crate) fn host_read_codex_auth_summary(
    state: State<'_, AppState>,
    codex_home: Option<String>,
) -> Result<CodexAuthSummary, String> {
    state
        .host
        .read_codex_auth_summary(codex_home)
        .map_err(|error| error.to_string())
}

#[tauri::command]
pub(crate) fn host_read_installation_state(
    state: State<'_, AppState>,
    codex_home: Option<String>,
) -> Result<HostInstallationState, String> {
    state
        .host
        .read_or_init_installation_state(codex_home)
        .map_err(|error| error.to_string())
}

#[tauri::command]
pub(crate) fn host_read_computer_use_readiness(
    state: State<'_, AppState>,
    codex_home: Option<String>,
) -> Result<ComputerUseReadiness, String> {
    state
        .host
        .read_computer_use_readiness(codex_home)
        .map_err(|error| error.to_string())
}

#[tauri::command]
pub(crate) fn host_repair_computer_use_bundle(
    state: State<'_, AppState>,
    codex_home: Option<String>,
) -> Result<ComputerUseRepairResult, String> {
    state
        .host
        .repair_computer_use_bundle(codex_home)
        .map_err(|error| error.to_string())
}

#[tauri::command]
pub(crate) fn host_open_computer_use_setup(
    state: State<'_, AppState>,
    codex_home: Option<String>,
    target: String,
) -> Result<(), String> {
    let target = target.trim();
    if target.is_empty() {
        return Err("computer use setup target is empty".to_string());
    }
    match target {
        "helper" | "app" => {
            let readiness = state
                .host
                .read_computer_use_readiness(codex_home)
                .map_err(|error| error.to_string())?;
            let path = readiness
                .helper_app_path
                .ok_or_else(|| "Computer Use helper app is not available.".to_string())?;
            open_existing_path(&path)
        }
        "installer" => {
            let readiness = state
                .host
                .read_computer_use_readiness(codex_home)
                .map_err(|error| error.to_string())?;
            let path = readiness
                .installer_app_path
                .ok_or_else(|| "Computer Use installer app is not available.".to_string())?;
            open_existing_path(&path)
        }
        "screenRecording" | "screenRecordingSettings" => open_macos_system_settings_url(
            "x-apple.systempreferences:com.apple.preference.security?Privacy_ScreenCapture",
        ),
        "accessibility" | "accessibilitySettings" => open_macos_system_settings_url(
            "x-apple.systempreferences:com.apple.preference.security?Privacy_Accessibility",
        ),
        _ => Err(format!("unsupported computer use setup target: {target}")),
    }
}
