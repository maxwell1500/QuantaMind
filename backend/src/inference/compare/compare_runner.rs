#![deny(clippy::unwrap_used)]
use crate::errors::AppError;
use crate::inference::backend::backend_kind::BackendKind;
use crate::inference::compare::compare_run_row::run_one_row;
use crate::inference::compare::compare_sink::CompareSink;
use crate::inference::compare::compare_state::CompareRunState;
use crate::sync::MutexExt;
use std::sync::Arc;
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
    sink: Arc<dyn CompareSink>,
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
        run_one_row(&sink, state, endpoint, row, prompt, system, keep_alive).await;
    }
    *state.run_cancel.lock_recover() = None;
    state.rows.lock_recover().clear();
    sink.run_done();
    Ok(())
}

pub async fn run_parallel(
    sink: Arc<dyn CompareSink>,
    state: &CompareRunState,
    endpoint: &str,
    rows: Vec<RowSpec>,
    prompt: &str,
    system: Option<&str>,
    keep_alive: Option<i32>,
) -> Result<(), AppError> {
    *state.run_cancel.lock_recover() = Some(CancellationToken::new());
    let endpoint = endpoint.to_string();
    let prompt = prompt.to_string();
    let system = system.map(str::to_string);
    let handles: Vec<_> = rows.into_iter().map(|row| {
        let (id, model) = (row.model_id.to_string(), row.model.clone());
        let (sink, state) = (sink.clone(), state.clone());
        let (endpoint, prompt, system) = (endpoint.clone(), prompt.clone(), system.clone());
        let handle = tokio::spawn(async move {
            run_one_row(&sink, &state, &endpoint, &row, &prompt, system.as_deref(), keep_alive).await;
        });
        (id, model, handle)
    }).collect();
    for (id, model, handle) in handles {
        if let Err(e) = handle.await {
            eprintln!("compare row '{model}' task panicked: {e}");
            sink.error(&id, &model, "internal", "row task panicked");
        }
    }
    *state.run_cancel.lock_recover() = None;
    state.rows.lock_recover().clear();
    sink.run_done();
    Ok(())
}
