use crate::errors::{AppError, AppResult};
use reqwest::Client;
use serde::Deserialize;

const DEFAULT_OLLAMA: &str = "http://localhost:11434";

#[derive(Deserialize)]
struct TagsResponse {
    models: Vec<ModelEntry>,
}

#[derive(Deserialize)]
struct ModelEntry {
    name: String,
}

pub async fn fetch_models(endpoint: &str) -> AppResult<Vec<String>> {
    let client = Client::new();
    let resp = client
        .get(format!("{endpoint}/api/tags"))
        .send()
        .await
        .map_err(|e| AppError::Inference(e.to_string()))?;
    if !resp.status().is_success() {
        return Err(AppError::Inference(format!("HTTP {}", resp.status())));
    }
    let body: TagsResponse = resp
        .json()
        .await
        .map_err(|e| AppError::Inference(format!("bad body: {e}")))?;

    let mut names: Vec<String> = body.models.into_iter().map(|m| m.name).collect();
    names.sort();
    names.dedup();
    Ok(names)
}

#[tauri::command]
pub async fn list_models() -> Result<Vec<String>, AppError> {
    fetch_models(DEFAULT_OLLAMA).await
}
