use crate::inference::chat_template_data::ChatTemplate;
use serde::Serialize;
use std::path::PathBuf;

#[derive(Debug, Clone)]
pub struct CreateSpec {
    pub gguf_path: PathBuf,
    pub chat_template: Option<ChatTemplate>,
    pub parameters: CreateParameters,
}

#[derive(Debug, Clone, Default)]
pub struct CreateParameters {
    pub temperature: Option<f32>,
    pub top_p: Option<f32>,
    pub top_k: Option<u32>,
    pub repeat_penalty: Option<f32>,
    pub stop: Vec<String>,
}

#[derive(Serialize, Clone, Debug)]
#[serde(tag = "phase", rename_all = "snake_case")]
pub enum CreatePhase {
    Hashing { bytes_completed: u64, bytes_total: u64 },
    Uploading { bytes_completed: u64, bytes_total: u64 },
    Creating,
}
