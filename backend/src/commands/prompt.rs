use crate::errors::{AppError, AppResult};
use crate::inference::ollama::stream_generate;
use serde::Serialize;
use tauri::Emitter;

const DEFAULT_OLLAMA: &str = "http://localhost:11434";
pub const EVENT_TOKEN: &str = "prompt-token";
pub const EVENT_DONE: &str = "prompt-done";

#[derive(Serialize, Clone)]
struct TokenPayload {
    text: String,
}

fn validate(model: &str, prompt: &str) -> AppResult<()> {
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
    on_token: impl FnMut(&str),
) -> AppResult<()> {
    validate(model, prompt)?;
    stream_generate(endpoint, model, prompt, on_token).await
}

#[tauri::command]
pub async fn run_prompt(
    app: tauri::AppHandle,
    model: String,
    prompt: String,
) -> Result<(), AppError> {
    let emit_app = app.clone();
    run_prompt_inner(DEFAULT_OLLAMA, &model, &prompt, move |t| {
        let _ = emit_app.emit(EVENT_TOKEN, TokenPayload { text: t.to_string() });
    })
    .await?;
    app.emit(EVENT_DONE, &())
        .map_err(|e| AppError::Internal(e.to_string()))?;
    Ok(())
}
