# Backend — Evaluation Engine

The local-LLM evaluation subsystem: deterministic tool-call scoring, a sandboxed
multi-step agentic runner, a stoppable context-cliff probe, readiness / VRAM-fit
synthesis, and a crash-resumable batch queue. All inference-side logic is
Tauri-free and pure where possible; the `commands/eval/` layer is the thin IPC
skin that streams events and persists results.

Cross-links:
- Persistence of eval history, traces, cliff results, and readiness profiles →
  `backend-persistence.md`.
- The Eval UI (datasets, run, scoreboard, trajectory inspector) → `frontend-eval.md`.
- Readiness / Agent-Report / Inspector UI → `frontend-inspector-quant-agentreport.md`.

---

## Overview

### Why eval exists

Small local quants are unreliable at *structured* tasks — emitting a clean tool
call, selecting the right tool, getting args right, abstaining when no tool is
needed, staying coherent over multiple steps, and holding accuracy as context
grows. The eval engine measures these deterministically (no LLM judge, no
execution side effects) so the numbers are reproducible and never fabricated:
every metric is either a measured value or `None` (rendered "N/A"/"—"), never an
estimate or a 0 substituted for missing data.

### The four eval modes + readiness

| Mode | Entry | What it measures | Scoring |
|------|-------|------------------|---------|
| **Single tool-call** | `run_toolcall_eval` | One model over a collection: parse / tool-select / arg / abstain | `toolcall::score` + cascaded `aggregate` |
| **Matrix** | `run_collection_matrix` | Same collection across N models (sequential) | per-column `ToolCallReport` + mean composite |
| **Agentic** | inside `run_batch_eval` (tasks `category == "agentic"`) | Multi-step sandboxed tool loop, Pass^k reliability | `agentic::report::AgenticReport` |
| **Context-cliff** | `run_context_cliff` | Largest verified prompt-token depth before accuracy collapses | per-rung composite vs baseline |
| **Readiness** | `assess_readiness` | A measured batch report + cliff + VRAM fit vs a use-case profile → Ready/Conditional/NotReady | `readiness::verdict::assess` |

The **batch** mode (`run_batch_eval`) is the umbrella runner: it mixes single-turn
and agentic tasks across multiple models, isolates VRAM between models, streams
per-task/per-step progress, and is crash-resumable.

### How — IPC commands (all `#[tauri::command]`)

| Command | Module | Purpose |
|---------|--------|---------|
| `run_toolcall_eval` | toolcall_cmd | single-model tool-call eval over a collection |
| `trace_toolcall_task` / `load_toolcall_trace` | toolcall_cmd | live / cached single-task trace |
| `get_builtin_tasks` / `list_builtin_collections` / `get_builtin_collection` | toolcall_cmd | bundled preset catalog |
| `run_eval_task` | eval_run | one generic `EvalTask` (exact / MC / JSON-schema) |
| `list_evals` | evals_load | bundled `*.yaml` generic evals |
| `run_collection_matrix` / `load_collection_history` | matrix_cmd | N-model matrix + history |
| `run_batch_eval` / `stop_batch_eval` | batch_cmd | streaming batch run + cancel |
| `check_unfinished_run` / `resume_batch_eval` / `discard_run` | batch_cmd | crash-resume queue |
| `run_context_cliff` / `stop_context_cliff` | readiness_cmd | stoppable cliff probe + cancel |
| `save_cliff_result` / `get_cliff_results` | readiness_cmd | persisted cliff verdicts |
| `assess_readiness` | readiness_cmd | profile-gated verdicts |
| `list_readiness_profiles` / `save_readiness_profile` / `delete_readiness_profile` | readiness_cmd | profile CRUD |
| `list_custom_collections` / `load_custom_collection` / `save_custom_collection` / `delete_custom_collection` / `import_custom_collection` / `read_text_capped` | eval_registry | custom collection CRUD + import |

---

## Folder: `inference/eval/` (root)

### File: `mod.rs`
- **Responsibility:** Module root. **Why:** single import surface. **What:**
  `pub mod agentic; batch; cliff; eval_score; eval_task; readiness; toolcall;`.

### File: `eval_task.rs`
- **Responsibility:** The generic bundled-eval task type + its deterministic
  scoring rule enum.
- **Why:** A second, simpler eval family (`docs/evals/*.yaml`) independent of the
  tool-call engine — exact-match / multiple-choice / flat JSON-schema.
- **What:** `EvalTask { id, category, prompt, scoring: Scoring }`; tagged enum
  `Scoring::{ Exact{expected}, MultipleChoice{choices,expected}, JsonSchema{required,types} }`.
- **How/Where used:** loaded by `evals_load::load_all`, scored by `eval_score::score`,
  run by `eval_run::run_and_score`.

```rust
#[serde(tag = "method", rename_all = "snake_case")]
pub enum Scoring {
    Exact { expected: String },
    MultipleChoice { choices: Vec<String>, expected: String },
    JsonSchema { required: Vec<String>, #[serde(default)] types: BTreeMap<String, String> },
}
```

### File: `eval_score.rs`
- **Responsibility:** Pure deterministic scorer for generic `EvalTask`s.
- **Why:** No judge, no execution — a green test means the *output* matched the
  rule in shape and value.
- **What:** `EvalScore { passed, detail }`; `pub fn score(task, output) -> EvalScore`;
  `pub fn first_json_value(text) -> Option<Value>` (greedy balanced-brace extractor);
  privates `balanced_from`, `strip_fences`, `score_json` (flat depth-1 check),
  `first_choice` (whole-word token match), `type_matches`.
- **How/Where used:** `eval_run::run_and_score`.

**Greedy multi-object JSON extraction with balanced-brace detection** — scans for
the *first* `{` whose balanced slice actually parses, skipping prose braces:

```rust
pub fn first_json_value(text: &str) -> Option<Value> {
    for (i, &b) in text.as_bytes().iter().enumerate() {
        if b == b'{' {
            if let Some(slice) = balanced_from(text, i) {        // string/escape-aware
                if let Ok(v) = serde_json::from_str::<Value>(slice) { return Some(v); }
            }
        }
    }
    None
}
```

**Flat (depth-1) JSON-conformance** — required keys present + declared top-level
types match; no recursion into nested objects/arrays:

```rust
for key in required { if !obj.contains_key(key) { return fail(format!("missing key: {key}")); } }
for (key, ty) in types {
    match obj.get(key) {
        Some(v) if type_matches(v, ty) => {}
        Some(_) => return fail(format!("key '{key}' is not {ty}")),
        None    => return fail(format!("missing typed key: {key}")),
    }
}
```

---

## Folder: `inference/eval/toolcall/`

### File: `mod.rs`
- **Responsibility:** Module root: `eval, matrix, parse, prompt, score, tasks`.

### File: `tasks.rs`
- **Responsibility:** The tool-call task model + the trust-boundary validator + the
  bundled presets.
- **Why:** One validation gate for *any* collection source (built-in, saved,
  imported, hand-edited); validate untyped `Value` schemas by deserializing into a
  strict struct, not hand traversal.
- **What:** `ToolSchema{name,description,parameters}`, `Call{name,args}`,
  `Expected::{Call, Parallel{calls}, NoCall}` (with `.calls() -> Option<&[Call]>`),
  `ToolTask{id,category,prompt,tools,expected,agentic: Option<AgenticSpec>}`;
  `pub fn validate_tasks(&[ToolTask]) -> AppResult<()>`; preset loaders
  `tasks()`/`finance_tasks()`/`agentic_tasks()`/`agentic_{3,5,8}_tasks()` (each
  `include_str!` a `tasks*.json`); `BUILTIN_COLLECTIONS: &[(&str,&str)]`;
  `builtin_collection(id) -> Option<Vec<ToolTask>>`. Categories are
  `["single","parallel","select","abstain","agentic"]`.
- **How/Where used:** validated by every run command; presets served by
  `toolcall_cmd`.

```rust
let p: StrictParameters = serde_json::from_value(tool.parameters.clone())  // serde does the work
    .map_err(|e| bad(id, &format!("tool '{}' parameters", tool.name), &e.to_string()))?;
if p.schema_type != "object" { return Err(bad(id, …, "type must be \"object\"")); }
// abstain ⇔ no_call: category and expected must agree
if abstain != matches!(t.expected, Expected::NoCall) { return Err(bad(&t.id, "expected", "abstain ⇔ no_call")); }
```

### File: `prompt.rs`
- **Responsibility:** Build the tool-call system prompt (tool schemas as JSON +
  "respond with ONLY a JSON object/array").
- **Why:** Explicit instruction so a weak model's format failures surface as a low
  `parse_rate` (signal, not noise).
- **What:** `build_system(task)` → `build_system_for(tools)` (shared with the
  agentic runner, which has a sandbox not a `ToolTask`).

```rust
"You can call tools. Available tools:\n{tools_json}\n\n\
 When a tool is needed, respond with ONLY a JSON object of the form \
 {{\"name\": \"<tool>\", \"args\": {{...}}}}. To call several tools, respond with a JSON array …"
```

### File: `parse.rs`
- **Responsibility:** Extract tool calls from a raw completion.
- **Why:** Small quants emit calls as a single object, a JSON array, bare
  `{..}\n{..}` sequences, or echo the call inside a fence — all must parse, and
  duplicates must collapse so the cardinality guard doesn't false-fail.
- **What:** `extract_calls(completion) -> Option<Vec<Call>>`; privates
  `objects()` (every top-level balanced `{…}`, string/escape aware), `to_call()`
  (`{name, args|arguments}`); `pub(crate) has_json_object`, `looks_like_broken_json`
  (used by the agentic runner to tell broken JSON from a hallucinated completion).
- **How/Where used:** `eval::trace_one_with`, `runner::run_once`.

```rust
for call in objects(&cleaned).into_iter()
    .filter_map(|slice| serde_json::from_str::<Value>(slice).ok())
    .filter_map(to_call) {
    if !calls.contains(&call) { calls.push(call); }   // dedup identical calls; keep distinct parallel
}
(!calls.is_empty()).then_some(calls)                   // None ⇒ abstention is scoreable
```

### File: `score.rs`
- **Responsibility:** Pure per-task verdict from `(expected, parsed)`.
- **Why:** Deterministic, length-guarded, order-independent matching that the
  agentic end-state matcher reuses (same `args_match`).
- **What:** `Verdict{parsed,tool_match,args_match,abstain_correct: Option<bool>}`;
  `pub fn score(expected, parsed) -> Verdict`; `pub(crate) verdict_passed(&Verdict)`;
  `pub(crate) args_match(expected, got)` (same key set, values equal — numbers
  numerically, strings trimmed); privates `bijection` (1:1 greedy assignment),
  `set_match` (length-guard then tool then args).
- **How/Where used:** `eval::trace_one_with`, `batch.rs`, `endstate.rs`.

```rust
fn set_match(expected: &[Call], parsed: &[Call]) -> (bool, bool) {
    if expected.len() != parsed.len() { return (false, false); }   // length guard: extra/missing → fail
    let tool = bijection(expected, parsed, |e, p| e.name == p.name);
    let args = bijection(expected, parsed, |e, p| e.name == p.name && args_match(&e.args, &p.args));
    (tool, args)
}
```

### File: `eval.rs`
- **Responsibility:** Run a collection task-by-task, keep full traces, aggregate
  into a `ToolCallReport` with **cascaded conditional denominators**.
- **Why:** A format failure must never bleed into the reasoning metrics — each
  metric's denominator is conditioned on the prior stage succeeding.
- **What:** `TaskResult`, `TraceResult` (system msg + prompt + raw output + verdict
  + real `prompt_eval_count`), `TaskTrace`, `ToolCallReport`; `pub(crate) aggregate`;
  `trace_one_with`/`trace_one` (live backend, greedy temp 0, `MAX_TOKENS=256`);
  `run_eval_traced` (report + persisted traces) and thin `run_eval`.
- **How/Where used:** `toolcall_cmd`, `matrix_cmd`, `batch.rs`, `cliff::engine`.

**Cascaded conditional denominators** (each metric over the subset that reached
that stage; each `None` when its denom is 0, never 0):

```rust
let parse_den = tasks.iter().filter(|t| call(t)).count();             // tasks expecting a call
let parse_num = z().filter(|(t,r)| call(t) && r.verdict.parsed).count();
let tool_num  = z().filter(|(t,r)| call(t) && r.verdict.parsed && r.verdict.tool_match).count();
let arg_den   = results.iter().filter(|r| r.verdict.tool_match).count();   // tool-matched tasks
let arg_num   = results.iter().filter(|r| r.verdict.tool_match && r.verdict.args_match).count();
let ab_den    = tasks.iter().filter(|t| !call(t)).count();            // NoCall tasks
// …
let tool_selection_acc = rate(tool_num, parse_num);                   // denom = PARSED call-tasks
let composite = (!subs.is_empty()).then(|| subs.iter().sum::<f64>() / subs.len() as f64);
```

#### Scoring metrics & denominators

| Metric | Numerator | Denominator | `None` when |
|--------|-----------|-------------|-------------|
| `parse_rate` | call-tasks that parsed | tasks expecting a call | no call-tasks |
| `tool_selection_acc` | parsed call-tasks with right tool | **parsed** call-tasks | nothing parsed |
| `arg_acc` | tool-matched with right args | **tool-matched** tasks | nothing tool-matched |
| `abstain_acc` | correctly abstained | NoCall (abstain) tasks | no abstain tasks |
| `composite` | — | mean of the available sub-scores above | all sub-scores absent |
| `prompt_tokens` | — | mean of real per-task `prompt_eval_count` | none reported |

### File: `matrix.rs`
- **Responsibility:** Fold per-target outcomes into a `MatrixReport` (pure).
- **Why:** A down backend must become that column's error, not abort the matrix.
- **What:** `ModelTarget{model,backend}`, `MatrixColumn{model,backend,report,error}`,
  `MatrixReport{collection_id,columns,avg_score}`; `build_matrix(...)`,
  `summaries(report, ts) -> Vec<RunSummary>` (only successful columns recorded).
- **How/Where used:** `matrix_cmd::run_collection_matrix`.

---

## Folder: `inference/eval/agentic/`

The agentic runner is a **sandboxed multi-step tool loop**: the model emits
raw-text JSON tool calls, a deterministic sandbox replies in text (no native
function-calling required, so it runs identically across Ollama/llama.cpp/MLX),
and the loop runs `k` times for Pass^k reliability.

### File: `mod.rs`
- Declares `build, context, endstate, model_turn, report, runner, sandbox, spec, step`.

### File: `spec.rs`
- **Responsibility:** Serde task definition for agentic runs (mocks + success rule
  + Pass^k/step/recovery/fault overrides), carried as `ToolTask.agentic`.
- **What:** `FaultInjection::{TransientError{status_code,clears_after}, PersistentError{status_code}}`,
  `FaultRule{call,fault}`,
  `AgenticSpec{mocks, end_state: EndStateRule, k, max_steps, faults, max_recovery}`.

### File: `sandbox.rs`
- **Responsibility:** The deterministic simulated tool environment + per-run fault
  state.
- **Why:** Mocks keyed by **canonical** (sorted-key) form so arg ordering never
  causes a miss; one environment shared (immutable) across all `k` runs.
- **What:** `MockResponse{call,response}`, `TaskCheckpoint{tool,args}`,
  `EndStateRule::{RequireSequence(Vec<TaskCheckpoint>), ExpectAbstainingText}`,
  `DeterministicSandbox` (`new`, `with_faults`, `respond(&Call) -> Option<&str>`),
  `SandboxState{attempts}` (`fault_for`), `pub fn canonical(&Call) -> String`.

```rust
FaultInjection::TransientError { status_code, clears_after } => {
    let n = self.attempts.entry(key).or_insert(0);
    if *n < *clears_after { *n += 1; Some(format!("HTTP {status_code} Service Unavailable")) }
    else { None }   // cleared — the deterministic mock result flows through
}
```

### File: `build.rs`
- **Responsibility:** Project an agentic `ToolTask` into `(DeterministicSandbox, AgenticConfig)`.
- **Why:** Defense-in-depth — re-checks every checkpoint/mock/fault names a declared
  tool before running.
- **What:** `sandbox_for(task) -> AppResult<(DeterministicSandbox, AgenticConfig)>`;
  fills config from spec overrides, defaulting to `AgenticConfig::default()`
  (`k=5, max_steps=10, max_recovery=2`).

### File: `context.rs`
- **Responsibility:** The running transcript (initial prompt + alternating model
  turns and injected tool results).
- **Why:** Single source so the streamed `injection` text matches what the model
  sees; `reset` isolates each Pass^k iteration.
- **What:** `tool_result_line(data) -> "Tool result: {data}"`;
  `Conversation{initial_prompt,turns}` (`push_model`, `push_tool_result`, `render`, `reset`).

### File: `model_turn.rs`
- **Responsibility:** The `ModelTurn` seam (prompt → text + stats) and its impls.
- **Why:** The runner depends on the trait, not a backend, so it's unit-testable
  with a scripted model; the native Ollama path translates structured `tool_calls`
  back into canonical `{name,args}` JSON so sandbox/scoring stay byte-identical.
- **What:** `trait ModelTurn { async fn run(&self, &GenerateSpec) -> AppResult<(String, GenerateStats)> }`;
  `BackendTurn{backend,endpoint,model,cancel,options,keep_alive}` (dispatch by
  `BackendKind`); `NativeOllamaTurn{endpoint,model,tools,options}` (`/api/chat` +
  `synthesize_calls`).

### File: `endstate.rs`
- **Responsibility:** Checkpoint matching + Driver-D semantic schema validation.
- **Why:** Reuses the tool-call scorer's `args_match` so the agentic success bar
  equals the single-turn bar; `validate_call` returns actionable error text the
  runner injects for recovery.
- **What:** `checkpoint_matches(&TaskCheckpoint,&Call) -> bool`,
  `validate_call(&Call,&[ToolSchema]) -> Result<(),String>` (declared tool +
  required params present + flat type match).

### File: `step.rs`
- **Responsibility:** The streamed per-turn event type.
- **What:** `StepKind::{ToolCall, ToolError, UnknownTool, SchemaError, MalformedJson,
  HallucinatedCompletion, EndStateReached, InfiniteLoop}`;
  `TrajectoryStep{run_index, step_index, raw_output, injection: Option<String>, kind}`.

### File: `report.rs`
- **Responsibility:** Fold per-run outcomes into the Pass^k `AgenticReport`;
  classify/tally failure modes.
- **Why:** Distinct non-overlapping tallies so loop failures don't hide fake-done /
  bad-schema failures; effort averages only successful runs; inapplicable metrics
  are `None`, never 0.
- **What:** `FailureKind`, `RunOutcome` (`success`/`failure`/`with_schema`),
  `FailureTracker{infinite_loop_hits, hallucinated_completions, malformed_json_calls,
  schema_unrecovered_calls}` (`top() -> TopError`), `TopError`,
  `AgenticReport{passes, total_runs, failures, avg_output_tokens_success, avg_steps,
  top_error, schema_resilience}` (`from_outcomes`).

```rust
schema_resilience: (schema_hits > 0).then(|| schema_recovered as f64 / schema_hits as f64),
```

### File: `runner.rs`
- **Responsibility:** The Pass^k driver (`run_agentic`) + the single stateful
  attempt (`run_once`).
- **Why:** Runs `k` iterations over a fresh transcript on the shared immutable
  sandbox; iterative `while step < max_steps` (no async recursion). Fault traps
  (Driver B) fire *before* checkpoint advance so a trapped call can never be a fake
  pass; schema recovery (Driver D) injects an error and retries up to `max_recovery`.
- **What:** `AgenticConfig{k,max_steps,max_recovery}` (Default `{5,10,2}`);
  `run_agentic(turn,sandbox,config,tx) -> AppResult<AgenticReport>`;
  `run_once(turn,sandbox,max_steps,max_recovery,run_index,tx) -> AppResult<RunOutcome>`;
  `MAX_TOKENS=256`.

```rust
pub async fn run_agentic<M: ModelTurn>(turn, sandbox, config, tx) -> AppResult<AgenticReport> {
    let mut outcomes = Vec::with_capacity(config.k as usize);
    for run_index in 0..config.k {
        outcomes.push(run_once(turn, sandbox, config.max_steps, config.max_recovery, run_index, tx).await?);
    }
    Ok(AgenticReport::from_outcomes(&outcomes))
}
```

**The step loop** (trimmed) — emit a step, parse a call, validate, fault-trap,
advance checkpoints, or classify a terminal failure:

```rust
for step_index in 0..max_steps {
    let (raw, stats) = turn.run(&spec).await?;            // greedy temp 0, prompt = convo.render()
    output_tokens += stats.eval_count.unwrap_or(0);
    match extract_calls(&raw).and_then(|c| c.into_iter().next()) {
        Some(call) => match &sandbox.end_state {
            EndStateRule::ExpectAbstainingText =>                 // acted when it should decline
                return Ok(RunOutcome::failure(step_index+1, output_tokens, FailureKind::Hallucinated)),
            EndStateRule::RequireSequence(checkpoints) => {
                if let Err(msg) = endstate::validate_call(&call, &sandbox.tools) {   // Driver D
                    if recoveries >= max_recovery {
                        return Ok(RunOutcome::failure(step_index+1, output_tokens, FailureKind::MalformedSchema).with_schema(true,false));
                    }
                    recoveries += 1; convo.push_tool_result(&format!("[Schema error: {msg}]")); continue;
                }
                if let Some(err) = state.fault_for(&call, &sandbox.faults) {        // Driver B (before advance)
                    convo.push_tool_result(&err); continue;
                }
                let advances = endstate::checkpoint_matches(&checkpoints[next_cp], &call);
                if advances && next_cp+1 == checkpoints.len() {
                    return Ok(RunOutcome::success(step_index+1, output_tokens).with_schema(hit_schema_error, schema_recovered));
                }
                if advances { next_cp += 1; }
                let result = sandbox.respond(&call).map(str::to_string).unwrap_or(UNKNOWN_TOOL.into());
                convo.push_model(&raw); convo.push_tool_result(&result);
            }
        },
        None => match &sandbox.end_state {
            EndStateRule::ExpectAbstainingText =>                 // correctly declined
                return Ok(RunOutcome::success(step_index+1, output_tokens)),
            EndStateRule::RequireSequence(_) => {
                let failure = if looks_like_broken_json(&raw) { FailureKind::Malformed } else { FailureKind::Hallucinated };
                return Ok(RunOutcome::failure(step_index+1, output_tokens, failure).with_schema(hit_schema_error, schema_recovered));
            }
        },
    }
}
// step cap exhausted → infinite loop
Ok(RunOutcome::failure(max_steps, output_tokens, FailureKind::InfiniteLoop).with_schema(hit_schema_error, schema_recovered))
```

---

## Folder: `inference/eval/cliff/`

A **stoppable probe** that pads a tool-call task's context with synthetic filler
across an ascending token ladder and finds the largest verified depth before
accuracy collapses. All depths are MEASURED `prompt_eval_count`, never a 4:1
estimate (the seed rate is learned per rung).

### File: `mod.rs`
- Re-exports `build_ladder, run_cliff, run_cliff_with, CliffPoint, CliffReport,
  DepthScore, TaskTrace, TraceOutput, DEFAULT_DEPTHS` and `CliffPreset, CliffSource`.

### File: `presets.rs`
- **Responsibility:** The padding source — three embedded synthetic fillers or
  user text.
- **Why:** License-clean, distinct-register filler ships in-binary so the probe
  stresses the model like real RAG context.
- **What:** `CliffPreset::{CorporatePolicy, SystemLogs, FinancialLedger}` (prose /
  structured logs / tabular CSV; each `include_str!` a `*.txt`); tagged
  `CliffSource::{Preset{preset}, Text{text}}` with `.text()`.

### File: `padding.rs`
- **Responsibility:** UTF-8-safe filler construction + needle injection at a
  fractional depth.
- **Why:** All slicing behind one boundary guard so multi-byte filler never panics.
- **What:** `safe_boundary`, `build_padding(source, target_bytes)` (cycles in 4 KB
  chunks, `CHUNK_BYTES=4096`), `inject_at_depth(padding, needle, depth)` (depth
  0.0 = front, 1.0 = back).

```rust
pub fn inject_at_depth(padding: &str, needle: &str, depth: f32) -> String {
    let frac = depth.clamp(0.0, 1.0);
    let pos = safe_boundary(padding, (padding.len() as f32 * frac) as usize);
    let mut out = String::with_capacity(padding.len() + needle.len() + 4);
    out.push_str(&padding[..pos]);
    if pos > 0 { out.push_str("\n\n"); }
    out.push_str(needle); out.push_str("\n\n"); out.push_str(&padding[pos..]);
    out
}
```

### File: `engine.rs`
- **Responsibility:** The full probe — per ascending token rung, sweep the needle
  across depths, verify measured depth, classify the collapse point.
- **Why:** Find the largest *verified* context where the task still passes,
  transparently (per-task traces) and reproducibly (greedy decode), UI-free.
- **What:** `TraceOutput`, `TaskTrace`, `DepthScore`, `CliffPoint`, `CliffReport`,
  `CliffStatus::{Broken, Collapsed, NoCliff}`; `build_ladder(max_tokens, steps)`
  (ascending, `steps.max(2)`); `run_cliff` (no cancel) and the stoppable
  `run_cliff_with(..., cancel, on_rung)`.
- **Constants:** `BYTES_PER_TOKEN=4` (seed only), `MAX_ADJUST_ATTEMPTS=1`,
  `ADJUST_TOLERANCE=0.05`, `BASELINE_PASS=0.5`, `COLLAPSE_MARGIN=0.2`,
  `DEFAULT_DEPTHS=[0.1,0.5,0.9]`.
- **Scoring:** single-turn tasks use the full cascaded `aggregate().composite`;
  agentic tasks score on JSON well-formedness only; rung composite = the **worst**
  position's score (robust everywhere).

**Stoppable probe loop** — cancel checked before each costly rung; early-stop on a
broken baseline or the first collapse:

```rust
for (i, &target) in ladder.iter().enumerate() {
    if cancel.is_cancelled() { return Err(AppError::Inference("context-cliff probe cancelled".into())); }
    let point = probe_rung(turn, model, tasks, source_text, target, depths, &mut rate).await?;
    if cancel.is_cancelled() { return Err(AppError::Inference("…cancelled".into())); }
    on_rung(i + 1, total, &point);
    let comp = point.composite; points.push(point);
    if i == 0 {
        baseline_comp = comp;
        if comp.map_or(true, |c| c < BASELINE_PASS) { break; }           // broken baseline → stop
    } else if let (Some(b), Some(c)) = (baseline_comp, comp) {
        if c <= b - COLLAPSE_MARGIN { break; }                          // first collapse IS the cliff
    }
}
```

**Padding rebuild + verify-and-adjust** (learns the byte/token rate per rung):

```rust
let mut bytes = match *rate { Some(r) => ((target as f64) * r).round() as usize,
                              None => target as usize * BYTES_PER_TOKEN };
for attempt in 0..=MAX_ADJUST_ATTEMPTS {
    let padding = build_padding(source_text, bytes);
    let (per_depth, mean_tokens, worst, trace) = sweep(turn, model, tasks, &padding, depths).await?;
    if mean_tokens > 0 { *rate = Some(bytes as f64 / mean_tokens as f64); }
    let off = (mean_tokens as f64 - target as f64).abs() / target as f64;
    if mean_tokens == 0 || off <= ADJUST_TOLERANCE || attempt == MAX_ADJUST_ATTEMPTS { break; }
    bytes = ((bytes as f64) * (target as f64) / (mean_tokens as f64)).round() as usize;
}
```

**Classification:** `Broken` if baseline composite `< BASELINE_PASS`; `Collapsed{depth}`
on the first rung dropping `<= base - COLLAPSE_MARGIN` (carrying `largest_pass`);
else `NoCliff{tested}`.

---

## Folder: `inference/eval/readiness/`

Synthesizes a measured batch report (+ cliff depth + VRAM fit) into ranked
**Ready / Conditional / NotReady** verdicts against a tunable use-case profile.
Pure and Tauri-free; hard gates block, soft gates downgrade, and a
required-but-unmeasured input *blocks* ("ignorance is not a pass").

### File: `mod.rs`
- Declares `inputs, profile, recommend, types, verdict, vram_fit`.

### File: `types.rs`
- **What:** `EPSILON=1e-6`;
  `CliffStatus::{NotProbed(default), NoCliff{tested}, Collapsed{depth}, Broken{tested}}`;
  `AgentPath::{PromptBased, NativeFc}`; `NativeFcStatus::{Tested{pass_k}, NotSupported}`;
  `ReadinessInputs{pass_k, avg_steps, ms_per_step, cliff, fits_in_vram, vram_pressure,
  loops, hallucinated, native_fc}`; `Readiness::{Ready, Conditional, NotReady}`;
  `ReadinessVerdict{status, blocking, conditions, path}`;
  `ModelVerdict{model, backend, verdict, memory, avg_steps, effort, pass_k, quantization, cliff}`.

### File: `profile.rs`
- **Responsibility:** The tunable use-case presets verdicts are measured against.
- **What:** `ReadinessProfile{id,name, min_pass_k, max_avg_steps, max_ms_per_step,
  min_context_tokens, forbid_infinite_loop, forbid_hallucinated_completion,
  require_full_vram, require_native_fc}`; `builtins()`.

| id | min_pass_k | max_avg_steps | max_ms_per_step | forbid_loop | forbid_halluc | require_full_vram | require_native_fc |
|----|-----------|---------------|-----------------|-------------|---------------|-------------------|-------------------|
| coding-agent | 0.80 | 8.0 | 5000 | true | true | **true** | false |
| rag-assistant | 0.70 | 5.0 | 8000 | true | true | false | false |
| general-agent | 0.60 | — | — | true | false | false | false |

(`min_context_tokens` is `None` on all builtins → the cliff hard gate ships off.)

### File: `verdict.rs`
- **Responsibility:** THE gate — `assess(inputs, profile) -> ReadinessVerdict`.
- **Decision rule:** any `blocking` reason ⇒ **NotReady**; else any `conditions` ⇒
  **Conditional**; else **Ready**.

```rust
match i.pass_k {
    None => blocking.push("pass^k not measured (no agentic runs) — cannot certify".into()),
    Some(pk) if pk < p.min_pass_k - EPSILON => blocking.push(format!("pass^k {:.2} < {:.2} required", pk, p.min_pass_k)),
    Some(_) => {}
}
if p.forbid_infinite_loop && i.loops > 0 { blocking.push("loops on some runs".into()); }
if p.forbid_hallucinated_completion && i.hallucinated > 0 { blocking.push("false 'done' on some runs".into()); }
if p.require_full_vram { match i.fits_in_vram {
    Some(false) => blocking.push("partial offload → severe slowdown".into()),
    None        => blocking.push("require_full_vram set, but VRAM fit not measured".into()),  // null-gate
    Some(true)  => {} } }
if i.vram_pressure { conditions.push("high VRAM pressure near allocation ceiling".into()); }
// soft targets → Conditional only on breach; unmeasured is silent
if let (Some(mx), Some(ms)) = (p.max_ms_per_step, i.ms_per_step) { if ms > mx { conditions.push(/* slow */); } }
if let (Some(mx), Some(s))  = (p.max_avg_steps, i.avg_steps)     { if s  > mx { conditions.push(/* inefficient */); } }
let status = if !blocking.is_empty() { Readiness::NotReady }
    else if !conditions.is_empty() { Readiness::Conditional } else { Readiness::Ready };
```

#### Readiness verdict thresholds

| Gate | Type | Triggers |
|------|------|----------|
| `pass_k` unmeasured / `< min_pass_k` | hard → NotReady | always (core gate) |
| `forbid_infinite_loop` & `loops > 0` | hard → NotReady | when profile sets it |
| `forbid_hallucinated_completion` & `hallucinated > 0` | hard → NotReady | when profile sets it |
| `require_full_vram` & (`fits==false` or unmeasured) | hard → NotReady | when profile sets it |
| `require_native_fc` & `NotSupported` | hard → NotReady | when profile sets it |
| `min_context_tokens` vs cliff (`Collapsed<min` / `NoCliff<min` / `Broken` / `NotProbed`) | hard → NotReady | when profile sets `min_context_tokens` |
| `vram_pressure` (≥ 0.85·cap) | soft → Conditional | always |
| `ms_per_step > max_ms_per_step` | soft → Conditional | when both present |
| `avg_steps > max_avg_steps` | soft → Conditional | when both present |

### File: `vram_fit.rs`
- **Responsibility:** Weights + KV-cache vs cap. Only the cache is estimated;
  weights are exact.
- **Constants:** `PRESSURE_FRACTION=0.85`, `DEFAULT_FALLBACK_CTX=8192`.
- **What:** `MemoryProfile{weights_bytes, kv_cache_bytes, total_bytes, cap_bytes,
  context_length, fits, pressure, estimated}`, `Dims{…}`, `estimate(...)`,
  `try_profile(weights, dims, num_ctx, cap)`.

```rust
pub fn estimate(weights_bytes, layers, head_count, head_count_kv, embedding_length, context_length, cap_bytes) -> MemoryProfile {
    let kv_cache_bytes = calculate_kv_cache_bytes(layers, head_count, head_count_kv, embedding_length, context_length as u64);
    let total_bytes = weights_bytes.saturating_add(kv_cache_bytes);
    let fits = total_bytes <= cap_bytes;
    let pressure = fits && cap_bytes > 0 && total_bytes as f64 >= cap_bytes as f64 * PRESSURE_FRACTION;
    MemoryProfile { weights_bytes, kv_cache_bytes, total_bytes, cap_bytes, context_length, fits, pressure, estimated: false }
}
```

### File: `inputs.rs`
- **Responsibility:** Adapter `BatchColumn -> ReadinessInputs`/verdicts, native-FC
  preferred (the path a real agent uses) when measured.
- **What:** `from_column`, `verdict_for` (error column short-circuits to NotReady),
  `agentic_metrics`, `pass_k_of`, `assess_report(report, profile) -> Vec<ModelVerdict>`.

```rust
let native = col.agentic_native_fc.as_ref().filter(|a| a.total_runs > 0);
let (source, native_fc) = match native {
    Some(n) => (Some(n), NativeFcStatus::Tested { pass_k: n.pass_k().unwrap_or(0.0) }),
    None    => (col.agentic.as_ref(), NativeFcStatus::NotSupported),
};
```

### File: `recommend.rs`
- **Responsibility:** Rank verdicts best-first + pick the winner.
- **What:** `rank(&mut [ModelVerdict])`, `recommendation(&[ModelVerdict]) -> Option<&ModelVerdict>`.
  Sort: tier desc (Ready=2/Conditional=1/NotReady=0) → `effort` asc → `avg_steps`
  asc; `None` sinks to `f64::MAX` (`total_cmp`, float-safe).

---

## Folder: `inference/eval/batch.rs`

The umbrella **batch dispatcher**: one model at a time, one task at a time, mixing
single-turn and agentic tasks, with VRAM isolation between models and durable
crash-resume.

- **Key types:** `TaskOutcome::{Single{passed,trace}, Agentic{report}, Error{message}}`;
  `CompletedUnit{model, task_id, category, outcome, is_native}` (the durable
  resumable unit); `VramGate` trait (`NoVramGate` / `OllamaVramGate` — evict prior
  model + assert VRAM cleared, `Err` halts); `BatchSink` (`task_started` /
  `agentic_turn` / `task_done`); `AggAgentic` (strict Pass^k: `tasks_passed` =
  tasks where every run passed; `pass_k() = tasks_passed/tasks_total`);
  `BatchColumn{model, backend, toolcall, agentic, agentic_native_fc, error}`;
  `BatchReport{collection_id, columns, num_ctx}`.
- **Functions:** `run_batch` (test wrapper, no gate), `run_batch_resumable`
  (the VRAM-safe resumable loop — folds `prior` units silently, runs the rest,
  streams + records), `fold_report` (repaint Matrix from completed units only,
  no execution), `run_native_fc_pass` (parallel native-FC aggregate),
  `batch_summaries`, `agg_agentic`.

**Pass^k is strict** — a task is credited only when *all k runs* succeed:

```rust
tasks_passed: reports.iter().filter(|r| r.total_runs > 0 && r.passes == r.total_runs).count() as u32,
tasks_total:  reports.len() as u32,
pub fn pass_k(&self) -> Option<f64> { (self.tasks_total > 0).then(|| self.tasks_passed as f64 / self.tasks_total as f64) }
```

**Resumable loop** — a prior unit is folded with no re-run; errors are *not*
recorded (so they re-run on resume when the backend is back):

```rust
if let Some(unit) = done.get(&(target.model.as_str(), task.id.as_str())) {
    fold_completed(unit, task, &mut single_tasks, &mut single_results, &mut agentic_reports, &mut col_error);
    continue;
}
// … run, stream through sink, then record(&unit_of(target, task, outcome, false))
```

#### Batch queue states (per `(model, task)` unit)

| State | Meaning | On resume |
|-------|---------|-----------|
| not in job log | never ran | runs now |
| `CompletedUnit` (`is_native=false`) | prompt-pass result recorded | folded silently |
| `CompletedUnit` (`is_native=true`) | native-FC pass result recorded | folded into `agentic_native_fc` |
| `Error` (not recorded) | backend was down | re-runs |
| cancelled mid-run | not recorded | re-runs |

---

## Folder: `commands/eval/`

Thin Tauri IPC skin: streams events, persists, isolates hardware. Helpers
`endpoint_for(backend)` (MLX dynamic port else default) and `traces_dir(app)` live
in `toolcall_cmd` and are imported by the other command modules.

### File: `mod.rs`
- Declares `batch_cmd, batch_payloads, eval_registry, eval_run, evals_load,
  matrix_cmd, readiness_cmd, toolcall_cmd`.

### File: `toolcall_cmd.rs`
- Commands: `get_builtin_tasks`, `list_builtin_collections`, `get_builtin_collection`,
  `run_toolcall_eval`, `load_toolcall_trace`, `trace_toolcall_task`. Validates tasks,
  runs `run_eval_traced`, caches traces best-effort (skipped when `collection_id`
  is empty — i.e. cliff/quant probes).

### File: `eval_run.rs`
- `run_eval_task` — one generic `EvalTask` by id (accumulate output, then
  `eval_score::score`). `EvalRunResult{task_id, category, passed, detail, output, token_count}`.

### File: `evals_load.rs`
- `list_evals`; resolves the evals dir (`QUANTAMIND_EVALS_DIR` → resource_dir/evals
  → dev `../docs/evals`), parses YAML, sorts by id (a malformed file fails the load).

### File: `matrix_cmd.rs`
- `run_collection_matrix` (sequential per-target `run_eval_traced`, best-effort
  trace cache, `build_matrix`, append history), `load_collection_history`.

### File: `eval_registry.rs`
- Custom-collection CRUD: `list_custom_collections`, `load_custom_collection`,
  `save_custom_collection`, `delete_custom_collection`, `read_text_capped`,
  `import_custom_collection` (size-capped read in Rust; frontend passes only paths).
  Delegates to `persistence::evals`.

### File: `batch_payloads.rs`
- Event constants `EVENT_BATCH_PROGRESS="batch-progress"`,
  `EVENT_AGENTIC_STEP="agentic-step"`, `EVENT_BATCH_COMPLETE="batch-complete"`;
  `BatchProgress::{Started{…}, Done{model,task_id,outcome}}`,
  `AgenticStepPayload{model,task_id,#[serde(flatten)] step}`, `BatchCompletePayload{report}`.

### File: `batch_cmd.rs`
- `run_batch_eval`, `stop_batch_eval`, `check_unfinished_run`, `resume_batch_eval`,
  `discard_run`. `BatchRunState{cancel}`; `TauriBatchSink` emits progress/step
  events; `OllamaVramGate` isolation; shared `run_passes` core.

```rust
// Transactional finish: persist → verify on disk → only THEN delete the job log
reports::save(&reports_d, &report)?;
if reports::load(&reports_d, &config.collection_id)?.is_none() {
    return Err(AppError::Io("batch report did not persist — keeping the resumable job log".into()));
}
let _ = queue::delete(&job_path);
```

### File: `readiness_cmd.rs`
- `run_context_cliff` / `stop_context_cliff`, `save_cliff_result` / `get_cliff_results`,
  `assess_readiness`, `list_readiness_profiles` / `save_readiness_profile` /
  `delete_readiness_profile`. Const `CLIFF_CTX_HEADROOM=2048`,
  `EVENT_CLIFF_PROGRESS="cliff-progress"`, `EVENT_CLIFF_STEP="cliff-step"`.
  `run_context_cliff` forces temp 0, `num_ctx = max_tokens + 2048`, registers a cancel
  token, emits a rung event per `on_rung` AND a fine-grained `cliff-step` per
  `on_step` (one per task generation — `StepProgress{rung,position,task,...}` — so the UI
  shows movement during a slow deep rung instead of freezing between rungs), persists the
  classified `CliffStatus` only on success. `assess_readiness`
  loads the persisted batch report, pulls real weights/quant from Ollama, computes
  per-column VRAM fit via `vram_fit::try_profile` (only when `cap_bytes` set),
  builds verdicts via `verdict_for`, then `recommend::rank`.

---

## Data-flow walkthroughs

### (a) Single tool-call eval scoring

1. `run_toolcall_eval(model, backend, collection_id, tasks, params)` validates via
   `tasks::validate_tasks`, resolves `endpoint_for`/options.
2. `run_eval_traced` loops `trace_one` per task: `prompt::build_system` →
   `GenerateSpec` (temp 0, `MAX_TOKENS=256`) → backend completion + `GenerateStats`.
3. `parse::extract_calls` greedily pulls + dedups calls; `score::score` produces a
   `Verdict` (length-guarded bijection on tool/args, or `abstain_correct`).
4. `eval::aggregate` folds per-task verdicts into a `ToolCallReport` with **cascaded
   conditional denominators** (parse → tool-select over parsed → arg over
   tool-matched → abstain over NoCall; composite = mean of available subs).
5. Traces cached via `eval_trace_store::upsert`; report returned to the UI.

### (b) Agentic multi-step run

1. Batch hits a `category=="agentic"` task → `build::sandbox_for` →
   `(DeterministicSandbox, AgenticConfig{k,max_steps,max_recovery})`.
2. `run_agentic` runs `run_once` `k` times on the shared immutable sandbox, fresh
   `Conversation` each iteration.
3. Per step: model emits text → `extract_calls` → Driver D (`validate_call`, inject
   error + retry up to `max_recovery`) → Driver B (`fault_for` trap *before* advance)
   → `checkpoint_matches` advances the sequence → `sandbox.respond` injects the
   result; each step streams a `TrajectoryStep` to the `BatchSink`.
4. Terminal: `EndStateReached` (success), `Hallucinated`/`Malformed`/`MalformedSchema`/
   `InfiniteLoop` (failure). `AgenticReport::from_outcomes` computes strict Pass^k
   (all-k-pass), avg steps, effort (success only), `schema_resilience`, `top_error`.

### (c) Batch run resume after crash

1. `run_batch_eval` writes a job-log header (`queue::create`) with the full config,
   then `run_passes` appends each `CompletedUnit` as it finishes (durable).
2. A crash leaves the `.jsonl` job log on disk. On next launch `check_unfinished_run`
   reports an `UnfinishedRun{run_id, done, total}`.
3. `resume_batch_eval(run_id)` loads `(config, units)`, `fold_report` repaints the
   Matrix in one `EVENT_BATCH_COMPLETE` payload, then `run_passes` continues:
   `run_batch_resumable` folds the `done` units silently (no re-run), runs only the
   remaining `(model, task)` pairs. Errors and cancellations were never recorded, so
   they re-run.
4. VRAM gate evicts the prior Ollama model and asserts VRAM cleared before the next
   loads (an `Err` halts with the log intact). On success: transactional finish
   (persist → verify on disk → delete the job log).

### (d) Context-cliff probe

1. `run_context_cliff(run_id, model, backend, tasks, source, max_tokens, steps,
   params)` forces temp 0 and `num_ctx = max_tokens + 2048`, registers a cancel
   token (superseding any prior run), builds the ascending ladder (`build_ladder`).
2. `run_cliff_with` walks rungs ascending: `probe_rung` builds padding sized by the
   learned byte/token rate, sweeps the needle across `DEFAULT_DEPTHS=[0.1,0.5,0.9]`
   (`inject_at_depth`), measures real `prompt_eval_count`, and verify-adjusts once if
   off by `> ADJUST_TOLERANCE`. Rung composite = the **worst** depth's score.
3. After each rung, `on_rung` emits `EVENT_CLIFF_PROGRESS`; within a rung, `on_step`
   fires per task generation (threaded `run_cliff_with`→`probe_rung`→`sweep`→`run_position`)
   and emits `EVENT_CLIFF_STEP` so the panel's bar/ETA advance mid-rung. Early-stop: a baseline
   `< BASELINE_PASS` ⇒ `Broken` (break); the first rung dropping `<= base -
   COLLAPSE_MARGIN` ⇒ `Collapsed{depth}` (break). `cancel` is checked before each
   rung, after `probe_rung`, and before classify/persist.
4. `classify` produces `CliffStatus::{Broken, Collapsed, NoCliff}` + `cliff_tokens`
   (largest verified pass). Persisted only on a non-cancelled success; later read by
   `assess_readiness` as the `cliff` input to the readiness verdict.
