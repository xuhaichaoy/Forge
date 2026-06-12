use serde::{Deserialize, Serialize};
use std::io::Write;
use std::path::{Path, PathBuf};
use std::process::Stdio;
use std::time::{SystemTime, UNIX_EPOCH};

use crate::{civil_from_days, new_command};

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub(crate) struct HostGitStatus {
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
    // codex thread-env-icon — true when the cwd is a LINKED git worktree.
    is_worktree: bool,
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
pub(crate) struct CreatePendingWorktreeRequest {
    cwd: String,
    branch_name: Option<String>,
    base_ref: Option<String>,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub(crate) struct CreatePendingWorktreeResponse {
    repo_root: String,
    path: String,
    branch_name: String,
    base_ref: String,
    base_sha: String,
}

#[tauri::command]
pub(crate) fn host_git_status(cwd: String) -> Result<HostGitStatus, String> {
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
pub(crate) struct GitBranchesResponse {
    current: Option<String>,
    branches: Vec<GitBranchInfo>,
}

// codex: branch-picker-extension — `host_git_default_branch` payload mirrors
// Codex Desktop's `useGitDefaultBranch` hook. We surface a single optional
// string so the renderer can render the "Default" chip without inventing a
// per-branch field on the branches list.
#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub(crate) struct GitDefaultBranchResponse {
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
pub(crate) fn host_git_list_branches(
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
pub(crate) fn host_git_default_branch(cwd: String) -> Result<GitDefaultBranchResponse, String> {
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
pub(crate) struct CreateGitBranchRequest {
    cwd: String,
    branch_name: String,
    #[serde(default)]
    based_on: Option<String>,
}

#[tauri::command]
pub(crate) fn host_git_create_branch(request: CreateGitBranchRequest) -> Result<(), String> {
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
pub(crate) struct GhPrStatusResponse {
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
pub(crate) fn host_gh_pr_status(cwd: String) -> Result<GhPrStatusResponse, String> {
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

    let output = match new_command("gh")
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
    Ok(GhPrStatusResponse { current_branch, pr })
}

// codex: composer-footer-branch-switcher-CamXBKfA.js — switch to an existing
// local branch. We deliberately do NOT pass `-f`: if the working tree has
// uncommitted changes that would be overwritten, git's stderr propagates up
// to the renderer so it can show the failure inline (matches Codex's "Switch
// failed: please commit or stash" toast).
#[tauri::command]
pub(crate) fn host_git_checkout_branch(cwd: String, branch_name: String) -> Result<(), String> {
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
pub(crate) struct PatchActionRequest {
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
pub(crate) struct PatchActionResult {
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
pub(crate) fn host_apply_patch_action(
    request: PatchActionRequest,
) -> Result<PatchActionResult, String> {
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
    let mut child = new_command("git")
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
pub(crate) fn host_create_pending_worktree(
    request: CreatePendingWorktreeRequest,
) -> Result<CreatePendingWorktreeResponse, String> {
    create_pending_worktree(request)
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
    // Compute before moving `repo_root` into the struct (repo_path borrows it).
    let is_worktree = git_is_linked_worktree(repo_path);

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
        is_worktree,
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

    let output = new_command("git")
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
        is_worktree: false,
    }
}

// codex thread-env-icon (worktree env, tooltip "running in a local git worktree") —
// detect whether `repo_path` is a LINKED git worktree (created via `git worktree
// add`). A linked worktree's git dir lives under the main repo's
// `.git/worktrees/<name>`, whereas the main working tree's git dir is the repo's
// own `.git`; `--absolute-git-dir` resolves the per-worktree path so we can tell.
fn git_is_linked_worktree(repo_path: &Path) -> bool {
    run_git(repo_path, &["rev-parse", "--absolute-git-dir"])
        .ok()
        .filter(|output| output.status.success())
        .map(|output| command_stdout(&output))
        .map(|git_dir| {
            git_dir.contains("/.git/worktrees/") || git_dir.contains("\\.git\\worktrees\\")
        })
        .unwrap_or(false)
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
    new_command("git")
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
        let mapped = if ch.is_ascii_alphanumeric() || matches!(ch, '_' | '.' | '-') {
            ch
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

#[cfg(test)]
mod tests {
    use super::{
        default_pending_worktree_name, parse_ahead_behind_counts, parse_git_status_porcelain_z,
        sanitize_pending_worktree_name, HostGitChangedFile,
    };
    use std::time::UNIX_EPOCH;

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
}
