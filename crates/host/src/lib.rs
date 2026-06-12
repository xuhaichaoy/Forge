use serde_json::Value;
use std::env;
use std::path::{Path, PathBuf};
use thiserror::Error;

mod auth;
mod computer_use;
mod host;
mod installation;
mod profile;
mod rollout_items;
mod signature;
#[cfg(test)]
mod test_support;
mod thread_history;

pub use crate::auth::CodexAuthSummary;
pub use crate::computer_use::{
    ComputerUseBundleCandidate, ComputerUseReadiness, ComputerUseRepairResult,
};
pub use crate::host::{AppServerEvent, AppServerHost, AppServerStartConfig, HostStatus};
pub use crate::installation::HostInstallationState;
pub use crate::profile::LocalModelCatalogConfig;
pub use crate::thread_history::{ThreadToolHistory, ThreadToolHistoryTurn};

pub(crate) const OPENAI_BUNDLED_MARKETPLACE_NAME: &str = "openai-bundled";

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

pub(crate) fn resolve_codex_home(configured: Option<&str>) -> PathBuf {
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

pub(crate) fn default_codex_cli_home() -> PathBuf {
    user_home_dir()
        .unwrap_or_else(|| Path::new(".").to_path_buf())
        .join(".codex")
}

pub(crate) fn has_codex_profile(path: &Path) -> bool {
    path.join("auth.json").exists() || path.join("config.toml").exists()
}

pub(crate) fn string_value(value: Option<&Value>) -> Option<String> {
    value.and_then(Value::as_str).map(ToOwned::to_owned)
}

pub(crate) fn openai_bundled_marketplace_path(codex_cli_home: &Path) -> Option<PathBuf> {
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
}
