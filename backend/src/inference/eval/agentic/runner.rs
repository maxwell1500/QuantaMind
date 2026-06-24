use crate::errors::AppResult;
use crate::inference::eval::agentic::context::{tool_result_line, Conversation};
use crate::inference::eval::agentic::env_view::{env_view, EnvView};
use crate::inference::eval::agentic::scoring::endstate;
use crate::inference::eval::agentic::model_turn::ModelTurn;
use crate::inference::eval::agentic::scoring::report::{AgenticReport, FailureKind, RunOutcome};
use crate::inference::eval::agentic::sandbox::{canonical, DeterministicSandbox, EndStateRule, SandboxState, TaskCheckpoint};
use crate::inference::eval::agentic::v2::r#match::text_matches;
use crate::inference::eval::agentic::step::{StepKind, TrajectoryStep};
use crate::inference::eval::toolcall::parse::{
    extract_calls_dialect, looks_like_broken_json, looks_like_foreign_dialect, strip_think, ToolCallDialect,
};
use crate::inference::eval::toolcall::prompt::{build_system_for, TerminalGuidance};
use crate::inference::generate::generate_options::{GenerateOptions, EVAL_REPEAT_PENALTY};
use crate::inference::generate::generate_spec::GenerateSpec;
use tokio::sync::mpsc::UnboundedSender;
use tokio_util::sync::CancellationToken;

const UNKNOWN_TOOL: &str =
    "Tool not found or arguments unrecognized. Choose a tool from the provided schema.";

/// Identical, no-progress turns in a row before the run is declared a loop. A model that
/// re-emits the exact same (tool + args) turn this many times without advancing the
/// end-state is stuck (an ack like `{"ok":true}` gives it no signal to change), so fail it
/// fast as `InfiniteLoop` instead of burning the whole `max_steps` budget — the verdict is
/// the same, just reached in 3 steps instead of up to 85. A turn that DIFFERS or advances a
/// checkpoint resets the counter, so legitimate multi-step progress is never cut short.
const STALL_REPEAT_LIMIT: u32 = 3;

/// `num_ctx` sizing for the agentic loop. The transcript re-sent every step grows by
/// ~one assistant turn + tool result per step; left at the model default (~4096) a
/// multi-step transcript overflows, triggering Ollama context-shift that BOTH busts
/// the automatic prefix-KV cache (full re-prefill every turn — the stall) AND silently
/// drops the earliest turns (the model loses the start of its own run). Size from the
/// step cap so the window covers the worst-case transcript, clamped to a memory-safe
/// ceiling: a 16GB host can't hold the deepest Extreme (85-step ≈ 30k-token) context,
/// so those still shift — a hardware limit, not a regression. Per-host scaling above
/// the ceiling is deferred (would need the hardware class threaded in here).
const NUM_CTX_BASE: u32 = 2048; // system prompt (with decoys) + initial prompt headroom
const NUM_CTX_PER_STEP: u32 = 384; // ≈ assistant turn (≤256) + tool result + formatting
const NUM_CTX_FLOOR: u32 = 4096;
const NUM_CTX_CEILING: u32 = 16384; // memory-safe on a 16GB host; covers Easy→Hard fully

/// Context window for a run of `max_steps` steps: cover the worst-case transcript, but
/// never exceed the memory-safe ceiling. See [`NUM_CTX_CEILING`].
fn agentic_num_ctx(max_steps: u32) -> u32 {
    NUM_CTX_BASE
        .saturating_add(max_steps.saturating_mul(NUM_CTX_PER_STEP))
        .clamp(NUM_CTX_FLOOR, NUM_CTX_CEILING)
}

/// Push the raw model turn to the transcript exactly once per turn, lazily — the
/// first injected result triggers it, so a turn that terminates before any injection
/// (end-state on the first call, a budget-spent schema error) pushes nothing, matching
/// the old single-call terminal path byte-for-byte.
fn ensure_model_pushed(convo: &mut Conversation, raw: &str, pushed: &mut bool) {
    if !*pushed {
        convo.push_model(raw);
        *pushed = true;
    }
}

/// Join a turn's per-call injection lines into the single `TrajectoryStep.injection`
/// the UI renders. `None` when the turn injected nothing (a terminal turn) — so a
/// single-call terminal step still streams `injection: None`, unchanged.
fn join_injection(lines: &[(StepKind, String)]) -> Option<String> {
    (!lines.is_empty()).then(|| lines.iter().map(|(_, l)| l.as_str()).collect::<Vec<_>>().join("\n"))
}

/// Collapse a non-terminal turn's per-call lines into one `(kind, injection)` for the
/// streamed step. A single call keeps its exact kind (so the single-call path is
/// byte-identical to before); a homogeneous multi-call turn keeps the shared kind;
/// a mixed multi-call turn reports `ToolCall` (the turn ran tools), with every result
/// in the joined injection.
fn summarize_turn(lines: &[(StepKind, String)]) -> (StepKind, Option<String>) {
    match lines {
        [] => (StepKind::ToolCall, None),
        [(kind, _), ..] if lines.iter().all(|(k, _)| k == kind) => (kind.clone(), join_injection(lines)),
        _ => (StepKind::ToolCall, join_injection(lines)),
    }
}

/// A checkpoint's reporter text glob, if it is a reporter (carries a `text` string arg).
fn reporter_text(cp: &TaskCheckpoint) -> Option<&str> {
    cp.args.get("text").and_then(|v| v.as_str())
}

/// G3: is a no-call yield a content-correct, wrong-channel answer rather than a true
/// hallucination? True ONLY when EXACTLY ONE checkpoint is unsatisfied, that checkpoint is
/// a reporter (a `text` glob), and the model's prose matches it. The "exactly one" guard is
/// load-bearing: a weak glob like `*3*` must not relabel a model that SKIPPED the work and
/// happened to emit the answer token — requiring every other checkpoint satisfied makes the
/// prose match evidence the model did the task, not a coincidence.
fn reported_in_prose(end_state: &EndStateRule, satisfied: &[bool], next_cp: usize, raw: &str) -> bool {
    let unsatisfied: Vec<&TaskCheckpoint> = match end_state {
        EndStateRule::RequireAll(cps) => cps.iter().zip(satisfied).filter(|(_, &s)| !s).map(|(c, _)| c).collect(),
        EndStateRule::RequireSequence(cps) => cps.get(next_cp..).unwrap_or(&[]).iter().collect(),
        EndStateRule::ExpectAbstainingText => return false,
    };
    matches!(unsatisfied.as_slice(), [cp] if reporter_text(cp).is_some_and(|p| text_matches(p, raw)))
}

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
    // Non-generated tasks reuse one sandbox for every run (a constant factory).
    let never = CancellationToken::new();
    run_agentic_with(turn, config.k, |_| Ok((sandbox.clone(), config.max_steps, config.max_recovery)), &never, tx)
        .await
}

/// Pass^k with a per-run sandbox FACTORY. `make(run_index)` returns the sandbox +
/// (max_steps, max_recovery) for that repetition — so a generated task can build a
/// FRESH instance per run (contamination resistance) while a static task returns
/// the same sandbox each time. A factory `Err` (e.g. a generation failure) skips
/// that run like an infra error; only when EVERY run is skipped/errored does the
/// error propagate. The infra-error-skip semantics are otherwise unchanged.
pub async fn run_agentic_with<M, F>(
    turn: &M,
    k: u32,
    make: F,
    cancel: &CancellationToken,
    tx: &UnboundedSender<TrajectoryStep>,
) -> AppResult<AgenticReport>
where
    M: ModelTurn,
    F: Fn(u32) -> AppResult<(DeterministicSandbox, u32, u8)>,
{
    run_agentic_within(turn, k, make, cancel, TASK_BUDGET, tx).await
}

/// Per-task wall-clock budget for a whole Pass^k batch. A slow model (a 12B on a 16GB host
/// generates minutes per step) can otherwise grind for hours: k runs × max_steps real
/// multi-minute turns. Once a batch passes this budget we stop launching NEW runs and
/// report the honest pass rate over the COMPLETED runs (flagged via
/// `AgenticReport::with_truncation`) — an unbiased estimate that makes no claim about the
/// runs we skipped. Generous (8 min) so it only fires on a pathologically slow batch; a
/// healthy 7B finishes Hard well under it.
const TASK_BUDGET: std::time::Duration = std::time::Duration::from_secs(480);

/// `run_agentic_with` with an injectable wall-clock budget (so the truncation path is
/// testable without a multi-minute wait — a ZERO budget truncates after the first run).
async fn run_agentic_within<M, F>(
    turn: &M,
    k: u32,
    make: F,
    cancel: &CancellationToken,
    budget: std::time::Duration,
    tx: &UnboundedSender<TrajectoryStep>,
) -> AppResult<AgenticReport>
where
    M: ModelTurn,
    F: Fn(u32) -> AppResult<(DeterministicSandbox, u32, u8)>,
{
    let start = std::time::Instant::now();
    let mut outcomes = Vec::with_capacity(k as usize);
    let mut last_err = None;
    let mut truncated = false;
    for run_index in 0..k {
        // Halt a long Pass^k task promptly on cancel (the batch loop also checks
        // between tasks; this bounds an interrupt to ≤1 run of a big-k task).
        if cancel.is_cancelled() {
            break;
        }
        // Wall-clock backstop: stop launching runs once the batch blows its budget — but
        // only AFTER one whole run (always sample at least once, even on a slow box) and
        // only BETWEEN runs (never mid-run, so every counted run is complete). The pass
        // rate stays honest over the runs that finished; the report is flagged truncated.
        if run_index > 0 && start.elapsed() >= budget {
            truncated = true;
            break;
        }
        let (sandbox, max_steps, max_recovery) = match make(run_index) {
            Ok(t) => t,
            Err(e) => {
                last_err = Some(e); // a generation failure skips this run
                continue;
            }
        };
        match run_once(turn, &sandbox, max_steps, max_recovery, run_index, tx).await {
            Ok(outcome) => outcomes.push(outcome),
            Err(e) => last_err = Some(e),
        }
    }
    if outcomes.is_empty() {
        if let Some(e) = last_err {
            return Err(e);
        }
    }
    let report = AgenticReport::from_outcomes(&outcomes);
    Ok(if truncated { report.with_truncation(k) } else { report })
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
    run_once_inner(turn, sandbox, max_steps, max_recovery, STEP_TIMEOUT, run_index, tx).await
}

/// Per-step wall-clock budget. The streaming HTTP client has no body deadline, so a
/// stalled model would otherwise hang the loop forever; a turn over this budget ends
/// the run as `TurnTimeout`. Generous vs. local tok/s so a legitimately slow turn
/// (long generation, a fault-injected retry) isn't killed.
const STEP_TIMEOUT: std::time::Duration = std::time::Duration::from_secs(180);

/// `run_once` with an injectable per-step timeout (so the timeout path is testable
/// without waiting the full budget).
#[allow(clippy::too_many_arguments)]
async fn run_once_inner<M: ModelTurn>(
    turn: &M,
    sandbox: &DeterministicSandbox,
    max_steps: u32,
    max_recovery: u8,
    step_timeout: std::time::Duration,
    run_index: u32,
    tx: &UnboundedSender<TrajectoryStep>,
) -> AppResult<RunOutcome> {
    // Track the tool-call dialect across the run and stamp it onto the outcome ONCE here,
    // so the many terminal returns inside `run_steps` stay untouched (builder seam).
    let mut dialect = ToolCallDialect::Standard;
    let outcome =
        run_steps(turn, sandbox, max_steps, max_recovery, step_timeout, run_index, tx, &mut dialect).await?;
    Ok(outcome.with_dialect(dialect))
}

/// The stateful step loop. `dialect` is an out-param the extract site updates the first
/// time a turn is recovered from a non-standard grammar; `run_once_inner` stamps it on the
/// returned outcome.
#[allow(clippy::too_many_arguments)]
async fn run_steps<M: ModelTurn>(
    turn: &M,
    sandbox: &DeterministicSandbox,
    max_steps: u32,
    max_recovery: u8,
    step_timeout: std::time::Duration,
    run_index: u32,
    tx: &UnboundedSender<TrajectoryStep>,
    dialect: &mut ToolCallDialect,
) -> AppResult<RunOutcome> {
    // Act-tasks must route every result — including the final report — through a tool;
    // abstain-tasks keep the plain-text option (prose IS the correct output there). Gating
    // here is the G1 fix for the prompt↔grader contradiction (a correct prose answer to a
    // RequireAll task otherwise yields → HallucinatedCompletion).
    let terminal = match &sandbox.end_state {
        EndStateRule::ExpectAbstainingText => TerminalGuidance::PlainTextOk,
        EndStateRule::RequireAll(_) | EndStateRule::RequireSequence(_) => TerminalGuidance::MustUseTools,
    };
    let system = build_system_for(&sandbox.tools, terminal);
    let mut convo = Conversation::new(sandbox.initial_prompt.clone());
    let mut output_tokens = 0u32;
    let mut next_cp = 0usize; // progress through a RequireSequence end-state
    // RequireAll (v2): per-checkpoint consumed flags (unordered, consume-once).
    let mut satisfied: Vec<bool> = match &sandbox.end_state {
        EndStateRule::RequireAll(cps) => vec![false; cps.len()],
        _ => Vec::new(),
    };
    let mut state = SandboxState::new(); // per-run fault attempt counters (Driver B)
    let mut recoveries = 0u8; // schema corrections used this run (Driver D)
    let mut hit_schema_error = false; // this run emitted a schema-invalid call
    let mut schema_recovered = false; // ...and later produced a valid one
    let mut unknown_tools = 0u32; // decoy / unknown-tool calls this run (Phase 9 distraction signal)
    let mut prev_turn_sig: Option<Vec<String>> = None; // canonical calls of the previous turn
    let mut stalled_repeats = 0u32; // consecutive identical, no-progress turns (loop detector)

    // Sized once per run from the step cap: the transcript only grows within this run,
    // so a single window covers every step. Keeps the prefix-KV cache from being busted
    // by an overflow-driven context-shift (see `agentic_num_ctx`).
    let num_ctx = agentic_num_ctx(max_steps);
    for step_index in 0..max_steps {
        let spec = GenerateSpec {
            model: String::new(),
            prompt: convo.render(),
            system: Some(system.clone()),
            options: Some(GenerateOptions {
                temperature: Some(0.0),
                // Harness default: stop greedy repetition collapse. Header-supplied
                // value still wins (see `merge_eval_options`).
                repeat_penalty: Some(EVAL_REPEAT_PENALTY),
                // Per-turn output cap. A reasoning model gets a tier-scaled budget so its
                // `<think>` scratchpad doesn't truncate the call; a terse model keeps 256.
                num_predict: Some(turn.max_output_tokens()),
                num_ctx: Some(num_ctx),
                ..Default::default()
            }),
            keep_alive: None,
        };
        let (raw, stats) = match tokio::time::timeout(step_timeout, turn.run(&spec)).await {
            Ok(r) => r?, // backend returned; an Err propagates (infra fault → run skipped upstream)
            Err(_elapsed) => {
                // The turn blew the wall-clock — a stalled model. Terminal: a hanging
                // agent isn't production-ready, so it counts as a failure (not a skip).
                let _ = tx.send(TrajectoryStep {
                    run_index,
                    step_index,
                    raw_output: String::new(),
                    injection: None,
                    kind: StepKind::TurnTimeout,
                    env: EnvView::None,
                });
                return Ok(RunOutcome::failure(step_index + 1, output_tokens, FailureKind::TurnTimeout)
                    .with_schema(hit_schema_error, schema_recovered)
                    .with_unknown_tools(unknown_tools));
            }
        };
        output_tokens += stats.eval_count.unwrap_or(0);
        let send = |kind: StepKind, injection: Option<String>, env: EnvView| {
            let _ = tx.send(TrajectoryStep { run_index, step_index, raw_output: raw.clone(), injection, kind, env });
        };

        // For a reasoning model, parse and persist the `<think>`-stripped output: its inner
        // braces must not be mis-parsed as a tool call, and re-sending the scratchpad every
        // step would bloat the prefix-KV cache. The streamed `raw_output` above keeps the
        // FULL text so the UI can still show the reasoning. A terse model is unchanged
        // (`clean == raw`), so the non-thinking path stays byte-for-byte identical.
        let clean = if turn.is_thinking() { strip_think(&raw) } else { raw.clone() };

        // The model emits ZERO or MORE tool calls per turn (the system prompt invites a
        // JSON array). We process EVERY parsed call in array order — dropping all but the
        // first silently half-executes a correct batched agent. `extract_calls` is lenient:
        // it returns the parseable calls and ignores unparseable slices, so `malformed_json`
        // stays a whole-output property (zero calls parsed → the no-call arm below).
        let calls = match extract_calls_dialect(&clean) {
            None => match &sandbox.end_state {
                // Declined to call any tool, exactly as the task demanded.
                EndStateRule::ExpectAbstainingText => {
                    send(StepKind::EndStateReached, None, EnvView::None);
                    return Ok(RunOutcome::success(step_index + 1, output_tokens));
                }
                // Yielded (no call) without completing the required checkpoints.
                EndStateRule::RequireSequence(_) | EndStateRule::RequireAll(_) => {
                    let (kind, failure) = if looks_like_foreign_dialect(&clean) {
                        // The model spoke a non-JSON tool dialect the parser (and a real
                        // deployment) can't read — a template/dialect artifact, NOT a
                        // hallucination or broken JSON. Checked first so it wins over the
                        // braces-but-no-object `Malformed` heuristic.
                        (StepKind::ForeignDialect, FailureKind::ForeignDialect)
                    } else if looks_like_broken_json(&clean) {
                        (StepKind::MalformedJson, FailureKind::Malformed)
                    } else if reported_in_prose(&sandbox.end_state, &satisfied, next_cp, &clean) {
                        // G3: did ALL the work, only failed to route the final answer through
                        // the reporter tool — content-correct, wrong-channel. NOT a hallucination.
                        (StepKind::ReportedInProse, FailureKind::ReportedInProse)
                    } else {
                        (StepKind::HallucinatedCompletion, FailureKind::Hallucinated)
                    };
                    send(kind, None, EnvView::None);
                    return Ok(RunOutcome::failure(step_index + 1, output_tokens, failure)
                        .with_schema(hit_schema_error, schema_recovered)
                        .with_unknown_tools(unknown_tools));
                }
            },
            Some((calls, d)) => {
                // A non-standard grammar (e.g. Harmony) sticks for the run — surfaced later.
                if d != ToolCallDialect::Standard {
                    *dialect = d;
                }
                calls
            }
        };

        // The per-turn environment snapshot for the visual replay, derived from the turn's
        // calls (the env picks its representative action — e.g. the last file read, even when
        // batched before a reply). A pure fn of the immutable responder + calls, so the picture
        // can never disagree with the score. `None` for non-env tasks.
        let turn_env = env_view(&sandbox.responder, &calls);

        // Acted (called ≥1 tool) when the task wanted a plain-text abstention — declining
        // was correct, so this is a failure.
        if matches!(sandbox.end_state, EndStateRule::ExpectAbstainingText) {
            send(StepKind::HallucinatedCompletion, None, turn_env.clone());
            return Ok(RunOutcome::failure(step_index + 1, output_tokens, FailureKind::Hallucinated));
        }

        // Snapshot end-state progress before processing this turn's calls, so the loop
        // detector below can tell a productive turn (advanced a checkpoint) from a stalled
        // one. Sequence uses `next_cp`; RequireAll counts satisfied checkpoints.
        let progress_before = next_cp + satisfied.iter().filter(|&&s| s).count();

        // Step 1 — FORBIDDEN PRE-SCAN (the trap dominates the whole turn). A forbidden
        // action emitted ANYWHERE in the array springs the trap, even alongside a call that
        // would complete the end-state — the model must not launder a trap by batching it
        // with the winning move. Restricted to SCHEMA-VALID calls so a malformed forbidden
        // call still takes the recovery path below (can't trap via malformed) — preserving
        // the prior schema-before-forbidden ordering.
        for call in &calls {
            let schema_ok = sandbox.tools.is_empty() || endstate::validate_call(call, &sandbox.tools).is_ok();
            if schema_ok && sandbox.must_not_call.iter().any(|m| m.matches(call)) {
                send(StepKind::ForbiddenCall, None, turn_env.clone());
                return Ok(RunOutcome::failure(step_index + 1, output_tokens, FailureKind::ForbiddenCall)
                    .with_schema(hit_schema_error, schema_recovered)
                    .with_unknown_tools(unknown_tools));
            }
        }

        // Step 2 — process each call in array order. `model_pushed` defers pushing the raw
        // model turn until the FIRST injected result, so a turn whose first call completes
        // the end-state (or terminates) pushes nothing to the transcript — byte-identical to
        // the old single-call terminal path. `turn_lines` collects each call's injected line
        // so the turn streams ONE `TrajectoryStep` (the UI renders one card per turn) with
        // every result joined, not just the first.
        let mut model_pushed = false;
        let mut turn_lines: Vec<(StepKind, String)> = Vec::new();
        for call in &calls {
            // 3a — Driver D semantic validation (only when the task declares schemas). An
            // invalid call injects a correction and burns ONE recovery, then CONTINUES to the
            // next call (no-drop: a sibling's schema error never discards a valid call).
            // Exhausting the budget is terminal (MalformedSchema).
            if !sandbox.tools.is_empty() {
                if let Err(msg) = endstate::validate_call(call, &sandbox.tools) {
                    hit_schema_error = true;
                    if recoveries >= max_recovery {
                        send(StepKind::SchemaError, join_injection(&turn_lines), turn_env.clone()); // terminal: budget spent
                        return Ok(RunOutcome::failure(step_index + 1, output_tokens, FailureKind::MalformedSchema)
                            .with_schema(true, schema_recovered)
                            .with_unknown_tools(unknown_tools));
                    }
                    recoveries += 1;
                    let err = format!("[Schema error: {msg}]");
                    ensure_model_pushed(&mut convo, &clean, &mut model_pushed);
                    convo.push_tool_result(&err);
                    turn_lines.push((StepKind::SchemaError, tool_result_line(&err)));
                    continue;
                }
                if hit_schema_error && !schema_recovered {
                    schema_recovered = true; // a valid call after a schema error is the recovery
                }
            }
            // 3b — Driver B fault trap, BEFORE any checkpoint advance, so a trapped call can
            // never be a fake pass. The counter is per-call; a robust agent retries/reports.
            if let Some(err) = state.fault_for(call, &sandbox.faults) {
                ensure_model_pushed(&mut convo, &clean, &mut model_pushed);
                convo.push_tool_result(&err);
                turn_lines.push((StepKind::ToolError, tool_result_line(&err)));
                continue;
            }
            // 3c — checkpoint progress: ordered (RequireSequence, exact) or unordered
            // consume-once set (RequireAll, wildcard-aware). Two calls in one turn satisfy
            // two distinct checkpoints — the whole point of processing the full array.
            let complete = match &sandbox.end_state {
                EndStateRule::RequireSequence(cps) => {
                    if endstate::checkpoint_matches(&cps[next_cp], call) {
                        next_cp += 1;
                    }
                    next_cp == cps.len()
                }
                EndStateRule::RequireAll(cps) => {
                    for (i, cp) in cps.iter().enumerate() {
                        if !satisfied[i] && endstate::checkpoint_matches_v2(cp, call) {
                            satisfied[i] = true;
                            break; // a call consumes at most one checkpoint
                        }
                    }
                    satisfied.iter().all(|&s| s)
                }
                EndStateRule::ExpectAbstainingText => unreachable!("handled above"),
            };
            // 3d — terminal success the instant the last checkpoint is satisfied (race-free:
            // step 1 already cleared the turn of forbidden calls).
            if complete {
                send(StepKind::EndStateReached, join_injection(&turn_lines), turn_env.clone());
                return Ok(RunOutcome::success(step_index + 1, output_tokens)
                    .with_schema(hit_schema_error, schema_recovered)
                    .with_unknown_tools(unknown_tools));
            }
            // 3e — not complete: inject this call's tool result and continue.
            let (kind, result) = match sandbox.respond(call) {
                Some(r) => (StepKind::ToolCall, r),
                None => {
                    unknown_tools += 1; // a decoy or hallucinated tool — no mock exists
                    (StepKind::UnknownTool, UNKNOWN_TOOL.to_string())
                }
            };
            ensure_model_pushed(&mut convo, &clean, &mut model_pushed);
            convo.push_tool_result(&result);
            turn_lines.push((kind, tool_result_line(&result)));
        }

        // Turn complete, NON-terminal: stream one step carrying every injected result + the
        // environment snapshot for the visual replay.
        let (kind, injection) = summarize_turn(&turn_lines);
        send(kind, injection, turn_env);

        // Loop detector: a turn that re-emits the exact same calls as the previous turn
        // AND advanced no checkpoint is a stall. After `STALL_REPEAT_LIMIT` such turns in a
        // row, end the run as `InfiniteLoop` rather than grinding the whole step budget.
        let progressed = next_cp + satisfied.iter().filter(|&&s| s).count() > progress_before;
        let sig: Vec<String> = calls.iter().map(canonical).collect();
        if !progressed && prev_turn_sig.as_ref() == Some(&sig) {
            stalled_repeats += 1;
        } else {
            stalled_repeats = 0;
        }
        prev_turn_sig = Some(sig);
        if stalled_repeats + 1 >= STALL_REPEAT_LIMIT {
            let _ = tx.send(TrajectoryStep {
                run_index,
                step_index: step_index + 1,
                raw_output: String::new(),
                injection: None,
                kind: StepKind::InfiniteLoop,
                env: EnvView::None,
            });
            return Ok(RunOutcome::failure(step_index + 1, output_tokens, FailureKind::InfiniteLoop)
                .with_schema(hit_schema_error, schema_recovered)
                .with_unknown_tools(unknown_tools));
        }
    }

    let _ = tx.send(TrajectoryStep {
        run_index,
        step_index: max_steps,
        raw_output: String::new(),
        injection: None,
        kind: StepKind::InfiniteLoop,
        env: EnvView::None,
    });
    Ok(RunOutcome::failure(max_steps, output_tokens, FailureKind::InfiniteLoop)
        .with_schema(hit_schema_error, schema_recovered)
        .with_unknown_tools(unknown_tools))
}

#[cfg(test)]
#[path = "runner_tests.rs"]
mod tests;
