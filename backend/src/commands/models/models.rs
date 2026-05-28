use crate::errors::{AppError, AppResult};
use reqwest::Client;
use serde::Deserialize;
use std::time::Duration;

const DEFAULT_OLLAMA: &str = "http://localhost:11434";
const DEFAULT_TIMEOUT: Duration = Duration::from_secs(5);

#[derive(Deserialize)]
struct TagsResponse {
    models: Vec<ModelEntry>,
}

#[derive(Deserialize)]
struct ModelEntry {
    name: String,
}

fn map_request_err(e: reqwest::Error, op: &str) -> AppError {
    if e.is_timeout() {
        AppError::Timeout(format!("{op} timed out"))
    } else {
        AppError::Inference(e.to_string())
    }
}

pub async fn fetch_models_with_timeout(
    endpoint: &str,
    timeout: Duration,
) -> AppResult<Vec<String>> {
    let client = Client::builder()
        .timeout(timeout)
        .build()
        .map_err(|e| AppError::Internal(e.to_string()))?;
    let resp = client
        .get(format!("{endpoint}/api/tags"))
        .send()
        .await
        .map_err(|e| map_request_err(e, "list_models"))?;
    if !resp.status().is_success() {
        return Err(AppError::Inference(format!("HTTP {}", resp.status())));
    }
    let body: TagsResponse = resp
        .json()
        .await
        .map_err(|e| map_request_err(e, "list_models body"))?;

    let mut names: Vec<String> = body.models.into_iter().map(|m| m.name).collect();
    names.sort();
    names.dedup();
    Ok(names)
}

pub async fn fetch_models(endpoint: &str) -> AppResult<Vec<String>> {
    fetch_models_with_timeout(endpoint, DEFAULT_TIMEOUT).await
}

#[tauri::command]
pub async fn list_models() -> Result<Vec<String>, AppError> {
    fetch_models(DEFAULT_OLLAMA).await
}
