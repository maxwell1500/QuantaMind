#![deny(clippy::unwrap_used)]
use crate::commands::compare::CompareRunState;
use crate::commands::compare_payloads::EVENT_COMPARE_RUN_DONE;
use crate::errors::AppError;
use crate::inference::backend_kind::BackendKind;
use crate::inference::compare_run_row::run_one_row;
use crate::inference::compare_runner_finalize::{emit, CompareEmit};
use crate::sync::MutexExt;
use tokio_util::sync::CancellationToken;
use uuid::Uuid;

#[derive(Clone)]
pub struct RowSpec {
    pub model_id: Uuid,
    pub model: String,
    pub temperature: Option<f32>,
    pub backend: BackendKind,
}

pub fn rows_for(models: &[String], temp_for: impl Fn(&str) -> Option<f32>) -> Vec<RowSpec> {
    models.iter()
        .map(|m| RowSpec {
            model_id: Uuid::new_v4(),
            model: m.clone(),
            temperature: temp_for(m),
            backend: BackendKind::Ollama,
        })
        .collect()
}

pub async fn run_sequential(
    emit_fn: CompareEmit,
    state: &CompareRunState,
    endpoint: &str,
    rows: Vec<RowSpec>,
    prompt: &str,
    system: Option<&str>,
    keep_alive: Option<i32>,
) -> Result<(), AppError> {
    let run_cancel = CancellationToken::new();
    *state.run_cancel.lock_recover() = Some(run_cancel.clone());
    for row in &rows {
        if run_cancel.is_cancelled() { break; }
        run_one_row(&emit_fn, state, endpoint, row, prompt, system, keep_alive).await;
    }
    *state.run_cancel.lock_recover() = None;
    state.rows.lock_recover().clear();
    emit(&emit_fn, EVENT_COMPARE_RUN_DONE, &serde_json::json!({}));
    Ok(())
}

pub async fn run_parallel(
    emit_fn: CompareEmit,
    state: &CompareRunState,
    endpoint: &str,
    rows: Vec<RowSpec>,
    prompt: &str,
    system: Option<&str>,
    keep_alive: Option<i32>,
) -> Result<(), AppError> {
    *state.run_cancel.lock_recover() = Some(CancellationToken::new());
    let endpoint_owned = endpoint.to_string();
    let prompt_owned = prompt.to_string();
    let system_owned = system.map(str::to_string);
    let handles: Vec<_> = rows.into_iter().map(|row| {
        let emit_clone = emit_fn.clone();
        let state_clone = state.clone();
        let endpoint = endpoint_owned.clone();
        let prompt = prompt_owned.clone();
        let system = system_owned.clone();
        tokio::spawn(async move {
            run_one_row(&emit_clone, &state_clone, &endpoint, &row, &prompt, system.as_deref(), keep_alive).await;
        })
    }).collect();
    let _ = futures_util::future::join_all(handles).await;
    *state.run_cancel.lock_recover() = None;
    state.rows.lock_recover().clear();
    emit(&emit_fn, EVENT_COMPARE_RUN_DONE, &serde_json::json!({}));
    Ok(())
}
