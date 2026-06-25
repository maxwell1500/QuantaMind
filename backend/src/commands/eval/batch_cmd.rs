use crate::commands::emit::log_emit;
use crate::commands::eval::batch_payloads::{
    AgenticStepPayload, BatchCompletePayload, BatchProgress, EVENT_AGENTIC_STEP, EVENT_BATCH_COMPLETE,
    EVENT_BATCH_PROGRESS,
};
use crate::commands::eval::toolcall_cmd::endpoint_for;
use crate::commands::prompt::prompt_options::{to_generate_options, validate_params};
use crate::errors::AppError;
use crate::inference::backend::backend_kind::BackendKind;
use crate::inference::eval::agentic::difficulty::passk::{max_tokens_for, pass_k_for};
use crate::inference::eval::agentic::model_turn::{BackendTurn, NativeOllamaTurn};
use crate::inference::eval::agentic::sandbox::EndStateRule;
use crate::inference::eval::agentic::spec::Tier;
use crate::inference::eval::toolcall::prompt::TerminalGuidance;
use crate::inference::eval::agentic::step::TrajectoryStep;
use crate::inference::eval::batch::{
    batch_summaries, fold_report, run_batch_resumable, run_native_fc_pass, AggAgentic, BatchColumn, BatchReport,
    BatchSink, CompletedUnit, OllamaVramGate, TaskOutcome,
};
use crate::inference::eval::toolcall::matrix::ModelTarget;
use crate::inference::eval::toolcall::tasks::{validate_tasks, ToolTask};
use crate::inference::ollama::ollama_show::{probe_ollama_version, probe_supports_tools};
use crate::persistence::eval_history;
use crate::persistence::jobs::queue::{self, RunConfig};
use crate::persistence::prompts::schema::InferenceParams;
use crate::persistence::readiness::reports;
use crate::sync::MutexExt;
use serde::Serialize;
use std::collections::{HashMap, HashSet};
use std::path::PathBuf;
use std::sync::{Arc, Mutex};
use tauri::{AppHandle, Manager};
use tokio_util::sync::CancellationToken;

/// Where the resumable job logs live (`app_config_dir/jobs/<run_id>.jsonl`).
fn jobs_dir(app: &AppHandle) -> Result<PathBuf, AppError> {
    let dir = app.path().app_config_dir().map_err(|e| AppError::Io(e.to_string()))?;
    Ok(dir.join("jobs"))
}

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
    fn agentic_turn(&self, model: &str, task_id: &str, step: &TrajectoryStep, is_native: bool) {
        log_emit(&self.app, EVENT_AGENTIC_STEP, AgenticStepPayload {
            model: model.into(), task_id: task_id.into(), step: step.clone(), is_native,
        });
    }
    fn task_done(&self, model: &str, task_id: &str, outcome: &TaskOutcome) {
        log_emit(&self.app, EVENT_BATCH_PROGRESS, BatchProgress::Done {
            model: model.into(), task_id: task_id.into(), outcome: outcome.clone(),
        });
    }
}

/// An empty report with one column per target (all metrics `None`). The native pass runs FIRST
/// and fills `agentic_native_fc` on this skeleton; the prompt pass then produces the real report
/// and we merge the native aggregates in. Lets the native column surface before the prompt pass.
fn skeleton_report(collection_id: &str, targets: &[ModelTarget]) -> BatchReport {
    BatchReport {
        collection_id: collection_id.to_string(),
        num_ctx: None,
        ollama_version: None,
        columns: targets
            .iter()
            .map(|t| BatchColumn {
                model: t.model.clone(),
                backend: t.backend,
                toolcall: None,
                agentic: None,
                agentic_native_fc: None,
                error: None,
                is_thinking: t.is_thinking,
            })
            .collect(),
    }
}

/// Apply the run-time difficulty / K / Max-Steps / decoy overrides to every agentic
/// task — the UI controls override the persisted per-task spec. Non-agentic tasks are
/// untouched.
///
/// `tier` set (a chosen tier or `Auto`) stamps `spec.tier` and, when the UI sends no
/// explicit `k`, derives the locked Pass^k via `pass_k_for(tier)` and stamps it onto
/// the spec so the run matches the locked display exactly (an authored per-task `k`
/// no longer silently wins). An explicit `k` (the `Custom` escape hatch) always wins.
/// `decoy_tools` set rewrites each spec's `axes.decoy_tools`; `None` leaves the
/// task-authored decoys intact.
/// The hardest tier among the agentic tasks — the source of truth for the tier-scaled
/// thinking token budget. Reads each task's own `agentic.tier` (set by authoring or by
/// `apply_overrides`), the SAME source `sandbox_for` uses for `max_steps`, so the budget can
/// never disagree with the step budget. Robust to the UI tier being `Auto`/unset (which would
/// otherwise default Hard/Medium/Extreme tasks to Easy's cap). The hardest tier present is a
/// safe choice for a mixed collection: `num_predict` is only a cap, so an easier task is
/// never harmed by a larger ceiling. `Easy` when no task carries an agentic tier.
fn effective_tier(tasks: &[ToolTask]) -> Tier {
    tasks.iter().filter_map(|t| t.agentic.as_ref().map(|a| a.tier)).max().unwrap_or(Tier::Easy)
}

fn apply_overrides(
    mut tasks: Vec<ToolTask>,
    k: Option<u32>,
    max_steps: Option<u32>,
    tier: Option<Tier>,
    decoy_tools: Option<u32>,
) -> Vec<ToolTask> {
    for t in &mut tasks {
        if let Some(spec) = t.agentic.as_mut() {
            if let Some(tier) = tier {
                spec.tier = tier;
            }
            // Explicit UI `k` wins; otherwise a chosen tier derives the locked `k`.
            if let Some(k) = k {
                spec.k = Some(k);
            } else if let Some(tier) = tier {
                spec.k = Some(pass_k_for(tier));
            }
            if max_steps.is_some() {
                spec.max_steps = max_steps;
            }
            if let Some(n) = decoy_tools {
                spec.axes.get_or_insert_with(Default::default).decoy_tools = n;
            }
        }
    }
    tasks
}

/// Floor (seconds) the eval batch pins the model resident for. An agentic task fires
/// ~k × max_steps sequential generate calls; with `keep_alive` unset Ollama's default
/// 5-min idle unload can fire across an inter-task/inter-turn gap, evicting the model
/// AND its prefix-KV cache mid-run (a cold reload then charges as a stall). This floor
/// keeps `warm_up()` (which honors the same field) pinned across the whole batch.
const AGENTIC_KEEP_ALIVE_SECS: i32 = 600;

/// The batch `keep_alive`: an explicit UI value (incl. `-1` = forever, or a smaller
/// override) always wins; otherwise apply the resident floor so the cache survives.
fn agentic_keep_alive(configured: Option<i32>) -> Option<i32> {
    configured.or(Some(AGENTIC_KEEP_ALIVE_SECS))
}

/// The single streaming eval command: validate, write the resumable job-queue
/// header, then run the prompt (+ optional native) passes as a crash-resumable
/// queue with the VRAM-isolation gate. Crosses the IPC boundary once.
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
    tier: Option<Tier>,
    decoy_tools: Option<u32>,
) -> Result<BatchReport, AppError> {
    validate_tasks(&tasks)?;
    if let Some(p) = &params {
        validate_params(p)?;
    }
    let config = RunConfig {
        collection_id: collection_id.clone(),
        targets,
        tasks,
        k,
        max_steps,
        params,
        keep_alive,
        native: run_native_fc.unwrap_or(false),
        tier,
        decoy_tools,
    };
    // Start a fresh job log (header only) — a leftover log means an interrupted run.
    queue::create(&queue::run_path(&jobs_dir(&app)?, &collection_id), &config)?;
    run_passes(&app, &state, &config, &[]).await
}

/// Run the prompt + optional native passes for `config`, resuming over `prior`
/// completed units and appending every new unit to the job log. Shared by a fresh
/// run (`prior = &[]`) and `resume_batch_eval`. On success: **transactional finish**
/// — save the report, verify it persisted, and only THEN delete the recovery log.
/// A VRAM-gate `Err` propagates (halts) with the log intact for a later resume.
pub(crate) async fn run_passes(
    app: &AppHandle,
    state: &tauri::State<'_, BatchRunState>,
    config: &RunConfig,
    prior: &[CompletedUnit],
) -> Result<BatchReport, AppError> {
    let options = config.params.as_ref().map(to_generate_options);
    let cancel = CancellationToken::new();
    {
        let mut g = state.cancel.lock_recover();
        if let Some(prev) = g.take() {
            prev.cancel();
        }
        *g = Some(cancel.clone());
    }
    let tasks = apply_overrides(config.tasks.clone(), config.k, config.max_steps, config.tier, config.decoy_tools);
    let sink: Arc<dyn BatchSink> = Arc::new(TauriBatchSink { app: app.clone() });
    let job_path = queue::run_path(&jobs_dir(app)?, &config.collection_id);
    let rec_path = job_path.clone();
    let record = move |u: &CompletedUnit| {
        let _ = queue::append(&rec_path, u); // durable save; best-effort vs the run
    };

    let turn_cancel = cancel.clone();
    let native_cancel = cancel.clone();
    let native_options = options.clone();
    let keep_alive = agentic_keep_alive(config.keep_alive);
    // The per-turn token budget is tier-scaled, so resolve the effective tier from the
    // (override-applied) TASKS — see `effective_tier`. NOT the UI `config.tier`, which is
    // often `Auto` (→ `None`) and would collapse every tier to Easy's cap.
    let tier = effective_tier(&tasks);

    // Native (tool-calling) pass FIRST — so a slow native run streams to the UI immediately
    // instead of waiting out the whole prompt pass. It fills `agentic_native_fc` on a column
    // skeleton; the prompt pass runs next and we merge the native aggregates into its report.
    let native_aggs: HashMap<String, AggAgentic> = if config.native {
        let endpoint = endpoint_for(BackendKind::Ollama);
        let mut supported = HashSet::new();
        for t in &config.targets {
            if t.backend == BackendKind::Ollama && probe_supports_tools(&endpoint, &t.model).await {
                supported.insert(t.model.clone());
            }
        }
        let mut skeleton = skeleton_report(&config.collection_id, &config.targets);
        run_native_fc_pass(
            &mut skeleton,
            &tasks,
            &supported,
            native_cancel,
            |model, task| {
                // Gate the native system's answer-delivery mandate on act-vs-abstain, exactly
                // like the prompt path (runner.rs) — so a native model on an ACT task is told to
                // call the reporter tool, not nudged into prose (an unfair ReportedInProse).
                let terminal = match task.agentic.as_ref().map(|s| &s.end_state) {
                    Some(EndStateRule::RequireAll(_)) | Some(EndStateRule::RequireSequence(_)) => {
                        TerminalGuidance::MustUseTools
                    }
                    _ => TerminalGuidance::PlainTextOk,
                };
                NativeOllamaTurn {
                    endpoint: endpoint.clone(),
                    model: model.to_string(),
                    tools: task.tools.clone(),
                    options: native_options.clone(),
                    terminal,
                }
            },
            prior,
            &record,
            &OllamaVramGate,
            sink.clone(),
        )
        .await?; // a gate Err halts; per-task run errors are swallowed inside
        // Surface the native column right away (before the prompt pass fills the rest). NOT
        // final — the prompt pass is still to come, so the UI keeps showing "running".
        log_emit(app, EVENT_BATCH_COMPLETE, BatchCompletePayload { report: skeleton.clone(), r#final: false });
        skeleton.columns.into_iter().filter_map(|c| c.agentic_native_fc.map(|a| (c.model, a))).collect()
    } else {
        HashMap::new()
    };

    // Prompt pass.
    let mut report = run_batch_resumable(
        &config.collection_id,
        &config.targets,
        &tasks,
        cancel,
        sink.clone(),
        move |t: &ModelTarget| BackendTurn {
            backend: t.backend,
            endpoint: endpoint_for(t.backend),
            model: t.model.clone(),
            cancel: turn_cancel.clone(),
            options: options.clone(),
            keep_alive,
            is_thinking: t.is_thinking,
            max_tokens: max_tokens_for(tier, t.is_thinking),
            stop_cache: Default::default(),
        },
        prior,
        &record,
        &OllamaVramGate,
    )
    .await?;
    // Merge the native aggregates (collected before the prompt pass) into its columns.
    for col in &mut report.columns {
        if let Some(a) = native_aggs.get(&col.model) {
            col.agentic_native_fc = Some(a.clone());
        }
    }
    report.num_ctx = config.params.as_ref().and_then(|p| p.num_ctx);
    // Stamp the running Ollama version so a native tool-calling regression on a version bump is
    // diagnosable (the honest garbled/foreign verdict reads as "at Ollama vX"). Best-effort.
    report.ollama_version = probe_ollama_version(&endpoint_for(BackendKind::Ollama)).await;
    log_emit(app, EVENT_BATCH_COMPLETE, BatchCompletePayload { report: report.clone(), r#final: true });

    if let Ok(dir) = history_dir(app) {
        let entries = batch_summaries(&report, &crate::time_iso::now_utc());
        if !entries.is_empty() {
            let _ = eval_history::append(&dir, &config.collection_id, &entries);
        }
    }

    // Transactional finish: persist → verify on disk → only THEN delete the log,
    // so a crash between save and delete can never lose the whole run.
    let reports_d = reports_dir(app)?;
    reports::save(&reports_d, &report)?;
    if reports::load(&reports_d, &config.collection_id)?.is_none() {
        return Err(AppError::Io("batch report did not persist — keeping the resumable job log".into()));
    }
    let _ = queue::delete(&job_path);
    Ok(report)
}

#[tauri::command]
pub fn stop_batch_eval(state: tauri::State<'_, BatchRunState>) -> Result<(), AppError> {
    if let Some(t) = state.cancel.lock_recover().take() {
        t.cancel();
    }
    Ok(())
}

// ── Crash-recovery: detect / resume / discard an interrupted run ──────────────

/// A leftover (interrupted) run the user can resume or discard.
#[derive(Serialize)]
pub struct UnfinishedRun {
    pub run_id: String,
    pub collection_id: String,
    pub done: usize,
    pub total: usize,
}

/// Upper bound on a run's units — prompt (targets × tasks) plus, when native is
/// on, the agentic tasks on each Ollama target (the only ones that get a native run).
fn total_units(c: &RunConfig) -> usize {
    let prompt = c.targets.len() * c.tasks.len();
    let native = if c.native {
        let ollama = c.targets.iter().filter(|t| t.backend == BackendKind::Ollama).count();
        let agentic = c.tasks.iter().filter(|t| t.category == "agentic").count();
        ollama * agentic
    } else {
        0
    };
    prompt + native
}

/// On app mount: is there an interrupted run to recover? Returns the first leftover
/// job log's collection + progress (a leftover `.jsonl` == an interrupted run).
#[tauri::command]
pub fn check_unfinished_run(app: AppHandle) -> Result<Option<UnfinishedRun>, AppError> {
    for path in queue::list_paths(&jobs_dir(&app)?)? {
        if let Some((config, units)) = queue::load(&path)? {
            return Ok(Some(UnfinishedRun {
                run_id: config.collection_id.clone(),
                collection_id: config.collection_id.clone(),
                done: units.len(),
                total: total_units(&config),
            }));
        }
    }
    Ok(None)
}

/// Resume an interrupted run: rebuild the completed units into ONE partial
/// `BatchReport`, emit it once (bulk rehydration — paints the Matrix instantly
/// without flooding the IPC bridge), then continue the live run, skipping the
/// completed units (prompt AND native).
#[tauri::command]
pub async fn resume_batch_eval(
    app: AppHandle,
    state: tauri::State<'_, BatchRunState>,
    run_id: String,
) -> Result<BatchReport, AppError> {
    let path = queue::run_path(&jobs_dir(&app)?, &run_id);
    let Some((config, units)) = queue::load(&path)? else {
        return Err(AppError::NotFound(format!("no interrupted run to resume for '{run_id}'")));
    };
    let partial = fold_report(&config.collection_id, &config.targets, &config.tasks, &units);
    // Partial replay before resuming — NOT final, run_passes emits the real final complete.
    log_emit(&app, EVENT_BATCH_COMPLETE, BatchCompletePayload { report: partial, r#final: false });
    run_passes(&app, &state, &config, &units).await
}

/// Throw away an interrupted run's log (Discard).
#[tauri::command]
pub fn discard_run(app: AppHandle, run_id: String) -> Result<(), AppError> {
    queue::delete(&queue::run_path(&jobs_dir(&app)?, &run_id))
}

#[cfg(test)]
mod override_tests {
    use super::*;
    use crate::inference::eval::agentic::sandbox::EndStateRule;
    use crate::inference::eval::agentic::spec::{AgenticSpec, DifficultyAxes};

    fn agentic(id: &str, k: Option<u32>, tier: Tier, axes: Option<DifficultyAxes>) -> ToolTask {
        ToolTask {
            id: id.into(),
            category: "agentic".into(),
            prompt: "p".into(),
            tools: vec![],
            expected: Default::default(),
            agentic: Some(AgenticSpec {
                mocks: vec![],
                end_state: EndStateRule::ExpectAbstainingText,
                tier,
                axes,
                k,
                max_steps: None,
                faults: vec![],
                max_recovery: None,
                must_not_call: vec![],
                world_state: None,
                name_faults: vec![],
                generated: false,
                entity_tools: vec![],
                recognized_tools: vec![],
            }),
        }
    }

    fn single(id: &str) -> ToolTask {
        ToolTask {
            id: id.into(),
            category: "single".into(),
            prompt: "p".into(),
            tools: vec![],
            expected: Default::default(),
            agentic: None,
        }
    }

    fn spec(t: &ToolTask) -> &AgenticSpec {
        t.agentic.as_ref().unwrap()
    }

    #[test]
    fn tier_sets_tier_and_derives_locked_k_overriding_authored_k() {
        // Authored k=3 must yield to the tier-derived k so the run matches the locked
        // display (authored per-task k no longer silently wins under a chosen tier).
        let tasks = apply_overrides(vec![agentic("a", Some(3), Tier::Easy, None)], None, None, Some(Tier::Hard), None);
        let s = spec(&tasks[0]);
        assert_eq!(s.tier, Tier::Hard);
        assert_eq!(s.k, Some(pass_k_for(Tier::Hard))); // 16
    }

    #[test]
    fn explicit_k_wins_over_the_tier_derived_value() {
        // Custom escape hatch: an explicit UI k beats the tier policy.
        let tasks = apply_overrides(vec![agentic("a", None, Tier::Easy, None)], Some(7), None, Some(Tier::Extreme), None);
        assert_eq!(spec(&tasks[0]).k, Some(7));
    }

    #[test]
    fn decoy_tools_sets_axes_creating_default_axes_when_absent() {
        let tasks = apply_overrides(vec![agentic("a", None, Tier::Easy, None)], None, None, None, Some(4));
        assert_eq!(spec(&tasks[0]).axes.as_ref().unwrap().decoy_tools, 4);
    }

    #[test]
    fn no_overrides_leaves_the_authored_spec_intact() {
        let axes = DifficultyAxes { decoy_tools: 2, ..Default::default() };
        let tasks = apply_overrides(vec![agentic("a", Some(9), Tier::Medium, Some(axes))], None, None, None, None);
        let s = spec(&tasks[0]);
        assert_eq!(s.tier, Tier::Medium);
        assert_eq!(s.k, Some(9));
        assert_eq!(s.axes.as_ref().unwrap().decoy_tools, 2);
    }

    #[test]
    fn non_agentic_tasks_are_untouched() {
        let tasks = apply_overrides(vec![single("s")], Some(5), Some(8), Some(Tier::Hard), Some(3));
        assert!(tasks[0].agentic.is_none());
    }

    #[test]
    fn effective_tier_reads_the_tasks_real_tier_even_when_the_ui_tier_is_auto() {
        use crate::inference::eval::agentic::difficulty::passk::max_tokens_for;
        // The bug: a bundled Hard collection run with the tier dropdown on Auto (→ None) used
        // to budget every task at Easy's cap. With no UI override, each task keeps its
        // authored tier, and the effective tier must be that — NOT Easy.
        let tasks = apply_overrides(vec![agentic("a", None, Tier::Hard, None)], None, None, None, None);
        assert_eq!(effective_tier(&tasks), Tier::Hard);
        // And it composes to the right thinking budget (the symptom the user saw).
        assert_eq!(max_tokens_for(effective_tier(&tasks), true), 3072);
    }

    #[test]
    fn effective_tier_takes_the_hardest_tier_in_a_mixed_collection() {
        let tasks = vec![
            agentic("a", None, Tier::Easy, None),
            agentic("b", None, Tier::Extreme, None),
            single("s"),
        ];
        assert_eq!(effective_tier(&tasks), Tier::Extreme);
    }

    #[test]
    fn effective_tier_is_easy_when_no_task_is_agentic() {
        assert_eq!(effective_tier(&[single("s")]), Tier::Easy);
    }

    #[test]
    fn keep_alive_floors_when_unset_and_honors_an_explicit_override() {
        // Unset → the resident floor pins the model across the batch.
        assert_eq!(agentic_keep_alive(None), Some(AGENTIC_KEEP_ALIVE_SECS));
        // Explicit values win — forever, or a deliberately shorter window.
        assert_eq!(agentic_keep_alive(Some(-1)), Some(-1));
        assert_eq!(agentic_keep_alive(Some(30)), Some(30));
    }
}
