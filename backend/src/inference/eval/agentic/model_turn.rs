use crate::errors::AppResult;
use crate::inference::backend::backend::InferenceBackend;
use crate::inference::backend::backend_kind::BackendKind;
use crate::inference::eval::toolcall::tasks::ToolSchema;
use crate::inference::generate::generate_options::GenerateOptions;
use crate::inference::generate::generate_spec::GenerateSpec;
use crate::inference::generate::generate_stats::GenerateStats;
use crate::inference::llama::llama_backend::LlamaCppBackend;
use crate::inference::mlx::mlx_backend::MlxBackend;
use crate::inference::ollama::ollama_backend::OllamaBackend;
use crate::inference::ollama::ollama_chat::{chat_with_tools, NativeToolCall};
use serde_json::{json, Value};
use tokio_util::sync::CancellationToken;

/// One model turn behind a seam: prompt in → (text, stats) out. The runner
/// depends on this, not on a concrete backend, so it stays unit-testable with a
/// scripted model while the real path drives a live `InferenceBackend`.
#[allow(async_fn_in_trait)]
pub trait ModelTurn {
    async fn run(&self, spec: &GenerateSpec) -> AppResult<(String, GenerateStats)>;

    /// Best-effort: load the model resident BEFORE the first scored turn so its
    /// cold-load latency (weights into VRAM) isn't charged to the first task as a
    /// `TurnTimeout` — which would systematically penalize every model's first task and
    /// corrupt cross-model comparison. Default no-op: scripted test models need no
    /// warming, and a backend that can't warm simply runs cold (the prior behavior).
    async fn warm_up(&self) -> AppResult<()> {
        Ok(())
    }
}

/// Real path: dispatch by `BackendKind` (the trait isn't object-safe), accumulate
/// tokens into a `String`, return text + stats. Mirrors
/// `toolcall::eval::generate_text`; shares one `CancellationToken` so a stop
/// request aborts the in-flight generation.
pub struct BackendTurn {
    pub backend: BackendKind,
    pub endpoint: String,
    pub model: String,
    pub cancel: CancellationToken,
    /// Global inference params (from the header) applied to every eval turn.
    /// `None` runs at backend defaults.
    pub options: Option<GenerateOptions>,
    /// Ollama keep_alive (from the header's "keep model loaded" toggle).
    pub keep_alive: Option<i32>,
}

impl ModelTurn for BackendTurn {
    async fn run(&self, spec: &GenerateSpec) -> AppResult<(String, GenerateStats)> {
        let mut out = String::new();
        let push = |t: &str| out.push_str(t);
        let cancel = self.cancel.clone();
        // The agentic loop builds its spec without a model name (it only knows the
        // `ModelTurn` seam). Inject our own so Ollama — which sends `spec.model` in
        // the request — targets the right model instead of an empty name. Apply the
        // global eval params too (prefer them; fall back to whatever the spec set).
        let spec = GenerateSpec {
            model: self.model.clone(),
            options: self.options.clone().or_else(|| spec.options.clone()),
            keep_alive: self.keep_alive.or(spec.keep_alive),
            ..spec.clone()
        };
        let stats = match self.backend {
            BackendKind::Ollama => OllamaBackend::new(self.endpoint.clone()).generate(&spec, cancel, push).await?,
            BackendKind::LlamaCpp => LlamaCppBackend::new(self.endpoint.clone()).generate(&spec, cancel, push).await?,
            BackendKind::Mlx => MlxBackend::new(self.endpoint.clone(), self.model.clone()).generate(&spec, cancel, push).await?,
        };
        Ok((out, stats))
    }

    /// Issue a 1-token generation to force the model resident (honoring `keep_alive` so
    /// it stays loaded across this model's tasks). The output is discarded; only the
    /// load side-effect matters. Bypasses the global eval `options` so warming is cheap.
    async fn warm_up(&self) -> AppResult<()> {
        let spec = GenerateSpec {
            model: self.model.clone(),
            prompt: "ok".into(),
            system: None,
            options: Some(GenerateOptions { num_predict: Some(1), temperature: Some(0.0), ..Default::default() }),
            keep_alive: self.keep_alive,
        };
        let cancel = self.cancel.clone();
        let sink = |_: &str| {};
        match self.backend {
            BackendKind::Ollama => OllamaBackend::new(self.endpoint.clone()).generate(&spec, cancel, sink).await?,
            BackendKind::LlamaCpp => LlamaCppBackend::new(self.endpoint.clone()).generate(&spec, cancel, sink).await?,
            BackendKind::Mlx => MlxBackend::new(self.endpoint.clone(), self.model.clone()).generate(&spec, cancel, sink).await?,
        };
        Ok(())
    }
}

/// Tools are provided natively, so the native path uses a neutral system instead
/// of the prompt path's "respond with JSON" instructions.
const NATIVE_SYSTEM: &str =
    "You complete the task using the available tools. Call a tool when one applies; otherwise reply in plain text.";

/// Native path (Ollama only): call `/api/chat` with a real `tools` array and
/// translate the structured `tool_calls` back into the canonical `{"name","args"}`
/// JSON the runner's `extract_calls` already parses — so the sandbox, scoring, and
/// `TrajectoryStep` stay byte-identical to the prompt path. Built per task (it
/// carries that task's tool schemas).
pub struct NativeOllamaTurn {
    pub endpoint: String,
    pub model: String,
    pub tools: Vec<ToolSchema>,
    pub options: Option<GenerateOptions>,
}

/// Shape the tool schemas into Ollama's `tools` array (OpenAI-style function specs).
fn build_tools_value(tools: &[ToolSchema]) -> Value {
    Value::Array(
        tools
            .iter()
            .map(|t| json!({ "type": "function", "function": { "name": t.name, "description": t.description, "parameters": t.parameters } }))
            .collect(),
    )
}

/// Translate native tool calls into the canonical JSON text the runner parses.
/// Strict serialization (`serde_json::to_string`), never interpolation, so
/// embedded quotes survive. ALL calls are synthesized into the array; the runner's
/// existing `extract_calls(...).next()` takes the first (identical to a prompt
/// model emitting several objects). Empty → `""` (pure-abstain): `extract_calls`
/// returns `None` and `looks_like_broken_json` is false → the runner's no-call arm.
fn synthesize_calls(calls: &[NativeToolCall]) -> String {
    if calls.is_empty() {
        return String::new();
    }
    let arr: Vec<Value> = calls.iter().map(|c| json!({ "name": c.name, "args": c.args })).collect();
    serde_json::to_string(&Value::Array(arr)).unwrap_or_default()
}

impl ModelTurn for NativeOllamaTurn {
    async fn run(&self, spec: &GenerateSpec) -> AppResult<(String, GenerateStats)> {
        let tools = build_tools_value(&self.tools);
        let result =
            chat_with_tools(&self.endpoint, &self.model, NATIVE_SYSTEM, &spec.prompt, &tools, self.options.clone())
                .await?;
        Ok((synthesize_calls(&result.tool_calls), result.stats))
    }
}

#[cfg(test)]
mod tests {
    use super::{synthesize_calls, NativeToolCall};
    use crate::inference::eval::toolcall::parse::{extract_calls, looks_like_broken_json};
    use serde_json::json;

    #[test]
    fn single_call_round_trips_through_extract_calls_with_embedded_quotes() {
        let calls = vec![NativeToolCall { name: "get_weather".into(), args: json!({ "city": "Paris \"Île\"" }) }];
        let parsed = extract_calls(&synthesize_calls(&calls)).unwrap();
        assert_eq!(parsed.len(), 1);
        assert_eq!(parsed[0].name, "get_weather");
        assert_eq!(parsed[0].args, json!({ "city": "Paris \"Île\"" }));
    }

    #[test]
    fn abstain_yields_empty_text_classified_as_a_clean_no_call() {
        let text = synthesize_calls(&[]);
        assert_eq!(text, "");
        assert!(extract_calls(&text).is_none());
        assert!(!looks_like_broken_json(&text)); // not a MalformedJson — a true abstain
    }

    #[test]
    fn parallel_calls_synthesize_all_and_the_runner_takes_the_first() {
        let calls = vec![
            NativeToolCall { name: "a".into(), args: json!({ "x": 1 }) },
            NativeToolCall { name: "b".into(), args: json!({ "y": 2 }) },
            NativeToolCall { name: "c".into(), args: json!({}) },
        ];
        let parsed = extract_calls(&synthesize_calls(&calls)).unwrap();
        assert_eq!(parsed.len(), 3);
        assert_eq!(parsed.into_iter().next().unwrap().name, "a");
    }
}
