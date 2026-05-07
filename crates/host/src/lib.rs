use serde::{Deserialize, Serialize};
use serde_json::{json, Value};
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
}

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

fn ensure_default_hicodex_profile(codex_home: &Path) -> Result<(), std::io::Error> {
    let models_path = codex_home.join("models.json");
    if !models_path.exists() {
        fs::write(&models_path, default_model_catalog_json())?;
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

fn missing_top_level_model_config(config: &str, models_path: &Path) -> String {
    let mut lines = Vec::new();
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
                "base_instructions": "You are Codex, a coding agent. Help the user work in the local workspace.",
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
                "input_modalities": ["text"],
                "supports_search_tool": false
            }
        ]
    }))
    .expect("default model catalog should serialize")
}

fn toml_string(value: &str) -> String {
    format!("\"{}\"", value.replace('\\', "\\\\").replace('"', "\\\""))
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
        assert!(dir.join("models.json").exists());

        let _ = fs::remove_dir_all(&dir);
    }
}
