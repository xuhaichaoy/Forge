mod cdp;
mod scripts;
mod socket;
mod store;

pub(crate) use socket::{
    browser_extension_backend_enabled, start_browser_extension_backend_spike_server,
    start_browser_iab_probe_server,
};
pub(crate) use store::BrowserRuntimeStore;

use tauri::{AppHandle, State};

use crate::command_error::HostCommandError;
use crate::AppState;

use store::{
    browser_runtime_status_from_store, open_browser_tab_impl, refresh_browser_runtime_store,
    BrowserRuntimeStatus,
};

#[tauri::command]
pub(crate) fn host_browser_runtime_status(
    app: AppHandle,
    state: State<'_, AppState>,
) -> BrowserRuntimeStatus {
    refresh_browser_runtime_store(&app, &state);
    browser_runtime_status_from_store(&state, None)
}

#[tauri::command]
pub(crate) fn host_open_browser_tab(
    app: AppHandle,
    state: State<'_, AppState>,
    url: Option<String>,
    tab_id: Option<String>,
) -> Result<BrowserRuntimeStatus, HostCommandError> {
    open_browser_tab_impl(&app, &state, url, tab_id).map_err(HostCommandError::process_failed)
}
