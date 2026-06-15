use forge_host::HostError;
use serde::Serialize;

/// Renderer-facing structured error payload shared by every fallible Tauri
/// command. Tauri serializes the `Err` value as the invoke rejection, so the
/// webview receives `{ code, message }` and can match on the stable `code`
/// instead of parsing text. `message` carries the unchanged human-readable
/// error string (byte-identical to the previous plain-`String` contract) for
/// logs and for older renderers that still classify by text.
///
/// `code` comes from one of two stable vocabularies:
/// - `HostError::code()` for errors bridged from `forge_host` (e.g.
///   "already_running", "profile_failed") via the `From` impl below;
/// - the failure-class constructors on this type (`invalid_input`,
///   "not_found", "io_failed", "process_failed", "parse_failed",
///   "unsupported") for errors produced in the command layer itself. The
///   constructor name IS the wire code — renaming one is a breaking IPC
///   change.
#[derive(Debug, Serialize)]
pub(crate) struct HostCommandError {
    pub(crate) code: &'static str,
    pub(crate) message: String,
}

impl HostCommandError {
    fn with_code(code: &'static str, message: impl Into<String>) -> Self {
        Self {
            code,
            message: message.into(),
        }
    }

    /// A caller-supplied argument failed validation (empty/forbidden value,
    /// unsupported format, escaped sandbox path, ...).
    pub(crate) fn invalid_input(message: impl Into<String>) -> Self {
        Self::with_code("invalid_input", message)
    }

    /// A referenced resource (file, directory, repository, binary, window
    /// asset) does not exist or is not available.
    pub(crate) fn not_found(message: impl Into<String>) -> Self {
        Self::with_code("not_found", message)
    }

    /// Filesystem I/O failed (read/write/create/canonicalize).
    pub(crate) fn io_failed(message: impl Into<String>) -> Self {
        Self::with_code("io_failed", message)
    }

    /// A subprocess or OS-level operation failed (spawn/exit-status/stdio,
    /// window creation, notification posting).
    pub(crate) fn process_failed(message: impl Into<String>) -> Self {
        Self::with_code("process_failed", message)
    }

    /// Data could not be parsed or serialized (JSON, URLs, preview formats).
    pub(crate) fn parse_failed(message: impl Into<String>) -> Self {
        Self::with_code("parse_failed", message)
    }

    /// The operation is not supported on this platform or for this resource.
    pub(crate) fn unsupported(message: impl Into<String>) -> Self {
        Self::with_code("unsupported", message)
    }
}

impl From<HostError> for HostCommandError {
    fn from(error: HostError) -> Self {
        Self {
            code: error.code(),
            message: error.to_string(),
        }
    }
}

/// Display is the bare message (no code prefix) so log call sites that
/// previously formatted the plain `String` error keep byte-identical output.
impl std::fmt::Display for HostCommandError {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        f.write_str(&self.message)
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    /// IPC contract pin: the webview's `toHostCommandError` normalizer reads
    /// exactly this `{ code, message }` shape from the invoke rejection, with
    /// `message` byte-identical to the `HostError` Display text.
    #[test]
    fn host_command_error_serializes_code_and_message() {
        let error = HostCommandError::from(HostError::AlreadyRunning);
        let value = serde_json::to_value(&error).unwrap();
        assert_eq!(
            value,
            serde_json::json!({
                "code": "already_running",
                "message": "codex app-server is already running",
            })
        );
    }

    /// Wire-contract pin: the constructor name IS the stable code.
    #[test]
    fn failure_class_constructors_stamp_stable_wire_codes() {
        assert_eq!(HostCommandError::invalid_input("m").code, "invalid_input");
        assert_eq!(HostCommandError::not_found("m").code, "not_found");
        assert_eq!(HostCommandError::io_failed("m").code, "io_failed");
        assert_eq!(HostCommandError::process_failed("m").code, "process_failed");
        assert_eq!(HostCommandError::parse_failed("m").code, "parse_failed");
        assert_eq!(HostCommandError::unsupported("m").code, "unsupported");
    }

    /// Display must stay the bare message so `format!("{error}")` log lines
    /// keep the exact text they printed when the error was a plain String.
    #[test]
    fn display_is_the_bare_message() {
        assert_eq!(
            HostCommandError::not_found("path does not exist: /x").to_string(),
            "path does not exist: /x"
        );
    }
}
