#![deny(clippy::unwrap_used)]

use crate::errors::{AppError, AppResult};
use crate::inference::ollama::stream_generate;
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
    temperature: Option<f32>,
    keep_alive: Option<i32>,
    cancel: CancellationToken,
    on_token: impl FnMut(&str),
) -> AppResult<()> {
    validate(model, prompt)?;
    stream_generate(endpoint, model, prompt, system, temperature, keep_alive, cancel, on_token).await
}
