use serde::Serialize;
use std::fs;
use std::path::Path;

use crate::command_error::HostCommandError;

// ============================================================================
// codex: use-workspace-file-search-C73UkUkc — the hard-coded directory excludes
// used when walking a workspace. Mirrors Codex Desktop's exclusion set so
// `node_modules`, `.git`, build outputs, etc. never show up in the file tree.
// ============================================================================
const WORKSPACE_DIR_EXCLUDES: &[&str] = &[
    ".git",
    ".hg",
    ".next",
    ".pnpm-store",
    ".svn",
    ".turbo",
    ".yarn",
    "build",
    "coverage",
    "dist",
    "node_modules",
];

#[derive(Debug, Serialize)]
struct WorkspaceDirEntry {
    // codex: workspace-directory-tree :j entries shape — `{ type, path }` with
    // `type ∈ {'directory','file'}`. We also send `name` so the renderer does
    // not have to split the path again.
    #[serde(rename = "type")]
    kind: &'static str,
    path: String,
    name: String,
}

#[derive(Debug, Serialize)]
pub(crate) struct WorkspaceListDirResponse {
    entries: Vec<WorkspaceDirEntry>,
}

#[tauri::command(async)]
pub(crate) fn host_workspace_list_dir(
    root: String,
    dir_path: String,
    include_hidden: bool,
) -> Result<WorkspaceListDirResponse, HostCommandError> {
    // codex: workspace-directory-tree-CHHgPVoD :_e — non-recursive direct-children
    // listing keyed on (root, dirPath). Renderer drives recursion via expand.
    let root_trimmed = root.trim();
    if root_trimmed.is_empty() {
        return Err(HostCommandError::invalid_input("workspace root is empty"));
    }
    let root_path = Path::new(root_trimmed);
    if !root_path.is_dir() {
        return Err(HostCommandError::not_found(format!(
            "workspace root is not a directory: {root_trimmed}"
        )));
    }
    let root_canonical = root_path.canonicalize().map_err(|error| {
        HostCommandError::io_failed(format!("failed to resolve workspace root: {error}"))
    })?;

    let dir_trimmed = dir_path.trim();
    let requested_dir = if dir_trimmed.is_empty() {
        root_canonical.clone()
    } else {
        let relative_dir = Path::new(dir_trimmed);
        if relative_dir.is_absolute() {
            return Err(HostCommandError::invalid_input(
                "workspace path must be relative to the workspace root",
            ));
        }
        // Reject `..` segments outright to avoid escaping the workspace root.
        if dir_trimmed
            .split(['/', '\\'])
            .any(|segment| segment == "..")
        {
            return Err(HostCommandError::invalid_input(
                "workspace path cannot contain '..' segments",
            ));
        }
        root_canonical.join(relative_dir)
    };
    let abs_dir = requested_dir.canonicalize().map_err(|_| {
        HostCommandError::not_found(format!("not a directory: {}", requested_dir.display()))
    })?;
    if !abs_dir.starts_with(&root_canonical) {
        return Err(HostCommandError::invalid_input(
            "workspace path escapes the workspace root",
        ));
    }
    if !abs_dir.is_dir() {
        return Err(HostCommandError::not_found(format!(
            "not a directory: {}",
            abs_dir.display()
        )));
    }

    let mut entries: Vec<WorkspaceDirEntry> = Vec::new();
    let read_iter = fs::read_dir(&abs_dir).map_err(|error| {
        HostCommandError::io_failed(format!("failed to read directory: {error}"))
    })?;
    for raw_entry in read_iter {
        let entry = raw_entry.map_err(|error| {
            HostCommandError::io_failed(format!("failed to read directory entry: {error}"))
        })?;
        let file_name = entry.file_name();
        let name = file_name.to_string_lossy().to_string();

        // codex: use-workspace-file-search excluded names — applied to directories
        // (we still allow hidden files when `include_hidden` is true so users can
        // see `.npmrc`, `.gitignore`, etc.).
        if !include_hidden && name.starts_with('.') {
            continue;
        }
        let file_type = match entry.file_type() {
            Ok(ft) => ft,
            Err(_) => continue,
        };
        let is_dir = file_type.is_dir();
        if is_dir && WORKSPACE_DIR_EXCLUDES.contains(&name.as_str()) {
            continue;
        }

        // Build the relative-to-root path with POSIX separators so the renderer
        // can use string comparison consistently across platforms.
        let abs_child = entry.path();
        let rel_path = abs_child
            .strip_prefix(&root_canonical)
            .map(|p| p.to_string_lossy().replace('\\', "/"))
            .unwrap_or_else(|_| name.clone());

        entries.push(WorkspaceDirEntry {
            kind: if is_dir { "directory" } else { "file" },
            path: rel_path,
            name,
        });
    }

    // codex: workspace-directory-tree :_e default ordering — directories first,
    // then case-insensitive by name. Keeps the renderer stable across runs.
    entries.sort_by(|a, b| {
        let dir_a = a.kind == "directory";
        let dir_b = b.kind == "directory";
        match (dir_a, dir_b) {
            (true, false) => std::cmp::Ordering::Less,
            (false, true) => std::cmp::Ordering::Greater,
            _ => a.name.to_lowercase().cmp(&b.name.to_lowercase()),
        }
    });

    Ok(WorkspaceListDirResponse { entries })
}

#[cfg(test)]
mod tests {
    use super::host_workspace_list_dir;
    use std::fs;
    use std::path::PathBuf;
    use std::time::{SystemTime, UNIX_EPOCH};

    fn temp_dir() -> PathBuf {
        // pid+nanos alone can collide across parallel test threads (the clock
        // quantizes), and the remove_dir_all below then deletes the other
        // test's fixture mid-run — the counter makes every dir unique.
        static TEMP_DIR_SEQ: std::sync::atomic::AtomicU64 = std::sync::atomic::AtomicU64::new(0);
        let seq = TEMP_DIR_SEQ.fetch_add(1, std::sync::atomic::Ordering::Relaxed);
        let nanos = SystemTime::now()
            .duration_since(UNIX_EPOCH)
            .map(|value| value.as_nanos())
            .unwrap_or_default();
        let dir = std::env::temp_dir().join(format!(
            "forge-workspace-files-{}-{nanos}-{seq}",
            std::process::id()
        ));
        let _ = fs::remove_dir_all(&dir);
        fs::create_dir_all(&dir).unwrap();
        dir
    }

    #[test]
    fn lists_direct_children_with_directories_first_and_excludes_build_dirs() {
        let root = temp_dir();
        fs::create_dir(root.join("src")).unwrap();
        fs::create_dir(root.join("node_modules")).unwrap();
        fs::write(root.join("b.txt"), "b").unwrap();
        fs::write(root.join("A.txt"), "a").unwrap();

        let response =
            host_workspace_list_dir(root.to_string_lossy().to_string(), String::new(), false)
                .unwrap();

        let entries = response
            .entries
            .iter()
            .map(|entry| (entry.kind, entry.name.as_str(), entry.path.as_str()))
            .collect::<Vec<_>>();
        assert_eq!(
            entries,
            vec![
                ("directory", "src", "src"),
                ("file", "A.txt", "A.txt"),
                ("file", "b.txt", "b.txt"),
            ]
        );
        let _ = fs::remove_dir_all(root);
    }

    #[test]
    fn hidden_files_are_optional_but_excluded_dirs_stay_hidden() {
        let root = temp_dir();
        fs::create_dir(root.join(".git")).unwrap();
        fs::write(root.join(".npmrc"), "registry=x").unwrap();
        fs::write(root.join("visible.txt"), "ok").unwrap();

        let hidden_off =
            host_workspace_list_dir(root.to_string_lossy().to_string(), String::new(), false)
                .unwrap();
        assert_eq!(hidden_off.entries.len(), 1);
        assert_eq!(hidden_off.entries[0].name, "visible.txt");

        let hidden_on =
            host_workspace_list_dir(root.to_string_lossy().to_string(), String::new(), true)
                .unwrap();
        let names = hidden_on
            .entries
            .iter()
            .map(|entry| entry.name.as_str())
            .collect::<Vec<_>>();
        assert_eq!(names, vec![".npmrc", "visible.txt"]);
        let _ = fs::remove_dir_all(root);
    }

    #[test]
    fn rejects_parent_path_segments() {
        let root = temp_dir();
        let error =
            host_workspace_list_dir(root.to_string_lossy().to_string(), "../".to_string(), false)
                .unwrap_err();
        assert!(error.message.contains("cannot contain '..'"));
        assert_eq!(error.code, "invalid_input");
        let _ = fs::remove_dir_all(root);
    }

    #[test]
    fn rejects_absolute_dir_paths() {
        let root = temp_dir();
        let outside = temp_dir();
        let error = host_workspace_list_dir(
            root.to_string_lossy().to_string(),
            outside.to_string_lossy().to_string(),
            false,
        )
        .unwrap_err();
        assert!(error.message.contains("must be relative"));
        assert_eq!(error.code, "invalid_input");
        let _ = fs::remove_dir_all(root);
        let _ = fs::remove_dir_all(outside);
    }

    #[cfg(unix)]
    #[test]
    fn rejects_symlink_escape_dirs() {
        use std::os::unix::fs::symlink;

        let root = temp_dir();
        let outside = temp_dir();
        fs::write(outside.join("secret.txt"), "secret").unwrap();
        symlink(&outside, root.join("outside-link")).unwrap();

        let error = host_workspace_list_dir(
            root.to_string_lossy().to_string(),
            "outside-link".to_string(),
            false,
        )
        .unwrap_err();
        assert!(error.message.contains("escapes the workspace root"));
        assert_eq!(error.code, "invalid_input");
        let _ = fs::remove_dir_all(root);
        let _ = fs::remove_dir_all(outside);
    }
}
