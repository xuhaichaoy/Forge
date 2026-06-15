use serde_json::{json, Value};
use tauri::{AppHandle, Manager};

use crate::AppState;

use super::super::store::{
    browser_window_label, emit_browser_runtime_event, mark_browser_tab_closed,
    refresh_browser_runtime_store, BrowserRuntimeStore, BrowserRuntimeTab,
};

pub(crate) fn browser_iab_tabs_from_store(store: &BrowserRuntimeStore) -> Vec<Value> {
    store
        .tabs
        .iter()
        .filter(|tab| tab.open)
        .enumerate()
        .filter_map(|(index, tab)| {
            browser_iab_tab_from_runtime_tab(
                tab,
                browser_iab_tab_id(tab, index + 1),
                store.active_tab_id.as_deref() == Some(&tab.tab_id),
            )
        })
        .collect()
}

pub(crate) fn browser_iab_tab_from_runtime_tab(
    tab: &BrowserRuntimeTab,
    id: usize,
    active: bool,
) -> Option<Value> {
    if !tab.open {
        return None;
    }
    Some(json!({
        "id": id,
        "active": active,
        "title": tab.title,
        "url": tab.url,
    }))
}

pub(crate) fn browser_iab_runtime_tab_for_id(
    store: &BrowserRuntimeStore,
    iab_tab_id: usize,
) -> Option<&BrowserRuntimeTab> {
    store
        .tabs
        .iter()
        .filter(|tab| tab.open)
        .enumerate()
        .find_map(|(index, tab)| (browser_iab_tab_id(tab, index + 1) == iab_tab_id).then_some(tab))
}

pub(crate) fn browser_iab_runtime_tab_clone_for_id(
    app: &AppHandle,
    iab_tab_id: usize,
) -> Result<BrowserRuntimeTab, String> {
    let state = app.state::<AppState>();
    refresh_browser_runtime_store(app, &state);
    let store = state
        .browser_runtime
        .lock()
        .expect("browser runtime mutex poisoned");
    browser_iab_runtime_tab_for_id(&store, iab_tab_id)
        .cloned()
        .ok_or_else(|| format!("Browser iab tab {iab_tab_id} is not open."))
}

pub(crate) fn browser_iab_tab_id(tab: &BrowserRuntimeTab, fallback: usize) -> usize {
    tab.tab_id
        .strip_prefix("active-")
        .and_then(|value| value.parse::<usize>().ok())
        .filter(|value| *value > 0)
        .unwrap_or(fallback)
}

// The "hicodex-" prefixes below are wire-visible CDP frame/loader/target id
// values echoed back by the codex browser host; they deliberately keep the
// legacy spelling across the Forge rebrand (protocol surface, see keep-list).
pub(crate) fn browser_iab_frame_id(tab_id: usize) -> String {
    format!("hicodex-frame-{tab_id}")
}

pub(crate) fn browser_iab_loader_id(tab_id: usize) -> String {
    format!("hicodex-loader-{tab_id}")
}

pub(crate) fn browser_iab_target_id(tab_id: usize) -> String {
    format!("hicodex-target-{tab_id}")
}

pub(crate) fn browser_iab_tab_id_from_target_id(target_id: &str) -> Option<usize> {
    target_id
        .strip_prefix("hicodex-target-")
        .and_then(|value| value.parse::<usize>().ok())
        .filter(|value| *value > 0)
}

pub(crate) fn browser_iab_targets_from_store(store: &BrowserRuntimeStore) -> Vec<Value> {
    store
        .tabs
        .iter()
        .filter(|tab| tab.open)
        .enumerate()
        .map(|(index, tab)| {
            let tab_id = browser_iab_tab_id(tab, index + 1);
            json!({
                "targetId": browser_iab_target_id(tab_id),
                "type": "page",
                "title": tab.title,
                "url": tab.url,
                "attached": true,
                "canAccessOpener": false,
                "tabId": tab_id,
            })
        })
        .collect()
}

pub(crate) fn browser_iab_close_tab(app: &AppHandle, tab_id: usize) -> Result<(), String> {
    let state = app.state::<AppState>();
    let internal_tab_id = {
        let store = state
            .browser_runtime
            .lock()
            .expect("browser runtime mutex poisoned");
        browser_iab_runtime_tab_for_id(&store, tab_id)
            .map(|tab| tab.tab_id.clone())
            .ok_or_else(|| format!("Browser iab tab {tab_id} is not open."))?
    };
    let label = browser_window_label(&internal_tab_id);
    if let Some(window) = app.get_webview_window(&label) {
        window
            .close()
            .map_err(|error| format!("failed to close Browser tab: {error}"))?;
    }
    mark_browser_tab_closed(&state, &internal_tab_id);
    emit_browser_runtime_event(app, &state, None);
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::super::super::store::{BrowserRuntimeStore, BrowserRuntimeTab};
    use super::browser_iab_tabs_from_store;

    #[test]
    fn browser_iab_tabs_use_numeric_ids_and_active_marker() {
        let store = BrowserRuntimeStore {
            active_tab_id: Some("active-9".to_string()),
            tabs: vec![
                BrowserRuntimeTab {
                    tab_id: "active-7".to_string(),
                    title: "Closed".to_string(),
                    url: "https://closed.example".to_string(),
                    display_url: "closed.example".to_string(),
                    open: false,
                    is_agent_working: false,
                },
                BrowserRuntimeTab {
                    tab_id: "active-9".to_string(),
                    title: "Docs".to_string(),
                    url: "https://platform.openai.com/docs".to_string(),
                    display_url: "platform.openai.com/docs".to_string(),
                    open: true,
                    is_agent_working: false,
                },
            ],
        };

        let tabs = browser_iab_tabs_from_store(&store);

        assert_eq!(tabs.len(), 1);
        assert_eq!(tabs[0]["id"], 9);
        assert_eq!(tabs[0]["active"], true);
        assert_eq!(tabs[0]["title"], "Docs");
        assert_eq!(tabs[0]["url"], "https://platform.openai.com/docs");
    }
}
