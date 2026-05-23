use crate::errors::{AppError, AppResult};
use crate::inference::http::streaming_client;
use reqwest::{Client, StatusCode};

/// Validate `namespace/repo-name`. Names allow ASCII alphanumeric plus
/// `_`, `-`, `.`. Empty parts or extra slashes reject.
pub fn validate_repo(repo: &str) -> AppResult<()> {
    let parts: Vec<&str> = repo.split('/').collect();
    if parts.len() != 2 || parts[0].is_empty() || parts[1].is_empty() {
        return Err(AppError::Validation(format!("invalid repo (need namespace/name): {repo}")));
    }
    let ok = |s: &str| s.chars().all(|c| c.is_ascii_alphanumeric() || matches!(c, '_' | '-' | '.'));
    if !ok(parts[0]) || !ok(parts[1]) {
        return Err(AppError::Validation(format!("invalid repo chars: {repo}")));
    }
    Ok(())
}

pub fn build_url(endpoint: &str, repo: &str, filename: &str) -> String {
    format!("{endpoint}/{repo}/resolve/main/{filename}")
}

/// Map HTTP status to a typed `AppError`. Returns `None` for 2xx (caller
/// proceeds). 4xx auth → `AuthRequired`; 404 → `NotFound`; 429 + other
/// non-success → `Inference` with the status in the message.
pub fn map_status(s: StatusCode, repo: &str) -> Option<AppError> {
    match s.as_u16() {
        200..=299 => None,
        404 => Some(AppError::NotFound(format!("{repo}: not found on HF"))),
        401 | 403 => Some(AppError::AuthRequired(format!("{repo}: HF auth required"))),
        429 => Some(AppError::Inference(format!("{repo}: HF rate limited (HTTP 429)"))),
        _ => Some(AppError::Inference(format!("{repo}: HF HTTP {s}"))),
    }
}

pub fn build_client() -> AppResult<Client> {
    streaming_client()
}
