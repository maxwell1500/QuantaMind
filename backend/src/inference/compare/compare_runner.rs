#![deny(clippy::unwrap_used)]
use crate::errors::AppError;
use crate::inference::backend::backend_kind::BackendKind;
use crate::inference::ollama::ollama::GenerateOptions;
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
    pub options: Option<GenerateOptions>,
    pub backend: BackendKind,
}

/// Build one row per model, each carrying its own backend (a backend is coupled
/// to the model's weight format — see docs). `backends` is parallel to `models`;
/// a missing entry falls back to Ollama.
pub fn rows_for(
    models: &[String],
    backends: &[BackendKind],
    options_for: impl Fn(&str) -> Option<GenerateOptions>,
) -> Vec<RowSpec> {
    models
        .iter()
        .enumerate()
        .map(|(i, m)| RowSpec {
            model_id: Uuid::new_v4(),
            model: m.clone(),
            options: options_for(m),
            backend: backends.get(i).copied().unwrap_or_default(),
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

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn rows_for_assigns_each_models_backend_defaulting_to_ollama() {
        let models = vec!["a".to_string(), "b".to_string(), "c".to_string()];
        // Shorter than `models` → the missing entry falls back to Ollama.
        let backends = vec![BackendKind::LlamaCpp, BackendKind::Mlx];
        let rows = rows_for(&models, &backends, |_| None);
        assert_eq!(rows[0].backend, BackendKind::LlamaCpp);
        assert_eq!(rows[1].backend, BackendKind::Mlx);
        assert_eq!(rows[2].backend, BackendKind::Ollama);
    }
}
