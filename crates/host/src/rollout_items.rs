use serde_json::{json, Value};
use std::path::Path;

use crate::string_value;

/// Convert a Codex core `AgentStatus` payload (rollout JSONL) to the
/// camelCase `CollabAgentState` shape that the UI expects on
/// `collabAgentToolCall.agentsStates`.
///
/// Core serialization is `#[serde(rename_all = "snake_case")]` with default
/// (external) tagging:
///   - Unit variants -> bare strings, e.g. `"running"` / `"pending_init"`.
///   - Tuple variants -> `{"completed": null|"text"}` or `{"errored": "msg"}`.
pub(crate) fn collab_agent_state_label(status: &Value) -> Value {
    match status {
        Value::String(label) => json!({
            "status": collab_agent_status_label(label),
            "message": Value::Null,
        }),
        Value::Object(map) => {
            let (key, payload) = match map.iter().next() {
                Some((key, payload)) => (key.as_str(), payload),
                None => return json!({ "status": "pendingInit", "message": Value::Null }),
            };
            let message = match payload {
                Value::String(text) => Value::String(text.clone()),
                Value::Null => Value::Null,
                other => Value::String(other.to_string()),
            };
            json!({
                "status": collab_agent_status_label(key),
                "message": message,
            })
        }
        _ => json!({ "status": "pendingInit", "message": Value::Null }),
    }
}

fn collab_agent_status_label(snake_case: &str) -> &'static str {
    match snake_case {
        "pending_init" => "pendingInit",
        "running" => "running",
        "interrupted" => "interrupted",
        "completed" => "completed",
        "errored" => "errored",
        "shutdown" => "shutdown",
        "not_found" => "notFound",
        _ => "pendingInit",
    }
}

pub(crate) fn collab_agent_status_failed(status: &Value) -> bool {
    match status {
        Value::String(label) => label == "errored" || label == "not_found",
        Value::Object(map) => map
            .keys()
            .next()
            .map(|key| key == "errored" || key == "not_found")
            .unwrap_or(false),
        _ => false,
    }
}

pub(crate) fn build_history_user_message_item(
    turn_id: &str,
    line_index: usize,
    payload: &Value,
) -> Value {
    let mut content = Vec::new();
    if let Some(message) = payload.get("message").and_then(Value::as_str) {
        if !message.is_empty() {
            content.push(json!({
                "type": "text",
                "text": message,
                "text_elements": payload.get("text_elements").cloned().unwrap_or_else(|| json!([])),
            }));
        }
    }
    if let Some(images) = payload.get("images").and_then(Value::as_array) {
        for image in images {
            if let Some(url) = image.as_str() {
                content.push(json!({ "type": "image", "url": url }));
            }
        }
    }
    if let Some(local_images) = payload.get("local_images").and_then(Value::as_array) {
        for image in local_images {
            if let Some(path) = image.as_str() {
                content.push(json!({ "type": "localImage", "path": path }));
            }
        }
    }
    json!({
        "type": "userMessage",
        "id": format!("history-user:{turn_id}:{line_index}"),
        "content": content,
        "_historyReplay": true,
        "_rolloutIndex": line_index,
    })
}

pub(crate) fn function_call_arguments(payload: &Value) -> Value {
    match payload.get("arguments") {
        Some(Value::String(value)) => serde_json::from_str(value).unwrap_or(Value::Null),
        Some(value) => value.clone(),
        None => Value::Null,
    }
}

pub(crate) fn collab_prompt(args: &Value) -> Option<String> {
    string_value(args.get("message"))
        .or_else(|| string_value(args.get("prompt")))
        .map(|value| value.trim().to_string())
        .filter(|value| !value.is_empty())
}

pub(crate) fn collab_target_id(args: &Value) -> Option<String> {
    string_value(args.get("target"))
        .or_else(|| string_value(args.get("target_id")))
        .or_else(|| string_value(args.get("targetId")))
        .or_else(|| string_value(args.get("agent_id")))
        .or_else(|| string_value(args.get("agentId")))
        .map(|value| value.trim().to_string())
        .filter(|value| !value.is_empty())
}

pub(crate) fn json_string_array(value: Option<&Value>) -> Vec<String> {
    value
        .and_then(Value::as_array)
        .map(|values| {
            values
                .iter()
                .filter_map(Value::as_str)
                .map(str::trim)
                .filter(|value| !value.is_empty())
                .map(ToOwned::to_owned)
                .collect()
        })
        .unwrap_or_default()
}

pub(crate) fn running_agent_states(receiver_ids: &[String]) -> Value {
    let mut states = serde_json::Map::new();
    for id in receiver_ids {
        states.insert(
            id.clone(),
            json!({
                "status": "running",
                "message": Value::Null,
            }),
        );
    }
    Value::Object(states)
}

pub(crate) fn parsed_function_output(value: &Value) -> Option<Value> {
    match value {
        Value::String(text) => serde_json::from_str::<Value>(text).ok(),
        Value::Object(_) => Some(value.clone()),
        _ => None,
    }
}

pub(crate) fn receiver_thread_stub(thread_id: &str, nickname: Option<&str>) -> Option<Value> {
    let nickname = nickname.map(str::trim).filter(|value| !value.is_empty())?;
    Some(json!({
        "threadId": thread_id,
        "thread": {
            "id": thread_id,
            "agentNickname": nickname,
        },
    }))
}

pub(crate) fn item_receiver_thread_ids_from_object(
    item: &serde_json::Map<String, Value>,
) -> Vec<String> {
    item.get("receiverThreadIds")
        .and_then(Value::as_array)
        .map(|values| {
            values
                .iter()
                .filter_map(Value::as_str)
                .map(str::trim)
                .filter(|value| !value.is_empty())
                .map(ToOwned::to_owned)
                .collect()
        })
        .unwrap_or_default()
}

pub(crate) fn completed_at_ms_from_line_index(_line_index: usize) -> Value {
    Value::Null
}

pub(crate) fn function_output_text(value: &Value) -> String {
    match value {
        Value::String(text) => text.clone(),
        Value::Object(map) => {
            if let Some(text) = map.get("body").and_then(Value::as_str) {
                return text.to_string();
            }
            if let Some(text) = map.get("text").and_then(Value::as_str) {
                return text.to_string();
            }
            if let Some(items) = map.get("body").and_then(Value::as_array) {
                return content_items_text(items);
            }
            if let Some(items) = map.get("content").and_then(Value::as_array) {
                return content_items_text(items);
            }
            serde_json::to_string(value).unwrap_or_default()
        }
        Value::Null => String::new(),
        _ => serde_json::to_string(value).unwrap_or_default(),
    }
}

fn content_items_text(items: &[Value]) -> String {
    items
        .iter()
        .filter_map(|item| {
            item.get("text")
                .and_then(Value::as_str)
                .or_else(|| item.get("input_text").and_then(Value::as_str))
                .map(ToOwned::to_owned)
        })
        .collect::<Vec<_>>()
        .join("\n")
}

pub(crate) fn function_output_success(value: &Value) -> Option<bool> {
    value
        .as_object()
        .and_then(|map| map.get("success"))
        .and_then(Value::as_bool)
}

pub(crate) fn parse_exit_code(output: &str) -> Option<i64> {
    let marker = "Process exited with code ";
    let start = output.find(marker)? + marker.len();
    let digits = output[start..]
        .chars()
        .take_while(|value| value.is_ascii_digit() || *value == '-')
        .collect::<String>();
    digits.parse().ok()
}

pub(crate) fn shell_join_json_array(value: Option<&Value>) -> Option<String> {
    let values = value?.as_array()?;
    Some(
        values
            .iter()
            .filter_map(Value::as_str)
            .map(shell_quote)
            .collect::<Vec<_>>()
            .join(" "),
    )
}

fn shell_quote(value: &str) -> String {
    if value.is_empty() {
        return "''".to_string();
    }
    if value
        .chars()
        .all(|ch| ch.is_ascii_alphanumeric() || matches!(ch, '_' | '-' | '.' | '/' | ':' | '='))
    {
        return value.to_string();
    }
    format!("'{}'", value.replace('\'', "'\"'\"'"))
}

pub(crate) fn command_execution_source_from_core(value: Option<&Value>) -> &'static str {
    match value.and_then(Value::as_str) {
        Some("user_shell") | Some("userShell") => "userShell",
        Some("unified_exec_startup") | Some("unifiedExecStartup") => "unifiedExecStartup",
        Some("unified_exec_interaction") | Some("unifiedExecInteraction") => {
            "unifiedExecInteraction"
        }
        _ => "agent",
    }
}

pub(crate) fn command_execution_status_from_core(value: Option<&Value>) -> &'static str {
    match value.and_then(Value::as_str) {
        Some("failed") => "failed",
        Some("declined") => "declined",
        Some("in_progress") | Some("inProgress") => "inProgress",
        _ => "completed",
    }
}

pub(crate) fn command_actions_from_parsed_cmd(value: Option<&Value>, cwd: &str) -> Value {
    let Some(parsed_cmd) = value.and_then(Value::as_array) else {
        return json!([]);
    };
    Value::Array(
        parsed_cmd
            .iter()
            .filter_map(|parsed| command_action_from_core_parsed(parsed, cwd))
            .collect(),
    )
}

fn command_action_from_core_parsed(parsed: &Value, cwd: &str) -> Option<Value> {
    let command = parsed
        .get("cmd")
        .and_then(Value::as_str)
        .unwrap_or_default();
    Some(match parsed.get("type").and_then(Value::as_str) {
        Some("read") => {
            let path = parsed
                .get("path")
                .and_then(Value::as_str)
                .unwrap_or_default();
            json!({
                "type": "read",
                "command": command,
                "name": parsed.get("name").and_then(Value::as_str).unwrap_or_default(),
                "path": absolute_path_from_cwd(cwd, path),
            })
        }
        Some("list_files") | Some("listFiles") => {
            json!({
                "type": "listFiles",
                "command": command,
                "path": parsed.get("path").cloned().unwrap_or(Value::Null),
            })
        }
        Some("search") => {
            json!({
                "type": "search",
                "command": command,
                "query": parsed.get("query").cloned().unwrap_or(Value::Null),
                "path": parsed.get("path").cloned().unwrap_or(Value::Null),
            })
        }
        Some("unknown") => json!({ "type": "unknown", "command": command }),
        _ => return None,
    })
}

fn absolute_path_from_cwd(cwd: &str, path: &str) -> String {
    let path_buf = Path::new(path);
    if path_buf.is_absolute() {
        return path.to_string();
    }
    Path::new(cwd).join(path_buf).to_string_lossy().to_string()
}

pub(crate) fn duration_ms_from_value(value: Option<&Value>) -> Option<i64> {
    match value? {
        Value::Number(number) => number.as_i64(),
        Value::String(text) => duration_ms_from_string(text),
        Value::Object(map) => {
            let secs = map.get("secs").and_then(Value::as_i64).unwrap_or(0);
            let nanos = map.get("nanos").and_then(Value::as_i64).unwrap_or(0);
            Some(secs.saturating_mul(1000).saturating_add(nanos / 1_000_000))
        }
        _ => None,
    }
}

fn duration_ms_from_string(text: &str) -> Option<i64> {
    if let Some(stripped) = text.strip_suffix("ms") {
        return stripped.trim().parse::<i64>().ok();
    }
    if let Some(stripped) = text.strip_suffix('s') {
        let seconds = stripped.trim().parse::<f64>().ok()?;
        return Some((seconds * 1000.0).round() as i64);
    }
    text.trim().parse::<i64>().ok()
}

pub(crate) fn command_action_for_history(command: &str) -> Value {
    let lower = command.to_lowercase();
    if lower.contains("rg --files") || lower.contains("find ") || lower.contains("ls ") {
        return json!({ "type": "listFiles", "command": command, "path": Value::Null });
    }
    if lower.contains("rg ") || lower.contains("grep ") {
        return json!({ "type": "search", "command": command, "query": Value::Null, "path": Value::Null });
    }
    if lower.contains("cat ") || lower.contains("sed ") || lower.contains("nl ") {
        let path = extract_command_path(command).unwrap_or_default();
        let name = Path::new(&path)
            .file_name()
            .map(|name| name.to_string_lossy().to_string())
            .filter(|name| !name.is_empty())
            .unwrap_or_else(|| path.clone());
        return json!({ "type": "read", "command": command, "name": name, "path": path });
    }
    json!({ "type": "unknown", "command": command })
}

fn extract_command_path(command: &str) -> Option<String> {
    command
        .split_whitespace()
        .rev()
        .map(|part| part.trim_matches(|ch| matches!(ch, '\'' | '"' | '`' | ';' | ',' | ')' | '(')))
        .find(|part| {
            !part.is_empty()
                && !part.starts_with('-')
                && (*part).chars().any(|ch| ch == '/' || ch == '.')
        })
        .map(ToOwned::to_owned)
}
