#![deny(clippy::unwrap_used)]
use crate::commands::compare::CompareRunState;
use crate::commands::compare_payloads::{
    CompareTokenPayload, EVENT_COMPARE_RUN_DONE, EVENT_COMPARE_TOKEN,
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
pub(crate) struct RowSpec {
    pub model_id: Uuid,
    pub model: String,
}

pub(crate) fn rows_for(models: &[String]) -> Vec<RowSpec> {
    models.iter().map(|m| RowSpec { model_id: Uuid::new_v4(), model: m.clone() }).collect()
}

pub async fn run_sequential(
    emit_fn: CompareEmit,
    state: &CompareRunState,
    endpoint: &str,
    models: &[String],
    prompt: &str,
) -> Result<(), AppError> {
    let rows = rows_for(models);
    let run_cancel = CancellationToken::new();
    *state.run_cancel.lock_recover() = Some(run_cancel.clone());
    for row in &rows {
        if run_cancel.is_cancelled() { break; }
        run_one_row(&emit_fn, state, endpoint, row, prompt).await;
    }
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
) {
    let row_token = CancellationToken::new();
    state.rows.lock_recover().insert(row.model_id, row_token.clone());
    let timing = Arc::new(Mutex::new(RunTiming::start()));
    let emit_clone = emit_fn.clone();
    let id_for_token = row.model_id.to_string();
    let model_for_token = row.model.clone();
    let handler = make_token_handler(
        move |t| {
            emit(&emit_clone, EVENT_COMPARE_TOKEN, &CompareTokenPayload {
                model_id: id_for_token.clone(),
                model: model_for_token.clone(),
                text: t.to_string(),
            });
            Ok(())
        },
        row_token.clone(),
        timing.clone(),
    );
    let result = stream_generate(endpoint, &row.model, prompt, row_token.clone(), handler).await;
    state.rows.lock_recover().remove(&row.model_id);
    finalize_row(emit_fn, row, &timing, &row_token, result);
}
