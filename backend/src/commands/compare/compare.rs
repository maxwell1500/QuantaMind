#![deny(clippy::unwrap_used)]
use crate::commands::compare::compare_options::options_for;
use crate::commands::compare::compare_payloads::Strategy;
use crate::commands::compare::compare_sink::TauriCompareSink;
use crate::commands::prompt::prompt_options::validate_params;
use crate::commands::settings::model_settings::ModelSettingsState;
use crate::errors::{AppError, AppResult};
use crate::inference::backend::backend_kind::BackendKind;
use crate::inference::backend::endpoint::ollama_endpoint;
use crate::inference::compare::compare_runner::{rows_for, run_parallel, run_sequential};
use crate::inference::compare::compare_sink::CompareSink;
use crate::persistence::prompts::schema::InferenceParams;
use crate::sync::MutexExt;
use std::collections::HashMap;
use std::sync::Arc;
use tauri::AppHandle;
use uuid::Uuid;

pub use crate::inference::compare::compare_state::CompareRunState;

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
    settings: tauri::State<'_, ModelSettingsState>,
    models: Vec<String>,
    prompt: String,
    strategy: Strategy,
    system: Option<String>,
    params: Option<InferenceParams>,
    per_model_params: Option<HashMap<String, InferenceParams>>,
    backends: Option<Vec<BackendKind>>,
    keep_alive: Option<i32>,
) -> Result<(), AppError> {
    validate(&models, &prompt)?;
    settings.ensure_loaded(&app)?;
    // Validate every provided param block up-front so the closure stays infallible.
    if let Some(p) = &params { validate_params(p)?; }
    if let Some(map) = &per_model_params {
        for p in map.values() { validate_params(p)?; }
    }
    // Each model dispatches to its own backend; per-model params override the
    // shared params, temperature falls back to the per-model setting.
    let backends = backends.unwrap_or_default();
    let rows = rows_for(&models, &backends, |m| {
        Some(options_for(m, params.as_ref(), per_model_params.as_ref(), settings.temperature_for(m)))
    });
    let sink: Arc<dyn CompareSink> = Arc::new(TauriCompareSink::new(app));
    let system_trim = system.as_deref().map(str::trim).filter(|s| !s.is_empty());
    // The "keep model loaded" header toggle decides residency; fall back to the
    // strategy default (Sequential unloads between models) when it isn't sent.
    let keep_alive = keep_alive.or(match strategy {
        Strategy::Sequential => Some(0),
        Strategy::Parallel => None,
    });
    let ep = ollama_endpoint();
    match strategy {
        Strategy::Sequential =>
            run_sequential(sink, state.inner(), &ep, rows, &prompt, system_trim, keep_alive).await,
        Strategy::Parallel =>
            run_parallel(sink, state.inner(), &ep, rows, &prompt, system_trim, keep_alive).await,
    }
}

#[tauri::command]
pub fn stop_compare(
    state: tauri::State<'_, CompareRunState>,
    model_id: Option<String>,
) -> Result<(), AppError> {
    stop_compare_inner(state.inner(), model_id)
}

#[cfg(test)]
#[path = "compare_tests.rs"]
mod tests;

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
