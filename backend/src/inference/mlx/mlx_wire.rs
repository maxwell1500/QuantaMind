use crate::inference::generate::generate_options::GenerateOptions;
use serde::Serialize;

/// mlx_lm.server `/v1/chat/completions` request (OpenAI-compatible). The server
/// is multi-model, so `model` is sent. System text becomes a `system` message —
/// the endpoint applies the chat template. mlx_lm.server extends the OpenAI
/// schema with `top_k`/`repetition_penalty` but has **no `seed` field**, so a
/// seed is intentionally dropped (MLX runs are not seed-reproducible).
#[derive(Serialize)]
pub struct ChatRequest {
    pub model: String,
    pub messages: Vec<Message>,
    pub stream: bool,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub max_tokens: Option<u32>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub temperature: Option<f32>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub top_p: Option<f32>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub top_k: Option<u32>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub repetition_penalty: Option<f32>,
}

#[derive(Serialize)]
pub struct Message {
    pub role: &'static str,
    pub content: String,
}

impl ChatRequest {
    pub fn new(
        model: String,
        prompt: String,
        system: Option<&str>,
        opts: Option<GenerateOptions>,
    ) -> Self {
        let o = opts.unwrap_or_default();
        let mut messages = Vec::new();
        if let Some(s) = system.filter(|s| !s.is_empty()) {
            messages.push(Message { role: "system", content: s.to_string() });
        }
        messages.push(Message { role: "user", content: prompt });
        Self {
            model,
            messages,
            stream: true,
            max_tokens: o.num_predict,
            temperature: o.temperature,
            top_p: o.top_p,
            top_k: o.top_k,
            repetition_penalty: o.repeat_penalty,
        }
    }
}

#[cfg(test)]
#[path = "mlx_wire_tests.rs"]
mod tests;
