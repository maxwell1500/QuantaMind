use crate::errors::{AppError, AppResult};
use reqwest::Client;
use serde::{Deserialize, Serialize};
use std::time::Duration;

const DEFAULT_OLLAMA: &str = "http://localhost:11434";
const DEFAULT_TIMEOUT: Duration = Duration::from_secs(5);

/// One currently-loaded Ollama model from `/api/ps`. `size_vram` is the VRAM
/// portion of the `size` total footprint (the rest is offloaded to system RAM);
/// `/api/ps` omits it when 0 (100% CPU), so it defaults to 0. `context_length`
/// is a newer field — Ollama preallocates the full-context KV cache into VRAM.
#[derive(Serialize, Clone, Debug, PartialEq)]
pub struct LoadedModel {
    pub name: String,
    pub size_bytes: u64,
    pub size_vram_bytes: u64,
    pub context_length: Option<u32>,
}

#[derive(Deserialize)]
struct PsResponse {
    models: Vec<PsModel>,
}

#[derive(Deserialize)]
struct PsModel {
    name: String,
    #[serde(default)]
    size: u64,
    #[serde(default)]
    size_vram: u64,
    #[serde(default)]
    context_length: Option<u32>,
}

pub async fn fetch_loaded(endpoint: &str, timeout: Duration) -> AppResult<Vec<LoadedModel>> {
    let client = Client::builder()
        .timeout(timeout)
        .build()
        .map_err(|e| AppError::Internal(e.to_string()))?;
    // Degrade to empty (not an error) when Ollama is unreachable: the Inspector
    // then shows "not available" per row instead of failing the whole view.
    let Ok(resp) = client.get(format!("{endpoint}/api/ps")).send().await else {
        return Ok(vec![]);
    };
    if !resp.status().is_success() {
        return Ok(vec![]);
    }
    let body: PsResponse = resp
        .json()
        .await
        .map_err(|e| AppError::Inference(format!("ps body: {e}")))?;
    Ok(body
        .models
        .into_iter()
        .map(|m| LoadedModel {
            name: m.name,
            size_bytes: m.size,
            size_vram_bytes: m.size_vram,
            context_length: m.context_length,
        })
        .collect())
}

#[tauri::command]
pub async fn get_loaded_models() -> Result<Vec<LoadedModel>, AppError> {
    fetch_loaded(DEFAULT_OLLAMA, DEFAULT_TIMEOUT).await
}
