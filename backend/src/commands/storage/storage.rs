use crate::commands::emit::log_emit;
use crate::commands::gguf::gguf_cmd::EVENT_MODELS_CHANGED;
use crate::commands::storage::storage_types::{InstalledModelInfo, TagsResponse};
use crate::errors::{AppError, AppResult};
use crate::inference::backend::backend_kind::BackendKind;
use crate::inference::backend::endpoint::ollama_endpoint;
use reqwest::Client;
use std::time::Duration;
use tauri::AppHandle;

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
            let d = m.details.unwrap_or_default();
            InstalledModelInfo {
                name: m.name,
                size_bytes: m.size,
                modified_at: m.modified_at,
                family: d.family,
                parameter_size: d.parameter_size,
                quantization: d.quantization_level,
                backend: BackendKind::Ollama,
                digest: m.digest,
                display_name: None,
                path: None,
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
    fetch_installed_with_stats(&ollama_endpoint()).await
}

#[tauri::command]
pub async fn remove_model(app: AppHandle, name: String) -> Result<(), AppError> {
    let r = remove_model_inner(&ollama_endpoint(), &name).await;
    if r.is_ok() {
        log_emit(&app, EVENT_MODELS_CHANGED, ());
    }
    r
}

