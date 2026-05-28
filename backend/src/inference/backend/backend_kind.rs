use serde::{Deserialize, Serialize};

/// Which backend serves a model. Ollama is the only one today; llama.cpp
/// (Step 3.2) and cloud (Step 3.10) add variants. Serde-ready so it can
/// surface as `ModelInfo.backend` over IPC when 3.2 lands.
#[derive(Clone, Copy, Debug, PartialEq, Eq, Serialize, Deserialize, Default)]
#[serde(rename_all = "snake_case")]
pub enum BackendKind {
    #[default]
    Ollama,
}
