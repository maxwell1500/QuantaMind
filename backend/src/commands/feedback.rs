#![deny(clippy::unwrap_used)]

use crate::errors::AppError;
use crate::inference::http::probe_client;
use serde::Serialize;

const WEB3FORMS_URL: &str = "https://api.web3forms.com/submit";
const SUBJECT: &str = "QuantaMind Feedback";
const FROM_NAME: &str = "QuantaMind App";
const FALLBACK_REPLY: &str = "no-reply@quantamind.co";
pub const MIN_MESSAGE_LEN: usize = 10;
pub const MAX_MESSAGE_LEN: usize = 5000;
const KEY: Option<&str> = option_env!("WEB3FORMS_ACCESS_KEY");

#[derive(Serialize)]
struct Web3FormsPayload<'a> {
    access_key: &'a str,
    subject: &'a str,
    from_name: &'a str,
    message: &'a str,
    reply_to: &'a str,
    #[serde(skip_serializing_if = "str::is_empty")]
    diagnostics: &'a str,
}

pub(crate) fn looks_like_email(s: &str) -> bool {
    let mut parts = s.split('@');
    let (local, domain) = match (parts.next(), parts.next(), parts.next()) {
        (Some(l), Some(d), None) => (l, d),
        _ => return false,
    };
    !local.is_empty()
        && !domain.is_empty()
        && !s.chars().any(char::is_whitespace)
        && domain.contains('.')
        && !domain.starts_with('.')
        && !domain.ends_with('.')
}

pub(crate) fn build_diagnostics(current_model: Option<&str>) -> String {
    let mut parts = vec![
        format!("app: QuantaMind v{}", env!("CARGO_PKG_VERSION")),
        format!("os: {} ({})", std::env::consts::OS, std::env::consts::ARCH),
    ];
    if let Some(m) = current_model {
        parts.push(format!("model: {m}"));
    }
    parts.join("\n")
}

#[tauri::command]
pub async fn submit_feedback(
    message: String,
    user_email: Option<String>,
    include_diagnostics: bool,
    current_model: Option<String>,
) -> Result<(), AppError> {
    let trimmed = message.trim();
    if trimmed.len() < MIN_MESSAGE_LEN || trimmed.len() > MAX_MESSAGE_LEN {
        return Err(AppError::Validation(format!(
            "message must be {MIN_MESSAGE_LEN}-{MAX_MESSAGE_LEN} chars after trim, got {}",
            trimmed.len()
        )));
    }
    let email = user_email.as_deref().map(str::trim).filter(|s| !s.is_empty());
    if let Some(e) = email {
        if !looks_like_email(e) {
            return Err(AppError::Validation("email format is not valid".into()));
        }
    }
    let key = KEY.ok_or_else(|| AppError::Internal(
        "feedback is disabled in this build (WEB3FORMS_ACCESS_KEY was not set at compile time)".into(),
    ))?;
    let diagnostics = if include_diagnostics {
        build_diagnostics(current_model.as_deref())
    } else { String::new() };
    let payload = Web3FormsPayload {
        access_key: key,
        subject: SUBJECT, from_name: FROM_NAME, message: trimmed,
        reply_to: email.unwrap_or(FALLBACK_REPLY),
        diagnostics: &diagnostics,
    };
    let resp = probe_client()?.post(WEB3FORMS_URL).json(&payload).send().await
        .map_err(|e| AppError::Inference(e.to_string()))?;
    if !resp.status().is_success() {
        let status = resp.status();
        let body = resp.text().await.unwrap_or_default();
        return Err(AppError::Inference(format!("Web3Forms HTTP {status}: {body}")));
    }
    Ok(())
}

#[cfg(test)]
#[path = "feedback_tests.rs"]
mod tests;
