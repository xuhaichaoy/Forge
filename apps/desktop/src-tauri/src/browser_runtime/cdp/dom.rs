use serde_json::{json, Value};

use super::super::store::BrowserRuntimeTab;
use super::eval::browser_iab_expect_ok_payload;
use super::tabs::browser_iab_frame_id;

pub(crate) fn browser_iab_dom_document_result(tab_id: usize, tab: &BrowserRuntimeTab) -> Value {
    json!({
        "root": {
            "nodeId": 1,
            "backendNodeId": 1,
            "nodeType": 9,
            "nodeName": "#document",
            "localName": "",
            "nodeValue": "",
            "documentURL": tab.url,
            "baseURL": tab.url,
            "frameId": browser_iab_frame_id(tab_id),
            "childNodeCount": 1,
        }
    })
}

pub(crate) fn browser_iab_dom_query_selector_result_from_payload(
    payload: Value,
) -> Result<Value, String> {
    browser_iab_expect_ok_payload(payload, "DOM.querySelector failed.").map(|payload| {
        json!({
            "nodeId": payload.get("nodeId").and_then(Value::as_u64).unwrap_or(0),
        })
    })
}

pub(crate) fn browser_iab_dom_node_result_from_payload(payload: Value) -> Result<Value, String> {
    browser_iab_expect_ok_payload(payload, "DOM.describeNode failed.").and_then(|payload| {
        let node = payload
            .get("node")
            .cloned()
            .ok_or_else(|| "DOM.describeNode returned no node.".to_string())?;
        Ok(json!({ "node": node }))
    })
}

pub(crate) fn browser_iab_dom_node_for_location_result_from_payload(
    payload: Value,
) -> Result<Value, String> {
    browser_iab_expect_ok_payload(payload, "DOM.getNodeForLocation failed.").map(|payload| {
        let backend_node_id = payload
            .get("backendNodeId")
            .and_then(Value::as_u64)
            .unwrap_or(0);
        let node_id = payload
            .get("nodeId")
            .and_then(Value::as_u64)
            .unwrap_or(backend_node_id);
        let frame_id = payload
            .get("frameId")
            .and_then(Value::as_str)
            .unwrap_or_default();
        json!({
            "backendNodeId": backend_node_id,
            "nodeId": node_id,
            "frameId": frame_id,
        })
    })
}

pub(crate) fn browser_iab_dom_frame_owner_result_from_payload(
    payload: Value,
) -> Result<Value, String> {
    browser_iab_expect_ok_payload(payload, "DOM.getFrameOwner failed.").map(|payload| {
        let backend_node_id = payload
            .get("backendNodeId")
            .and_then(Value::as_u64)
            .unwrap_or(0);
        let node_id = payload
            .get("nodeId")
            .and_then(Value::as_u64)
            .unwrap_or(backend_node_id);
        json!({
            "backendNodeId": backend_node_id,
            "nodeId": node_id,
        })
    })
}

pub(crate) fn browser_iab_dom_content_quads_result_from_payload(
    payload: Value,
) -> Result<Value, String> {
    browser_iab_expect_ok_payload(payload, "DOM.getContentQuads failed.").and_then(|payload| {
        let quads = payload
            .get("quads")
            .cloned()
            .ok_or_else(|| "DOM.getContentQuads returned no quads.".to_string())?;
        Ok(json!({ "quads": quads }))
    })
}

pub(crate) fn browser_iab_dom_box_model_result_from_payload(
    payload: Value,
) -> Result<Value, String> {
    browser_iab_expect_ok_payload(payload, "DOM.getBoxModel failed.").and_then(|payload| {
        let model = payload
            .get("model")
            .cloned()
            .ok_or_else(|| "DOM.getBoxModel returned no model.".to_string())?;
        Ok(json!({ "model": model }))
    })
}

#[cfg(test)]
mod tests {
    use super::super::super::store::BrowserRuntimeTab;
    use super::{
        browser_iab_dom_box_model_result_from_payload,
        browser_iab_dom_content_quads_result_from_payload, browser_iab_dom_document_result,
        browser_iab_dom_frame_owner_result_from_payload,
        browser_iab_dom_node_for_location_result_from_payload,
        browser_iab_dom_node_result_from_payload,
        browser_iab_dom_query_selector_result_from_payload,
    };
    use serde_json::json;

    #[test]
    fn browser_iab_dom_helpers_project_minimal_nodes_and_geometry() {
        let tab = BrowserRuntimeTab {
            tab_id: "active-9".to_string(),
            title: "Docs".to_string(),
            url: "https://platform.openai.com/docs".to_string(),
            display_url: "platform.openai.com/docs".to_string(),
            open: true,
            is_agent_working: false,
        };

        let document = browser_iab_dom_document_result(9, &tab);
        assert_eq!(document["root"]["nodeId"], 1);
        assert_eq!(document["root"]["backendNodeId"], 1);
        assert_eq!(document["root"]["frameId"], "hicodex-frame-9");

        let query = browser_iab_dom_query_selector_result_from_payload(json!({
            "ok": true,
            "nodeId": 7,
        }))
        .unwrap();
        assert_eq!(query["nodeId"], 7);

        let node = browser_iab_dom_node_result_from_payload(json!({
            "ok": true,
            "node": {
                "nodeId": 7,
                "backendNodeId": 7,
                "nodeType": 1,
                "nodeName": "BUTTON",
                "attributes": ["id", "save"],
            },
        }))
        .unwrap();
        assert_eq!(node["node"]["backendNodeId"], 7);
        assert_eq!(node["node"]["attributes"][1], "save");

        let node_for_location = browser_iab_dom_node_for_location_result_from_payload(json!({
            "ok": true,
            "nodeId": 8,
            "backendNodeId": 8,
            "frameId": "hicodex-frame-9",
        }))
        .unwrap();
        assert_eq!(node_for_location["backendNodeId"], 8);
        assert_eq!(node_for_location["frameId"], "hicodex-frame-9");

        let frame_owner = browser_iab_dom_frame_owner_result_from_payload(json!({
            "ok": true,
            "nodeId": 11,
            "backendNodeId": 11,
        }))
        .unwrap();
        assert_eq!(frame_owner["backendNodeId"], 11);

        let quads = browser_iab_dom_content_quads_result_from_payload(json!({
            "ok": true,
            "quads": [[10, 20, 110, 20, 110, 70, 10, 70]],
        }))
        .unwrap();
        assert_eq!(quads["quads"][0][4], 110);

        let box_model = browser_iab_dom_box_model_result_from_payload(json!({
            "ok": true,
            "model": {
                "border": [10, 20, 110, 20, 110, 70, 10, 70],
                "width": 100,
                "height": 50,
            },
        }))
        .unwrap();
        assert_eq!(box_model["model"]["width"], 100);

        assert!(browser_iab_dom_query_selector_result_from_payload(json!({
            "ok": false,
            "text": "bad selector",
        }))
        .is_err());
    }
}
