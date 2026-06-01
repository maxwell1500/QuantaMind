use crate::commands::storage::storage_types::InstalledModelInfo;
use crate::errors::AppError;
use crate::inference::backend::backend_kind::BackendKind;
use crate::inference::mlx::server::mlx_endpoint::mlx_endpoint;
use reqwest::Client;
use serde::Deserialize;
use std::time::Duration;

const PROBE_TIMEOUT: Duration = Duration::from_millis(2500);

fn mlx_supported() -> bool {
    cfg!(all(target_os = "macos", target_arch = "aarch64"))
}

#[derive(Deserialize)]
struct ModelsResponse {
    #[serde(default)]
    data: Vec<ModelEntry>,
}

#[derive(Deserialize)]
struct ModelEntry {
    id: String,
}

/// mlx_lm.server reports no size/quantization via `/v1/models`, so those stay
/// blank ("not available") rather than fabricated. The model is server-loaded,
/// not a local file, so `path` is `None`.
fn to_info(id: String) -> InstalledModelInfo {
    InstalledModelInfo {
        name: id,
        size_bytes: 0,
        modified_at: String::new(),
        family: "MLX".into(),
        parameter_size: String::new(),
        quantization: String::new(),
        backend: BackendKind::Mlx,
        path: None,
    }
}

/// Fetch the model(s) a running `mlx_lm.server` has loaded, via OpenAI's
/// `GET /v1/models`. Off Apple Silicon, or when the server isn't running, MLX
/// contributes no models (empty list, not an error) — the backend rail's health
/// hint tells the user to start it.
pub async fn fetch_mlx_models(endpoint: &str) -> Result<Vec<InstalledModelInfo>, AppError> {
    if !mlx_supported() {
        return Ok(Vec::new());
    }
    let client = Client::builder()
        .timeout(PROBE_TIMEOUT)
        .build()
        .map_err(|e| AppError::Internal(e.to_string()))?;
    let resp = match client.get(format!("{endpoint}/v1/models")).send().await {
        Ok(r) if r.status().is_success() => r,
        _ => return Ok(Vec::new()),
    };
    let parsed: ModelsResponse = resp.json().await.map_err(|e| AppError::Inference(e.to_string()))?;
    Ok(parsed.data.into_iter().map(|m| to_info(m.id)).collect())
}

#[tauri::command]
pub async fn list_mlx_models() -> Result<Vec<InstalledModelInfo>, AppError> {
    fetch_mlx_models(&mlx_endpoint()).await
}

#[cfg(test)]
#[path = "mlx_models_tests.rs"]
mod tests;
