use serde::{Deserialize, Serialize};
use serde_json::Value;
use std::fs;
use std::path::{Path, PathBuf};

#[cfg(unix)]
use std::os::unix::fs::PermissionsExt;

use crate::signature::code_signature_status_for_path;
use crate::{
    default_codex_cli_home, openai_bundled_marketplace_path, HostError,
    OPENAI_BUNDLED_MARKETPLACE_NAME,
};

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

pub(crate) fn read_computer_use_readiness_at(
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

pub(crate) fn repair_computer_use_bundle_at(
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

fn path_with_segments(root: &Path, segments: &[&str]) -> PathBuf {
    segments
        .iter()
        .fold(root.to_path_buf(), |path, segment| path.join(segment))
}

fn existing_path_string(path: &Path) -> Option<String> {
    path.exists().then(|| path.to_string_lossy().to_string())
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::signature::set_test_code_signature_status;
    use crate::test_support::{create_fake_openai_bundled_marketplace, unique_test_dir};
    use serde_json::json;

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
        assert!(!readiness.candidates[0].usable_for_repair);
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
}
