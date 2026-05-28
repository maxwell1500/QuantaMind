use crate::errors::{AppError, AppResult};
use serde::{Deserialize, Serialize};
use std::path::Path;

pub const MAX_RECENTS: usize = 10;

#[derive(Serialize, Deserialize, PartialEq, Debug, Clone)]
pub struct RecentEntry {
    pub path: String,
    pub opened_at: String,
}

#[derive(Serialize, Deserialize, PartialEq, Debug, Clone, Default)]
pub struct RecentList {
    #[serde(default)]
    pub entries: Vec<RecentEntry>,
}

pub fn load(path: &Path) -> AppResult<RecentList> {
    if !path.exists() {
        return Ok(RecentList::default());
    }
    let content = std::fs::read_to_string(path).map_err(|e| AppError::Io(e.to_string()))?;
    if content.trim().is_empty() {
        return Ok(RecentList::default());
    }
    serde_yaml::from_str(&content).map_err(|e| AppError::Internal(e.to_string()))
}

pub fn save(path: &Path, list: &RecentList) -> AppResult<()> {
    if let Some(parent) = path.parent() {
        std::fs::create_dir_all(parent).map_err(|e| AppError::Io(e.to_string()))?;
    }
    let yaml = serde_yaml::to_string(list).map_err(|e| AppError::Internal(e.to_string()))?;
    std::fs::write(path, yaml).map_err(|e| AppError::Io(e.to_string()))
}

/// Move `entry` to the front, dedupe by `path`, cap at `MAX_RECENTS`.
pub fn record(list: &mut RecentList, entry: RecentEntry) {
    list.entries.retain(|e| e.path != entry.path);
    list.entries.insert(0, entry);
    list.entries.truncate(MAX_RECENTS);
}

#[cfg(test)]
#[path = "workspaces_tests.rs"]
mod tests;
