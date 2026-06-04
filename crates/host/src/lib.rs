use base64::engine::general_purpose::URL_SAFE_NO_PAD;
use base64::Engine;
use serde::{Deserialize, Serialize};
use serde_json::{json, Value};
use std::collections::HashMap;
use std::env;
use std::fs;
use std::io::{BufRead, BufReader, Read, Seek, SeekFrom, Write};
use std::path::{Path, PathBuf};
use std::process::{Child, ChildStdin, Command, Stdio};
use std::sync::mpsc::{self, Receiver, Sender};
use std::sync::Arc;
use std::sync::Mutex;
use std::thread;
use std::time::{SystemTime, UNIX_EPOCH};
use thiserror::Error;

#[cfg(unix)]
use std::os::unix::fs::{OpenOptionsExt, PermissionsExt};

#[cfg(target_os = "macos")]
use std::os::raw::c_uchar;

#[cfg(target_os = "macos")]
#[link(name = "CoreGraphics", kind = "framework")]
unsafe extern "C" {
    fn CGPreflightScreenCaptureAccess() -> bool;
}

#[cfg(target_os = "macos")]
#[link(name = "ApplicationServices", kind = "framework")]
unsafe extern "C" {
    fn AXIsProcessTrusted() -> c_uchar;
}

const INSTALLED_CODEX_BIN: &str = "/Applications/Codex.app/Contents/Resources/codex";
const INSTALLATION_ID_FILENAME: &str = "installation_id";
const OPENAI_BUNDLED_MARKETPLACE_NAME: &str = "openai-bundled";
const OPENAI_BUNDLED_BROWSER_PLUGIN_ID: &str = "browser@openai-bundled";
const OPENAI_BUNDLED_COMPUTER_USE_PLUGIN_NAME: &str = "computer-use";
const COMPUTER_USE_APP_NAME: &str = "Codex Computer Use.app";
const COMPUTER_USE_INSTALLER_APP_NAME: &str = "Codex Computer Use Installer.app";
const COMPUTER_USE_MCP_CLIENT_RELATIVE: &[&str] = &[
    "Codex Computer Use.app",
    "Contents",
    "SharedSupport",
    "SkyComputerUseClient.app",
    "Contents",
    "MacOS",
    "SkyComputerUseClient",
];
const COMPUTER_USE_INSTALLER_RELATIVE: &[&str] = &[
    "Codex Computer Use.app",
    "Contents",
    "SharedSupport",
    COMPUTER_USE_INSTALLER_APP_NAME,
];
const COMPUTER_USE_MCP_CONFIG_FILENAME: &str = ".mcp.json";

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
    #[error("failed to read or initialize installation id: {0}")]
    Installation(String),
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
    pub installation_id: Option<String>,
    pub first_launch: Option<bool>,
    pub default_cwd: Option<String>,
    pub last_error: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct HostInstallationState {
    pub installation_id: String,
    pub first_launch: bool,
    pub installation_id_path: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct LocalModelCatalogConfig {
    pub model: String,
    pub models: Option<Vec<String>>,
    pub display_name: Option<String>,
    pub description: Option<String>,
    pub context_window: Option<u64>,
    pub auto_compact_token_limit: Option<u64>,
    pub input_modalities: Option<Vec<String>>,
}

#[derive(Debug, Clone, Serialize, Deserialize, Default)]
#[serde(rename_all = "camelCase")]
pub struct CodexAuthSummary {
    pub has_auth_file: bool,
    pub auth_mode: Option<String>,
    pub has_api_key: bool,
    pub has_tokens: bool,
    pub email: Option<String>,
    pub plan_type: Option<String>,
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

#[derive(Debug, Clone, Serialize, Deserialize, Default)]
#[serde(rename_all = "camelCase")]
pub struct ComputerUseReadiness {
    pub helper_available: bool,
    pub helper_app_path: Option<String>,
    pub helper_signature_valid: Option<bool>,
    pub helper_signature_status: Option<String>,
    pub mcp_client_path: Option<String>,
    pub mcp_config_path: Option<String>,
    pub mcp_command: Option<String>,
    pub mcp_command_path: Option<String>,
    pub mcp_cwd: Option<String>,
    pub mcp_config_trusted: Option<bool>,
    pub mcp_config_status: Option<String>,
    pub mcp_command_executable: Option<bool>,
    pub mcp_client_signature_valid: Option<bool>,
    pub mcp_client_signature_status: Option<String>,
    pub installer_app_path: Option<String>,
    pub plugin_root_path: Option<String>,
    pub source: Option<String>,
    pub repair_source_available: bool,
    pub repair_source_path: Option<String>,
    pub repair_status: Option<String>,
    pub candidates: Vec<ComputerUseBundleCandidate>,
    pub screen_recording_status: Option<String>,
    pub accessibility_status: Option<String>,
    pub app_approvals_status: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize, Default)]
#[serde(rename_all = "camelCase")]
pub struct ComputerUseRepairResult {
    pub repaired: bool,
    pub source_path: Option<String>,
    pub installed_path: Option<String>,
    pub message: String,
    pub readiness: ComputerUseReadiness,
}

#[derive(Debug, Clone, Serialize, Deserialize, Default)]
#[serde(rename_all = "camelCase")]
pub struct ComputerUseBundleCandidate {
    pub source: String,
    pub plugin_root_path: String,
    pub helper_app_path: Option<String>,
    pub helper_signature_valid: Option<bool>,
    pub helper_signature_status: Option<String>,
    pub mcp_client_path: Option<String>,
    pub mcp_config_path: Option<String>,
    pub mcp_command: Option<String>,
    pub mcp_command_path: Option<String>,
    pub mcp_cwd: Option<String>,
    pub mcp_config_trusted: Option<bool>,
    pub mcp_config_status: Option<String>,
    pub mcp_command_executable: Option<bool>,
    pub mcp_client_signature_valid: Option<bool>,
    pub mcp_client_signature_status: Option<String>,
    pub installer_app_path: Option<String>,
    pub installer_signature_valid: Option<bool>,
    pub installer_signature_status: Option<String>,
    pub usable_for_repair: bool,
}

const HICODEX_PERSONALITY_PLACEHOLDER: &str = "{{ personality }}";
const HICODEX_MODEL_INSTRUCTIONS_HEADER: &str = include_str!("../assets/instructions/header.md");
const HICODEX_BASE_INSTRUCTIONS: &str = include_str!("../assets/instructions/base.md");
const HICODEX_PERSONALITY_DEFAULT: &str = "";
const HICODEX_PERSONALITY_FRIENDLY: &str =
    include_str!("../assets/instructions/personality-friendly.md");
const HICODEX_PERSONALITY_PRAGMATIC: &str =
    include_str!("../assets/instructions/personality-pragmatic.md");

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
    installation_codex_home: Option<String>,
    installation_id: Option<String>,
    first_launch: Option<bool>,
    last_error: Option<String>,
    event_forwarder_started: bool,
}

pub struct AppServerHost {
    inner: Mutex<HostInner>,
    events_tx: Sender<AppServerEvent>,
    events_rx: Arc<Mutex<Receiver<AppServerEvent>>>,
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
            events_rx: Arc::new(Mutex::new(events_rx)),
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
        let installation_state = match read_or_init_installation_state_at(&codex_home) {
            Ok(state) => state,
            Err(error) => {
                inner.last_error = Some(error.to_string());
                return Err(HostError::Start(error.to_string()));
            }
        };
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
        store_installation_state(&mut inner, &codex_home, installation_state);
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
        if let Err(error) = refresh_installation_state(&mut inner) {
            inner.last_error = Some(error.to_string());
        }
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

    pub fn forward_events<F>(&self, forward: F) -> bool
    where
        F: Fn(AppServerEvent) + Send + 'static,
    {
        {
            let mut inner = self.inner.lock().expect("host mutex poisoned");
            if inner.event_forwarder_started {
                return false;
            }
            inner.event_forwarder_started = true;
        }

        let rx = Arc::clone(&self.events_rx);
        thread::spawn(move || loop {
            let event = {
                let receiver = rx.lock().expect("host event mutex poisoned");
                receiver.recv()
            };
            match event {
                Ok(event) => forward(event),
                Err(_) => break,
            }
        });
        true
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

    pub fn read_codex_auth_summary(
        &self,
        codex_home: Option<String>,
    ) -> Result<CodexAuthSummary, HostError> {
        read_codex_auth_summary(codex_home.as_deref())
    }

    pub fn read_or_init_installation_state(
        &self,
        codex_home: Option<String>,
    ) -> Result<HostInstallationState, HostError> {
        let codex_home = match codex_home
            .as_deref()
            .map(str::trim)
            .filter(|value| !value.is_empty())
        {
            Some(path) => PathBuf::from(path),
            None => {
                let inner = self.inner.lock().expect("host mutex poisoned");
                codex_home_from_inner(&inner)
            }
        };
        let state = read_or_init_installation_state_at(&codex_home)?;
        let mut inner = self.inner.lock().expect("host mutex poisoned");
        store_installation_state(&mut inner, &codex_home, state.clone());
        Ok(state)
    }

    pub fn read_thread_tool_history(
        &self,
        codex_home: Option<String>,
        thread_id: String,
        thread_path: Option<String>,
    ) -> Result<ThreadToolHistory, HostError> {
        read_thread_tool_history(codex_home.as_deref(), &thread_id, thread_path.as_deref())
    }

    pub fn read_computer_use_readiness(
        &self,
        codex_home: Option<String>,
    ) -> Result<ComputerUseReadiness, HostError> {
        let codex_home = match codex_home
            .as_deref()
            .map(str::trim)
            .filter(|value| !value.is_empty())
        {
            Some(path) => PathBuf::from(path),
            None => {
                let inner = self.inner.lock().expect("host mutex poisoned");
                codex_home_from_inner(&inner)
            }
        };
        Ok(read_computer_use_readiness_at(
            &codex_home,
            &default_codex_cli_home(),
        ))
    }

    pub fn repair_computer_use_bundle(
        &self,
        codex_home: Option<String>,
    ) -> Result<ComputerUseRepairResult, HostError> {
        let codex_home = match codex_home
            .as_deref()
            .map(str::trim)
            .filter(|value| !value.is_empty())
        {
            Some(path) => PathBuf::from(path),
            None => {
                let inner = self.inner.lock().expect("host mutex poisoned");
                codex_home_from_inner(&inner)
            }
        };
        repair_computer_use_bundle_at(&codex_home, &default_codex_cli_home())
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
    let codex_home = codex_home_from_inner(inner);
    HostStatus {
        running: inner.process.is_some(),
        pid: inner.process.as_ref().map(|process| process.child.id()),
        codex_bin: inner.codex_bin.clone(),
        codex_home: codex_home.to_string_lossy().to_string(),
        installation_id: inner.installation_id.clone(),
        first_launch: inner.first_launch,
        default_cwd: resolve_default_cwd(),
        last_error: inner.last_error.clone(),
    }
}

/// Codex Desktop 桌面版的 `defaultCwd` 是用户的工作目录（通常 home），用于
/// 在没有 thread-bound workspace 时给前端 path resolution 一个有意义的 base。
/// HiCodex 之前用 `env::current_dir()`——Tauri dev 模式下进程 CWD 是
/// `apps/desktop/src-tauri/`（cargo run 从这里启动），完全不是用户工作目录，
/// 导致前端拼相对路径（model 输出的 file ref）变成 `apps/desktop/src-tauri/xxx`，
/// 实际不存在。修复策略：
///   1. 优先用 `$HOME` (Unix) / `$USERPROFILE` (Windows) 环境变量
///   2. fallback 到 `env::current_dir()`，但拒绝明显是 src-tauri 进程目录的路径
///
/// 这与 Codex Electron 应用的 `defaultCwd` 语义一致——指向用户的"默认工作位置"
/// 而非应用自己的进程 CWD。
fn resolve_default_cwd() -> Option<String> {
    if let Ok(home) = env::var("HOME") {
        let trimmed = home.trim();
        if !trimmed.is_empty() {
            return Some(trimmed.to_string());
        }
    }
    if let Ok(profile) = env::var("USERPROFILE") {
        let trimmed = profile.trim();
        if !trimmed.is_empty() {
            return Some(trimmed.to_string());
        }
    }
    env::current_dir().ok().and_then(|path| {
        let display = path.to_string_lossy().to_string();
        // sanity check：拒绝 src-tauri / target / node_modules 这种明显非用户 workspace 的路径。
        let lower = display.to_ascii_lowercase();
        if lower.ends_with("/src-tauri")
            || lower.contains("/src-tauri/")
            || lower.contains("/node_modules/")
            || lower.contains("/target/")
        {
            return None;
        }
        Some(display)
    })
}

fn codex_home_from_inner(inner: &HostInner) -> PathBuf {
    inner
        .codex_home
        .as_deref()
        .map(PathBuf::from)
        .unwrap_or_else(|| resolve_codex_home(None))
}

fn refresh_installation_state(inner: &mut HostInner) -> Result<(), HostError> {
    let codex_home = codex_home_from_inner(inner);
    let codex_home_string = codex_home.to_string_lossy().to_string();
    if inner.installation_id.is_some()
        && inner.installation_codex_home.as_deref() == Some(codex_home_string.as_str())
    {
        return Ok(());
    }

    let state = read_or_init_installation_state_at(&codex_home)?;
    store_installation_state(inner, &codex_home, state);
    Ok(())
}

fn store_installation_state(
    inner: &mut HostInner,
    codex_home: &Path,
    state: HostInstallationState,
) {
    let codex_home_string = codex_home.to_string_lossy().to_string();
    let same_home = inner.installation_codex_home.as_deref() == Some(codex_home_string.as_str());
    let session_first_launch = same_home && inner.first_launch == Some(true);
    inner.installation_codex_home = Some(codex_home_string);
    inner.installation_id = Some(state.installation_id);
    inner.first_launch = Some(session_first_launch || state.first_launch);
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
        let _ = events_tx.send(AppServerEvent::Lifecycle {
            message: "codex app-server stdout closed".to_string(),
        });
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

    let installed_bin = PathBuf::from(INSTALLED_CODEX_BIN);
    if installed_bin.exists() {
        return installed_bin;
    }

    PathBuf::from("codex")
}

fn bundled_codex_candidates() -> Vec<PathBuf> {
    // Windows 上 sidecar 是 `codex.exe`，其它平台是 `codex`。
    let bin_name = format!("codex{}", std::env::consts::EXE_SUFFIX);
    let mut candidates = Vec::new();
    if let Ok(exe) = env::current_exe() {
        if let Some(parent) = exe.parent() {
            candidates.push(parent.join("binaries").join(&bin_name));
            candidates.push(
                parent
                    .join("..")
                    .join("Resources")
                    .join("binaries")
                    .join(&bin_name),
            );
        }
    }
    if let Ok(cwd) = env::current_dir() {
        candidates.push(cwd.join("binaries").join(&bin_name));
        candidates.push(
            cwd.join("apps")
                .join("desktop")
                .join("src-tauri")
                .join("binaries")
                .join(&bin_name),
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

/// 用户 home 目录：Unix 取 `$HOME`，Windows 取 `$USERPROFILE`。
/// 与 `resolve_default_cwd` 的解析顺序保持一致，避免 Windows 上 `$HOME` 缺失时
/// 退化到进程 CWD（会把 codex-home 落到 `./.hicodex` 这种错误位置）。
fn user_home_dir() -> Option<PathBuf> {
    if let Some(home) = env::var_os("HOME").filter(|value| !value.is_empty()) {
        return Some(PathBuf::from(home));
    }
    if let Some(profile) = env::var_os("USERPROFILE").filter(|value| !value.is_empty()) {
        return Some(PathBuf::from(profile));
    }
    None
}

fn default_codex_home() -> PathBuf {
    let home = user_home_dir().unwrap_or_else(|| Path::new(".").to_path_buf());
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
    user_home_dir()
        .unwrap_or_else(|| Path::new(".").to_path_buf())
        .join(".codex")
}

fn has_codex_profile(path: &Path) -> bool {
    path.join("auth.json").exists() || path.join("config.toml").exists()
}

fn read_or_init_installation_state_at(
    codex_home: &Path,
) -> Result<HostInstallationState, HostError> {
    fs::create_dir_all(codex_home).map_err(|error| HostError::Installation(error.to_string()))?;
    let path = codex_home.join(INSTALLATION_ID_FILENAME);
    let mut options = fs::OpenOptions::new();
    options.read(true).write(true).create(true);
    #[cfg(unix)]
    {
        options.mode(0o644);
    }

    let mut file = options
        .open(&path)
        .map_err(|error| HostError::Installation(error.to_string()))?;

    #[cfg(unix)]
    {
        let metadata = file
            .metadata()
            .map_err(|error| HostError::Installation(error.to_string()))?;
        let current_mode = metadata.permissions().mode() & 0o777;
        if current_mode != 0o644 {
            let mut permissions = metadata.permissions();
            permissions.set_mode(0o644);
            file.set_permissions(permissions)
                .map_err(|error| HostError::Installation(error.to_string()))?;
        }
    }

    let mut contents = String::new();
    file.read_to_string(&mut contents)
        .map_err(|error| HostError::Installation(error.to_string()))?;
    if let Some(existing) = canonical_installation_uuid(contents.trim()) {
        return Ok(HostInstallationState {
            installation_id: existing,
            first_launch: false,
            installation_id_path: path.to_string_lossy().to_string(),
        });
    }

    let installation_id = new_installation_uuid();
    file.set_len(0)
        .map_err(|error| HostError::Installation(error.to_string()))?;
    file.seek(SeekFrom::Start(0))
        .map_err(|error| HostError::Installation(error.to_string()))?;
    file.write_all(installation_id.as_bytes())
        .map_err(|error| HostError::Installation(error.to_string()))?;
    file.flush()
        .map_err(|error| HostError::Installation(error.to_string()))?;
    file.sync_all()
        .map_err(|error| HostError::Installation(error.to_string()))?;

    Ok(HostInstallationState {
        installation_id,
        first_launch: true,
        installation_id_path: path.to_string_lossy().to_string(),
    })
}

fn canonical_installation_uuid(value: &str) -> Option<String> {
    let trimmed = value.trim();
    if trimmed.len() != 36 {
        return None;
    }
    for (index, ch) in trimmed.chars().enumerate() {
        let is_hyphen = matches!(index, 8 | 13 | 18 | 23);
        if is_hyphen {
            if ch != '-' {
                return None;
            }
        } else if !ch.is_ascii_hexdigit() {
            return None;
        }
    }
    Some(trimmed.to_ascii_lowercase())
}

fn new_installation_uuid() -> String {
    let mut bytes = [0_u8; 16];
    if fill_random_bytes(&mut bytes).is_err() {
        fill_fallback_bytes(&mut bytes);
    }
    bytes[6] = (bytes[6] & 0x0f) | 0x40;
    bytes[8] = (bytes[8] & 0x3f) | 0x80;
    format!(
        "{:02x}{:02x}{:02x}{:02x}-{:02x}{:02x}-{:02x}{:02x}-{:02x}{:02x}-{:02x}{:02x}{:02x}{:02x}{:02x}{:02x}",
        bytes[0],
        bytes[1],
        bytes[2],
        bytes[3],
        bytes[4],
        bytes[5],
        bytes[6],
        bytes[7],
        bytes[8],
        bytes[9],
        bytes[10],
        bytes[11],
        bytes[12],
        bytes[13],
        bytes[14],
        bytes[15],
    )
}

fn fill_random_bytes(bytes: &mut [u8]) -> std::io::Result<()> {
    let mut file = fs::File::open("/dev/urandom")?;
    file.read_exact(bytes)
}

fn fill_fallback_bytes(bytes: &mut [u8]) {
    let nanos = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|value| value.as_nanos() as u64)
        .unwrap_or_default();
    let mut state = nanos ^ ((std::process::id() as u64) << 32) ^ (bytes.as_ptr() as usize as u64);
    for byte in bytes {
        state ^= state << 13;
        state ^= state >> 7;
        state ^= state << 17;
        *byte = (state & 0xff) as u8;
    }
}

fn read_codex_auth_summary(codex_home: Option<&str>) -> Result<CodexAuthSummary, HostError> {
    let auth_path = resolve_codex_home(codex_home).join("auth.json");
    if !auth_path.exists() {
        return Ok(CodexAuthSummary::default());
    }
    let contents =
        fs::read_to_string(&auth_path).map_err(|error| HostError::Profile(error.to_string()))?;
    let value: Value = serde_json::from_str(&contents)
        .map_err(|error| HostError::Profile(format!("failed to parse auth.json: {error}")))?;
    Ok(summarize_codex_auth_value(&value))
}

fn summarize_codex_auth_value(value: &Value) -> CodexAuthSummary {
    let token_claims = auth_jwt_claims(
        value
            .get("tokens")
            .and_then(|tokens| tokens.get("id_token")),
    );
    let agent_claims = auth_jwt_claims(value.get("agent_identity"));
    let email = token_claims
        .as_ref()
        .and_then(|claims| claims.email.clone())
        .or_else(|| {
            agent_claims
                .as_ref()
                .and_then(|claims| claims.email.clone())
        });
    let plan_type = token_claims
        .as_ref()
        .and_then(|claims| claims.plan_type.clone())
        .or_else(|| {
            agent_claims
                .as_ref()
                .and_then(|claims| claims.plan_type.clone())
        });
    CodexAuthSummary {
        has_auth_file: true,
        auth_mode: string_value(value.get("auth_mode"))
            .or_else(|| string_value(value.get("authMode")))
            .or_else(|| string_value(value.get("mode")))
            .or_else(|| string_value(value.get("type"))),
        has_api_key: auth_value_present(value.get("OPENAI_API_KEY"))
            || auth_value_present(value.get("openai_api_key"))
            || auth_value_present(value.get("api_key")),
        has_tokens: auth_value_present(value.get("tokens"))
            || auth_value_present(value.get("OPENAI_CHATGPT_ACCOUNT"))
            || auth_value_present(value.get("refresh_token"))
            || auth_value_present(value.get("chatgpt_token"))
            || auth_value_present(value.get("agent_identity")),
        email,
        plan_type,
    }
}

#[derive(Debug, Clone)]
struct AuthJwtClaims {
    email: Option<String>,
    plan_type: Option<String>,
}

fn auth_jwt_claims(value: Option<&Value>) -> Option<AuthJwtClaims> {
    let jwt = value.and_then(Value::as_str)?.trim();
    if jwt.is_empty() {
        return None;
    }
    let payload = decode_jwt_payload(jwt)?;
    let email = string_value(payload.get("email")).or_else(|| {
        payload
            .get("https://api.openai.com/profile")
            .and_then(|profile| string_value(profile.get("email")))
    });
    let plan_type = payload
        .get("https://api.openai.com/auth")
        .and_then(|auth| string_value(auth.get("chatgpt_plan_type")))
        .or_else(|| string_value(payload.get("plan_type")));
    Some(AuthJwtClaims { email, plan_type })
}

fn decode_jwt_payload(jwt: &str) -> Option<Value> {
    let payload = jwt.split('.').nth(1)?;
    let bytes = URL_SAFE_NO_PAD.decode(payload).ok()?;
    serde_json::from_slice(&bytes).ok()
}

fn auth_value_present(value: Option<&Value>) -> bool {
    match value {
        Some(Value::String(value)) => !value.trim().is_empty(),
        Some(Value::Array(value)) => !value.is_empty(),
        Some(Value::Object(value)) => !value.is_empty(),
        Some(Value::Bool(value)) => *value,
        Some(Value::Number(_)) => true,
        _ => false,
    }
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

/// Convert a Codex core `AgentStatus` payload (rollout JSONL) to the
/// camelCase `CollabAgentState` shape that the UI expects on
/// `collabAgentToolCall.agentsStates`.
///
/// Core serialization is `#[serde(rename_all = "snake_case")]` with default
/// (external) tagging:
///   - Unit variants -> bare strings, e.g. `"running"` / `"pending_init"`.
///   - Tuple variants -> `{"completed": null|"text"}` or `{"errored": "msg"}`.
fn collab_agent_state_label(status: &Value) -> Value {
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

fn collab_agent_status_failed(status: &Value) -> bool {
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

fn collab_prompt(args: &Value) -> Option<String> {
    string_value(args.get("message"))
        .or_else(|| string_value(args.get("prompt")))
        .map(|value| value.trim().to_string())
        .filter(|value| !value.is_empty())
}

fn collab_target_id(args: &Value) -> Option<String> {
    string_value(args.get("target"))
        .or_else(|| string_value(args.get("target_id")))
        .or_else(|| string_value(args.get("targetId")))
        .or_else(|| string_value(args.get("agent_id")))
        .or_else(|| string_value(args.get("agentId")))
        .map(|value| value.trim().to_string())
        .filter(|value| !value.is_empty())
}

fn json_string_array(value: Option<&Value>) -> Vec<String> {
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

fn running_agent_states(receiver_ids: &[String]) -> Value {
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

fn parsed_function_output(value: &Value) -> Option<Value> {
    match value {
        Value::String(text) => serde_json::from_str::<Value>(text).ok(),
        Value::Object(_) => Some(value.clone()),
        _ => None,
    }
}

fn receiver_thread_stub(thread_id: &str, nickname: Option<&str>) -> Option<Value> {
    let nickname = nickname.map(str::trim).filter(|value| !value.is_empty())?;
    Some(json!({
        "threadId": thread_id,
        "thread": {
            "id": thread_id,
            "agentNickname": nickname,
        },
    }))
}

fn item_receiver_thread_ids_from_object(item: &serde_json::Map<String, Value>) -> Vec<String> {
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

fn completed_at_ms_from_line_index(_line_index: usize) -> Value {
    Value::Null
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
    ensure_default_hicodex_profile_with_codex_cli_home(codex_home, &default_codex_cli_home())
}

fn ensure_default_hicodex_profile_with_codex_cli_home(
    codex_home: &Path,
    codex_cli_home: &Path,
) -> Result<(), std::io::Error> {
    let models_path = codex_home.join("models.json");
    if !models_path.exists() {
        fs::write(&models_path, default_model_catalog_json())?;
    } else {
        ensure_local_model_catalog_messages(&models_path)?;
    }

    let config_path = codex_home.join("config.toml");
    if !config_path.exists() {
        let mut config = default_config_toml(&models_path);
        ensure_bundled_capability_plugin_config(&mut config, codex_cli_home);
        fs::write(&config_path, config)?;
        return Ok(());
    }

    let config = fs::read_to_string(&config_path)?;
    let top_level = missing_top_level_model_config(&config, &models_path);
    let mut next_config = if top_level.is_empty() {
        config.clone()
    } else {
        insert_top_level_toml(&config, &top_level)
    };
    if !has_toml_table(&next_config, "model_providers.openai_http") {
        if !next_config.ends_with('\n') {
            next_config.push('\n');
        }
        next_config.push('\n');
        next_config.push_str(default_openai_http_provider_toml());
    } else {
        next_config =
            remove_toml_table_key(&next_config, "model_providers.openai_http", "base_url");
    }
    ensure_bundled_capability_plugin_config(&mut next_config, codex_cli_home);
    if next_config == config {
        return Ok(());
    }

    fs::write(&config_path, next_config)?;
    Ok(())
}

fn ensure_bundled_capability_plugin_config(config: &mut String, codex_cli_home: &Path) {
    let Some(marketplace_path) = openai_bundled_marketplace_path(codex_cli_home) else {
        return;
    };
    let mut additions = Vec::new();
    if !has_toml_table(config, "marketplaces.openai-bundled") {
        additions.push(format!(
            r#"[marketplaces.openai-bundled]
source_type = "local"
source = {}
"#,
            toml_string(&marketplace_path.to_string_lossy()),
        ));
    }
    if !has_toml_table(config, r#"plugins."browser@openai-bundled""#) {
        additions.push(format!(
            r#"[plugins."{OPENAI_BUNDLED_BROWSER_PLUGIN_ID}"]
enabled = true
"#,
        ));
    }
    if additions.is_empty() {
        return;
    }
    append_toml_blocks(config, &additions.join("\n"));
}

fn openai_bundled_marketplace_path(codex_cli_home: &Path) -> Option<PathBuf> {
    let path = codex_cli_home
        .join(".tmp")
        .join("bundled-marketplaces")
        .join(OPENAI_BUNDLED_MARKETPLACE_NAME);
    let manifest = path
        .join(".agents")
        .join("plugins")
        .join("marketplace.json");
    if manifest.exists() {
        Some(path)
    } else {
        None
    }
}

fn read_computer_use_readiness_at(
    codex_home: &Path,
    codex_cli_home: &Path,
) -> ComputerUseReadiness {
    let (screen_recording_status, accessibility_status, app_approvals_status) =
        computer_use_native_permission_statuses();
    let candidates: Vec<ComputerUseBundleCandidate> =
        computer_use_plugin_root_candidates(codex_home, codex_cli_home)
            .into_iter()
            .filter_map(|(source, plugin_root)| computer_use_bundle_candidate(source, plugin_root))
            .collect();
    let repair_source = candidates
        .iter()
        .find(|candidate| candidate.usable_for_repair);
    let repair_source_path = repair_source.map(|candidate| candidate.plugin_root_path.clone());
    let repair_source_available = repair_source.is_some();
    let repair_status = computer_use_repair_status(candidates.first(), repair_source);
    if let Some(primary) = candidates.first() {
        return ComputerUseReadiness {
            helper_available: primary.helper_app_path.is_some()
                && primary.mcp_client_path.is_some(),
            helper_app_path: primary.helper_app_path.clone(),
            helper_signature_valid: primary.helper_signature_valid,
            helper_signature_status: primary.helper_signature_status.clone(),
            mcp_client_path: primary.mcp_client_path.clone(),
            mcp_config_path: primary.mcp_config_path.clone(),
            mcp_command: primary.mcp_command.clone(),
            mcp_command_path: primary.mcp_command_path.clone(),
            mcp_cwd: primary.mcp_cwd.clone(),
            mcp_config_trusted: primary.mcp_config_trusted,
            mcp_config_status: primary.mcp_config_status.clone(),
            mcp_command_executable: primary.mcp_command_executable,
            mcp_client_signature_valid: primary.mcp_client_signature_valid,
            mcp_client_signature_status: primary.mcp_client_signature_status.clone(),
            installer_app_path: primary.installer_app_path.clone(),
            plugin_root_path: Some(primary.plugin_root_path.clone()),
            source: Some(primary.source.clone()),
            repair_source_available,
            repair_source_path,
            repair_status: Some(repair_status.to_string()),
            candidates,
            screen_recording_status: Some(screen_recording_status.clone()),
            accessibility_status: Some(accessibility_status.clone()),
            app_approvals_status: Some(app_approvals_status.clone()),
        };
    }
    ComputerUseReadiness {
        repair_status: Some("not found".to_string()),
        candidates,
        screen_recording_status: Some(screen_recording_status),
        accessibility_status: Some(accessibility_status),
        app_approvals_status: Some(app_approvals_status),
        ..ComputerUseReadiness::default()
    }
}

fn repair_computer_use_bundle_at(
    codex_home: &Path,
    codex_cli_home: &Path,
) -> Result<ComputerUseRepairResult, HostError> {
    let readiness = read_computer_use_readiness_at(codex_home, codex_cli_home);
    if readiness.repair_status.as_deref() == Some("not needed") {
        return Ok(ComputerUseRepairResult {
            repaired: false,
            source_path: readiness.plugin_root_path.clone(),
            installed_path: readiness.plugin_root_path.clone(),
            message: "Computer Use installed cache is already signed-valid.".to_string(),
            readiness,
        });
    }
    let source_path = readiness.repair_source_path.as_deref().ok_or_else(|| {
        HostError::Profile("No signed-valid Computer Use repair source is available.".to_string())
    })?;
    let source_candidate = readiness
        .candidates
        .iter()
        .find(|candidate| candidate.plugin_root_path == source_path && candidate.usable_for_repair)
        .ok_or_else(|| {
            HostError::Profile("Computer Use repair source is no longer signed-valid.".to_string())
        })?;
    let source_root = PathBuf::from(&source_candidate.plugin_root_path);
    let verified_source =
        computer_use_bundle_candidate(source_candidate.source.clone(), source_root.clone())
            .filter(|candidate| candidate.usable_for_repair)
            .ok_or_else(|| {
                HostError::Profile(
                    "Computer Use repair source failed signature or executable revalidation."
                        .to_string(),
                )
            })?;
    let destination =
        computer_use_repair_destination(codex_home, readiness.candidates.first(), &source_root);
    let cache_root = computer_use_installed_cache_root(codex_home);
    if !destination.starts_with(&cache_root) {
        return Err(HostError::Profile(format!(
            "Refusing to repair Computer Use outside HiCodex plugin cache: {}",
            destination.to_string_lossy()
        )));
    }
    if paths_are_same_existing_dir(&source_root, &destination) {
        return Ok(ComputerUseRepairResult {
            repaired: false,
            source_path: Some(verified_source.plugin_root_path.clone()),
            installed_path: Some(destination.to_string_lossy().to_string()),
            message: "Computer Use repair source is already installed.".to_string(),
            readiness,
        });
    }
    replace_dir_with_copy(&source_root, &destination).map_err(|error| {
        HostError::Profile(format!(
            "failed to repair Computer Use from {} to {}: {error}",
            source_root.to_string_lossy(),
            destination.to_string_lossy()
        ))
    })?;
    let repaired_readiness = read_computer_use_readiness_at(codex_home, codex_cli_home);
    if repaired_readiness
        .helper_signature_valid
        .zip(repaired_readiness.mcp_client_signature_valid)
        != Some((true, true))
        || repaired_readiness.mcp_config_trusted != Some(true)
        || repaired_readiness.mcp_command_executable != Some(true)
    {
        return Err(HostError::Profile(
            "Computer Use repair completed, but the installed cache is still not signed-valid."
                .to_string(),
        ));
    }
    Ok(ComputerUseRepairResult {
        repaired: true,
        source_path: Some(verified_source.plugin_root_path),
        installed_path: Some(destination.to_string_lossy().to_string()),
        message: "Computer Use signed-valid bundle was installed into the HiCodex plugin cache."
            .to_string(),
        readiness: repaired_readiness,
    })
}

fn computer_use_bundle_candidate(
    source: String,
    plugin_root: PathBuf,
) -> Option<ComputerUseBundleCandidate> {
    let helper_app = plugin_root.join(COMPUTER_USE_APP_NAME);
    let mcp_config = read_computer_use_mcp_config(&plugin_root);
    let fallback_mcp_client = path_with_segments(&plugin_root, COMPUTER_USE_MCP_CLIENT_RELATIVE);
    let mcp_client = mcp_config
        .command_path
        .clone()
        .unwrap_or_else(|| fallback_mcp_client.clone());
    let installer_app = path_with_segments(&plugin_root, COMPUTER_USE_INSTALLER_RELATIVE);
    if !helper_app.exists() && !mcp_client.exists() && !installer_app.exists() {
        return None;
    }
    let (helper_signature_valid, helper_signature_status) =
        code_signature_status_for_path(&helper_app);
    let (mcp_client_signature_valid, mcp_client_signature_status) =
        code_signature_status_for_path(&mcp_client);
    let (installer_signature_valid, installer_signature_status) =
        code_signature_status_for_path(&installer_app);
    let mcp_command_executable = Some(path_is_executable(&mcp_client));
    let usable_for_repair = helper_app.exists()
        && mcp_client.exists()
        && installer_app.exists()
        && mcp_config.trusted == Some(true)
        && mcp_command_executable == Some(true)
        && helper_signature_valid == Some(true)
        && mcp_client_signature_valid == Some(true)
        && installer_signature_valid == Some(true);
    Some(ComputerUseBundleCandidate {
        source,
        plugin_root_path: plugin_root.to_string_lossy().to_string(),
        helper_app_path: existing_path_string(&helper_app),
        helper_signature_valid,
        helper_signature_status,
        mcp_client_path: existing_path_string(&mcp_client),
        mcp_config_path: existing_path_string(&mcp_config.config_path),
        mcp_command: mcp_config.command.clone(),
        mcp_command_path: mcp_config
            .command_path
            .as_ref()
            .map(|path| path.to_string_lossy().to_string()),
        mcp_cwd: mcp_config.cwd.clone(),
        mcp_config_trusted: mcp_config.trusted,
        mcp_config_status: mcp_config.trust_status.clone(),
        mcp_command_executable,
        mcp_client_signature_valid,
        mcp_client_signature_status,
        installer_app_path: existing_path_string(&installer_app),
        installer_signature_valid,
        installer_signature_status,
        usable_for_repair,
    })
}

fn computer_use_repair_status(
    primary: Option<&ComputerUseBundleCandidate>,
    repair_source: Option<&ComputerUseBundleCandidate>,
) -> &'static str {
    let Some(primary) = primary else {
        return "not found";
    };
    if primary.usable_for_repair && primary.source == "installed-cache" {
        return "not needed";
    }
    if repair_source.is_some() {
        return "ready";
    }
    "no valid signed source"
}

fn computer_use_native_permission_statuses() -> (String, String, String) {
    (
        computer_use_screen_recording_status(),
        computer_use_accessibility_status(),
        "unknown".to_string(),
    )
}

#[cfg(target_os = "macos")]
fn computer_use_screen_recording_status() -> String {
    if unsafe { CGPreflightScreenCaptureAccess() } {
        "granted".to_string()
    } else {
        "not granted".to_string()
    }
}

#[cfg(not(target_os = "macos"))]
fn computer_use_screen_recording_status() -> String {
    "unknown".to_string()
}

#[cfg(target_os = "macos")]
fn computer_use_accessibility_status() -> String {
    if unsafe { AXIsProcessTrusted() != 0 } {
        "granted".to_string()
    } else {
        "not granted".to_string()
    }
}

#[cfg(not(target_os = "macos"))]
fn computer_use_accessibility_status() -> String {
    "unknown".to_string()
}

fn computer_use_plugin_root_candidates(
    codex_home: &Path,
    codex_cli_home: &Path,
) -> Vec<(String, PathBuf)> {
    let mut candidates = Vec::new();
    let cache_root = computer_use_installed_cache_root(codex_home);
    if cache_root.join(COMPUTER_USE_APP_NAME).exists() {
        candidates.push(("installed-cache".to_string(), cache_root.clone()));
    }
    if let Ok(entries) = fs::read_dir(&cache_root) {
        let mut version_roots: Vec<PathBuf> = entries
            .filter_map(Result::ok)
            .map(|entry| entry.path())
            .filter(|path| path.is_dir())
            .collect();
        version_roots.sort_by(|a, b| {
            b.file_name()
                .and_then(|name| name.to_str())
                .unwrap_or_default()
                .cmp(
                    a.file_name()
                        .and_then(|name| name.to_str())
                        .unwrap_or_default(),
                )
        });
        candidates.extend(
            version_roots
                .into_iter()
                .map(|path| ("installed-cache".to_string(), path)),
        );
    }
    if let Some(marketplace_path) = openai_bundled_marketplace_path(codex_cli_home) {
        candidates.push((
            "bundled-marketplace".to_string(),
            marketplace_path
                .join("plugins")
                .join(OPENAI_BUNDLED_COMPUTER_USE_PLUGIN_NAME),
        ));
    }
    if codex_cli_home == default_codex_cli_home() {
        if let Some(codex_app_plugin) = codex_desktop_computer_use_plugin_root() {
            candidates.push(("codex-desktop-app".to_string(), codex_app_plugin));
        }
    }
    candidates
}

fn computer_use_installed_cache_root(codex_home: &Path) -> PathBuf {
    codex_home
        .join("plugins")
        .join("cache")
        .join(OPENAI_BUNDLED_MARKETPLACE_NAME)
        .join(OPENAI_BUNDLED_COMPUTER_USE_PLUGIN_NAME)
}

fn codex_desktop_computer_use_plugin_root() -> Option<PathBuf> {
    let root = PathBuf::from("/Applications/Codex.app")
        .join("Contents")
        .join("Resources")
        .join("plugins")
        .join(OPENAI_BUNDLED_MARKETPLACE_NAME)
        .join("plugins")
        .join(OPENAI_BUNDLED_COMPUTER_USE_PLUGIN_NAME);
    root.exists().then_some(root)
}

fn computer_use_repair_destination(
    codex_home: &Path,
    primary: Option<&ComputerUseBundleCandidate>,
    source_root: &Path,
) -> PathBuf {
    if let Some(primary) = primary.filter(|candidate| candidate.source == "installed-cache") {
        return PathBuf::from(&primary.plugin_root_path);
    }
    let version =
        computer_use_plugin_version(source_root).unwrap_or_else(|| "repaired".to_string());
    computer_use_installed_cache_root(codex_home).join(version)
}

fn computer_use_plugin_version(plugin_root: &Path) -> Option<String> {
    let manifest_path = plugin_root.join(".codex-plugin").join("plugin.json");
    let manifest = fs::read_to_string(manifest_path).ok()?;
    let value = serde_json::from_str::<Value>(&manifest).ok()?;
    json_field_text(&value, "version")
}

fn paths_are_same_existing_dir(left: &Path, right: &Path) -> bool {
    match (fs::canonicalize(left), fs::canonicalize(right)) {
        (Ok(left), Ok(right)) => left == right,
        _ => false,
    }
}

fn replace_dir_with_copy(source: &Path, destination: &Path) -> std::io::Result<()> {
    let parent = destination.parent().ok_or_else(|| {
        std::io::Error::new(
            std::io::ErrorKind::InvalidInput,
            "Computer Use repair destination has no parent directory",
        )
    })?;
    fs::create_dir_all(parent)?;
    let source_metadata = fs::symlink_metadata(source)?;
    if source_metadata.file_type().is_symlink() || !source_metadata.is_dir() {
        return Err(std::io::Error::new(
            std::io::ErrorKind::InvalidInput,
            "Computer Use repair source must be a real directory",
        ));
    }
    let canonical_source = fs::canonicalize(source)?;
    let canonical_parent = fs::canonicalize(parent)?;
    let destination_name = destination.file_name().ok_or_else(|| {
        std::io::Error::new(
            std::io::ErrorKind::InvalidInput,
            "Computer Use repair destination has no directory name",
        )
    })?;
    let canonical_destination = canonical_parent.join(destination_name);
    if canonical_source == canonical_destination
        || canonical_source.starts_with(&canonical_destination)
        || canonical_destination.starts_with(&canonical_source)
    {
        return Err(std::io::Error::new(
            std::io::ErrorKind::InvalidInput,
            "Computer Use repair source and destination must not overlap",
        ));
    }
    if destination.exists() {
        let destination_metadata = fs::symlink_metadata(destination)?;
        if destination_metadata.file_type().is_symlink() || !destination_metadata.is_dir() {
            return Err(std::io::Error::new(
                std::io::ErrorKind::InvalidInput,
                "Computer Use repair destination must be a real directory",
            ));
        }
    }
    let tmp_name = format!(
        ".{}-repair-{}",
        destination
            .file_name()
            .and_then(|name| name.to_str())
            .unwrap_or("computer-use"),
        std::process::id()
    );
    let tmp_destination = parent.join(tmp_name);
    if tmp_destination.exists() {
        fs::remove_dir_all(&tmp_destination)?;
    }
    if let Err(error) = copy_dir_recursive(source, &tmp_destination) {
        let _ = fs::remove_dir_all(&tmp_destination);
        return Err(error);
    }
    if destination.exists() {
        fs::remove_dir_all(destination)?;
    }
    fs::rename(tmp_destination, destination)
}

fn copy_dir_recursive(source: &Path, destination: &Path) -> std::io::Result<()> {
    fs::create_dir_all(destination)?;
    for entry in fs::read_dir(source)? {
        let entry = entry?;
        let source_path = entry.path();
        let destination_path = destination.join(entry.file_name());
        let metadata = fs::symlink_metadata(&source_path)?;
        if metadata.file_type().is_symlink() {
            return Err(std::io::Error::new(
                std::io::ErrorKind::InvalidInput,
                format!(
                    "Computer Use repair refuses symlink entry: {}",
                    source_path.to_string_lossy()
                ),
            ));
        }
        if metadata.is_dir() {
            copy_dir_recursive(&source_path, &destination_path)?;
        } else if metadata.is_file() {
            fs::copy(&source_path, &destination_path)?;
            fs::set_permissions(&destination_path, metadata.permissions())?;
        } else {
            return Err(std::io::Error::new(
                std::io::ErrorKind::InvalidInput,
                format!(
                    "Computer Use repair refuses non-file entry: {}",
                    source_path.to_string_lossy()
                ),
            ));
        }
    }
    Ok(())
}

#[derive(Debug, Clone)]
struct ComputerUseMcpConfig {
    config_path: PathBuf,
    command: Option<String>,
    command_path: Option<PathBuf>,
    cwd: Option<String>,
    trusted: Option<bool>,
    trust_status: Option<String>,
}

fn read_computer_use_mcp_config(plugin_root: &Path) -> ComputerUseMcpConfig {
    let config_path = plugin_root.join(COMPUTER_USE_MCP_CONFIG_FILENAME);
    let mut result = ComputerUseMcpConfig {
        config_path: config_path.clone(),
        command: None,
        command_path: None,
        cwd: None,
        trusted: Some(false),
        trust_status: Some("missing .mcp.json".to_string()),
    };
    let Ok(config) = fs::read_to_string(&config_path) else {
        result.trust_status = Some("could not read .mcp.json".to_string());
        return result;
    };
    let Ok(value) = serde_json::from_str::<Value>(&config) else {
        result.trust_status = Some("invalid .mcp.json".to_string());
        return result;
    };
    let Some(server) = value
        .get("mcpServers")
        .and_then(Value::as_object)
        .and_then(|servers| {
            servers.get("computer-use").or_else(|| {
                servers.values().find(|server| {
                    json_field_text(server, "command")
                        .map(|command| command.contains("SkyComputerUseClient"))
                        .unwrap_or(false)
                })
            })
        })
    else {
        result.trust_status = Some("missing computer-use MCP server".to_string());
        return result;
    };
    let command = json_field_text(server, "command");
    let cwd = json_field_text(server, "cwd");
    let args = json_field_text_array(server, "args");
    let cwd_path = cwd
        .as_deref()
        .map(|value| resolve_config_relative_path(plugin_root, value))
        .unwrap_or_else(|| plugin_root.to_path_buf());
    let command_path = command
        .as_deref()
        .map(|value| resolve_config_relative_path(&cwd_path, value));
    let expected_command_path = path_with_segments(plugin_root, COMPUTER_USE_MCP_CLIENT_RELATIVE);
    let mut trust_errors = Vec::new();
    if cwd.is_none() {
        trust_errors.push("cwd missing");
    } else if !paths_are_same_existing_dir(&cwd_path, plugin_root) {
        trust_errors.push("cwd must resolve to the Computer Use plugin root");
    }
    match command_path.as_ref() {
        Some(path) if paths_are_same_existing_path(path, &expected_command_path) => {}
        Some(_) => trust_errors.push("command must resolve to bundled SkyComputerUseClient"),
        None => trust_errors.push("command missing"),
    }
    match args.as_deref() {
        Some(values) if values.len() == 1 && values[0] == "mcp" => {}
        Some(_) => trust_errors.push("args must be exactly [\"mcp\"]"),
        None => trust_errors.push("args missing"),
    }
    result.command_path = command_path;
    result.command = command;
    result.cwd = cwd;
    result.trusted = Some(trust_errors.is_empty());
    result.trust_status = Some(if trust_errors.is_empty() {
        "trusted".to_string()
    } else {
        trust_errors.join("; ")
    });
    result
}

fn json_field_text(value: &Value, key: &str) -> Option<String> {
    value
        .get(key)
        .and_then(Value::as_str)
        .map(str::trim)
        .filter(|value| !value.is_empty())
        .map(ToOwned::to_owned)
}

fn json_field_text_array(value: &Value, key: &str) -> Option<Vec<String>> {
    value.get(key).and_then(Value::as_array).map(|items| {
        items
            .iter()
            .filter_map(Value::as_str)
            .map(str::trim)
            .filter(|item| !item.is_empty())
            .map(ToOwned::to_owned)
            .collect::<Vec<_>>()
    })
}

fn paths_are_same_existing_path(left: &Path, right: &Path) -> bool {
    match (fs::canonicalize(left), fs::canonicalize(right)) {
        (Ok(left), Ok(right)) => left == right,
        _ => false,
    }
}

fn resolve_config_relative_path(root: &Path, value: &str) -> PathBuf {
    let path = Path::new(value);
    if path.is_absolute() {
        path.to_path_buf()
    } else {
        root.join(path)
    }
}

fn path_is_executable(path: &Path) -> bool {
    if !path.is_file() {
        return false;
    }
    #[cfg(unix)]
    {
        fs::metadata(path)
            .map(|metadata| metadata.permissions().mode() & 0o111 != 0)
            .unwrap_or(false)
    }
    #[cfg(not(unix))]
    {
        true
    }
}

fn code_signature_status_for_path(path: &Path) -> (Option<bool>, Option<String>) {
    if !path.exists() {
        return (None, None);
    }
    #[cfg(test)]
    if let Some(status) = test_code_signature_status_for_path(path) {
        return status;
    }
    #[cfg(target_os = "macos")]
    {
        let target = code_signature_target(path);
        let output = Command::new("/usr/bin/codesign")
            .arg("--verify")
            .arg("--deep")
            .arg("--strict")
            .arg("--verbose=2")
            .arg(&target)
            .output();
        let output = match output {
            Ok(output) => output,
            Err(error) => {
                return (None, Some(format!("codesign unavailable: {error}")));
            }
        };
        let valid = output.status.success();
        let stderr = String::from_utf8_lossy(&output.stderr);
        let stdout = String::from_utf8_lossy(&output.stdout);
        let message = first_non_empty_line(&stderr)
            .or_else(|| first_non_empty_line(&stdout))
            .unwrap_or_else(|| {
                if valid {
                    "valid".to_string()
                } else {
                    "invalid signature".to_string()
                }
            });
        (Some(valid), Some(message))
    }
    #[cfg(not(target_os = "macos"))]
    {
        (
            None,
            Some("codesign verification is only available on macOS".to_string()),
        )
    }
}

#[cfg(test)]
fn test_code_signature_status_for_path(path: &Path) -> Option<(Option<bool>, Option<String>)> {
    if let Some(status) = test_code_signature_overrides()
        .lock()
        .expect("test code-signature override mutex poisoned")
        .get(&path.to_string_lossy().to_string())
        .cloned()
    {
        return Some(status);
    }
    test_signed_computer_use_marker_status(path)
}

#[cfg(test)]
fn test_signed_computer_use_marker_status(path: &Path) -> Option<(Option<bool>, Option<String>)> {
    for ancestor in path.ancestors() {
        if ancestor.join(".hicodex-test-signed").exists() {
            return Some((Some(true), Some("valid".to_string())));
        }
    }
    None
}

#[cfg(test)]
fn set_test_code_signature_status(path: &Path, valid: bool) {
    test_code_signature_overrides()
        .lock()
        .expect("test code-signature override mutex poisoned")
        .insert(
            path.to_string_lossy().to_string(),
            (
                Some(valid),
                Some(if valid { "valid" } else { "invalid signature" }.to_string()),
            ),
        );
}

#[cfg(test)]
fn test_code_signature_overrides() -> &'static Mutex<HashMap<String, (Option<bool>, Option<String>)>>
{
    static OVERRIDES: std::sync::OnceLock<Mutex<HashMap<String, (Option<bool>, Option<String>)>>> =
        std::sync::OnceLock::new();
    OVERRIDES.get_or_init(|| Mutex::new(HashMap::new()))
}

#[cfg(target_os = "macos")]
fn code_signature_target(path: &Path) -> PathBuf {
    for candidate in path.ancestors() {
        if candidate
            .extension()
            .and_then(|extension| extension.to_str())
            .map(|extension| extension.eq_ignore_ascii_case("app"))
            .unwrap_or(false)
        {
            return candidate.to_path_buf();
        }
    }
    path.to_path_buf()
}

#[cfg(target_os = "macos")]
fn first_non_empty_line(value: &str) -> Option<String> {
    value
        .lines()
        .map(str::trim)
        .find(|line| !line.is_empty())
        .map(ToOwned::to_owned)
}

fn path_with_segments(root: &Path, segments: &[&str]) -> PathBuf {
    segments
        .iter()
        .fold(root.to_path_buf(), |path, segment| path.join(segment))
}

fn existing_path_string(path: &Path) -> Option<String> {
    path.exists().then(|| path.to_string_lossy().to_string())
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

fn has_toml_table(config: &str, table: &str) -> bool {
    let expected = format!("[{table}]");
    config.lines().any(|line| line.trim() == expected)
}

fn remove_toml_table_key(config: &str, table: &str, key: &str) -> String {
    let expected_table = format!("[{table}]");
    let mut in_target_table = false;
    let mut lines = Vec::new();

    for line in config.lines() {
        let trimmed = line.trim();
        if trimmed.starts_with('[') && trimmed.ends_with(']') {
            in_target_table = trimmed == expected_table;
        }

        if in_target_table
            && !trimmed.starts_with('#')
            && trimmed
                .split_once('=')
                .is_some_and(|(name, _)| name.trim() == key)
        {
            continue;
        }

        lines.push(line);
    }

    let mut next = lines.join("\n");
    if config.ends_with('\n') {
        next.push('\n');
    }
    next
}

fn insert_top_level_toml(config: &str, addition: &str) -> String {
    if let Some(index) = config.find("\n[") {
        let (head, tail) = config.split_at(index + 1);
        return format!("{head}{addition}\n{tail}");
    }
    let separator = if config.ends_with('\n') { "" } else { "\n" };
    format!("{config}{separator}{addition}")
}

fn append_toml_blocks(config: &mut String, addition: &str) {
    if !config.ends_with('\n') {
        config.push('\n');
    }
    if !config.ends_with("\n\n") {
        config.push('\n');
    }
    config.push_str(addition.trim_end());
    config.push('\n');
}

fn default_openai_http_provider_toml() -> &'static str {
    r#"[model_providers.openai_http]
name = "OpenAI"
wire_api = "responses"
requires_openai_auth = true
supports_websockets = false
"#
}

fn default_config_toml(models_path: &Path) -> String {
    let api_key = env::var("HICODEX_LOCAL_API_KEY")
        .ok()
        .map(|value| value.trim().to_string())
        .filter(|value| !value.is_empty());
    default_config_toml_with_api_key(models_path, api_key.as_deref())
}

fn default_config_toml_with_api_key(models_path: &Path, api_key: Option<&str>) -> String {
    let bearer_token_line = api_key
        .map(|value| format!("experimental_bearer_token = {}\n", toml_string(value)))
        .unwrap_or_default();
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
{bearer_token_line}
{openai_http_provider}"#,
        models_path = toml_string(&models_path.to_string_lossy()),
        instructions = toml_multiline_literal(HICODEX_BASE_INSTRUCTIONS),
        bearer_token_line = bearer_token_line,
        openai_http_provider = default_openai_http_provider_toml(),
    )
}

fn default_model_catalog_json() -> String {
    model_catalog_json(&LocalModelCatalogConfig {
        model: "Qwen3.6-27B-mxfp4".to_string(),
        models: None,
        display_name: Some("Qwen3.6 27B MXFP4".to_string()),
        description: Some("Local OpenAI-compatible coding model via HiCodex gateway.".to_string()),
        context_window: Some(262144),
        auto_compact_token_limit: Some(235929),
        input_modalities: Some(default_input_modalities_json()),
    })
}

fn model_catalog_json(config: &LocalModelCatalogConfig) -> String {
    let model_slugs = configured_model_slugs(config);
    let context_window = config.context_window.unwrap_or(262144);
    let auto_compact_token_limit = config
        .auto_compact_token_limit
        .unwrap_or((context_window as f64 * 0.9) as u64);
    let description = config
        .description
        .as_deref()
        .filter(|value| !value.trim().is_empty())
        .unwrap_or("Local OpenAI-compatible coding model via HiCodex gateway.");
    let input_modalities = normalize_input_modalities(config.input_modalities.as_deref());
    let models = model_slugs
        .iter()
        .enumerate()
        .map(|(index, model)| {
            let display_name = if index == 0 {
                config
                    .display_name
                    .as_deref()
                    .filter(|value| !value.trim().is_empty())
                    .unwrap_or(model)
                    .to_string()
            } else {
                model_display_name(model)
            };
            json!({
                "slug": model,
                "display_name": display_name,
                "description": description,
                "default_reasoning_level": null,
                "supported_reasoning_levels": [],
                "shell_type": "shell_command",
                "visibility": "list",
                "supported_in_api": true,
                "priority": index,
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
                "input_modalities": input_modalities.clone(),
                "supports_search_tool": false
            })
        })
        .collect::<Vec<_>>();

    serde_json::to_string_pretty(&json!({
        "models": models
    }))
    .expect("default model catalog should serialize")
}

fn configured_model_slugs(config: &LocalModelCatalogConfig) -> Vec<String> {
    let mut slugs = Vec::new();
    push_unique_model_slug(&mut slugs, &config.model);
    if let Some(models) = config.models.as_deref() {
        for model in models {
            push_unique_model_slug(&mut slugs, model);
        }
    }
    if slugs.is_empty() {
        slugs.push("Qwen3.6-27B-mxfp4".to_string());
    }
    slugs
}

fn push_unique_model_slug(slugs: &mut Vec<String>, model: &str) {
    let trimmed = model.trim();
    if trimmed.is_empty() || slugs.iter().any(|value| value == trimmed) {
        return;
    }
    slugs.push(trimmed.to_string());
}

fn model_display_name(model: &str) -> String {
    if model
        .get(0..4)
        .is_some_and(|prefix| prefix.eq_ignore_ascii_case("gpt-"))
    {
        return format!("GPT{}", &model[3..]);
    }
    model.to_string()
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
    fn read_or_init_installation_id_generates_and_reuses_uuid() {
        let dir = env::temp_dir().join(format!(
            "hicodex-host-installation-id-test-{}-{}",
            std::process::id(),
            SystemTime::now()
                .duration_since(UNIX_EPOCH)
                .map(|value| value.as_nanos())
                .unwrap_or_default()
        ));
        let _ = fs::remove_dir_all(&dir);

        let generated = read_or_init_installation_state_at(&dir).unwrap();
        assert!(generated.first_launch);
        assert!(canonical_installation_uuid(&generated.installation_id).is_some());
        assert_eq!(
            fs::read_to_string(dir.join(INSTALLATION_ID_FILENAME)).unwrap(),
            generated.installation_id
        );

        let reused = read_or_init_installation_state_at(&dir).unwrap();
        assert!(!reused.first_launch);
        assert_eq!(reused.installation_id, generated.installation_id);

        let _ = fs::remove_dir_all(&dir);
    }

    #[test]
    fn read_or_init_installation_id_canonicalizes_or_rewrites() {
        let dir = env::temp_dir().join(format!(
            "hicodex-host-installation-id-rewrite-test-{}-{}",
            std::process::id(),
            SystemTime::now()
                .duration_since(UNIX_EPOCH)
                .map(|value| value.as_nanos())
                .unwrap_or_default()
        ));
        let _ = fs::remove_dir_all(&dir);
        fs::create_dir_all(&dir).unwrap();
        fs::write(
            dir.join(INSTALLATION_ID_FILENAME),
            "AAAAAAAA-0000-4000-8000-000000000000\n",
        )
        .unwrap();
        let existing = read_or_init_installation_state_at(&dir).unwrap();
        assert!(!existing.first_launch);
        assert_eq!(
            existing.installation_id,
            "aaaaaaaa-0000-4000-8000-000000000000"
        );

        fs::write(dir.join(INSTALLATION_ID_FILENAME), "not-a-uuid").unwrap();
        let rewritten = read_or_init_installation_state_at(&dir).unwrap();
        assert!(rewritten.first_launch);
        assert!(canonical_installation_uuid(&rewritten.installation_id).is_some());
        assert_eq!(
            fs::read_to_string(dir.join(INSTALLATION_ID_FILENAME)).unwrap(),
            rewritten.installation_id
        );

        let _ = fs::remove_dir_all(&dir);
    }

    #[test]
    fn parses_json_stdout_as_event() {
        let value: Value = serde_json::json!({"id": 1, "result": {}});
        let line = serde_json::to_string(&value).unwrap();
        let parsed: Value = serde_json::from_str(&line).unwrap();
        assert_eq!(parsed["id"], 1);
    }

    #[test]
    fn summarizes_chatgpt_auth_without_exposing_tokens() {
        let value: Value = serde_json::json!({
            "auth_mode": "chatgpt",
            "tokens": {
                "access_token": "secret",
                "refresh_token": "secret-refresh"
            },
            "OPENAI_API_KEY": null
        });

        let summary = summarize_codex_auth_value(&value);

        assert!(summary.has_auth_file);
        assert_eq!(summary.auth_mode.as_deref(), Some("chatgpt"));
        assert!(summary.has_tokens);
        assert!(!summary.has_api_key);
    }

    #[test]
    fn summarizes_chatgpt_auth_identity_claims() {
        let id_token = fake_jwt(serde_json::json!({
            "email": "user@example.com",
            "https://api.openai.com/auth": {
                "chatgpt_plan_type": "pro"
            }
        }));
        let value: Value = serde_json::json!({
            "auth_mode": "chatgpt",
            "tokens": {
                "id_token": id_token,
                "access_token": "secret",
                "refresh_token": "secret-refresh"
            }
        });

        let summary = summarize_codex_auth_value(&value);

        assert_eq!(summary.email.as_deref(), Some("user@example.com"));
        assert_eq!(summary.plan_type.as_deref(), Some("pro"));
    }

    fn fake_jwt(payload: Value) -> String {
        let header = URL_SAFE_NO_PAD.encode(br#"{"alg":"none","typ":"JWT"}"#);
        let payload = URL_SAFE_NO_PAD.encode(serde_json::to_vec(&payload).unwrap());
        let signature = URL_SAFE_NO_PAD.encode(b"sig");
        format!("{header}.{payload}.{signature}")
    }

    fn unique_test_dir(prefix: &str) -> PathBuf {
        env::temp_dir().join(format!(
            "{prefix}-{}-{}",
            std::process::id(),
            SystemTime::now()
                .duration_since(UNIX_EPOCH)
                .map(|value| value.as_nanos())
                .unwrap_or_default()
        ))
    }

    fn create_fake_openai_bundled_marketplace(cli_home: &Path) -> PathBuf {
        let marketplace = cli_home
            .join(".tmp")
            .join("bundled-marketplaces")
            .join(OPENAI_BUNDLED_MARKETPLACE_NAME);
        let manifest_dir = marketplace.join(".agents").join("plugins");
        fs::create_dir_all(&manifest_dir).unwrap();
        fs::write(manifest_dir.join("marketplace.json"), r#"{"plugins":[]}"#).unwrap();
        marketplace
    }

    fn create_fake_computer_use_bundle(plugin_root: &Path) {
        fs::create_dir_all(plugin_root.join(COMPUTER_USE_APP_NAME)).unwrap();
        let mcp_client = path_with_segments(plugin_root, COMPUTER_USE_MCP_CLIENT_RELATIVE);
        fs::create_dir_all(mcp_client.parent().unwrap()).unwrap();
        fs::write(&mcp_client, "#!/bin/sh\n").unwrap();
        #[cfg(unix)]
        {
            let mut permissions = fs::metadata(&mcp_client).unwrap().permissions();
            permissions.set_mode(0o755);
            fs::set_permissions(&mcp_client, permissions).unwrap();
        }
        fs::write(
            plugin_root.join(COMPUTER_USE_MCP_CONFIG_FILENAME),
            serde_json::to_string(&json!({
                "mcpServers": {
                    "computer-use": {
                        "command": "./Codex Computer Use.app/Contents/SharedSupport/SkyComputerUseClient.app/Contents/MacOS/SkyComputerUseClient",
                        "args": ["mcp"],
                        "cwd": "."
                    }
                }
            }))
            .unwrap(),
        )
        .unwrap();
        let manifest_dir = plugin_root.join(".codex-plugin");
        fs::create_dir_all(&manifest_dir).unwrap();
        fs::write(
            manifest_dir.join("plugin.json"),
            serde_json::to_string(&json!({
                "name": "computer-use",
                "version": "1.0.799"
            }))
            .unwrap(),
        )
        .unwrap();
        let installer = path_with_segments(plugin_root, COMPUTER_USE_INSTALLER_RELATIVE);
        fs::create_dir_all(&installer).unwrap();
    }

    fn mark_fake_computer_use_bundle_signed(plugin_root: &Path) {
        fs::write(plugin_root.join(".hicodex-test-signed"), "signed").unwrap();
        set_test_code_signature_status(&plugin_root.join(COMPUTER_USE_APP_NAME), true);
        set_test_code_signature_status(
            &path_with_segments(plugin_root, COMPUTER_USE_MCP_CLIENT_RELATIVE),
            true,
        );
        set_test_code_signature_status(
            &path_with_segments(plugin_root, COMPUTER_USE_INSTALLER_RELATIVE),
            true,
        );
    }

    #[test]
    fn reads_missing_codex_auth_as_unsigned() {
        let dir = env::temp_dir().join(format!(
            "hicodex-host-auth-summary-test-{}",
            std::process::id()
        ));
        let _ = fs::remove_dir_all(&dir);
        fs::create_dir_all(&dir).unwrap();

        let summary = read_codex_auth_summary(Some(dir.to_string_lossy().as_ref())).unwrap();

        assert!(!summary.has_auth_file);
        assert!(summary.auth_mode.is_none());
        assert!(!summary.has_tokens);
        assert!(!summary.has_api_key);

        let _ = fs::remove_dir_all(&dir);
    }

    #[test]
    fn writes_multiple_configured_models_to_catalog() {
        let catalog = model_catalog_json(&LocalModelCatalogConfig {
            model: " gpt-5.5 ".to_string(),
            models: Some(vec![
                "gpt-5.4".to_string(),
                "gpt-5.5".to_string(),
                "   ".to_string(),
            ]),
            display_name: Some("GPT-5.5".to_string()),
            description: Some("API models".to_string()),
            context_window: Some(100_000),
            auto_compact_token_limit: Some(90_000),
            input_modalities: Some(vec!["text".to_string()]),
        });
        let value: Value = serde_json::from_str(&catalog).unwrap();
        let models = value["models"].as_array().unwrap();

        assert_eq!(models.len(), 2);
        assert_eq!(models[0]["slug"].as_str(), Some("gpt-5.5"));
        assert_eq!(models[0]["display_name"].as_str(), Some("GPT-5.5"));
        assert_eq!(models[1]["slug"].as_str(), Some("gpt-5.4"));
        assert_eq!(models[1]["display_name"].as_str(), Some("GPT-5.4"));
        assert_eq!(models[1]["priority"].as_u64(), Some(1));
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
        assert!(config.contains("[model_providers.openai_http]"));
        assert!(config.contains("supports_websockets = false"));
        assert!(config.contains("requires_openai_auth = true"));
        let openai_http_block = config
            .split("[model_providers.openai_http]")
            .nth(1)
            .unwrap()
            .split("\n[")
            .next()
            .unwrap();
        assert!(!openai_http_block.contains("base_url"));
        assert!(config.contains(HICODEX_BASE_INSTRUCTIONS));
        let catalog = fs::read_to_string(dir.join("models.json")).unwrap();
        assert!(catalog.contains("\"model_messages\""));
        assert!(catalog.contains(HICODEX_PERSONALITY_PLACEHOLDER));
        assert!(catalog.contains("\"image\""));

        let _ = fs::remove_dir_all(&dir);
    }

    #[test]
    fn bootstraps_bundled_browser_marketplace_when_available() {
        let dir = unique_test_dir("hicodex-host-bundled-marketplace-test");
        let cli_home = unique_test_dir("hicodex-host-cli-home-test");
        let marketplace = create_fake_openai_bundled_marketplace(&cli_home);
        let _ = fs::remove_dir_all(&dir);
        fs::create_dir_all(&dir).unwrap();

        ensure_default_hicodex_profile_with_codex_cli_home(&dir, &cli_home).unwrap();

        let config = fs::read_to_string(dir.join("config.toml")).unwrap();
        assert!(config.contains("[marketplaces.openai-bundled]"));
        assert!(config.contains(&format!(
            "source = {}",
            toml_string(&marketplace.to_string_lossy())
        )));
        assert!(config.contains("[plugins.\"browser@openai-bundled\"]"));
        assert!(config.contains("enabled = true"));
        assert!(!config.contains("[plugins.\"computer-use@openai-bundled\"]"));

        let _ = fs::remove_dir_all(&dir);
        let _ = fs::remove_dir_all(&cli_home);
    }

    #[test]
    fn refreshes_existing_config_with_bundled_marketplace_without_overwriting_browser_plugin() {
        let dir = unique_test_dir("hicodex-host-bundled-marketplace-refresh-test");
        let cli_home = unique_test_dir("hicodex-host-cli-home-refresh-test");
        let marketplace = create_fake_openai_bundled_marketplace(&cli_home);
        let _ = fs::remove_dir_all(&dir);
        fs::create_dir_all(&dir).unwrap();
        fs::write(
            dir.join("config.toml"),
            r#"model = "gpt-5.5"
model_provider = "hicodex_local"

[plugins."browser@openai-bundled"]
enabled = false
"#,
        )
        .unwrap();

        ensure_default_hicodex_profile_with_codex_cli_home(&dir, &cli_home).unwrap();

        let config = fs::read_to_string(dir.join("config.toml")).unwrap();
        assert!(config.contains("[marketplaces.openai-bundled]"));
        assert!(config.contains(&format!(
            "source = {}",
            toml_string(&marketplace.to_string_lossy())
        )));
        assert_eq!(
            config
                .matches("[plugins.\"browser@openai-bundled\"]")
                .count(),
            1
        );
        let browser_block = config
            .split("[plugins.\"browser@openai-bundled\"]")
            .nth(1)
            .unwrap()
            .split("\n[")
            .next()
            .unwrap();
        assert!(browser_block.contains("enabled = false"));
        assert!(!browser_block.contains("enabled = true"));

        let _ = fs::remove_dir_all(&dir);
        let _ = fs::remove_dir_all(&cli_home);
    }

    #[test]
    fn skips_bundled_marketplace_config_when_manifest_is_absent() {
        let dir = unique_test_dir("hicodex-host-bundled-marketplace-absent-test");
        let cli_home = unique_test_dir("hicodex-host-cli-home-absent-test");
        let _ = fs::remove_dir_all(&dir);
        let _ = fs::remove_dir_all(&cli_home);
        fs::create_dir_all(&dir).unwrap();
        fs::create_dir_all(&cli_home).unwrap();

        ensure_default_hicodex_profile_with_codex_cli_home(&dir, &cli_home).unwrap();

        let config = fs::read_to_string(dir.join("config.toml")).unwrap();
        assert!(!config.contains("[marketplaces.openai-bundled]"));
        assert!(!config.contains("[plugins.\"browser@openai-bundled\"]"));
        assert!(!config.contains("[plugins.\"computer-use@openai-bundled\"]"));

        let _ = fs::remove_dir_all(&dir);
        let _ = fs::remove_dir_all(&cli_home);
    }

    #[test]
    fn discovers_installed_computer_use_bundle_from_codex_home_cache() {
        let codex_home = unique_test_dir("hicodex-host-computer-use-cache-test");
        let cli_home = unique_test_dir("hicodex-host-computer-use-cli-cache-test");
        let plugin_root = codex_home
            .join("plugins")
            .join("cache")
            .join(OPENAI_BUNDLED_MARKETPLACE_NAME)
            .join(OPENAI_BUNDLED_COMPUTER_USE_PLUGIN_NAME)
            .join("1.0.799");
        create_fake_computer_use_bundle(&plugin_root);

        let readiness = read_computer_use_readiness_at(&codex_home, &cli_home);

        assert!(readiness.helper_available);
        assert_eq!(readiness.source.as_deref(), Some("installed-cache"));
        assert_eq!(
            readiness.repair_status.as_deref(),
            Some("no valid signed source")
        );
        assert!(!readiness.repair_source_available);
        assert!(readiness.repair_source_path.is_none());
        assert_eq!(readiness.candidates.len(), 1);
        assert_eq!(readiness.candidates[0].source, "installed-cache");
        assert_eq!(readiness.candidates[0].usable_for_repair, false);
        assert_eq!(
            readiness.plugin_root_path.as_deref(),
            Some(plugin_root.to_string_lossy().as_ref())
        );
        assert!(readiness
            .helper_app_path
            .as_deref()
            .unwrap()
            .ends_with(COMPUTER_USE_APP_NAME));
        assert!(readiness
            .mcp_client_path
            .as_deref()
            .unwrap()
            .ends_with("SkyComputerUseClient"));
        assert!(readiness
            .mcp_config_path
            .as_deref()
            .unwrap()
            .ends_with(COMPUTER_USE_MCP_CONFIG_FILENAME));
        assert_eq!(
            readiness.mcp_command.as_deref(),
            Some("./Codex Computer Use.app/Contents/SharedSupport/SkyComputerUseClient.app/Contents/MacOS/SkyComputerUseClient")
        );
        assert_eq!(readiness.mcp_cwd.as_deref(), Some("."));
        assert_eq!(readiness.mcp_config_trusted, Some(true));
        assert_eq!(readiness.mcp_config_status.as_deref(), Some("trusted"));
        assert_eq!(readiness.mcp_command_executable, Some(true));
        #[cfg(target_os = "macos")]
        {
            assert_eq!(readiness.helper_signature_valid, Some(false));
            assert_eq!(readiness.mcp_client_signature_valid, Some(false));
        }
        assert!(readiness
            .installer_app_path
            .as_deref()
            .unwrap()
            .ends_with(COMPUTER_USE_INSTALLER_APP_NAME));
        assert_native_permission_status(readiness.screen_recording_status.as_deref());
        assert_native_permission_status(readiness.accessibility_status.as_deref());
        assert_eq!(readiness.app_approvals_status.as_deref(), Some("unknown"));

        let _ = fs::remove_dir_all(&codex_home);
        let _ = fs::remove_dir_all(&cli_home);
    }

    #[test]
    fn discovers_computer_use_bundle_from_bundled_marketplace_when_not_installed() {
        let codex_home = unique_test_dir("hicodex-host-computer-use-marketplace-test");
        let cli_home = unique_test_dir("hicodex-host-computer-use-cli-marketplace-test");
        let marketplace = create_fake_openai_bundled_marketplace(&cli_home);
        let plugin_root = marketplace
            .join("plugins")
            .join(OPENAI_BUNDLED_COMPUTER_USE_PLUGIN_NAME);
        create_fake_computer_use_bundle(&plugin_root);

        let readiness = read_computer_use_readiness_at(&codex_home, &cli_home);

        assert!(readiness.helper_available);
        assert_eq!(readiness.source.as_deref(), Some("bundled-marketplace"));
        assert_eq!(
            readiness.repair_status.as_deref(),
            Some("no valid signed source")
        );
        assert!(!readiness.repair_source_available);
        assert_eq!(readiness.candidates.len(), 1);
        assert_eq!(readiness.candidates[0].source, "bundled-marketplace");
        assert_eq!(
            readiness.plugin_root_path.as_deref(),
            Some(plugin_root.to_string_lossy().as_ref())
        );

        let _ = fs::remove_dir_all(&codex_home);
        let _ = fs::remove_dir_all(&cli_home);
    }

    #[test]
    fn reports_all_computer_use_bundle_candidates() {
        let codex_home = unique_test_dir("hicodex-host-computer-use-candidates-test");
        let cli_home = unique_test_dir("hicodex-host-computer-use-cli-candidates-test");
        let installed_root = codex_home
            .join("plugins")
            .join("cache")
            .join(OPENAI_BUNDLED_MARKETPLACE_NAME)
            .join(OPENAI_BUNDLED_COMPUTER_USE_PLUGIN_NAME)
            .join("1.0.799");
        create_fake_computer_use_bundle(&installed_root);
        let marketplace = create_fake_openai_bundled_marketplace(&cli_home);
        let marketplace_root = marketplace
            .join("plugins")
            .join(OPENAI_BUNDLED_COMPUTER_USE_PLUGIN_NAME);
        create_fake_computer_use_bundle(&marketplace_root);

        let readiness = read_computer_use_readiness_at(&codex_home, &cli_home);

        assert_eq!(readiness.source.as_deref(), Some("installed-cache"));
        assert_eq!(readiness.candidates.len(), 2);
        assert_eq!(readiness.candidates[0].source, "installed-cache");
        assert_eq!(
            readiness.candidates[0].plugin_root_path,
            installed_root.to_string_lossy().to_string()
        );
        assert_eq!(readiness.candidates[1].source, "bundled-marketplace");
        assert_eq!(
            readiness.candidates[1].plugin_root_path,
            marketplace_root.to_string_lossy().to_string()
        );

        let _ = fs::remove_dir_all(&codex_home);
        let _ = fs::remove_dir_all(&cli_home);
    }

    #[test]
    fn repairs_invalid_computer_use_cache_from_signed_candidate() {
        let codex_home = unique_test_dir("hicodex-host-computer-use-repair-test");
        let cli_home = unique_test_dir("hicodex-host-computer-use-cli-repair-test");
        let installed_root = codex_home
            .join("plugins")
            .join("cache")
            .join(OPENAI_BUNDLED_MARKETPLACE_NAME)
            .join(OPENAI_BUNDLED_COMPUTER_USE_PLUGIN_NAME)
            .join("1.0.799");
        create_fake_computer_use_bundle(&installed_root);
        let marketplace = create_fake_openai_bundled_marketplace(&cli_home);
        let marketplace_root = marketplace
            .join("plugins")
            .join(OPENAI_BUNDLED_COMPUTER_USE_PLUGIN_NAME);
        create_fake_computer_use_bundle(&marketplace_root);
        mark_fake_computer_use_bundle_signed(&marketplace_root);

        let before = read_computer_use_readiness_at(&codex_home, &cli_home);
        assert_eq!(before.source.as_deref(), Some("installed-cache"));
        assert_eq!(before.repair_status.as_deref(), Some("ready"));
        assert_eq!(
            before.repair_source_path.as_deref(),
            Some(marketplace_root.to_string_lossy().as_ref())
        );

        let result = repair_computer_use_bundle_at(&codex_home, &cli_home).unwrap();

        assert!(result.repaired);
        assert_eq!(
            result.installed_path.as_deref(),
            Some(installed_root.to_string_lossy().as_ref())
        );
        assert_eq!(result.readiness.source.as_deref(), Some("installed-cache"));
        assert_eq!(
            result.readiness.repair_status.as_deref(),
            Some("not needed")
        );
        assert_eq!(result.readiness.helper_signature_valid, Some(true));
        assert_eq!(result.readiness.mcp_client_signature_valid, Some(true));
        assert!(installed_root.join(".hicodex-test-signed").exists());

        let _ = fs::remove_dir_all(&codex_home);
        let _ = fs::remove_dir_all(&cli_home);
    }

    #[test]
    fn refuses_computer_use_repair_without_signed_candidate() {
        let codex_home = unique_test_dir("hicodex-host-computer-use-repair-refuse-test");
        let cli_home = unique_test_dir("hicodex-host-computer-use-cli-repair-refuse-test");
        let installed_root = codex_home
            .join("plugins")
            .join("cache")
            .join(OPENAI_BUNDLED_MARKETPLACE_NAME)
            .join(OPENAI_BUNDLED_COMPUTER_USE_PLUGIN_NAME)
            .join("1.0.799");
        create_fake_computer_use_bundle(&installed_root);

        let error = repair_computer_use_bundle_at(&codex_home, &cli_home)
            .expect_err("repair should require a signed-valid source")
            .to_string();

        assert!(error.contains("No signed-valid Computer Use repair source"));

        let _ = fs::remove_dir_all(&codex_home);
        let _ = fs::remove_dir_all(&cli_home);
    }

    #[test]
    fn refuses_computer_use_repair_when_installer_signature_is_not_valid() {
        let codex_home = unique_test_dir("hicodex-host-computer-use-repair-installer-test");
        let cli_home = unique_test_dir("hicodex-host-computer-use-cli-repair-installer-test");
        let marketplace = create_fake_openai_bundled_marketplace(&cli_home);
        let marketplace_root = marketplace
            .join("plugins")
            .join(OPENAI_BUNDLED_COMPUTER_USE_PLUGIN_NAME);
        create_fake_computer_use_bundle(&marketplace_root);
        set_test_code_signature_status(&marketplace_root.join(COMPUTER_USE_APP_NAME), true);
        set_test_code_signature_status(
            &path_with_segments(&marketplace_root, COMPUTER_USE_MCP_CLIENT_RELATIVE),
            true,
        );

        let readiness = read_computer_use_readiness_at(&codex_home, &cli_home);

        assert_eq!(
            readiness.repair_status.as_deref(),
            Some("no valid signed source")
        );
        assert!(!readiness.repair_source_available);

        let _ = fs::remove_dir_all(&codex_home);
        let _ = fs::remove_dir_all(&cli_home);
    }

    #[test]
    fn refuses_computer_use_repair_when_mcp_config_is_not_trusted() {
        let codex_home = unique_test_dir("hicodex-host-computer-use-repair-mcp-config-test");
        let cli_home = unique_test_dir("hicodex-host-computer-use-cli-mcp-config-test");
        let marketplace = create_fake_openai_bundled_marketplace(&cli_home);
        let marketplace_root = marketplace
            .join("plugins")
            .join(OPENAI_BUNDLED_COMPUTER_USE_PLUGIN_NAME);
        create_fake_computer_use_bundle(&marketplace_root);
        mark_fake_computer_use_bundle_signed(&marketplace_root);
        fs::write(
            marketplace_root.join(COMPUTER_USE_MCP_CONFIG_FILENAME),
            serde_json::to_string(&json!({
                "mcpServers": {
                    "computer-use": {
                        "command": "/tmp/not-sky-computer-use-client",
                        "args": ["serve"],
                        "cwd": "/tmp"
                    }
                }
            }))
            .unwrap(),
        )
        .unwrap();

        let readiness = read_computer_use_readiness_at(&codex_home, &cli_home);

        assert_eq!(
            readiness.repair_status.as_deref(),
            Some("no valid signed source")
        );
        assert!(!readiness.repair_source_available);
        assert_eq!(readiness.mcp_config_trusted, Some(false));
        let status = readiness.mcp_config_status.unwrap_or_default();
        assert!(status.contains("command must resolve to bundled SkyComputerUseClient"));
        assert!(status.contains("args must be exactly"));

        let _ = fs::remove_dir_all(&codex_home);
        let _ = fs::remove_dir_all(&cli_home);
    }

    #[cfg(unix)]
    #[test]
    fn refuses_computer_use_repair_when_source_contains_symlink() {
        let codex_home = unique_test_dir("hicodex-host-computer-use-repair-symlink-test");
        let cli_home = unique_test_dir("hicodex-host-computer-use-cli-repair-symlink-test");
        let installed_root = codex_home
            .join("plugins")
            .join("cache")
            .join(OPENAI_BUNDLED_MARKETPLACE_NAME)
            .join(OPENAI_BUNDLED_COMPUTER_USE_PLUGIN_NAME)
            .join("1.0.799");
        create_fake_computer_use_bundle(&installed_root);
        let marketplace = create_fake_openai_bundled_marketplace(&cli_home);
        let marketplace_root = marketplace
            .join("plugins")
            .join(OPENAI_BUNDLED_COMPUTER_USE_PLUGIN_NAME);
        create_fake_computer_use_bundle(&marketplace_root);
        mark_fake_computer_use_bundle_signed(&marketplace_root);
        std::os::unix::fs::symlink(
            marketplace_root.join(COMPUTER_USE_MCP_CONFIG_FILENAME),
            marketplace_root.join("linked-mcp.json"),
        )
        .unwrap();

        let error = repair_computer_use_bundle_at(&codex_home, &cli_home)
            .expect_err("repair should reject symlink entries")
            .to_string();

        assert!(error.contains("refuses symlink entry"));
        assert!(!installed_root.join(".hicodex-test-signed").exists());

        let _ = fs::remove_dir_all(&codex_home);
        let _ = fs::remove_dir_all(&cli_home);
    }

    #[test]
    fn reports_unknown_computer_use_readiness_when_bundle_is_missing() {
        let codex_home = unique_test_dir("hicodex-host-computer-use-missing-test");
        let cli_home = unique_test_dir("hicodex-host-computer-use-cli-missing-test");
        fs::create_dir_all(&codex_home).unwrap();
        fs::create_dir_all(&cli_home).unwrap();

        let readiness = read_computer_use_readiness_at(&codex_home, &cli_home);

        assert!(!readiness.helper_available);
        assert!(readiness.helper_app_path.is_none());
        assert!(readiness.mcp_client_path.is_none());
        assert!(readiness.mcp_config_path.is_none());
        assert!(readiness.mcp_command_path.is_none());
        assert!(readiness.mcp_command_executable.is_none());
        assert!(readiness.helper_signature_valid.is_none());
        assert!(readiness.mcp_client_signature_valid.is_none());
        assert!(readiness.plugin_root_path.is_none());
        assert_eq!(readiness.repair_status.as_deref(), Some("not found"));
        assert!(!readiness.repair_source_available);
        assert!(readiness.repair_source_path.is_none());
        assert!(readiness.candidates.is_empty());
        assert_native_permission_status(readiness.screen_recording_status.as_deref());
        assert_native_permission_status(readiness.accessibility_status.as_deref());
        assert_eq!(readiness.app_approvals_status.as_deref(), Some("unknown"));

        let _ = fs::remove_dir_all(&codex_home);
        let _ = fs::remove_dir_all(&cli_home);
    }

    #[cfg(target_os = "macos")]
    fn assert_native_permission_status(status: Option<&str>) {
        assert!(matches!(status, Some("granted" | "not granted")));
    }

    #[cfg(not(target_os = "macos"))]
    fn assert_native_permission_status(status: Option<&str>) {
        assert_eq!(status, Some("unknown"));
    }

    #[test]
    fn default_config_does_not_bake_personal_bearer_token() {
        let models_path = Path::new("/tmp/hicodex-models.json");
        let config = default_config_toml_with_api_key(models_path, None);

        assert!(!config.contains("haichao"));
        assert!(!config.contains("experimental_bearer_token"));
    }

    #[test]
    fn default_config_uses_explicit_local_api_key_when_configured() {
        let models_path = Path::new("/tmp/hicodex-models.json");
        let config = default_config_toml_with_api_key(models_path, Some("local-dev-token"));

        assert!(config.contains("experimental_bearer_token = \"local-dev-token\""));
    }

    #[test]
    fn refreshes_existing_config_with_openai_http_provider() {
        let dir = env::temp_dir().join(format!(
            "hicodex-host-openai-http-test-{}",
            std::process::id()
        ));
        let _ = fs::remove_dir_all(&dir);
        fs::create_dir_all(&dir).unwrap();
        fs::write(
            dir.join("config.toml"),
            r#"model = "gpt-5.5"
model_provider = "hicodex_local"

[model_providers.hicodex_local]
name = "HiCodex local gateway"
base_url = "http://127.0.0.1:8890/v1"
wire_api = "responses"
requires_openai_auth = false
supports_websockets = false
"#,
        )
        .unwrap();

        ensure_default_hicodex_profile(&dir).unwrap();

        let config = fs::read_to_string(dir.join("config.toml")).unwrap();
        assert_eq!(config.matches("[model_providers.openai_http]").count(), 1);
        assert!(config.contains("requires_openai_auth = true"));
        assert!(config.contains("supports_websockets = false"));
        let openai_http_block = config
            .split("[model_providers.openai_http]")
            .nth(1)
            .unwrap()
            .split("\n[")
            .next()
            .unwrap();
        assert!(!openai_http_block.contains("base_url"));

        let _ = fs::remove_dir_all(&dir);
    }

    #[test]
    fn refreshes_existing_openai_http_provider_to_chatgpt_backend_default() {
        let dir = env::temp_dir().join(format!(
            "hicodex-host-openai-http-repair-test-{}",
            std::process::id()
        ));
        let _ = fs::remove_dir_all(&dir);
        fs::create_dir_all(&dir).unwrap();
        fs::write(
            dir.join("config.toml"),
            r#"model = "gpt-5.5"
model_provider = "openai_http"

[model_providers.openai_http]
name = "OpenAI"
base_url = "https://api.openai.com/v1"
wire_api = "responses"
requires_openai_auth = true
supports_websockets = false

[model_providers.hicodex_local]
name = "HiCodex local gateway"
base_url = "http://127.0.0.1:8890/v1"
wire_api = "responses"
requires_openai_auth = false
supports_websockets = false
"#,
        )
        .unwrap();

        ensure_default_hicodex_profile(&dir).unwrap();

        let config = fs::read_to_string(dir.join("config.toml")).unwrap();
        let openai_http_block = config
            .split("[model_providers.openai_http]")
            .nth(1)
            .unwrap()
            .split("\n[")
            .next()
            .unwrap();
        assert!(!openai_http_block.contains("base_url"));
        assert!(config.contains("base_url = \"http://127.0.0.1:8890/v1\""));

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
