use crate::inference::generate::generate_options::GenerateOptions;
use crate::inference::generate::generate_stats::{ns_to_ms, GenerateStats};
use serde::{Deserialize, Serialize};

/// Ollama `/api/generate` request body. `stream` is always true; unset options
/// and an absent system prompt are omitted.
#[derive(Serialize)]
pub(crate) struct GenerateRequest<'a> {
    pub model: &'a str,
    pub prompt: &'a str,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub system: Option<&'a str>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub options: Option<GenerateOptions>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub keep_alive: Option<i32>,
    pub stream: bool,
}

/// One NDJSON chunk. The final (`done:true`) chunk also carries nanosecond
/// duration + token-count metrics, mapped to `GenerateStats` (ns→ms).
#[derive(Deserialize)]
pub(crate) struct GenerateChunk {
    #[serde(default)]
    pub response: String,
    pub done: bool,
    #[serde(default)]
    load_duration: Option<u64>,
    #[serde(default)]
    prompt_eval_count: Option<u32>,
    #[serde(default)]
    prompt_eval_duration: Option<u64>,
    #[serde(default)]
    eval_count: Option<u32>,
    #[serde(default)]
    eval_duration: Option<u64>,
    #[serde(default)]
    total_duration: Option<u64>,
}

impl GenerateChunk {
    pub(crate) fn stats(&self) -> GenerateStats {
        GenerateStats {
            prompt_eval_count: self.prompt_eval_count,
            prompt_eval_ms: self.prompt_eval_duration.map(ns_to_ms),
            eval_count: self.eval_count,
            eval_ms: self.eval_duration.map(ns_to_ms),
            load_ms: self.load_duration.map(ns_to_ms),
            total_ms: self.total_duration.map(ns_to_ms),
        }
    }
}
