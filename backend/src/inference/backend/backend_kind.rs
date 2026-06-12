use serde::{Deserialize, Serialize};

/// Which backend serves a model. Ollama and llama.cpp (a bundled `llama-server`
/// sidecar) today, plus `mlx_lm.server` on Apple Silicon; the enum stays open to
/// a future cloud variant. Surfaces as `ModelInfo.backend` over IPC and selects
/// the backend in compare dispatch.
#[derive(Clone, Copy, Debug, PartialEq, Eq, Serialize, Deserialize, Default)]
#[serde(rename_all = "snake_case")]
pub enum BackendKind {
    #[default]
    Ollama,
    LlamaCpp,
    Mlx,
}

#[cfg(test)]
#[path = "backend_kind_tests.rs"]
mod tests;
