use crate::errors::AppResult;
use crate::inference::backend::backend::InferenceBackend;
use crate::inference::backend::backend_kind::BackendKind;
use crate::inference::generate::generate_options::GenerateOptions;
use crate::inference::generate::generate_spec::GenerateSpec;
use crate::inference::generate::generate_stats::GenerateStats;
use crate::inference::llama::llama_backend::LlamaCppBackend;
use crate::inference::mlx::mlx_backend::MlxBackend;
use crate::inference::ollama::ollama_backend::OllamaBackend;
use tokio_util::sync::CancellationToken;

/// One model turn behind a seam: prompt in → (text, stats) out. The runner
/// depends on this, not on a concrete backend, so it stays unit-testable with a
/// scripted model while the real path drives a live `InferenceBackend`.
#[allow(async_fn_in_trait)]
pub trait ModelTurn {
    async fn run(&self, spec: &GenerateSpec) -> AppResult<(String, GenerateStats)>;
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
}
