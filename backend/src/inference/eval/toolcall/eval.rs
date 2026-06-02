use crate::errors::AppResult;
use crate::inference::backend::backend::InferenceBackend;
use crate::inference::backend::backend_kind::BackendKind;
use crate::inference::eval::toolcall::parse::extract_calls;
use crate::inference::eval::toolcall::prompt::build_system;
use crate::inference::eval::toolcall::score::{score, Verdict};
use crate::inference::eval::toolcall::tasks::ToolTask;
use crate::inference::generate::generate_options::GenerateOptions;
use crate::inference::generate::generate_spec::GenerateSpec;
use crate::inference::llama::llama_backend::LlamaCppBackend;
use crate::inference::mlx::mlx_backend::MlxBackend;
use crate::inference::ollama::ollama_backend::OllamaBackend;
use serde::Serialize;
use tokio_util::sync::CancellationToken;

const MAX_TOKENS: u32 = 256;

#[derive(Serialize, Clone, Debug, PartialEq)]
pub struct TaskResult {
    pub id: String,
    pub category: String,
    pub verdict: Verdict,
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

    ToolCallReport { n: results.len(), parse_rate, tool_selection_acc, arg_acc, abstain_acc, composite, per_task: results }
}

/// Run one task: greedy decode (temp 0), accumulate the full completion, no
/// events. Dispatches by `BackendKind` (the trait isn't object-safe).
async fn generate_text(backend: BackendKind, endpoint: &str, model: &str, spec: &GenerateSpec) -> AppResult<String> {
    let mut out = String::new();
    let cancel = CancellationToken::new();
    let push = |t: &str| out.push_str(t);
    match backend {
        BackendKind::Ollama => OllamaBackend::new(endpoint.into()).generate(spec, cancel, push).await?,
        BackendKind::LlamaCpp => LlamaCppBackend::new(endpoint.into()).generate(spec, cancel, push).await?,
        BackendKind::Mlx => MlxBackend::new(endpoint.into(), model.into()).generate(spec, cancel, push).await?,
    };
    Ok(out)
}

/// Run the tool-call eval over `tasks` against a backend; aggregate into a
/// `ToolCallReport`. A task whose backend errors propagates the error (the
/// command surfaces "Not available"); never a fabricated score.
pub async fn run_eval(
    backend: BackendKind,
    endpoint: &str,
    model: &str,
    tasks: &[ToolTask],
) -> AppResult<ToolCallReport> {
    let mut results = Vec::with_capacity(tasks.len());
    for task in tasks {
        let spec = GenerateSpec {
            model: model.to_string(),
            prompt: task.prompt.clone(),
            system: Some(build_system(task)),
            options: Some(GenerateOptions { temperature: Some(0.0), num_predict: Some(MAX_TOKENS), ..Default::default() }),
            keep_alive: None,
        };
        let output = generate_text(backend, endpoint, model, &spec).await?;
        let verdict = score(&task.expected, extract_calls(&output).as_deref());
        results.push(TaskResult { id: task.id.clone(), category: task.category.clone(), verdict });
    }
    Ok(aggregate(tasks, results))
}

#[cfg(test)]
#[path = "eval_tests.rs"]
mod tests;
