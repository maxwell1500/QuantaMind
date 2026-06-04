use crate::errors::AppResult;
use crate::inference::backend::backend_kind::BackendKind;
use crate::inference::eval::agentic::build::sandbox_for;
use crate::inference::eval::agentic::model_turn::ModelTurn;
use crate::inference::eval::agentic::report::{AgenticReport, TopError};
use crate::inference::eval::agentic::runner::run_agentic;
use crate::inference::eval::agentic::step::TrajectoryStep;
use crate::inference::eval::toolcall::eval::{aggregate, trace_one_with, TaskResult, ToolCallReport, TraceResult};
use crate::inference::eval::toolcall::matrix::ModelTarget;
use crate::inference::eval::toolcall::score::verdict_passed;
use crate::inference::eval::toolcall::tasks::ToolTask;
use crate::persistence::eval_history::RunSummary;
use serde::Serialize;
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
#[derive(Serialize, Clone, Debug, PartialEq)]
pub struct AggAgentic {
    pub passes: u32,
    pub total_runs: u32,
    pub avg_steps: Option<f64>,
    pub avg_output_tokens_success: Option<f64>,
    pub top_error: TopError,
}

/// One model's row in the Matrix Scoreboard: single-turn report and/or agentic
/// aggregate (whichever the collection contained), or the error it hit.
#[derive(Serialize, Clone, Debug, PartialEq)]
pub struct BatchColumn {
    pub model: String,
    pub backend: BackendKind,
    pub toolcall: Option<ToolCallReport>,
    pub agentic: Option<AggAgentic>,
    pub error: Option<String>,
}

/// The full batch result: one column per target model.
#[derive(Serialize, Clone, Debug, PartialEq)]
pub struct BatchReport {
    pub collection_id: String,
    pub columns: Vec<BatchColumn>,
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
    let (mut il, mut ha, mut mj) = (0u32, 0u32, 0u32);
    for r in reports {
        il += r.failures.infinite_loop_hits;
        ha += r.failures.hallucinated_completions;
        mj += r.failures.malformed_json_calls;
    }
    let top_error = [(il, TopError::InfiniteLoop), (ha, TopError::Hallucinated), (mj, TopError::MalformedJson)]
        .into_iter()
        .fold((0u32, TopError::None), |best, (n, e)| if n > best.0 { (n, e) } else { best })
        .1;
    let steps: Vec<f64> = reports.iter().filter_map(|r| r.avg_steps).collect();
    let eff: Vec<f64> = reports.iter().filter_map(|r| r.avg_output_tokens_success).collect();
    AggAgentic {
        passes: reports.iter().map(|r| r.passes).sum(),
        total_runs: reports.iter().map(|r| r.total_runs).sum(),
        avg_steps: mean_f64(&steps),
        avg_output_tokens_success: mean_f64(&eff),
        top_error,
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
            error: col_error,
        });
    }
    Ok(BatchReport { collection_id: collection_id.to_string(), columns })
}

#[cfg(test)]
#[path = "batch_tests.rs"]
mod tests;
