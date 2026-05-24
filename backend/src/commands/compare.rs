#![deny(clippy::unwrap_used)]
use crate::commands::compare_payloads::Strategy;
use crate::errors::{AppError, AppResult};
use crate::inference::compare_runner::{run_parallel, run_sequential};
use crate::inference::compare_runner_finalize::CompareEmit;
use crate::sync::MutexExt;
use std::collections::HashMap;
use std::sync::{Arc, Mutex};
use tauri::{AppHandle, Emitter};
use tokio_util::sync::CancellationToken;
use uuid::Uuid;

const DEFAULT_OLLAMA: &str = "http://localhost:11434";

#[derive(Default, Clone)]
pub struct CompareRunState {
    pub rows: Arc<Mutex<HashMap<Uuid, CancellationToken>>>,
    pub run_cancel: Arc<Mutex<Option<CancellationToken>>>,
}

fn make_emit(app: AppHandle) -> CompareEmit {
    Arc::new(move |event: &str, payload: serde_json::Value| {
        let _ = app.emit(event, payload);
    })
}

fn validate(models: &[String], prompt: &str) -> AppResult<()> {
    if models.is_empty() {
        return Err(AppError::Validation("no models selected".into()));
    }
    if prompt.trim().is_empty() {
        return Err(AppError::Validation("prompt is empty".into()));
    }
    Ok(())
}

#[tauri::command]
pub async fn run_compare(
    app: AppHandle,
    state: tauri::State<'_, CompareRunState>,
    models: Vec<String>,
    prompt: String,
    strategy: Strategy,
    system: Option<String>,
) -> Result<(), AppError> {
    validate(&models, &prompt)?;
    let emit = make_emit(app);
    let system_trim = system.as_deref().map(str::trim).filter(|s| !s.is_empty());
    match strategy {
        Strategy::Sequential | Strategy::SequentialSkippable =>
            run_sequential(emit, state.inner(), DEFAULT_OLLAMA, &models, &prompt, system_trim).await,
        Strategy::Parallel =>
            run_parallel(emit, state.inner(), DEFAULT_OLLAMA, &models, &prompt, system_trim).await,
    }
}

#[tauri::command]
pub fn stop_compare(
    state: tauri::State<'_, CompareRunState>,
    model_id: Option<String>,
) -> Result<(), AppError> {
    stop_compare_inner(state.inner(), model_id)
}

pub fn stop_compare_inner(state: &CompareRunState, model_id: Option<String>) -> AppResult<()> {
    match model_id {
        Some(id_str) => {
            let id = id_str.parse::<Uuid>()
                .map_err(|e| AppError::Validation(format!("bad model_id: {e}")))?;
            if let Some(token) = state.rows.lock_recover().remove(&id) {
                token.cancel();
            }
        }
        None => {
            if let Some(t) = state.run_cancel.lock_recover().take() { t.cancel(); }
            for (_, token) in state.rows.lock_recover().drain() { token.cancel(); }
        }
    }
    Ok(())
}
