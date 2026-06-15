use serde_json::{json, Value};
use std::sync::mpsc;
use std::time::Duration;
use tauri::{AppHandle, Manager};

use super::super::scripts::{
    browser_iab_accessibility_snapshot_script, browser_iab_eval_callback_script,
    browser_iab_minimal_playwright_injection_script, browser_iab_runtime_evaluate_script,
};
use super::super::store::{browser_window_label, BrowserRuntimeTab};

const BROWSER_IAB_EVAL_TIMEOUT: Duration = Duration::from_secs(8);

pub(crate) fn browser_iab_runtime_evaluate_app_result(
    app: &AppHandle,
    tab: &BrowserRuntimeTab,
    expression: &str,
) -> Result<Value, String> {
    if browser_iab_is_playwright_injection_check_expression(expression) {
        return Ok(json!({
            "result": {
                "type": "boolean",
                "value": true,
            },
        }));
    }
    if browser_iab_is_playwright_injection_install_expression(expression) {
        let payload = browser_iab_eval_with_callback(
            app,
            tab,
            browser_iab_minimal_playwright_injection_script(),
        );
        return Ok(match payload {
            Ok(payload) => browser_iab_runtime_evaluate_result_from_payload(payload),
            Err(_) => json!({
                "result": {
                    "type": "undefined",
                },
            }),
        });
    }
    let rewritten_expression = browser_iab_rewrite_playwright_async_wrapper(expression);
    let expression = rewritten_expression.as_deref().unwrap_or(expression);
    let is_aria_snapshot = browser_iab_is_playwright_aria_snapshot_expression(expression);
    let script = if is_aria_snapshot {
        browser_iab_accessibility_snapshot_script()
    } else {
        browser_iab_runtime_evaluate_script(expression)
    };
    let payload = match browser_iab_eval_with_callback(app, tab, script) {
        Ok(payload) => payload,
        Err(_) if is_aria_snapshot => {
            return Ok(json!({
                "result": {
                    "type": "string",
                    "value": "",
                },
            }));
        }
        Err(error) => return Err(error),
    };
    Ok(browser_iab_runtime_evaluate_result_from_payload(payload))
}

fn browser_iab_is_playwright_aria_snapshot_expression(expression: &str) -> bool {
    expression.contains("ariaSnapshot")
}

fn browser_iab_is_playwright_injection_check_expression(expression: &str) -> bool {
    expression.contains("!!window.__codexPlaywrightInjected")
}

fn browser_iab_is_playwright_injection_install_expression(expression: &str) -> bool {
    expression.contains("__codexPlaywrightInjected")
        && (expression.contains("var PlaywrightInjected")
            || expression.contains("new PlaywrightInjected")
            || expression.contains("InjectedScript(window"))
}

fn browser_iab_rewrite_playwright_async_wrapper(expression: &str) -> Option<String> {
    let trimmed = expression.trim_start();
    if trimmed.starts_with("(async () =>") && expression.contains("return await ") {
        return Some(expression.replacen("(async () =>", "(() =>", 1).replacen(
            "return await ",
            "return ",
            1,
        ));
    }
    if expression.contains("const runUserScript = async () => {")
        && expression.contains("return await (async function () {")
        && expression.contains("return runUserScript().then(serializeResult);")
    {
        return Some(
            expression
                .replace(
                    "const runUserScript = async () => {",
                    "const runUserScript = () => {",
                )
                .replace("return await (async function () {", "return (function () {")
                .replace(
                    "return await __playwrightEvaluate(arg);",
                    "return __playwrightEvaluate(arg);",
                )
                .replace(
                    "return runUserScript().then(serializeResult);",
                    "return serializeResult(runUserScript());",
                ),
        );
    }
    if expression.contains("const __playwrightEvaluate =")
        && expression.contains("return await __playwrightEvaluate(arg);")
    {
        let rewritten = expression.replace(
            "return await __playwrightEvaluate(arg);",
            "return __playwrightEvaluate(arg);",
        );
        return Some(format!("(() => {{\n{rewritten}\n}})()"));
    }
    None
}

pub(crate) fn browser_iab_runtime_evaluate_result(
    tab: &BrowserRuntimeTab,
    expression: &str,
    fallback_error: Option<String>,
) -> Value {
    if expression.contains("window.location.href") && expression.contains("document.readyState") {
        return json!({
            "result": {
                "type": "object",
                "value": {
                    "href": tab.url,
                    "readyState": "complete",
                }
            }
        });
    }
    if expression.contains("window.devicePixelRatio") {
        return json!({
            "result": {
                "type": "number",
                "value": 1,
            }
        });
    }
    if expression.contains("document.title") {
        return json!({
            "result": {
                "type": "string",
                "value": tab.title,
            }
        });
    }
    let text = fallback_error.unwrap_or_else(|| {
        "Forge Browser iab probe supports only basic read-only Runtime.evaluate calls.".to_string()
    });
    json!({
        "exceptionDetails": {
            "text": text,
        }
    })
}

fn browser_iab_runtime_evaluate_result_from_payload(payload: Value) -> Value {
    if payload.get("ok").and_then(Value::as_bool) == Some(true) {
        if let Some(remote_object) = payload.get("remoteObject") {
            return json!({
                "result": remote_object,
            });
        }
        return json!({
            "result": browser_iab_remote_object_from_value(payload.get("value").unwrap_or(&Value::Null)),
        });
    }
    if payload.get("ok").and_then(Value::as_bool) == Some(false) {
        let text = payload
            .get("text")
            .and_then(Value::as_str)
            .unwrap_or("Runtime.evaluate failed.");
        let description = payload
            .get("description")
            .and_then(Value::as_str)
            .unwrap_or(text);
        return json!({
            "exceptionDetails": {
                "text": text,
                "exception": {
                    "type": "object",
                    "description": description,
                },
            },
        });
    }
    json!({
        "result": browser_iab_remote_object_from_value(&payload),
    })
}

fn browser_iab_remote_object_from_value(value: &Value) -> Value {
    match value {
        Value::Null => json!({
            "type": "object",
            "subtype": "null",
            "value": Value::Null,
        }),
        Value::Bool(value) => json!({
            "type": "boolean",
            "value": value,
        }),
        Value::Number(value) => json!({
            "type": "number",
            "value": value,
        }),
        Value::String(value) => json!({
            "type": "string",
            "value": value,
        }),
        Value::Array(_) => json!({
            "type": "object",
            "subtype": "array",
            "value": value,
        }),
        Value::Object(_) => json!({
            "type": "object",
            "value": value,
        }),
    }
}

pub(crate) fn browser_iab_eval_with_callback(
    app: &AppHandle,
    tab: &BrowserRuntimeTab,
    script: String,
) -> Result<Value, String> {
    let label = browser_window_label(&tab.tab_id);
    let window = app
        .get_webview_window(&label)
        .ok_or_else(|| format!("Browser iab tab {} has no live webview window.", tab.tab_id))?;
    let (tx, rx) = mpsc::channel();
    let callback_script = browser_iab_eval_callback_script(&script);
    window
        .eval_with_callback(callback_script, move |result| {
            let _ = tx.send(result);
        })
        .map_err(|error| format!("failed to evaluate Browser iab JavaScript: {error}"))?;
    let raw = rx
        .recv_timeout(BROWSER_IAB_EVAL_TIMEOUT)
        .map_err(|_| "timed out waiting for Browser iab JavaScript evaluation.".to_string())?;
    browser_iab_parse_eval_callback_result(&raw).map_err(|error| {
        format!("failed to parse Browser iab JavaScript evaluation result {raw:?}: {error}")
    })
}

fn browser_iab_parse_eval_callback_result(raw: &str) -> Result<Value, serde_json::Error> {
    if raw.trim().is_empty() {
        return Ok(Value::Null);
    }
    let parsed = serde_json::from_str::<Value>(raw)?;
    if let Some(nested) = parsed
        .as_str()
        .map(str::trim)
        .filter(|value| !value.is_empty())
    {
        if let Ok(value) = serde_json::from_str::<Value>(nested) {
            return Ok(value);
        }
    }
    Ok(parsed)
}

pub(crate) fn browser_iab_expect_ok_payload(
    payload: Value,
    fallback: &str,
) -> Result<Value, String> {
    if payload.get("ok").and_then(Value::as_bool) == Some(true) {
        return Ok(payload);
    }
    Err(payload
        .get("text")
        .and_then(Value::as_str)
        .unwrap_or(fallback)
        .to_string())
}

#[cfg(test)]
mod tests {
    use super::super::super::scripts::{
        browser_iab_accessibility_snapshot_script, browser_iab_eval_callback_script,
        browser_iab_minimal_playwright_injection_script, browser_iab_runtime_evaluate_script,
    };
    use super::super::execute::browser_iab_playwright_evaluate_command_result;
    use super::super::navigation::browser_iab_layout_metrics_from_value;
    use super::{
        browser_iab_is_playwright_aria_snapshot_expression,
        browser_iab_is_playwright_injection_check_expression,
        browser_iab_is_playwright_injection_install_expression,
        browser_iab_parse_eval_callback_result, browser_iab_remote_object_from_value,
        browser_iab_rewrite_playwright_async_wrapper,
        browser_iab_runtime_evaluate_result_from_payload,
    };
    use serde_json::{json, Value};

    #[test]
    fn browser_iab_cdp_helpers_project_eval_and_layout_values() {
        let eval_success = browser_iab_runtime_evaluate_result_from_payload(json!({
            "ok": true,
            "remoteObject": {
                "type": "object",
                "value": {
                    "title": "Docs",
                },
            },
        }));
        assert_eq!(eval_success["result"]["value"]["title"], "Docs");
        assert_eq!(
            browser_iab_playwright_evaluate_command_result(eval_success)
                .unwrap()
                .get("value")
                .and_then(|value| value.get("title"))
                .and_then(Value::as_str),
            Some("Docs")
        );

        let eval_failure = browser_iab_runtime_evaluate_result_from_payload(json!({
            "ok": false,
            "text": "boom",
            "description": "stack",
        }));
        assert_eq!(eval_failure["exceptionDetails"]["text"], "boom");
        assert!(browser_iab_playwright_evaluate_command_result(eval_failure).is_err());

        assert_eq!(
            browser_iab_remote_object_from_value(&json!(["a"]))["subtype"],
            "array"
        );
        let eval_script = browser_iab_runtime_evaluate_script("Promise.resolve(1)");
        assert!(!eval_script.contains("(async ()"));
        assert!(eval_script.contains("cannot await Promise"));
        assert!(browser_iab_runtime_evaluate_script(
            "const arg = undefined;\nconst __playwrightEvaluate = (() => document.title);\nreturn await __playwrightEvaluate(arg);",
        )
        .contains("new Function"));
        let readonly_wrapper = r#"(() => {
  const runUserScript = async () => {
    return await (async function () {
      "use strict";
      const arg = undefined;
      const __playwrightEvaluate = (() => window.location.href);
      return await __playwrightEvaluate(arg);
      return window.location.href;
    }).call(windowObject);
  };

  return runUserScript().then(serializeResult);
})()"#;
        let rewritten_readonly_wrapper =
            browser_iab_rewrite_playwright_async_wrapper(readonly_wrapper)
                .expect("readonly evaluate wrapper should be rewritten");
        assert!(rewritten_readonly_wrapper.contains("const runUserScript = () => {"));
        assert!(rewritten_readonly_wrapper.contains("return (function () {"));
        assert!(rewritten_readonly_wrapper.contains("return __playwrightEvaluate(arg);"));
        assert!(rewritten_readonly_wrapper.contains("return serializeResult(runUserScript());"));
        assert!(!rewritten_readonly_wrapper.contains("runUserScript().then"));
        assert!(
            browser_iab_eval_callback_script("(() => ({ ok: true }))()").contains("JSON.stringify")
        );
        assert_eq!(
            browser_iab_parse_eval_callback_result("").unwrap(),
            serde_json::Value::Null
        );
        assert_eq!(
            browser_iab_parse_eval_callback_result(r#""{\"ok\":true,\"value\":7}""#).unwrap()
                ["value"],
            7
        );
        assert!(browser_iab_is_playwright_aria_snapshot_expression(
            "window.__codexPlaywrightInjected.ariaSnapshot(document.body, { mode: 'ai' })"
        ));
        assert!(!browser_iab_is_playwright_aria_snapshot_expression(
            "document.title"
        ));
        assert!(browser_iab_is_playwright_injection_check_expression(
            "!!window.__codexPlaywrightInjected"
        ));
        assert!(browser_iab_is_playwright_injection_install_expression(
            "window.__codexPlaywrightInjected = new PlaywrightInjected.InjectedScript(window, {})"
        ));
        let rewritten = browser_iab_rewrite_playwright_async_wrapper(
            "(async () => { const injected = window.__codexPlaywrightInjected; return await ((i) => document.title)(injected, null); })()",
        )
        .unwrap();
        assert!(rewritten.starts_with("(() =>"));
        assert!(rewritten.contains("return ((i) => document.title)"));
        let evaluate_wrapper = browser_iab_rewrite_playwright_async_wrapper(
            "(async () => { const arg = undefined;\nconst __playwrightEvaluate = (() => window.location.href);\nreturn await __playwrightEvaluate(arg); })()",
        )
        .unwrap();
        assert!(evaluate_wrapper.starts_with("(() =>"));
        assert!(evaluate_wrapper.contains("return __playwrightEvaluate(arg);"));
        let raw_evaluate = browser_iab_rewrite_playwright_async_wrapper(
            "const arg = undefined;\nconst __playwrightEvaluate = (() => document.title);\nreturn await __playwrightEvaluate(arg);",
        )
        .unwrap();
        assert!(raw_evaluate.starts_with("(() =>"));
        assert!(raw_evaluate.contains("return __playwrightEvaluate(arg);"));
        let snapshot_script = browser_iab_accessibility_snapshot_script();
        assert!(snapshot_script.contains("aria-label"));
        assert!(snapshot_script.contains("remoteObject"));
        assert!(browser_iab_minimal_playwright_injection_script().contains("ariaSnapshot"));

        let metrics = browser_iab_layout_metrics_from_value(&json!({
            "pageX": 3,
            "pageY": 5,
            "clientWidth": 800,
            "clientHeight": 600,
            "contentWidth": 1200,
            "contentHeight": 1600,
            "scale": 2,
        }));
        assert_eq!(
            metrics["cssVisualViewport"]["clientWidth"].as_f64(),
            Some(800.0)
        );
        assert_eq!(metrics["cssContentSize"]["height"].as_f64(), Some(1600.0));
    }
}
