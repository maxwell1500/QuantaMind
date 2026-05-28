#![deny(clippy::unwrap_used)]
use crate::commands::compare::CompareRunState;
use crate::commands::compare_payloads::{
    CompareLoadingPayload, CompareTokenPayload, EVENT_COMPARE_LOADING, EVENT_COMPARE_TOKEN,
};
use crate::commands::prompt_handler::make_token_handler;
use crate::inference::backend::InferenceBackend;
use crate::inference::backend_kind::BackendKind;
use crate::inference::compare_runner::RowSpec;
use crate::inference::compare_runner_finalize::{emit, finalize_row, CompareEmit};
use crate::inference::generate_spec::GenerateSpec;
use crate::inference::ollama::GenerateOptions;
use crate::inference::ollama_backend::OllamaBackend;
use crate::metrics::timing::RunTiming;
use crate::sync::MutexExt;
use std::sync::{Arc, Mutex};
use tokio_util::sync::CancellationToken;

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
    let options = row.temperature.map(|t| GenerateOptions { temperature: Some(t), ..Default::default() });
    let spec = GenerateSpec {
        model: row.model.clone(),
        prompt: prompt.to_string(),
        system: system.map(str::to_string),
        options,
        keep_alive,
    };
    let result = match row.backend {
        BackendKind::Ollama => {
            OllamaBackend::new(endpoint.to_string())
                .generate(&spec, row_token.clone(), handler)
                .await
        }
    };
    state.rows.lock_recover().remove(&row.model_id);
    finalize_row(emit_fn, row, &timing, &row_token, result);
}
