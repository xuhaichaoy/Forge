use serde::{Deserialize, Serialize};
use serde_json::Value;
use std::env;
use std::fs;
use std::io::{BufRead, BufReader, Write};
use std::path::{Path, PathBuf};
use std::process::{Child, ChildStdin, Command, Stdio};
use std::sync::mpsc::{self, Receiver, Sender};
use std::sync::Arc;
use std::sync::Mutex;
use std::thread;
use std::time::{SystemTime, UNIX_EPOCH};

use crate::auth::{read_codex_auth_summary, CodexAuthSummary};
use crate::computer_use::{
    read_computer_use_readiness_at, repair_computer_use_bundle_at, ComputerUseReadiness,
    ComputerUseRepairResult,
};
use crate::installation::{read_or_init_installation_state_at, HostInstallationState};
use crate::profile::{ensure_default_forge_profile, model_catalog_json, LocalModelCatalogConfig};
use crate::thread_history::{read_thread_tool_history, ThreadToolHistory};
use crate::{default_codex_cli_home, has_codex_profile, resolve_codex_home, HostError};

const INSTALLED_CODEX_BIN: &str = "/Applications/Codex.app/Contents/Resources/codex";
// Webview-independent persistence for desktop.hicodex.* settings: WKWebView
// localStorage is keyed by the app bundle identifier, so a rebrand or webview
// data-container change wipes it. codex-home survives those, making it the
// durable home for connection/auth/model-selection settings.
// The "hicodex-" filename (like the desktop.hicodex.* key prefix) is a
// deliberate legacy value kept across the Forge rebrand — renaming it would
// orphan existing users' settings.
const APP_SETTINGS_FILENAME: &str = "hicodex-app-settings.json";

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

/// Machine-readable classification for [`AppServerEvent::Lifecycle`]. The
/// renderer keys connection-state decisions (fatal vs. benign) off this field
/// instead of parsing the human-readable `message`, which stays byte-for-byte
/// unchanged for logs and for older clients that still match on text.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum LifecycleKind {
    /// app-server child process spawned and its stdio is wired up.
    Started,
    /// An explicit `stop()` tore the process down.
    Stopped,
    /// The child process exited on its own (crash or external kill).
    Exited,
    /// The stdout reader hit EOF — the transport is gone even if a pid lingers.
    StdoutClosed,
    /// codex-home has no config.toml/auth.json yet; informational only.
    ConfigMissing,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(tag = "type", rename_all = "camelCase")]
pub enum AppServerEvent {
    Json {
        value: Value,
    },
    Stdout {
        line: String,
    },
    Stderr {
        line: String,
    },
    Lifecycle {
        kind: LifecycleKind,
        message: String,
    },
    Error {
        message: String,
    },
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
        if let Err(error) = ensure_default_forge_profile(&codex_home) {
            inner.last_error = Some(error.to_string());
            return Err(HostError::Start(error.to_string()));
        }
        if !has_codex_profile(&codex_home) {
            let _ = self.events_tx.send(AppServerEvent::Lifecycle {
                kind: LifecycleKind::ConfigMissing,
                message: format!(
                    "no Codex config found in {}; add config.toml/auth.json before sending turns",
                    codex_home.to_string_lossy()
                ),
            });
        }

        let mut command = Command::new(&codex_bin);
        // codex.exe is a console-subsystem binary: spawned from the GUI app on
        // Windows it would open its own black console window at startup unless
        // CREATE_NO_WINDOW is set. Stdio stays piped either way.
        #[cfg(target_os = "windows")]
        {
            use std::os::windows::process::CommandExt;
            const CREATE_NO_WINDOW: u32 = 0x0800_0000;
            command.creation_flags(CREATE_NO_WINDOW);
        }
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
            kind: LifecycleKind::Started,
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
            kind: LifecycleKind::Stopped,
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
        write_file_atomically(&models_path, model_catalog_json(&config).as_bytes())
            .map_err(|error| HostError::Profile(error.to_string()))?;
        Ok(models_path.to_string_lossy().to_string())
    }

    pub fn read_app_settings(&self, codex_home: Option<String>) -> Result<String, HostError> {
        let codex_home = resolve_codex_home(codex_home.as_deref());
        let path = codex_home.join(APP_SETTINGS_FILENAME);
        if !path.is_file() {
            return Ok(String::new());
        }
        fs::read_to_string(&path).map_err(|error| HostError::Profile(error.to_string()))
    }

    pub fn write_app_settings(
        &self,
        codex_home: Option<String>,
        settings_json: String,
    ) -> Result<(), HostError> {
        let codex_home = resolve_codex_home(codex_home.as_deref());
        fs::create_dir_all(&codex_home).map_err(|error| HostError::Profile(error.to_string()))?;
        let path = codex_home.join(APP_SETTINGS_FILENAME);
        let tmp_path = codex_home.join(format!("{APP_SETTINGS_FILENAME}.tmp"));
        fs::write(&tmp_path, settings_json)
            .map_err(|error| HostError::Profile(error.to_string()))?;
        fs::rename(&tmp_path, &path).map_err(|error| HostError::Profile(error.to_string()))
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
/// Forge 之前用 `env::current_dir()`——Tauri dev 模式下进程 CWD 是
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
            let _ = events_tx.send(AppServerEvent::Lifecycle {
                kind: LifecycleKind::Exited,
                message,
            });
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
            kind: LifecycleKind::StdoutClosed,
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
    // FORGE_CODEX_BIN wins; the legacy HICODEX_CODEX_BIN spelling stays as a
    // fallback so pre-rebrand setups keep working.
    if let Ok(path) = env::var("FORGE_CODEX_BIN").or_else(|_| env::var("HICODEX_CODEX_BIN")) {
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

fn write_file_atomically(path: &Path, contents: &[u8]) -> std::io::Result<()> {
    let parent = path.parent().unwrap_or_else(|| Path::new("."));
    let file_name = path
        .file_name()
        .map(|value| value.to_string_lossy())
        .unwrap_or_else(|| "file".into());
    let nonce = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|duration| duration.as_nanos())
        .unwrap_or(0);
    let tmp_path = parent.join(format!(".{file_name}.tmp-{}-{nonce}", std::process::id()));

    fs::write(&tmp_path, contents)?;
    if let Err(error) = fs::rename(&tmp_path, path) {
        let _ = fs::remove_file(&tmp_path);
        return Err(error);
    }
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn parses_json_stdout_as_event() {
        let value: Value = serde_json::json!({"id": 1, "result": {}});
        let line = serde_json::to_string(&value).unwrap();
        let parsed: Value = serde_json::from_str(&line).unwrap();
        assert_eq!(parsed["id"], 1);
    }

    /// Cross-language contract: the renderer consumes `kind` as a plain
    /// snake_case string next to the untouched human-readable `message`.
    #[test]
    fn lifecycle_event_serializes_machine_readable_kind() {
        let event = AppServerEvent::Lifecycle {
            kind: LifecycleKind::StdoutClosed,
            message: "codex app-server stdout closed".to_string(),
        };
        let value = serde_json::to_value(&event).unwrap();
        assert_eq!(
            value,
            serde_json::json!({
                "type": "lifecycle",
                "kind": "stdout_closed",
                "message": "codex app-server stdout closed",
            })
        );
    }

    /// The wire spellings are load-bearing for the renderer's classifier —
    /// renaming a variant must fail here, not in the field.
    #[test]
    fn lifecycle_kind_wire_spellings_are_stable() {
        for (kind, expected) in [
            (LifecycleKind::Started, "started"),
            (LifecycleKind::Stopped, "stopped"),
            (LifecycleKind::Exited, "exited"),
            (LifecycleKind::StdoutClosed, "stdout_closed"),
            (LifecycleKind::ConfigMissing, "config_missing"),
        ] {
            assert_eq!(
                serde_json::to_value(kind).unwrap(),
                serde_json::json!(expected)
            );
        }
    }

    #[test]
    fn write_local_model_catalog_replaces_catalog_via_valid_json_file() {
        let dir = env::temp_dir().join(format!("forge-host-model-catalog-{}", std::process::id()));
        let _ = fs::remove_dir_all(&dir);
        fs::create_dir_all(&dir).unwrap();
        fs::write(dir.join("models.json"), b"{").unwrap();

        let host = AppServerHost::new();
        let path = host
            .write_local_model_catalog(
                Some(dir.to_string_lossy().to_string()),
                LocalModelCatalogConfig {
                    model: "team-a".to_string(),
                    models: Some(vec!["team-a".to_string(), "team-b".to_string()]),
                    display_name: Some("Team A".to_string()),
                    description: None,
                    context_window: None,
                    auto_compact_token_limit: None,
                    input_modalities: None,
                },
            )
            .unwrap();

        assert_eq!(Path::new(&path), dir.join("models.json"));
        let catalog: Value =
            serde_json::from_str(&fs::read_to_string(dir.join("models.json")).unwrap()).unwrap();
        assert_eq!(catalog["models"][0]["slug"].as_str(), Some("team-a"));
        assert_eq!(catalog["models"][1]["slug"].as_str(), Some("team-b"));
        let temp_entries = fs::read_dir(&dir)
            .unwrap()
            .filter_map(Result::ok)
            .filter(|entry| entry.file_name().to_string_lossy().contains(".tmp-"))
            .count();
        assert_eq!(temp_entries, 0);

        let _ = fs::remove_dir_all(&dir);
    }
}
