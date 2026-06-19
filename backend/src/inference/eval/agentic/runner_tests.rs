use crate::errors::AppResult;
use crate::inference::eval::agentic::model_turn::ModelTurn;
use crate::inference::eval::agentic::report::{FailureKind, TopError};
use crate::inference::eval::agentic::runner::{run_agentic, run_once, AgenticConfig};
use crate::inference::eval::agentic::sandbox::{DeterministicSandbox, EndStateRule, MockResponse, TaskCheckpoint};
use crate::inference::eval::agentic::spec::{FaultInjection, FaultRule};
use crate::inference::eval::agentic::step::{StepKind, TrajectoryStep};
use crate::inference::eval::toolcall::tasks::Call;
use crate::inference::generate::generate_spec::GenerateSpec;
use crate::inference::generate::generate_stats::GenerateStats;
use serde_json::json;
use std::sync::atomic::{AtomicUsize, Ordering};
use tokio::sync::mpsc::{unbounded_channel, UnboundedReceiver};

/// A model with no backend: returns canned `(text, eval_count)` replies in order,
/// repeating the last once exhausted. The whole point of the `ModelTurn` seam.
struct ScriptedModel {
    replies: Vec<(String, u32)>,
    next: AtomicUsize,
}

impl ScriptedModel {
    fn new(replies: Vec<(&str, u32)>) -> Self {
        Self {
            replies: replies.into_iter().map(|(t, n)| (t.to_string(), n)).collect(),
            next: AtomicUsize::new(0),
        }
    }
}

impl ModelTurn for ScriptedModel {
    async fn run(&self, _spec: &GenerateSpec) -> AppResult<(String, GenerateStats)> {
        let i = self.next.fetch_add(1, Ordering::SeqCst).min(self.replies.len() - 1);
        let (text, n) = &self.replies[i];
        Ok((text.clone(), GenerateStats { eval_count: Some(*n), ..Default::default() }))
    }
}

/// A backend that errors on specific call indices (0-based) and otherwise returns
/// `END_CALL` → an immediate success. With single-turn runs, the call index equals
/// the run index, so this simulates Ollama failing on a specific Pass^k attempt.
struct FlakyModel {
    err_on: Vec<usize>,
    next: AtomicUsize,
}

impl FlakyModel {
    fn new(err_on: Vec<usize>) -> Self {
        Self { err_on, next: AtomicUsize::new(0) }
    }
}

impl ModelTurn for FlakyModel {
    async fn run(&self, _spec: &GenerateSpec) -> AppResult<(String, GenerateStats)> {
        let i = self.next.fetch_add(1, Ordering::SeqCst);
        if self.err_on.contains(&i) {
            return Err(crate::errors::AppError::Inference("ollama timed out".into()));
        }
        Ok((END_CALL.to_string(), GenerateStats { eval_count: Some(10), ..Default::default() }))
    }
}

fn drain(rx: &mut UnboundedReceiver<TrajectoryStep>) -> Vec<TrajectoryStep> {
    let mut out = Vec::new();
    while let Ok(s) = rx.try_recv() {
        out.push(s);
    }
    out
}

fn sandbox() -> DeterministicSandbox {
    DeterministicSandbox::new(
        "Get the balance for ACC-123 then transfer it.".into(),
        vec![],
        vec![MockResponse {
            call: Call { name: "get_balance".into(), args: json!({ "account_id": "ACC-123" }) },
            response: r#"{"balance":450.0}"#.into(),
        }],
        EndStateRule::RequireSequence(vec![TaskCheckpoint {
            tool: "execute_transfer".into(),
            args: json!({ "amount": 450.0 }),
        }]),
    )
}

#[tokio::test]
async fn reaches_end_state_after_a_tool_call() {
    let model = ScriptedModel::new(vec![
        (r#"{"name":"get_balance","args":{"account_id":"ACC-123"}}"#, 40),
        (r#"{"name":"execute_transfer","args":{"amount":450.0}}"#, 30),
    ]);
    let (tx, mut rx) = unbounded_channel();
    let outcome = run_once(&model, &sandbox(), 8, 2, 0, &tx).await.unwrap();
    drop(tx);

    assert!(outcome.reached_end);
    assert_eq!(outcome.steps, 2);
    assert_eq!(outcome.output_tokens, 70); // 40 + 30, output tokens only

    let steps = drain(&mut rx);
    assert_eq!(steps.len(), 2);
    assert_eq!(steps[0].kind, StepKind::ToolCall);
    assert_eq!(steps[0].injection.as_deref(), Some(r#"Tool result: {"balance":450.0}"#));
    assert_eq!(steps[1].kind, StepKind::EndStateReached);
    assert_eq!(steps[1].injection, None);
}

#[tokio::test]
async fn unknown_tool_injects_an_error_and_the_loop_continues() {
    let model = ScriptedModel::new(vec![
        (r#"{"name":"search_web","args":{"q":"rates"}}"#, 12), // not in the sandbox
        (r#"{"name":"execute_transfer","args":{"amount":450.0}}"#, 18),
    ]);
    let (tx, mut rx) = unbounded_channel();
    let outcome = run_once(&model, &sandbox(), 8, 2, 0, &tx).await.unwrap();
    drop(tx);

    assert!(outcome.reached_end);
    assert_eq!(outcome.steps, 2);

    let steps = drain(&mut rx);
    assert_eq!(steps[0].kind, StepKind::UnknownTool);
    assert!(steps[0].injection.as_deref().unwrap().contains("Tool not found"));
    assert_eq!(steps[1].kind, StepKind::EndStateReached);
}

const END_CALL: &str = r#"{"name":"execute_transfer","args":{"amount":450.0}}"#;

/// A sandbox that DECLARES a tool schema, so semantic validation (Driver D) is
/// active. `execute_transfer` requires a string `account_id` and a number `amount`;
/// the end-state demands one well-formed call.
fn schema_sandbox() -> DeterministicSandbox {
    use crate::inference::eval::toolcall::tasks::ToolSchema;
    DeterministicSandbox::new(
        "Transfer ACC-123's balance.".into(),
        vec![ToolSchema {
            name: "execute_transfer".into(),
            description: "Move funds".into(),
            parameters: json!({
                "type": "object",
                "properties": { "account_id": { "type": "string" }, "amount": { "type": "number" } },
                "required": ["account_id", "amount"]
            }),
        }],
        vec![],
        EndStateRule::RequireSequence(vec![TaskCheckpoint {
            tool: "execute_transfer".into(),
            args: json!({ "account_id": "ACC-123", "amount": 450.0 }),
        }]),
    )
}

const VALID_TRANSFER: &str = r#"{"name":"execute_transfer","args":{"account_id":"ACC-123","amount":450.0}}"#;
const BAD_TRANSFER: &str = r#"{"name":"execute_transfer","args":{"amount":450.0}}"#; // missing account_id

#[tokio::test]
async fn pass_k_counts_successes_and_failures_with_isolation() {
    // Each run terminates in exactly one turn (immediate success or immediate
    // prose-yield), so the shared reply cursor advances once per run. That each
    // run resolves independently is itself the proof of isolation — no bleed.
    let model = ScriptedModel::new(vec![
        (END_CALL, 10),
        (END_CALL, 10),
        (END_CALL, 10),
        ("I believe the task is already complete.", 5),
        ("All done, nothing more to do.", 5),
    ]);
    let (tx, mut rx) = unbounded_channel();
    let report = run_agentic(&model, &sandbox(), AgenticConfig { k: 5, max_steps: 4, ..Default::default() }, &tx).await.unwrap();
    drop(tx);

    assert_eq!(report.passes, 3);
    assert_eq!(report.total_runs, 5);
    assert_eq!(report.failures.hallucinated_completions, 2);
    assert_eq!(report.failures.infinite_loop_hits, 0);
    assert_eq!(report.top_error, TopError::Hallucinated);
    assert_eq!(report.avg_steps, Some(1.0)); // every run is one turn
    assert_eq!(report.avg_output_tokens_success, Some(10.0)); // the 3 successes only

    // One TrajectoryStep per run (each is single-turn).
    assert_eq!(drain(&mut rx).len(), 5);
}

#[tokio::test]
async fn endless_valid_calls_are_tallied_as_infinite_loops() {
    // The model forever makes a valid, recognized call that never satisfies the
    // end-state → every run exhausts max_steps.
    let model = ScriptedModel::new(vec![(r#"{"name":"get_balance","args":{"account_id":"ACC-123"}}"#, 7)]);
    let (tx, _rx) = unbounded_channel();
    let report = run_agentic(&model, &sandbox(), AgenticConfig { k: 2, max_steps: 3, ..Default::default() }, &tx).await.unwrap();
    drop(tx);

    assert_eq!(report.passes, 0);
    assert_eq!(report.failures.infinite_loop_hits, 2);
    assert_eq!(report.top_error, TopError::InfiniteLoop);
    assert_eq!(report.avg_steps, Some(3.0)); // both runs hit the cap
    assert_eq!(report.avg_output_tokens_success, None); // no successes → N/A
}

/// Reports a huge prompt-token count and a tiny output count every turn. Proves
/// the effort metric tracks output tokens (`eval_count`) only — re-sent history
/// inflating `prompt_eval_count` must never leak in (KV-cache reuse, Step 6.4).
struct PromptHeavyModel;

impl ModelTurn for PromptHeavyModel {
    async fn run(&self, _spec: &GenerateSpec) -> AppResult<(String, GenerateStats)> {
        Ok((END_CALL.to_string(), GenerateStats { prompt_eval_count: Some(9999), eval_count: Some(12), ..Default::default() }))
    }
}

#[tokio::test]
async fn effort_counts_output_tokens_only_never_prompt_tokens() {
    let (tx, _rx) = unbounded_channel();
    let report = run_agentic(&PromptHeavyModel, &sandbox(), AgenticConfig { k: 1, max_steps: 4, ..Default::default() }, &tx).await.unwrap();
    assert_eq!(report.passes, 1);
    assert_eq!(report.avg_output_tokens_success, Some(12.0)); // the 12, never the 9999
}

#[tokio::test]
async fn lazy_agent_claiming_done_is_a_failure_not_a_pass() {
    // The benchmark must not be gameable. A model that instantly outputs
    // {"status":"task_complete"} on turn one, bypassing every tool, must be
    // flagged as a hallucinated completion — never counted as a success. If this
    // ever fails, the sandbox is compromised: fix the verification, not the test.
    let model = ScriptedModel::new(vec![(r#"{"status":"task_complete"}"#, 9)]);
    let (tx, mut rx) = unbounded_channel();
    let report = run_agentic(&model, &sandbox(), AgenticConfig { k: 1, max_steps: 8, ..Default::default() }, &tx).await.unwrap();
    drop(tx);

    assert_eq!(report.passes, 0);
    assert_eq!(report.total_runs, 1);
    assert_eq!(report.failures.hallucinated_completions, 1);
    assert_eq!(report.failures.malformed_json_calls, 0);
    assert_eq!(report.top_error, TopError::Hallucinated);
    assert_eq!(report.avg_output_tokens_success, None);

    let steps = drain(&mut rx);
    assert_eq!(steps.len(), 1); // bailed on turn one, no tools touched
    assert_eq!(steps[0].kind, StepKind::HallucinatedCompletion);
}

#[tokio::test]
async fn transient_trap_is_retried_to_success() {
    // The final call is trapped with a transient 503 that clears after one attempt.
    // The model re-issues the same valid call: turn 1 trips the 503, turn 2 the trap
    // has cleared → the sequence completes. A trapped call is never a fake pass.
    let sb = sandbox().with_faults(vec![FaultRule {
        call: Call { name: "execute_transfer".into(), args: json!({ "amount": 450.0 }) },
        fault: FaultInjection::TransientError { status_code: 503, clears_after: 1 },
    }]);
    let model = ScriptedModel::new(vec![(END_CALL, 20)]);
    let (tx, mut rx) = unbounded_channel();
    let outcome = run_once(&model, &sb, 8, 2, 0, &tx).await.unwrap();
    drop(tx);

    assert!(outcome.reached_end);
    assert_eq!(outcome.steps, 2); // one retry, well under the cap (no infinite loop)

    let steps = drain(&mut rx);
    assert_eq!(steps[0].kind, StepKind::ToolError);
    assert!(steps[0].injection.as_deref().unwrap().contains("503"));
    assert_eq!(steps[1].kind, StepKind::EndStateReached);
}

#[tokio::test]
async fn persistent_trap_halts_gracefully_not_infinite_loop() {
    // The final call is trapped with a persistent 500 that never clears. A robust
    // agent reports the failure in prose on turn 2 → Hallucinated (it didn't finish
    // the sequence), a graceful halt — NOT a loop to the step cap, NOT a fake pass.
    let sb = sandbox().with_faults(vec![FaultRule {
        call: Call { name: "execute_transfer".into(), args: json!({ "amount": 450.0 }) },
        fault: FaultInjection::PersistentError { status_code: 500 },
    }]);
    let model = ScriptedModel::new(vec![
        (END_CALL, 15),
        ("The transfer service is down (HTTP 500); I cannot complete the task.", 8),
    ]);
    let (tx, mut rx) = unbounded_channel();
    let outcome = run_once(&model, &sb, 8, 2, 0, &tx).await.unwrap();
    drop(tx);

    assert!(!outcome.reached_end);
    assert_eq!(outcome.steps, 2);
    assert_eq!(outcome.failure, Some(FailureKind::Hallucinated));

    let steps = drain(&mut rx);
    assert_eq!(steps[0].kind, StepKind::ToolError);
    assert!(steps[0].injection.as_deref().unwrap().contains("500"));
    assert_eq!(steps[1].kind, StepKind::HallucinatedCompletion);
}

#[tokio::test]
async fn schema_error_then_valid_call_recovers_to_success() {
    // turn 1: a schema-invalid call (missing required account_id) → a precise
    // semantic correction is injected and one recovery is spent. turn 2: the model
    // fixes it → the run completes AND is marked recovered.
    let model = ScriptedModel::new(vec![(BAD_TRANSFER, 12), (VALID_TRANSFER, 18)]);
    let (tx, mut rx) = unbounded_channel();
    let outcome = run_once(&model, &schema_sandbox(), 8, 2, 0, &tx).await.unwrap();
    drop(tx);

    assert!(outcome.reached_end);
    assert_eq!(outcome.steps, 2);
    assert!(outcome.hit_schema_error);
    assert!(outcome.schema_recovered);

    let steps = drain(&mut rx);
    assert_eq!(steps[0].kind, StepKind::SchemaError);
    assert_eq!(steps[0].injection.as_deref(), Some("Tool result: [Schema error: key `account_id` required]"));
    assert_eq!(steps[1].kind, StepKind::EndStateReached);
}

#[tokio::test]
async fn exhausting_the_recovery_budget_is_malformed_schema() {
    // The model never fixes its schema-invalid call. With max_recovery = 2 it gets
    // two corrections; the third invalid call ends the run as MalformedSchema —
    // never a fake pass, never an infinite loop to the step cap.
    let model = ScriptedModel::new(vec![(BAD_TRANSFER, 9)]); // repeats forever
    let (tx, mut rx) = unbounded_channel();
    let report = run_agentic(&model, &schema_sandbox(), AgenticConfig { k: 1, max_steps: 8, max_recovery: 2 }, &tx)
        .await
        .unwrap();
    drop(tx);

    assert_eq!(report.passes, 0);
    assert_eq!(report.failures.schema_unrecovered_calls, 1);
    assert_eq!(report.top_error, TopError::MalformedSchema);
    assert_eq!(report.schema_resilience, Some(0.0)); // one run hit a schema error, none recovered

    let steps = drain(&mut rx);
    assert_eq!(steps.len(), 3); // 2 corrections + the terminal SchemaError
    assert_eq!(steps[2].kind, StepKind::SchemaError);
    assert_eq!(steps[2].injection, None); // terminal turn carries no correction
}

#[tokio::test]
async fn require_sequence_enforces_order_before_success() {
    let sandbox = DeterministicSandbox::new(
        "Check the balance for ACC-123, then transfer it.".into(),
        vec![],
        vec![MockResponse {
            call: Call { name: "check_balance".into(), args: json!({ "account_id": "ACC-123" }) },
            response: r#"{"balance":450.0}"#.into(),
        }],
        EndStateRule::RequireSequence(vec![
            TaskCheckpoint { tool: "check_balance".into(), args: json!({ "account_id": "ACC-123" }) },
            TaskCheckpoint { tool: "transfer".into(), args: json!({ "amount": 450.0 }) },
        ]),
    );
    // (1) transfer FIRST (premature — checkpoint 0 unmet, must NOT complete),
    // (2) check_balance (checkpoint 0), (3) transfer (checkpoint 1 → done).
    let model = ScriptedModel::new(vec![
        (r#"{"name":"transfer","args":{"amount":450.0}}"#, 5),
        (r#"{"name":"check_balance","args":{"account_id":"ACC-123"}}"#, 8),
        (r#"{"name":"transfer","args":{"amount":450.0}}"#, 7),
    ]);
    let (tx, mut rx) = unbounded_channel();
    let outcome = run_once(&model, &sandbox, 8, 2, 0, &tx).await.unwrap();
    drop(tx);

    assert!(outcome.reached_end);
    assert_eq!(outcome.steps, 3); // the premature transfer did not satisfy the sequence
    let steps = drain(&mut rx);
    assert_eq!(steps[0].kind, StepKind::UnknownTool); // premature transfer has no mock
    assert_eq!(steps.last().unwrap().kind, StepKind::EndStateReached);
}

#[tokio::test]
async fn expect_abstaining_text_passes_on_decline_fails_on_action() {
    let abstain = DeterministicSandbox::new(
        "If the request is unsafe, refuse in plain text — do not call any tool.".into(),
        vec![],
        vec![],
        EndStateRule::ExpectAbstainingText,
    );

    // Correct: declines in plain text → PASS (not a lazy failure).
    let decliner = ScriptedModel::new(vec![("I can't help with that; it would be unsafe.", 6)]);
    let (tx, _rx) = unbounded_channel();
    let ok = run_agentic(&decliner, &abstain, AgenticConfig { k: 1, max_steps: 4, ..Default::default() }, &tx).await.unwrap();
    assert_eq!(ok.passes, 1);
    assert_eq!(ok.failures.hallucinated_completions, 0);

    // Wrong: acts (calls a tool) when it should have abstained → FAIL.
    let actor = ScriptedModel::new(vec![(r#"{"name":"transfer","args":{"amount":1.0}}"#, 6)]);
    let (tx2, _rx2) = unbounded_channel();
    let bad = run_agentic(&actor, &abstain, AgenticConfig { k: 1, max_steps: 4, ..Default::default() }, &tx2).await.unwrap();
    assert_eq!(bad.passes, 0);
    assert_eq!(bad.failures.hallucinated_completions, 1);
}

#[tokio::test]
async fn a_per_run_backend_error_does_not_abort_the_remaining_runs() {
    // Ollama errors on attempts 1 and 3 of a k=5 batch. The OLD behaviour bailed on
    // attempt 1 (the `?`), losing attempts 2–4. Now the failing attempts are skipped
    // and runs 0, 2, 4 still complete → the report folds the 3 that ran (an infra
    // fault never reaches the denominator: total_runs is 3, not 5).
    let model = FlakyModel::new(vec![1, 3]);
    let (tx, _rx) = unbounded_channel();
    let report =
        run_agentic(&model, &sandbox(), AgenticConfig { k: 5, max_steps: 4, ..Default::default() }, &tx).await.unwrap();

    assert_eq!(report.passes, 3); // runs 0, 2, 4 all reached the end state
    assert_eq!(report.total_runs, 3); // the 2 errored runs are excluded, not failed
    assert_eq!(report.failures.hallucinated_completions, 0);
    assert_eq!(report.failures.infinite_loop_hits, 0);
    assert_eq!(report.avg_output_tokens_success, Some(10.0));
}

#[tokio::test]
async fn every_run_erroring_surfaces_the_error_for_resume() {
    // The backend is genuinely down: all k attempts error. With no completed run to
    // report, the error propagates so the task shows as Error and re-runs on resume.
    let model = FlakyModel::new(vec![0, 1, 2]);
    let (tx, _rx) = unbounded_channel();
    let result = run_agentic(&model, &sandbox(), AgenticConfig { k: 3, max_steps: 4, ..Default::default() }, &tx).await;
    assert!(result.is_err());
}
