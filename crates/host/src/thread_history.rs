use serde::{Deserialize, Serialize};
use serde_json::{json, Value};
use std::collections::HashMap;
use std::fs;
use std::io::{BufRead, BufReader};
use std::path::{Path, PathBuf};

use crate::rollout_items::{
    build_history_user_message_item, collab_agent_state_label, collab_agent_status_failed,
    collab_prompt, collab_target_id, command_action_for_history, command_actions_from_parsed_cmd,
    command_execution_source_from_core, command_execution_status_from_core,
    completed_at_ms_from_line_index, duration_ms_from_value, function_call_arguments,
    function_output_success, function_output_text, item_receiver_thread_ids_from_object,
    json_string_array, parse_exit_code, parsed_function_output, receiver_thread_stub,
    running_agent_states, shell_join_json_array,
};
use crate::{resolve_codex_home, string_value, HostError};

const MAX_ROLLOUT_SCAN_DEPTH: usize = 8;
const MAX_ROLLOUT_SCAN_CANDIDATES: usize = 10_000;

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ThreadToolHistory {
    pub thread_id: String,
    pub turns: Vec<ThreadToolHistoryTurn>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ThreadToolHistoryTurn {
    pub turn_id: String,
    pub items: Vec<Value>,
}

pub(crate) fn read_thread_tool_history(
    codex_home: Option<&str>,
    thread_id: &str,
    thread_path: Option<&str>,
) -> Result<ThreadToolHistory, HostError> {
    let thread_id = thread_id.trim();
    let mut history = ThreadToolHistory {
        thread_id: thread_id.to_string(),
        turns: Vec::new(),
    };
    if thread_id.is_empty() {
        return Ok(history);
    }

    let rollout_path = if let Some(path) = thread_path
        .map(str::trim)
        .filter(|path| !path.is_empty())
        .map(PathBuf::from)
        .filter(|path| path.is_file())
    {
        Some(path)
    } else {
        let sessions_root = resolve_codex_home(codex_home).join("sessions");
        find_rollout_file_for_thread(&sessions_root, thread_id)?
    };
    let Some(rollout_path) = rollout_path else {
        return Ok(history);
    };

    let file =
        fs::File::open(&rollout_path).map_err(|error| HostError::Profile(error.to_string()))?;
    let reader = BufReader::new(file);
    let mut replay = RolloutToolReplay::default();
    for (line_index, line) in reader.lines().enumerate() {
        let line = line.map_err(|error| HostError::Profile(error.to_string()))?;
        let Ok(value) = serde_json::from_str::<Value>(&line) else {
            continue;
        };
        replay.handle_rollout_line(line_index, &value);
    }
    history.turns = replay.turns;
    Ok(history)
}

fn find_rollout_file_for_thread(
    sessions_root: &Path,
    thread_id: &str,
) -> Result<Option<PathBuf>, HostError> {
    if !sessions_root.is_dir() {
        return Ok(None);
    }

    let mut candidates = Vec::new();
    collect_jsonl_files(sessions_root, thread_id, 0, &mut candidates)?;
    candidates.sort_by(|a, b| b.cmp(a));
    if let Some(path) = candidates.iter().find(|path| {
        path.file_name()
            .is_some_and(|name| name.to_string_lossy().contains(thread_id))
    }) {
        return Ok(Some(path.clone()));
    }

    for path in candidates {
        if rollout_file_matches_thread(&path, thread_id)? {
            return Ok(Some(path));
        }
    }
    Ok(None)
}

fn collect_jsonl_files(
    root: &Path,
    thread_id: &str,
    depth: usize,
    output: &mut Vec<PathBuf>,
) -> Result<(), HostError> {
    if depth > MAX_ROLLOUT_SCAN_DEPTH || output.len() >= MAX_ROLLOUT_SCAN_CANDIDATES {
        return Ok(());
    }
    let entries = match fs::read_dir(root) {
        Ok(entries) => entries,
        Err(error) => {
            return Err(HostError::Profile(error.to_string()));
        }
    };
    for entry in entries {
        let entry = entry.map_err(|error| HostError::Profile(error.to_string()))?;
        if output.len() >= MAX_ROLLOUT_SCAN_CANDIDATES {
            break;
        }
        let file_type = entry
            .file_type()
            .map_err(|error| HostError::Profile(error.to_string()))?;
        let path = entry.path();
        if file_type.is_symlink() {
            continue;
        }
        if file_type.is_dir() {
            collect_jsonl_files(&path, thread_id, depth + 1, output)?;
        } else if file_type.is_file()
            && path
                .extension()
                .is_some_and(|extension| extension.to_string_lossy().eq_ignore_ascii_case("jsonl"))
        {
            if path
                .file_name()
                .is_some_and(|name| name.to_string_lossy().contains(thread_id))
            {
                output.insert(0, path);
            } else {
                output.push(path);
            }
        }
    }
    Ok(())
}

fn rollout_file_matches_thread(path: &Path, thread_id: &str) -> Result<bool, HostError> {
    let file = fs::File::open(path).map_err(|error| HostError::Profile(error.to_string()))?;
    let reader = BufReader::new(file);
    for line in reader.lines().take(12) {
        let line = line.map_err(|error| HostError::Profile(error.to_string()))?;
        let Ok(value) = serde_json::from_str::<Value>(&line) else {
            continue;
        };
        if value.get("type").and_then(Value::as_str) != Some("session_meta") {
            continue;
        }
        return Ok(value
            .get("payload")
            .and_then(|payload| payload.get("id"))
            .and_then(Value::as_str)
            == Some(thread_id));
    }
    Ok(false)
}

#[derive(Default)]
struct RolloutToolReplay {
    thread_id: Option<String>,
    current_turn_id: Option<String>,
    turn_indices: HashMap<String, usize>,
    pending_exec_calls: HashMap<String, PendingExecCall>,
    pending_collab_calls: HashMap<String, PendingCollabCall>,
    turns: Vec<ThreadToolHistoryTurn>,
}

#[derive(Debug, Clone)]
struct PendingExecCall {
    turn_index: usize,
    item_index: usize,
}

#[derive(Debug, Clone)]
struct PendingCollabCall {
    turn_index: usize,
    item_index: usize,
    tool: String,
}

impl RolloutToolReplay {
    fn handle_rollout_line(&mut self, line_index: usize, line: &Value) {
        match line.get("type").and_then(Value::as_str) {
            Some("session_meta") => {
                if let Some(thread_id) = line
                    .get("payload")
                    .and_then(|payload| payload.get("id"))
                    .and_then(Value::as_str)
                {
                    self.thread_id = Some(thread_id.to_string());
                }
            }
            Some("turn_context") => {
                if let Some(turn_id) = line
                    .get("payload")
                    .and_then(|payload| payload.get("turn_id"))
                    .and_then(Value::as_str)
                {
                    self.current_turn_id = Some(turn_id.to_string());
                    self.ensure_turn(turn_id);
                }
            }
            Some("event_msg") => self.handle_event_msg(line_index, line.get("payload")),
            Some("response_item") => self.handle_response_item(line_index, line.get("payload")),
            _ => {}
        }
    }

    fn handle_event_msg(&mut self, line_index: usize, payload: Option<&Value>) {
        let Some(payload) = payload else {
            return;
        };
        match payload.get("type").and_then(Value::as_str) {
            Some("task_started") | Some("turn_started") => {
                if let Some(turn_id) = payload.get("turn_id").and_then(Value::as_str) {
                    self.current_turn_id = Some(turn_id.to_string());
                    self.ensure_turn(turn_id);
                }
            }
            Some("user_message") => {
                let Some(turn_id) = self.current_turn_id.clone() else {
                    return;
                };
                let item = build_history_user_message_item(&turn_id, line_index, payload);
                self.push_turn_item(&turn_id, item);
            }
            Some("agent_message") => {
                let Some(text) = payload.get("message").and_then(Value::as_str) else {
                    return;
                };
                if text.is_empty() {
                    return;
                }
                let Some(turn_id) = self.current_turn_id.clone() else {
                    return;
                };
                let item = json!({
                    "type": "agentMessage",
                    "id": format!("history-agent:{turn_id}:{line_index}"),
                    "text": text,
                    "phase": payload.get("phase").cloned().unwrap_or(Value::Null),
                    "memoryCitation": payload.get("memory_citation").cloned().unwrap_or(Value::Null),
                    "_historyReplay": true,
                    "_rolloutIndex": line_index,
                });
                self.push_turn_item(&turn_id, item);
            }
            Some("agent_reasoning") | Some("agent_reasoning_raw_content") => {
                let Some(text) = payload.get("text").and_then(Value::as_str) else {
                    return;
                };
                if text.is_empty() {
                    return;
                }
                let Some(turn_id) = self.current_turn_id.clone() else {
                    return;
                };
                let is_summary =
                    payload.get("type").and_then(Value::as_str) == Some("agent_reasoning");
                let item = json!({
                    "type": "reasoning",
                    "id": format!("history-reasoning:{turn_id}:{line_index}"),
                    "summary": if is_summary { json!([text]) } else { json!([]) },
                    "content": if is_summary { json!([]) } else { json!([text]) },
                    "_historyReplay": true,
                    "_rolloutIndex": line_index,
                });
                self.push_turn_item(&turn_id, item);
            }
            Some("web_search_end") => {
                let Some(call_id) = payload.get("call_id").and_then(Value::as_str) else {
                    return;
                };
                let Some(turn_id) = self.current_turn_id.clone() else {
                    return;
                };
                let item = json!({
                    "type": "webSearch",
                    "id": call_id,
                    "query": payload.get("query").and_then(Value::as_str).unwrap_or_default(),
                    "action": payload.get("action").cloned().unwrap_or(Value::Null),
                    "_historyReplay": true,
                    "_rolloutIndex": line_index,
                });
                self.push_turn_item(&turn_id, item);
            }
            Some("exec_command_begin") => self.handle_exec_command_begin(line_index, payload),
            Some("exec_command_end") => self.handle_exec_command_end(line_index, payload),
            Some("collab_agent_spawn_end") => {
                self.handle_collab_agent_spawn_end(line_index, payload);
            }
            Some("collab_agent_interaction_end") => {
                self.handle_collab_agent_interaction_end(line_index, payload);
            }
            Some("collab_waiting_end") => {
                self.handle_collab_waiting_end(line_index, payload);
            }
            Some("collab_close_end") => {
                self.handle_collab_close_end(line_index, payload);
            }
            Some("collab_resume_end") => {
                self.handle_collab_resume_end(line_index, payload);
            }
            _ => {}
        }
    }

    /// Replay a `collab_agent_spawn_end` event back into a `collabAgentToolCall`
    /// thread item. Mirrors the live event mapping in
    /// `app-server-protocol/src/protocol/event_mapping.rs::CollabAgentSpawnEnd`.
    fn handle_collab_agent_spawn_end(&mut self, line_index: usize, payload: &Value) {
        let Some(call_id) = payload.get("call_id").and_then(Value::as_str) else {
            return;
        };
        let Some(turn_id) = self.current_turn_id.clone() else {
            return;
        };
        let sender = payload
            .get("sender_thread_id")
            .and_then(Value::as_str)
            .unwrap_or_default();
        let new_thread_id = payload
            .get("new_thread_id")
            .and_then(Value::as_str)
            .filter(|value| !value.is_empty());
        let agent_status = payload.get("status").cloned().unwrap_or(Value::Null);
        let failed = collab_agent_status_failed(&agent_status);
        let status = if failed || new_thread_id.is_none() {
            "failed"
        } else {
            "completed"
        };
        let (receiver_thread_ids, agents_states) = match new_thread_id {
            Some(id) => {
                let state = collab_agent_state_label(&agent_status);
                (json!([id]), json!({ id: state }))
            }
            None => (json!([]), json!({})),
        };
        let item = json!({
            "type": "collabAgentToolCall",
            "id": call_id,
            "tool": "spawnAgent",
            "status": status,
            "senderThreadId": sender,
            "receiverThreadIds": receiver_thread_ids,
            "prompt": payload.get("prompt").cloned().unwrap_or(Value::Null),
            "model": payload.get("model").cloned().unwrap_or(Value::Null),
            "reasoningEffort": payload
                .get("reasoning_effort")
                .cloned()
                .unwrap_or(Value::Null),
            "agentsStates": agents_states,
            "completedAtMs": payload
                .get("completed_at_ms")
                .and_then(Value::as_i64)
                .map(Value::from)
                .unwrap_or(Value::Null),
            "_historyReplay": true,
            "_rolloutIndex": line_index,
        });
        self.upsert_collab_tool_call(&turn_id, call_id, item);
    }

    fn handle_collab_agent_interaction_end(&mut self, line_index: usize, payload: &Value) {
        let Some(call_id) = payload.get("call_id").and_then(Value::as_str) else {
            return;
        };
        let Some(turn_id) = self.current_turn_id.clone() else {
            return;
        };
        let sender = payload
            .get("sender_thread_id")
            .and_then(Value::as_str)
            .unwrap_or_default();
        let receiver = payload
            .get("receiver_thread_id")
            .and_then(Value::as_str)
            .unwrap_or_default();
        let agent_status = payload.get("status").cloned().unwrap_or(Value::Null);
        let failed = collab_agent_status_failed(&agent_status);
        let status = if failed { "failed" } else { "completed" };
        let item = json!({
            "type": "collabAgentToolCall",
            "id": call_id,
            "tool": "sendInput",
            "status": status,
            "senderThreadId": sender,
            "receiverThreadIds": json!([receiver]),
            "prompt": payload.get("prompt").cloned().unwrap_or(Value::Null),
            "model": Value::Null,
            "reasoningEffort": Value::Null,
            "agentsStates": json!({ receiver: collab_agent_state_label(&agent_status) }),
            "completedAtMs": payload
                .get("completed_at_ms")
                .and_then(Value::as_i64)
                .map(Value::from)
                .unwrap_or(Value::Null),
            "_historyReplay": true,
            "_rolloutIndex": line_index,
        });
        self.upsert_collab_tool_call(&turn_id, call_id, item);
    }

    fn handle_collab_waiting_end(&mut self, line_index: usize, payload: &Value) {
        let Some(call_id) = payload.get("call_id").and_then(Value::as_str) else {
            return;
        };
        let Some(turn_id) = self.current_turn_id.clone() else {
            return;
        };
        let sender = payload
            .get("sender_thread_id")
            .and_then(Value::as_str)
            .unwrap_or_default();
        let statuses = payload
            .get("statuses")
            .and_then(Value::as_object)
            .cloned()
            .unwrap_or_default();
        let mut receiver_ids: Vec<Value> = Vec::with_capacity(statuses.len());
        let mut agents_states = serde_json::Map::with_capacity(statuses.len());
        let mut any_failed = false;
        for (id, agent_status) in statuses.iter() {
            receiver_ids.push(Value::String(id.clone()));
            if collab_agent_status_failed(agent_status) {
                any_failed = true;
            }
            agents_states.insert(id.clone(), collab_agent_state_label(agent_status));
        }
        let status = if any_failed { "failed" } else { "completed" };
        let item = json!({
            "type": "collabAgentToolCall",
            "id": call_id,
            "tool": "wait",
            "status": status,
            "senderThreadId": sender,
            "receiverThreadIds": Value::Array(receiver_ids),
            "prompt": Value::Null,
            "model": Value::Null,
            "reasoningEffort": Value::Null,
            "agentsStates": Value::Object(agents_states),
            "completedAtMs": payload
                .get("completed_at_ms")
                .and_then(Value::as_i64)
                .map(Value::from)
                .unwrap_or(Value::Null),
            "_historyReplay": true,
            "_rolloutIndex": line_index,
        });
        self.upsert_collab_tool_call(&turn_id, call_id, item);
    }

    fn handle_collab_close_end(&mut self, line_index: usize, payload: &Value) {
        let Some(call_id) = payload.get("call_id").and_then(Value::as_str) else {
            return;
        };
        let Some(turn_id) = self.current_turn_id.clone() else {
            return;
        };
        let sender = payload
            .get("sender_thread_id")
            .and_then(Value::as_str)
            .unwrap_or_default();
        let receiver = payload
            .get("receiver_thread_id")
            .and_then(Value::as_str)
            .unwrap_or_default();
        let agent_status = payload.get("status").cloned().unwrap_or(Value::Null);
        let failed = collab_agent_status_failed(&agent_status);
        let status = if failed { "failed" } else { "completed" };
        let item = json!({
            "type": "collabAgentToolCall",
            "id": call_id,
            "tool": "closeAgent",
            "status": status,
            "senderThreadId": sender,
            "receiverThreadIds": json!([receiver]),
            "prompt": Value::Null,
            "model": Value::Null,
            "reasoningEffort": Value::Null,
            "agentsStates": json!({ receiver: collab_agent_state_label(&agent_status) }),
            "completedAtMs": payload
                .get("completed_at_ms")
                .and_then(Value::as_i64)
                .map(Value::from)
                .unwrap_or(Value::Null),
            "_historyReplay": true,
            "_rolloutIndex": line_index,
        });
        self.upsert_collab_tool_call(&turn_id, call_id, item);
    }

    fn handle_collab_resume_end(&mut self, line_index: usize, payload: &Value) {
        let Some(call_id) = payload.get("call_id").and_then(Value::as_str) else {
            return;
        };
        let Some(turn_id) = self.current_turn_id.clone() else {
            return;
        };
        let sender = payload
            .get("sender_thread_id")
            .and_then(Value::as_str)
            .unwrap_or_default();
        let receiver = payload
            .get("receiver_thread_id")
            .and_then(Value::as_str)
            .unwrap_or_default();
        let item = json!({
            "type": "collabAgentToolCall",
            "id": call_id,
            "tool": "resumeAgent",
            "status": "completed",
            "senderThreadId": sender,
            "receiverThreadIds": json!([receiver]),
            "prompt": Value::Null,
            "model": Value::Null,
            "reasoningEffort": Value::Null,
            "agentsStates": json!({}),
            "completedAtMs": payload
                .get("completed_at_ms")
                .and_then(Value::as_i64)
                .map(Value::from)
                .unwrap_or(Value::Null),
            "_historyReplay": true,
            "_rolloutIndex": line_index,
        });
        self.upsert_collab_tool_call(&turn_id, call_id, item);
    }

    fn upsert_collab_tool_call(&mut self, turn_id: &str, call_id: &str, item: Value) {
        self.push_or_replace_collab_tool_call(turn_id, call_id, item);
    }

    fn push_or_replace_collab_tool_call(
        &mut self,
        turn_id: &str,
        call_id: &str,
        item: Value,
    ) -> (usize, usize) {
        let turn_index = self.ensure_turn(turn_id);
        let turn = &mut self.turns[turn_index];
        if let Some(item_index) = turn.items.iter().position(|candidate| {
            candidate.get("type").and_then(Value::as_str) == Some("collabAgentToolCall")
                && candidate.get("id").and_then(Value::as_str) == Some(call_id)
        }) {
            turn.items[item_index] = item;
            return (turn_index, item_index);
        }

        let item_index = turn.items.len();
        turn.items.push(item);
        (turn_index, item_index)
    }

    fn handle_response_item(&mut self, line_index: usize, payload: Option<&Value>) {
        let Some(payload) = payload else {
            return;
        };
        match payload.get("type").and_then(Value::as_str) {
            Some("function_call") => self.handle_function_call(line_index, payload),
            Some("function_call_output") => self.handle_function_call_output(line_index, payload),
            _ => {}
        }
    }

    fn handle_function_call(&mut self, line_index: usize, payload: &Value) {
        match payload.get("name").and_then(Value::as_str) {
            Some("exec_command") => self.handle_exec_function_call(line_index, payload),
            Some("spawn_agent") => self.handle_spawn_agent_function_call(line_index, payload),
            Some("wait_agent") => self.handle_wait_agent_function_call(line_index, payload),
            Some("send_input") => {
                self.handle_single_target_collab_function_call(line_index, payload, "sendInput")
            }
            Some("close_agent") => {
                self.handle_single_target_collab_function_call(line_index, payload, "closeAgent")
            }
            Some("resume_agent") => {
                self.handle_single_target_collab_function_call(line_index, payload, "resumeAgent")
            }
            _ => {}
        }
    }

    fn handle_exec_function_call(&mut self, line_index: usize, payload: &Value) {
        let Some(call_id) = payload.get("call_id").and_then(Value::as_str) else {
            return;
        };
        let Some(turn_id) = self.current_turn_id.clone() else {
            return;
        };
        let args = function_call_arguments(payload);
        let command = string_value(args.get("cmd"))
            .or_else(|| string_value(args.get("command")))
            .unwrap_or_default();
        if command.trim().is_empty() {
            return;
        }
        let cwd = string_value(args.get("workdir"))
            .or_else(|| string_value(args.get("cwd")))
            .unwrap_or_default();
        let item = json!({
            "type": "commandExecution",
            "id": call_id,
            "command": command,
            "cwd": cwd,
            "processId": Value::Null,
            "source": "agent",
            "status": "inProgress",
            "commandActions": [command_action_for_history(&command)],
            "aggregatedOutput": Value::Null,
            "exitCode": Value::Null,
            "durationMs": Value::Null,
            "_historyReplay": true,
            "_rolloutIndex": line_index,
        });
        let (turn_index, item_index) =
            self.push_or_replace_command_execution(&turn_id, call_id, item);
        self.pending_exec_calls.insert(
            call_id.to_string(),
            PendingExecCall {
                turn_index,
                item_index,
            },
        );
    }

    fn handle_spawn_agent_function_call(&mut self, line_index: usize, payload: &Value) {
        let Some(call_id) = payload.get("call_id").and_then(Value::as_str) else {
            return;
        };
        let Some(turn_id) = self.current_turn_id.clone() else {
            return;
        };
        let args = function_call_arguments(payload);
        let item = json!({
            "type": "collabAgentToolCall",
            "id": call_id,
            "tool": "spawnAgent",
            "status": "inProgress",
            "senderThreadId": self.thread_id.clone().unwrap_or_default(),
            "receiverThreadIds": [],
            "prompt": collab_prompt(&args).map(Value::String).unwrap_or(Value::Null),
            "model": string_value(args.get("model")).map(Value::String).unwrap_or(Value::Null),
            "reasoningEffort": string_value(args.get("reasoning_effort"))
                .or_else(|| string_value(args.get("reasoningEffort")))
                .map(Value::String)
                .unwrap_or(Value::Null),
            "agentsStates": {},
            "completedAtMs": Value::Null,
            "_historyReplay": true,
            "_rolloutIndex": line_index,
        });
        let (turn_index, item_index) =
            self.push_or_replace_collab_tool_call(&turn_id, call_id, item);
        self.pending_collab_calls.insert(
            call_id.to_string(),
            PendingCollabCall {
                turn_index,
                item_index,
                tool: "spawnAgent".to_string(),
            },
        );
    }

    fn handle_wait_agent_function_call(&mut self, line_index: usize, payload: &Value) {
        let Some(call_id) = payload.get("call_id").and_then(Value::as_str) else {
            return;
        };
        let Some(turn_id) = self.current_turn_id.clone() else {
            return;
        };
        let args = function_call_arguments(payload);
        let receiver_ids = json_string_array(args.get("targets"));
        let item = json!({
            "type": "collabAgentToolCall",
            "id": call_id,
            "tool": "wait",
            "status": "inProgress",
            "senderThreadId": self.thread_id.clone().unwrap_or_default(),
            "receiverThreadIds": receiver_ids.clone(),
            "prompt": Value::Null,
            "model": Value::Null,
            "reasoningEffort": Value::Null,
            "agentsStates": running_agent_states(&receiver_ids),
            "completedAtMs": Value::Null,
            "_historyReplay": true,
            "_rolloutIndex": line_index,
        });
        let (turn_index, item_index) =
            self.push_or_replace_collab_tool_call(&turn_id, call_id, item);
        self.pending_collab_calls.insert(
            call_id.to_string(),
            PendingCollabCall {
                turn_index,
                item_index,
                tool: "wait".to_string(),
            },
        );
    }

    fn handle_single_target_collab_function_call(
        &mut self,
        line_index: usize,
        payload: &Value,
        tool: &str,
    ) {
        let Some(call_id) = payload.get("call_id").and_then(Value::as_str) else {
            return;
        };
        let Some(turn_id) = self.current_turn_id.clone() else {
            return;
        };
        let args = function_call_arguments(payload);
        let receiver_ids = collab_target_id(&args).into_iter().collect::<Vec<_>>();
        let item = json!({
            "type": "collabAgentToolCall",
            "id": call_id,
            "tool": tool,
            "status": "inProgress",
            "senderThreadId": self.thread_id.clone().unwrap_or_default(),
            "receiverThreadIds": receiver_ids.clone(),
            "prompt": collab_prompt(&args).map(Value::String).unwrap_or(Value::Null),
            "model": Value::Null,
            "reasoningEffort": Value::Null,
            "agentsStates": running_agent_states(&receiver_ids),
            "completedAtMs": Value::Null,
            "_historyReplay": true,
            "_rolloutIndex": line_index,
        });
        let (turn_index, item_index) =
            self.push_or_replace_collab_tool_call(&turn_id, call_id, item);
        self.pending_collab_calls.insert(
            call_id.to_string(),
            PendingCollabCall {
                turn_index,
                item_index,
                tool: tool.to_string(),
            },
        );
    }

    fn handle_exec_command_begin(&mut self, line_index: usize, payload: &Value) {
        let Some(call_id) = payload.get("call_id").and_then(Value::as_str) else {
            return;
        };
        let Some(turn_id) = payload.get("turn_id").and_then(Value::as_str) else {
            return;
        };
        let command = shell_join_json_array(payload.get("command")).unwrap_or_default();
        if command.trim().is_empty() {
            return;
        }
        let cwd = payload
            .get("cwd")
            .and_then(Value::as_str)
            .unwrap_or_default();
        let item = json!({
            "type": "commandExecution",
            "id": call_id,
            "command": command,
            "cwd": cwd,
            "processId": payload.get("process_id").and_then(Value::as_str),
            "source": command_execution_source_from_core(payload.get("source")),
            "status": "inProgress",
            "commandActions": command_actions_from_parsed_cmd(payload.get("parsed_cmd"), cwd),
            "aggregatedOutput": Value::Null,
            "exitCode": Value::Null,
            "durationMs": Value::Null,
            "_historyReplay": true,
            "_rolloutIndex": line_index,
        });
        let (turn_index, item_index) =
            self.push_or_replace_command_execution(turn_id, call_id, item);
        self.pending_exec_calls.insert(
            call_id.to_string(),
            PendingExecCall {
                turn_index,
                item_index,
            },
        );
    }

    fn handle_exec_command_end(&mut self, line_index: usize, payload: &Value) {
        let Some(call_id) = payload.get("call_id").and_then(Value::as_str) else {
            return;
        };
        let Some(turn_id) = payload.get("turn_id").and_then(Value::as_str) else {
            return;
        };
        let command = shell_join_json_array(payload.get("command")).unwrap_or_default();
        if command.trim().is_empty() {
            return;
        }
        let cwd = payload
            .get("cwd")
            .and_then(Value::as_str)
            .unwrap_or_default();
        let aggregated_output = payload
            .get("aggregated_output")
            .and_then(Value::as_str)
            .unwrap_or_default();
        let item = json!({
            "type": "commandExecution",
            "id": call_id,
            "command": command,
            "cwd": cwd,
            "processId": payload.get("process_id").and_then(Value::as_str),
            "source": command_execution_source_from_core(payload.get("source")),
            "status": command_execution_status_from_core(payload.get("status")),
            "commandActions": command_actions_from_parsed_cmd(payload.get("parsed_cmd"), cwd),
            "aggregatedOutput": if aggregated_output.is_empty() {
                Value::Null
            } else {
                Value::String(aggregated_output.to_string())
            },
            "exitCode": payload.get("exit_code").and_then(Value::as_i64).map(Value::from).unwrap_or(Value::Null),
            "durationMs": duration_ms_from_value(payload.get("duration")).map(Value::from).unwrap_or(Value::Null),
            "_historyReplay": true,
            "_rolloutIndex": line_index,
        });
        let (turn_index, item_index) =
            self.push_or_replace_command_execution(turn_id, call_id, item);
        self.pending_exec_calls.insert(
            call_id.to_string(),
            PendingExecCall {
                turn_index,
                item_index,
            },
        );
    }

    fn handle_function_call_output(&mut self, line_index: usize, payload: &Value) {
        let Some(call_id) = payload.get("call_id").and_then(Value::as_str) else {
            return;
        };
        if let Some(call) = self.pending_exec_calls.get(call_id).cloned() {
            self.handle_exec_function_call_output(payload, call);
            return;
        }
        if let Some(call) = self.pending_collab_calls.get(call_id).cloned() {
            self.handle_collab_function_call_output(line_index, payload, call);
        }
    }

    fn handle_exec_function_call_output(&mut self, payload: &Value, call: PendingExecCall) {
        let Some(item) = self
            .turns
            .get_mut(call.turn_index)
            .and_then(|turn| turn.items.get_mut(call.item_index))
            .and_then(Value::as_object_mut)
        else {
            return;
        };
        let output = function_output_text(payload.get("output").unwrap_or(&Value::Null));
        let exit_code = parse_exit_code(&output);
        let success = function_output_success(payload.get("output").unwrap_or(&Value::Null))
            .unwrap_or_else(|| exit_code.unwrap_or(0) == 0);
        item.insert(
            "status".to_string(),
            Value::String(if success { "completed" } else { "failed" }.to_string()),
        );
        item.insert(
            "aggregatedOutput".to_string(),
            if output.is_empty() {
                Value::Null
            } else {
                Value::String(output)
            },
        );
        item.insert(
            "exitCode".to_string(),
            exit_code.map(Value::from).unwrap_or(Value::Null),
        );
    }

    fn handle_collab_function_call_output(
        &mut self,
        line_index: usize,
        payload: &Value,
        call: PendingCollabCall,
    ) {
        match call.tool.as_str() {
            "spawnAgent" => self.handle_spawn_agent_function_call_output(line_index, payload, call),
            "wait" => self.handle_wait_agent_function_call_output(line_index, payload, call),
            _ => self.handle_generic_collab_function_call_output(line_index, payload, call),
        }
    }

    fn handle_spawn_agent_function_call_output(
        &mut self,
        line_index: usize,
        payload: &Value,
        call: PendingCollabCall,
    ) {
        let output = parsed_function_output(payload.get("output").unwrap_or(&Value::Null));
        let agent_id = output.as_ref().and_then(|value| {
            string_value(value.get("agent_id")).or_else(|| string_value(value.get("agentId")))
        });
        let nickname = output.as_ref().and_then(|value| {
            string_value(value.get("nickname")).or_else(|| string_value(value.get("agentNickname")))
        });
        let Some(item) = self.pending_collab_item_mut(&call) else {
            return;
        };
        match agent_id {
            Some(agent_id) if !agent_id.trim().is_empty() => {
                let agent_id = agent_id.trim().to_string();
                let mut agents_states = serde_json::Map::new();
                agents_states.insert(
                    agent_id.clone(),
                    json!({ "status": "running", "message": Value::Null }),
                );
                item.insert("status".to_string(), Value::String("completed".to_string()));
                item.insert("receiverThreadIds".to_string(), json!([agent_id.clone()]));
                item.insert("agentsStates".to_string(), Value::Object(agents_states));
                if let Some(receiver_thread) = receiver_thread_stub(&agent_id, nickname.as_deref())
                {
                    item.insert("receiverThreads".to_string(), json!([receiver_thread]));
                }
            }
            _ => {
                item.insert("status".to_string(), Value::String("failed".to_string()));
                item.insert("agentsStates".to_string(), json!({}));
            }
        }
        item.insert(
            "completedAtMs".to_string(),
            completed_at_ms_from_line_index(line_index),
        );
    }

    fn handle_wait_agent_function_call_output(
        &mut self,
        line_index: usize,
        payload: &Value,
        call: PendingCollabCall,
    ) {
        let output = parsed_function_output(payload.get("output").unwrap_or(&Value::Null));
        let status_map = output
            .as_ref()
            .and_then(|value| value.get("status"))
            .and_then(Value::as_object)
            .cloned()
            .unwrap_or_default();
        let timed_out = output
            .as_ref()
            .and_then(|value| value.get("timed_out").or_else(|| value.get("timedOut")))
            .and_then(Value::as_bool)
            .unwrap_or(false);
        let Some(item) = self.pending_collab_item_mut(&call) else {
            return;
        };
        let mut receiver_ids = item_receiver_thread_ids_from_object(item);
        let mut agents_states = serde_json::Map::new();
        let mut any_failed = timed_out;
        for (id, status) in status_map.iter() {
            if !receiver_ids.iter().any(|candidate| candidate == id) {
                receiver_ids.push(id.clone());
            }
            if collab_agent_status_failed(status) {
                any_failed = true;
            }
            agents_states.insert(id.clone(), collab_agent_state_label(status));
        }
        item.insert(
            "status".to_string(),
            Value::String(if any_failed { "failed" } else { "completed" }.to_string()),
        );
        item.insert("receiverThreadIds".to_string(), json!(receiver_ids));
        item.insert("agentsStates".to_string(), Value::Object(agents_states));
        item.insert(
            "completedAtMs".to_string(),
            completed_at_ms_from_line_index(line_index),
        );
    }

    fn handle_generic_collab_function_call_output(
        &mut self,
        line_index: usize,
        payload: &Value,
        call: PendingCollabCall,
    ) {
        let success =
            function_output_success(payload.get("output").unwrap_or(&Value::Null)).unwrap_or(true);
        let Some(item) = self.pending_collab_item_mut(&call) else {
            return;
        };
        item.insert(
            "status".to_string(),
            Value::String(if success { "completed" } else { "failed" }.to_string()),
        );
        item.insert(
            "completedAtMs".to_string(),
            completed_at_ms_from_line_index(line_index),
        );
    }

    fn pending_collab_item_mut(
        &mut self,
        call: &PendingCollabCall,
    ) -> Option<&mut serde_json::Map<String, Value>> {
        self.turns
            .get_mut(call.turn_index)
            .and_then(|turn| turn.items.get_mut(call.item_index))
            .and_then(Value::as_object_mut)
    }

    fn ensure_turn(&mut self, turn_id: &str) -> usize {
        if let Some(index) = self.turn_indices.get(turn_id) {
            return *index;
        }
        let index = self.turns.len();
        self.turns.push(ThreadToolHistoryTurn {
            turn_id: turn_id.to_string(),
            items: Vec::new(),
        });
        self.turn_indices.insert(turn_id.to_string(), index);
        index
    }

    fn push_turn_item(&mut self, turn_id: &str, item: Value) -> (usize, usize) {
        let turn_index = self.ensure_turn(turn_id);
        let turn = &mut self.turns[turn_index];
        let item_index = turn.items.len();
        turn.items.push(item);
        (turn_index, item_index)
    }

    fn push_or_replace_command_execution(
        &mut self,
        turn_id: &str,
        call_id: &str,
        item: Value,
    ) -> (usize, usize) {
        let turn_index = self.ensure_turn(turn_id);
        let turn = &mut self.turns[turn_index];
        if let Some(item_index) = turn.items.iter().position(|candidate| {
            candidate.get("type").and_then(Value::as_str) == Some("commandExecution")
                && candidate.get("id").and_then(Value::as_str) == Some(call_id)
        }) {
            turn.items[item_index] = item;
            return (turn_index, item_index);
        }

        let item_index = turn.items.len();
        turn.items.push(item);
        (turn_index, item_index)
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::env;

    #[test]
    fn reads_exec_command_end_history_from_rollout() {
        let thread_id = "019e-test-thread";
        let turn_id = "019e-test-turn";
        let dir = env::temp_dir().join(format!("hicodex-host-history-test-{}", std::process::id()));
        let sessions = dir.join("sessions").join("2026").join("05").join("08");
        let _ = fs::remove_dir_all(&dir);
        fs::create_dir_all(&sessions).unwrap();
        let rollout = sessions.join(format!("rollout-2026-05-08T00-00-00-{thread_id}.jsonl"));
        fs::write(
            &rollout,
            format!(
                r#"{{"type":"session_meta","payload":{{"id":"{thread_id}"}}}}
{{"type":"event_msg","payload":{{"type":"task_started","turn_id":"{turn_id}","started_at":1}}}}
{{"type":"turn_context","payload":{{"turn_id":"{turn_id}","cwd":"/tmp/project"}}}}
{{"type":"event_msg","payload":{{"type":"user_message","message":"read files","images":[],"local_images":[],"text_elements":[]}}}}
{{"type":"event_msg","payload":{{"type":"agent_message","message":"I will read the file.","phase":"commentary","memory_citation":null}}}}
{{"type":"event_msg","payload":{{"type":"exec_command_begin","call_id":"call_exec","process_id":"123","turn_id":"{turn_id}","started_at_ms":1,"command":["/bin/zsh","-lc","cat docs/DEVELOPMENT.md"],"cwd":"/tmp/project","parsed_cmd":[{{"type":"read","cmd":"cat docs/DEVELOPMENT.md","name":"DEVELOPMENT.md","path":"docs/DEVELOPMENT.md"}}],"source":"unified_exec_startup","interaction_input":null}}}}
{{"type":"event_msg","payload":{{"type":"exec_command_end","call_id":"call_exec","process_id":"123","turn_id":"{turn_id}","completed_at_ms":2,"command":["/bin/zsh","-lc","cat docs/DEVELOPMENT.md"],"cwd":"/tmp/project","parsed_cmd":[{{"type":"read","cmd":"cat docs/DEVELOPMENT.md","name":"DEVELOPMENT.md","path":"docs/DEVELOPMENT.md"}}],"source":"unified_exec_startup","interaction_input":null,"stdout":"","stderr":"missing","aggregated_output":"missing","exit_code":1,"duration":{{"secs":0,"nanos":12000000}},"formatted_output":"missing","status":"failed"}}}}
"#,
            ),
        )
        .unwrap();

        let history =
            read_thread_tool_history(Some(dir.to_string_lossy().as_ref()), thread_id, None)
                .unwrap();

        assert_eq!(history.thread_id, thread_id);
        assert_eq!(history.turns.len(), 1);
        assert_eq!(history.turns[0].turn_id, turn_id);
        assert_eq!(
            history.turns[0]
                .items
                .iter()
                .filter(|item| item.get("type").and_then(Value::as_str) == Some("commandExecution"))
                .count(),
            1
        );
        let command = history.turns[0]
            .items
            .iter()
            .find(|item| item.get("type").and_then(Value::as_str) == Some("commandExecution"))
            .expect("exec_command should be replayed as commandExecution");
        assert_eq!(command["id"].as_str(), Some("call_exec"));
        assert_eq!(command["status"].as_str(), Some("failed"));
        assert_eq!(command["exitCode"].as_i64(), Some(1));
        assert_eq!(command["cwd"].as_str(), Some("/tmp/project"));
        assert_eq!(command["processId"].as_str(), Some("123"));
        assert_eq!(command["source"].as_str(), Some("unifiedExecStartup"));
        assert_eq!(command["durationMs"].as_i64(), Some(12));
        assert_eq!(
            command["command"].as_str(),
            Some("/bin/zsh -lc 'cat docs/DEVELOPMENT.md'")
        );
        let action = &command["commandActions"][0];
        assert_eq!(action["type"].as_str(), Some("read"));
        assert_eq!(action["command"].as_str(), Some("cat docs/DEVELOPMENT.md"));
        assert_eq!(action["name"].as_str(), Some("DEVELOPMENT.md"));
        assert_eq!(
            action["path"].as_str(),
            Some("/tmp/project/docs/DEVELOPMENT.md")
        );

        let _ = fs::remove_dir_all(&dir);
    }

    #[cfg(unix)]
    #[test]
    fn rollout_scan_skips_symlink_cycles() {
        use std::os::unix::fs::symlink;

        let thread_id = "019e-symlink-thread";
        let dir = env::temp_dir().join(format!(
            "hicodex-host-history-symlink-test-{}",
            std::process::id()
        ));
        let sessions = dir.join("sessions");
        let nested = sessions.join("nested");
        let _ = fs::remove_dir_all(&dir);
        fs::create_dir_all(&nested).unwrap();
        symlink(&sessions, nested.join("cycle")).unwrap();
        let rollout = nested.join(format!("rollout-2026-05-08T00-00-00-{thread_id}.jsonl"));
        fs::write(
            &rollout,
            format!(r#"{{"type":"session_meta","payload":{{"id":"{thread_id}"}}}}"#),
        )
        .unwrap();

        let history =
            read_thread_tool_history(Some(dir.to_string_lossy().as_ref()), thread_id, None)
                .unwrap();

        assert_eq!(history.thread_id, thread_id);
        let _ = fs::remove_dir_all(&dir);
    }

    #[test]
    fn rollout_scan_respects_depth_limit() {
        let thread_id = "019e-deep-thread";
        let dir = env::temp_dir().join(format!(
            "hicodex-host-history-depth-test-{}",
            std::process::id()
        ));
        let sessions = dir.join("sessions");
        let _ = fs::remove_dir_all(&dir);
        let mut deep = sessions.clone();
        for index in 0..=MAX_ROLLOUT_SCAN_DEPTH + 2 {
            deep = deep.join(format!("d{index}"));
        }
        fs::create_dir_all(&deep).unwrap();
        fs::write(
            deep.join(format!("rollout-2026-05-08T00-00-00-{thread_id}.jsonl")),
            format!(r#"{{"type":"session_meta","payload":{{"id":"{thread_id}"}}}}"#),
        )
        .unwrap();

        let found = find_rollout_file_for_thread(&sessions, thread_id).unwrap();

        assert!(found.is_none());
        let _ = fs::remove_dir_all(&dir);
    }

    #[test]
    fn replays_collab_agent_spawn_end_into_collab_tool_call() {
        // Without this, refreshing a thread that used multi-agent spawning would
        // lose all "Spawned N agents" rows because the rollout reader skipped
        // the collab event family entirely.
        let thread_id = "019e-collab-thread";
        let turn_id = "019e-collab-turn";
        let dir = env::temp_dir().join(format!(
            "hicodex-host-collab-spawn-test-{}",
            std::process::id()
        ));
        let sessions = dir.join("sessions").join("2026").join("05").join("08");
        let _ = fs::remove_dir_all(&dir);
        fs::create_dir_all(&sessions).unwrap();
        let rollout = sessions.join(format!("rollout-2026-05-08T00-00-00-{thread_id}.jsonl"));
        let line = format!(
            r#"{{"type":"session_meta","payload":{{"id":"{thread_id}"}}}}
{{"type":"event_msg","payload":{{"type":"task_started","turn_id":"{turn_id}","started_at":1}}}}
{{"type":"turn_context","payload":{{"turn_id":"{turn_id}","cwd":"/tmp/project"}}}}
{{"type":"event_msg","payload":{{"type":"collab_agent_spawn_end","call_id":"call_spawn_1","completed_at_ms":12,"sender_thread_id":"{thread_id}","new_thread_id":"019e-child-1","prompt":"Inspect render groups","model":"gpt-5.5","reasoning_effort":"medium","status":"running"}}}}
{{"type":"event_msg","payload":{{"type":"collab_agent_interaction_end","call_id":"call_msg_1","completed_at_ms":14,"sender_thread_id":"{thread_id}","receiver_thread_id":"019e-child-1","prompt":"Continue","status":{{"completed":"done"}}}}}}
{{"type":"event_msg","payload":{{"type":"collab_waiting_end","call_id":"call_wait_1","completed_at_ms":16,"sender_thread_id":"{thread_id}","statuses":{{"019e-child-1":{{"completed":"done"}},"019e-child-2":{{"errored":"boom"}}}}}}}}
"#,
        );
        fs::write(&rollout, line).unwrap();

        let history =
            read_thread_tool_history(Some(dir.to_string_lossy().as_ref()), thread_id, None)
                .unwrap();
        assert_eq!(history.turns.len(), 1);
        let collab_items: Vec<&Value> = history.turns[0]
            .items
            .iter()
            .filter(|item| item.get("type").and_then(Value::as_str) == Some("collabAgentToolCall"))
            .collect();
        assert_eq!(
            collab_items.len(),
            3,
            "expected three collab tool call items"
        );

        let spawn = collab_items[0];
        assert_eq!(spawn["tool"].as_str(), Some("spawnAgent"));
        assert_eq!(spawn["status"].as_str(), Some("completed"));
        assert_eq!(spawn["receiverThreadIds"][0].as_str(), Some("019e-child-1"));
        assert_eq!(
            spawn["agentsStates"]["019e-child-1"]["status"].as_str(),
            Some("running")
        );
        assert_eq!(spawn["prompt"].as_str(), Some("Inspect render groups"));

        let send = collab_items[1];
        assert_eq!(send["tool"].as_str(), Some("sendInput"));
        assert_eq!(send["status"].as_str(), Some("completed"));
        assert_eq!(
            send["agentsStates"]["019e-child-1"]["status"].as_str(),
            Some("completed")
        );

        let wait = collab_items[2];
        assert_eq!(wait["tool"].as_str(), Some("wait"));
        assert_eq!(
            wait["status"].as_str(),
            Some("failed"),
            "any errored child should propagate to wait status",
        );
        assert_eq!(
            wait["agentsStates"]["019e-child-2"]["status"].as_str(),
            Some("errored")
        );

        let _ = fs::remove_dir_all(&dir);
    }

    #[test]
    fn replays_agent_function_calls_into_collab_tool_calls() {
        // Real HiCodex Desktop rollouts can persist multiple-agent work as
        // response_item function calls (`spawn_agent` / `wait_agent`) rather
        // than the newer collab_agent_* event messages. Those rows still need
        // to become collabAgentToolCall items so they survive thread reload.
        let thread_id = "019e-collab-function-thread";
        let turn_id = "019e-collab-function-turn";
        let dir = env::temp_dir().join(format!(
            "hicodex-host-collab-function-test-{}",
            std::process::id()
        ));
        let sessions = dir.join("sessions").join("2026").join("05").join("16");
        let _ = fs::remove_dir_all(&dir);
        fs::create_dir_all(&sessions).unwrap();
        let rollout = sessions.join(format!("rollout-2026-05-16T00-00-00-{thread_id}.jsonl"));
        let line = format!(
            r#"{{"type":"session_meta","payload":{{"id":"{thread_id}"}}}}
{{"type":"event_msg","payload":{{"type":"task_started","turn_id":"{turn_id}","started_at":1}}}}
{{"type":"response_item","payload":{{"type":"function_call","name":"spawn_agent","arguments":"{{\"message\":\"Weather agent\",\"model\":\"gpt-5.5\"}}","call_id":"call_spawn_weather"}}}}
{{"type":"response_item","payload":{{"type":"function_call_output","call_id":"call_spawn_weather","output":"{{\"agent_id\":\"019e-child-weather\",\"nickname\":\"Bacon\"}}"}}}}
{{"type":"response_item","payload":{{"type":"function_call","name":"spawn_agent","arguments":"{{\"message\":\"Clothing agent\"}}","call_id":"call_spawn_clothing"}}}}
{{"type":"response_item","payload":{{"type":"function_call_output","call_id":"call_spawn_clothing","output":"{{\"agent_id\":\"019e-child-clothing\",\"nickname\":\"Faraday\"}}"}}}}
{{"type":"response_item","payload":{{"type":"function_call","name":"wait_agent","arguments":"{{\"targets\":[\"019e-child-weather\",\"019e-child-clothing\"],\"timeout_ms\":10000}}","call_id":"call_wait_agents"}}}}
{{"type":"response_item","payload":{{"type":"function_call_output","call_id":"call_wait_agents","output":"{{\"status\":{{\"019e-child-weather\":{{\"completed\":\"done\"}},\"019e-child-clothing\":{{\"completed\":\"done\"}}}},\"timed_out\":false}}"}}}}
"#,
        );
        fs::write(&rollout, line).unwrap();

        let history =
            read_thread_tool_history(Some(dir.to_string_lossy().as_ref()), thread_id, None)
                .unwrap();
        assert_eq!(history.turns.len(), 1);
        let collab_items: Vec<&Value> = history.turns[0]
            .items
            .iter()
            .filter(|item| item.get("type").and_then(Value::as_str) == Some("collabAgentToolCall"))
            .collect();
        assert_eq!(collab_items.len(), 3);

        let first_spawn = collab_items[0];
        assert_eq!(first_spawn["id"].as_str(), Some("call_spawn_weather"));
        assert_eq!(first_spawn["tool"].as_str(), Some("spawnAgent"));
        assert_eq!(first_spawn["status"].as_str(), Some("completed"));
        assert_eq!(
            first_spawn["senderThreadId"].as_str(),
            Some(thread_id),
            "function-call replay should preserve the parent thread id",
        );
        assert_eq!(
            first_spawn["receiverThreadIds"][0].as_str(),
            Some("019e-child-weather"),
        );
        assert_eq!(
            first_spawn["agentsStates"]["019e-child-weather"]["status"].as_str(),
            Some("running"),
            "spawn output marks the child active until a wait row updates it",
        );
        assert_eq!(
            first_spawn["receiverThreads"][0]["thread"]["agentNickname"].as_str(),
            Some("Bacon"),
        );

        let wait = collab_items[2];
        assert_eq!(wait["tool"].as_str(), Some("wait"));
        assert_eq!(wait["status"].as_str(), Some("completed"));
        assert_eq!(
            wait["agentsStates"]["019e-child-clothing"]["status"].as_str(),
            Some("completed"),
        );

        let _ = fs::remove_dir_all(&dir);
    }
}
