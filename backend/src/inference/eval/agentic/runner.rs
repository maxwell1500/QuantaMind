use crate::errors::AppResult;
use crate::inference::eval::agentic::context::{tool_result_line, Conversation};
use crate::inference::eval::agentic::endstate;
use crate::inference::eval::agentic::model_turn::ModelTurn;
use crate::inference::eval::agentic::report::{FailureKind, RunOutcome};
use crate::inference::eval::agentic::sandbox::DeterministicSandbox;
use crate::inference::eval::agentic::step::{StepKind, TrajectoryStep};
use crate::inference::eval::toolcall::parse::{extract_calls, looks_like_broken_json};
use crate::inference::eval::toolcall::prompt::build_system_for;
use crate::inference::generate::generate_options::GenerateOptions;
use crate::inference::generate::generate_spec::GenerateSpec;
use tokio::sync::mpsc::UnboundedSender;

const MAX_TOKENS: u32 = 256;
const UNKNOWN_TOOL: &str =
    "Tool not found or arguments unrecognized. Choose a tool from the provided schema.";

/// Run ONE agentic attempt: the stateful `while step < max_steps` loop (iterative,
/// no async recursion). Each turn it sends the running transcript to the model,
/// parses a JSON tool call, looks it up in the sandbox, and injects the
/// deterministic result back as text. Fires a `TrajectoryStep` per turn into `tx`.
/// Terminates on the EndStateRule (success), a model yield (hallucinated/malformed
/// failure), or the step cap (infinite loop).
pub async fn run_once<M: ModelTurn>(
    turn: &M,
    sandbox: &DeterministicSandbox,
    max_steps: u32,
    run_index: u32,
    tx: &UnboundedSender<TrajectoryStep>,
) -> AppResult<RunOutcome> {
    let system = build_system_for(&sandbox.tools);
    let mut convo = Conversation::new(sandbox.initial_prompt.clone());
    let mut output_tokens = 0u32;

    for step_index in 0..max_steps {
        let spec = GenerateSpec {
            model: String::new(),
            prompt: convo.render(),
            system: Some(system.clone()),
            options: Some(GenerateOptions {
                temperature: Some(0.0),
                num_predict: Some(MAX_TOKENS),
                ..Default::default()
            }),
            keep_alive: None,
        };
        let (raw, stats) = turn.run(&spec).await?;
        output_tokens += stats.eval_count.unwrap_or(0);
        let send = |kind: StepKind, injection: Option<String>| {
            let _ = tx.send(TrajectoryStep { run_index, step_index, raw_output: raw.clone(), injection, kind });
        };

        match extract_calls(&raw).and_then(|c| c.into_iter().next()) {
            Some(call) => {
                if endstate::satisfied(&sandbox.end_state, &call) {
                    send(StepKind::EndStateReached, None);
                    return Ok(RunOutcome::success(step_index + 1, output_tokens));
                }
                let (kind, result) = match sandbox.respond(&call) {
                    Some(r) => (StepKind::ToolCall, r.to_string()),
                    None => (StepKind::UnknownTool, UNKNOWN_TOOL.to_string()),
                };
                let line = tool_result_line(&result);
                convo.push_model(&raw);
                convo.push_tool_result(&result);
                send(kind, Some(line));
            }
            None => {
                let (kind, failure) = if looks_like_broken_json(&raw) {
                    (StepKind::MalformedJson, FailureKind::Malformed)
                } else {
                    (StepKind::HallucinatedCompletion, FailureKind::Hallucinated)
                };
                send(kind, None);
                return Ok(RunOutcome::failure(step_index + 1, output_tokens, failure));
            }
        }
    }

    let _ = tx.send(TrajectoryStep {
        run_index,
        step_index: max_steps,
        raw_output: String::new(),
        injection: None,
        kind: StepKind::InfiniteLoop,
    });
    Ok(RunOutcome::failure(max_steps, output_tokens, FailureKind::InfiniteLoop))
}

#[cfg(test)]
#[path = "runner_tests.rs"]
mod tests;
