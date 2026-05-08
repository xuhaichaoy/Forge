use serde::{Deserialize, Serialize};
use serde_json::{json, Value};
use std::collections::HashMap;
use std::env;
use std::fs;
use std::io::{BufRead, BufReader, Write};
use std::path::{Path, PathBuf};
use std::process::{Child, ChildStdin, Command, Stdio};
use std::sync::mpsc::{self, Receiver, Sender};
use std::sync::Mutex;
use std::thread;
use thiserror::Error;

const LOCAL_CODEX_DEBUG_BINS: &[&str] = &[
    "/Users/haichao/Desktop/data/codex/codex-rs/target/debug/codex",
    "/Users/haichao/Desktop/data/codex/target/debug/codex",
];
const INSTALLED_CODEX_BIN: &str = "/Applications/Codex.app/Contents/Resources/codex";

#[derive(Debug, Error)]
pub enum HostError {
    #[error("codex app-server is already running")]
    AlreadyRunning,
    #[error("codex app-server is not running")]
    NotRunning,
    #[error("failed to start codex app-server: {0}")]
    Start(String),
    #[error("failed to write to codex app-server stdin: {0}")]
    Write(String),
    #[error("failed to serialize JSON-RPC payload: {0}")]
    Serialize(String),
    #[error("failed to write Codex profile: {0}")]
    Profile(String),
}

#[derive(Debug, Clone, Serialize, Deserialize, Default)]
#[serde(rename_all = "camelCase")]
pub struct AppServerStartConfig {
    pub codex_bin: Option<String>,
    pub codex_home: Option<String>,
    pub codex_source_dir: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct HostStatus {
    pub running: bool,
    pub pid: Option<u32>,
    pub codex_bin: Option<String>,
    pub codex_home: String,
    pub default_cwd: Option<String>,
    pub last_error: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct LocalModelCatalogConfig {
    pub model: String,
    pub display_name: Option<String>,
    pub description: Option<String>,
    pub context_window: Option<u64>,
    pub auto_compact_token_limit: Option<u64>,
    pub input_modalities: Option<Vec<String>>,
}

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

const HICODEX_PERSONALITY_PLACEHOLDER: &str = "{{ personality }}";
const HICODEX_MODEL_INSTRUCTIONS_HEADER: &str = "You are Codex, a coding agent based on GPT-5. You and the user share the same workspace and collaborate to achieve the user's goals.";
const HICODEX_BASE_INSTRUCTIONS: &str = r#"You are a coding agent running in Codex Desktop. You are expected to be precise, safe, and helpful.

# How You Work

- Inspect the workspace before making claims or changing code.
- Use tool calls for shell commands, file reads, searches, patches, and plans.
- Keep user-visible progress updates concise and factual.
- Continue after tool results when more work is required.
- Do not output raw hidden-reasoning markup such as <think> or </think>. If the model performs internal reasoning, keep it out of assistant messages. User-visible assistant messages should be progress updates, tool calls, or final answers.

# Tool Use

- Prefer `rg` or `rg --files` for search.
- Use `apply_patch` for manual code edits.
- Do not use destructive git or filesystem commands unless explicitly requested.
- Preserve unrelated work in dirty worktrees.

# Final Answers

- Summarize what changed and what was verified.
- Mention any tests or builds that could not be run.
- Keep the answer concise unless the user asks for detail.
"#;
const HICODEX_PERSONALITY_DEFAULT: &str = "";
const HICODEX_PERSONALITY_FRIENDLY: &str = "You are concise, direct, friendly, and collaborative.";
const HICODEX_PERSONALITY_PRAGMATIC: &str =
    "You are a deeply pragmatic, effective software engineer.";

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(tag = "type", rename_all = "camelCase")]
pub enum AppServerEvent {
    Json { value: Value },
    Stdout { line: String },
    Stderr { line: String },
    Lifecycle { message: String },
    Error { message: String },
}

struct AppServerProcess {
    child: Child,
    stdin: ChildStdin,
}

#[derive(Default)]
struct HostInner {
    process: Option<AppServerProcess>,
    codex_bin: Option<String>,
    codex_home: Option<String>,
    last_error: Option<String>,
    next_event_stream_id: u64,
    active_event_stream_id: Option<u64>,
}

pub struct AppServerHost {
    inner: Mutex<HostInner>,
    events_tx: Sender<AppServerEvent>,
    events_rx: Mutex<Receiver<AppServerEvent>>,
}

impl Default for AppServerHost {
    fn default() -> Self {
        Self::new()
    }
}

impl AppServerHost {
    pub fn new() -> Self {
        let (events_tx, events_rx) = mpsc::channel();
        Self {
            inner: Mutex::new(HostInner::default()),
            events_tx,
            events_rx: Mutex::new(events_rx),
        }
    }

    pub fn start(&self, config: AppServerStartConfig) -> Result<HostStatus, HostError> {
        let mut inner = self.inner.lock().expect("host mutex poisoned");
        refresh_running_state(&mut inner, &self.events_tx);
        if inner.process.is_some() {
            return Err(HostError::AlreadyRunning);
        }

        let codex_bin = resolve_codex_bin(&config);
        let codex_home = resolve_codex_home(config.codex_home.as_deref());
        if let Err(error) = fs::create_dir_all(&codex_home) {
            inner.last_error = Some(error.to_string());
            return Err(HostError::Start(error.to_string()));
        }
        if let Err(error) = ensure_default_hicodex_profile(&codex_home) {
            inner.last_error = Some(error.to_string());
            return Err(HostError::Start(error.to_string()));
        }
        if !has_codex_profile(&codex_home) {
            let _ = self.events_tx.send(AppServerEvent::Lifecycle {
                message: format!(
                    "no Codex config found in {}; add config.toml/auth.json before sending turns",
                    codex_home.to_string_lossy()
                ),
            });
        }

        let mut command = Command::new(&codex_bin);
        command
            .arg("app-server")
            .arg("--listen")
            .arg("stdio://")
            .env("CODEX_HOME", &codex_home)
            .stdin(Stdio::piped())
            .stdout(Stdio::piped())
            .stderr(Stdio::piped());

        if let Some(cwd) = config
            .codex_source_dir
            .as_deref()
            .filter(|value| !value.is_empty())
        {
            command.current_dir(cwd);
        }

        let mut child = command.spawn().map_err(|error| {
            inner.last_error = Some(error.to_string());
            HostError::Start(error.to_string())
        })?;

        let pid = child.id();
        let stdin = child
            .stdin
            .take()
            .ok_or_else(|| HostError::Start("child stdin was not captured".to_string()))?;
        if let Some(stdout) = child.stdout.take() {
            spawn_stdout_reader(stdout, self.events_tx.clone());
        }
        if let Some(stderr) = child.stderr.take() {
            spawn_stderr_reader(stderr, self.events_tx.clone());
        }

        inner.codex_bin = Some(codex_bin.to_string_lossy().to_string());
        inner.codex_home = Some(codex_home.to_string_lossy().to_string());
        inner.last_error = None;
        inner.process = Some(AppServerProcess { child, stdin });
        let _ = self.events_tx.send(AppServerEvent::Lifecycle {
            message: format!("codex app-server started with pid {pid}"),
        });

        Ok(status_from_inner(&inner))
    }

    pub fn stop(&self) -> Result<HostStatus, HostError> {
        let mut inner = self.inner.lock().expect("host mutex poisoned");
        let Some(mut process) = inner.process.take() else {
            return Err(HostError::NotRunning);
        };
        let _ = process.child.kill();
        let _ = process.child.wait();
        let _ = self.events_tx.send(AppServerEvent::Lifecycle {
            message: "codex app-server stopped".to_string(),
        });
        Ok(status_from_inner(&inner))
    }

    pub fn status(&self) -> HostStatus {
        let mut inner = self.inner.lock().expect("host mutex poisoned");
        refresh_running_state(&mut inner, &self.events_tx);
        status_from_inner(&inner)
    }

    pub fn send_json(&self, value: Value) -> Result<(), HostError> {
        let mut inner = self.inner.lock().expect("host mutex poisoned");
        refresh_running_state(&mut inner, &self.events_tx);
        let Some(process) = inner.process.as_mut() else {
            return Err(HostError::NotRunning);
        };

        let mut line = serde_json::to_string(&value)
            .map_err(|error| HostError::Serialize(error.to_string()))?;
        line.push('\n');
        process
            .stdin
            .write_all(line.as_bytes())
            .and_then(|_| process.stdin.flush())
            .map_err(|error| {
                inner.last_error = Some(error.to_string());
                HostError::Write(error.to_string())
            })
    }

    pub fn claim_event_stream(&self) -> u64 {
        let mut inner = self.inner.lock().expect("host mutex poisoned");
        inner.next_event_stream_id = inner.next_event_stream_id.saturating_add(1).max(1);
        let stream_id = inner.next_event_stream_id;
        inner.active_event_stream_id = Some(stream_id);
        stream_id
    }

    pub fn drain_events(&self, max_events: usize, stream_id: Option<u64>) -> Vec<AppServerEvent> {
        {
            let inner = self.inner.lock().expect("host mutex poisoned");
            if inner.active_event_stream_id.is_some() && inner.active_event_stream_id != stream_id {
                return Vec::new();
            }
        }

        let max_events = max_events.clamp(1, 1024);
        let rx = self.events_rx.lock().expect("host event mutex poisoned");
        let mut events = Vec::new();
        for _ in 0..max_events {
            match rx.try_recv() {
                Ok(event) => events.push(event),
                Err(_) => break,
            }
        }
        events
    }

    pub fn write_local_model_catalog(
        &self,
        codex_home: Option<String>,
        config: LocalModelCatalogConfig,
    ) -> Result<String, HostError> {
        let codex_home = resolve_codex_home(codex_home.as_deref());
        fs::create_dir_all(&codex_home).map_err(|error| HostError::Profile(error.to_string()))?;
        let models_path = codex_home.join("models.json");
        fs::write(&models_path, model_catalog_json(&config))
            .map_err(|error| HostError::Profile(error.to_string()))?;
        Ok(models_path.to_string_lossy().to_string())
    }

    pub fn read_thread_tool_history(
        &self,
        codex_home: Option<String>,
        thread_id: String,
        thread_path: Option<String>,
    ) -> Result<ThreadToolHistory, HostError> {
        read_thread_tool_history(codex_home.as_deref(), &thread_id, thread_path.as_deref())
    }
}

impl Drop for AppServerHost {
    fn drop(&mut self) {
        if let Ok(mut inner) = self.inner.lock() {
            if let Some(mut process) = inner.process.take() {
                let _ = process.child.kill();
                let _ = process.child.wait();
            }
        }
    }
}

fn status_from_inner(inner: &HostInner) -> HostStatus {
    HostStatus {
        running: inner.process.is_some(),
        pid: inner.process.as_ref().map(|process| process.child.id()),
        codex_bin: inner.codex_bin.clone(),
        codex_home: inner
            .codex_home
            .clone()
            .unwrap_or_else(|| resolve_codex_home(None).to_string_lossy().to_string()),
        default_cwd: env::current_dir()
            .ok()
            .map(|path| path.to_string_lossy().to_string()),
        last_error: inner.last_error.clone(),
    }
}

fn refresh_running_state(inner: &mut HostInner, events_tx: &Sender<AppServerEvent>) {
    let Some(process) = inner.process.as_mut() else {
        return;
    };

    match process.child.try_wait() {
        Ok(Some(status)) => {
            inner.process = None;
            let message = format!("codex app-server exited with {status}");
            inner.last_error = Some(message.clone());
            let _ = events_tx.send(AppServerEvent::Lifecycle { message });
        }
        Ok(None) => {}
        Err(error) => {
            inner.process = None;
            inner.last_error = Some(error.to_string());
            let _ = events_tx.send(AppServerEvent::Error {
                message: error.to_string(),
            });
        }
    }
}

fn spawn_stdout_reader(
    stdout: impl std::io::Read + Send + 'static,
    events_tx: Sender<AppServerEvent>,
) {
    thread::spawn(move || {
        let reader = BufReader::new(stdout);
        for line in reader.lines().map_while(Result::ok) {
            match serde_json::from_str::<Value>(&line) {
                Ok(value) => {
                    let _ = events_tx.send(AppServerEvent::Json { value });
                }
                Err(_) => {
                    let _ = events_tx.send(AppServerEvent::Stdout { line });
                }
            }
        }
    });
}

fn spawn_stderr_reader(
    stderr: impl std::io::Read + Send + 'static,
    events_tx: Sender<AppServerEvent>,
) {
    thread::spawn(move || {
        let reader = BufReader::new(stderr);
        for line in reader.lines().map_while(Result::ok) {
            let _ = events_tx.send(AppServerEvent::Stderr { line });
        }
    });
}

fn resolve_codex_bin(config: &AppServerStartConfig) -> PathBuf {
    if let Some(path) = config
        .codex_bin
        .as_deref()
        .filter(|value| !value.is_empty())
    {
        return PathBuf::from(path);
    }
    if let Ok(path) = env::var("HICODEX_CODEX_BIN") {
        if !path.trim().is_empty() {
            return PathBuf::from(path);
        }
    }

    for candidate in bundled_codex_candidates() {
        if candidate.exists() {
            return candidate;
        }
    }

    for debug_bin in LOCAL_CODEX_DEBUG_BINS.iter().map(PathBuf::from) {
        if debug_bin.exists() {
            return debug_bin;
        }
    }

    let installed_bin = PathBuf::from(INSTALLED_CODEX_BIN);
    if installed_bin.exists() {
        return installed_bin;
    }

    PathBuf::from("codex")
}

fn bundled_codex_candidates() -> Vec<PathBuf> {
    let mut candidates = Vec::new();
    if let Ok(exe) = env::current_exe() {
        if let Some(parent) = exe.parent() {
            candidates.push(parent.join("binaries").join("codex"));
            candidates.push(
                parent
                    .join("..")
                    .join("Resources")
                    .join("binaries")
                    .join("codex"),
            );
        }
    }
    if let Ok(cwd) = env::current_dir() {
        candidates.push(cwd.join("binaries").join("codex"));
        candidates.push(
            cwd.join("apps")
                .join("desktop")
                .join("src-tauri")
                .join("binaries")
                .join("codex"),
        );
    }
    candidates
}

fn resolve_codex_home(configured: Option<&str>) -> PathBuf {
    if let Some(path) = configured.filter(|value| !value.trim().is_empty()) {
        return PathBuf::from(path);
    }
    if let Ok(path) = env::var("HICODEX_CODEX_HOME") {
        if !path.trim().is_empty() {
            return PathBuf::from(path);
        }
    }

    if env_flag("HICODEX_USE_CODEX_CLI_HOME") {
        let codex_cli_home = default_codex_cli_home();
        if has_codex_profile(&codex_cli_home) {
            return codex_cli_home;
        }
    }

    default_codex_home()
}

fn default_codex_home() -> PathBuf {
    let home = env::var_os("HOME")
        .map(PathBuf::from)
        .unwrap_or_else(|| Path::new(".").to_path_buf());
    if cfg!(target_os = "macos") {
        return home
            .join("Library")
            .join("Application Support")
            .join("HiCodex")
            .join("codex-home");
    }
    home.join(".hicodex").join("codex-home")
}

fn default_codex_cli_home() -> PathBuf {
    env::var_os("HOME")
        .map(PathBuf::from)
        .unwrap_or_else(|| Path::new(".").to_path_buf())
        .join(".codex")
}

fn has_codex_profile(path: &Path) -> bool {
    path.join("auth.json").exists() || path.join("config.toml").exists()
}

fn read_thread_tool_history(
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
    collect_jsonl_files(sessions_root, thread_id, &mut candidates)?;
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
    output: &mut Vec<PathBuf>,
) -> Result<(), HostError> {
    let entries = match fs::read_dir(root) {
        Ok(entries) => entries,
        Err(error) => {
            return Err(HostError::Profile(error.to_string()));
        }
    };
    for entry in entries {
        let entry = entry.map_err(|error| HostError::Profile(error.to_string()))?;
        let path = entry.path();
        if path.is_dir() {
            collect_jsonl_files(&path, thread_id, output)?;
        } else if path
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
    current_turn_id: Option<String>,
    turn_indices: HashMap<String, usize>,
    pending_exec_calls: HashMap<String, PendingExecCall>,
    turns: Vec<ThreadToolHistoryTurn>,
}

#[derive(Debug, Clone)]
struct PendingExecCall {
    turn_index: usize,
    item_index: usize,
}

impl RolloutToolReplay {
    fn handle_rollout_line(&mut self, line_index: usize, line: &Value) {
        match line.get("type").and_then(Value::as_str) {
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
            _ => {}
        }
    }

    fn handle_response_item(&mut self, line_index: usize, payload: Option<&Value>) {
        let Some(payload) = payload else {
            return;
        };
        match payload.get("type").and_then(Value::as_str) {
            Some("function_call") => self.handle_function_call(line_index, payload),
            Some("function_call_output") => self.handle_function_call_output(payload),
            _ => {}
        }
    }

    fn handle_function_call(&mut self, line_index: usize, payload: &Value) {
        if payload.get("name").and_then(Value::as_str) != Some("exec_command") {
            return;
        }
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

    fn handle_function_call_output(&mut self, payload: &Value) {
        let Some(call_id) = payload.get("call_id").and_then(Value::as_str) else {
            return;
        };
        let Some(call) = self.pending_exec_calls.get(call_id).cloned() else {
            return;
        };
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

fn build_history_user_message_item(turn_id: &str, line_index: usize, payload: &Value) -> Value {
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

fn function_call_arguments(payload: &Value) -> Value {
    match payload.get("arguments") {
        Some(Value::String(value)) => serde_json::from_str(value).unwrap_or(Value::Null),
        Some(value) => value.clone(),
        None => Value::Null,
    }
}

fn function_output_text(value: &Value) -> String {
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

fn function_output_success(value: &Value) -> Option<bool> {
    value
        .as_object()
        .and_then(|map| map.get("success"))
        .and_then(Value::as_bool)
}

fn parse_exit_code(output: &str) -> Option<i64> {
    let marker = "Process exited with code ";
    let start = output.find(marker)? + marker.len();
    let digits = output[start..]
        .chars()
        .take_while(|value| value.is_ascii_digit() || *value == '-')
        .collect::<String>();
    digits.parse().ok()
}

fn shell_join_json_array(value: Option<&Value>) -> Option<String> {
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

fn command_execution_source_from_core(value: Option<&Value>) -> &'static str {
    match value.and_then(Value::as_str) {
        Some("user_shell") | Some("userShell") => "userShell",
        Some("unified_exec_startup") | Some("unifiedExecStartup") => "unifiedExecStartup",
        Some("unified_exec_interaction") | Some("unifiedExecInteraction") => {
            "unifiedExecInteraction"
        }
        _ => "agent",
    }
}

fn command_execution_status_from_core(value: Option<&Value>) -> &'static str {
    match value.and_then(Value::as_str) {
        Some("failed") => "failed",
        Some("declined") => "declined",
        Some("in_progress") | Some("inProgress") => "inProgress",
        _ => "completed",
    }
}

fn command_actions_from_parsed_cmd(value: Option<&Value>, cwd: &str) -> Value {
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

fn duration_ms_from_value(value: Option<&Value>) -> Option<i64> {
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

fn command_action_for_history(command: &str) -> Value {
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

fn string_value(value: Option<&Value>) -> Option<String> {
    value.and_then(Value::as_str).map(ToOwned::to_owned)
}

fn ensure_default_hicodex_profile(codex_home: &Path) -> Result<(), std::io::Error> {
    let models_path = codex_home.join("models.json");
    if !models_path.exists() {
        fs::write(&models_path, default_model_catalog_json())?;
    } else {
        ensure_local_model_catalog_messages(&models_path)?;
    }

    let config_path = codex_home.join("config.toml");
    if !config_path.exists() {
        fs::write(&config_path, default_config_toml(&models_path))?;
        return Ok(());
    }

    let config = fs::read_to_string(&config_path)?;
    let top_level = missing_top_level_model_config(&config, &models_path);
    if top_level.is_empty() {
        return Ok(());
    }

    fs::write(&config_path, insert_top_level_toml(&config, &top_level))?;
    Ok(())
}

fn ensure_local_model_catalog_messages(models_path: &Path) -> Result<(), std::io::Error> {
    let config = fs::read_to_string(models_path)?;
    let Ok(mut catalog) = serde_json::from_str::<Value>(&config) else {
        return Ok(());
    };
    let Some(models) = catalog.get_mut("models").and_then(Value::as_array_mut) else {
        return Ok(());
    };

    let mut changed = false;
    for model in models {
        if !matches!(model.get("slug"), Some(Value::String(_))) {
            continue;
        }
        if model.get("model_messages").is_none()
            || model.get("model_messages") == Some(&Value::Null)
        {
            model["model_messages"] = hicodex_model_messages_json();
            changed = true;
        }
        if matches!(
            model.get("base_instructions"),
            Some(Value::String(value)) if value == "You are Codex, a coding agent. Help the user work in the local workspace."
        ) {
            model["base_instructions"] = Value::String(HICODEX_BASE_INSTRUCTIONS.to_string());
            changed = true;
        }
        if is_legacy_default_text_only_model(model) {
            model["input_modalities"] = json!(default_input_modalities_json());
            changed = true;
        }
    }

    if changed {
        fs::write(
            models_path,
            serde_json::to_string_pretty(&catalog)
                .expect("local model catalog should serialize after model message refresh"),
        )?;
    }
    Ok(())
}

fn missing_top_level_model_config(config: &str, models_path: &Path) -> String {
    let mut lines = Vec::new();
    if !has_top_level_toml_key(config, "instructions") {
        lines.push(format!(
            "instructions = {}",
            toml_multiline_literal(HICODEX_BASE_INSTRUCTIONS)
        ));
    }
    if !has_top_level_toml_key(config, "personality") {
        lines.push("personality = \"pragmatic\"".to_string());
    }
    if !config.contains("model_catalog_json") {
        lines.push(format!(
            "model_catalog_json = {}",
            toml_string(&models_path.to_string_lossy())
        ));
    }
    if !config.contains("model_context_window") {
        lines.push("model_context_window = 262144".to_string());
    }
    if !config.contains("model_auto_compact_token_limit") {
        lines.push("model_auto_compact_token_limit = 235929".to_string());
    }
    if !config.contains("model_reasoning_summary") {
        lines.push("model_reasoning_summary = \"none\"".to_string());
    }
    if lines.is_empty() {
        String::new()
    } else {
        format!("{}\n", lines.join("\n"))
    }
}

fn has_top_level_toml_key(config: &str, key: &str) -> bool {
    for line in config.lines() {
        let trimmed = line.trim();
        if trimmed.starts_with('[') {
            return false;
        }
        if trimmed.is_empty() || trimmed.starts_with('#') {
            continue;
        }
        let Some((name, _value)) = trimmed.split_once('=') else {
            continue;
        };
        if name.trim() == key {
            return true;
        }
    }
    false
}

fn insert_top_level_toml(config: &str, addition: &str) -> String {
    if let Some(index) = config.find("\n[") {
        let (head, tail) = config.split_at(index + 1);
        return format!("{head}{addition}\n{tail}");
    }
    let separator = if config.ends_with('\n') { "" } else { "\n" };
    format!("{config}{separator}{addition}")
}

fn default_config_toml(models_path: &Path) -> String {
    let api_key = env::var("HICODEX_LOCAL_API_KEY").unwrap_or_else(|_| "haichao".to_string());
    format!(
        r#"model = "Qwen3.6-27B-mxfp4"
model_provider = "hicodex_local"
personality = "pragmatic"
instructions = {instructions}
model_catalog_json = {models_path}
model_context_window = 262144
model_auto_compact_token_limit = 235929
model_reasoning_summary = "none"

[model_providers.hicodex_local]
name = "HiCodex local gateway"
base_url = "http://127.0.0.1:8890/v1"
wire_api = "responses"
requires_openai_auth = false
supports_websockets = false
experimental_bearer_token = {api_key}
"#,
        models_path = toml_string(&models_path.to_string_lossy()),
        instructions = toml_multiline_literal(HICODEX_BASE_INSTRUCTIONS),
        api_key = toml_string(&api_key),
    )
}

fn default_model_catalog_json() -> String {
    model_catalog_json(&LocalModelCatalogConfig {
        model: "Qwen3.6-27B-mxfp4".to_string(),
        display_name: Some("Qwen3.6 27B MXFP4".to_string()),
        description: Some("Local OpenAI-compatible coding model via HiCodex gateway.".to_string()),
        context_window: Some(262144),
        auto_compact_token_limit: Some(235929),
        input_modalities: Some(default_input_modalities_json()),
    })
}

fn model_catalog_json(config: &LocalModelCatalogConfig) -> String {
    let model = if config.model.trim().is_empty() {
        "Qwen3.6-27B-mxfp4"
    } else {
        config.model.trim()
    };
    let context_window = config.context_window.unwrap_or(262144);
    let auto_compact_token_limit = config
        .auto_compact_token_limit
        .unwrap_or((context_window as f64 * 0.9) as u64);
    let display_name = config
        .display_name
        .as_deref()
        .filter(|value| !value.trim().is_empty())
        .unwrap_or(model);
    let description = config
        .description
        .as_deref()
        .filter(|value| !value.trim().is_empty())
        .unwrap_or("Local OpenAI-compatible coding model via HiCodex gateway.");
    let input_modalities = normalize_input_modalities(config.input_modalities.as_deref());

    serde_json::to_string_pretty(&json!({
        "models": [
            {
                "slug": model,
                "display_name": display_name,
                "description": description,
                "default_reasoning_level": null,
                "supported_reasoning_levels": [],
                "shell_type": "shell_command",
                "visibility": "list",
                "supported_in_api": true,
                "priority": 0,
                "additional_speed_tiers": [],
                "service_tiers": [],
                "availability_nux": null,
                "upgrade": null,
                "base_instructions": HICODEX_BASE_INSTRUCTIONS,
                "model_messages": hicodex_model_messages_json(),
                "supports_reasoning_summaries": false,
                "default_reasoning_summary": "none",
                "support_verbosity": false,
                "default_verbosity": null,
                "apply_patch_tool_type": "freeform",
                "web_search_tool_type": "text",
                "truncation_policy": { "mode": "tokens", "limit": 10000 },
                "supports_parallel_tool_calls": true,
                "supports_image_detail_original": false,
                "context_window": context_window,
                "max_context_window": context_window,
                "auto_compact_token_limit": auto_compact_token_limit,
                "effective_context_window_percent": 95,
                "experimental_supported_tools": [],
                "input_modalities": input_modalities,
                "supports_search_tool": false
            }
        ]
    }))
    .expect("default model catalog should serialize")
}

fn default_input_modalities_json() -> Vec<String> {
    vec!["text".to_string(), "image".to_string()]
}

fn normalize_input_modalities(input_modalities: Option<&[String]>) -> Vec<String> {
    let mut normalized = Vec::new();
    let default_modalities;
    let modalities = match input_modalities {
        Some(input_modalities) => input_modalities,
        None => {
            default_modalities = default_input_modalities_json();
            &default_modalities
        }
    };
    for modality in modalities {
        match modality.as_str() {
            "text" if !normalized.iter().any(|value| value == "text") => {
                normalized.push("text".to_string());
            }
            "image" if !normalized.iter().any(|value| value == "image") => {
                normalized.push("image".to_string());
            }
            _ => {}
        }
    }
    if !normalized.iter().any(|value| value == "text") {
        normalized.insert(0, "text".to_string());
    }
    normalized
}

fn is_legacy_default_text_only_model(model: &Value) -> bool {
    if model.get("slug").and_then(Value::as_str) != Some("Qwen3.6-27B-mxfp4") {
        return false;
    }
    if model.get("description").and_then(Value::as_str)
        != Some("Local OpenAI-compatible coding model via HiCodex gateway.")
    {
        return false;
    }
    let Some(input_modalities) = model.get("input_modalities").and_then(Value::as_array) else {
        return false;
    };
    input_modalities.len() == 1
        && input_modalities
            .first()
            .and_then(Value::as_str)
            .is_some_and(|value| value == "text")
}

fn hicodex_model_messages_json() -> Value {
    json!({
        "instructions_template": format!(
            "{}\n\n{}\n\n{}",
            HICODEX_MODEL_INSTRUCTIONS_HEADER,
            HICODEX_PERSONALITY_PLACEHOLDER,
            HICODEX_BASE_INSTRUCTIONS,
        ),
        "instructions_variables": {
            "personality_default": HICODEX_PERSONALITY_DEFAULT,
            "personality_friendly": HICODEX_PERSONALITY_FRIENDLY,
            "personality_pragmatic": HICODEX_PERSONALITY_PRAGMATIC,
        }
    })
}

fn toml_string(value: &str) -> String {
    format!("\"{}\"", value.replace('\\', "\\\\").replace('"', "\\\""))
}

fn toml_multiline_literal(value: &str) -> String {
    format!("'''\n{}\n'''", value.replace("'''", ""))
}

fn env_flag(name: &str) -> bool {
    env::var(name)
        .map(|value| matches!(value.as_str(), "1" | "true" | "TRUE" | "yes" | "YES"))
        .unwrap_or(false)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn default_home_is_namespaced() {
        let home = default_codex_home().to_string_lossy().to_string();
        assert!(home.contains("HiCodex") || home.contains(".hicodex"));
        assert!(home.ends_with("codex-home"));
    }

    #[test]
    fn parses_json_stdout_as_event() {
        let value: Value = serde_json::json!({"id": 1, "result": {}});
        let line = serde_json::to_string(&value).unwrap();
        let parsed: Value = serde_json::from_str(&line).unwrap();
        assert_eq!(parsed["id"], 1);
    }

    #[test]
    fn claimed_event_stream_blocks_legacy_drainers() {
        let host = AppServerHost::new();
        let stream_id = host.claim_event_stream();
        host.events_tx
            .send(AppServerEvent::Lifecycle {
                message: "ready".to_string(),
            })
            .unwrap();

        assert!(host.drain_events(10, None).is_empty());
        let events = host.drain_events(10, Some(stream_id));
        assert_eq!(events.len(), 1);
    }

    #[test]
    fn bootstraps_model_catalog_config() {
        let dir = env::temp_dir().join(format!("hicodex-host-test-{}", std::process::id()));
        let _ = fs::remove_dir_all(&dir);
        fs::create_dir_all(&dir).unwrap();

        ensure_default_hicodex_profile(&dir).unwrap();

        let config = fs::read_to_string(dir.join("config.toml")).unwrap();
        assert!(config.contains("model_catalog_json"));
        assert!(config.contains("Qwen3.6-27B-mxfp4"));
        assert!(config.contains("personality = \"pragmatic\""));
        assert!(config.contains(HICODEX_BASE_INSTRUCTIONS));
        let catalog = fs::read_to_string(dir.join("models.json")).unwrap();
        assert!(catalog.contains("\"model_messages\""));
        assert!(catalog.contains(HICODEX_PERSONALITY_PLACEHOLDER));
        assert!(catalog.contains("\"image\""));

        let _ = fs::remove_dir_all(&dir);
    }

    #[test]
    fn refreshes_legacy_model_catalog_messages() {
        let dir = env::temp_dir().join(format!("hicodex-host-refresh-test-{}", std::process::id()));
        let _ = fs::remove_dir_all(&dir);
        fs::create_dir_all(&dir).unwrap();
        let models_path = dir.join("models.json");
        fs::write(
            &models_path,
            r#"{"models":[{"slug":"Qwen3.6-27B-mxfp4","display_name":"Qwen","description":"Local OpenAI-compatible coding model via HiCodex gateway.","base_instructions":"You are Codex, a coding agent. Help the user work in the local workspace.","input_modalities":["text"]}]}"#,
        )
        .unwrap();
        fs::write(dir.join("config.toml"), default_config_toml(&models_path)).unwrap();

        ensure_default_hicodex_profile(&dir).unwrap();

        let config = fs::read_to_string(dir.join("config.toml")).unwrap();
        assert_eq!(config.matches("instructions =").count(), 1);
        let catalog = fs::read_to_string(models_path).unwrap();
        let value: Value = serde_json::from_str(&catalog).unwrap();
        let model = &value["models"][0];
        assert!(model.get("model_messages").is_some());
        assert_eq!(
            model["base_instructions"].as_str(),
            Some(HICODEX_BASE_INSTRUCTIONS)
        );
        assert_eq!(model["input_modalities"][0].as_str(), Some("text"));
        assert_eq!(model["input_modalities"][1].as_str(), Some("image"));

        let _ = fs::remove_dir_all(&dir);
    }

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
}
