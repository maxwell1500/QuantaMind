use crate::errors::AppResult;
use crate::inference::backend::backend::InferenceBackend;
use crate::inference::backend::backend_kind::BackendKind;
use crate::inference::eval::toolcall::parse::extract_calls;
use crate::inference::eval::toolcall::prompt::build_system;
use crate::inference::eval::toolcall::score::{score, Verdict};
use crate::inference::eval::toolcall::tasks::ToolTask;
use crate::inference::generate::generate_options::GenerateOptions;
use crate::inference::generate::generate_spec::GenerateSpec;
use crate::inference::generate::generate_stats::GenerateStats;
use crate::inference::llama::llama_backend::LlamaCppBackend;
use crate::inference::mlx::mlx_backend::MlxBackend;
use crate::inference::ollama::ollama_backend::OllamaBackend;
use serde::{Deserialize, Serialize};
use tokio_util::sync::CancellationToken;

const MAX_TOKENS: u32 = 256;

#[derive(Serialize, Clone, Debug, PartialEq)]
pub struct TaskResult {
    pub id: String,
    pub category: String,
    pub verdict: Verdict,
    /// Real prompt tokens the model reported for this task (`prompt_eval_count`),
    /// or `None` when the backend didn't report it — never an estimate.
    pub prompt_tokens: Option<u32>,
}

/// The full, transparent trace of running ONE task: the exact system message
/// sent, the user prompt, the model's raw completion, and the verdict. Powers the
/// pipeline visualizer so the eval is never a black box.
#[derive(Serialize, Deserialize, Clone, Debug, PartialEq)]
pub struct TraceResult {
    pub system_message: String,
    pub user_prompt: String,
    pub raw_output: String,
    pub verdict: Verdict,
    /// The model's reported prompt tokens (`prompt_eval_count`) for this run, or
    /// `None` when the backend didn't report it. `#[serde(default)]` so traces
    /// persisted before this field still load.
    #[serde(default)]
    pub prompt_tokens: Option<u32>,
}

/// A task's identity bundled with its full trace — the unit persisted by a run so
/// the pipeline visualizer can show what happened without re-running inference.
#[derive(Serialize, Deserialize, Clone, Debug, PartialEq)]
pub struct TaskTrace {
    pub id: String,
    pub category: String,
    pub trace: TraceResult,
}

/// Cascaded conditional denominators so a format failure never bleeds into the
/// reasoning metrics: `parse_rate` over tasks that EXPECT a call (abstention is
/// its own metric); `tool_selection_acc` over parsed call-tasks; `arg_acc` over
/// tool-matched tasks; `abstain_acc` over NoCall tasks. Each is `None` (n/a, not
/// 0) when its denominator is 0. `composite` = mean of the available sub-scores.
#[derive(Serialize, Clone, Debug, PartialEq)]
pub struct ToolCallReport {
    pub n: usize,
    pub parse_rate: Option<f64>,
    pub tool_selection_acc: Option<f64>,
    pub arg_acc: Option<f64>,
    pub abstain_acc: Option<f64>,
    pub composite: Option<f64>,
    /// Mean of the per-task real `prompt_eval_count` for this run — the measured
    /// prompt-token depth (e.g. the Context-Cliff x-axis). `None` when no task
    /// reported one; never a chars/4 estimate.
    pub prompt_tokens: Option<f64>,
    pub per_task: Vec<TaskResult>,
}

fn rate(num: usize, den: usize) -> Option<f64> {
    (den > 0).then(|| num as f64 / den as f64)
}

fn aggregate(tasks: &[ToolTask], results: Vec<TaskResult>) -> ToolCallReport {
    let call = |t: &ToolTask| t.expected.calls().is_some();
    let z = || tasks.iter().zip(&results);

    let parse_den = tasks.iter().filter(|t| call(t)).count();
    let parse_num = z().filter(|(t, r)| call(t) && r.verdict.parsed).count();
    let tool_num = z().filter(|(t, r)| call(t) && r.verdict.parsed && r.verdict.tool_match).count();
    let arg_den = results.iter().filter(|r| r.verdict.tool_match).count();
    let arg_num = results.iter().filter(|r| r.verdict.tool_match && r.verdict.args_match).count();
    let ab_den = tasks.iter().filter(|t| !call(t)).count();
    let ab_num = results.iter().filter(|r| r.verdict.abstain_correct == Some(true)).count();

    let parse_rate = rate(parse_num, parse_den);
    let tool_selection_acc = rate(tool_num, parse_num); // denom = parsed call-tasks
    let arg_acc = rate(arg_num, arg_den);
    let abstain_acc = rate(ab_num, ab_den);
    let subs: Vec<f64> = [parse_rate, tool_selection_acc, arg_acc, abstain_acc].into_iter().flatten().collect();
    let composite = (!subs.is_empty()).then(|| subs.iter().sum::<f64>() / subs.len() as f64);

    let toks: Vec<u32> = results.iter().filter_map(|r| r.prompt_tokens).collect();
    let prompt_tokens = (!toks.is_empty()).then(|| toks.iter().map(|&t| t as f64).sum::<f64>() / toks.len() as f64);

    ToolCallReport { n: results.len(), parse_rate, tool_selection_acc, arg_acc, abstain_acc, composite, prompt_tokens, per_task: results }
}

/// Run one task: greedy decode (temp 0), accumulate the full completion, no
/// events. Dispatches by `BackendKind` (the trait isn't object-safe). Returns the
/// text AND the backend's real generation stats (for the measured prompt-token
/// depth) — never discarded.
async fn generate_text(backend: BackendKind, endpoint: &str, model: &str, spec: &GenerateSpec) -> AppResult<(String, GenerateStats)> {
    let mut out = String::new();
    let cancel = CancellationToken::new();
    let push = |t: &str| out.push_str(t);
    let stats = match backend {
        BackendKind::Ollama => OllamaBackend::new(endpoint.into()).generate(spec, cancel, push).await?,
        BackendKind::LlamaCpp => LlamaCppBackend::new(endpoint.into()).generate(spec, cancel, push).await?,
        BackendKind::Mlx => MlxBackend::new(endpoint.into(), model.into()).generate(spec, cancel, push).await?,
    };
    Ok((out, stats))
}

/// Run ONE task end-to-end and return its full trace (system message + raw
/// output + verdict). The single source of per-task execution: `run_eval` loops
/// over it, and the pipeline visualizer calls it directly.
pub async fn trace_one(
    backend: BackendKind,
    endpoint: &str,
    model: &str,
    task: &ToolTask,
) -> AppResult<TraceResult> {
    let system_message = build_system(task);
    let spec = GenerateSpec {
        model: model.to_string(),
        prompt: task.prompt.clone(),
        system: Some(system_message.clone()),
        options: Some(GenerateOptions { temperature: Some(0.0), num_predict: Some(MAX_TOKENS), ..Default::default() }),
        keep_alive: None,
    };
    let (raw_output, stats) = generate_text(backend, endpoint, model, &spec).await?;
    let verdict = score(&task.expected, extract_calls(&raw_output).as_deref());
    Ok(TraceResult { system_message, user_prompt: task.prompt.clone(), raw_output, verdict, prompt_tokens: stats.prompt_eval_count })
}

/// Run the tool-call eval over `tasks`, keeping each task's FULL trace alongside
/// the aggregated `ToolCallReport`. The traces are what a run persists so the
/// pipeline visualizer never has to re-run inference. A task whose backend errors
/// propagates the error (the command surfaces "Not available"); never a score.
pub async fn run_eval_traced(
    backend: BackendKind,
    endpoint: &str,
    model: &str,
    tasks: &[ToolTask],
) -> AppResult<(ToolCallReport, Vec<TaskTrace>)> {
    let mut traces = Vec::with_capacity(tasks.len());
    for task in tasks {
        let trace = trace_one(backend, endpoint, model, task).await?;
        traces.push(TaskTrace { id: task.id.clone(), category: task.category.clone(), trace });
    }
    let results = traces
        .iter()
        .map(|t| TaskResult {
            id: t.id.clone(),
            category: t.category.clone(),
            verdict: t.trace.verdict.clone(),
            prompt_tokens: t.trace.prompt_tokens,
        })
        .collect();
    Ok((aggregate(tasks, results), traces))
}

/// Run the eval and return just the aggregated `ToolCallReport` (the single-eval
/// command path that doesn't persist traces). Thin wrapper over `run_eval_traced`.
pub async fn run_eval(
    backend: BackendKind,
    endpoint: &str,
    model: &str,
    tasks: &[ToolTask],
) -> AppResult<ToolCallReport> {
    Ok(run_eval_traced(backend, endpoint, model, tasks).await?.0)
}

#[cfg(test)]
#[path = "eval_tests.rs"]
mod tests;
