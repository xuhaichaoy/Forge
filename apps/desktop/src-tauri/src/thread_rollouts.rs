use forge_host::ThreadToolHistory;
use std::env;
use std::fs;
use std::path::Path;
use tauri::State;

use crate::command_error::HostCommandError;
use crate::AppState;

/// Recover the rollout JSONL path for a given thread by scanning the
/// app's sessions directory. Used as a fallback when `Thread.path` is
/// missing in client state (e.g. the thread was loaded from a stale local
/// snapshot) but the rollout file still exists on disk. The app-server's
/// `thread/resume {path}` (codex-rs:thread_processor.rs:2810
/// `read_thread_by_rollout_path`) bypasses the in-memory + `session_index`
/// lookup that is producing "thread not found".
///
/// Returns `Ok(None)` (rather than `Err`) when the file is not found so the
/// caller can decide whether to fall through to a friendlier error.
#[tauri::command(async)]
pub(crate) fn host_find_rollout_for_thread(
    codex_home: Option<String>,
    thread_id: String,
) -> Result<Option<String>, HostCommandError> {
    let id = thread_id.trim();
    if id.is_empty() {
        return Ok(None);
    }
    let sessions_root = match codex_home
        .as_deref()
        .map(str::trim)
        .filter(|s| !s.is_empty())
    {
        Some(home) => Path::new(home).join("sessions"),
        None => match env::var_os("HOME") {
            Some(home) => {
                Path::new(&home).join("Library/Application Support/Forge/codex-home/sessions")
            }
            None => return Ok(None),
        },
    };
    if !sessions_root.is_dir() {
        return Ok(None);
    }
    find_rollout_recursive(&sessions_root, id, 4)
        .map_err(|err| HostCommandError::io_failed(err.to_string()))
}

fn find_rollout_recursive(
    dir: &Path,
    thread_id: &str,
    max_depth: usize,
) -> std::io::Result<Option<String>> {
    if max_depth == 0 {
        return Ok(None);
    }
    let mut dirs: Vec<std::path::PathBuf> = Vec::new();
    for entry in fs::read_dir(dir)? {
        let entry = entry?;
        let file_type = entry.file_type()?;
        if file_type.is_dir() {
            dirs.push(entry.path());
            continue;
        }
        if !file_type.is_file() {
            continue;
        }
        let path = entry.path();
        let Some(name) = path.file_name().and_then(|v| v.to_str()) else {
            continue;
        };
        // `rollout-<iso-date>-<thread-id>.jsonl`
        if name.starts_with("rollout-") && name.contains(thread_id) && name.ends_with(".jsonl") {
            return Ok(Some(path.to_string_lossy().to_string()));
        }
    }
    for sub in dirs {
        if let Some(found) = find_rollout_recursive(&sub, thread_id, max_depth - 1)? {
            return Ok(Some(found));
        }
    }
    Ok(None)
}

#[tauri::command(async)]
pub(crate) fn host_read_thread_tool_history(
    state: State<'_, AppState>,
    codex_home: Option<String>,
    thread_id: String,
    thread_path: Option<String>,
) -> Result<ThreadToolHistory, HostCommandError> {
    state
        .host
        .read_thread_tool_history(codex_home, thread_id, thread_path)
        .map_err(HostCommandError::from)
}

#[cfg(test)]
mod find_rollout_tests {
    use super::find_rollout_recursive;
    use std::fs;
    use std::io::Write;
    use std::path::PathBuf;
    use std::time::{SystemTime, UNIX_EPOCH};

    fn temp_dir() -> PathBuf {
        let nanos = SystemTime::now()
            .duration_since(UNIX_EPOCH)
            .map(|value| value.as_nanos())
            .unwrap_or_default();
        let base =
            std::env::temp_dir().join(format!("forge-find-rollout-{}-{nanos}", std::process::id()));
        let _ = fs::remove_dir_all(&base);
        fs::create_dir_all(&base).unwrap();
        base
    }

    fn touch(path: &PathBuf) {
        if let Some(parent) = path.parent() {
            fs::create_dir_all(parent).unwrap();
        }
        let mut file = fs::File::create(path).unwrap();
        writeln!(file, "{{}}").unwrap();
    }

    #[test]
    fn locates_rollout_by_thread_id_through_year_month_day_layout() {
        let root = temp_dir();
        let target = root
            .join("2026/05/13")
            .join("rollout-2026-05-13T06-43-27-019e1e5c-0434-7623-9622-bba23d1dc878.jsonl");
        let unrelated = root
            .join("2026/05/13")
            .join("rollout-2026-05-13T06-44-00-aaaaaaaa-0000-0000-0000-000000000000.jsonl");
        touch(&target);
        touch(&unrelated);

        let found =
            find_rollout_recursive(&root, "019e1e5c-0434-7623-9622-bba23d1dc878", 4).unwrap();
        assert_eq!(found, Some(target.to_string_lossy().to_string()));
    }

    #[test]
    fn returns_none_when_no_file_matches() {
        let root = temp_dir();
        let unrelated = root
            .join("2026/05/13")
            .join("rollout-2026-05-13T06-44-00-xyz.jsonl");
        touch(&unrelated);
        let found = find_rollout_recursive(&root, "thread-missing", 4).unwrap();
        assert!(found.is_none());
    }

    #[test]
    fn respects_max_depth_to_avoid_runaway_traversal() {
        let root = temp_dir();
        let deep = root.join("a/b/c/d/e/rollout-2026-05-13T06-44-00-deepid.jsonl");
        touch(&deep);
        // max_depth = 2 stops before reaching the deep file (a/b only).
        assert!(find_rollout_recursive(&root, "deepid", 2)
            .unwrap()
            .is_none());
        // max_depth = 8 reaches it.
        assert_eq!(
            find_rollout_recursive(&root, "deepid", 8).unwrap(),
            Some(deep.to_string_lossy().to_string()),
        );
    }
}
