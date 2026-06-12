use serde::{Deserialize, Serialize};
use std::env;
use std::path::PathBuf;
use std::time::{SystemTime, UNIX_EPOCH};

use crate::civil_from_days;

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub(crate) struct CreateProjectlessThreadCwdRequest {
    directory_name: Option<String>,
    prompt: Option<String>,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub(crate) struct CreateProjectlessThreadCwdResponse {
    cwd: String,
    output_directory: String,
    workspace_root: String,
}

#[tauri::command]
pub(crate) fn host_create_projectless_thread_cwd(
    request: CreateProjectlessThreadCwdRequest,
) -> Result<CreateProjectlessThreadCwdResponse, String> {
    create_projectless_thread_cwd(request, SystemTime::now())
}

/// Mirror Codex Desktop's projectless working-directory generator (bundle `Iy`):
/// a thread with no workspace gets a unique `~/Documents/Codex/<YYYY-MM-DD>/<slug>/`
/// directory with `outputs/` and `work/` subdirectories, so file references resolve
/// against a real session cwd instead of $HOME (Codex never uses $HOME as cwd).
fn create_projectless_thread_cwd(
    request: CreateProjectlessThreadCwdRequest,
    now: SystemTime,
) -> Result<CreateProjectlessThreadCwdResponse, String> {
    let home = user_home_dir().ok_or_else(|| "HOME or USERPROFILE is not set".to_string())?;
    // codex `My`: ~/Documents/Codex is the projectless workspace root.
    let workspace_root = home.join("Documents").join("Codex");
    // codex `Fy`/`Ny`: a per-day subdirectory, YYYY-MM-DD.
    let seconds = now
        .duration_since(UNIX_EPOCH)
        .map(|duration| duration.as_secs() as i64)
        .unwrap_or(0);
    let (year, month, day) = civil_from_days(seconds.div_euclid(86_400));
    let date_dir = workspace_root.join(format!("{year:04}-{month:02}-{day:02}"));
    let slug = projectless_slug(request.directory_name.as_deref(), request.prompt.as_deref());
    std::fs::create_dir_all(&date_dir)
        .map_err(|err| format!("failed to create projectless date directory: {err}"))?;
    // codex `Iy`: first attempt is the bare slug, then `${slug}-${n+1}`, up to 100.
    for attempt in 0..100 {
        let name = if attempt == 0 {
            slug.clone()
        } else {
            format!("{slug}-{}", attempt + 1)
        };
        let cwd = date_dir.join(&name);
        if cwd.exists() {
            continue;
        }
        std::fs::create_dir(&cwd)
            .map_err(|err| format!("failed to create projectless thread directory: {err}"))?;
        // createSplitDirectories=true (codex default): deliverables in outputs/, scratch in work/.
        let output_directory = cwd.join("outputs");
        std::fs::create_dir_all(&output_directory)
            .map_err(|err| format!("failed to create outputs directory: {err}"))?;
        std::fs::create_dir_all(cwd.join("work"))
            .map_err(|err| format!("failed to create work directory: {err}"))?;
        return Ok(CreateProjectlessThreadCwdResponse {
            cwd: cwd.to_string_lossy().to_string(),
            output_directory: output_directory.to_string_lossy().to_string(),
            workspace_root: workspace_root.to_string_lossy().to_string(),
        });
    }
    Err("Unable to create a unique projectless thread directory".to_string())
}

fn user_home_dir() -> Option<PathBuf> {
    if let Some(home) = env::var_os("HOME")
        .map(PathBuf::from)
        .filter(|path| !path.as_os_str().is_empty())
    {
        return Some(home);
    }
    env::var_os("USERPROFILE")
        .map(PathBuf::from)
        .filter(|path| !path.as_os_str().is_empty())
}

/// codex `Py` (main-*.js): `(t??n)?.toLowerCase().match(/[a-z0-9]+/g)` then
/// `(t==null ? r.slice(0,6) : r).join('-').slice(0,80)`. So a directoryName keeps
/// ALL its lowercase-alphanumeric words, but when there is no directoryName the
/// prompt is truncated to its first 6 words. Empty result → "new-chat".
fn projectless_slug(directory_name: Option<&str>, prompt: Option<&str>) -> String {
    let (source, max_words) = match directory_name
        .map(str::trim)
        .filter(|value| !value.is_empty())
    {
        Some(name) => (name, None),
        None => (prompt.unwrap_or(""), Some(6usize)),
    };
    let mut words: Vec<String> = Vec::new();
    let mut current = String::new();
    for ch in source.chars() {
        if ch.is_ascii_alphanumeric() {
            current.push(ch.to_ascii_lowercase());
        } else if !current.is_empty() {
            words.push(std::mem::take(&mut current));
        }
    }
    if !current.is_empty() {
        words.push(current);
    }
    if let Some(max) = max_words {
        words.truncate(max);
    }
    let mut slug = words.join("-");
    if slug.len() > 80 {
        slug.truncate(80); // slug is ASCII (alnum + '-'), so a byte cut is a char boundary.
    }
    if slug.is_empty() {
        "new-chat".to_string()
    } else {
        slug
    }
}

#[cfg(test)]
mod tests {
    use super::projectless_slug;

    #[test]
    fn directory_name_keeps_all_words() {
        // codex Py: a directoryName (t != null) uses ALL its words — no 6-word cap.
        assert_eq!(
            projectless_slug(Some("My Big Report For The Q3 Board Meeting"), None),
            "my-big-report-for-the-q3-board-meeting",
        );
    }

    #[test]
    fn prompt_takes_first_six_words_and_splits_on_non_alnum() {
        // codex Py: with no directoryName (t == null) the prompt is truncated to
        // its first 6 words (r.slice(0,6)).
        assert_eq!(
            projectless_slug(None, Some("one two three four five six seven eight")),
            "one-two-three-four-five-six",
        );
        // Underscores / dots / CJK are not [a-z0-9] → word separators (matches codex Py).
        // Here only 5 ASCII words survive, so the 6-word cap is a no-op.
        assert_eq!(
            projectless_slug(None, Some("修改一下 util/config/archery_token.txt 内容")),
            "util-config-archery-token-txt",
        );
    }

    #[test]
    fn empty_or_symbol_only_falls_back_to_new_chat() {
        assert_eq!(projectless_slug(None, Some("！！！ 。。。")), "new-chat");
        assert_eq!(projectless_slug(None, None), "new-chat");
        assert_eq!(projectless_slug(Some("   "), Some("")), "new-chat");
    }
}
