use crate::errors::AppResult;
use crate::inference::backend::backend::InferenceBackend;
use crate::inference::backend::backend_kind::BackendKind;
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
}

impl ModelTurn for BackendTurn {
    async fn run(&self, spec: &GenerateSpec) -> AppResult<(String, GenerateStats)> {
        let mut out = String::new();
        let push = |t: &str| out.push_str(t);
        let cancel = self.cancel.clone();
        let stats = match self.backend {
            BackendKind::Ollama => OllamaBackend::new(self.endpoint.clone()).generate(spec, cancel, push).await?,
            BackendKind::LlamaCpp => LlamaCppBackend::new(self.endpoint.clone()).generate(spec, cancel, push).await?,
            BackendKind::Mlx => MlxBackend::new(self.endpoint.clone(), self.model.clone()).generate(spec, cancel, push).await?,
        };
        Ok((out, stats))
    }
}
