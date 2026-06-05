use crate::errors::AppResult;
use crate::inference::backend::backend_kind::BackendKind;
use crate::inference::eval::agentic::build::sandbox_for;
use crate::inference::eval::agentic::model_turn::ModelTurn;
use crate::inference::eval::agentic::report::{AgenticReport, FailureTracker, TopError};
use crate::inference::eval::agentic::runner::run_agentic;
use crate::inference::eval::agentic::step::TrajectoryStep;
use crate::inference::eval::toolcall::eval::{aggregate, trace_one_with, TaskResult, ToolCallReport, TraceResult};
use crate::inference::eval::toolcall::matrix::ModelTarget;
use crate::inference::eval::toolcall::score::verdict_passed;
use crate::inference::eval::toolcall::tasks::ToolTask;
use crate::persistence::eval_history::RunSummary;
use serde::{Deserialize, Serialize};
use std::sync::Arc;
use tokio::sync::mpsc::unbounded_channel;
use tokio_util::sync::CancellationToken;

/// The per-task outcome streamed to the UI and cached for the trace debugger.
#[derive(Serialize, Clone, Debug)]
#[serde(tag = "kind", rename_all = "snake_case")]
pub enum TaskOutcome {
    Single { passed: bool, trace: TraceResult },
    Agentic { report: AgenticReport },
    Error { message: String },
}

/// Streaming surface for a batch run. The command layer implements this to
/// `app.emit()` progress; the engine stays Tauri-free. `Send + Sync` so the
/// agentic per-turn pump can forward from a spawned task.
pub trait BatchSink: Send + Sync {
    fn task_started(&self, model: &str, task_id: &str, index: usize, total: usize, category: &str);
    fn agentic_turn(&self, model: &str, task_id: &str, step: &TrajectoryStep);
    fn task_done(&self, model: &str, task_id: &str, outcome: &TaskOutcome);
}

/// Per-model aggregate of the collection's agentic tasks: summed Pass^k, mean
/// steps/effort, dominant failure. Null metrics render "N/A", never fabricated.
#[derive(Serialize, Deserialize, Clone, Debug, PartialEq)]
pub struct AggAgentic {
    pub passes: u32,
    pub total_runs: u32,
    pub avg_steps: Option<f64>,
    pub avg_output_tokens_success: Option<f64>,
    /// Driver D: mean per-task schema resilience over this model's tasks that hit a
    /// schema error. `None` when none did → the Matrix renders "—", never a 0.
    pub schema_resilience: Option<f64>,
    pub top_error: TopError,
    /// Summed failure breakdown across this model's agentic tasks. The readiness
    /// verdict gates on the exact loop/hallucination counts — `top_error` alone
    /// would hide a 1-loop/9-hallucination model from a `forbid_infinite_loop` profile.
    #[serde(default)]
    pub failures: FailureTracker,
}

/// One model's row in the Matrix Scoreboard: single-turn report and/or agentic
/// aggregate (whichever the collection contained), or the error it hit.
#[derive(Serialize, Deserialize, Clone, Debug, PartialEq)]
pub struct BatchColumn {
    pub model: String,
    pub backend: BackendKind,
    pub toolcall: Option<ToolCallReport>,
    pub agentic: Option<AggAgentic>,
    /// Phase 7.2: the parallel NATIVE function-calling aggregate (Ollama `/api/chat`
    /// `tool_calls`), when measured. `None` = not run / unsupported backend → N/A.
    /// `#[serde(default)]` so pre-7.2 reports still load.
    #[serde(default)]
    pub agentic_native_fc: Option<AggAgentic>,
    pub error: Option<String>,
}

/// The full batch result: one column per target model.
#[derive(Serialize, Deserialize, Clone, Debug, PartialEq)]
pub struct BatchReport {
    pub collection_id: String,
    pub columns: Vec<BatchColumn>,
    /// The context length (`num_ctx`) the run used, when set — the basis for the
    /// readiness VRAM-fit KV-cache estimate. `#[serde(default)]` so reports saved
    /// before Phase 7.4 (and the engine, which doesn't know the param) still load.
    #[serde(default)]
    pub num_ctx: Option<u32>,
}

fn mean_f64(xs: &[f64]) -> Option<f64> {
    (!xs.is_empty()).then(|| xs.iter().sum::<f64>() / xs.len() as f64)
}

/// Per-model history rows for the Audit timeline: the single-turn composite plus
/// the agentic Pass^k / steps / effort, for every model whose column didn't error.
pub fn batch_summaries(report: &BatchReport, ts: &str) -> Vec<RunSummary> {
    report
        .columns
        .iter()
        .filter(|c| c.error.is_none())
        .map(|c| {
            let tc = c.toolcall.as_ref();
            let ag = c.agentic.as_ref();
            RunSummary {
                ts: ts.to_string(),
                model: c.model.clone(),
                backend: c.backend,
                parse_rate: tc.and_then(|r| r.parse_rate),
                tool_selection_acc: tc.and_then(|r| r.tool_selection_acc),
                arg_acc: tc.and_then(|r| r.arg_acc),
                abstain_acc: tc.and_then(|r| r.abstain_acc),
                composite: tc.and_then(|r| r.composite),
                n: tc.map(|r| r.n).unwrap_or(0),
                pass_k: ag.map(|a| if a.total_runs > 0 { a.passes as f64 / a.total_runs as f64 } else { 0.0 }),
                agentic_avg_steps: ag.and_then(|a| a.avg_steps),
                effort: ag.and_then(|a| a.avg_output_tokens_success),
            }
        })
        .collect()
}

fn agg_agentic(reports: &[AgenticReport]) -> AggAgentic {
    let mut failures = FailureTracker::default();
    for r in reports {
        failures.infinite_loop_hits += r.failures.infinite_loop_hits;
        failures.hallucinated_completions += r.failures.hallucinated_completions;
        failures.malformed_json_calls += r.failures.malformed_json_calls;
        failures.schema_unrecovered_calls += r.failures.schema_unrecovered_calls;
    }
    // Same severity order as FailureTracker::top (schema above json).
    let top_error = [
        (failures.infinite_loop_hits, TopError::InfiniteLoop),
        (failures.hallucinated_completions, TopError::Hallucinated),
        (failures.schema_unrecovered_calls, TopError::MalformedSchema),
        (failures.malformed_json_calls, TopError::MalformedJson),
    ]
    .into_iter()
    .fold((0u32, TopError::None), |best, (n, e)| if n > best.0 { (n, e) } else { best })
    .1;
    let steps: Vec<f64> = reports.iter().filter_map(|r| r.avg_steps).collect();
    let eff: Vec<f64> = reports.iter().filter_map(|r| r.avg_output_tokens_success).collect();
    let resil: Vec<f64> = reports.iter().filter_map(|r| r.schema_resilience).collect();
    AggAgentic {
        passes: reports.iter().map(|r| r.passes).sum(),
        total_runs: reports.iter().map(|r| r.total_runs).sum(),
        avg_steps: mean_f64(&steps),
        avg_output_tokens_success: mean_f64(&eff),
        schema_resilience: mean_f64(&resil),
        top_error,
        failures,
    }
}

/// Run one agentic task, forwarding its live `TrajectoryStep`s to the sink as
/// they arrive (a spawned pump drains the channel concurrently with the run).
async fn run_one_agentic<M: ModelTurn + Send + Sync>(
    turn: &M,
    task: &ToolTask,
    model: &str,
    sink: Arc<dyn BatchSink>,
) -> AppResult<AgenticReport> {
    let (sandbox, cfg) = sandbox_for(task)?;
    let (tx, mut rx) = unbounded_channel::<TrajectoryStep>();
    let (s2, model2, task2) = (sink.clone(), model.to_string(), task.id.clone());
    let pump = tokio::spawn(async move {
        while let Some(step) = rx.recv().await {
            s2.agentic_turn(&model2, &task2, &step);
        }
    });
    let result = run_agentic(turn, &sandbox, cfg, &tx).await;
    drop(tx);
    let _ = pump.await;
    result
}

/// The VRAM-safe sequential dispatcher: for each target model, run every task in
/// order (single-turn or agentic), streaming progress through `sink`, and fold a
/// per-model `BatchReport`. ONE model runs ONE task at a time — never fans out
/// local inference. `make_turn` builds the per-model executor (a live backend in
/// production, a scripted model in tests).
pub async fn run_batch<M, F>(
    collection_id: &str,
    targets: &[ModelTarget],
    tasks: &[ToolTask],
    cancel: CancellationToken,
    sink: Arc<dyn BatchSink>,
    make_turn: F,
) -> AppResult<BatchReport>
where
    M: ModelTurn + Send + Sync,
    F: Fn(&ModelTarget) -> M,
{
    let mut columns = Vec::with_capacity(targets.len());
    for target in targets {
        let turn = make_turn(target);
        let mut single_tasks: Vec<ToolTask> = Vec::new();
        let mut single_results: Vec<TaskResult> = Vec::new();
        let mut agentic_reports: Vec<AgenticReport> = Vec::new();
        let mut col_error: Option<String> = None;

        for (i, task) in tasks.iter().enumerate() {
            if cancel.is_cancelled() {
                break;
            }
            sink.task_started(&target.model, &task.id, i, tasks.len(), &task.category);
            if task.category == "agentic" {
                match run_one_agentic(&turn, task, &target.model, sink.clone()).await {
                    Ok(report) => {
                        sink.task_done(&target.model, &task.id, &TaskOutcome::Agentic { report: report.clone() });
                        agentic_reports.push(report);
                    }
                    Err(e) => {
                        let msg = e.to_string();
                        sink.task_done(&target.model, &task.id, &TaskOutcome::Error { message: msg.clone() });
                        col_error = Some(msg);
                    }
                }
            } else {
                match trace_one_with(&turn, &target.model, task).await {
                    Ok(trace) => {
                        let passed = verdict_passed(&trace.verdict);
                        single_tasks.push(task.clone());
                        single_results.push(TaskResult {
                            id: task.id.clone(),
                            category: task.category.clone(),
                            verdict: trace.verdict.clone(),
                            prompt_tokens: trace.prompt_tokens,
                        });
                        sink.task_done(&target.model, &task.id, &TaskOutcome::Single { passed, trace });
                    }
                    Err(e) => {
                        let msg = e.to_string();
                        sink.task_done(&target.model, &task.id, &TaskOutcome::Error { message: msg.clone() });
                        col_error = Some(msg);
                    }
                }
            }
        }

        let toolcall = (!single_results.is_empty()).then(|| aggregate(&single_tasks, single_results));
        let agentic = (!agentic_reports.is_empty()).then(|| agg_agentic(&agentic_reports));
        columns.push(BatchColumn {
            model: target.model.clone(),
            backend: target.backend,
            toolcall,
            agentic,
            agentic_native_fc: None, // filled by run_native_fc_pass when enabled
            error: col_error,
        });
    }
    // The engine is param-agnostic; the command layer stamps `num_ctx` afterwards.
    Ok(BatchReport { collection_id: collection_id.to_string(), columns, num_ctx: None })
}

/// Phase 7.2: measure NATIVE function-calling per model and fold a parallel
/// `agentic_native_fc` aggregate onto each column — the same agentic tasks, the
/// same sandbox/scoring, but driven by `make_native` (Ollama `/api/chat` tools in
/// production, a scripted turn in tests). Only Ollama columns whose model is in
/// `supported` (the capability probe ran upstream) get a native run; others stay
/// `None` (N/A). Native steps aren't streamed to the UI sink in this slice — they
/// drain to a throwaway channel. Best-effort: a native run that errors leaves the
/// column `None` rather than failing the report.
pub async fn run_native_fc_pass<M, F>(
    report: &mut BatchReport,
    tasks: &[ToolTask],
    supported: &std::collections::HashSet<String>,
    cancel: CancellationToken,
    make_native: F,
) -> AppResult<()>
where
    M: ModelTurn + Send + Sync,
    F: Fn(&str, &ToolTask) -> M,
{
    let agentic_tasks: Vec<&ToolTask> = tasks.iter().filter(|t| t.category == "agentic").collect();
    if agentic_tasks.is_empty() {
        return Ok(());
    }
    for col in report.columns.iter_mut() {
        if cancel.is_cancelled() {
            break;
        }
        if col.backend != BackendKind::Ollama || !supported.contains(&col.model) {
            continue;
        }
        let mut reports: Vec<AgenticReport> = Vec::new();
        for task in &agentic_tasks {
            if cancel.is_cancelled() {
                break;
            }
            let turn = make_native(&col.model, task);
            let (sandbox, cfg) = sandbox_for(task)?;
            let (tx, mut rx) = unbounded_channel::<TrajectoryStep>();
            let drain = tokio::spawn(async move { while rx.recv().await.is_some() {} });
            let result = run_agentic(&turn, &sandbox, cfg, &tx).await;
            drop(tx);
            let _ = drain.await;
            if let Ok(report) = result {
                reports.push(report);
            }
        }
        if !reports.is_empty() {
            col.agentic_native_fc = Some(agg_agentic(&reports));
        }
    }
    Ok(())
}

#[cfg(test)]
#[path = "batch_tests.rs"]
mod tests;
