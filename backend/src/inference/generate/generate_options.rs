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
    /// Context window. Larger = the model uses more of its window for long
    /// prompts, at the cost of more KV-cache memory.
    #[serde(skip_serializing_if = "Option::is_none")]
    pub num_ctx: Option<u32>,
}

impl GenerateOptions {
    pub fn is_empty(&self) -> bool {
        self.temperature.is_none() && self.top_p.is_none() && self.top_k.is_none()
            && self.num_predict.is_none() && self.repeat_penalty.is_none() && self.seed.is_none()
            && self.num_ctx.is_none()
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn num_ctx_serializes_and_counts_as_non_empty() {
        let o = GenerateOptions { num_ctx: Some(32768), ..Default::default() };
        assert!(!o.is_empty());
        let json = serde_json::to_string(&o).unwrap();
        assert!(json.contains("\"num_ctx\":32768"), "{json}");
        // unset → omitted, and an all-None options is empty
        assert!(GenerateOptions::default().is_empty());
        assert!(!serde_json::to_string(&GenerateOptions::default()).unwrap().contains("num_ctx"));
    }
}
