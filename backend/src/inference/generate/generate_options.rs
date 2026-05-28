use serde::Serialize;

/// Ollama `/api/generate` `options` block. Field names mirror Ollama's
/// API (note `num_predict`, not `max_tokens`). Every field is optional so
/// unset knobs fall back to Ollama's own defaults.
#[derive(Serialize, Default, Clone, Debug, PartialEq)]
pub struct GenerateOptions {
    #[serde(skip_serializing_if = "Option::is_none")]
    pub temperature: Option<f32>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub top_p: Option<f32>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub top_k: Option<u32>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub num_predict: Option<u32>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub repeat_penalty: Option<f32>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub seed: Option<i64>,
}

impl GenerateOptions {
    pub fn is_empty(&self) -> bool {
        self.temperature.is_none() && self.top_p.is_none() && self.top_k.is_none()
            && self.num_predict.is_none() && self.repeat_penalty.is_none() && self.seed.is_none()
    }
}
