use crate::commands::gguf_cmd::EVENT_MODELS_CHANGED;
use crate::commands::storage_disk::{compute_disk_usage, models_dir};
use crate::commands::storage_types::{
    DiskUsage, InstalledModelInfo, ModelDetails, TagsResponse,
};
use crate::errors::{AppError, AppResult};
use reqwest::Client;
use std::time::Duration;
use tauri::{AppHandle, Emitter};

const DEFAULT_OLLAMA: &str = "http://localhost:11434";
const TIMEOUT: Duration = Duration::from_secs(5);

fn build_client() -> AppResult<Client> {
    Client::builder()
        .timeout(TIMEOUT)
        .build()
        .map_err(|e| AppError::Internal(e.to_string()))
}

pub async fn fetch_installed_with_stats(endpoint: &str) -> AppResult<Vec<InstalledModelInfo>> {
    let resp = build_client()?
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
    let mut out: Vec<InstalledModelInfo> = body
        .models
        .into_iter()
        .map(|m| {
            let d = m.details.unwrap_or(ModelDetails {
                family: String::new(),
                parameter_size: String::new(),
                quantization_level: String::new(),
            });
            InstalledModelInfo {
                name: m.name,
                size_bytes: m.size,
                modified_at: m.modified_at,
                family: d.family,
                parameter_size: d.parameter_size,
                quantization: d.quantization_level,
            }
        })
        .collect();
    out.sort_by_key(|m| std::cmp::Reverse(m.size_bytes));
    Ok(out)
}

pub async fn remove_model_inner(endpoint: &str, name: &str) -> AppResult<()> {
    if name.trim().is_empty() {
        return Err(AppError::Validation("name is empty".into()));
    }
    let resp = build_client()?
        .delete(format!("{endpoint}/api/delete"))
        .json(&serde_json::json!({ "name": name }))
        .send()
        .await
        .map_err(|e| AppError::Inference(e.to_string()))?;
    let status = resp.status();
    if status == reqwest::StatusCode::NOT_FOUND {
        return Err(AppError::NotFound(format!("model {name}")));
    }
    if !status.is_success() {
        return Err(AppError::Inference(format!("HTTP {status}")));
    }
    Ok(())
}

#[tauri::command]
pub async fn get_installed_models_with_stats() -> Result<Vec<InstalledModelInfo>, AppError> {
    fetch_installed_with_stats(DEFAULT_OLLAMA).await
}

#[tauri::command]
pub async fn remove_model(app: AppHandle, name: String) -> Result<(), AppError> {
    let r = remove_model_inner(DEFAULT_OLLAMA, &name).await;
    if r.is_ok() {
        let _ = app.emit(EVENT_MODELS_CHANGED, ());
    }
    r
}

#[tauri::command]
pub async fn get_disk_usage() -> Result<DiskUsage, AppError> {
    let models = fetch_installed_with_stats(DEFAULT_OLLAMA).await.unwrap_or_default();
    let sum: u64 = models.iter().map(|m| m.size_bytes).sum();
    Ok(compute_disk_usage(&models_dir(), sum))
}
