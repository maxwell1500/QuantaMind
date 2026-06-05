use crate::commands::emit::log_emit;
use crate::commands::eval::batch_payloads::{
    AgenticStepPayload, BatchCompletePayload, BatchProgress, EVENT_AGENTIC_STEP, EVENT_BATCH_COMPLETE,
    EVENT_BATCH_PROGRESS,
};
use crate::commands::eval::toolcall_cmd::endpoint_for;
use crate::commands::prompt::prompt_options::{to_generate_options, validate_params};
use crate::errors::AppError;
use crate::inference::backend::backend_kind::BackendKind;
use crate::inference::eval::agentic::model_turn::{BackendTurn, NativeOllamaTurn};
use crate::inference::eval::agentic::step::TrajectoryStep;
use crate::inference::eval::batch::{batch_summaries, run_batch, run_native_fc_pass, BatchReport, BatchSink, NoVramGate, TaskOutcome};
use crate::inference::eval::toolcall::matrix::ModelTarget;
use crate::inference::eval::toolcall::tasks::{validate_tasks, ToolTask};
use crate::inference::ollama::ollama_show::probe_supports_tools;
use crate::persistence::eval_history;
use crate::persistence::prompts::schema::InferenceParams;
use crate::persistence::readiness::reports;
use crate::sync::MutexExt;
use std::collections::HashSet;
use std::path::PathBuf;
use std::sync::{Arc, Mutex};
use tauri::{AppHandle, Manager};
use tokio_util::sync::CancellationToken;

/// Per-collection regression log dir (shared with the matrix command).
fn history_dir(app: &AppHandle) -> Result<PathBuf, AppError> {
    let dir = app.path().app_config_dir().map_err(|e| AppError::Io(e.to_string()))?;
    Ok(dir.join("history"))
}

/// Where the last full batch report per collection is persisted — Rust's source
/// of truth for the readiness verdict (the Agent Report page + future CLI read it).
fn reports_dir(app: &AppHandle) -> Result<PathBuf, AppError> {
    let dir = app.path().app_config_dir().map_err(|e| AppError::Io(e.to_string()))?;
    Ok(dir.join("batch_reports"))
}

/// Run-level cancellation for the batch dispatcher (mirrors `CompareRunState`).
#[derive(Default)]
pub struct BatchRunState {
    cancel: Mutex<Option<CancellationToken>>,
}

/// Bridges domain batch events onto Tauri events — the single place the batch
/// payload shapes meet the IPC layer (see `docs/architecture.md#layering`).
struct TauriBatchSink {
    app: AppHandle,
}

impl BatchSink for TauriBatchSink {
    fn task_started(&self, model: &str, task_id: &str, index: usize, total: usize, category: &str) {
        log_emit(&self.app, EVENT_BATCH_PROGRESS, BatchProgress::Started {
            model: model.into(), task_id: task_id.into(), index, total, category: category.into(),
        });
    }
    fn agentic_turn(&self, model: &str, task_id: &str, step: &TrajectoryStep) {
        log_emit(&self.app, EVENT_AGENTIC_STEP, AgenticStepPayload {
            model: model.into(), task_id: task_id.into(), step: step.clone(),
        });
    }
    fn task_done(&self, model: &str, task_id: &str, outcome: &TaskOutcome) {
        log_emit(&self.app, EVENT_BATCH_PROGRESS, BatchProgress::Done {
            model: model.into(), task_id: task_id.into(), outcome: outcome.clone(),
        });
    }
}

/// Apply the run-time K / Max-Steps overrides to every agentic task — the UI
/// controls override the persisted per-task spec.
fn apply_overrides(mut tasks: Vec<ToolTask>, k: Option<u32>, max_steps: Option<u32>) -> Vec<ToolTask> {
    for t in &mut tasks {
        if let Some(spec) = t.agentic.as_mut() {
            if k.is_some() {
                spec.k = k;
            }
            if max_steps.is_some() {
                spec.max_steps = max_steps;
            }
        }
    }
    tasks
}

/// The single streaming eval command: validate, run every (model, task) as a
/// strict sequential queue in Rust, stream `batch-progress` / `agentic-step`, and
/// emit `batch-complete` with the per-model Matrix. Crosses the IPC boundary once.
#[tauri::command]
pub async fn run_batch_eval(
    app: AppHandle,
    state: tauri::State<'_, BatchRunState>,
    collection_id: String,
    targets: Vec<ModelTarget>,
    tasks: Vec<ToolTask>,
    k: Option<u32>,
    max_steps: Option<u32>,
    params: Option<InferenceParams>,
    keep_alive: Option<i32>,
    run_native_fc: Option<bool>,
) -> Result<BatchReport, AppError> {
    validate_tasks(&tasks)?;
    // Global inference params (from the header) applied to every eval turn.
    let options = match &params {
        Some(p) => {
            validate_params(p)?;
            Some(to_generate_options(p))
        }
        None => None,
    };
    let cancel = CancellationToken::new();
    {
        let mut g = state.cancel.lock_recover();
        if let Some(prev) = g.take() {
            prev.cancel();
        }
        *g = Some(cancel.clone());
    }
    let tasks = apply_overrides(tasks, k, max_steps);
    let sink: Arc<dyn BatchSink> = Arc::new(TauriBatchSink { app: app.clone() });
    let turn_cancel = cancel.clone();
    // Keep copies the native-FC pass needs (the prompt run moves `cancel` and
    // `options` into the dispatcher/closure below).
    let native_cancel = cancel.clone();
    let native_options = options.clone();
    let mut report = run_batch(&collection_id, &targets, &tasks, cancel, sink, move |t: &ModelTarget| BackendTurn {
        backend: t.backend,
        endpoint: endpoint_for(t.backend),
        model: t.model.clone(),
        cancel: turn_cancel.clone(),
        options: options.clone(),
        keep_alive,
    })
    .await?;
    // Stamp the run's context length so the readiness VRAM-fit estimate sizes the
    // KV cache to what actually ran (the engine itself is param-agnostic).
    report.num_ctx = params.as_ref().and_then(|p| p.num_ctx);
    log_emit(&app, EVENT_BATCH_COMPLETE, BatchCompletePayload { report: report.clone() });

    // Append per-model summaries to the collection's regression history (best
    // effort — a history write must not fail an otherwise-successful run).
    if let Ok(dir) = history_dir(&app) {
        let entries = batch_summaries(&report, &crate::time_iso::now_utc());
        if !entries.is_empty() {
            let _ = eval_history::append(&dir, &collection_id, &entries);
        }
    }

    // Opt-in NATIVE function-calling pass (Phase 7.2): after the prompt-based
    // results are emitted, measure native tool-calling for the Ollama models that
    // report the `tools` capability, then re-emit so the Matrix gains the parallel
    // column. Best-effort — never fails the run.
    if run_native_fc.unwrap_or(false) {
        let endpoint = endpoint_for(BackendKind::Ollama);
        let mut supported = HashSet::new();
        for t in &targets {
            if t.backend == BackendKind::Ollama && probe_supports_tools(&endpoint, &t.model).await {
                supported.insert(t.model.clone());
            }
        }
        let _ = run_native_fc_pass(
            &mut report,
            &tasks,
            &supported,
            native_cancel,
            |model, task| NativeOllamaTurn {
                endpoint: endpoint.clone(),
                model: model.to_string(),
                tools: task.tools.clone(),
                options: native_options.clone(),
            },
            &[],
            &|_| {},
            &NoVramGate,
        )
        .await;
        log_emit(&app, EVENT_BATCH_COMPLETE, BatchCompletePayload { report: report.clone() });
    }

    // Persist the full report so the readiness verdict reads it from Rust, not
    // the frontend store (best effort — never fail the run on a report write).
    if let Ok(dir) = reports_dir(&app) {
        let _ = reports::save(&dir, &report);
    }

    Ok(report)
}

#[tauri::command]
pub fn stop_batch_eval(state: tauri::State<'_, BatchRunState>) -> Result<(), AppError> {
    if let Some(t) = state.cancel.lock_recover().take() {
        t.cancel();
    }
    Ok(())
}
