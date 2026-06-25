//! The vision OCR task/collection schema. The image is bundled (resolved by `image` id in
//! `scenarios.rs`); `ground_truth` is the authored answer key — bundled-at-authoring, NEVER OCR'd
//! live. Only the model's extraction is produced live.

use serde::{Deserialize, Serialize};

#[derive(Serialize, Deserialize, Clone, Debug, PartialEq)]
pub struct VisionTask {
    pub id: String,
    /// The OCR prompt; a default extraction prompt is used when absent.
    #[serde(default)]
    pub prompt: Option<String>,
    /// The bundled image id (→ `scenarios::image_bytes`).
    pub image: String,
    /// The ground-truth text (the answer key).
    pub ground_truth: String,
    /// Tokens that must be transcribed exactly (amounts, dates, names) — up-weighted via
    /// `critical_token_accuracy`. Empty = none.
    #[serde(default)]
    pub critical_tokens: Vec<String>,
}

#[derive(Serialize, Deserialize, Clone, Debug, PartialEq)]
pub struct VisionCollection {
    pub name: String,
    pub tasks: Vec<VisionTask>,
}
