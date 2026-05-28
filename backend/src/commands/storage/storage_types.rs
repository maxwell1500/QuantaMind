use serde::{Deserialize, Serialize};

#[derive(Serialize, Clone)]
pub struct InstalledModelInfo {
    pub name: String,
    pub size_bytes: u64,
    pub modified_at: String,
    pub family: String,
    pub parameter_size: String,
    pub quantization: String,
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
    #[serde(default)] pub details: Option<ModelDetails>,
}

#[derive(Deserialize)]
pub(crate) struct ModelDetails {
    #[serde(default)] pub family: String,
    #[serde(default)] pub parameter_size: String,
    #[serde(default)] pub quantization_level: String,
}
