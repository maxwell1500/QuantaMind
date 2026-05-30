use crate::inference::generate::generate_options::GenerateOptions;
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
        let opts = GenerateOptions { num_predict: Some(16), temperature: Some(0.2), ..Default::default() };
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
}
