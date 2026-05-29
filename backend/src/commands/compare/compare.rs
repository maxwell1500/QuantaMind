#![deny(clippy::unwrap_used)]
use crate::commands::compare::compare_payloads::Strategy;
use crate::commands::compare::compare_sink::TauriCompareSink;
use crate::commands::settings::model_settings::ModelSettingsState;
use crate::errors::{AppError, AppResult};
use crate::inference::compare::compare_runner::{rows_for, run_parallel, run_sequential};
use crate::inference::compare::compare_sink::CompareSink;
use crate::sync::MutexExt;
use std::sync::Arc;
use tauri::AppHandle;
use uuid::Uuid;

pub use crate::inference::compare::compare_state::CompareRunState;

const DEFAULT_OLLAMA: &str = "http://localhost:11434";

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
) -> Result<(), AppError> {
    validate(&models, &prompt)?;
    settings.ensure_loaded(&app)?;
    let rows = rows_for(&models, |m| Some(settings.temperature_for(m)));
    let sink: Arc<dyn CompareSink> = Arc::new(TauriCompareSink::new(app));
    let system_trim = system.as_deref().map(str::trim).filter(|s| !s.is_empty());
    let keep_alive = match strategy {
        Strategy::Sequential => Some(0),
        Strategy::Parallel => None,
    };
    match strategy {
        Strategy::Sequential =>
            run_sequential(sink, state.inner(), DEFAULT_OLLAMA, rows, &prompt, system_trim, keep_alive).await,
        Strategy::Parallel =>
            run_parallel(sink, state.inner(), DEFAULT_OLLAMA, rows, &prompt, system_trim, keep_alive).await,
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
