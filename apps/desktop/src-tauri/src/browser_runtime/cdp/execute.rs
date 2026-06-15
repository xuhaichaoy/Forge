use serde_json::{json, Value};
use tauri::{AppHandle, Manager};

use crate::AppState;

use super::super::scripts::{
    browser_iab_dom_describe_node_script, browser_iab_dom_frame_owner_script,
    browser_iab_dom_geometry_script, browser_iab_dom_node_for_location_script,
    browser_iab_dom_query_selector_script, browser_iab_dom_scroll_into_view_script,
    browser_iab_insert_text_script, browser_iab_key_event_script, browser_iab_mouse_event_script,
    browser_iab_synthesize_scroll_gesture_script,
};
use super::super::store::{open_browser_tab_impl, refresh_browser_runtime_store};
use super::dom::{
    browser_iab_dom_box_model_result_from_payload,
    browser_iab_dom_content_quads_result_from_payload, browser_iab_dom_document_result,
    browser_iab_dom_frame_owner_result_from_payload,
    browser_iab_dom_node_for_location_result_from_payload,
    browser_iab_dom_node_result_from_payload, browser_iab_dom_query_selector_result_from_payload,
};
use super::eval::{
    browser_iab_eval_with_callback, browser_iab_expect_ok_payload,
    browser_iab_runtime_evaluate_app_result, browser_iab_runtime_evaluate_result,
};
use super::navigation::{
    browser_iab_default_layout_metrics_result, browser_iab_frame_tree_result,
    browser_iab_is_same_document_navigation, browser_iab_layout_metrics_result,
    browser_iab_navigation_events, browser_iab_same_document_navigation_events,
};
use super::screenshot::browser_iab_capture_screenshot_result;
use super::tabs::{
    browser_iab_close_tab, browser_iab_frame_id, browser_iab_runtime_tab_clone_for_id,
    browser_iab_runtime_tab_for_id, browser_iab_tab_id_from_target_id,
    browser_iab_targets_from_store,
};

pub(crate) fn browser_iab_execute_cdp(
    app: &AppHandle,
    params: &Value,
) -> Result<(Vec<Value>, Value), String> {
    let method = params
        .get("method")
        .and_then(Value::as_str)
        .ok_or_else(|| "executeCdp requires method.".to_string())?;
    let tab_id = browser_iab_cdp_tab_id(params)
        .ok_or_else(|| "executeCdp requires target.tabId.".to_string())?;
    let command_params = params
        .get("commandParams")
        .or_else(|| params.get("params"))
        .cloned()
        .unwrap_or_else(|| json!({}));
    match method {
        "Emulation.setFocusEmulationEnabled"
        | "Page.enable"
        | "Runtime.enable"
        | "Target.setAutoAttach" => Ok((Vec::new(), json!({}))),
        "Page.createIsolatedWorld" => Ok((
            Vec::new(),
            json!({
                "executionContextId": tab_id,
            }),
        )),
        "Page.getFrameTree" => {
            let state = app.state::<AppState>();
            refresh_browser_runtime_store(app, &state);
            let store = state
                .browser_runtime
                .lock()
                .expect("browser runtime mutex poisoned");
            let tab = browser_iab_runtime_tab_for_id(&store, tab_id)
                .ok_or_else(|| format!("Browser iab tab {tab_id} is not open."))?;
            Ok((Vec::new(), browser_iab_frame_tree_result(tab_id, tab)))
        }
        "Page.getLayoutMetrics" => {
            // Clone the tab (which releases the browser_runtime lock) before the
            // blocking eval. Holding the lock across browser_iab_eval_with_callback
            // can freeze the UI thread, which contends for the same lock inside the
            // webview event handlers. Mirrors DOM.* / Input.synthesizeScrollGesture.
            let tab = browser_iab_runtime_tab_clone_for_id(app, tab_id)?;
            Ok((
                Vec::new(),
                browser_iab_layout_metrics_result(app, &tab)
                    .unwrap_or_else(|_| browser_iab_default_layout_metrics_result()),
            ))
        }
        "Runtime.evaluate" => {
            let tab = browser_iab_runtime_tab_clone_for_id(app, tab_id)?;
            let expression = command_params
                .get("expression")
                .and_then(Value::as_str)
                .unwrap_or_default();
            let result = browser_iab_runtime_evaluate_app_result(app, &tab, expression)
                .unwrap_or_else(|error| {
                    browser_iab_runtime_evaluate_result(&tab, expression, Some(error))
                });
            Ok((Vec::new(), result))
        }
        "Page.navigate" => {
            let url = command_params
                .get("url")
                .and_then(Value::as_str)
                .ok_or_else(|| "Page.navigate requires url.".to_string())?;
            let state = app.state::<AppState>();
            let (internal_tab_id, current_url) = {
                let store = state
                    .browser_runtime
                    .lock()
                    .expect("browser runtime mutex poisoned");
                let tab = browser_iab_runtime_tab_for_id(&store, tab_id)
                    .map(|tab| tab.tab_id.clone())
                    .ok_or_else(|| format!("Browser iab tab {tab_id} is not open."))?;
                let current_url = browser_iab_runtime_tab_for_id(&store, tab_id)
                    .map(|tab| tab.url.clone())
                    .unwrap_or_default();
                (tab, current_url)
            };
            open_browser_tab_impl(app, &state, Some(url.to_string()), Some(internal_tab_id))?;
            let events = if browser_iab_is_same_document_navigation(&current_url, url) {
                browser_iab_same_document_navigation_events(tab_id, url)
            } else {
                browser_iab_navigation_events(tab_id, url)
            };
            Ok((events, json!({ "frameId": browser_iab_frame_id(tab_id) })))
        }
        "Page.reload" => {
            let state = app.state::<AppState>();
            let (internal_tab_id, url) = {
                let store = state
                    .browser_runtime
                    .lock()
                    .expect("browser runtime mutex poisoned");
                let tab = browser_iab_runtime_tab_for_id(&store, tab_id)
                    .ok_or_else(|| format!("Browser iab tab {tab_id} is not open."))?;
                (tab.tab_id.clone(), tab.url.clone())
            };
            open_browser_tab_impl(app, &state, Some(url.clone()), Some(internal_tab_id))?;
            Ok((browser_iab_navigation_events(tab_id, &url), json!({})))
        }
        "Page.navigateToHistoryEntry" => {
            let entry_id = command_params
                .get("entryId")
                .and_then(Value::as_u64)
                .unwrap_or(1);
            if entry_id == 1 {
                Ok((Vec::new(), json!({})))
            } else {
                Err(format!(
                    "Forge Browser iab probe only exposes the current navigation history entry; entry {entry_id} is not available."
                ))
            }
        }
        "Page.getNavigationHistory" => {
            let state = app.state::<AppState>();
            refresh_browser_runtime_store(app, &state);
            let store = state
                .browser_runtime
                .lock()
                .expect("browser runtime mutex poisoned");
            let tab = browser_iab_runtime_tab_for_id(&store, tab_id)
                .ok_or_else(|| format!("Browser iab tab {tab_id} is not open."))?;
            Ok((
                Vec::new(),
                json!({
                    "currentIndex": 0,
                    "entries": [{
                        "id": 1,
                        "url": tab.url,
                        "title": tab.title,
                    }],
                }),
            ))
        }
        "DOM.getDocument" => {
            let state = app.state::<AppState>();
            refresh_browser_runtime_store(app, &state);
            let store = state
                .browser_runtime
                .lock()
                .expect("browser runtime mutex poisoned");
            let tab = browser_iab_runtime_tab_for_id(&store, tab_id)
                .ok_or_else(|| format!("Browser iab tab {tab_id} is not open."))?;
            Ok((Vec::new(), browser_iab_dom_document_result(tab_id, tab)))
        }
        "DOM.querySelector" => {
            let tab = browser_iab_runtime_tab_clone_for_id(app, tab_id)?;
            let payload = browser_iab_eval_with_callback(
                app,
                &tab,
                browser_iab_dom_query_selector_script(&command_params),
            )?;
            Ok((
                Vec::new(),
                browser_iab_dom_query_selector_result_from_payload(payload)?,
            ))
        }
        "DOM.describeNode" => {
            let tab = browser_iab_runtime_tab_clone_for_id(app, tab_id)?;
            let payload = browser_iab_eval_with_callback(
                app,
                &tab,
                browser_iab_dom_describe_node_script(tab_id, &command_params),
            )?;
            Ok((
                Vec::new(),
                browser_iab_dom_node_result_from_payload(payload)?,
            ))
        }
        "DOM.getNodeForLocation" => {
            let tab = browser_iab_runtime_tab_clone_for_id(app, tab_id)?;
            let payload = browser_iab_eval_with_callback(
                app,
                &tab,
                browser_iab_dom_node_for_location_script(tab_id, &command_params),
            )?;
            Ok((
                Vec::new(),
                browser_iab_dom_node_for_location_result_from_payload(payload)?,
            ))
        }
        "DOM.getFrameOwner" => {
            let tab = browser_iab_runtime_tab_clone_for_id(app, tab_id)?;
            let payload = browser_iab_eval_with_callback(
                app,
                &tab,
                browser_iab_dom_frame_owner_script(tab_id, &command_params),
            )?;
            Ok((
                Vec::new(),
                browser_iab_dom_frame_owner_result_from_payload(payload)?,
            ))
        }
        "DOM.getContentQuads" => {
            let tab = browser_iab_runtime_tab_clone_for_id(app, tab_id)?;
            let payload = browser_iab_eval_with_callback(
                app,
                &tab,
                browser_iab_dom_geometry_script(&command_params, "quads"),
            )?;
            Ok((
                Vec::new(),
                browser_iab_dom_content_quads_result_from_payload(payload)?,
            ))
        }
        "DOM.getBoxModel" => {
            let tab = browser_iab_runtime_tab_clone_for_id(app, tab_id)?;
            let payload = browser_iab_eval_with_callback(
                app,
                &tab,
                browser_iab_dom_geometry_script(&command_params, "boxModel"),
            )?;
            Ok((
                Vec::new(),
                browser_iab_dom_box_model_result_from_payload(payload)?,
            ))
        }
        "DOM.scrollIntoViewIfNeeded" => {
            let tab = browser_iab_runtime_tab_clone_for_id(app, tab_id)?;
            let payload = browser_iab_eval_with_callback(
                app,
                &tab,
                browser_iab_dom_scroll_into_view_script(&command_params),
            )?;
            browser_iab_expect_ok_payload(payload, "DOM.scrollIntoViewIfNeeded failed.")?;
            Ok((Vec::new(), json!({})))
        }
        "Target.getTargets" => {
            let state = app.state::<AppState>();
            refresh_browser_runtime_store(app, &state);
            let store = state
                .browser_runtime
                .lock()
                .expect("browser runtime mutex poisoned");
            Ok((
                Vec::new(),
                json!({
                    "targetInfos": browser_iab_targets_from_store(&store),
                }),
            ))
        }
        "Input.dispatchMouseEvent" => {
            let tab = browser_iab_runtime_tab_clone_for_id(app, tab_id)?;
            browser_iab_eval_with_callback(
                app,
                &tab,
                browser_iab_mouse_event_script(&command_params),
            )?;
            Ok((Vec::new(), json!({})))
        }
        "Input.synthesizeScrollGesture" => {
            let tab = browser_iab_runtime_tab_clone_for_id(app, tab_id)?;
            let payload = browser_iab_eval_with_callback(
                app,
                &tab,
                browser_iab_synthesize_scroll_gesture_script(&command_params),
            )?;
            browser_iab_expect_ok_payload(payload, "Input.synthesizeScrollGesture failed.")?;
            Ok((Vec::new(), json!({})))
        }
        "Input.dispatchKeyEvent" | "Input.insertText" => {
            let tab = browser_iab_runtime_tab_clone_for_id(app, tab_id)?;
            let script = if method == "Input.insertText" {
                let text = command_params
                    .get("text")
                    .and_then(Value::as_str)
                    .unwrap_or_default();
                browser_iab_insert_text_script(text)
            } else {
                browser_iab_key_event_script(&command_params)
            };
            browser_iab_eval_with_callback(app, &tab, script)?;
            Ok((Vec::new(), json!({})))
        }
        "Page.handleJavaScriptDialog" => Ok((Vec::new(), json!({}))),
        "Runtime.releaseObject"
        | "Page.addScriptToEvaluateOnNewDocument"
        | "Page.removeScriptToEvaluateOnNewDocument" => Ok((
            Vec::new(),
            // Wire-visible stub identifier echoed to the codex browser host;
            // the legacy "hicodex" spelling is deliberate (protocol surface).
            json!({
                "identifier": "hicodex-probe-script"
            }),
        )),
        "Page.close" => {
            browser_iab_close_tab(app, tab_id)?;
            Ok((Vec::new(), json!({})))
        }
        "Target.closeTarget" => {
            let close_tab_id = command_params
                .get("targetId")
                .and_then(Value::as_str)
                .and_then(browser_iab_tab_id_from_target_id)
                .unwrap_or(tab_id);
            browser_iab_close_tab(app, close_tab_id)?;
            Ok((Vec::new(), json!({ "success": true })))
        }
        "Page.captureScreenshot" => {
            // Screenshot capture sleeps, spawns `screencapture`, and reads a file
            // (screenshot.rs) — all blocking. Clone the tab to release the
            // browser_runtime lock first so the UI thread can't deadlock on it.
            let tab = browser_iab_runtime_tab_clone_for_id(app, tab_id)?;
            Ok((
                Vec::new(),
                browser_iab_capture_screenshot_result(app, &tab, &command_params)?,
            ))
        }
        other => Err(format!(
            "Forge Browser iab probe does not support CDP method {other} yet."
        )),
    }
}

pub(crate) fn browser_iab_execute_unhandled_command(
    app: &AppHandle,
    params: &Value,
) -> Result<Value, String> {
    let command_type = params
        .get("type")
        .and_then(Value::as_str)
        .unwrap_or_default();
    match command_type {
        "playwright_evaluate" => {
            let tab_id = params
                .get("tab_id")
                .and_then(Value::as_str)
                .and_then(|value| value.parse::<usize>().ok())
                .ok_or_else(|| "playwright_evaluate requires numeric tab_id.".to_string())?;
            let script = params
                .get("script")
                .and_then(Value::as_str)
                .ok_or_else(|| "playwright_evaluate requires script.".to_string())?;
            let tab = browser_iab_runtime_tab_clone_for_id(app, tab_id)?;
            let cdp_result = browser_iab_runtime_evaluate_app_result(app, &tab, script)
                .unwrap_or_else(|error| {
                    browser_iab_runtime_evaluate_result(&tab, script, Some(error))
                });
            browser_iab_playwright_evaluate_command_result(cdp_result)
        }
        "playwright_wait_for_load_state" => Ok(json!({})),
        other => Err(format!(
            "Forge Browser iab probe does not support Browser command {other} yet."
        )),
    }
}

pub(crate) fn browser_iab_playwright_evaluate_command_result(
    cdp_result: Value,
) -> Result<Value, String> {
    if let Some(exception) = cdp_result.get("exceptionDetails") {
        let text = exception
            .get("text")
            .and_then(Value::as_str)
            .unwrap_or("playwright_evaluate failed.");
        return Err(text.to_string());
    }
    let remote_object = cdp_result
        .get("result")
        .ok_or_else(|| "playwright_evaluate returned no result.".to_string())?;
    let value = if remote_object.get("type").and_then(Value::as_str) == Some("undefined") {
        Value::Null
    } else {
        remote_object.get("value").cloned().unwrap_or(Value::Null)
    };
    Ok(json!({ "value": value }))
}

fn browser_iab_cdp_tab_id(params: &Value) -> Option<usize> {
    params
        .get("target")
        .and_then(|target| target.get("tabId"))
        .and_then(Value::as_u64)
        .and_then(|value| usize::try_from(value).ok())
        .filter(|value| *value > 0)
}
