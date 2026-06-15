use serde::{Deserialize, Serialize};
use serde_json::{json, Value};
use std::env;
use std::fs;
use std::path::Path;

use crate::{default_codex_cli_home, openai_bundled_marketplace_path};

const OPENAI_BUNDLED_BROWSER_PLUGIN_ID: &str = "browser@openai-bundled";

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct LocalModelCatalogConfig {
    pub model: String,
    pub models: Option<Vec<String>>,
    pub display_name: Option<String>,
    pub description: Option<String>,
    pub context_window: Option<u64>,
    pub auto_compact_token_limit: Option<u64>,
    pub input_modalities: Option<Vec<String>>,
}

const FORGE_PERSONALITY_PLACEHOLDER: &str = "{{ personality }}";
const FORGE_MODEL_INSTRUCTIONS_HEADER: &str = include_str!("../assets/instructions/header.md");
const FORGE_BASE_INSTRUCTIONS: &str = include_str!("../assets/instructions/base.md");
const FORGE_PERSONALITY_DEFAULT: &str = "";
const FORGE_PERSONALITY_FRIENDLY: &str =
    include_str!("../assets/instructions/personality-friendly.md");
const FORGE_PERSONALITY_PRAGMATIC: &str =
    include_str!("../assets/instructions/personality-pragmatic.md");

pub(crate) fn ensure_default_forge_profile(codex_home: &Path) -> Result<(), std::io::Error> {
    ensure_default_forge_profile_with_codex_cli_home(codex_home, &default_codex_cli_home())
}

fn ensure_default_forge_profile_with_codex_cli_home(
    codex_home: &Path,
    codex_cli_home: &Path,
) -> Result<(), std::io::Error> {
    let models_path = codex_home.join("models.json");
    if !models_path.exists() {
        fs::write(&models_path, default_model_catalog_json())?;
    } else {
        ensure_local_model_catalog_messages(&models_path)?;
    }

    let config_path = codex_home.join("config.toml");
    if !config_path.exists() {
        let mut config = default_config_toml(&models_path);
        ensure_bundled_capability_plugin_config(&mut config, codex_cli_home);
        fs::write(&config_path, config)?;
        return Ok(());
    }

    let config = fs::read_to_string(&config_path)?;
    let top_level = missing_top_level_model_config(&config, &models_path);
    let mut next_config = if top_level.is_empty() {
        config.clone()
    } else {
        insert_top_level_toml(&config, &top_level)
    };
    if !has_toml_table(&next_config, "model_providers.openai_http") {
        if !next_config.ends_with('\n') {
            next_config.push('\n');
        }
        next_config.push('\n');
        next_config.push_str(default_openai_http_provider_toml());
    } else {
        next_config =
            remove_toml_table_key(&next_config, "model_providers.openai_http", "base_url");
    }
    ensure_bundled_capability_plugin_config(&mut next_config, codex_cli_home);
    if next_config == config {
        return Ok(());
    }

    fs::write(&config_path, next_config)?;
    Ok(())
}

fn ensure_bundled_capability_plugin_config(config: &mut String, codex_cli_home: &Path) {
    let Some(marketplace_path) = openai_bundled_marketplace_path(codex_cli_home) else {
        return;
    };
    let mut additions = Vec::new();
    if !has_toml_table(config, "marketplaces.openai-bundled") {
        additions.push(format!(
            r#"[marketplaces.openai-bundled]
source_type = "local"
source = {}
"#,
            toml_string(&marketplace_path.to_string_lossy()),
        ));
    }
    if !has_toml_table(config, r#"plugins."browser@openai-bundled""#) {
        additions.push(format!(
            r#"[plugins."{OPENAI_BUNDLED_BROWSER_PLUGIN_ID}"]
enabled = true
"#,
        ));
    }
    if additions.is_empty() {
        return;
    }
    append_toml_blocks(config, &additions.join("\n"));
}

fn ensure_local_model_catalog_messages(models_path: &Path) -> Result<(), std::io::Error> {
    let config = fs::read_to_string(models_path)?;
    let Ok(mut catalog) = serde_json::from_str::<Value>(&config) else {
        return Ok(());
    };
    let Some(models) = catalog.get_mut("models").and_then(Value::as_array_mut) else {
        return Ok(());
    };

    let mut changed = false;
    for model in models {
        if !matches!(model.get("slug"), Some(Value::String(_))) {
            continue;
        }
        if model.get("model_messages").is_none()
            || model.get("model_messages") == Some(&Value::Null)
        {
            model["model_messages"] = forge_model_messages_json();
            changed = true;
        }
        if matches!(
            model.get("base_instructions"),
            Some(Value::String(value)) if value == "You are Codex, a coding agent. Help the user work in the local workspace."
        ) {
            model["base_instructions"] = Value::String(FORGE_BASE_INSTRUCTIONS.to_string());
            changed = true;
        }
        if is_legacy_default_text_only_model(model) {
            model["input_modalities"] = json!(default_input_modalities_json());
            changed = true;
        }
    }

    if changed {
        fs::write(
            models_path,
            serde_json::to_string_pretty(&catalog)
                .expect("local model catalog should serialize after model message refresh"),
        )?;
    }
    Ok(())
}

fn missing_top_level_model_config(config: &str, models_path: &Path) -> String {
    let mut lines = Vec::new();
    if !has_top_level_toml_key(config, "instructions") {
        lines.push(format!(
            "instructions = {}",
            toml_multiline_literal(FORGE_BASE_INSTRUCTIONS)
        ));
    }
    if !has_top_level_toml_key(config, "personality") {
        lines.push("personality = \"pragmatic\"".to_string());
    }
    if !config.contains("model_catalog_json") {
        lines.push(format!(
            "model_catalog_json = {}",
            toml_string(&models_path.to_string_lossy())
        ));
    }
    if !config.contains("model_context_window") {
        lines.push("model_context_window = 262144".to_string());
    }
    if !config.contains("model_auto_compact_token_limit") {
        lines.push("model_auto_compact_token_limit = 235929".to_string());
    }
    if !config.contains("model_reasoning_summary") {
        lines.push("model_reasoning_summary = \"none\"".to_string());
    }
    if lines.is_empty() {
        String::new()
    } else {
        format!("{}\n", lines.join("\n"))
    }
}

fn has_top_level_toml_key(config: &str, key: &str) -> bool {
    for line in config.lines() {
        let trimmed = line.trim();
        if trimmed.starts_with('[') {
            return false;
        }
        if trimmed.is_empty() || trimmed.starts_with('#') {
            continue;
        }
        let Some((name, _value)) = trimmed.split_once('=') else {
            continue;
        };
        if name.trim() == key {
            return true;
        }
    }
    false
}

fn has_toml_table(config: &str, table: &str) -> bool {
    let expected = format!("[{table}]");
    config.lines().any(|line| line.trim() == expected)
}

fn remove_toml_table_key(config: &str, table: &str, key: &str) -> String {
    let expected_table = format!("[{table}]");
    let mut in_target_table = false;
    let mut lines = Vec::new();

    for line in config.lines() {
        let trimmed = line.trim();
        if trimmed.starts_with('[') && trimmed.ends_with(']') {
            in_target_table = trimmed == expected_table;
        }

        if in_target_table
            && !trimmed.starts_with('#')
            && trimmed
                .split_once('=')
                .is_some_and(|(name, _)| name.trim() == key)
        {
            continue;
        }

        lines.push(line);
    }

    let mut next = lines.join("\n");
    if config.ends_with('\n') {
        next.push('\n');
    }
    next
}

fn insert_top_level_toml(config: &str, addition: &str) -> String {
    if let Some(index) = config.find("\n[") {
        let (head, tail) = config.split_at(index + 1);
        return format!("{head}{addition}\n{tail}");
    }
    let separator = if config.ends_with('\n') { "" } else { "\n" };
    format!("{config}{separator}{addition}")
}

fn append_toml_blocks(config: &mut String, addition: &str) {
    if !config.ends_with('\n') {
        config.push('\n');
    }
    if !config.ends_with("\n\n") {
        config.push('\n');
    }
    config.push_str(addition.trim_end());
    config.push('\n');
}

fn default_openai_http_provider_toml() -> &'static str {
    r#"[model_providers.openai_http]
name = "OpenAI"
wire_api = "responses"
requires_openai_auth = true
supports_websockets = false
"#
}

fn default_config_toml(models_path: &Path) -> String {
    // FORGE_LOCAL_API_KEY wins; the legacy HICODEX_LOCAL_API_KEY spelling
    // stays as a fallback so pre-rebrand setups keep working.
    let api_key = env::var("FORGE_LOCAL_API_KEY")
        .or_else(|_| env::var("HICODEX_LOCAL_API_KEY"))
        .ok()
        .map(|value| value.trim().to_string())
        .filter(|value| !value.is_empty());
    default_config_toml_with_api_key(models_path, api_key.as_deref())
}

// The `hicodex_local` provider id below is a deliberate legacy value: it is
// persisted in existing users' codex-home config.toml (both as the
// `model_provider` selection and the `[model_providers.hicodex_local]` table)
// and referenced across the app. Rebranding the id would orphan those
// configs — keep the value, only display names carry the Forge brand.
fn default_config_toml_with_api_key(models_path: &Path, api_key: Option<&str>) -> String {
    let bearer_token_line = api_key
        .map(|value| format!("experimental_bearer_token = {}\n", toml_string(value)))
        .unwrap_or_default();
    format!(
        r#"model = "Qwen3.6-27B-mxfp4"
model_provider = "hicodex_local"
personality = "pragmatic"
instructions = {instructions}
model_catalog_json = {models_path}
model_context_window = 262144
model_auto_compact_token_limit = 235929
model_reasoning_summary = "none"

[model_providers.hicodex_local]
name = "Forge local gateway"
base_url = "http://127.0.0.1:8890/v1"
wire_api = "responses"
requires_openai_auth = false
supports_websockets = false
{bearer_token_line}
{openai_http_provider}"#,
        models_path = toml_string(&models_path.to_string_lossy()),
        instructions = toml_multiline_literal(FORGE_BASE_INSTRUCTIONS),
        bearer_token_line = bearer_token_line,
        openai_http_provider = default_openai_http_provider_toml(),
    )
}

fn default_model_catalog_json() -> String {
    model_catalog_json(&LocalModelCatalogConfig {
        model: "Qwen3.6-27B-mxfp4".to_string(),
        models: None,
        display_name: Some("Qwen3.6 27B MXFP4".to_string()),
        description: Some("Local OpenAI-compatible coding model via Forge gateway.".to_string()),
        context_window: Some(262144),
        auto_compact_token_limit: Some(235929),
        input_modalities: Some(default_input_modalities_json()),
    })
}

pub(crate) fn model_catalog_json(config: &LocalModelCatalogConfig) -> String {
    let model_slugs = configured_model_slugs(config);
    let context_window = config.context_window.unwrap_or(262144);
    let auto_compact_token_limit = config
        .auto_compact_token_limit
        .unwrap_or((context_window as f64 * 0.9) as u64);
    let description = config
        .description
        .as_deref()
        .filter(|value| !value.trim().is_empty())
        .unwrap_or("Local OpenAI-compatible coding model via Forge gateway.");
    let input_modalities = normalize_input_modalities(config.input_modalities.as_deref());
    let models = model_slugs
        .iter()
        .enumerate()
        .map(|(index, model)| {
            let display_name = if index == 0 {
                config
                    .display_name
                    .as_deref()
                    .filter(|value| !value.trim().is_empty())
                    .unwrap_or(model)
                    .to_string()
            } else {
                model_display_name(model)
            };
            json!({
                "slug": model,
                "display_name": display_name,
                "description": description,
                "default_reasoning_level": null,
                "supported_reasoning_levels": [],
                "shell_type": "shell_command",
                "visibility": "list",
                "supported_in_api": true,
                "priority": index,
                "additional_speed_tiers": [],
                "service_tiers": [],
                "availability_nux": null,
                "upgrade": null,
                "base_instructions": FORGE_BASE_INSTRUCTIONS,
                "model_messages": forge_model_messages_json(),
                "supports_reasoning_summaries": false,
                "default_reasoning_summary": "none",
                "support_verbosity": false,
                "default_verbosity": null,
                "apply_patch_tool_type": "freeform",
                "web_search_tool_type": "text",
                "truncation_policy": { "mode": "tokens", "limit": 10000 },
                "supports_parallel_tool_calls": true,
                "supports_image_detail_original": false,
                "context_window": context_window,
                "max_context_window": context_window,
                "auto_compact_token_limit": auto_compact_token_limit,
                "effective_context_window_percent": 95,
                "experimental_supported_tools": [],
                "input_modalities": input_modalities.clone(),
                "supports_search_tool": false
            })
        })
        .collect::<Vec<_>>();

    serde_json::to_string_pretty(&json!({
        "models": models
    }))
    .expect("default model catalog should serialize")
}

fn configured_model_slugs(config: &LocalModelCatalogConfig) -> Vec<String> {
    let mut slugs = Vec::new();
    push_unique_model_slug(&mut slugs, &config.model);
    if let Some(models) = config.models.as_deref() {
        for model in models {
            push_unique_model_slug(&mut slugs, model);
        }
    }
    if slugs.is_empty() {
        slugs.push("Qwen3.6-27B-mxfp4".to_string());
    }
    slugs
}

fn push_unique_model_slug(slugs: &mut Vec<String>, model: &str) {
    let trimmed = model.trim();
    if trimmed.is_empty() || slugs.iter().any(|value| value == trimmed) {
        return;
    }
    slugs.push(trimmed.to_string());
}

fn model_display_name(model: &str) -> String {
    if model
        .get(0..4)
        .is_some_and(|prefix| prefix.eq_ignore_ascii_case("gpt-"))
    {
        return format!("GPT{}", &model[3..]);
    }
    model.to_string()
}

fn default_input_modalities_json() -> Vec<String> {
    vec!["text".to_string(), "image".to_string()]
}

fn normalize_input_modalities(input_modalities: Option<&[String]>) -> Vec<String> {
    let mut normalized = Vec::new();
    let default_modalities;
    let modalities = match input_modalities {
        Some(input_modalities) => input_modalities,
        None => {
            default_modalities = default_input_modalities_json();
            &default_modalities
        }
    };
    for modality in modalities {
        match modality.as_str() {
            "text" if !normalized.iter().any(|value| value == "text") => {
                normalized.push("text".to_string());
            }
            "image" if !normalized.iter().any(|value| value == "image") => {
                normalized.push("image".to_string());
            }
            _ => {}
        }
    }
    if !normalized.iter().any(|value| value == "text") {
        normalized.insert(0, "text".to_string());
    }
    normalized
}

fn is_legacy_default_text_only_model(model: &Value) -> bool {
    if model.get("slug").and_then(Value::as_str) != Some("Qwen3.6-27B-mxfp4") {
        return false;
    }
    // The description discriminates the app-generated default ("…via <brand>
    // gateway.") from a user-customized entry (the UI writes "…via <baseUrl>.").
    // Without this guard, a user who deliberately turns image input OFF has it
    // forced back on at every launch. Accept both the legacy on-disk (HiCodex)
    // and current (Forge) spellings.
    match model.get("description").and_then(Value::as_str) {
        Some("Local OpenAI-compatible coding model via Forge gateway.")
        | Some("Local OpenAI-compatible coding model via HiCodex gateway.") => {}
        _ => return false,
    }
    let Some(input_modalities) = model.get("input_modalities").and_then(Value::as_array) else {
        return false;
    };
    input_modalities.len() == 1
        && input_modalities
            .first()
            .and_then(Value::as_str)
            .is_some_and(|value| value == "text")
}

fn forge_model_messages_json() -> Value {
    json!({
        "instructions_template": format!(
            "{}\n\n{}\n\n{}",
            FORGE_MODEL_INSTRUCTIONS_HEADER,
            FORGE_PERSONALITY_PLACEHOLDER,
            FORGE_BASE_INSTRUCTIONS,
        ),
        "instructions_variables": {
            "personality_default": FORGE_PERSONALITY_DEFAULT,
            "personality_friendly": FORGE_PERSONALITY_FRIENDLY,
            "personality_pragmatic": FORGE_PERSONALITY_PRAGMATIC,
        }
    })
}

fn toml_string(value: &str) -> String {
    format!("\"{}\"", value.replace('\\', "\\\\").replace('"', "\\\""))
}

fn toml_multiline_literal(value: &str) -> String {
    format!("'''\n{}\n'''", value.replace("'''", ""))
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::test_support::{create_fake_openai_bundled_marketplace, unique_test_dir};

    #[test]
    fn writes_multiple_configured_models_to_catalog() {
        let catalog = model_catalog_json(&LocalModelCatalogConfig {
            model: " gpt-5.5 ".to_string(),
            models: Some(vec![
                "gpt-5.4".to_string(),
                "gpt-5.5".to_string(),
                "   ".to_string(),
            ]),
            display_name: Some("GPT-5.5".to_string()),
            description: Some("API models".to_string()),
            context_window: Some(100_000),
            auto_compact_token_limit: Some(90_000),
            input_modalities: Some(vec!["text".to_string()]),
        });
        let value: Value = serde_json::from_str(&catalog).unwrap();
        let models = value["models"].as_array().unwrap();

        assert_eq!(models.len(), 2);
        assert_eq!(models[0]["slug"].as_str(), Some("gpt-5.5"));
        assert_eq!(models[0]["display_name"].as_str(), Some("GPT-5.5"));
        assert_eq!(models[1]["slug"].as_str(), Some("gpt-5.4"));
        assert_eq!(models[1]["display_name"].as_str(), Some("GPT-5.4"));
        assert_eq!(models[1]["priority"].as_u64(), Some(1));
    }

    #[test]
    fn bootstraps_model_catalog_config() {
        let dir = env::temp_dir().join(format!("forge-host-test-{}", std::process::id()));
        let _ = fs::remove_dir_all(&dir);
        fs::create_dir_all(&dir).unwrap();

        ensure_default_forge_profile(&dir).unwrap();

        let config = fs::read_to_string(dir.join("config.toml")).unwrap();
        assert!(config.contains("model_catalog_json"));
        assert!(config.contains("Qwen3.6-27B-mxfp4"));
        assert!(config.contains("personality = \"pragmatic\""));
        assert!(config.contains("[model_providers.openai_http]"));
        assert!(config.contains("supports_websockets = false"));
        assert!(config.contains("requires_openai_auth = true"));
        let openai_http_block = config
            .split("[model_providers.openai_http]")
            .nth(1)
            .unwrap()
            .split("\n[")
            .next()
            .unwrap();
        assert!(!openai_http_block.contains("base_url"));
        assert!(config.contains(FORGE_BASE_INSTRUCTIONS));
        let catalog = fs::read_to_string(dir.join("models.json")).unwrap();
        assert!(catalog.contains("\"model_messages\""));
        assert!(catalog.contains(FORGE_PERSONALITY_PLACEHOLDER));
        assert!(catalog.contains("\"image\""));

        let _ = fs::remove_dir_all(&dir);
    }

    #[test]
    fn bootstraps_bundled_browser_marketplace_when_available() {
        let dir = unique_test_dir("forge-host-bundled-marketplace-test");
        let cli_home = unique_test_dir("forge-host-cli-home-test");
        let marketplace = create_fake_openai_bundled_marketplace(&cli_home);
        let _ = fs::remove_dir_all(&dir);
        fs::create_dir_all(&dir).unwrap();

        ensure_default_forge_profile_with_codex_cli_home(&dir, &cli_home).unwrap();

        let config = fs::read_to_string(dir.join("config.toml")).unwrap();
        assert!(config.contains("[marketplaces.openai-bundled]"));
        assert!(config.contains(&format!(
            "source = {}",
            toml_string(&marketplace.to_string_lossy())
        )));
        assert!(config.contains("[plugins.\"browser@openai-bundled\"]"));
        assert!(config.contains("enabled = true"));
        assert!(!config.contains("[plugins.\"computer-use@openai-bundled\"]"));

        let _ = fs::remove_dir_all(&dir);
        let _ = fs::remove_dir_all(&cli_home);
    }

    #[test]
    fn refreshes_existing_config_with_bundled_marketplace_without_overwriting_browser_plugin() {
        let dir = unique_test_dir("forge-host-bundled-marketplace-refresh-test");
        let cli_home = unique_test_dir("forge-host-cli-home-refresh-test");
        let marketplace = create_fake_openai_bundled_marketplace(&cli_home);
        let _ = fs::remove_dir_all(&dir);
        fs::create_dir_all(&dir).unwrap();
        fs::write(
            dir.join("config.toml"),
            r#"model = "gpt-5.5"
model_provider = "hicodex_local"

[plugins."browser@openai-bundled"]
enabled = false
"#,
        )
        .unwrap();

        ensure_default_forge_profile_with_codex_cli_home(&dir, &cli_home).unwrap();

        let config = fs::read_to_string(dir.join("config.toml")).unwrap();
        assert!(config.contains("[marketplaces.openai-bundled]"));
        assert!(config.contains(&format!(
            "source = {}",
            toml_string(&marketplace.to_string_lossy())
        )));
        assert_eq!(
            config
                .matches("[plugins.\"browser@openai-bundled\"]")
                .count(),
            1
        );
        let browser_block = config
            .split("[plugins.\"browser@openai-bundled\"]")
            .nth(1)
            .unwrap()
            .split("\n[")
            .next()
            .unwrap();
        assert!(browser_block.contains("enabled = false"));
        assert!(!browser_block.contains("enabled = true"));

        let _ = fs::remove_dir_all(&dir);
        let _ = fs::remove_dir_all(&cli_home);
    }

    #[test]
    fn skips_bundled_marketplace_config_when_manifest_is_absent() {
        let dir = unique_test_dir("forge-host-bundled-marketplace-absent-test");
        let cli_home = unique_test_dir("forge-host-cli-home-absent-test");
        let _ = fs::remove_dir_all(&dir);
        let _ = fs::remove_dir_all(&cli_home);
        fs::create_dir_all(&dir).unwrap();
        fs::create_dir_all(&cli_home).unwrap();

        ensure_default_forge_profile_with_codex_cli_home(&dir, &cli_home).unwrap();

        let config = fs::read_to_string(dir.join("config.toml")).unwrap();
        assert!(!config.contains("[marketplaces.openai-bundled]"));
        assert!(!config.contains("[plugins.\"browser@openai-bundled\"]"));
        assert!(!config.contains("[plugins.\"computer-use@openai-bundled\"]"));

        let _ = fs::remove_dir_all(&dir);
        let _ = fs::remove_dir_all(&cli_home);
    }

    #[test]
    fn default_config_does_not_bake_personal_bearer_token() {
        let models_path = Path::new("/tmp/forge-models.json");
        let config = default_config_toml_with_api_key(models_path, None);

        assert!(!config.contains("haichao"));
        assert!(!config.contains("experimental_bearer_token"));
    }

    #[test]
    fn default_config_uses_explicit_local_api_key_when_configured() {
        let models_path = Path::new("/tmp/forge-models.json");
        let config = default_config_toml_with_api_key(models_path, Some("local-dev-token"));

        assert!(config.contains("experimental_bearer_token = \"local-dev-token\""));
    }

    #[test]
    fn refreshes_existing_config_with_openai_http_provider() {
        let dir = env::temp_dir().join(format!(
            "forge-host-openai-http-test-{}",
            std::process::id()
        ));
        let _ = fs::remove_dir_all(&dir);
        fs::create_dir_all(&dir).unwrap();
        fs::write(
            dir.join("config.toml"),
            r#"model = "gpt-5.5"
model_provider = "hicodex_local"

[model_providers.hicodex_local]
name = "Forge local gateway"
base_url = "http://127.0.0.1:8890/v1"
wire_api = "responses"
requires_openai_auth = false
supports_websockets = false
"#,
        )
        .unwrap();

        ensure_default_forge_profile(&dir).unwrap();

        let config = fs::read_to_string(dir.join("config.toml")).unwrap();
        assert_eq!(config.matches("[model_providers.openai_http]").count(), 1);
        assert!(config.contains("requires_openai_auth = true"));
        assert!(config.contains("supports_websockets = false"));
        let openai_http_block = config
            .split("[model_providers.openai_http]")
            .nth(1)
            .unwrap()
            .split("\n[")
            .next()
            .unwrap();
        assert!(!openai_http_block.contains("base_url"));

        let _ = fs::remove_dir_all(&dir);
    }

    #[test]
    fn refreshes_existing_openai_http_provider_to_chatgpt_backend_default() {
        let dir = env::temp_dir().join(format!(
            "forge-host-openai-http-repair-test-{}",
            std::process::id()
        ));
        let _ = fs::remove_dir_all(&dir);
        fs::create_dir_all(&dir).unwrap();
        fs::write(
            dir.join("config.toml"),
            r#"model = "gpt-5.5"
model_provider = "openai_http"

[model_providers.openai_http]
name = "OpenAI"
base_url = "https://api.openai.com/v1"
wire_api = "responses"
requires_openai_auth = true
supports_websockets = false

[model_providers.hicodex_local]
name = "Forge local gateway"
base_url = "http://127.0.0.1:8890/v1"
wire_api = "responses"
requires_openai_auth = false
supports_websockets = false
"#,
        )
        .unwrap();

        ensure_default_forge_profile(&dir).unwrap();

        let config = fs::read_to_string(dir.join("config.toml")).unwrap();
        let openai_http_block = config
            .split("[model_providers.openai_http]")
            .nth(1)
            .unwrap()
            .split("\n[")
            .next()
            .unwrap();
        assert!(!openai_http_block.contains("base_url"));
        assert!(config.contains("base_url = \"http://127.0.0.1:8890/v1\""));

        let _ = fs::remove_dir_all(&dir);
    }

    #[test]
    fn refreshes_legacy_model_catalog_messages() {
        let dir = env::temp_dir().join(format!("forge-host-refresh-test-{}", std::process::id()));
        let _ = fs::remove_dir_all(&dir);
        fs::create_dir_all(&dir).unwrap();
        let models_path = dir.join("models.json");
        fs::write(
            &models_path,
            r#"{"models":[{"slug":"Qwen3.6-27B-mxfp4","display_name":"Qwen","description":"Local OpenAI-compatible coding model via Forge gateway.","base_instructions":"You are Codex, a coding agent. Help the user work in the local workspace.","input_modalities":["text"]}]}"#,
        )
        .unwrap();
        fs::write(dir.join("config.toml"), default_config_toml(&models_path)).unwrap();

        ensure_default_forge_profile(&dir).unwrap();

        let config = fs::read_to_string(dir.join("config.toml")).unwrap();
        assert_eq!(config.matches("instructions =").count(), 1);
        let catalog = fs::read_to_string(models_path).unwrap();
        let value: Value = serde_json::from_str(&catalog).unwrap();
        let model = &value["models"][0];
        assert!(model.get("model_messages").is_some());
        assert_eq!(
            model["base_instructions"].as_str(),
            Some(FORGE_BASE_INSTRUCTIONS)
        );
        assert_eq!(model["input_modalities"][0].as_str(), Some("text"));
        assert_eq!(model["input_modalities"][1].as_str(), Some("image"));

        let _ = fs::remove_dir_all(&dir);
    }

    #[test]
    fn keeps_user_customized_text_only_model_text_only() {
        // A user who turns off image input writes a catalog entry whose
        // description is "…via <baseUrl>." (not the "…via Forge/HiCodex
        // gateway." app default). It must NOT be force-refreshed back to
        // text+image.
        let dir = env::temp_dir().join(format!("forge-host-user-textonly-{}", std::process::id()));
        let _ = fs::remove_dir_all(&dir);
        fs::create_dir_all(&dir).unwrap();
        let models_path = dir.join("models.json");
        fs::write(
            &models_path,
            r#"{"models":[{"slug":"Qwen3.6-27B-mxfp4","display_name":"Qwen","description":"Local OpenAI-compatible coding model via http://127.0.0.1:8890/v1.","base_instructions":"You are Codex, a coding agent. Help the user work in the local workspace.","input_modalities":["text"]}]}"#,
        )
        .unwrap();
        fs::write(dir.join("config.toml"), default_config_toml(&models_path)).unwrap();

        ensure_default_forge_profile(&dir).unwrap();

        let value: Value = serde_json::from_str(&fs::read_to_string(models_path).unwrap()).unwrap();
        let modalities = value["models"][0]["input_modalities"].as_array().unwrap();
        assert_eq!(modalities.len(), 1, "user's text-only choice must survive");
        assert_eq!(modalities[0].as_str(), Some("text"));

        let _ = fs::remove_dir_all(&dir);
    }
}
