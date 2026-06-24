use crate::inference::backend::backend_kind::BackendKind;
use serde::{Deserialize, Serialize};

#[derive(Serialize, Clone)]
pub struct InstalledModelInfo {
    pub name: String,
    pub size_bytes: u64,
    pub modified_at: String,
    pub family: String,
    pub parameter_size: String,
    pub quantization: String,
    pub backend: BackendKind,
    /// Content hash identifying the underlying model blob. Ollama reports it
    /// per tag, so the same model imported under several tags shares one
    /// digest — the picker collapses on it. Empty for backends that expose no
    /// hash (llama.cpp GGUF, MLX), where each entry is already unique.
    #[serde(skip_serializing_if = "String::is_empty")]
    pub digest: String,
    /// Friendly label for the picker when `name` is not presentable (MLX uses
    /// the on-disk path as `name` for wire-id matching, so it carries the HF
    /// repo here). `None` for backends whose `name` is already friendly.
    #[serde(skip_serializing_if = "Option::is_none")]
    pub display_name: Option<String>,
    /// Absolute GGUF path — set for llama.cpp models (used to launch the
    /// sidecar on the right file); `None` for Ollama models.
    #[serde(skip_serializing_if = "Option::is_none")]
    pub path: Option<String>,
}

#[derive(Serialize, Clone)]
pub struct DiskUsage {
    pub total_bytes: u64,
    pub free_bytes: u64,
    pub ollama_models_bytes: u64,
}

#[derive(Deserialize)]
pub(crate) struct TagsResponse {
    pub models: Vec<ModelEntry>,
}

#[derive(Deserialize)]
pub(crate) struct ModelEntry {
    pub name: String,
    #[serde(default)] pub size: u64,
    #[serde(default)] pub modified_at: String,
    #[serde(default)] pub digest: String,
    #[serde(default)] pub details: Option<ModelDetails>,
}

#[derive(Deserialize, Default)]
pub(crate) struct ModelDetails {
    #[serde(default)] pub family: String,
    #[serde(default)] pub parameter_size: String,
    #[serde(default)] pub quantization_level: String,
}
