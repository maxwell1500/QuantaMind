use crate::errors::AppResult;
use crate::inference::backend::backend::InferenceBackend;
use crate::inference::backend::backend_kind::BackendKind;
use crate::inference::eval::agentic::difficulty::passk::NON_THINKING_MAX_TOKENS;
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

    /// Is this a reasoning model that emits a `<think>…</think>` scratchpad before its
    /// tool call? When true the runner (a) raises the per-turn `num_predict` to
    /// [`Self::max_output_tokens`] so the model isn't truncated mid-thought, and (b) strips
    /// `<think>` from the output before parsing AND before the transcript append. Default
    /// `false`: a scripted test model and the native-FC path keep the terse-model behavior.
    fn is_thinking(&self) -> bool {
        false
    }

    /// The per-turn output-token budget (`num_predict`) the runner pins on the spec.
    /// Default is the legacy 256 cap; a thinking model returns a tier-scaled budget that
    /// clears the scratchpad range so the call survives. See
    /// `difficulty::passk::max_tokens_for`.
    fn max_output_tokens(&self) -> u32 {
        NON_THINKING_MAX_TOKENS
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
    /// This model is a reasoning model (the sidebar "thinking" checkbox). Drives the
    /// raised token budget + `<think>` stripping in the runner.
    pub is_thinking: bool,
    /// The per-turn `num_predict` for this model: tier-scaled when `is_thinking`, else 256.
    /// Precomputed at construction (`difficulty::passk::max_tokens_for`), where the tier is
    /// known, so the runner doesn't need the tier threaded in.
    pub max_tokens: u32,
}

/// Merge the header's global eval params (`global`) with the harness's per-turn spec
/// (`spec`). Structural caps the eval loop sets — `num_predict` (the anti-runaway token
/// cap) and `num_ctx` (sized to keep the prefix-KV cache alive) — take precedence so a
/// header that leaves `max_tokens`/`num_ctx` unset can't strip them. Every other field is
/// a user sampling preference and comes from the header, falling back to the spec. `None`
/// only when neither side set any options.
fn merge_eval_options(
    global: Option<&GenerateOptions>,
    spec: Option<&GenerateOptions>,
) -> Option<GenerateOptions> {
    match (global, spec) {
        (None, s) => s.cloned(),
        (Some(g), None) => Some(g.clone()),
        (Some(g), Some(s)) => Some(GenerateOptions {
            // Harness-owned: the spec's value wins (it's a correctness/safety bound), but
            // honor a header-supplied value when the spec didn't pin one.
            num_predict: s.num_predict.or(g.num_predict),
            num_ctx: s.num_ctx.or(g.num_ctx),
            // User sampling prefs: header wins, spec is the fallback default.
            temperature: g.temperature.or(s.temperature),
            top_p: g.top_p.or(s.top_p),
            top_k: g.top_k.or(s.top_k),
            repeat_penalty: g.repeat_penalty.or(s.repeat_penalty),
            seed: g.seed.or(s.seed),
        }),
    }
}

impl ModelTurn for BackendTurn {
    async fn run(&self, spec: &GenerateSpec) -> AppResult<(String, GenerateStats)> {
        let mut out = String::new();
        let push = |t: &str| out.push_str(t);
        let cancel = self.cancel.clone();
        // The agentic loop builds its spec without a model name (it only knows the
        // `ModelTurn` seam). Inject our own so Ollama — which sends `spec.model` in
        // the request — targets the right model instead of an empty name. Merge the
        // global eval params with the harness spec FIELD-WISE (see `merge_eval_options`):
        // the loop's structural caps (`num_predict`, `num_ctx`) must win, or a header that
        // omits `max_tokens` strips the per-turn cap → runaway generation (minutes/turn,
        // KV-cache busting). User sampling prefs (top_p/top_k/penalty/seed/temperature)
        // still come from the header.
        let spec = GenerateSpec {
            model: self.model.clone(),
            options: merge_eval_options(self.options.as_ref(), spec.options.as_ref()),
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

    fn is_thinking(&self) -> bool {
        self.is_thinking
    }

    fn max_output_tokens(&self) -> u32 {
        self.max_tokens
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
    use super::{merge_eval_options, synthesize_calls, NativeToolCall};
    use crate::inference::eval::toolcall::parse::{extract_calls, looks_like_broken_json};
    use crate::inference::generate::generate_options::GenerateOptions;
    use serde_json::json;

    #[test]
    fn a_header_without_max_tokens_cannot_strip_the_harness_token_cap() {
        // The regression: a header that sets only temperature (num_predict/num_ctx unset)
        // used to REPLACE the spec wholesale → no token cap → runaway generation. The merge
        // must keep the spec's `num_predict`/`num_ctx` while taking the header's temperature.
        let global = GenerateOptions { temperature: Some(0.7), ..Default::default() };
        let spec = GenerateOptions { temperature: Some(0.0), num_predict: Some(256), num_ctx: Some(4096), ..Default::default() };
        let merged = merge_eval_options(Some(&global), Some(&spec)).unwrap();
        assert_eq!(merged.num_predict, Some(256), "the per-turn cap survives");
        assert_eq!(merged.num_ctx, Some(4096), "the sized context window survives");
        assert_eq!(merged.temperature, Some(0.7), "the header's sampling pref still applies");
    }

    #[test]
    fn header_sampling_prefs_pass_through_and_spec_only_fields_are_kept() {
        let global = GenerateOptions { top_p: Some(0.9), top_k: Some(40), seed: Some(7), ..Default::default() };
        let spec = GenerateOptions { temperature: Some(0.0), num_predict: Some(256), ..Default::default() };
        let merged = merge_eval_options(Some(&global), Some(&spec)).unwrap();
        assert_eq!(merged.top_p, Some(0.9));
        assert_eq!(merged.top_k, Some(40));
        assert_eq!(merged.seed, Some(7));
        assert_eq!(merged.num_predict, Some(256)); // spec-only field retained
        assert_eq!(merged.temperature, Some(0.0)); // header didn't set it → spec default
    }

    #[test]
    fn a_header_max_tokens_is_honored_only_when_the_spec_did_not_pin_one() {
        let global = GenerateOptions { num_predict: Some(1000), ..Default::default() };
        // spec pins the cap → spec wins (anti-runaway).
        let pinned = merge_eval_options(Some(&global), Some(&GenerateOptions { num_predict: Some(256), ..Default::default() })).unwrap();
        assert_eq!(pinned.num_predict, Some(256));
        // spec leaves it open → header value flows through.
        let open = merge_eval_options(Some(&global), Some(&GenerateOptions::default())).unwrap();
        assert_eq!(open.num_predict, Some(1000));
    }

    #[test]
    fn missing_sides_degrade_gracefully() {
        let spec = GenerateOptions { num_predict: Some(256), ..Default::default() };
        assert_eq!(merge_eval_options(None, Some(&spec)).unwrap().num_predict, Some(256));
        let global = GenerateOptions { temperature: Some(0.5), ..Default::default() };
        assert_eq!(merge_eval_options(Some(&global), None).unwrap().temperature, Some(0.5));
        assert!(merge_eval_options(None, None).is_none());
    }

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
