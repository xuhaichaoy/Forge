//! Regression guard: every Tauri command whose body does blocking work
//! (filesystem, subprocess, network-via-curl/gh, slow parsing helpers) must be
//! declared `#[tauri::command(async)]` so it runs on the async runtime's
//! worker pool instead of the macOS main thread. A blocking command left
//! synchronous stalls ALL IPC and app-server event forwarding for its whole
//! duration (historically: curl up to 180s, git/gh, unzip/textutil, file
//! pickers blocking the UI).
//!
//! The check is deliberately source-text based: it scans `src/*.rs`, pairs
//! every `#[tauri::command...]` attribute with the function that follows, and
//! looks for known-blocking substring patterns inside that function's text.
//! rustfmt (enforced in CI) guarantees top-level functions close with a
//! column-0 `}`, which is what delimits the scanned region. The scan includes
//! comments — over-triggering is fine for a guard: either mark the command
//! `(async)` or add a justified entry to `SYNC_ALLOWLIST`.

use std::fs;
use std::path::Path;

/// Substring patterns that indicate blocking work in a command body.
/// Direct syscalls plus the local one-hop helper wrappers whose bodies do the
/// fs/subprocess work (so a thin command that only delegates is still caught).
const BLOCKING_PATTERNS: &[&str] = &[
    // subprocess spawn / wait
    "new_command(",
    "Command::new(",
    ".output()",
    ".spawn()",
    "wait_with_output",
    // direct filesystem I/O
    "fs::read",
    "fs::write",
    "fs::create_dir",
    "fs::remove",
    "fs::rename",
    "fs::copy",
    "fs::metadata",
    "fs::File::open",
    // external tools (normally reached via new_command; kept for intent)
    "curl",
    "textutil",
    "unzip",
    "osascript",
    // forge-host bridge: process spawn/kill + config/rollout file I/O live
    // behind AppServerHost (see SYNC_ALLOWLIST for the two fast exceptions)
    "state.host.",
    // local helper wrappers (one hop deep) that do fs/subprocess work
    "open_path(",
    "open_existing_path(",
    "reveal_path(",
    "open_external_url(",
    "open_macos_system_settings_url(",
    "pick_file_references(",
    "pick_workspace_folder(",
    "read_document_preview(",
    "read_spreadsheet_preview(",
    "run_git(",
    "git_repo_root(",
    "git_stdout_optional(",
    "git_stdout_required(",
    "git_apply_with_stdin(",
    "read_host_git_status(",
    "create_pending_worktree(",
    "create_projectless_thread_cwd(",
    "find_rollout_recursive(",
];

/// Commands that intentionally stay synchronous (i.e. run on the main
/// thread). Each entry is (file, command, reason). Entries are verified to
/// still exist and still be sync so the allowlist cannot go stale.
const SYNC_ALLOWLIST: &[(&str, &str, &str)] = &[
    (
        "app_server.rs",
        "host_status",
        "fast in-memory Mutex snapshot + non-blocking child try_wait; the \
         installation-state refresh is memoized per codex_home",
    ),
    (
        "app_server.rs",
        "host_send_raw",
        "quick line write to the app-server stdin pipe; main-thread \
         serialization preserves JSONL write order (e.g. sendUserTurn before \
         interrupt), which a thread pool would not guarantee",
    ),
    (
        "native_shell.rs",
        "host_open_thread_window",
        "WebviewWindowBuilder: window creation/focus must run on the macOS \
         main thread",
    ),
    (
        "native_shell.rs",
        "host_open_new_window",
        "WebviewWindowBuilder: window creation must run on the macOS main \
         thread",
    ),
    (
        "native_shell.rs",
        "host_notify_turn_completed",
        "posts a native notification (main-thread UI surface) and emits an \
         event; both quick, non-blocking calls",
    ),
    (
        "native_shell.rs",
        "host_handle_deep_link_url",
        "main-window unminimize/show/set_focus are main-thread window \
         operations",
    ),
    (
        "codex_bundle.rs",
        "open_codex_bundle_window",
        "WebviewWindowBuilder: window creation/focus must run on the macOS \
         main thread (dev-only command; the single is_file probe is trivial)",
    ),
];

/// `browser_runtime.rs` is excluded from this guard: its commands are owned
/// by the browser-runtime module (window-bound webview semantics, audited and
/// migrated separately) and scanning it here would couple this guard to that
/// module's independent evolution.
const EXCLUDED_FILES: &[&str] = &["browser_runtime.rs"];

struct CommandRegion {
    file: String,
    name: String,
    is_async: bool,
    text: String,
}

/// Pair every `#[tauri::command...]` attribute with the function that follows
/// it. The region spans from the attribute line through the first subsequent
/// column-0 `}` (rustfmt closes top-level items at column 0). If a region is
/// cut short by an unusual construct the check fails open (misses patterns),
/// never falsely red.
fn parse_command_regions(file_name: &str, source: &str) -> Vec<CommandRegion> {
    let lines: Vec<&str> = source.lines().collect();
    let mut regions = Vec::new();
    let mut index = 0;
    while index < lines.len() {
        let trimmed = lines[index].trim();
        if !trimmed.starts_with("#[tauri::command") {
            index += 1;
            continue;
        }
        let is_async = trimmed.contains("async");
        let mut name = String::new();
        let mut text = String::new();
        let mut cursor = index + 1;
        while cursor < lines.len() {
            let line = lines[cursor];
            text.push_str(line);
            text.push('\n');
            if name.is_empty() && !line.trim_start().starts_with("//") {
                if let Some(position) = line.find("fn ") {
                    name = line[position + 3..]
                        .chars()
                        .take_while(|ch| ch.is_alphanumeric() || *ch == '_')
                        .collect();
                }
            }
            if line == "}" {
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
        regions.push(CommandRegion {
            file: file_name.to_string(),
            name,
            is_async,
            text,
        });
        index = cursor + 1;
    }
    regions
}

/// Collect every `.rs` file under `dir`, recursing into module subdirectories
/// (browser_runtime/, cdp/, …) so a command moved into a submodule cannot slip
/// past this guard.
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
fn blocking_tauri_commands_are_marked_async() {
    let src_dir = Path::new(env!("CARGO_MANIFEST_DIR")).join("src");
    let mut paths = Vec::new();
    collect_rs_files(&src_dir, &mut paths);

    let mut commands = Vec::new();
    for path in paths {
        let Some(file_name) = path.file_name().and_then(|name| name.to_str()) else {
            continue;
        };
        if EXCLUDED_FILES.contains(&file_name) {
            continue;
        }
        let source = fs::read_to_string(&path)
            .unwrap_or_else(|error| panic!("failed to read {file_name}: {error}"));
        commands.extend(parse_command_regions(file_name, &source));
    }

    // Scanner sanity: the desktop host currently exposes 41 commands in the
    // scanned files; a collapse far below that means the parser rotted.
    assert!(
        commands.len() >= 30,
        "scanner found only {} #[tauri::command] functions; the parsing \
         heuristics in this guard test likely need updating",
        commands.len()
    );

    // The allowlist must stay honest: every entry exists and is still sync.
    for (file, command, reason) in SYNC_ALLOWLIST {
        let region = commands
            .iter()
            .find(|region| region.file == *file && region.name == *command)
            .unwrap_or_else(|| {
                panic!(
                    "stale SYNC_ALLOWLIST entry {file}::{command} ({reason}): \
                     command no longer exists; remove or update the entry"
                )
            });
        assert!(
            !region.is_async,
            "stale SYNC_ALLOWLIST entry {file}::{command}: the command is now \
             async; remove the entry"
        );
    }

    let mut violations = Vec::new();
    for region in &commands {
        if region.is_async {
            continue;
        }
        if SYNC_ALLOWLIST
            .iter()
            .any(|(file, command, _)| region.file == *file && region.name == *command)
        {
            continue;
        }
        let hits: Vec<&str> = BLOCKING_PATTERNS
            .iter()
            .filter(|pattern| region.text.contains(*pattern))
            .copied()
            .collect();
        if !hits.is_empty() {
            violations.push(format!(
                "  {}::{} is a sync #[tauri::command] but matches blocking \
                 pattern(s) {:?}",
                region.file, region.name, hits
            ));
        }
    }
    assert!(
        violations.is_empty(),
        "blocking commands must use #[tauri::command(async)] (runs the sync \
         fn on the async runtime's worker pool, keeping the macOS main thread \
         free for IPC + event forwarding) or be added to SYNC_ALLOWLIST with \
         a main-thread justification:\n{}",
        violations.join("\n")
    );
}

#[test]
fn production_sources_use_log_macros_not_eprintln() {
    // eprintln! vanishes in a bundled GUI app (no terminal); field diagnostics
    // must go through the log plugin (see main.rs log setup). Test modules may
    // still use eprintln freely.
    let src_dir = std::path::Path::new(env!("CARGO_MANIFEST_DIR")).join("src");
    let mut offenders = Vec::new();
    scan_dir_for_eprintln(&src_dir, &mut offenders);
    assert!(
        offenders.is_empty(),
        "eprintln! in production sources (use log::warn!/info! instead): {offenders:?}"
    );
}

fn scan_dir_for_eprintln(dir: &std::path::Path, offenders: &mut Vec<String>) {
    for entry in std::fs::read_dir(dir).expect("readable src dir") {
        let path = entry.expect("dir entry").path();
        if path.is_dir() {
            scan_dir_for_eprintln(&path, offenders);
            continue;
        }
        if path.extension().and_then(|e| e.to_str()) != Some("rs") {
            continue;
        }
        let source = std::fs::read_to_string(&path).expect("readable source");
        let production = match source.find("#[cfg(test)]") {
            Some(index) => &source[..index],
            None => source.as_str(),
        };
        for (line_index, line) in production.lines().enumerate() {
            let trimmed = line.trim_start();
            // Comment lines may legitimately discuss eprintln (e.g. the log
            // plugin's rationale in main.rs) — only code lines are violations.
            if trimmed.starts_with("//") || trimmed.starts_with("*") || trimmed.starts_with("/*") {
                continue;
            }
            if line.contains("eprintln!") {
                offenders.push(format!("{}:{}", path.display(), line_index + 1));
            }
        }
    }
}
