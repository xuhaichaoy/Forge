use base64::engine::general_purpose::URL_SAFE_NO_PAD;
use base64::Engine;
use serde::{Deserialize, Serialize};
use serde_json::Value;
use std::fs;

use crate::{resolve_codex_home, string_value, HostError};

#[derive(Debug, Clone, Serialize, Deserialize, Default)]
#[serde(rename_all = "camelCase")]
pub struct CodexAuthSummary {
    pub has_auth_file: bool,
    pub auth_mode: Option<String>,
    pub has_api_key: bool,
    pub has_tokens: bool,
    pub email: Option<String>,
    pub plan_type: Option<String>,
}

pub(crate) fn read_codex_auth_summary(
    codex_home: Option<&str>,
) -> Result<CodexAuthSummary, HostError> {
    let auth_path = resolve_codex_home(codex_home).join("auth.json");
    if !auth_path.exists() {
        return Ok(CodexAuthSummary::default());
    }
    let contents =
        fs::read_to_string(&auth_path).map_err(|error| HostError::Profile(error.to_string()))?;
    let value: Value = serde_json::from_str(&contents)
        .map_err(|error| HostError::Profile(format!("failed to parse auth.json: {error}")))?;
    Ok(summarize_codex_auth_value(&value))
}

fn summarize_codex_auth_value(value: &Value) -> CodexAuthSummary {
    let token_claims = auth_jwt_claims(
        value
            .get("tokens")
            .and_then(|tokens| tokens.get("id_token")),
    );
    let agent_claims = auth_jwt_claims(value.get("agent_identity"));
    let email = token_claims
        .as_ref()
        .and_then(|claims| claims.email.clone())
        .or_else(|| {
            agent_claims
                .as_ref()
                .and_then(|claims| claims.email.clone())
        });
    let plan_type = token_claims
        .as_ref()
        .and_then(|claims| claims.plan_type.clone())
        .or_else(|| {
            agent_claims
                .as_ref()
                .and_then(|claims| claims.plan_type.clone())
        });
    CodexAuthSummary {
        has_auth_file: true,
        auth_mode: string_value(value.get("auth_mode"))
            .or_else(|| string_value(value.get("authMode")))
            .or_else(|| string_value(value.get("mode")))
            .or_else(|| string_value(value.get("type"))),
        has_api_key: auth_value_present(value.get("OPENAI_API_KEY"))
            || auth_value_present(value.get("openai_api_key"))
            || auth_value_present(value.get("api_key")),
        has_tokens: auth_value_present(value.get("tokens"))
            || auth_value_present(value.get("OPENAI_CHATGPT_ACCOUNT"))
            || auth_value_present(value.get("refresh_token"))
            || auth_value_present(value.get("chatgpt_token"))
            || auth_value_present(value.get("agent_identity")),
        email,
        plan_type,
    }
}

#[derive(Debug, Clone)]
struct AuthJwtClaims {
    email: Option<String>,
    plan_type: Option<String>,
}

fn auth_jwt_claims(value: Option<&Value>) -> Option<AuthJwtClaims> {
    let jwt = value.and_then(Value::as_str)?.trim();
    if jwt.is_empty() {
        return None;
    }
    let payload = decode_jwt_payload(jwt)?;
    let email = string_value(payload.get("email")).or_else(|| {
        payload
            .get("https://api.openai.com/profile")
            .and_then(|profile| string_value(profile.get("email")))
    });
    let plan_type = payload
        .get("https://api.openai.com/auth")
        .and_then(|auth| string_value(auth.get("chatgpt_plan_type")))
        .or_else(|| string_value(payload.get("plan_type")));
    Some(AuthJwtClaims { email, plan_type })
}

fn decode_jwt_payload(jwt: &str) -> Option<Value> {
    let payload = jwt.split('.').nth(1)?;
    let bytes = URL_SAFE_NO_PAD.decode(payload).ok()?;
    serde_json::from_slice(&bytes).ok()
}

fn auth_value_present(value: Option<&Value>) -> bool {
    match value {
        Some(Value::String(value)) => !value.trim().is_empty(),
        Some(Value::Array(value)) => !value.is_empty(),
        Some(Value::Object(value)) => !value.is_empty(),
        Some(Value::Bool(value)) => *value,
        Some(Value::Number(_)) => true,
        _ => false,
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::env;

    #[test]
    fn summarizes_chatgpt_auth_without_exposing_tokens() {
        let value: Value = serde_json::json!({
            "auth_mode": "chatgpt",
            "tokens": {
                "access_token": "secret",
                "refresh_token": "secret-refresh"
            },
            "OPENAI_API_KEY": null
        });

        let summary = summarize_codex_auth_value(&value);

        assert!(summary.has_auth_file);
        assert_eq!(summary.auth_mode.as_deref(), Some("chatgpt"));
        assert!(summary.has_tokens);
        assert!(!summary.has_api_key);
    }

    #[test]
    fn summarizes_chatgpt_auth_identity_claims() {
        let id_token = fake_jwt(serde_json::json!({
            "email": "user@example.com",
            "https://api.openai.com/auth": {
                "chatgpt_plan_type": "pro"
            }
        }));
        let value: Value = serde_json::json!({
            "auth_mode": "chatgpt",
            "tokens": {
                "id_token": id_token,
                "access_token": "secret",
                "refresh_token": "secret-refresh"
            }
        });

        let summary = summarize_codex_auth_value(&value);

        assert_eq!(summary.email.as_deref(), Some("user@example.com"));
        assert_eq!(summary.plan_type.as_deref(), Some("pro"));
    }

    fn fake_jwt(payload: Value) -> String {
        let header = URL_SAFE_NO_PAD.encode(br#"{"alg":"none","typ":"JWT"}"#);
        let payload = URL_SAFE_NO_PAD.encode(serde_json::to_vec(&payload).unwrap());
        let signature = URL_SAFE_NO_PAD.encode(b"sig");
        format!("{header}.{payload}.{signature}")
    }

    #[test]
    fn reads_missing_codex_auth_as_unsigned() {
        let dir = env::temp_dir().join(format!(
            "forge-host-auth-summary-test-{}",
            std::process::id()
        ));
        let _ = fs::remove_dir_all(&dir);
        fs::create_dir_all(&dir).unwrap();

        let summary = read_codex_auth_summary(Some(dir.to_string_lossy().as_ref())).unwrap();

        assert!(!summary.has_auth_file);
        assert!(summary.auth_mode.is_none());
        assert!(!summary.has_tokens);
        assert!(!summary.has_api_key);

        let _ = fs::remove_dir_all(&dir);
    }
}
