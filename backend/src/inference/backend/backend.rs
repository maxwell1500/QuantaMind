use crate::errors::AppResult;
use crate::inference::generate::generate_spec::GenerateSpec;
use tokio_util::sync::CancellationToken;

/// One streaming generation against some backend. Implementors stream
/// response text through `on_token` and return when the model is done or
/// `cancel` fires. The same contract for Ollama, llama.cpp, and cloud, so
/// callers stay backend-agnostic and select via a `BackendKind` match.
#[allow(async_fn_in_trait)]
pub trait InferenceBackend {
    async fn generate<F: FnMut(&str)>(
        &self,
        spec: &GenerateSpec,
        cancel: CancellationToken,
        on_token: F,
    ) -> AppResult<()>;
}
