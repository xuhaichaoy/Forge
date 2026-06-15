//! Regression guard: every fallible Tauri command must reject with the shared
//! structured error contract (`command_error::HostCommandError`, serialized as
//! `{ code, message }`), never with a bare `String`. The webview's
//! `toHostCommandError` normalizer matches on the stable `code`; a command
//! that slips back to `Result<_, String>` silently downgrades its rejections
//! to the legacy text-only shape.
//!
//! The check is deliberately source-text based (same approach as
//! `blocking_commands_use_async.rs`): it scans `src/*.rs`, pairs every
//! `#[tauri::command...]` attribute with the signature of the function that
//! follows, and inspects the declared return type. rustfmt (enforced in CI)
//! guarantees the signature ends with a line whose last character is `{`.

use std::fs;
use std::path::Path;

/// Commands that intentionally return a plain (non-`Result`) value — they
/// cannot reject, so the error contract does not apply. Each entry is
/// (file, command, reason) and is verified to still exist and still be
/// non-`Result` so the allowlist cannot go stale.
const NO_RESULT_ALLOWLIST: &[(&str, &str, &str)] = &[
    (
        "app_server.rs",
        "host_status",
        "infallible in-memory status snapshot",
    ),
    (
        "browser_runtime.rs",
        "host_browser_runtime_status",
        "infallible status snapshot from the browser-runtime store",
    ),
];

struct CommandSignature {
    file: String,
    name: String,
    /// Text after the last `->` in the signature, e.g.
    /// `Result<HostStatus, HostCommandError>`; empty when the fn has no
    /// declared return type.
    return_type: String,
}

/// Pair every `#[tauri::command...]` attribute with the signature of the
/// function that follows it. The signature spans from the `fn` line through
/// the first line that ends with `{` (rustfmt opens the body there). If a
/// signature is cut short by an unusual construct the test fails loudly via
/// the no-name assertion rather than silently skipping commands.
fn parse_command_signatures(file_name: &str, source: &str) -> Vec<CommandSignature> {
    let lines: Vec<&str> = source.lines().collect();
    let mut signatures = Vec::new();
    let mut index = 0;
    while index < lines.len() {
        let trimmed = lines[index].trim();
        if !trimmed.starts_with("#[tauri::command") {
            index += 1;
            continue;
        }
        let mut name = String::new();
        let mut signature = String::new();
        let mut cursor = index + 1;
        while cursor < lines.len() {
            let line = lines[cursor];
            let line_trimmed = line.trim();
            // Skip doc/regular comment lines between the attribute and the fn.
            if name.is_empty() && (line_trimmed.starts_with("//") || line_trimmed.is_empty()) {
                cursor += 1;
                continue;
            }
            if name.is_empty() {
                if let Some(position) = line.find("fn ") {
                    name = line[position + 3..]
                        .chars()
                        .take_while(|ch| ch.is_alphanumeric() || *ch == '_')
                        .collect();
                }
            }
            signature.push_str(line);
            signature.push('\n');
            if line.trim_end().ends_with('{') {
                break;
            }
            cursor += 1;
        }
        assert!(
            !name.is_empty(),
            "{file_name}: #[tauri::command] near line {} has no following fn; \
             update the parser in this guard test",
            index + 1
        );
        let body_open = signature.rfind('{').unwrap_or(signature.len());
        let header = &signature[..body_open];
        let return_type = header
            .rfind("->")
            .map(|arrow| header[arrow + 2..].trim().to_string())
            .unwrap_or_default();
        signatures.push(CommandSignature {
            file: file_name.to_string(),
            name,
            return_type,
        });
        index = cursor + 1;
    }
    signatures
}

/// Collect every `.rs` file under `dir`, recursing into module subdirectories
/// so a command in a submodule cannot slip past this guard.
fn collect_rs_files(dir: &Path, out: &mut Vec<std::path::PathBuf>) {
    let mut entries: Vec<_> = fs::read_dir(dir)
        .expect("read src dir")
        .map(|entry| entry.expect("read src dir entry").path())
        .collect();
    entries.sort();
    for path in entries {
        if path.is_dir() {
            collect_rs_files(&path, out);
        } else if path.extension().and_then(|ext| ext.to_str()) == Some("rs") {
            out.push(path);
        }
    }
}

#[test]
fn fallible_tauri_commands_reject_with_host_command_error() {
    let src_dir = Path::new(env!("CARGO_MANIFEST_DIR")).join("src");
    let mut paths = Vec::new();
    collect_rs_files(&src_dir, &mut paths);

    let mut commands = Vec::new();
    for path in paths {
        let Some(file_name) = path.file_name().and_then(|name| name.to_str()) else {
            continue;
        };
        let source = fs::read_to_string(&path)
            .unwrap_or_else(|error| panic!("failed to read {file_name}: {error}"));
        commands.extend(parse_command_signatures(file_name, &source));
    }

    // Scanner sanity: the desktop host currently exposes 43 commands across
    // `src/*.rs`; a collapse far below that means the parser rotted.
    assert!(
        commands.len() >= 35,
        "scanner found only {} #[tauri::command] functions; the parsing \
         heuristics in this guard test likely need updating",
        commands.len()
    );

    // The allowlist must stay honest: every entry exists and is still a
    // non-Result command.
    for (file, command, reason) in NO_RESULT_ALLOWLIST {
        let signature = commands
            .iter()
            .find(|signature| signature.file == *file && signature.name == *command)
            .unwrap_or_else(|| {
                panic!(
                    "stale NO_RESULT_ALLOWLIST entry {file}::{command} ({reason}): \
                     command no longer exists; remove or update the entry"
                )
            });
        assert!(
            !signature.return_type.contains("Result<"),
            "stale NO_RESULT_ALLOWLIST entry {file}::{command}: the command now \
             returns a Result; remove the entry and use HostCommandError"
        );
    }

    let mut violations = Vec::new();
    for command in &commands {
        if !command.return_type.contains("Result<") {
            // Non-Result commands cannot reject; require a conscious allowlist
            // entry so new infallible commands are an explicit decision.
            let allowlisted = NO_RESULT_ALLOWLIST
                .iter()
                .any(|(file, name, _)| command.file == *file && command.name == *name);
            if !allowlisted {
                violations.push(format!(
                    "  {}::{} returns non-Result `{}`; if intentional add it to \
                     NO_RESULT_ALLOWLIST",
                    command.file, command.name, command.return_type
                ));
            }
            continue;
        }
        if !command.return_type.contains("HostCommandError") {
            violations.push(format!(
                "  {}::{} returns `{}`; fallible commands must use \
                 Result<_, command_error::HostCommandError> so the webview \
                 receives the structured {{ code, message }} rejection",
                command.file, command.name, command.return_type
            ));
        }
    }
    assert!(
        violations.is_empty(),
        "Tauri commands must reject with the shared structured error contract \
         (apps/desktop/src-tauri/src/command_error.rs):\n{}",
        violations.join("\n")
    );
}
