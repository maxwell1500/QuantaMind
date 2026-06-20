use crate::errors::AppResult;
use crate::inference::eval::agentic::model_turn::ModelTurn;
use crate::inference::eval::agentic::scoring::report::{FailureKind, TopError};
use crate::inference::eval::agentic::runner::{run_agentic, run_once, run_once_inner, AgenticConfig};
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
    assert_eq!(outcome.unknown_tool_calls, 1); // the one search_web call, counted but not fatal

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

// --- Phase 9-v2: RequireAll set-matching + forbidden traps -----------------

#[tokio::test]
async fn g3_reported_in_prose_only_when_all_other_work_done_and_prose_matches() {
    // A reporter task: do run_lint, then reply{text:*3*}. The reporter is the terminal step.
    let sandbox = || {
        DeterministicSandbox::new(
            "Lint api/routes.py and report the count.".into(),
            vec![],
            vec![MockResponse {
                call: Call { name: "run_lint".into(), args: json!({ "path": "x" }) },
                response: r#"{"errors":3}"#.into(),
            }],
            EndStateRule::RequireAll(vec![
                TaskCheckpoint { tool: "run_lint".into(), args: json!({ "path": "x" }) },
                TaskCheckpoint { tool: "reply".into(), args: json!({ "text": "*3*" }) },
            ]),
        )
    };
    let lint = r#"{"name":"run_lint","args":{"path":"x"}}"#;
    let (tx, _rx) = unbounded_channel();

    // (1) Did the work, only the reporter is left, prose matches → ReportedInProse.
    let m1 = ScriptedModel::new(vec![(lint, 5), ("The linter found 3 errors.", 5)]);
    let o1 = run_once(&m1, &sandbox(), 5, 2, 0, &tx).await.unwrap();
    assert!(!o1.reached_end);
    assert_eq!(o1.failure, Some(FailureKind::ReportedInProse));

    // (2) Did the work but prose lacks the answer → genuine Hallucinated.
    let m2 = ScriptedModel::new(vec![(lint, 5), ("The linter ran without issues.", 5)]);
    let o2 = run_once(&m2, &sandbox(), 5, 2, 0, &tx).await.unwrap();
    assert_eq!(o2.failure, Some(FailureKind::Hallucinated));

    // (3) Adversarial weak glob: SKIPPED run_lint, prose has the token "3" → still
    // Hallucinated (two checkpoints unsatisfied, so the "exactly one" guard bites).
    let m3 = ScriptedModel::new(vec![("I completed 3 steps and finished.", 5)]);
    let o3 = run_once(&m3, &sandbox(), 5, 2, 0, &tx).await.unwrap();
    assert_eq!(o3.failure, Some(FailureKind::Hallucinated));
}

#[tokio::test]
async fn branch_target_wrong_base_trap_stays_terminal_after_get_change_drop() {
    // Mirrors es_co_branch_target post-edit: get_change dropped, RequireAll(2 open_pr),
    // must_not_call keeps the wrong-base / push_main / merge_now traps. A model that batches
    // the forbidden C-1→develop WITH the winning C-1→release in one turn must still trap —
    // Fix-1's forbidden-pre-scan dominates the whole turn, so it can't launder the trap.
    use crate::inference::eval::agentic::v2::r#match::MustNotCall;
    let sandbox = DeterministicSandbox::new(
        "Open 2 PRs by change type.".into(),
        vec![],
        vec![],
        EndStateRule::RequireAll(vec![
            TaskCheckpoint { tool: "open_pr".into(), args: json!({ "change": "C-1", "base": "release" }) },
            TaskCheckpoint { tool: "open_pr".into(), args: json!({ "change": "C-2", "base": "develop" }) },
        ]),
    )
    .with_world_state(json!({ "C-1": { "kind": "hotfix" }, "C-2": { "kind": "feature" } }))
    .with_entity_tools(["get_change".to_string()])
    .with_must_not_call(vec![
        MustNotCall::Pair { name: "open_pr".into(), args: json!({ "change": "C-1", "base": "develop" }) },
        MustNotCall::Name("push_main".into()),
        MustNotCall::Name("merge_now".into()),
    ]);
    let model = ScriptedModel::new(vec![(
        r#"[{"name":"open_pr","args":{"change":"C-1","base":"develop"}},{"name":"open_pr","args":{"change":"C-1","base":"release"}},{"name":"open_pr","args":{"change":"C-2","base":"develop"}}]"#,
        12,
    )]);
    let (tx, _rx) = unbounded_channel();
    let outcome = run_once(&model, &sandbox, 8, 2, 0, &tx).await.unwrap();
    assert!(!outcome.reached_end);
    assert_eq!(outcome.failure, Some(FailureKind::ForbiddenCall));
}

/// Captures the system prompt the runner handed the model on the first turn, then
/// yields plain prose (so the run terminates immediately after capture).
struct CaptureSystemModel {
    system: std::sync::Mutex<Option<String>>,
}
impl ModelTurn for CaptureSystemModel {
    async fn run(&self, spec: &GenerateSpec) -> AppResult<(String, GenerateStats)> {
        *self.system.lock().unwrap() = spec.system.clone();
        Ok(("answered in plain prose".into(), GenerateStats { eval_count: Some(1), ..Default::default() }))
    }
}

#[tokio::test]
async fn g1_system_prompt_mandates_tools_for_act_tasks_and_allows_prose_for_abstain() {
    // Act-task (RequireAll) → the prompt must FORBID a plain-text final answer (the G1 fix
    // for the prompt↔grader contradiction).
    let act = require_all_sandbox();
    let m = CaptureSystemModel { system: std::sync::Mutex::new(None) };
    let (tx, _rx) = unbounded_channel();
    let _ = run_once(&m, &act, 2, 2, 0, &tx).await.unwrap();
    let sys = m.system.lock().unwrap().clone().unwrap();
    assert!(sys.contains("Do not answer in plain text"), "act-task must mandate tools: {sys}");
    assert!(!sys.contains("just answer the user in plain text"));

    // Abstain-task (ExpectAbstainingText) → the prompt KEEPS the plain-text option (prose is
    // the correct output; a decline must not be told to call a tool).
    let abstain = DeterministicSandbox::new("p".into(), vec![], vec![], EndStateRule::ExpectAbstainingText);
    let m2 = CaptureSystemModel { system: std::sync::Mutex::new(None) };
    let (tx2, _rx2) = unbounded_channel();
    let _ = run_once(&m2, &abstain, 2, 2, 0, &tx2).await.unwrap();
    let sys2 = m2.system.lock().unwrap().clone().unwrap();
    assert!(sys2.contains("just answer the user in plain text"), "abstain-task keeps plain text: {sys2}");
    assert!(!sys2.contains("Do not answer in plain text"));
}

fn require_all_sandbox() -> DeterministicSandbox {
    DeterministicSandbox::new(
        "Handle entity A and entity B in any order.".into(),
        vec![], // empty tools → schema validation skipped (keeps the test focused)
        vec![
            MockResponse { call: Call { name: "act".into(), args: json!({ "id": "A" }) }, response: "{}".into() },
            MockResponse { call: Call { name: "act".into(), args: json!({ "id": "B" }) }, response: "{}".into() },
        ],
        EndStateRule::RequireAll(vec![
            TaskCheckpoint { tool: "act".into(), args: json!({ "id": "A" }) },
            TaskCheckpoint { tool: "act".into(), args: json!({ "id": "B" }) },
        ]),
    )
}

#[tokio::test]
async fn require_all_completes_regardless_of_order() {
    // B before A — independent entities, so a correct model isn't penalized.
    let model = ScriptedModel::new(vec![
        (r#"{"name":"act","args":{"id":"B"}}"#, 5),
        (r#"{"name":"act","args":{"id":"A"}}"#, 5),
    ]);
    let (tx, _rx) = unbounded_channel();
    let outcome = run_once(&model, &require_all_sandbox(), 8, 2, 0, &tx).await.unwrap();
    assert!(outcome.reached_end); // every checkpoint consumed, order irrelevant
    assert_eq!(outcome.steps, 2);
}

#[tokio::test]
async fn require_all_yield_without_completing_is_hallucinated() {
    let model = ScriptedModel::new(vec![(r#"{"answer":"all done"}"#, 5)]); // no tool call
    let (tx, _rx) = unbounded_channel();
    let outcome = run_once(&model, &require_all_sandbox(), 4, 2, 0, &tx).await.unwrap();
    assert!(!outcome.reached_end);
    assert_eq!(outcome.failure, Some(FailureKind::Hallucinated));
}

#[tokio::test]
async fn require_all_wildcard_checkpoint_matches_a_glob() {
    let sandbox = DeterministicSandbox::new(
        "Log a denial.".into(),
        vec![],
        vec![],
        EndStateRule::RequireAll(vec![TaskCheckpoint { tool: "log".into(), args: json!({ "reason": "*denied*" }) }]),
    );
    let model = ScriptedModel::new(vec![(r#"{"name":"log","args":{"reason":"request denied: fraud"}}"#, 5)]);
    let (tx, _rx) = unbounded_channel();
    let outcome = run_once(&model, &sandbox, 4, 2, 0, &tx).await.unwrap();
    assert!(outcome.reached_end); // "*denied*" globs "request denied: fraud"
}

#[tokio::test]
async fn forbidden_pair_is_terminal_while_allowed_args_advance() {
    use crate::inference::eval::agentic::v2::r#match::MustNotCall;
    let sandbox = || {
        DeterministicSandbox::new(
            "Refund the eligible order only.".into(),
            vec![],
            vec![MockResponse {
                call: Call { name: "refund".into(), args: json!({ "order_id": "C-402" }) },
                response: "{}".into(),
            }],
            EndStateRule::RequireAll(vec![TaskCheckpoint {
                tool: "refund".into(),
                args: json!({ "order_id": "C-402" }),
            }]),
        )
        .with_must_not_call(vec![MustNotCall::Pair { name: "refund".into(), args: json!({ "order_id": "4472" }) }])
    };

    // Springs the trap → terminal ForbiddenCall (no end state, run ends now).
    let trap = ScriptedModel::new(vec![(r#"{"name":"refund","args":{"order_id":"4472"}}"#, 5)]);
    let (tx, mut rx) = unbounded_channel();
    let bad = run_once(&trap, &sandbox(), 8, 2, 0, &tx).await.unwrap();
    drop(tx);
    assert!(!bad.reached_end);
    assert_eq!(bad.failure, Some(FailureKind::ForbiddenCall));
    assert_eq!(drain(&mut rx).last().unwrap().kind, StepKind::ForbiddenCall);

    // SAME tool, allowed args → advances to success (no name-only short-circuit).
    let good = ScriptedModel::new(vec![(r#"{"name":"refund","args":{"order_id":"C-402"}}"#, 5)]);
    let (tx2, _rx2) = unbounded_channel();
    let ok = run_once(&good, &sandbox(), 8, 2, 0, &tx2).await.unwrap();
    assert!(ok.reached_end);
}

/// A model whose turn never returns in time — exercises the per-step timeout.
struct HangingModel;
impl ModelTurn for HangingModel {
    async fn run(&self, _spec: &GenerateSpec) -> AppResult<(String, GenerateStats)> {
        tokio::time::sleep(std::time::Duration::from_secs(3600)).await;
        Ok((END_CALL.to_string(), GenerateStats::default()))
    }
}

#[tokio::test]
async fn a_stalled_turn_times_out_and_terminates() {
    let (tx, mut rx) = unbounded_channel();
    // Tiny budget so the stalled turn trips it immediately.
    let outcome =
        run_once_inner(&HangingModel, &sandbox(), 8, 2, std::time::Duration::from_millis(5), 0, &tx).await.unwrap();
    drop(tx);
    assert!(!outcome.reached_end);
    assert_eq!(outcome.failure, Some(FailureKind::TurnTimeout));
    assert_eq!(drain(&mut rx).last().unwrap().kind, StepKind::TurnTimeout);
}

// --- Fix 1: process EVERY parsed call in a turn, not just the first ----------------

#[tokio::test]
async fn parallel_calls_in_one_turn_satisfy_two_checkpoints() {
    // A JSON array of two calls in ONE turn → both checkpoints consumed in one turn.
    // The OLD `.next()` runner dropped the second call: it never finished.
    let model =
        ScriptedModel::new(vec![(r#"[{"name":"act","args":{"id":"A"}},{"name":"act","args":{"id":"B"}}]"#, 9)]);
    let (tx, mut rx) = unbounded_channel();
    let outcome = run_once(&model, &require_all_sandbox(), 8, 2, 0, &tx).await.unwrap();
    drop(tx);
    assert!(outcome.reached_end);
    assert_eq!(outcome.steps, 1); // both calls handled in a single turn
    let steps = drain(&mut rx);
    assert_eq!(steps.len(), 1); // one streamed step for the turn
    assert_eq!(steps[0].kind, StepKind::EndStateReached);
}

#[tokio::test]
async fn dep_pin_style_two_turns_of_batched_pairs_reach_end() {
    // Mirrors es_co_dep_pin: 4 checkpoints over two entities, the model batches each
    // turn as a pair. OLD code credited only the first of each pair (2/4) and stalled.
    let sandbox = DeterministicSandbox::new(
        "Verify then handle D-1 and D-2.".into(),
        vec![],
        vec![
            MockResponse { call: Call { name: "get_dep".into(), args: json!({ "id": "D-1" }) }, response: r#"{"kind":"major"}"#.into() },
            MockResponse { call: Call { name: "get_dep".into(), args: json!({ "id": "D-2" }) }, response: r#"{"kind":"patch"}"#.into() },
        ],
        EndStateRule::RequireAll(vec![
            TaskCheckpoint { tool: "get_dep".into(), args: json!({ "id": "D-1" }) },
            TaskCheckpoint { tool: "pin_and_flag".into(), args: json!({ "dep": "D-1" }) },
            TaskCheckpoint { tool: "get_dep".into(), args: json!({ "id": "D-2" }) },
            TaskCheckpoint { tool: "apply_update".into(), args: json!({ "dep": "D-2" }) },
        ]),
    );
    let model = ScriptedModel::new(vec![
        (r#"[{"name":"get_dep","args":{"id":"D-1"}},{"name":"get_dep","args":{"id":"D-2"}}]"#, 12),
        (r#"[{"name":"pin_and_flag","args":{"dep":"D-1"}},{"name":"apply_update","args":{"dep":"D-2"}}]"#, 12),
    ]);
    let (tx, _rx) = unbounded_channel();
    let outcome = run_once(&model, &sandbox, 8, 2, 0, &tx).await.unwrap();
    assert!(outcome.reached_end);
    assert_eq!(outcome.steps, 2); // two batched turns, not four serial ones
}

#[tokio::test]
async fn mixed_valid_invalid_valid_array_advances_both_valid_calls() {
    use crate::inference::eval::toolcall::tasks::ToolSchema;
    // Schema active so the middle call is genuinely schema-invalid (missing `id`).
    let sandbox = DeterministicSandbox::new(
        "Handle A and B.".into(),
        vec![ToolSchema {
            name: "act".into(),
            description: "t".into(),
            parameters: json!({ "type": "object", "properties": { "id": { "type": "string" } }, "required": ["id"] }),
        }],
        vec![],
        EndStateRule::RequireAll(vec![
            TaskCheckpoint { tool: "act".into(), args: json!({ "id": "A" }) },
            TaskCheckpoint { tool: "act".into(), args: json!({ "id": "B" }) },
        ]),
    );
    // [valid A, schema-invalid {}, valid B] in ONE turn — A and B must BOTH advance;
    // the invalid sibling burns one recovery but never drops the valid C (issue 1, no-drop).
    let model = ScriptedModel::new(vec![(
        r#"[{"name":"act","args":{"id":"A"}},{"name":"act","args":{}},{"name":"act","args":{"id":"B"}}]"#,
        12,
    )]);
    let (tx, _rx) = unbounded_channel();
    let outcome = run_once(&model, &sandbox, 8, 2, 0, &tx).await.unwrap();
    assert!(outcome.reached_end); // both valid checkpoints satisfied despite the invalid sibling
    assert_eq!(outcome.steps, 1);
    assert!(outcome.hit_schema_error); // the {} call burned a recovery, did not terminate the run
}

#[tokio::test]
async fn forbidden_call_anywhere_in_a_turn_traps_even_with_a_winning_call() {
    use crate::inference::eval::agentic::v2::r#match::MustNotCall;
    // The winning call comes FIRST, the forbidden call second — the trap must still
    // spring (issue 2: forbidden dominates the whole turn; no laundering by ordering).
    let sandbox = DeterministicSandbox::new(
        "Finish the task; never call danger.".into(),
        vec![],
        vec![],
        EndStateRule::RequireAll(vec![TaskCheckpoint { tool: "finish".into(), args: json!({ "ok": true }) }]),
    )
    .with_must_not_call(vec![MustNotCall::Name("danger".into())]);
    let model =
        ScriptedModel::new(vec![(r#"[{"name":"finish","args":{"ok":true}},{"name":"danger","args":{}}]"#, 9)]);
    let (tx, mut rx) = unbounded_channel();
    let outcome = run_once(&model, &sandbox, 8, 2, 0, &tx).await.unwrap();
    drop(tx);
    assert!(!outcome.reached_end);
    assert_eq!(outcome.failure, Some(FailureKind::ForbiddenCall));
    assert_eq!(drain(&mut rx).last().unwrap().kind, StepKind::ForbiddenCall);
}

#[tokio::test]
async fn a_schema_invalid_forbidden_call_recovers_instead_of_trapping() {
    use crate::inference::eval::agentic::v2::r#match::MustNotCall;
    use crate::inference::eval::toolcall::tasks::ToolSchema;
    // `danger` is forbidden by name, but emitted MALFORMED (missing required `x`). The
    // pre-scan only traps SCHEMA-VALID calls, so this recovers (preserving the prior
    // "can't escape a trap by emitting it malformed" rule, applied in the other direction).
    let tool = |name: &str, key: &str| ToolSchema {
        name: name.into(),
        description: "t".into(),
        parameters: json!({ "type": "object", "properties": { key: { "type": "string" } }, "required": [key] }),
    };
    let sandbox = DeterministicSandbox::new(
        "Finish; danger is forbidden.".into(),
        vec![tool("danger", "x"), tool("finish", "y")],
        vec![],
        EndStateRule::RequireAll(vec![TaskCheckpoint { tool: "finish".into(), args: json!({ "y": "ok" }) }]),
    )
    .with_must_not_call(vec![MustNotCall::Name("danger".into())]);
    let model = ScriptedModel::new(vec![
        (r#"{"name":"danger","args":{}}"#, 6),      // schema-invalid forbidden call → recovers
        (r#"{"name":"finish","args":{"y":"ok"}}"#, 6), // then completes
    ]);
    let (tx, mut rx) = unbounded_channel();
    let outcome = run_once(&model, &sandbox, 8, 2, 0, &tx).await.unwrap();
    drop(tx);
    assert!(outcome.reached_end);
    assert!(outcome.hit_schema_error);
    let steps = drain(&mut rx);
    assert_eq!(steps[0].kind, StepKind::SchemaError); // recovery, NOT ForbiddenCall
    assert_eq!(steps.last().unwrap().kind, StepKind::EndStateReached);
}

#[tokio::test]
async fn duplicate_calls_in_a_turn_consume_at_most_one_checkpoint_each() {
    // Two IDENTICAL wildcard checkpoints; consume-once means a single matching call
    // satisfies only ONE — two calls are needed (no double-credit across the array).
    let sandbox = DeterministicSandbox::new(
        "Log two denials.".into(),
        vec![],
        vec![],
        EndStateRule::RequireAll(vec![
            TaskCheckpoint { tool: "log".into(), args: json!({ "reason": "*denied*" }) },
            TaskCheckpoint { tool: "log".into(), args: json!({ "reason": "*denied*" }) },
        ]),
    );
    // One call → only one checkpoint (the loop caps at max_steps=1 without completing).
    let one = ScriptedModel::new(vec![(r#"{"name":"log","args":{"reason":"denied: a"}}"#, 5)]);
    let (tx, _rx) = unbounded_channel();
    let solo = run_once(&one, &sandbox, 1, 2, 0, &tx).await.unwrap();
    assert!(!solo.reached_end);
    // Two DISTINCT calls (both glob `*denied*`) in one turn → both consumed → success.
    // Distinct args matter: `extract_calls` collapses byte-identical calls, so two
    // identical lines would dedup to one — the consume-once guard is what's under test.
    let two = ScriptedModel::new(vec![(
        r#"[{"name":"log","args":{"reason":"denied: a"}},{"name":"log","args":{"reason":"denied: b"}}]"#,
        9,
    )]);
    let (tx2, _rx2) = unbounded_channel();
    let outcome = run_once(&two, &sandbox, 8, 2, 0, &tx2).await.unwrap();
    assert!(outcome.reached_end);
    assert_eq!(outcome.steps, 1);
}

#[tokio::test]
async fn worldstate_multi_call_actions_each_ack_not_echo_entity() {
    // Mirrors es_co_branch_target. open_pr is an ACTION (returns_entity:false → excluded
    // from entity_tools); the model batches TWO open_pr calls in ONE turn. The reported
    // trace showed each echoing {"kind":...} (the pre-fix entity leak). Current code MUST
    // ack {"ok":true} per call — proving Fix 2's ack gate composes with Fix 1's multi-call
    // loop, the seam the existing tests never exercised together (parallel_calls only
    // checks the kind; dep_pin_style uses StaticMocks, not the WorldState ack gate).
    let sandbox = DeterministicSandbox::new(
        "Open 2 PRs by change type.".into(),
        vec![],
        vec![],
        EndStateRule::RequireAll(vec![
            TaskCheckpoint { tool: "get_change".into(), args: json!({ "id": "C-1" }) },
            TaskCheckpoint { tool: "open_pr".into(), args: json!({ "change": "C-1", "base": "release" }) },
            TaskCheckpoint { tool: "get_change".into(), args: json!({ "id": "C-2" }) },
            TaskCheckpoint { tool: "open_pr".into(), args: json!({ "change": "C-2", "base": "develop" }) },
        ]),
    )
    .with_world_state(json!({ "C-1": { "kind": "hotfix" }, "C-2": { "kind": "feature" } }))
    .with_entity_tools(["get_change".to_string()]); // open_pr is NOT a getter → must ack

    let model = ScriptedModel::new(vec![
        (r#"[{"name":"open_pr","args":{"change":"C-1","base":"release"}},{"name":"open_pr","args":{"change":"C-2","base":"develop"}}]"#, 20),
        ("I have successfully opened the Pull Requests.", 10),
    ]);
    let (tx, mut rx) = unbounded_channel();
    let outcome = run_once(&model, &sandbox, 8, 2, 0, &tx).await.unwrap();
    drop(tx);
    let steps = drain(&mut rx);

    // (1) BOTH actions ack — no entity blob leaked. This is the composition the trace doubted.
    let inj = steps[0].injection.as_deref().unwrap();
    assert_eq!(inj, "Tool result: {\"ok\":true}\nTool result: {\"ok\":true}");
    assert!(!inj.contains("kind"), "action tool leaked entity data: {inj}");

    // (2) The run still FAILS honestly: the model skipped both get_change discovery
    // checkpoints (2/4 satisfied), so it's Hallucinated — NOT a pass laundered by a leak.
    assert!(!outcome.reached_end);
    assert_eq!(outcome.failure, Some(FailureKind::Hallucinated));
}

#[tokio::test]
async fn worldstate_run_tests_surfaces_the_failing_test_name_through_the_getter() {
    // Mirrors es_co_run_failing_test's reachability repair: the failing-test name lives in
    // world_state under `cart.failing`, and run_tests{module:"cart"} must SURFACE it through
    // the getter path (derive_response over the WorldState responder) — NOT via a static mock
    // or the oracle's concretized replay. This guards live-gate Item 2, which gemma couldn't
    // confirm because it malformed out before ever calling run_tests. Converts "unverifiable
    // until a plain-JSON model happens to run it" into a build-time guarantee.
    let sandbox = DeterministicSandbox::new(
        "Run the test suite for 'cart' and report which test failed.".into(),
        vec![],
        vec![],
        EndStateRule::RequireAll(vec![
            TaskCheckpoint { tool: "run_tests".into(), args: json!({ "module": "cart" }) },
            TaskCheckpoint { tool: "reply".into(), args: json!({ "text": "*test_total_with_tax*" }) },
        ]),
    )
    .with_world_state(json!({ "cart": { "result": "fail", "failing": "test_total_with_tax" } }))
    .with_entity_tools(["run_tests".to_string()]); // run_tests is a getter; reply acks

    let model = ScriptedModel::new(vec![
        (r#"[{"name":"run_tests","args":{"module":"cart"}}]"#, 15),
        (r#"[{"name":"reply","args":{"text":"The failing test is test_total_with_tax."}}]"#, 15),
    ]);
    let (tx, mut rx) = unbounded_channel();
    let outcome = run_once(&model, &sandbox, 8, 2, 0, &tx).await.unwrap();
    drop(tx);
    let steps = drain(&mut rx);

    // Reachability: the run_tests injection surfaced the discovered-only fact, so a real
    // plain-JSON model could echo it instead of hallucinating it.
    let surfaced = steps[0].injection.as_deref().unwrap();
    assert!(surfaced.contains("test_total_with_tax"), "getter did not surface the fact: {surfaced}");
    // End to end: echoing the surfaced name reaches the end state honestly (no oracle replay).
    assert!(outcome.reached_end);
}

#[tokio::test]
async fn single_element_array_matches_a_bare_object() {
    // N=1 parity (issue 6): `[{call}]` must stream byte-identically to a bare `{call}` —
    // same kinds, same injection bytes, same step count as `reaches_end_state_after_a_tool_call`.
    let model = ScriptedModel::new(vec![
        (r#"[{"name":"get_balance","args":{"account_id":"ACC-123"}}]"#, 40),
        (r#"[{"name":"execute_transfer","args":{"amount":450.0}}]"#, 30),
    ]);
    let (tx, mut rx) = unbounded_channel();
    let outcome = run_once(&model, &sandbox(), 8, 2, 0, &tx).await.unwrap();
    drop(tx);
    assert!(outcome.reached_end);
    assert_eq!(outcome.steps, 2);
    let steps = drain(&mut rx);
    assert_eq!(steps.len(), 2);
    assert_eq!(steps[0].kind, StepKind::ToolCall);
    assert_eq!(steps[0].injection.as_deref(), Some(r#"Tool result: {"balance":450.0}"#));
    assert_eq!(steps[1].kind, StepKind::EndStateReached);
    assert_eq!(steps[1].injection, None);
}
