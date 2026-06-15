use std::path::Path;

#[cfg(target_os = "macos")]
use std::path::PathBuf;
#[cfg(target_os = "macos")]
use std::process::Command;

#[cfg(test)]
use std::collections::HashMap;
#[cfg(test)]
use std::sync::Mutex;

pub(crate) fn code_signature_status_for_path(path: &Path) -> (Option<bool>, Option<String>) {
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
        if ancestor.join(".forge-test-signed").exists() {
            return Some((Some(true), Some("valid".to_string())));
        }
    }
    None
}

#[cfg(test)]
pub(crate) fn set_test_code_signature_status(path: &Path, valid: bool) {
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
type TestCodeSignatureStatus = (Option<bool>, Option<String>);

#[cfg(test)]
type TestCodeSignatureOverrides = HashMap<String, TestCodeSignatureStatus>;

#[cfg(test)]
fn test_code_signature_overrides() -> &'static Mutex<TestCodeSignatureOverrides> {
    static OVERRIDES: std::sync::OnceLock<Mutex<TestCodeSignatureOverrides>> =
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
