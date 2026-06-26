use crate::inference::generate::generate_options::GenerateOptions;
use crate::inference::llama::llama_timings::Timings;
use serde::{Deserialize, Serialize};

/// llama-server `/completion` request. Field names follow llama.cpp's server
/// (`n_predict`, not Ollama's `num_predict`); the model is fixed at spawn so the
/// body carries no model name. System text is prepended to the prompt —
/// `/completion` applies no chat template.
#[derive(Serialize)]
pub struct CompletionRequest {
    pub prompt: String,
    pub stream: bool,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub temperature: Option<f32>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub top_p: Option<f32>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub top_k: Option<u32>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub n_predict: Option<u32>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub repeat_penalty: Option<f32>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub seed: Option<i64>,
}

impl CompletionRequest {
    pub fn new(prompt: String, opts: Option<GenerateOptions>) -> Self {
        let o = opts.unwrap_or_default();
        Self {
            prompt,
            stream: true,
            temperature: o.temperature,
            top_p: o.top_p,
            top_k: o.top_k,
            n_predict: o.num_predict,
            repeat_penalty: o.repeat_penalty,
            seed: o.seed,
        }
    }
}

#[derive(Deserialize)]
pub struct CompletionChunk {
    #[serde(default)]
    pub content: String,
    pub stop: bool,
    #[serde(default)]
    pub timings: Option<Timings>,
}

/// llama-server `/v1/chat/completions` request (OpenAI-compatible). This is the
/// PRIMARY path: with `--jinja` at spawn the server applies the GGUF's embedded
/// chat template, giving the model its trained turn structure so it emits EOS
/// and stops — the `/completion` path (raw prompt, no template) is the fallback.
///
/// Unlike mlx's `ChatRequest`, this keeps `seed` (llama.cpp eval runs are
/// seed-reproducible and must stay so) and carries `stop` when set. The server
/// is single-model, so `model` is sent only for OpenAI-client compatibility.
#[derive(Serialize)]
pub struct ChatRequest {
    pub model: String,
    pub messages: Vec<ChatMessage>,
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
    pub repeat_penalty: Option<f32>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub seed: Option<i64>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub stop: Option<Vec<String>>,
}

#[derive(Serialize)]
pub struct ChatMessage {
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
            messages.push(ChatMessage {
                role: "system",
                content: s.to_string(),
            });
        }
        messages.push(ChatMessage {
            role: "user",
            content: prompt,
        });
        Self {
            model,
            messages,
            stream: true,
            max_tokens: o.num_predict,
            temperature: o.temperature,
            top_p: o.top_p,
            top_k: o.top_k,
            repeat_penalty: o.repeat_penalty,
            seed: o.seed,
            stop: o.stop,
        }
    }
}

/// Strip an SSE `data: ` prefix if present. llama-server streams `/completion`
/// as `data: {json}` lines; a bare-JSON line is accepted too.
pub fn strip_sse(line: &[u8]) -> &[u8] {
    line.strip_prefix(b"data: ").unwrap_or(line)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn maps_num_predict_to_n_predict() {
        let opts = GenerateOptions {
            num_predict: Some(16),
            temperature: Some(0.2),
            ..Default::default()
        };
        let json = serde_json::to_string(&CompletionRequest::new("hi".into(), Some(opts))).unwrap();
        assert!(json.contains("\"n_predict\":16"));
        assert!(json.contains("\"temperature\":0.2"));
        assert!(json.contains("\"stream\":true"));
        assert!(!json.contains("num_predict"));
    }

    #[test]
    fn omits_unset_options() {
        let json = serde_json::to_string(&CompletionRequest::new("hi".into(), None)).unwrap();
        assert!(!json.contains("temperature"));
        assert!(!json.contains("seed"));
    }

    #[test]
    fn strip_sse_removes_data_prefix_only_when_present() {
        assert_eq!(strip_sse(b"data: {\"x\":1}"), b"{\"x\":1}");
        assert_eq!(strip_sse(b"{\"x\":1}"), b"{\"x\":1}");
    }

    #[test]
    fn chat_request_splits_system_and_user_messages() {
        let json = serde_json::to_string(&ChatRequest::new(
            "m".into(),
            "hi".into(),
            Some("be brief"),
            None,
        ))
        .unwrap();
        assert!(json.contains("\"role\":\"system\""));
        assert!(json.contains("\"content\":\"be brief\""));
        assert!(json.contains("\"role\":\"user\""));
        assert!(json.contains("\"content\":\"hi\""));
    }

    /// The reason for a llama-specific request: seed-reproducibility and stops
    /// must survive onto the chat wire (mlx's ChatRequest drops seed).
    #[test]
    fn chat_request_preserves_seed_and_stop() {
        let opts = GenerateOptions {
            seed: Some(42),
            stop: Some(vec!["<|im_end|>".into()]),
            num_predict: Some(128),
            ..Default::default()
        };
        let json =
            serde_json::to_string(&ChatRequest::new("m".into(), "hi".into(), None, Some(opts)))
                .unwrap();
        assert!(
            json.contains("\"seed\":42"),
            "seed must reach the wire: {json}"
        );
        assert!(
            json.contains("<|im_end|>"),
            "stop must reach the wire: {json}"
        );
        assert!(json.contains("\"max_tokens\":128"));
    }

    #[test]
    fn chat_request_omits_unset_system_and_options() {
        let json =
            serde_json::to_string(&ChatRequest::new("m".into(), "hi".into(), None, None)).unwrap();
        assert!(!json.contains("system"));
        assert!(!json.contains("seed"));
        assert!(!json.contains("stop"));
    }
}
