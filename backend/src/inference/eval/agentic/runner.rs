use crate::errors::AppResult;
use crate::inference::eval::agentic::context::{tool_result_line, Conversation};
use crate::inference::eval::agentic::endstate;
use crate::inference::eval::agentic::model_turn::ModelTurn;
use crate::inference::eval::agentic::report::{AgenticReport, FailureKind, RunOutcome};
use crate::inference::eval::agentic::sandbox::{DeterministicSandbox, EndStateRule, SandboxState};
use crate::inference::eval::agentic::step::{StepKind, TrajectoryStep};
use crate::inference::eval::toolcall::parse::{extract_calls, looks_like_broken_json};
use crate::inference::eval::toolcall::prompt::build_system_for;
use crate::inference::generate::generate_options::GenerateOptions;
use crate::inference::generate::generate_spec::GenerateSpec;
use tokio::sync::mpsc::UnboundedSender;

const MAX_TOKENS: u32 = 256;
const UNKNOWN_TOOL: &str =
    "Tool not found or arguments unrecognized. Choose a tool from the provided schema.";

/// Pass^k inputs: how many independent runs (default 5), the per-run step cap, and
/// the per-run semantic-recovery budget (how many schema errors a run may correct
/// before it's scored MalformedSchema).
pub struct AgenticConfig {
    pub k: u32,
    pub max_steps: u32,
    pub max_recovery: u8,
}

impl Default for AgenticConfig {
    fn default() -> Self {
        Self { k: 5, max_steps: 10, max_recovery: 2 }
    }
}

/// The Pass^k consistency engine: run the agentic loop `k` times and fold the
/// outcomes into an `AgenticReport`. Each `run_once` builds a fresh transcript and
/// token counter over the shared (immutable) sandbox — absolute isolation, no
/// state bleed between iterations.
///
/// A per-run backend error (e.g. Ollama timed out or crashed on one of the k
/// attempts) does NOT abort the batch: that run is skipped and the remaining
/// attempts still execute, then the report folds the runs that completed. An infra
/// fault is not a model task-failure, so a skipped run never reaches the
/// denominator. Only when EVERY run errored does the error propagate — the task
/// then shows as Error and re-runs on resume (the backend is genuinely down).
pub async fn run_agentic<M: ModelTurn>(
    turn: &M,
    sandbox: &DeterministicSandbox,
    config: AgenticConfig,
    tx: &UnboundedSender<TrajectoryStep>,
) -> AppResult<AgenticReport> {
    let mut outcomes = Vec::with_capacity(config.k as usize);
    let mut last_err = None;
    for run_index in 0..config.k {
        match run_once(turn, sandbox, config.max_steps, config.max_recovery, run_index, tx).await {
            Ok(outcome) => outcomes.push(outcome),
            Err(e) => last_err = Some(e),
        }
    }
    if outcomes.is_empty() {
        if let Some(e) = last_err {
            return Err(e);
        }
    }
    Ok(AgenticReport::from_outcomes(&outcomes))
}

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
    max_recovery: u8,
    run_index: u32,
    tx: &UnboundedSender<TrajectoryStep>,
) -> AppResult<RunOutcome> {
    let system = build_system_for(&sandbox.tools);
    let mut convo = Conversation::new(sandbox.initial_prompt.clone());
    let mut output_tokens = 0u32;
    let mut next_cp = 0usize; // progress through a RequireSequence end-state
    let mut state = SandboxState::new(); // per-run fault attempt counters (Driver B)
    let mut recoveries = 0u8; // schema corrections used this run (Driver D)
    let mut hit_schema_error = false; // this run emitted a schema-invalid call
    let mut schema_recovered = false; // ...and later produced a valid one

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
            Some(call) => match &sandbox.end_state {
                // Acted (called a tool) when the task wanted a plain-text
                // abstention — declining was correct, so this is a failure.
                EndStateRule::ExpectAbstainingText => {
                    send(StepKind::HallucinatedCompletion, None);
                    return Ok(RunOutcome::failure(step_index + 1, output_tokens, FailureKind::Hallucinated));
                }
                EndStateRule::RequireSequence(checkpoints) => {
                    // Driver D: SEMANTIC validation precedes everything (only when the
                    // task declares tool schemas to validate against). An invalid call
                    // gets a precise correction injected and burns one recovery;
                    // exhausting the budget ends the run as MalformedSchema.
                    if !sandbox.tools.is_empty() {
                        if let Err(msg) = endstate::validate_call(&call, &sandbox.tools) {
                            hit_schema_error = true;
                            if recoveries >= max_recovery {
                                send(StepKind::SchemaError, None); // terminal: budget spent
                                return Ok(RunOutcome::failure(
                                    step_index + 1,
                                    output_tokens,
                                    FailureKind::MalformedSchema,
                                )
                                .with_schema(true, false));
                            }
                            recoveries += 1;
                            let err = format!("[Schema error: {msg}]");
                            let line = tool_result_line(&err);
                            convo.push_model(&raw);
                            convo.push_tool_result(&err);
                            send(StepKind::SchemaError, Some(line));
                            continue;
                        }
                        // A schema-valid call after a prior schema error is the recovery.
                        if hit_schema_error && !schema_recovered {
                            schema_recovered = true;
                        }
                    }
                    // Driver B: a fault trap fires BEFORE any checkpoint advance, so a
                    // trapped call can never be a fake pass. Inject the HTTP-style
                    // error and continue — a robust agent retries (transient) or
                    // reports the failure (persistent) on the next turn.
                    if let Some(err) = state.fault_for(&call, &sandbox.faults) {
                        let line = tool_result_line(&err);
                        convo.push_model(&raw);
                        convo.push_tool_result(&err);
                        send(StepKind::ToolError, Some(line));
                        continue;
                    }
                    let advances = endstate::checkpoint_matches(&checkpoints[next_cp], &call);
                    if advances && next_cp + 1 == checkpoints.len() {
                        send(StepKind::EndStateReached, None); // final checkpoint hit
                        return Ok(RunOutcome::success(step_index + 1, output_tokens)
                            .with_schema(hit_schema_error, schema_recovered));
                    }
                    if advances {
                        next_cp += 1; // intermediate checkpoint reached, keep going
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
            },
            None => match &sandbox.end_state {
                // Declined to call any tool, exactly as the task demanded.
                EndStateRule::ExpectAbstainingText => {
                    send(StepKind::EndStateReached, None);
                    return Ok(RunOutcome::success(step_index + 1, output_tokens));
                }
                EndStateRule::RequireSequence(_) => {
                    let (kind, failure) = if looks_like_broken_json(&raw) {
                        (StepKind::MalformedJson, FailureKind::Malformed)
                    } else {
                        (StepKind::HallucinatedCompletion, FailureKind::Hallucinated)
                    };
                    send(kind, None);
                    return Ok(RunOutcome::failure(step_index + 1, output_tokens, failure)
                        .with_schema(hit_schema_error, schema_recovered));
                }
            },
        }
    }

    let _ = tx.send(TrajectoryStep {
        run_index,
        step_index: max_steps,
        raw_output: String::new(),
        injection: None,
        kind: StepKind::InfiniteLoop,
    });
    Ok(RunOutcome::failure(max_steps, output_tokens, FailureKind::InfiniteLoop)
        .with_schema(hit_schema_error, schema_recovered))
}

#[cfg(test)]
#[path = "runner_tests.rs"]
mod tests;
