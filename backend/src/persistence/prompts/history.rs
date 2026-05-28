use crate::errors::{AppError, AppResult};
use crate::persistence::prompts::schema::InferenceParams;
use serde::{Deserialize, Serialize};
use std::path::Path;

pub const MAX_HISTORY: usize = 50;
pub const PREVIEW_CHARS: usize = 280;

#[derive(Serialize, Deserialize, PartialEq, Debug, Clone)]
pub struct HistoryEntry {
    pub id: String,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub prompt_path: Option<String>,
    pub model: String,
    #[serde(default)]
    pub system: String,
    #[serde(default)]
    pub user: String,
    #[serde(default)]
    pub params: InferenceParams,
    #[serde(default)]
    pub output_preview: String,
    pub output_len: usize,
    pub token_count: u32,
    pub ran_at: String,
}

#[derive(Serialize, Deserialize, Default, PartialEq, Debug, Clone)]
pub struct History {
    #[serde(default)]
    pub entries: Vec<HistoryEntry>,
}

pub fn load(path: &Path) -> AppResult<History> {
    if !path.exists() {
        return Ok(History::default());
    }
    let content = std::fs::read_to_string(path).map_err(|e| AppError::Io(e.to_string()))?;
    if content.trim().is_empty() {
        return Ok(History::default());
    }
    serde_yaml::from_str(&content).map_err(|e| AppError::Internal(e.to_string()))
}

pub fn save(path: &Path, h: &History) -> AppResult<()> {
    if let Some(parent) = path.parent() {
        std::fs::create_dir_all(parent).map_err(|e| AppError::Io(e.to_string()))?;
    }
    let yaml = serde_yaml::to_string(h).map_err(|e| AppError::Internal(e.to_string()))?;
    std::fs::write(path, yaml).map_err(|e| AppError::Io(e.to_string()))
}

/// Insert newest-first, cap at MAX_HISTORY. Returns evicted entries so the
/// caller can delete their output blobs.
pub fn record(h: &mut History, entry: HistoryEntry) -> Vec<HistoryEntry> {
    h.entries.insert(0, entry);
    if h.entries.len() > MAX_HISTORY {
        h.entries.split_off(MAX_HISTORY)
    } else {
        Vec::new()
    }
}

pub fn preview(s: &str) -> String {
    s.chars().take(PREVIEW_CHARS).collect()
}

#[cfg(test)]
#[path = "history_tests.rs"]
mod tests;
