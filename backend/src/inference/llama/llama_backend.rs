use crate::errors::AppResult;
use crate::inference::backend::backend::InferenceBackend;
use crate::inference::generate::generate_spec::GenerateSpec;
use crate::inference::generate::generate_stats::GenerateStats;
use crate::inference::llama::llama::stream_generate;
use tokio_util::sync::CancellationToken;

/// Streams generations from a `llama-server` `/completion` endpoint. The server
/// is single-model (the GGUF is fixed at spawn), so `spec.model` and
/// `spec.keep_alive` are not part of the request.
pub struct LlamaCppBackend {
    endpoint: String,
}

impl LlamaCppBackend {
    pub fn new(endpoint: String) -> Self {
        Self { endpoint }
    }
}

impl InferenceBackend for LlamaCppBackend {
    async fn generate<F: FnMut(&str)>(
        &self,
        spec: &GenerateSpec,
        cancel: CancellationToken,
        on_token: F,
    ) -> AppResult<GenerateStats> {
        stream_generate(
            &self.endpoint,
            &spec.prompt,
            spec.system.as_deref(),
            spec.options.clone(),
            cancel,
            on_token,
        )
        .await
    }
}
