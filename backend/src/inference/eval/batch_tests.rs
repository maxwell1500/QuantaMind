use super::*;
use crate::errors::AppResult;
use crate::inference::backend::backend_kind::BackendKind;
use crate::inference::eval::agentic::model_turn::ModelTurn;
use crate::inference::eval::agentic::sandbox::{EndStateRule, TaskCheckpoint};
use crate::inference::eval::agentic::spec::AgenticSpec;
use crate::inference::eval::toolcall::matrix::ModelTarget;
use crate::inference::eval::toolcall::tasks::{Call, Expected, ToolSchema, ToolTask};
use crate::inference::generate::generate_spec::GenerateSpec;
use crate::inference::generate::generate_stats::GenerateStats;
use serde_json::json;
use std::sync::{Arc, Mutex};
use tokio_util::sync::CancellationToken;

/// A backend-free model that returns one canned reply every turn.
struct ScriptedModel {
    reply: String,
}

impl ModelTurn for ScriptedModel {
    async fn run(&self, _spec: &GenerateSpec) -> AppResult<(String, GenerateStats)> {
        Ok((self.reply.clone(), GenerateStats { eval_count: Some(5), prompt_eval_count: Some(3), ..Default::default() }))
    }
}

fn make_turn(_t: &ModelTarget) -> ScriptedModel {
    ScriptedModel { reply: r#"{"name":"ping","args":{}}"#.into() }
}

#[derive(Default)]
struct CountingSink {
    started: Mutex<Vec<(String, String)>>,
    done: Mutex<u32>,
    turns: Mutex<u32>,
}

impl BatchSink for CountingSink {
    fn task_started(&self, model: &str, task_id: &str, _i: usize, _total: usize, _cat: &str) {
        self.started.lock().unwrap().push((model.into(), task_id.into()));
    }
    fn agentic_turn(&self, _m: &str, _t: &str, _step: &TrajectoryStep) {
        *self.turns.lock().unwrap() += 1;
    }
    fn task_done(&self, _m: &str, _t: &str, _o: &TaskOutcome) {
        *self.done.lock().unwrap() += 1;
    }
}

fn target(model: &str) -> ModelTarget {
    ModelTarget { model: model.into(), backend: BackendKind::Ollama }
}

fn tool(name: &str) -> ToolSchema {
    ToolSchema { name: name.into(), description: "d".into(), parameters: json!({ "type": "object", "properties": {} }) }
}

fn single_task(id: &str) -> ToolTask {
    ToolTask {
        id: id.into(),
        category: "single".into(),
        prompt: "p".into(),
        tools: vec![tool("ping")],
        expected: Expected::Call(Call { name: "ping".into(), args: json!({}) }),
        agentic: None,
    }
}

fn agentic_task(id: &str, k: u32) -> ToolTask {
    ToolTask {
        id: id.into(),
        category: "agentic".into(),
        prompt: "p".into(),
        tools: vec![tool("ping")],
        expected: Default::default(),
        agentic: Some(AgenticSpec {
            mocks: vec![],
            end_state: EndStateRule::RequireSequence(vec![TaskCheckpoint { tool: "ping".into(), args: json!({}) }]),
            k: Some(k),
            max_steps: Some(4),
            faults: vec![],
            max_recovery: None,
        }),
    }
}

#[tokio::test]
async fn sequential_two_models_five_tasks_emits_ten_done_and_one_report() {
    let targets = vec![target("m1"), target("m2")];
    let tasks: Vec<ToolTask> = (0..5).map(|i| single_task(&format!("t{i}"))).collect();
    let sink = Arc::new(CountingSink::default());

    let report = run_batch("c", &targets, &tasks, CancellationToken::new(), sink.clone(), make_turn).await.unwrap();

    assert_eq!(*sink.done.lock().unwrap(), 10); // 2 models × 5 tasks
    assert_eq!(report.columns.len(), 2);

    // Strictly sequential: every m1 task completes before any m2 task starts.
    let started = sink.started.lock().unwrap();
    assert_eq!(started.len(), 10);
    assert!(started[..5].iter().all(|(m, _)| m == "m1"));
    assert!(started[5..].iter().all(|(m, _)| m == "m2"));
}

#[tokio::test]
async fn mixed_collection_streams_agentic_turns_and_aggregates_both() {
    let targets = vec![target("m1")];
    let tasks = vec![single_task("s1"), agentic_task("a1", 3)];
    let sink = Arc::new(CountingSink::default());

    let report = run_batch("c", &targets, &tasks, CancellationToken::new(), sink.clone(), make_turn).await.unwrap();

    assert_eq!(*sink.done.lock().unwrap(), 2);
    assert!(*sink.turns.lock().unwrap() >= 3, "expected ≥1 trajectory step per agentic run (k=3)");

    let col = &report.columns[0];
    assert!(col.toolcall.is_some(), "single-turn report present");
    let agg = col.agentic.as_ref().expect("agentic aggregate present");
    assert_eq!(agg.passes, 3);
    assert_eq!(agg.total_runs, 3);
}

#[tokio::test]
async fn batch_summaries_map_per_model_toolcall_and_agentic_metrics() {
    let targets = vec![target("m1")];
    let tasks = vec![single_task("s1"), agentic_task("a1", 4)];
    let sink = Arc::new(CountingSink::default());
    let report = run_batch("c", &targets, &tasks, CancellationToken::new(), sink, make_turn).await.unwrap();

    let sums = batch_summaries(&report, "2026-06-03T00:00:00Z");
    assert_eq!(sums.len(), 1);
    assert_eq!(sums[0].model, "m1");
    assert_eq!(sums[0].pass_k, Some(1.0)); // agentic a1 passed all 4 runs
    assert!(sums[0].composite.is_some()); // single-turn s1 contributes a composite
}

#[tokio::test]
async fn native_fc_pass_aggregates_into_the_column_for_supported_models_only() {
    let targets = vec![target("m1"), target("m2")];
    let tasks = vec![agentic_task("a1", 3)];
    let sink = Arc::new(CountingSink::default());
    let mut report = run_batch("c", &targets, &tasks, CancellationToken::new(), sink, make_turn).await.unwrap();

    // Only m1 reports the `tools` capability; m2 doesn't → stays N/A.
    let supported: std::collections::HashSet<String> = ["m1".to_string()].into_iter().collect();
    run_native_fc_pass(&mut report, &tasks, &supported, CancellationToken::new(), |_model, _task| {
        ScriptedModel { reply: r#"{"name":"ping","args":{}}"#.into() }
    })
    .await
    .unwrap();

    let m1 = report.columns.iter().find(|c| c.model == "m1").unwrap();
    let m2 = report.columns.iter().find(|c| c.model == "m2").unwrap();
    assert_eq!(m1.agentic_native_fc.as_ref().unwrap().passes, 3); // native ping passes all 3 runs
    assert!(m2.agentic_native_fc.is_none()); // unsupported → never a fabricated native score
}

#[test]
fn agg_agentic_sums_failure_breakdown_not_just_top_error() {
    use crate::inference::eval::agentic::report::{AgenticReport, FailureKind, RunOutcome};
    // Task A loops once; task B hallucinates nine times. `top_error` is Hallucinated
    // (9 > 1), but a `forbid_infinite_loop` verdict must still see the single loop —
    // the gap this aggregate closes.
    let a = AgenticReport::from_outcomes(&[RunOutcome::failure(4, 10, FailureKind::InfiniteLoop)]);
    let b_outcomes: Vec<RunOutcome> =
        (0..9).map(|_| RunOutcome::failure(2, 5, FailureKind::Hallucinated)).collect();
    let b = AgenticReport::from_outcomes(&b_outcomes);

    let agg = agg_agentic(&[a, b]);

    assert_eq!(agg.top_error, TopError::Hallucinated); // headline still the majority mode
    assert_eq!(agg.failures.infinite_loop_hits, 1); // …but the loop is NOT hidden
    assert_eq!(agg.failures.hallucinated_completions, 9);
}

#[tokio::test]
async fn cancellation_stops_the_queue_early() {
    let targets = vec![target("m1")];
    let tasks: Vec<ToolTask> = (0..5).map(|i| single_task(&format!("t{i}"))).collect();
    let sink = Arc::new(CountingSink::default());
    let cancel = CancellationToken::new();
    cancel.cancel(); // pre-cancelled → no task should run

    let report = run_batch("c", &targets, &tasks, cancel, sink.clone(), make_turn).await.unwrap();

    assert_eq!(*sink.done.lock().unwrap(), 0);
    assert_eq!(report.columns.len(), 1); // the column is still emitted (empty)
}
