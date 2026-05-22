use crate::commands::prompt_handler::make_token_handler;
use crate::commands::prompt_payloads::{CancelledPayload, DonePayload, TokenPayload};
use crate::errors::{AppError, AppResult};
use crate::inference::ollama::stream_generate;
use crate::metrics::timing::RunTiming;
use std::sync::{Arc, Mutex};
use tauri::Emitter;
use tokio_util::sync::CancellationToken;

const DEFAULT_OLLAMA: &str = "http://localhost:11434";
pub const EVENT_TOKEN: &str = "prompt-token";
pub const EVENT_DONE: &str = "prompt-done";
pub const EVENT_CANCELLED: &str = "prompt-cancelled";

#[derive(Default)]
pub struct RunState {
    current: Mutex<Option<CancellationToken>>,
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
    cancel: CancellationToken,
    on_token: impl FnMut(&str),
) -> AppResult<()> {
    validate(model, prompt)?;
    stream_generate(endpoint, model, prompt, cancel, on_token).await
}

#[tauri::command]
pub async fn run_prompt(
    app: tauri::AppHandle,
    state: tauri::State<'_, RunState>,
    model: String,
    prompt: String,
) -> Result<(), AppError> {
    let token = CancellationToken::new();
    {
        let mut guard = state.current.lock().unwrap();
        if let Some(prev) = guard.take() { prev.cancel(); }
        *guard = Some(token.clone());
    }

    let timing = Arc::new(Mutex::new(RunTiming::start()));
    let emit_app = app.clone();
    let handler = make_token_handler(
        move |t| emit_app
            .emit(EVENT_TOKEN, TokenPayload { text: t.to_string() })
            .map_err(|_| ()),
        token.clone(),
        timing.clone(),
    );
    let result = run_prompt_inner(DEFAULT_OLLAMA, &model, &prompt, token.clone(), handler).await;

    *state.current.lock().unwrap() = None;

    if result.is_ok() {
        let t = timing.lock().unwrap();
        if token.is_cancelled() {
            app.emit(EVENT_CANCELLED, CancelledPayload { token_count: t.token_count })
                .map_err(|e| AppError::Internal(e.to_string()))?;
        } else {
            app.emit(
                EVENT_DONE,
                DonePayload {
                    ttft_ms: t.ttft_ms(),
                    tokens_per_sec: t.tokens_per_sec(),
                    token_count: t.token_count,
                },
            )
            .map_err(|e| AppError::Internal(e.to_string()))?;
        }
    }
    result
}

#[tauri::command]
pub fn stop_prompt(state: tauri::State<'_, RunState>) -> Result<(), AppError> {
    if let Some(token) = state.current.lock().unwrap().take() {
        token.cancel();
    }
    Ok(())
}
