use crate::errors::{AppError, AppResult};
use reqwest::Client;
use serde::Deserialize;
use serde_json::{Map, Value};
use std::time::Duration;

const DEFAULT_TIMEOUT: Duration = Duration::from_secs(5);

/// The `details` block of `/api/show` — coarse model facts.
#[derive(Deserialize, Default, Clone, Debug, PartialEq)]
pub struct ShowDetails {
    pub family: Option<String>,
    pub parameter_size: Option<String>,
    pub quantization_level: Option<String>,
}

/// Parsed `/api/show` for one model. `template` is Ollama's Go chat template;
/// `capabilities` is the reported feature list (e.g. `completion`, `tools`,
/// `insert`, `vision`). `model_info` is kept raw so the KV-cache predictor
/// (5.11) can read `<arch>.block_count` / `attention.head_count_kv` / etc.
/// without a rigid struct.
#[derive(Deserialize, Default, Clone, Debug, PartialEq)]
pub struct ShowResponse {
    #[serde(default)]
    pub template: String,
    #[serde(default)]
    pub capabilities: Vec<String>,
    #[serde(default)]
    pub details: ShowDetails,
    #[serde(default)]
    pub model_info: Map<String, Value>,
}

/// Fetch `/api/show` metadata for `model` from an Ollama `endpoint`.
/// `POST /api/show {"name": model}`. Errors propagate so the caller can surface
/// "Not available" rather than fabricate.
pub async fn show_model(endpoint: &str, model: &str) -> AppResult<ShowResponse> {
    let client = Client::builder()
        .timeout(DEFAULT_TIMEOUT)
        .build()
        .map_err(|e| AppError::Internal(e.to_string()))?;
    let resp = client
        .post(format!("{endpoint}/api/show"))
        .json(&serde_json::json!({ "name": model }))
        .send()
        .await
        .map_err(|e| {
            if e.is_timeout() {
                AppError::Timeout("inspect_model timed out".into())
            } else {
                AppError::Inference(e.to_string())
            }
        })?;
    if !resp.status().is_success() {
        return Err(AppError::NotFound(format!("model '{model}' (HTTP {})", resp.status())));
    }
    resp.json().await.map_err(|e| AppError::Inference(format!("show body: {e}")))
}

/// Whether a model's reported `/api/show` capabilities include native tool-calling.
pub fn supports_tools(caps: &[String]) -> bool {
    caps.iter().any(|c| c == "tools")
}

/// Best-effort probe: does this Ollama model support native tool-calling? Any
/// error (model gone, Ollama down) → `false`, so the native-FC pass simply skips
/// it (rendered N/A) rather than fabricating a result.
pub async fn probe_supports_tools(endpoint: &str, model: &str) -> bool {
    show_model(endpoint, model).await.map(|r| supports_tools(&r.capabilities)).unwrap_or(false)
}

#[cfg(test)]
#[path = "ollama_show_tests.rs"]
mod tests;
