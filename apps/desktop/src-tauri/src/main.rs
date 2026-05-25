use base64::{engine::general_purpose, Engine as _};
use hicodex_host::{
    AppServerHost, AppServerStartConfig, CodexAuthSummary, HostInstallationState, HostStatus,
    LocalModelCatalogConfig, ThreadToolHistory,
};
use serde::{Deserialize, Serialize};
use serde_json::{json, Value};
use std::env;
use std::fs;
use std::io::{Read, Write};
use std::path::{Path, PathBuf};
use std::process::{Command, Stdio};
use std::time::{SystemTime, UNIX_EPOCH};
use tauri::menu::{MenuBuilder, MenuItemBuilder, PredefinedMenuItem, SubmenuBuilder};
use tauri::{AppHandle, Emitter, Manager, State};
use tauri_plugin_deep_link::DeepLinkExt;
use tauri_plugin_notification::NotificationExt;

mod document_preview;
mod spreadsheet_preview;

use document_preview::{read_document_preview, DocumentPreview};
use spreadsheet_preview::{read_spreadsheet_preview, SpreadsheetPreview};

const APP_SERVER_EVENT_NAME: &str = "hicodex://app-server-event";
const NATIVE_SHELL_EVENT_NAME: &str = "hicodex://native-shell-event";
const CODEX_DEEP_LINK_SCHEME: &str = "codex://";
const APP_CONNECT_OAUTH_CALLBACK_PATH: &str = "/aip/connectors/links/oauth/callback";
const APP_CONNECT_OAUTH_BROWSER_REDIRECT_PATH: &str = "/connector_platform_oauth_redirect";

const MENU_NEW_CHAT: &str = "hicodex:new-chat";
const MENU_SEARCH: &str = "hicodex:search";
const MENU_SETTINGS: &str = "hicodex:settings";
const MENU_RELOAD: &str = "hicodex:reload";
const MENU_CLOSE: &str = "hicodex:close-window";
const MENU_QUIT: &str = "hicodex:quit";

struct AppState {
    host: AppServerHost,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
struct LocalFileMetadata {
    is_file: bool,
    size_bytes: Option<u64>,
    mime_type: Option<String>,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
struct TurnCompletionNotificationRequest {
    title: Option<String>,
    body: Option<String>,
    sound: Option<bool>,
    thread_id: Option<String>,
    turn_id: Option<String>,
    status: Option<String>,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
struct ImageGenerationRequest {
    base_url: String,
    api_key: Option<String>,
    payload: Value,
    codex_home: Option<String>,
    thread_id: Option<String>,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
struct HostGitStatus {
    cwd: String,
    repo_root: Option<String>,
    branch: Option<String>,
    sha: Option<String>,
    upstream: Option<String>,
    ahead: u32,
    behind: u32,
    changed_files: Vec<HostGitChangedFile>,
    has_diff: bool,
    diff: String,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
struct HostGitChangedFile {
    status: String,
    path: String,
    old_path: Option<String>,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
struct CreatePendingWorktreeRequest {
    cwd: String,
    branch_name: Option<String>,
    base_ref: Option<String>,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
struct CreatePendingWorktreeResponse {
    repo_root: String,
    path: String,
    branch_name: String,
    base_ref: String,
    base_sha: String,
}

impl Default for AppState {
    fn default() -> Self {
        Self {
            host: AppServerHost::new(),
        }
    }
}

#[tauri::command]
fn host_start_app_server(
    state: State<'_, AppState>,
    config: AppServerStartConfig,
) -> Result<HostStatus, String> {
    state.host.start(config).map_err(|error| error.to_string())
}

#[tauri::command]
fn host_stop_app_server(state: State<'_, AppState>) -> Result<HostStatus, String> {
    state.host.stop().map_err(|error| error.to_string())
}

#[tauri::command]
fn host_status(state: State<'_, AppState>) -> HostStatus {
    state.host.status()
}

#[tauri::command]
fn host_send_raw(state: State<'_, AppState>, message: Value) -> Result<(), String> {
    state
        .host
        .send_json(message)
        .map_err(|error| error.to_string())
}

#[tauri::command]
fn host_write_local_model_catalog(
    state: State<'_, AppState>,
    codex_home: Option<String>,
    config: LocalModelCatalogConfig,
) -> Result<String, String> {
    state
        .host
        .write_local_model_catalog(codex_home, config)
        .map_err(|error| error.to_string())
}

#[tauri::command]
fn host_read_codex_auth_summary(
    state: State<'_, AppState>,
    codex_home: Option<String>,
) -> Result<CodexAuthSummary, String> {
    state
        .host
        .read_codex_auth_summary(codex_home)
        .map_err(|error| error.to_string())
}

#[tauri::command]
fn host_read_installation_state(
    state: State<'_, AppState>,
    codex_home: Option<String>,
) -> Result<HostInstallationState, String> {
    state
        .host
        .read_or_init_installation_state(codex_home)
        .map_err(|error| error.to_string())
}

#[tauri::command]
fn host_open_file_reference(path: String, line: Option<u32>) -> Result<(), String> {
    let trimmed = path.trim();
    if trimmed.is_empty() {
        return Err("file path is empty".to_string());
    }
    let target = Path::new(trimmed);
    if !target.exists() {
        return Err(format!("file does not exist: {trimmed}"));
    }
    let line_suffix = line
        .filter(|value| *value > 0)
        .map(|value| format!(":{value}"))
        .unwrap_or_default();
    let display_target = format!("{trimmed}{line_suffix}");
    open_path(target).map_err(|error| format!("failed to open {display_target}: {error}"))
}

#[tauri::command]
fn host_open_external_url(url: String) -> Result<(), String> {
    let target = normalized_external_url(&url)?;
    open_external_url(&target).map_err(|error| format!("failed to open external URL: {error}"))
}

#[tauri::command]
fn host_pick_file_references(
    kind: Option<String>,
    multiple: Option<bool>,
) -> Result<Vec<String>, String> {
    pick_file_references(kind.as_deref(), multiple.unwrap_or(true))
}

#[tauri::command]
fn host_pick_workspace_folder() -> Result<Option<String>, String> {
    pick_workspace_folder()
}

#[tauri::command]
fn host_read_image_data_url(path: String) -> Result<String, String> {
    let trimmed = path.trim();
    if trimmed.is_empty() {
        return Err("image path is empty".to_string());
    }
    let target = Path::new(trimmed);
    if !target.is_file() {
        return Err(format!("image file does not exist: {trimmed}"));
    }
    let mime =
        image_mime_type(target).ok_or_else(|| format!("unsupported image type: {trimmed}"))?;
    let bytes = fs::read(target).map_err(|error| format!("failed to read image: {error}"))?;
    Ok(format!(
        "data:{mime};base64,{}",
        general_purpose::STANDARD.encode(bytes)
    ))
}

#[tauri::command]
fn host_read_file_metadata(path: String) -> Result<LocalFileMetadata, String> {
    let trimmed = path.trim();
    if trimmed.is_empty() {
        return Err("file path is empty".to_string());
    }
    let target = Path::new(trimmed);
    let metadata =
        fs::metadata(target).map_err(|error| format!("failed to read file metadata: {error}"))?;
    let is_file = metadata.is_file();
    Ok(LocalFileMetadata {
        is_file,
        size_bytes: if is_file { Some(metadata.len()) } else { None },
        mime_type: file_mime_type(target).map(ToOwned::to_owned),
    })
}

#[tauri::command]
fn host_notify_turn_completed(
    app: AppHandle,
    request: TurnCompletionNotificationRequest,
) -> Result<(), String> {
    let title = notification_text(request.title, "Codex turn completed", 96);
    let body = notification_text(request.body, "The background turn has finished.", 240);
    let builder = app.notification().builder().title(title).body(body);
    let builder = if request.sound.unwrap_or(true) {
        builder.sound("default")
    } else {
        builder
    };
    builder
        .show()
        .map_err(|error| format!("failed to show turn notification: {error}"))?;
    let _ = app.emit(
        NATIVE_SHELL_EVENT_NAME,
        json!({
            "action": "turnCompletedNotification",
            "supported": true,
            "threadId": request.thread_id,
            "turnId": request.turn_id,
            "status": request.status,
        }),
    );
    Ok(())
}

#[tauri::command]
fn host_handle_deep_link_url(app: AppHandle, url: String) -> Result<(), String> {
    handle_deep_link_url(&app, &url)
}

#[tauri::command]
fn host_read_text_file(path: String, max_bytes: Option<u64>) -> Result<String, String> {
    let trimmed = path.trim();
    if trimmed.is_empty() {
        return Err("text file path is empty".to_string());
    }
    let target = Path::new(trimmed);
    if !target.is_file() {
        return Err(format!("text file does not exist: {trimmed}"));
    }

    if is_word_document_path(target) {
        return read_document_preview(target, 200, 1_000).map(DocumentPreview::into_plain_text);
    }

    let max_bytes = max_bytes.unwrap_or(120_000).clamp(1, 240_000);
    let mut file =
        fs::File::open(target).map_err(|error| format!("failed to open text file: {error}"))?;
    let mut bytes = Vec::new();
    Read::by_ref(&mut file)
        .take(max_bytes + 1)
        .read_to_end(&mut bytes)
        .map_err(|error| format!("failed to read text file: {error}"))?;

    let truncated = bytes.len() as u64 > max_bytes;
    if truncated {
        bytes.truncate(max_bytes as usize);
    }
    let mut text = String::from_utf8_lossy(&bytes).to_string();
    if truncated {
        text.push_str("\n\n[Preview truncated]");
    }
    Ok(text)
}

#[tauri::command]
fn host_read_spreadsheet_preview(
    path: String,
    max_rows: Option<usize>,
    max_cols: Option<usize>,
) -> Result<SpreadsheetPreview, String> {
    let trimmed = path.trim();
    if trimmed.is_empty() {
        return Err("spreadsheet path is empty".to_string());
    }
    let target = Path::new(trimmed);
    if !target.is_file() {
        return Err(format!("spreadsheet file does not exist: {trimmed}"));
    }

    let max_rows = max_rows.unwrap_or(80).clamp(1, 400);
    let max_cols = max_cols.unwrap_or(24).clamp(1, 120);
    read_spreadsheet_preview(target, max_rows, max_cols)
}

// CODEX-REF: webview/assets/open-workspace-file-DOOUD1lA.js — Codex Desktop streams
// xlsx bytes to its WASM Popcorn workbook viewer. HiCodex's reduced preview parses
// the workbook in the renderer with SheetJS, so we need raw bytes back. The CSP
// blocks `fetch()` against the asset protocol, so we expose a small base64
// fetcher that mirrors the existing `host_read_image_data_url` pattern and is
// capped so we never load a multi-hundred-MB workbook into JS.
#[tauri::command]
fn host_read_file_bytes_base64(path: String, max_bytes: Option<u64>) -> Result<String, String> {
    let trimmed = path.trim();
    if trimmed.is_empty() {
        return Err("file path is empty".to_string());
    }
    let target = Path::new(trimmed);
    if !target.is_file() {
        return Err(format!("file does not exist: {trimmed}"));
    }
    // Cap to ~16 MiB so an accidentally giant workbook can't pin the renderer.
    let max_bytes = max_bytes
        .unwrap_or(16 * 1024 * 1024)
        .clamp(1, 64 * 1024 * 1024);
    let mut file =
        fs::File::open(target).map_err(|error| format!("failed to open file: {error}"))?;
    let mut bytes = Vec::new();
    Read::by_ref(&mut file)
        .take(max_bytes + 1)
        .read_to_end(&mut bytes)
        .map_err(|error| format!("failed to read file: {error}"))?;
    if bytes.len() as u64 > max_bytes {
        return Err(format!("file exceeds preview limit ({} bytes)", max_bytes));
    }
    Ok(general_purpose::STANDARD.encode(bytes))
}

#[tauri::command]
fn host_read_document_preview(
    path: String,
    max_paragraphs: Option<usize>,
    max_chars_per_paragraph: Option<usize>,
) -> Result<DocumentPreview, String> {
    let trimmed = path.trim();
    if trimmed.is_empty() {
        return Err("document path is empty".to_string());
    }
    let target = Path::new(trimmed);
    if !target.is_file() {
        return Err(format!("document file does not exist: {trimmed}"));
    }

    let max_paragraphs = max_paragraphs.unwrap_or(80).clamp(1, 400);
    let max_chars_per_paragraph = max_chars_per_paragraph.unwrap_or(400).clamp(20, 4_000);
    read_document_preview(target, max_paragraphs, max_chars_per_paragraph)
}

#[tauri::command]
fn host_git_status(cwd: String) -> Result<HostGitStatus, String> {
    read_host_git_status(&cwd)
}

// codex: composer-footer-branch-switcher-CamXBKfA.js — branch picker host APIs.
// Mirrors the Desktop branch switcher's data model (`use-git-current-branch`,
// `use-git-recent-branches`, `use-git-default-branch`): one shot returns the
// current branch + every local branch with its last-commit epoch so the
// renderer can sort recents to the top without a separate `reflog` call.
// codex: branch-picker-extension — `is_remote` flips on for the `git branch -r`
// scan so the renderer can render the remote section as a dedicated heading.
#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
struct GitBranchInfo {
    name: String,
    last_commit_ms: Option<i64>,
    is_current: bool,
    /// True when the entry came from `git branch -r` (e.g. `origin/feature-x`).
    /// codex: composer-footer-branch-switcher-CamXBKfA.js — "Remote branches"
    /// section is keyed off this flag in the renderer.
    is_remote: bool,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
struct GitBranchesResponse {
    current: Option<String>,
    branches: Vec<GitBranchInfo>,
}

// codex: branch-picker-extension — `host_git_default_branch` payload mirrors
// Codex Desktop's `useGitDefaultBranch` hook. We surface a single optional
// string so the renderer can render the "Default" chip without inventing a
// per-branch field on the branches list.
#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
struct GitDefaultBranchResponse {
    default_branch: Option<String>,
}

// codex: composer-footer-branch-switcher-CamXBKfA.js — list local branches.
// Returns ({ current, branches[] }) so the picker can render "current" first
// then sort the rest by `lastCommitMs` desc (matches Codex's recents order).
// `cwd` may be anywhere inside the worktree; we resolve to repo root before
// calling git so worktrees / nested invocations behave the same.
// codex: branch-picker-extension — `include_remote` opts into a second
// `git branch -r --list` pass; the response merges local + remote into a
// single `branches[]` so the renderer can group via `isRemote`.
#[tauri::command]
fn host_git_list_branches(
    cwd: String,
    include_remote: Option<bool>,
) -> Result<GitBranchesResponse, String> {
    let cwd = cwd.trim();
    if cwd.is_empty() {
        return Err("cwd is empty".to_string());
    }
    let cwd_path = Path::new(cwd);
    let Some(repo_root) = git_repo_root(cwd_path)? else {
        // codex: not-a-git-repo → renderer hides the chip via `current=None`
        return Ok(GitBranchesResponse {
            current: None,
            branches: Vec::new(),
        });
    };
    let repo_path = Path::new(&repo_root);

    // Custom format keeps a single round-trip: `<name>\t<committerdate-epoch>`.
    // `--list` keeps it local-only (Codex's picker only shows local branches in
    // the static mode we mirror here; remotes are wired in via include_remote).
    let output = run_git(
        repo_path,
        &[
            "branch",
            "--list",
            "--sort=-committerdate",
            "--format=%(refname:short)%09%(committerdate:unix)",
        ],
    )?;
    if !output.status.success() {
        return Err(format_git_failure("failed to list git branches", &output));
    }

    let current = git_stdout_optional(repo_path, &["branch", "--show-current"])?;
    let stdout = String::from_utf8_lossy(&output.stdout);
    let mut branches: Vec<GitBranchInfo> = Vec::new();
    for raw_line in stdout.lines() {
        let line = raw_line.trim_end();
        if line.is_empty() {
            continue;
        }
        // Trim the "*" / "+" markers `git branch` would normally print; the
        // custom format strips them but be defensive against detached-HEAD
        // entries like "(HEAD detached at <sha>)" which we skip.
        if line.starts_with('(') {
            continue;
        }
        let (name_part, epoch_part) = match line.find('\t') {
            Some(idx) => (&line[..idx], Some(&line[idx + 1..])),
            None => (line, None),
        };
        let name = name_part.trim().to_string();
        if name.is_empty() {
            continue;
        }
        let last_commit_ms = epoch_part
            .map(str::trim)
            .filter(|value| !value.is_empty())
            .and_then(|value| value.parse::<i64>().ok())
            .map(|seconds| seconds.saturating_mul(1000));
        let is_current = current.as_deref() == Some(name.as_str());
        branches.push(GitBranchInfo {
            name,
            last_commit_ms,
            is_current,
            is_remote: false,
        });
    }

    // codex: branch-picker-extension — opt-in remote scan. We skip the
    // `origin/HEAD` symbolic ref (e.g. `origin/HEAD -> origin/main`) since it
    // is not a real branch the user would want to check out.
    if include_remote.unwrap_or(false) {
        let remote_output = run_git(
            repo_path,
            &[
                "branch",
                "-r",
                "--list",
                "--sort=-committerdate",
                "--format=%(refname:short)%09%(committerdate:unix)",
            ],
        )?;
        if !remote_output.status.success() {
            return Err(format_git_failure(
                "failed to list git remote branches",
                &remote_output,
            ));
        }
        let remote_stdout = String::from_utf8_lossy(&remote_output.stdout);
        for raw_line in remote_stdout.lines() {
            let line = raw_line.trim_end();
            if line.is_empty() {
                continue;
            }
            if line.starts_with('(') {
                continue;
            }
            let (name_part, epoch_part) = match line.find('\t') {
                Some(idx) => (&line[..idx], Some(&line[idx + 1..])),
                None => (line, None),
            };
            let name = name_part.trim().to_string();
            if name.is_empty() {
                continue;
            }
            // codex: skip the symbolic head pointer; the rendered list would
            // otherwise show "origin/HEAD -> origin/main" which would not
            // round-trip through `git checkout -b`.
            if name.contains("->") || name.ends_with("/HEAD") {
                continue;
            }
            let last_commit_ms = epoch_part
                .map(str::trim)
                .filter(|value| !value.is_empty())
                .and_then(|value| value.parse::<i64>().ok())
                .map(|seconds| seconds.saturating_mul(1000));
            branches.push(GitBranchInfo {
                name,
                last_commit_ms,
                is_current: false,
                is_remote: true,
            });
        }
    }

    Ok(GitBranchesResponse { current, branches })
}

// codex: branch-picker-extension — Codex Desktop's `useGitDefaultBranch`.
// Resolves to whatever `origin/HEAD` points at (the common case for a cloned
// repo) and falls back to the user's `init.defaultBranch` git config if the
// remote symbolic ref isn't set (e.g. local-only repos).
#[tauri::command]
fn host_git_default_branch(cwd: String) -> Result<GitDefaultBranchResponse, String> {
    let cwd = cwd.trim();
    if cwd.is_empty() {
        return Err("cwd is empty".to_string());
    }
    let cwd_path = Path::new(cwd);
    let Some(repo_root) = git_repo_root(cwd_path)? else {
        return Ok(GitDefaultBranchResponse {
            default_branch: None,
        });
    };
    let repo_path = Path::new(&repo_root);
    // `--short` strips the `refs/remotes/origin/` prefix, leaving e.g. "main".
    let symbolic = git_stdout_optional(
        repo_path,
        &["symbolic-ref", "--short", "refs/remotes/origin/HEAD"],
    )
    .unwrap_or(None);
    let default_branch = match symbolic {
        Some(value) => {
            // Trim the leading `origin/` so the renderer can match against the
            // local branch list. Codex Desktop's `useGitDefaultBranch` exposes
            // the bare branch name (e.g. "main"), not the remote ref.
            let trimmed = value
                .split_once('/')
                .map(|(_, rest)| rest.to_string())
                .unwrap_or(value);
            Some(trimmed)
        }
        None => {
            // codex: fall back to git's user config when origin/HEAD is unset.
            git_stdout_optional(repo_path, &["config", "init.defaultBranch"]).unwrap_or(None)
        }
    };
    Ok(GitDefaultBranchResponse { default_branch })
}

// codex: branch-picker-extension — Codex Desktop "Create new branch" action.
// Mirrors `git checkout -b <name> [<basedOn>]`. `basedOn` is forwarded as a
// final positional so the renderer can support "create from remote" (passing
// e.g. `origin/feature-x`) without inventing a separate command.
#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
struct CreateGitBranchRequest {
    cwd: String,
    branch_name: String,
    #[serde(default)]
    based_on: Option<String>,
}

#[tauri::command]
fn host_git_create_branch(request: CreateGitBranchRequest) -> Result<(), String> {
    let cwd = request.cwd.trim();
    if cwd.is_empty() {
        return Err("cwd is empty".to_string());
    }
    let branch_name = request.branch_name.trim();
    if branch_name.is_empty() {
        return Err("branch name is empty".to_string());
    }
    if branch_name.starts_with('-') {
        return Err("branch name must not start with '-'".to_string());
    }
    if branch_name
        .chars()
        .any(|ch| ch.is_control() || ch.is_whitespace())
    {
        return Err("branch name contains unsupported whitespace".to_string());
    }
    let cwd_path = Path::new(cwd);
    let repo_root =
        git_repo_root(cwd_path)?.ok_or_else(|| format!("not a git repository: {cwd}"))?;
    let repo_path = Path::new(&repo_root);
    // codex: build args dynamically — keeping `&str` borrows tied to owned
    // trimmed strings so the slice still references valid memory.
    let based_on = request
        .based_on
        .as_deref()
        .map(str::trim)
        .filter(|value| !value.is_empty());
    if let Some(value) = based_on {
        if value.starts_with('-') {
            return Err("base branch must not start with '-'".to_string());
        }
    }
    let mut args: Vec<&str> = vec!["checkout", "-b", branch_name];
    if let Some(value) = based_on {
        args.push(value);
    }
    let output = run_git(repo_path, &args)?;
    if !output.status.success() {
        return Err(format_git_failure("failed to create branch", &output));
    }
    Ok(())
}

// codex: local-conversation-thread-CecHj6JI.js#J#ga — PR status host API.
// Mirrors Codex Desktop's `pullRequestStatus` widget (Environment section row
// 4) which surfaces the current branch's GitHub PR. Codex Desktop uses a
// dedicated `gh-cli-status-*` chunk under the hood; HiCodex shells out to the
// `gh` CLI in the renderer's cwd to keep the host bridge minimal.
//
// IPC shape (after serde rename_all = "camelCase"):
//   { currentBranch: string | null, pr: { number, title, url, isDraft,
//     mergeable, state, headRefName } | null }
//
// Returns Ok with `pr: None` when gh reports "no pull requests" or the cwd is
// not a git repo (Codex hides the widget in those cases); returns Err for the
// hard-failure cases (gh not installed, gh exited unexpectedly) so the
// renderer can choose between silent-hide and surfaced-error.
#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
struct GhPrInfo {
    number: u64,
    title: String,
    url: String,
    is_draft: bool,
    /// `MERGEABLE` / `CONFLICTING` / `UNKNOWN` — gh's `--json mergeable` value.
    /// Kept as Option<String> so a missing field falls through to null in JSON
    /// (Codex's `mergeable` ternary tolerates null).
    mergeable: Option<String>,
    /// `OPEN` / `CLOSED` / `MERGED` — drives Codex's status badge color.
    state: String,
    head_ref_name: String,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
struct GhPrStatusResponse {
    current_branch: Option<String>,
    pr: Option<GhPrInfo>,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
struct GhPrStatusPayload {
    #[serde(default)]
    current_branch: Option<GhPrEntry>,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
struct GhPrEntry {
    number: u64,
    title: String,
    url: String,
    #[serde(default)]
    is_draft: bool,
    #[serde(default)]
    mergeable: Option<String>,
    state: String,
    head_ref_name: String,
}

// codex: local-conversation-thread-CecHj6JI.js#J#ga — PR status host API.
// Runs `gh pr status --json ...` inside `cwd` and projects the
// `currentBranch` entry into the camelCase IPC shape the renderer expects.
// Error contract:
//   - gh missing from PATH → Err("gh CLI not installed")
//   - cwd not a git repo → Err("not a git repository")
//   - any other gh failure → Err with gh's stderr
//   - "no pull requests for current branch" → Ok({ ..., pr: None })
#[tauri::command]
fn host_gh_pr_status(cwd: String) -> Result<GhPrStatusResponse, String> {
    let cwd = cwd.trim();
    if cwd.is_empty() {
        return Err("cwd is empty".to_string());
    }
    let cwd_path = Path::new(cwd);
    if !cwd_path.is_dir() {
        return Err(format!("cwd is not a directory: {cwd}"));
    }
    // codex: ga — Codex Desktop short-circuits when the workspace isn't a git
    // repo (its widget pulls a `currentBranch` first); we mirror that so the
    // renderer can keep a single error path.
    let repo_root = git_repo_root(cwd_path)?;
    if repo_root.is_none() {
        return Err("not a git repository".to_string());
    }
    // Resolve the current branch so the renderer can decide whether to show
    // the row even when `pr` is None (e.g. "no PR for <branch>" copy).
    let current_branch =
        git_stdout_optional(cwd_path, &["branch", "--show-current"]).unwrap_or(None);

    let output = match Command::new("gh")
        .arg("pr")
        .arg("status")
        .arg("--json")
        .arg("number,title,url,isDraft,mergeable,state,headRefName")
        .current_dir(cwd_path)
        .output()
    {
        Ok(output) => output,
        Err(error) => {
            // ErrorKind::NotFound is the canonical "binary missing" signal on
            // every OS we ship; surface that as the dedicated Codex copy.
            if error.kind() == std::io::ErrorKind::NotFound {
                return Err("gh CLI not installed".to_string());
            }
            return Err(format!("failed to run gh: {error}"));
        }
    };

    if !output.status.success() {
        let stderr = String::from_utf8_lossy(&output.stderr).to_string();
        let stderr_lower = stderr.to_ascii_lowercase();
        // codex: ga — gh prints "no pull requests" on stderr when the branch
        // has no PR; Codex Desktop treats that as `pullRequestStatus = null`,
        // not as an error.
        if stderr_lower.contains("no pull request")
            || stderr_lower.contains("no open pull requests")
        {
            return Ok(GhPrStatusResponse {
                current_branch,
                pr: None,
            });
        }
        if stderr_lower.contains("not a git repository") {
            return Err("not a git repository".to_string());
        }
        let detail = stderr.trim();
        return Err(if detail.is_empty() {
            format!("gh pr status exited with status {}", output.status)
        } else {
            format!("gh pr status failed: {detail}")
        });
    }

    let stdout = String::from_utf8_lossy(&output.stdout);
    let trimmed = stdout.trim();
    if trimmed.is_empty() {
        return Ok(GhPrStatusResponse {
            current_branch,
            pr: None,
        });
    }
    let payload: GhPrStatusPayload = serde_json::from_str(trimmed)
        .map_err(|error| format!("gh pr status returned invalid JSON: {error}"))?;
    let pr = payload.current_branch.map(|entry| GhPrInfo {
        number: entry.number,
        title: entry.title,
        url: entry.url,
        is_draft: entry.is_draft,
        mergeable: entry.mergeable,
        state: entry.state,
        head_ref_name: entry.head_ref_name,
    });
    Ok(GhPrStatusResponse {
        current_branch,
        pr,
    })
}

// codex: composer-footer-branch-switcher-CamXBKfA.js — switch to an existing
// local branch. We deliberately do NOT pass `-f`: if the working tree has
// uncommitted changes that would be overwritten, git's stderr propagates up
// to the renderer so it can show the failure inline (matches Codex's "Switch
// failed: please commit or stash" toast).
#[tauri::command]
fn host_git_checkout_branch(cwd: String, branch_name: String) -> Result<(), String> {
    let cwd = cwd.trim();
    if cwd.is_empty() {
        return Err("cwd is empty".to_string());
    }
    let branch_name = branch_name.trim();
    if branch_name.is_empty() {
        return Err("branch name is empty".to_string());
    }
    if branch_name.starts_with('-') {
        return Err("branch name must not start with '-'".to_string());
    }
    if branch_name
        .chars()
        .any(|ch| ch.is_control() || ch.is_whitespace())
    {
        return Err("branch name contains unsupported whitespace".to_string());
    }
    let cwd_path = Path::new(cwd);
    let repo_root =
        git_repo_root(cwd_path)?.ok_or_else(|| format!("not a git repository: {cwd}"))?;
    let repo_path = Path::new(&repo_root);
    let output = run_git(repo_path, &["checkout", branch_name])?;
    if !output.status.success() {
        return Err(format_git_failure("failed to checkout branch", &output));
    }
    Ok(())
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
struct PatchActionRequest {
    /// "revert" → git apply --reverse；"reapply" → git apply (forward).
    /// Mirrors Codex Desktop `failure.action` field (local-conversation-thread
    /// byte ~422600).
    action: String,
    /// Unified-diff text exactly as it was streamed to the user (the same value
    /// HiCodex stores on `turn/diff/updated` notifications).
    diff: String,
    /// Working directory the patch should be applied in (passed to `git -C`).
    cwd: String,
}

#[derive(Debug, Serialize, Default)]
#[serde(rename_all = "camelCase")]
struct PatchActionResult {
    /// Echo back so the renderer dispatcher can disambiguate undo/reapply.
    action: String,
    /// Files git apply confirmed as cleanly applied. Codex `failure.result.appliedPaths`.
    applied_paths: Vec<String>,
    /// Files git left untouched. Codex `failure.result.skippedPaths`.
    skipped_paths: Vec<String>,
    /// Files git could not apply / reverse (whole-patch failure goes here).
    /// Codex `failure.result.conflictedPaths`.
    conflicted_paths: Vec<String>,
    /// Raw `git apply` stderr (mapped to Codex `failure.result.execOutput.output`).
    #[serde(skip_serializing_if = "Option::is_none")]
    exec_output: Option<PatchActionExecOutput>,
    /// `"not-git-repo"` triggers the dedicated Codex copy
    /// (`codex.unifiedDiff.revertPatchNotGitRepo` / `reapplyPatchNotGitRepo`);
    /// other strings are passed through as-is.
    #[serde(skip_serializing_if = "Option::is_none")]
    error_code: Option<String>,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
struct PatchActionExecOutput {
    output: String,
}

/// Apply or reverse a unified-diff against the current working tree.
///
/// HiCodex equivalent of the host-side patch action Codex Desktop relies on
/// for its `revertChanges` / `reapplyChanges` toolbar (the Undo/Reapply
/// buttons rendered inside the turn-diff card). The transactional model
/// matches Codex's `hS` Failure Dialog (`local-conversation-thread-BX7YNcUw.js`
/// byte ~422600): success returns every file in the diff under `appliedPaths`;
/// any whole-patch failure surfaces the entire path set under `conflictedPaths`
/// so the renderer can open the failure dialog with the conflicted heading.
/// We intentionally avoid `git apply --reject` partial mode (which would leave
/// `.rej` files lying around) — the resulting UX matches Codex's stricter
/// "all-or-nothing" behavior.
#[tauri::command]
fn host_apply_patch_action(request: PatchActionRequest) -> Result<PatchActionResult, String> {
    let reverse = match request.action.as_str() {
        "revert" => true,
        "reapply" => false,
        other => return Err(format!("invalid patch action: {other}")),
    };
    let cwd = request.cwd.trim();
    if cwd.is_empty() {
        return Err("cwd is empty".to_string());
    }
    let cwd_path = Path::new(cwd);
    if !cwd_path.is_dir() {
        return Err(format!("cwd is not a directory: {cwd}"));
    }

    let repo_root = match git_repo_root(cwd_path)? {
        Some(root) => root,
        None => {
            return Ok(PatchActionResult {
                action: request.action,
                error_code: Some("not-git-repo".to_string()),
                ..Default::default()
            });
        }
    };
    let repo_path = Path::new(&repo_root);

    let diff_paths = parse_unified_diff_paths(&request.diff);

    // Try clean apply. We deliberately omit `--reject` so a partial failure
    // doesn't leave reject files on disk; Codex's Dialog reports the whole
    // path set as conflicted in that case (no skipped vs conflicted split).
    let mut args: Vec<&str> = vec!["apply"];
    if reverse {
        args.push("--reverse");
    }
    let output = git_apply_with_stdin(repo_path, &args, &request.diff)?;

    if output.status.success() {
        return Ok(PatchActionResult {
            action: request.action,
            applied_paths: diff_paths,
            ..Default::default()
        });
    }

    let stderr_text = String::from_utf8_lossy(&output.stderr).trim().to_string();
    Ok(PatchActionResult {
        action: request.action,
        conflicted_paths: diff_paths,
        exec_output: Some(PatchActionExecOutput {
            output: if stderr_text.is_empty() {
                format!("git apply exited with status {}", output.status)
            } else {
                stderr_text
            },
        }),
        ..Default::default()
    })
}

fn git_apply_with_stdin(
    cwd: &Path,
    args: &[&str],
    diff: &str,
) -> Result<std::process::Output, String> {
    let mut child = Command::new("git")
        .arg("-C")
        .arg(cwd)
        .args(args)
        .stdin(Stdio::piped())
        .stdout(Stdio::piped())
        .stderr(Stdio::piped())
        .spawn()
        .map_err(|error| format!("failed to spawn git apply: {error}"))?;
    if let Some(mut stdin) = child.stdin.take() {
        stdin
            .write_all(diff.as_bytes())
            .map_err(|error| format!("failed to write diff to git apply stdin: {error}"))?;
    }
    child
        .wait_with_output()
        .map_err(|error| format!("git apply wait failed: {error}"))
}

/// Extract distinct destination paths from a unified diff.
///
/// We look for `diff --git a/<path> b/<path>` headers; the `b/`-side path is
/// the post-image filename which is what `git apply` actually addresses. Falls
/// back to bare `+++ b/<path>` headers when the `diff --git` line is missing
/// (rare but seen on partial protocol payloads).
fn parse_unified_diff_paths(diff: &str) -> Vec<String> {
    let mut paths: Vec<String> = Vec::new();
    let mut seen = std::collections::HashSet::new();
    let mut push_unique = |path: String, paths: &mut Vec<String>| {
        if !path.is_empty() && seen.insert(path.clone()) {
            paths.push(path);
        }
    };
    for line in diff.lines() {
        if let Some(rest) = line.strip_prefix("diff --git ") {
            if let Some(path) = diff_git_b_side_path(rest) {
                push_unique(path, &mut paths);
            }
            continue;
        }
        if let Some(rest) = line.strip_prefix("+++ ") {
            if let Some(stripped) = rest.strip_prefix("b/") {
                push_unique(stripped.to_string(), &mut paths);
            } else if rest != "/dev/null" {
                push_unique(rest.to_string(), &mut paths);
            }
        }
    }
    paths
}

/// Parse the b-side path out of a `diff --git a/<x> b/<y>` line, accounting
/// for the quoted-path form git produces when the filename contains spaces.
fn diff_git_b_side_path(rest: &str) -> Option<String> {
    // Quoted form: "a/foo bar" "b/baz qux"
    if let Some(stripped) = rest.strip_prefix('"') {
        if let Some(close_idx) = stripped.find("\" ") {
            let after_a = &stripped[close_idx + 2..];
            return Some(unquote_diff_path(after_a));
        }
    }
    // Unquoted form: a/path b/path. Find the " b/" separator; everything after
    // it is the b-side path (which may itself be quoted).
    if let Some(idx) = rest.find(" b/") {
        return Some(unquote_diff_path(&rest[idx + 3..]));
    }
    None
}

fn unquote_diff_path(value: &str) -> String {
    let trimmed = value.trim();
    if let Some(stripped) = trimmed.strip_prefix("b/") {
        return stripped.trim().to_string();
    }
    if trimmed.starts_with('"') && trimmed.ends_with('"') && trimmed.len() >= 2 {
        let inner = &trimmed[1..trimmed.len() - 1];
        return inner.strip_prefix("b/").unwrap_or(inner).to_string();
    }
    trimmed.to_string()
}

#[tauri::command]
fn host_create_pending_worktree(
    request: CreatePendingWorktreeRequest,
) -> Result<CreatePendingWorktreeResponse, String> {
    create_pending_worktree(request)
}

/// Recover the rollout JSONL path for a given thread by scanning the
/// HiCodex sessions directory. Used as a fallback when `Thread.path` is
/// missing in client state (e.g. the thread was loaded from a stale local
/// snapshot) but the rollout file still exists on disk. The app-server's
/// `thread/resume {path}` (codex-rs:thread_processor.rs:2810
/// `read_thread_by_rollout_path`) bypasses the in-memory + `session_index`
/// lookup that is producing "thread not found".
///
/// Returns `Ok(None)` (rather than `Err`) when the file is not found so the
/// caller can decide whether to fall through to a friendlier error.
#[tauri::command]
fn host_find_rollout_for_thread(
    codex_home: Option<String>,
    thread_id: String,
) -> Result<Option<String>, String> {
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
                Path::new(&home).join("Library/Application Support/HiCodex/codex-home/sessions")
            }
            None => return Ok(None),
        },
    };
    if !sessions_root.is_dir() {
        return Ok(None);
    }
    find_rollout_recursive(&sessions_root, id, 4).map_err(|err| err.to_string())
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

fn read_host_git_status(cwd: &str) -> Result<HostGitStatus, String> {
    let cwd = cwd.trim();
    if cwd.is_empty() {
        return Err("cwd is empty".to_string());
    }

    let cwd_path = Path::new(cwd);
    let Some(repo_root) = git_repo_root(cwd_path)? else {
        return Ok(non_git_status(cwd));
    };
    let repo_path = Path::new(&repo_root);
    let branch = git_stdout_optional(repo_path, &["branch", "--show-current"])?;
    let sha = git_stdout_optional(repo_path, &["rev-parse", "HEAD"])?;
    let upstream = git_stdout_optional(
        repo_path,
        &[
            "rev-parse",
            "--abbrev-ref",
            "--symbolic-full-name",
            "@{upstream}",
        ],
    )?;
    let (ahead, behind) = if upstream.is_some() {
        let counts = git_stdout_optional(
            repo_path,
            &["rev-list", "--left-right", "--count", "HEAD...@{upstream}"],
        )?
        .unwrap_or_default();
        parse_ahead_behind_counts(&counts)
    } else {
        (0, 0)
    };
    let changed_files = read_changed_git_files(repo_path)?;
    let diff = read_git_diff(repo_path, sha.is_some())?;
    let has_diff = !changed_files.is_empty() || !diff.trim().is_empty();

    Ok(HostGitStatus {
        cwd: cwd.to_string(),
        repo_root: Some(repo_root),
        branch,
        sha,
        upstream,
        ahead,
        behind,
        changed_files,
        has_diff,
        diff,
    })
}

fn create_pending_worktree(
    request: CreatePendingWorktreeRequest,
) -> Result<CreatePendingWorktreeResponse, String> {
    let cwd = request.cwd.trim();
    if cwd.is_empty() {
        return Err("cwd is empty".to_string());
    }
    let repo_root =
        git_repo_root(Path::new(cwd))?.ok_or_else(|| format!("not a git repository: {cwd}"))?;
    let repo_path = PathBuf::from(&repo_root);
    let base_ref = normalize_base_ref(request.base_ref.as_deref())?;
    let commit_ref = format!("{base_ref}^{{commit}}");
    let base_sha = git_stdout_required(
        &repo_path,
        &["rev-parse", "--verify", &commit_ref],
        "failed to resolve worktree base ref",
    )?;
    let repo_name = repo_path
        .file_name()
        .and_then(|value| value.to_str())
        .unwrap_or("repo");
    let default_name = default_pending_worktree_name(repo_name, SystemTime::now());
    let base_name = request
        .branch_name
        .as_deref()
        .map(str::trim)
        .filter(|value| !value.is_empty())
        .map(|value| sanitize_pending_worktree_name(value, &default_name))
        .unwrap_or(default_name);
    let (worktree_path, branch_name) = unique_pending_worktree_target(&repo_path, &base_name)?;

    let output = Command::new("git")
        .arg("-C")
        .arg(&repo_path)
        .args(["worktree", "add", "-b"])
        .arg(&branch_name)
        .arg(&worktree_path)
        .arg(&base_ref)
        .output()
        .map_err(|error| format!("failed to run git worktree add: {error}"))?;
    if !output.status.success() {
        return Err(format_git_failure(
            "failed to create pending worktree",
            &output,
        ));
    }

    Ok(CreatePendingWorktreeResponse {
        repo_root,
        path: worktree_path.to_string_lossy().to_string(),
        branch_name,
        base_ref,
        base_sha,
    })
}

fn non_git_status(cwd: &str) -> HostGitStatus {
    HostGitStatus {
        cwd: cwd.to_string(),
        repo_root: None,
        branch: None,
        sha: None,
        upstream: None,
        ahead: 0,
        behind: 0,
        changed_files: Vec::new(),
        has_diff: false,
        diff: String::new(),
    }
}

fn git_repo_root(cwd: &Path) -> Result<Option<String>, String> {
    let output = run_git(cwd, &["rev-parse", "--show-toplevel"])?;
    if !output.status.success() {
        return Ok(None);
    }
    let repo_root = command_stdout(&output);
    Ok((!repo_root.is_empty()).then_some(repo_root))
}

fn read_changed_git_files(repo_path: &Path) -> Result<Vec<HostGitChangedFile>, String> {
    let output = run_git(
        repo_path,
        &["status", "--porcelain=v1", "-z", "--untracked-files=all"],
    )?;
    if !output.status.success() {
        return Err(format_git_failure("failed to read git status", &output));
    }
    Ok(parse_git_status_porcelain_z(&output.stdout))
}

fn read_git_diff(repo_path: &Path, has_head: bool) -> Result<String, String> {
    let output = if has_head {
        run_git(
            repo_path,
            &["diff", "--no-ext-diff", "--no-color", "HEAD", "--"],
        )?
    } else {
        run_git(repo_path, &["diff", "--no-ext-diff", "--no-color", "--"])?
    };
    if output.status.success() {
        return Ok(String::from_utf8_lossy(&output.stdout).to_string());
    }
    Err(format_git_failure("failed to read git diff", &output))
}

fn run_git(cwd: &Path, args: &[&str]) -> Result<std::process::Output, String> {
    Command::new("git")
        .arg("-C")
        .arg(cwd)
        .args(args)
        .output()
        .map_err(|error| format!("failed to run git: {error}"))
}

fn git_stdout_optional(cwd: &Path, args: &[&str]) -> Result<Option<String>, String> {
    let output = run_git(cwd, args)?;
    if !output.status.success() {
        return Ok(None);
    }
    let text = command_stdout(&output);
    Ok((!text.is_empty()).then_some(text))
}

fn git_stdout_required(cwd: &Path, args: &[&str], context: &str) -> Result<String, String> {
    let output = run_git(cwd, args)?;
    if output.status.success() {
        let text = command_stdout(&output);
        if !text.is_empty() {
            return Ok(text);
        }
    }
    Err(format_git_failure(context, &output))
}

fn command_stdout(output: &std::process::Output) -> String {
    String::from_utf8_lossy(&output.stdout).trim().to_string()
}

fn format_git_failure(context: &str, output: &std::process::Output) -> String {
    let stderr = String::from_utf8_lossy(&output.stderr).trim().to_string();
    let stdout = String::from_utf8_lossy(&output.stdout).trim().to_string();
    let detail = if stderr.is_empty() { stdout } else { stderr };
    if detail.is_empty() {
        format!("{context}: git exited with status {}", output.status)
    } else {
        format!("{context}: {detail}")
    }
}

fn parse_git_status_porcelain_z(output: &[u8]) -> Vec<HostGitChangedFile> {
    let entries = output
        .split(|byte| *byte == 0)
        .filter(|entry| !entry.is_empty())
        .collect::<Vec<_>>();
    let mut files = Vec::new();
    let mut index = 0;
    while index < entries.len() {
        let entry = entries[index];
        if entry.len() < 4 {
            index += 1;
            continue;
        }
        let status_raw = String::from_utf8_lossy(&entry[..2]).to_string();
        let status = status_raw.trim().to_string();
        let path_start = if entry.get(2) == Some(&b' ') { 3 } else { 2 };
        let path = String::from_utf8_lossy(&entry[path_start..]).to_string();
        let is_rename_or_copy = status_raw
            .as_bytes()
            .iter()
            .any(|byte| matches!(*byte, b'R' | b'C'));
        let old_path = if is_rename_or_copy && index + 1 < entries.len() {
            index += 1;
            Some(String::from_utf8_lossy(entries[index]).to_string())
        } else {
            None
        };
        files.push(HostGitChangedFile {
            status,
            path,
            old_path,
        });
        index += 1;
    }
    files
}

fn parse_ahead_behind_counts(value: &str) -> (u32, u32) {
    let mut parts = value.split_whitespace();
    let ahead = parts
        .next()
        .and_then(|part| part.parse::<u32>().ok())
        .unwrap_or(0);
    let behind = parts
        .next()
        .and_then(|part| part.parse::<u32>().ok())
        .unwrap_or(0);
    (ahead, behind)
}

fn normalize_base_ref(value: Option<&str>) -> Result<String, String> {
    let base_ref = value
        .map(str::trim)
        .filter(|value| !value.is_empty())
        .unwrap_or("HEAD");
    if base_ref.len() > 240 {
        return Err("baseRef is too long".to_string());
    }
    if base_ref.starts_with('-') {
        return Err("baseRef must not start with '-'".to_string());
    }
    if base_ref
        .chars()
        .any(|ch| ch.is_control() || ch.is_whitespace())
    {
        return Err("baseRef contains unsupported whitespace or control characters".to_string());
    }
    Ok(base_ref.to_string())
}

fn unique_pending_worktree_target(
    repo_path: &Path,
    base_name: &str,
) -> Result<(PathBuf, String), String> {
    let parent = repo_path
        .parent()
        .ok_or_else(|| "repository root has no parent directory".to_string())?;
    for attempt in 0..1000 {
        let candidate = if attempt == 0 {
            base_name.to_string()
        } else {
            format!("{base_name}-{}", attempt + 1)
        };
        let path = parent.join(&candidate);
        if path.exists() || git_branch_exists(repo_path, &candidate)? {
            continue;
        }
        return Ok((path, candidate));
    }
    Err("failed to allocate a unique pending worktree name".to_string())
}

fn git_branch_exists(repo_path: &Path, branch_name: &str) -> Result<bool, String> {
    let branch_ref = format!("refs/heads/{branch_name}");
    let output = run_git(repo_path, &["show-ref", "--verify", "--quiet", &branch_ref])?;
    Ok(output.status.success())
}

fn default_pending_worktree_name(repo_name: &str, now: SystemTime) -> String {
    let repo = sanitize_pending_worktree_name(repo_name, "repo");
    format!("{repo}-worktree-{}", format_worktree_timestamp(now))
}

fn sanitize_pending_worktree_name(value: &str, fallback: &str) -> String {
    let mut sanitized = String::new();
    let mut last_dash = false;
    for ch in value.trim().chars() {
        let mapped = if ch.is_ascii_alphanumeric() || matches!(ch, '_' | '.') {
            ch
        } else if ch == '-' {
            '-'
        } else {
            '-'
        };
        if mapped == '-' {
            if !last_dash {
                sanitized.push('-');
            }
            last_dash = true;
        } else {
            sanitized.push(mapped);
            last_dash = false;
        }
        if sanitized.len() >= 96 {
            break;
        }
    }
    while sanitized.contains("..") {
        sanitized = sanitized.replace("..", ".");
    }
    let sanitized = sanitized
        .trim_matches(|ch| matches!(ch, '-' | '_' | '.'))
        .to_string();
    let mut sanitized = if sanitized.is_empty() {
        fallback.to_string()
    } else {
        sanitized
    };
    if sanitized.to_ascii_lowercase().ends_with(".lock") {
        sanitized.push_str("-branch");
    }
    sanitized
}

fn format_worktree_timestamp(time: SystemTime) -> String {
    let seconds = time
        .duration_since(UNIX_EPOCH)
        .map(|duration| duration.as_secs() as i64)
        .unwrap_or(0);
    let days = seconds.div_euclid(86_400);
    let seconds_of_day = seconds.rem_euclid(86_400);
    let (year, month, day) = civil_from_days(days);
    let hour = seconds_of_day / 3_600;
    let minute = (seconds_of_day % 3_600) / 60;
    let second = seconds_of_day % 60;
    format!("{year:04}{month:02}{day:02}-{hour:02}{minute:02}{second:02}")
}

fn civil_from_days(days_since_epoch: i64) -> (i64, i64, i64) {
    let z = days_since_epoch + 719_468;
    let era = if z >= 0 { z } else { z - 146_096 } / 146_097;
    let doe = z - era * 146_097;
    let yoe = (doe - doe / 1_460 + doe / 36_524 - doe / 146_096) / 365;
    let y = yoe + era * 400;
    let doy = doe - (365 * yoe + yoe / 4 - yoe / 100);
    let mp = (5 * doy + 2) / 153;
    let day = doy - (153 * mp + 2) / 5 + 1;
    let month = mp + if mp < 10 { 3 } else { -9 };
    let year = y + if month <= 2 { 1 } else { 0 };
    (year, month, day)
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
        let base = std::env::temp_dir().join(format!(
            "hicodex-find-rollout-{}-{nanos}",
            std::process::id()
        ));
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

#[tauri::command]
fn host_read_thread_tool_history(
    state: State<'_, AppState>,
    codex_home: Option<String>,
    thread_id: String,
    thread_path: Option<String>,
) -> Result<ThreadToolHistory, String> {
    state
        .host
        .read_thread_tool_history(codex_home, thread_id, thread_path)
        .map_err(|error| error.to_string())
}

#[tauri::command]
fn host_generate_image(request: ImageGenerationRequest) -> Result<Value, String> {
    let endpoint = image_generations_endpoint(&request.base_url)?;
    let body = serde_json::to_vec(&request.payload)
        .map_err(|error| format!("failed to serialize image request: {error}"))?;
    let header_path = write_image_request_headers(request.api_key.as_deref())?;
    let header_arg = format!("@{}", header_path.to_string_lossy());
    let mut command = Command::new("curl");
    command
        .args([
            "--fail-with-body",
            "--silent",
            "--show-error",
            "--connect-timeout",
            "30",
            "--max-time",
            "180",
            "--request",
            "POST",
            "--header",
            &header_arg,
            "--data-binary",
            "@-",
            &endpoint,
        ])
        .stdin(Stdio::piped())
        .stdout(Stdio::piped())
        .stderr(Stdio::piped());

    let mut child = match command.spawn() {
        Ok(child) => child,
        Err(error) => {
            let _ = fs::remove_file(&header_path);
            return Err(format!("failed to start image request: {error}"));
        }
    };
    let mut stdin = child.stdin.take().ok_or_else(|| {
        let _ = fs::remove_file(&header_path);
        "failed to open image request stdin".to_string()
    })?;
    if let Err(error) = stdin.write_all(&body) {
        let _ = fs::remove_file(&header_path);
        return Err(format!("failed to write image request body: {error}"));
    }
    drop(stdin);

    let output = match child.wait_with_output() {
        Ok(output) => output,
        Err(error) => {
            let _ = fs::remove_file(&header_path);
            return Err(format!("failed to wait for image request: {error}"));
        }
    };
    let _ = fs::remove_file(&header_path);
    if !output.status.success() {
        let stderr = String::from_utf8_lossy(&output.stderr).trim().to_string();
        let stdout = String::from_utf8_lossy(&output.stdout).trim().to_string();
        let detail = [stderr, stdout]
            .into_iter()
            .filter(|value| !value.is_empty())
            .collect::<Vec<_>>()
            .join(": ");
        return Err(if detail.is_empty() {
            format!("image generation backend returned {}", output.status)
        } else {
            detail
        });
    }

    let response = serde_json::from_slice(&output.stdout)
        .map_err(|error| format!("image generation backend returned invalid JSON: {error}"))?;
    persist_image_generation_response(
        response,
        request.codex_home.as_deref(),
        request.thread_id.as_deref(),
    )
}

fn write_image_request_headers(api_key: Option<&str>) -> Result<std::path::PathBuf, String> {
    let mut content = String::from("Content-Type: application/json\n");
    if let Some(token) = api_key.map(str::trim).filter(|value| !value.is_empty()) {
        content.push_str("Authorization: Bearer ");
        content.push_str(token);
        content.push('\n');
    }
    let path = temp_file_path("hicodex-image-headers", "txt");
    fs::write(&path, content)
        .map_err(|error| format!("failed to write image request headers: {error}"))?;
    Ok(path)
}

fn temp_file_path(prefix: &str, extension: &str) -> std::path::PathBuf {
    let nanos = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|value| value.as_nanos())
        .unwrap_or_default();
    env::temp_dir().join(format!(
        "{prefix}-{}-{nanos}.{extension}",
        std::process::id()
    ))
}

fn image_generations_endpoint(base_url: &str) -> Result<String, String> {
    let trimmed = base_url.trim().trim_end_matches('/');
    if trimmed.is_empty() {
        return Err("image generation base URL is empty".to_string());
    }
    if !(trimmed.starts_with("http://") || trimmed.starts_with("https://")) {
        return Err("image generation base URL must start with http:// or https://".to_string());
    }
    Ok(format!("{trimmed}/images/generations"))
}

fn persist_image_generation_response(
    mut response: Value,
    codex_home: Option<&str>,
    thread_id: Option<&str>,
) -> Result<Value, String> {
    let Some(codex_home) = codex_home.map(str::trim).filter(|value| !value.is_empty()) else {
        return Ok(response);
    };
    let Some(data) = response.get_mut("data").and_then(Value::as_array_mut) else {
        return Ok(response);
    };
    let Some(first) = data.first_mut().and_then(Value::as_object_mut) else {
        return Ok(response);
    };
    let image_b64 = first
        .get("b64_json")
        .or_else(|| first.get("b64Json"))
        .and_then(Value::as_str)
        .map(str::trim)
        .filter(|value| !value.is_empty());
    let Some(image_b64) = image_b64 else {
        return Ok(response);
    };
    let image_bytes = general_purpose::STANDARD
        .decode(image_b64)
        .map_err(|error| format!("image generation backend returned invalid b64_json: {error}"))?;
    let output_dir = image_generation_output_dir(codex_home, thread_id);
    fs::create_dir_all(&output_dir)
        .map_err(|error| format!("failed to create image output directory: {error}"))?;
    let extension = image_generation_response_extension(first).unwrap_or("png");
    let output_path = output_dir.join(format!(
        "ig_{}.{}",
        image_content_hash(&image_bytes),
        extension
    ));
    if !output_path.exists() {
        fs::write(&output_path, &image_bytes)
            .map_err(|error| format!("failed to save generated image: {error}"))?;
    }
    first.insert(
        "url".to_string(),
        Value::String(file_url_from_path(&output_path)),
    );
    Ok(response)
}

fn image_generation_output_dir(codex_home: &str, thread_id: Option<&str>) -> PathBuf {
    let thread_dir = thread_id
        .map(sanitize_image_generation_path_segment)
        .filter(|value| !value.is_empty())
        .unwrap_or_else(|| "unthreaded".to_string());
    Path::new(codex_home)
        .join("generated_images")
        .join(thread_dir)
}

fn sanitize_image_generation_path_segment(value: &str) -> String {
    let mut sanitized = String::new();
    for ch in value.trim().chars().take(120) {
        if ch.is_ascii_alphanumeric() || matches!(ch, '-' | '_' | '.') {
            sanitized.push(ch);
        } else {
            sanitized.push('_');
        }
    }
    sanitized.trim_matches('.').to_string()
}

fn image_content_hash(bytes: &[u8]) -> String {
    let mut hash = 0xcbf2_9ce4_8422_2325_u64;
    for byte in bytes {
        hash ^= u64::from(*byte);
        hash = hash.wrapping_mul(0x0000_0100_0000_01b3);
    }
    format!("{hash:016x}")
}

fn image_generation_response_extension(
    image: &serde_json::Map<String, Value>,
) -> Option<&'static str> {
    [
        "mimeType",
        "mime_type",
        "contentType",
        "content_type",
        "mime",
    ]
    .into_iter()
    .filter_map(|key| image.get(key).and_then(Value::as_str))
    .find_map(image_mime_extension)
}

fn image_mime_extension(value: &str) -> Option<&'static str> {
    let mime = value.split(';').next()?.trim().to_ascii_lowercase();
    match mime.as_str() {
        "image/avif" => Some("avif"),
        "image/bmp" => Some("bmp"),
        "image/gif" => Some("gif"),
        "image/heic" => Some("heic"),
        "image/heif" => Some("heif"),
        "image/jpeg" | "image/jpg" => Some("jpg"),
        "image/png" => Some("png"),
        "image/svg+xml" => Some("svg"),
        "image/tiff" => Some("tiff"),
        "image/webp" => Some("webp"),
        _ => None,
    }
}

fn file_url_from_path(path: &Path) -> String {
    let path = path.to_string_lossy();
    let mut url = String::from("file://");
    for byte in path.as_bytes() {
        match *byte {
            b'A'..=b'Z' | b'a'..=b'z' | b'0'..=b'9' | b'-' | b'.' | b'_' | b'~' | b'/' => {
                url.push(char::from(*byte));
            }
            _ => {
                url.push_str(&format!("%{byte:02X}"));
            }
        }
    }
    url
}

#[cfg(test)]
mod tests {
    use super::{
        default_pending_worktree_name, file_url_from_path, host_generate_image,
        image_generations_endpoint, is_supported_native_shell_url, parse_ahead_behind_counts,
        parse_git_status_porcelain_z, persist_image_generation_response,
        sanitize_pending_worktree_name, HostGitChangedFile, ImageGenerationRequest,
    };
    use serde_json::json;
    use std::fs;
    use std::io::{Read, Write};
    use std::net::TcpListener;
    use std::path::PathBuf;
    use std::thread;
    use std::time::Duration;
    use std::time::{SystemTime, UNIX_EPOCH};

    fn temp_dir() -> PathBuf {
        let nanos = SystemTime::now()
            .duration_since(UNIX_EPOCH)
            .map(|value| value.as_nanos())
            .unwrap_or_default();
        let base =
            std::env::temp_dir().join(format!("hicodex-image-test-{}-{nanos}", std::process::id()));
        let _ = fs::remove_dir_all(&base);
        fs::create_dir_all(&base).unwrap();
        base
    }

    #[test]
    fn builds_image_generation_endpoint_from_base_url() {
        assert_eq!(
            image_generations_endpoint(" http://127.0.0.1:8890/v1/// ").unwrap(),
            "http://127.0.0.1:8890/v1/images/generations"
        );
    }

    #[test]
    fn rejects_non_http_image_generation_base_url() {
        assert!(image_generations_endpoint("file:///tmp/socket").is_err());
    }

    #[test]
    fn sanitizes_pending_worktree_branch_and_path_names() {
        assert_eq!(
            sanitize_pending_worktree_name(" ../feature/foo:bar.lock ", "fallback"),
            "feature-foo-bar.lock-branch"
        );
        assert_eq!(
            sanitize_pending_worktree_name("a..b   c", "fallback"),
            "a.b-c"
        );
        assert_eq!(
            sanitize_pending_worktree_name(" ../.. ", "fallback"),
            "fallback"
        );
    }

    #[test]
    fn parses_git_status_porcelain_z_entries() {
        let files = parse_git_status_porcelain_z(
            b" M src/lib.rs\0R  renamed file.rs\0old file.rs\0?? new.txt\0",
        );
        assert_eq!(
            files,
            vec![
                HostGitChangedFile {
                    status: "M".to_string(),
                    path: "src/lib.rs".to_string(),
                    old_path: None,
                },
                HostGitChangedFile {
                    status: "R".to_string(),
                    path: "renamed file.rs".to_string(),
                    old_path: Some("old file.rs".to_string()),
                },
                HostGitChangedFile {
                    status: "??".to_string(),
                    path: "new.txt".to_string(),
                    old_path: None,
                },
            ]
        );
    }

    #[test]
    fn parses_ahead_behind_counts() {
        assert_eq!(parse_ahead_behind_counts("3\t12\n"), (3, 12));
        assert_eq!(parse_ahead_behind_counts("bad data"), (0, 0));
        assert_eq!(parse_ahead_behind_counts("7"), (7, 0));
    }

    #[test]
    fn builds_nonempty_default_pending_worktree_name() {
        let name = default_pending_worktree_name("???", UNIX_EPOCH);
        assert_eq!(name, "repo-worktree-19700101-000000");
    }

    #[test]
    fn recognizes_shell_links_and_connector_oauth_callbacks() {
        assert!(is_supported_native_shell_url("codex://threads/thread-1"));
        assert!(is_supported_native_shell_url(
            "https://chatgpt.com/aip/connectors/links/oauth/callback?state=s&code=c"
        ));
        assert!(is_supported_native_shell_url(
            "https://chatgpt.com/connector_platform_oauth_redirect?state=s&code=c"
        ));
        assert!(!is_supported_native_shell_url(
            "https://example.com/threads/thread-1"
        ));
    }

    #[test]
    fn host_generate_image_posts_to_configured_image_endpoint() {
        let listener = TcpListener::bind("127.0.0.1:0").unwrap();
        let address = listener.local_addr().unwrap();
        let server = thread::spawn(move || {
            let (mut stream, _) = listener.accept().unwrap();
            stream
                .set_read_timeout(Some(Duration::from_secs(2)))
                .unwrap();
            let mut request = String::new();
            let mut buffer = [0_u8; 4096];
            loop {
                match stream.read(&mut buffer) {
                    Ok(0) => break,
                    Ok(count) => {
                        request.push_str(&String::from_utf8_lossy(&buffer[..count]));
                        if request.contains("\r\n\r\n")
                            && request.contains("\"prompt\":\"blue sky\"")
                        {
                            break;
                        }
                    }
                    Err(error)
                        if error.kind() == std::io::ErrorKind::WouldBlock
                            || error.kind() == std::io::ErrorKind::TimedOut =>
                    {
                        break;
                    }
                    Err(error) => panic!("failed to read image request: {error}"),
                }
            }

            let body = r#"{"data":[{"b64_json":"UE5HREFUQQ=="}]}"#;
            let response = format!(
                "HTTP/1.1 200 OK\r\nContent-Type: application/json\r\nContent-Length: {}\r\nConnection: close\r\n\r\n{}",
                body.len(),
                body
            );
            stream.write_all(response.as_bytes()).unwrap();
            request
        });

        let codex_home = temp_dir();
        let result = host_generate_image(ImageGenerationRequest {
            base_url: format!("http://{address}/v1"),
            api_key: Some("local-secret".to_string()),
            payload: json!({
                "prompt": "blue sky",
                "n": 1,
                "size": "1024x1024",
            }),
            codex_home: Some(codex_home.to_string_lossy().to_string()),
            thread_id: Some("thread/with spaces".to_string()),
        })
        .unwrap();
        let request = server.join().unwrap();

        assert!(request.starts_with("POST /v1/images/generations "));
        assert!(request.contains("Authorization: Bearer local-secret"));
        assert_eq!(result["data"][0]["b64_json"], "UE5HREFUQQ==");
        let output_dir = codex_home
            .join("generated_images")
            .join("thread_with_spaces");
        let saved_images = fs::read_dir(output_dir)
            .unwrap()
            .map(|entry| entry.unwrap().path())
            .collect::<Vec<_>>();
        assert_eq!(saved_images.len(), 1);
        assert_eq!(
            saved_images[0].extension().and_then(|ext| ext.to_str()),
            Some("png")
        );
        assert_eq!(fs::read(&saved_images[0]).unwrap(), b"PNGDATA");
        assert_eq!(
            result["data"][0]["url"],
            file_url_from_path(&saved_images[0])
        );
    }

    #[test]
    fn persists_generated_images_with_response_mime_extension() {
        let codex_home = temp_dir();
        let result = persist_image_generation_response(
            json!({
                "data": [{
                    "b64_json": "V0VCUERBVEE=",
                    "mimeType": "image/webp; charset=binary"
                }]
            }),
            Some(codex_home.to_string_lossy().as_ref()),
            Some("thread-webp"),
        )
        .unwrap();
        let output_dir = codex_home.join("generated_images").join("thread-webp");
        let saved_images = fs::read_dir(output_dir)
            .unwrap()
            .map(|entry| entry.unwrap().path())
            .collect::<Vec<_>>();
        assert_eq!(saved_images.len(), 1);
        assert_eq!(
            saved_images[0].extension().and_then(|ext| ext.to_str()),
            Some("webp")
        );
        assert_eq!(fs::read(&saved_images[0]).unwrap(), b"WEBPDATA");
        assert_eq!(
            result["data"][0]["url"],
            file_url_from_path(&saved_images[0])
        );
    }
}

#[cfg(target_os = "macos")]
fn pick_file_references(kind: Option<&str>, multiple: bool) -> Result<Vec<String>, String> {
    let is_image_picker = matches!(kind, Some("image" | "images"));
    let prompt = if is_image_picker {
        "Select images to attach"
    } else {
        "Select files to attach"
    };
    let type_filter = if is_image_picker {
        " of type {\"png\", \"jpg\", \"jpeg\", \"gif\", \"webp\", \"heic\", \"heif\", \"bmp\", \"tif\", \"tiff\", \"svg\"}"
    } else {
        ""
    };
    let multiple_clause = if multiple {
        " with multiple selections allowed"
    } else {
        ""
    };
    let choose_file = format!("choose file with prompt \"{prompt}\"{type_filter}{multiple_clause}");
    let choose_statement = if multiple {
        format!("set selectedFiles to {choose_file}")
    } else {
        format!("set selectedFiles to {{{choose_file}}}")
    };
    let output = Command::new("osascript")
        .args([
            "-e",
            &choose_statement,
            "-e",
            "set output to \"\"",
            "-e",
            "repeat with selectedFile in selectedFiles",
            "-e",
            "set output to output & POSIX path of selectedFile & linefeed",
            "-e",
            "end repeat",
            "-e",
            "return output",
        ])
        .output()
        .map_err(|error| format!("failed to open file picker: {error}"))?;

    if !output.status.success() {
        let stderr = String::from_utf8_lossy(&output.stderr).trim().to_string();
        if stderr.to_lowercase().contains("user canceled") {
            return Ok(Vec::new());
        }
        return Err(if stderr.is_empty() {
            format!("file picker exited with status {}", output.status)
        } else {
            stderr
        });
    }

    Ok(String::from_utf8_lossy(&output.stdout)
        .lines()
        .map(str::trim)
        .filter(|path| !path.is_empty())
        .map(ToOwned::to_owned)
        .collect())
}

#[cfg(target_os = "macos")]
fn pick_workspace_folder() -> Result<Option<String>, String> {
    let output = Command::new("osascript")
        .args([
            "-e",
            "set selectedFolder to choose folder with prompt \"Use an existing folder\"",
            "-e",
            "return POSIX path of selectedFolder",
        ])
        .output()
        .map_err(|error| format!("failed to open folder picker: {error}"))?;

    if !output.status.success() {
        let stderr = String::from_utf8_lossy(&output.stderr).trim().to_string();
        if stderr.to_lowercase().contains("user canceled") {
            return Ok(None);
        }
        return Err(if stderr.is_empty() {
            format!("folder picker exited with status {}", output.status)
        } else {
            stderr
        });
    }

    let path = String::from_utf8_lossy(&output.stdout).trim().to_string();
    Ok((!path.is_empty()).then_some(path))
}

#[cfg(not(target_os = "macos"))]
fn pick_file_references(_kind: Option<&str>, _multiple: bool) -> Result<Vec<String>, String> {
    Err("file picker is not implemented for this platform yet".to_string())
}

#[cfg(not(target_os = "macos"))]
fn pick_workspace_folder() -> Result<Option<String>, String> {
    Err("folder picker is not implemented for this platform yet".to_string())
}

fn image_mime_type(path: &Path) -> Option<&'static str> {
    let extension = path.extension()?.to_string_lossy().to_lowercase();
    match extension.as_str() {
        "avif" => Some("image/avif"),
        "bmp" => Some("image/bmp"),
        "gif" => Some("image/gif"),
        "heic" => Some("image/heic"),
        "heif" => Some("image/heif"),
        "jpg" | "jpeg" => Some("image/jpeg"),
        "png" => Some("image/png"),
        "svg" => Some("image/svg+xml"),
        "tif" | "tiff" => Some("image/tiff"),
        "webp" => Some("image/webp"),
        _ => None,
    }
}

fn file_mime_type(path: &Path) -> Option<&'static str> {
    if let Some(mime) = image_mime_type(path) {
        return Some(mime);
    }
    let extension = path.extension()?.to_string_lossy().to_lowercase();
    match extension.as_str() {
        "csv" => Some("text/csv"),
        "doc" => Some("application/msword"),
        "docx" => Some("application/vnd.openxmlformats-officedocument.wordprocessingml.document"),
        "html" | "htm" => Some("text/html"),
        "ipynb" => Some("application/x-ipynb+json"),
        "json" => Some("application/json"),
        "md" | "markdown" | "mdx" => Some("text/markdown"),
        "pdf" => Some("application/pdf"),
        "pptx" => Some("application/vnd.openxmlformats-officedocument.presentationml.presentation"),
        "tsv" => Some("text/tab-separated-values"),
        "txt" => Some("text/plain"),
        "xlsx" => Some("application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"),
        _ => None,
    }
}

fn is_word_document_path(path: &Path) -> bool {
    let extension = path
        .extension()
        .map(|value| value.to_string_lossy().to_lowercase())
        .unwrap_or_default();
    matches!(extension.as_str(), "doc" | "docx")
}

fn open_path(path: &Path) -> std::io::Result<()> {
    #[cfg(target_os = "macos")]
    {
        Command::new("open").arg(path).spawn().map(|_| ())
    }
    #[cfg(target_os = "windows")]
    {
        Command::new("cmd")
            .args(["/C", "start", "", &path.to_string_lossy()])
            .spawn()
            .map(|_| ())
    }
    #[cfg(all(unix, not(target_os = "macos")))]
    {
        Command::new("xdg-open").arg(path).spawn().map(|_| ())
    }
}

fn normalized_external_url(value: &str) -> Result<String, String> {
    let trimmed = value.trim();
    if trimmed.is_empty() {
        return Err("external URL is empty".to_string());
    }
    if trimmed
        .chars()
        .any(|value| value.is_control() || value.is_whitespace())
    {
        return Err("external URL contains unsupported whitespace".to_string());
    }
    if !(trimmed.starts_with("http://") || trimmed.starts_with("https://")) {
        return Err("external URL must use http or https".to_string());
    }
    Ok(trimmed.to_string())
}

fn open_external_url(url: &str) -> std::io::Result<()> {
    #[cfg(target_os = "macos")]
    {
        Command::new("open").arg(url).spawn().map(|_| ())
    }
    #[cfg(target_os = "windows")]
    {
        Command::new("cmd")
            .args(["/C", "start", "", url])
            .spawn()
            .map(|_| ())
    }
    #[cfg(all(unix, not(target_os = "macos")))]
    {
        Command::new("xdg-open").arg(url).spawn().map(|_| ())
    }
}

fn notification_text(value: Option<String>, fallback: &str, max_chars: usize) -> String {
    let mut text = value
        .as_deref()
        .map(str::trim)
        .filter(|value| !value.is_empty())
        .unwrap_or(fallback)
        .to_string();
    if text.chars().count() > max_chars {
        text = text.chars().take(max_chars).collect();
        text.push_str("...");
    }
    text
}

fn install_native_menu(app: &mut tauri::App) -> tauri::Result<()> {
    let handle = app.handle();
    let settings = MenuItemBuilder::with_id(MENU_SETTINGS, "Settings")
        .accelerator("CmdOrCtrl+,")
        .build(handle)?;
    let quit = MenuItemBuilder::with_id(MENU_QUIT, "Quit HiCodex")
        .accelerator("CmdOrCtrl+Q")
        .build(handle)?;
    let new_chat = MenuItemBuilder::with_id(MENU_NEW_CHAT, "New Chat")
        .accelerator("CmdOrCtrl+N")
        .build(handle)?;
    let search = MenuItemBuilder::with_id(MENU_SEARCH, "Search")
        .accelerator("CmdOrCtrl+K")
        .build(handle)?;
    let close = MenuItemBuilder::with_id(MENU_CLOSE, "Close Window")
        .accelerator("CmdOrCtrl+W")
        .build(handle)?;
    let reload = MenuItemBuilder::with_id(MENU_RELOAD, "Reload")
        .accelerator("CmdOrCtrl+R")
        .build(handle)?;
    let undo = PredefinedMenuItem::undo(handle, None)?;
    let redo = PredefinedMenuItem::redo(handle, None)?;
    let edit_separator = PredefinedMenuItem::separator(handle)?;
    let cut = PredefinedMenuItem::cut(handle, None)?;
    let copy = PredefinedMenuItem::copy(handle, None)?;
    let paste = PredefinedMenuItem::paste(handle, None)?;
    let select_all = PredefinedMenuItem::select_all(handle, None)?;

    let app_menu = SubmenuBuilder::new(handle, "HiCodex")
        .item(&settings)
        .separator()
        .item(&quit)
        .build()?;
    let file_menu = SubmenuBuilder::new(handle, "File")
        .item(&new_chat)
        .item(&search)
        .separator()
        .item(&close)
        .build()?;
    let edit_menu = SubmenuBuilder::new(handle, "Edit")
        .item(&undo)
        .item(&redo)
        .item(&edit_separator)
        .item(&cut)
        .item(&copy)
        .item(&paste)
        .item(&select_all)
        .build()?;
    let view_menu = SubmenuBuilder::new(handle, "View").item(&reload).build()?;
    let menu = MenuBuilder::new(handle)
        .item(&app_menu)
        .item(&file_menu)
        .item(&edit_menu)
        .item(&view_menu)
        .build()?;
    app.set_menu(menu)?;
    Ok(())
}

fn handle_native_menu_event(app: &AppHandle, id: &str) {
    match id {
        MENU_NEW_CHAT => emit_native_shell_action(app, "newChat", true, None, None),
        MENU_SEARCH => emit_native_shell_action(app, "search", true, None, None),
        MENU_SETTINGS => emit_native_shell_action(app, "settings", true, None, None),
        MENU_RELOAD => emit_unsupported_native_menu_action(
            app,
            "reload",
            "Reload is unsupported because HiCodex has no separate browser panel.",
        ),
        MENU_CLOSE => emit_unsupported_native_menu_action(
            app,
            "closeWindow",
            "Close Window is unsupported because HiCodex has no safe tab target.",
        ),
        MENU_QUIT => app.exit(0),
        _ => {}
    }
}

fn emit_native_shell_action(
    app: &AppHandle,
    action: &str,
    supported: bool,
    message: Option<&str>,
    url: Option<&str>,
) {
    let _ = activate_main_window(app);
    let _ = app.emit(
        NATIVE_SHELL_EVENT_NAME,
        json!({
            "action": action,
            "supported": supported,
            "message": message,
            "url": url,
        }),
    );
}

fn activate_main_window(app: &AppHandle) -> tauri::Result<()> {
    if let Some(window) = app.get_webview_window("main") {
        window.unminimize()?;
        window.show()?;
        window.set_focus()?;
    }
    Ok(())
}

fn emit_unsupported_native_menu_action(app: &AppHandle, action: &str, message: &str) {
    emit_native_shell_action(app, action, false, Some(message), None);
    eprintln!("HiCodex native shell: {message}");
}

fn handle_deep_link_url(app: &AppHandle, url: &str) -> Result<(), String> {
    let trimmed = url.trim();
    if !is_supported_native_shell_url(trimmed) {
        return Err(
            "native shell URL must be a codex:// link or connector OAuth callback".to_string(),
        );
    }
    emit_native_shell_action(app, "openDeepLink", true, None, Some(trimmed));
    eprintln!("HiCodex native shell: received deep link {trimmed}");
    Ok(())
}

fn handle_deep_link_urls<'a, I>(app: &AppHandle, urls: I)
where
    I: IntoIterator<Item = &'a str>,
{
    for url in urls {
        if let Err(error) = handle_deep_link_url(app, url) {
            eprintln!("HiCodex native shell: ignored deep link {url}: {error}");
        }
    }
}

fn handle_single_instance_activation(app: &AppHandle, args: Vec<String>, cwd: String) {
    let _ = activate_main_window(app);
    let deep_link_args = args
        .iter()
        .map(String::as_str)
        .filter(|arg| is_supported_native_shell_url(arg.trim()));
    handle_deep_link_urls(app, deep_link_args);
    eprintln!("HiCodex native shell: focused existing instance from cwd {cwd}");
}

fn is_supported_native_shell_url(url: &str) -> bool {
    url.starts_with(CODEX_DEEP_LINK_SCHEME) || is_app_connect_oauth_callback_url(url)
}

fn is_app_connect_oauth_callback_url(url: &str) -> bool {
    let lower = url.trim().to_ascii_lowercase();
    if !(lower.starts_with("https://") || lower.starts_with("http://")) {
        return false;
    }
    lower.contains(APP_CONNECT_OAUTH_CALLBACK_PATH)
        || lower.contains(APP_CONNECT_OAUTH_BROWSER_REDIRECT_PATH)
}

fn install_deep_link_handlers(app: &tauri::App) {
    match app.deep_link().get_current() {
        Ok(Some(urls)) => {
            let url_strings: Vec<String> =
                urls.iter().map(|url| url.as_str().to_string()).collect();
            handle_deep_link_urls(app.handle(), url_strings.iter().map(String::as_str));
        }
        Ok(None) => {}
        Err(error) => {
            eprintln!("HiCodex native shell: failed to read startup deep links: {error}");
        }
    }

    let handle = app.handle().clone();
    app.deep_link().on_open_url(move |event| {
        let url_strings: Vec<String> = event
            .urls()
            .iter()
            .map(|url| url.as_str().to_string())
            .collect();
        handle_deep_link_urls(&handle, url_strings.iter().map(String::as_str));
    });
}

fn log_unsupported_native_shell_boundaries() {
    eprintln!(
        "HiCodex native shell: release update endpoints/signing and product notification entitlement/distribution policy still need production configuration"
    );
}

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

#[derive(Serialize)]
struct WorkspaceDirEntry {
    // codex: workspace-directory-tree :j entries shape — `{ type, path }` with
    // `type ∈ {'directory','file'}`. We also send `name` so the renderer does
    // not have to split the path again.
    #[serde(rename = "type")]
    kind: &'static str,
    path: String,
    name: String,
}

#[derive(Serialize)]
struct WorkspaceListDirResponse {
    entries: Vec<WorkspaceDirEntry>,
}

#[tauri::command]
fn host_workspace_list_dir(
    root: String,
    dir_path: String,
    include_hidden: bool,
) -> Result<WorkspaceListDirResponse, String> {
    // codex: workspace-directory-tree-CHHgPVoD :_e — non-recursive direct-children
    // listing keyed on (root, dirPath). Renderer drives recursion via expand.
    let root_trimmed = root.trim();
    if root_trimmed.is_empty() {
        return Err("workspace root is empty".to_string());
    }
    let root_path = Path::new(root_trimmed);
    if !root_path.is_dir() {
        return Err(format!("workspace root is not a directory: {root_trimmed}"));
    }

    let dir_trimmed = dir_path.trim();
    let abs_dir = if dir_trimmed.is_empty() {
        root_path.to_path_buf()
    } else {
        // Reject `..` segments outright to avoid escaping the workspace root.
        if dir_trimmed
            .split(['/', '\\'])
            .any(|segment| segment == "..")
        {
            return Err("workspace path cannot contain '..' segments".to_string());
        }
        root_path.join(dir_trimmed)
    };
    if !abs_dir.is_dir() {
        return Err(format!("not a directory: {}", abs_dir.display()));
    }

    let mut entries: Vec<WorkspaceDirEntry> = Vec::new();
    let read_iter = fs::read_dir(&abs_dir)
        .map_err(|error| format!("failed to read directory: {error}"))?;
    for raw_entry in read_iter {
        let entry =
            raw_entry.map_err(|error| format!("failed to read directory entry: {error}"))?;
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
            .strip_prefix(root_path)
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

fn main() {
    tauri::Builder::default()
        .plugin(tauri_plugin_single_instance::init(
            handle_single_instance_activation,
        ))
        .plugin(tauri_plugin_deep_link::init())
        .plugin(tauri_plugin_shell::init())
        .plugin(tauri_plugin_notification::init())
        .plugin(tauri_plugin_updater::Builder::new().build())
        .plugin(tauri_plugin_process::init())
        .on_menu_event(|app, event| {
            handle_native_menu_event(app, event.id().as_ref());
        })
        .manage(AppState::default())
        .setup(|app| {
            install_native_menu(app)?;
            install_deep_link_handlers(app);
            log_unsupported_native_shell_boundaries();
            let handle = app.handle().clone();
            let state = app.state::<AppState>();
            state.host.forward_events(move |event| {
                let _ = handle.emit(APP_SERVER_EVENT_NAME, event);
            });
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            host_start_app_server,
            host_stop_app_server,
            host_status,
            host_send_raw,
            host_write_local_model_catalog,
            host_read_codex_auth_summary,
            host_read_installation_state,
            host_open_file_reference,
            host_open_external_url,
            host_pick_file_references,
            host_pick_workspace_folder,
            host_read_image_data_url,
            host_read_file_metadata,
            host_read_text_file,
            host_read_spreadsheet_preview,
            host_read_file_bytes_base64,
            host_read_document_preview,
            host_git_status,
            host_git_list_branches,
            host_git_checkout_branch,
            host_git_default_branch,
            host_git_create_branch,
            host_gh_pr_status,
            host_apply_patch_action,
            host_create_pending_worktree,
            host_find_rollout_for_thread,
            host_read_thread_tool_history,
            host_notify_turn_completed,
            host_handle_deep_link_url,
            host_generate_image,
            host_workspace_list_dir
        ])
        .run(tauri::generate_context!())
        .expect("error while running HiCodex desktop");
}
