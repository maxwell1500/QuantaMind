use crate::errors::AppResult;
use crate::inference::backend::backend_kind::BackendKind;
use crate::inference::backend::endpoint;
use crate::inference::eval::agentic::build::sandbox_for;
use crate::inference::eval::agentic::model_turn::ModelTurn;
use crate::inference::eval::agentic::sandbox::DeterministicSandbox;
use crate::inference::eval::agentic::scoring::report::{AgenticReport, FailureTracker, TopError};
use crate::inference::eval::agentic::runner::{run_agentic_with, AgenticConfig};
use crate::inference::eval::agentic::spec::Tier;
use crate::inference::eval::agentic::step::TrajectoryStep;
use crate::inference::eval::agentic::v2::generator;
use crate::inference::eval::toolcall::eval::{aggregate, trace_one_with, TaskResult, ToolCallReport, TraceResult};
use crate::inference::eval::toolcall::matrix::ModelTarget;
use crate::inference::eval::toolcall::score::verdict_passed;
use crate::inference::eval::toolcall::tasks::{is_agentic, ToolTask};
use crate::inference::ollama::ollama::force_unload;
use crate::persistence::eval_history::RunSummary;
use serde::{Deserialize, Serialize};
use std::collections::HashMap;
use std::sync::Arc;
use tokio::sync::mpsc::unbounded_channel;
use tokio_util::sync::CancellationToken;

/// The per-task outcome streamed to the UI and cached for the trace debugger.
/// `Deserialize` so the resumable job queue can reload a completed unit's outcome.
#[derive(Serialize, Deserialize, Clone, Debug)]
#[serde(tag = "kind", rename_all = "snake_case")]
pub enum TaskOutcome {
    Single { passed: bool, trace: TraceResult },
    Agentic { report: AgenticReport },
    Error { message: String },
}

/// One finished (model, task) unit — the durable result the resumable queue
/// appends and reloads. `is_native` tags the parallel native-FC pass. Lives in
/// `inference` (not `persistence`) so the run loop can fold it without `inference`
/// importing the persistence queue (the queue imports this, not the reverse).
#[derive(Serialize, Deserialize, Clone, Debug)]
pub struct CompletedUnit {
    pub model: String,
    pub task_id: String,
    pub category: String,
    pub outcome: TaskOutcome,
    pub is_native: bool,
}

/// The VRAM-isolation gate: evict the previous model and assert its VRAM cleared
/// before the next loads. Injected (not a hardcoded call) so the run loop is
/// testable without live HTTP. An `Err` from `unload` is the hard halt.
#[allow(async_fn_in_trait)]
pub trait VramGate {
    async fn unload(&self, model: &str) -> AppResult<()>;
}

/// No isolation (tests / single-model runs).
pub struct NoVramGate;
impl VramGate for NoVramGate {
    async fn unload(&self, _model: &str) -> AppResult<()> {
        Ok(())
    }
}

/// Production gate: Ollama `keep_alive:0` + poll `/api/ps` until VRAM is 0
/// (assert-and-fail). The only gate that touches hardware.
pub struct OllamaVramGate;
impl VramGate for OllamaVramGate {
    async fn unload(&self, model: &str) -> AppResult<()> {
        force_unload(endpoint::OLLAMA, model).await
    }
}

/// Fold a reloaded completed unit straight into a model's accumulators on resume —
/// no re-run, no `task_done` replay (the Matrix is repainted in bulk upstream).
fn fold_completed(
    unit: &CompletedUnit,
    task: &ToolTask,
    single_tasks: &mut Vec<ToolTask>,
    single_results: &mut Vec<TaskResult>,
    agentic_reports: &mut Vec<AgenticReport>,
    col_error: &mut Option<String>,
) {
    match &unit.outcome {
        TaskOutcome::Agentic { report } => agentic_reports.push(report.clone()),
        TaskOutcome::Single { trace, .. } => {
            single_tasks.push(task.clone());
            single_results.push(TaskResult {
                id: task.id.clone(),
                category: task.category.clone(),
                verdict: trace.verdict.clone(),
                prompt_tokens: trace.prompt_tokens,
            });
        }
        TaskOutcome::Error { message } => *col_error = Some(message.clone()),
    }
}

/// Streaming surface for a batch run. The command layer implements this to
/// `app.emit()` progress; the engine stays Tauri-free. `Send + Sync` so the
/// agentic per-turn pump can forward from a spawned task.
pub trait BatchSink: Send + Sync {
    fn task_started(&self, model: &str, task_id: &str, index: usize, total: usize, category: &str);
    fn agentic_turn(&self, model: &str, task_id: &str, step: &TrajectoryStep);
    fn task_done(&self, model: &str, task_id: &str, outcome: &TaskOutcome);
}

/// Phase 9: a model's strict Pass^k within ONE difficulty tier. `by_tier` carries
/// these so the readiness gate can derive the highest tier the model actually
/// cleared (`pass_k() >= profile.min_pass_k`).
#[derive(Serialize, Deserialize, Clone, Debug, PartialEq)]
pub struct TierStat {
    pub tier: Tier,
    pub tasks_passed: u32,
    pub tasks_total: u32,
    /// Phase 9B: mean steps across this tier's runs — the Agent Report's Tier Progression
    /// Matrix reads it. `None` when no run produced steps. `#[serde(default)]` for back-compat.
    #[serde(default)]
    pub avg_steps: Option<f64>,
    /// Phase 9B: failure breakdown summed within this tier — the Failure Taxonomy reads it
    /// per tier. `#[serde(default)]` so pre-9B reports (no per-tier failures) still load.
    #[serde(default)]
    pub failures: FailureTracker,
}

impl TierStat {
    /// Strict Pass^k within this tier, or `None` when the tier had no task.
    pub fn pass_k(&self) -> Option<f64> {
        (self.tasks_total > 0).then(|| self.tasks_passed as f64 / self.tasks_total as f64)
    }
}

/// Per-model aggregate of the collection's agentic tasks: Pass^k, mean
/// steps/effort, dominant failure. Null metrics render "N/A", never fabricated.
///
/// Pass^k semantics (spec §3.3): a task is credited only when **all k of its runs
/// succeed** — reliability compounds, so a model that passes 3/5 on a task is not
/// "60% reliable", it is unreliable. `tasks_passed`/`tasks_total` carry that strict
/// metric; `passes`/`total_runs` keep the run-level sums for the secondary per-run
/// rate (pass@k) shown alongside the Partial badge.
#[derive(Serialize, Deserialize, Clone, Debug, PartialEq)]
pub struct AggAgentic {
    /// Tasks where every one of the k runs reached the end state (strict Pass^k numerator).
    #[serde(default)]
    pub tasks_passed: u32,
    /// Agentic tasks aggregated into this column (strict Pass^k denominator).
    #[serde(default)]
    pub tasks_total: u32,
    /// Run-level sums across all tasks — the secondary per-run rate (pass@k), NOT the headline.
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
    /// Phase 9: per-tier strict Pass^k breakdown (sorted ascending by tier). Empty
    /// for pre-Phase-9 reports. The readiness gate reads this to compute the highest
    /// difficulty tier the model cleared. `#[serde(default)]` for back-compat.
    #[serde(default)]
    pub by_tier: Vec<TierStat>,
}

impl AggAgentic {
    /// Strict Pass^k: fraction of tasks whose every run succeeded. `None` when no
    /// task was aggregated (the row then renders "N/A", never a fabricated 0).
    pub fn pass_k(&self) -> Option<f64> {
        (self.tasks_total > 0).then(|| self.tasks_passed as f64 / self.tasks_total as f64)
    }
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
                pass_k: ag.and_then(|a| a.pass_k()),
                agentic_avg_steps: ag.and_then(|a| a.avg_steps),
                effort: ag.and_then(|a| a.avg_output_tokens_success),
            }
        })
        .collect()
}

fn agg_agentic(reports: &[AgenticReport]) -> AggAgentic {
    let mut failures = FailureTracker::default();
    for r in reports {
        failures.merge(&r.failures); // centralized — never drops a field (e.g. unknown/forbidden)
    }
    let top_error = failures.top();
    let steps: Vec<f64> = reports.iter().filter_map(|r| r.avg_steps).collect();
    let eff: Vec<f64> = reports.iter().filter_map(|r| r.avg_output_tokens_success).collect();
    let resil: Vec<f64> = reports.iter().filter_map(|r| r.schema_resilience).collect();
    // Phase 9 (Gap 2): bucket strict Pass^k by tier. A HashMap keeps this generic
    // over whatever tiers exist (no hardcoded per-tier arms); the output is sorted
    // by tier so the readiness gate can walk it highest-first.
    let mut buckets: HashMap<Tier, Vec<&AgenticReport>> = HashMap::new();
    for r in reports {
        buckets.entry(r.tier).or_default().push(r);
    }
    let mut by_tier: Vec<TierStat> = buckets
        .into_iter()
        .map(|(tier, rs)| {
            // Phase 9B: per-tier avg steps + failures, computed exactly like the overall
            // fields but scoped to this tier's bucket (the Agent Report renders both).
            let tier_steps: Vec<f64> = rs.iter().filter_map(|r| r.avg_steps).collect();
            let mut tier_failures = FailureTracker::default();
            for r in &rs {
                tier_failures.merge(&r.failures);
            }
            TierStat {
                tier,
                tasks_passed: rs.iter().filter(|r| r.total_runs > 0 && r.passes == r.total_runs).count() as u32,
                tasks_total: rs.len() as u32,
                avg_steps: mean_f64(&tier_steps),
                failures: tier_failures,
            }
        })
        .collect();
    by_tier.sort_by_key(|s| s.tier);
    AggAgentic {
        tasks_passed: reports.iter().filter(|r| r.total_runs > 0 && r.passes == r.total_runs).count() as u32,
        tasks_total: reports.len() as u32,
        passes: reports.iter().map(|r| r.passes).sum(),
        total_runs: reports.iter().map(|r| r.total_runs).sum(),
        avg_steps: mean_f64(&steps),
        avg_output_tokens_success: mean_f64(&eff),
        schema_resilience: mean_f64(&resil),
        top_error,
        failures,
        by_tier,
    }
}

/// The difficulty tier a task declares (Easy for a single-turn or pre-Phase-9 task).
fn task_tier(task: &ToolTask) -> Tier {
    task.agentic.as_ref().map(|a| a.tier).unwrap_or_default()
}

/// Run one agentic task, forwarding its live `TrajectoryStep`s to the sink as
/// they arrive (a spawned pump drains the channel concurrently with the run).
async fn run_one_agentic<M: ModelTurn + Send + Sync>(
    turn: &M,
    task: &ToolTask,
    model: &str,
    cancel: &CancellationToken,
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
    let result = run_agentic_for(turn, task, model, &sandbox, cfg, cancel, &tx).await;
    drop(tx);
    let _ = pump.await;
    result.map(|r| r.with_tier(task_tier(task)))
}

/// Drive Pass^k for a task: a `generated` task builds a FRESH procedural instance
/// per run (seeded by model + run_index → contamination resistance); a static task
/// reuses the one `sandbox`. The shared seam both run paths (streaming + native FC)
/// call so generation behaves identically in each.
async fn run_agentic_for<M: ModelTurn>(
    turn: &M,
    task: &ToolTask,
    model: &str,
    sandbox: &DeterministicSandbox,
    cfg: AgenticConfig,
    cancel: &CancellationToken,
    tx: &tokio::sync::mpsc::UnboundedSender<TrajectoryStep>,
) -> AppResult<AgenticReport> {
    let generated = task.agentic.as_ref().map(|s| s.generated).unwrap_or(false);
    run_agentic_with(
        turn,
        cfg.k,
        |run_index| {
            if generated {
                let inst = generator::instantiate(task, generator::seed_for(model, run_index));
                let (sb, c) = sandbox_for(&inst)?;
                Ok((sb, c.max_steps, c.max_recovery))
            } else {
                Ok((sandbox.clone(), cfg.max_steps, cfg.max_recovery))
            }
        },
        cancel,
        tx,
    )
    .await
}

/// The non-resumable dispatcher (tests, no hardware gate): a thin wrapper over
/// `run_batch_resumable` with no prior units, a no-op recorder, and VRAM isolation
/// off — byte-identical to the pre-7.5 behaviour.
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
    run_batch_resumable(collection_id, targets, tasks, cancel, sink, make_turn, &[], &|_| {}, &NoVramGate).await
}

/// The VRAM-safe, **resumable** sequential dispatcher. For each target model:
/// (1) the **VRAM-isolation gate** unloads the previous Ollama model and asserts
/// its VRAM cleared before this one loads — an `Err` here propagates and **halts**
/// the run with the job log intact (never loads onto dirty VRAM); (2) every task
/// runs in order — a unit already in `prior` is **folded silently** (no re-run, no
/// `task_done` replay), others run, stream through `sink`, and are handed to
/// `record` (the durable append). ONE model runs ONE task at a time.
#[allow(clippy::too_many_arguments)]
pub async fn run_batch_resumable<M, F, G>(
    collection_id: &str,
    targets: &[ModelTarget],
    tasks: &[ToolTask],
    cancel: CancellationToken,
    sink: Arc<dyn BatchSink>,
    make_turn: F,
    prior: &[CompletedUnit],
    record: &(dyn Fn(&CompletedUnit) + Sync),
    gate: &G,
) -> AppResult<BatchReport>
where
    M: ModelTurn + Send + Sync,
    F: Fn(&ModelTarget) -> M,
    G: VramGate,
{
    // Completed prompt-pass units, keyed by (model, task) — skipped on resume.
    let done: HashMap<(&str, &str), &CompletedUnit> = prior
        .iter()
        .filter(|u| !u.is_native)
        .map(|u| ((u.model.as_str(), u.task_id.as_str()), u))
        .collect();
    let mut columns = Vec::with_capacity(targets.len());
    let mut prev: Option<(String, BackendKind)> = None;
    for target in targets {
        // VRAM-isolation gate: evict the previous Ollama model and confirm VRAM
        // freed before this model loads. Assert-and-fail — Err halts (log intact).
        if let Some((pm, pb)) = &prev {
            if *pb == BackendKind::Ollama && pm != &target.model {
                gate.unload(pm).await?;
            }
        }
        let turn = make_turn(target);
        // Warm the model resident before its first SCORED task, so cold-load latency
        // (weights into VRAM) isn't charged to that task as a TurnTimeout. Best-effort:
        // a warm-up error isn't fatal — the first real task will surface a genuine fault.
        let _ = turn.warm_up().await;
        let mut single_tasks: Vec<ToolTask> = Vec::new();
        let mut single_results: Vec<TaskResult> = Vec::new();
        let mut agentic_reports: Vec<AgenticReport> = Vec::new();
        let mut col_error: Option<String> = None;

        for (i, task) in tasks.iter().enumerate() {
            if cancel.is_cancelled() {
                break;
            }
            if let Some(unit) = done.get(&(target.model.as_str(), task.id.as_str())) {
                fold_completed(unit, task, &mut single_tasks, &mut single_results, &mut agentic_reports, &mut col_error);
                continue;
            }
            sink.task_started(&target.model, &task.id, i, tasks.len(), &task.category);
            if is_agentic(&task.category) {
                match run_one_agentic(&turn, task, &target.model, &cancel, sink.clone()).await {
                    Ok(report) => {
                        let outcome = TaskOutcome::Agentic { report: report.clone() };
                        record(&unit_of(target, task, outcome.clone(), false));
                        sink.task_done(&target.model, &task.id, &outcome);
                        agentic_reports.push(report);
                    }
                    Err(e) => {
                        // Errors are NOT recorded → they re-run on resume (the backend may be back).
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
                        let outcome = TaskOutcome::Single { passed, trace };
                        record(&unit_of(target, task, outcome.clone(), false));
                        sink.task_done(&target.model, &task.id, &outcome);
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
        prev = Some((target.model.clone(), target.backend));
    }
    // The engine is param-agnostic; the command layer stamps `num_ctx` afterwards.
    Ok(BatchReport { collection_id: collection_id.to_string(), columns, num_ctx: None })
}

/// Build a partial `BatchReport` from already-completed units ONLY — no execution.
/// Used on resume to repaint the Matrix in one payload (bulk rehydration) before
/// the live run continues. Folds both prompt units (agentic/single) and native
/// units (`agentic_native_fc`).
pub fn fold_report(
    collection_id: &str,
    targets: &[ModelTarget],
    tasks: &[ToolTask],
    prior: &[CompletedUnit],
) -> BatchReport {
    let prompt: HashMap<(&str, &str), &CompletedUnit> =
        prior.iter().filter(|u| !u.is_native).map(|u| ((u.model.as_str(), u.task_id.as_str()), u)).collect();
    let native: HashMap<(&str, &str), &CompletedUnit> =
        prior.iter().filter(|u| u.is_native).map(|u| ((u.model.as_str(), u.task_id.as_str()), u)).collect();
    let columns = targets
        .iter()
        .map(|target| {
            let mut single_tasks = Vec::new();
            let mut single_results = Vec::new();
            let mut agentic_reports = Vec::new();
            let mut native_reports = Vec::new();
            let mut col_error = None;
            for task in tasks {
                if let Some(u) = prompt.get(&(target.model.as_str(), task.id.as_str())) {
                    fold_completed(u, task, &mut single_tasks, &mut single_results, &mut agentic_reports, &mut col_error);
                }
                if let Some(u) = native.get(&(target.model.as_str(), task.id.as_str())) {
                    if let TaskOutcome::Agentic { report } = &u.outcome {
                        native_reports.push(report.clone());
                    }
                }
            }
            BatchColumn {
                model: target.model.clone(),
                backend: target.backend,
                toolcall: (!single_results.is_empty()).then(|| aggregate(&single_tasks, single_results)),
                agentic: (!agentic_reports.is_empty()).then(|| agg_agentic(&agentic_reports)),
                agentic_native_fc: (!native_reports.is_empty()).then(|| agg_agentic(&native_reports)),
                error: col_error,
            }
        })
        .collect();
    BatchReport { collection_id: collection_id.to_string(), columns, num_ctx: None }
}

fn unit_of(target: &ModelTarget, task: &ToolTask, outcome: TaskOutcome, is_native: bool) -> CompletedUnit {
    CompletedUnit {
        model: target.model.clone(),
        task_id: task.id.clone(),
        category: task.category.clone(),
        outcome,
        is_native,
    }
}

/// Phase 7.2: measure NATIVE function-calling per model and fold a parallel
/// `agentic_native_fc` aggregate onto each column — the same agentic tasks, the
/// same sandbox/scoring, but driven by `make_native` (Ollama `/api/chat` tools in
/// production, a scripted turn in tests). Only Ollama columns whose model is in
/// `supported` (the capability probe ran upstream) get a native run; others stay
/// `None` (N/A). Native steps aren't streamed to the UI sink in this slice — they
/// drain to a throwaway channel. Best-effort: a native run that errors leaves the
/// column `None` rather than failing the report.
#[allow(clippy::too_many_arguments)]
pub async fn run_native_fc_pass<M, F, G>(
    report: &mut BatchReport,
    tasks: &[ToolTask],
    supported: &std::collections::HashSet<String>,
    cancel: CancellationToken,
    make_native: F,
    prior: &[CompletedUnit],
    record: &(dyn Fn(&CompletedUnit) + Sync),
    gate: &G,
) -> AppResult<()>
where
    M: ModelTurn + Send + Sync,
    F: Fn(&str, &ToolTask) -> M,
    G: VramGate,
{
    let agentic_tasks: Vec<&ToolTask> = tasks.iter().filter(|t| is_agentic(&t.category)).collect();
    if agentic_tasks.is_empty() {
        return Ok(());
    }
    // Completed NATIVE units, keyed by (model, task) — skipped on resume so an
    // overnight native pass resumes where it left off, not from scratch.
    let done: HashMap<(&str, &str), &CompletedUnit> = prior
        .iter()
        .filter(|u| u.is_native)
        .map(|u| ((u.model.as_str(), u.task_id.as_str()), u))
        .collect();
    let mut prev: Option<String> = None; // native is Ollama-only
    for col in report.columns.iter_mut() {
        if cancel.is_cancelled() {
            break;
        }
        if col.backend != BackendKind::Ollama || !supported.contains(&col.model) {
            continue;
        }
        // Same VRAM-isolation gate between native model runs (assert-and-fail).
        if let Some(pm) = &prev {
            if pm != &col.model {
                gate.unload(pm).await?;
            }
        }
        let mut reports: Vec<AgenticReport> = Vec::new();
        for task in &agentic_tasks {
            if cancel.is_cancelled() {
                break;
            }
            if let Some(unit) = done.get(&(col.model.as_str(), task.id.as_str())) {
                if let TaskOutcome::Agentic { report } = &unit.outcome {
                    reports.push(report.clone());
                }
                continue;
            }
            let turn = make_native(&col.model, task);
            let (sandbox, cfg) = sandbox_for(task)?;
            let (tx, mut rx) = unbounded_channel::<TrajectoryStep>();
            let drain = tokio::spawn(async move { while rx.recv().await.is_some() {} });
            let result = run_agentic_for(&turn, task, &col.model, &sandbox, cfg, &cancel, &tx).await;
            drop(tx);
            let _ = drain.await;
            if let Ok(report) = result {
                let report = report.with_tier(task_tier(task));
                record(&CompletedUnit {
                    model: col.model.clone(),
                    task_id: task.id.clone(),
                    category: task.category.clone(),
                    outcome: TaskOutcome::Agentic { report: report.clone() },
                    is_native: true,
                });
                reports.push(report);
            }
        }
        if !reports.is_empty() {
            col.agentic_native_fc = Some(agg_agentic(&reports));
        }
        prev = Some(col.model.clone());
    }
    Ok(())
}

#[cfg(test)]
#[path = "batch_tests.rs"]
mod tests;
