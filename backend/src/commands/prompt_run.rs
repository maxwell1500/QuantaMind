#![deny(clippy::unwrap_used)]

use crate::errors::{AppError, AppResult};
use crate::inference::backend::InferenceBackend;
use crate::inference::generate_spec::GenerateSpec;
use crate::inference::ollama::GenerateOptions;
use crate::inference::ollama_backend::OllamaBackend;
use tokio_util::sync::CancellationToken;

pub fn validate(model: &str, prompt: &str) -> AppResult<()> {
    if model.trim().is_empty() {
        return Err(AppError::Validation("model is empty".into()));
    }
    if prompt.trim().is_empty() {
        return Err(AppError::Validation("prompt is empty".into()));
    }
    Ok(())
}

pub async fn run_prompt_inner(
    endpoint: &str,
    model: &str,
    prompt: &str,
    system: Option<&str>,
    options: Option<GenerateOptions>,
    keep_alive: Option<i32>,
    cancel: CancellationToken,
    on_token: impl FnMut(&str),
) -> AppResult<()> {
    validate(model, prompt)?;
    let spec = GenerateSpec {
        model: model.to_string(),
        prompt: prompt.to_string(),
        system: system.map(str::to_string),
        options,
        keep_alive,
    };
    OllamaBackend::new(endpoint.to_string())
        .generate(&spec, cancel, on_token)
        .await
}
