use crate::errors::AppResult;
use crate::inference::eval::agentic::model_turn::ModelTurn;
use crate::inference::eval::agentic::runner::run_once;
use crate::inference::eval::agentic::sandbox::{DeterministicSandbox, EndStateRule, MockResponse};
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
        EndStateRule { tool: "execute_transfer".into(), args: json!({ "amount": 450.0 }) },
    )
}

#[tokio::test]
async fn reaches_end_state_after_a_tool_call() {
    let model = ScriptedModel::new(vec![
        (r#"{"name":"get_balance","args":{"account_id":"ACC-123"}}"#, 40),
        (r#"{"name":"execute_transfer","args":{"amount":450.0}}"#, 30),
    ]);
    let (tx, mut rx) = unbounded_channel();
    let outcome = run_once(&model, &sandbox(), 8, 0, &tx).await.unwrap();
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
    let outcome = run_once(&model, &sandbox(), 8, 0, &tx).await.unwrap();
    drop(tx);

    assert!(outcome.reached_end);
    assert_eq!(outcome.steps, 2);

    let steps = drain(&mut rx);
    assert_eq!(steps[0].kind, StepKind::UnknownTool);
    assert!(steps[0].injection.as_deref().unwrap().contains("Tool not found"));
    assert_eq!(steps[1].kind, StepKind::EndStateReached);
}
