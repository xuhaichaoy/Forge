use serde_json::{json, Value};
use tauri::AppHandle;

use super::super::scripts::browser_iab_layout_metrics_script;
use super::super::store::BrowserRuntimeTab;
use super::eval::browser_iab_eval_with_callback;
use super::tabs::{browser_iab_frame_id, browser_iab_loader_id};

pub(crate) fn browser_iab_frame_tree_result(tab_id: usize, tab: &BrowserRuntimeTab) -> Value {
    json!({
        "frameTree": {
            "frame": {
                "id": browser_iab_frame_id(tab_id),
                "loaderId": browser_iab_loader_id(tab_id),
                "url": tab.url,
                "securityOrigin": browser_iab_security_origin(&tab.url),
                "mimeType": "text/html",
            }
        }
    })
}

fn browser_iab_security_origin(url: &str) -> String {
    url.parse::<tauri::Url>()
        .ok()
        .and_then(|parsed| {
            let host = parsed.host_str()?;
            Some(format!("{}://{}", parsed.scheme(), host))
        })
        .unwrap_or_default()
}

pub(crate) fn browser_iab_layout_metrics_result(
    app: &AppHandle,
    tab: &BrowserRuntimeTab,
) -> Result<Value, String> {
    let payload = browser_iab_eval_with_callback(app, tab, browser_iab_layout_metrics_script())?;
    if payload.get("ok").and_then(Value::as_bool) == Some(true) {
        if let Some(value) = payload.get("value") {
            return Ok(browser_iab_layout_metrics_from_value(value));
        }
    }
    Err(payload
        .get("text")
        .and_then(Value::as_str)
        .unwrap_or("Page.getLayoutMetrics evaluation failed.")
        .to_string())
}

pub(crate) fn browser_iab_layout_metrics_from_value(value: &Value) -> Value {
    let page_x = value.get("pageX").and_then(Value::as_f64).unwrap_or(0.0);
    let page_y = value.get("pageY").and_then(Value::as_f64).unwrap_or(0.0);
    let client_width = value
        .get("clientWidth")
        .and_then(Value::as_f64)
        .filter(|value| *value > 0.0)
        .unwrap_or(1280.0);
    let client_height = value
        .get("clientHeight")
        .and_then(Value::as_f64)
        .filter(|value| *value > 0.0)
        .unwrap_or(720.0);
    let content_width = value
        .get("contentWidth")
        .and_then(Value::as_f64)
        .filter(|value| *value > 0.0)
        .unwrap_or(client_width);
    let content_height = value
        .get("contentHeight")
        .and_then(Value::as_f64)
        .filter(|value| *value > 0.0)
        .unwrap_or(client_height);
    let scale = value.get("scale").and_then(Value::as_f64).unwrap_or(1.0);
    json!({
        "layoutViewport": {
            "pageX": page_x,
            "pageY": page_y,
            "clientWidth": client_width,
            "clientHeight": client_height,
        },
        "visualViewport": {
            "pageX": page_x,
            "pageY": page_y,
            "clientWidth": client_width,
            "clientHeight": client_height,
            "scale": scale,
        },
        "contentSize": {
            "x": 0,
            "y": 0,
            "width": content_width,
            "height": content_height,
        },
        "cssLayoutViewport": {
            "pageX": page_x,
            "pageY": page_y,
            "clientWidth": client_width,
            "clientHeight": client_height,
        },
        "cssVisualViewport": {
            "pageX": page_x,
            "pageY": page_y,
            "clientWidth": client_width,
            "clientHeight": client_height,
            "scale": scale,
        },
        "cssContentSize": {
            "x": 0,
            "y": 0,
            "width": content_width,
            "height": content_height,
        },
    })
}

pub(crate) fn browser_iab_default_layout_metrics_result() -> Value {
    browser_iab_layout_metrics_from_value(&json!({
        "pageX": 0,
        "pageY": 0,
        "clientWidth": 1280,
        "clientHeight": 720,
        "contentWidth": 1280,
        "contentHeight": 720,
        "scale": 1,
    }))
}

pub(crate) fn browser_iab_navigation_events(tab_id: usize, url: &str) -> Vec<Value> {
    vec![
        browser_iab_cdp_event(
            tab_id,
            "Page.frameStartedLoading",
            json!({ "frameId": browser_iab_frame_id(tab_id) }),
        ),
        browser_iab_cdp_event(
            tab_id,
            "Page.frameNavigated",
            json!({
                "frame": {
                    "id": browser_iab_frame_id(tab_id),
                    "loaderId": browser_iab_loader_id(tab_id),
                    "url": url,
                    "securityOrigin": browser_iab_security_origin(url),
                    "mimeType": "text/html",
                }
            }),
        ),
        browser_iab_cdp_event(
            tab_id,
            "Page.domContentEventFired",
            json!({ "timestamp": 0 }),
        ),
        browser_iab_cdp_event(tab_id, "Page.loadEventFired", json!({ "timestamp": 0 })),
    ]
}

pub(crate) fn browser_iab_same_document_navigation_events(tab_id: usize, url: &str) -> Vec<Value> {
    vec![browser_iab_cdp_event(
        tab_id,
        "Page.navigatedWithinDocument",
        json!({
            "frameId": browser_iab_frame_id(tab_id),
            "url": url,
            "navigationType": "fragment",
        }),
    )]
}

pub(crate) fn browser_iab_is_same_document_navigation(current_url: &str, next_url: &str) -> bool {
    if current_url == next_url {
        return false;
    }
    let current_base = current_url.split('#').next().unwrap_or(current_url);
    let next_base = next_url.split('#').next().unwrap_or(next_url);
    !current_base.is_empty() && current_base == next_base
}

fn browser_iab_cdp_event(tab_id: usize, method: &str, params: Value) -> Value {
    json!({
        "jsonrpc": "2.0",
        "method": "onCDPEvent",
        "params": {
            "source": {
                "tabId": tab_id,
            },
            "method": method,
            "params": params,
        },
    })
}

#[cfg(test)]
mod tests {
    use super::super::super::store::BrowserRuntimeTab;
    use super::super::eval::browser_iab_runtime_evaluate_result;
    use super::super::tabs::browser_iab_tab_id_from_target_id;
    use super::{
        browser_iab_frame_tree_result, browser_iab_is_same_document_navigation,
        browser_iab_navigation_events, browser_iab_same_document_navigation_events,
    };

    #[test]
    fn browser_iab_cdp_helpers_project_basic_navigation_state() {
        let tab = BrowserRuntimeTab {
            tab_id: "active-9".to_string(),
            title: "Docs".to_string(),
            url: "https://platform.openai.com/docs".to_string(),
            display_url: "platform.openai.com/docs".to_string(),
            open: true,
            is_agent_working: false,
        };

        let frame_tree = browser_iab_frame_tree_result(2, &tab);
        assert_eq!(frame_tree["frameTree"]["frame"]["id"], "hicodex-frame-2");
        assert_eq!(frame_tree["frameTree"]["frame"]["url"], tab.url);

        let document_state = browser_iab_runtime_evaluate_result(
            &tab,
            "({ href: window.location.href, readyState: document.readyState })",
            None,
        );
        assert_eq!(document_state["result"]["value"]["href"], tab.url);
        assert_eq!(document_state["result"]["value"]["readyState"], "complete");

        let events = browser_iab_navigation_events(2, &tab.url);
        assert_eq!(events.len(), 4);
        assert_eq!(events[0]["method"], "onCDPEvent");
        assert_eq!(events[0]["params"]["method"], "Page.frameStartedLoading");
        assert_eq!(events[3]["params"]["method"], "Page.loadEventFired");
        assert!(browser_iab_is_same_document_navigation(
            "https://platform.openai.com/docs#old",
            "https://platform.openai.com/docs#new",
        ));
        assert!(!browser_iab_is_same_document_navigation(&tab.url, &tab.url));
        let same_document_events =
            browser_iab_same_document_navigation_events(2, "https://platform.openai.com/docs#new");
        assert_eq!(same_document_events.len(), 1);
        assert_eq!(
            same_document_events[0]["params"]["method"],
            "Page.navigatedWithinDocument"
        );
        assert_eq!(
            browser_iab_tab_id_from_target_id("hicodex-target-2"),
            Some(2)
        );
    }
}
