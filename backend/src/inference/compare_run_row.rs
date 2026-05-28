#![deny(clippy::unwrap_used)]
use crate::inference::backend::InferenceBackend;
use crate::inference::backend_kind::BackendKind;
use crate::inference::compare_runner::RowSpec;
use crate::inference::compare_runner_finalize::finalize_row;
use crate::inference::compare_sink::CompareSink;
use crate::inference::compare_state::CompareRunState;
use crate::inference::generate_spec::GenerateSpec;
use crate::inference::ollama::GenerateOptions;
use crate::inference::ollama_backend::OllamaBackend;
use crate::inference::token_handler::make_token_handler;
use crate::metrics::timing::RunTiming;
use crate::sync::MutexExt;
use std::sync::{Arc, Mutex};
use tokio_util::sync::CancellationToken;

pub(crate) async fn run_one_row(
    sink: &Arc<dyn CompareSink>,
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
    sink.loading(&id_str, &row.model);
    let timing = Arc::new(Mutex::new(RunTiming::start()));
    let sink_for_token = sink.clone();
    let id_for_token = id_str.clone();
    let model_for_token = row.model.clone();
    let handler = make_token_handler(
        move |t| {
            sink_for_token.token(&id_for_token, &model_for_token, t);
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
    finalize_row(sink.as_ref(), row, &timing, &row_token, result);
}
