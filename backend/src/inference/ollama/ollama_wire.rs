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
    /// Base64 images for a vision call. Omitted (byte-parity) for every text request.
    #[serde(skip_serializing_if = "Option::is_none")]
    pub images: Option<&'a [String]>,
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

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn keep_alive_serializes_when_set_and_is_omitted_when_none() {
        let with = GenerateRequest {
            model: "m", prompt: "p", system: None, options: None,
            keep_alive: Some(-1), images: None, stream: true,
        };
        let json = serde_json::to_string(&with).unwrap();
        assert!(json.contains("\"keep_alive\":-1"), "{json}");

        let without = GenerateRequest {
            model: "m", prompt: "p", system: None, options: None,
            keep_alive: None, images: None, stream: true,
        };
        assert!(!serde_json::to_string(&without).unwrap().contains("keep_alive"));
    }

    #[test]
    fn images_byte_parity_text_request_omits_the_field_and_vision_includes_it() {
        // A text call (images None) must serialize with NO `images` key — the text-path bytes are
        // unchanged. A vision call includes the base64 array.
        let text = GenerateRequest { model: "m", prompt: "p", system: None, options: None, keep_alive: None, images: None, stream: true };
        assert!(!serde_json::to_string(&text).unwrap().contains("images"));
        let imgs = vec!["BASE64DATA".to_string()];
        let vision = GenerateRequest { model: "m", prompt: "p", system: None, options: None, keep_alive: None, images: Some(&imgs), stream: true };
        assert!(serde_json::to_string(&vision).unwrap().contains("\"images\":[\"BASE64DATA\"]"));
    }
}
