#![deny(clippy::unwrap_used)]
use crate::commands::compare::CompareRunState;
use crate::commands::compare_payloads::{
    CompareLoadingPayload, CompareTokenPayload,
    EVENT_COMPARE_LOADING, EVENT_COMPARE_RUN_DONE, EVENT_COMPARE_TOKEN,
};
use crate::commands::prompt_handler::make_token_handler;
use crate::errors::AppError;
use crate::inference::compare_runner_finalize::{emit, finalize_row, CompareEmit};
use crate::inference::ollama::stream_generate;
use crate::metrics::timing::RunTiming;
use crate::sync::MutexExt;
use std::sync::{Arc, Mutex};
use tokio_util::sync::CancellationToken;
use uuid::Uuid;

#[derive(Clone)]
pub struct RowSpec {
    pub model_id: Uuid,
    pub model: String,
    pub temperature: Option<f32>,
}

pub fn rows_for(models: &[String], temp_for: impl Fn(&str) -> Option<f32>) -> Vec<RowSpec> {
    models.iter()
        .map(|m| RowSpec { model_id: Uuid::new_v4(), model: m.clone(), temperature: temp_for(m) })
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

pub(crate) async fn run_one_row(
    emit_fn: &CompareEmit,
    state: &CompareRunState,
    endpoint: &str,
    row: &RowSpec,
    prompt: &str,
    system: Option<&str>,
    keep_alive: Option<i32>,
) {
    let row_token = CancellationToken::new();
    state.rows.lock_recover().insert(row.model_id, row_token.clone());
    let id_str = row.model_id.to_string();
    emit(emit_fn, EVENT_COMPARE_LOADING, &CompareLoadingPayload {
        model_id: id_str.clone(), model: row.model.clone(),
    });
    let timing = Arc::new(Mutex::new(RunTiming::start()));
    let emit_clone = emit_fn.clone();
    let model_for_token = row.model.clone();
    let handler = make_token_handler(
        move |t| {
            emit(&emit_clone, EVENT_COMPARE_TOKEN, &CompareTokenPayload {
                model_id: id_str.clone(), model: model_for_token.clone(), text: t.to_string(),
            });
            Ok(())
        },
        row_token.clone(), timing.clone(),
    );
    let result = stream_generate(endpoint, &row.model, prompt, system, row.temperature, keep_alive, row_token.clone(), handler).await;
    state.rows.lock_recover().remove(&row.model_id);
    finalize_row(emit_fn, row, &timing, &row_token, result);
}
