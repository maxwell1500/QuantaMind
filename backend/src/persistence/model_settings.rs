use crate::errors::{AppError, AppResult};
use serde::{Deserialize, Serialize};
use std::collections::HashMap;
use std::path::Path;

#[derive(Serialize, Deserialize, PartialEq, Debug, Clone)]
pub struct ModelSettings {
    pub temperature: f32,
    /// Reasoning model (sidebar "thinking" toggle). `#[serde(default)]` so a settings file
    /// written before this field loads with `is_thinking = false`.
    #[serde(default)]
    pub is_thinking: bool,
}

pub type ModelSettingsMap = HashMap<String, ModelSettings>;

pub fn load(path: &Path) -> AppResult<ModelSettingsMap> {
    if !path.exists() {
        return Ok(HashMap::new());
    }
    let content = std::fs::read_to_string(path).map_err(|e| AppError::Io(e.to_string()))?;
    if content.trim().is_empty() {
        return Ok(HashMap::new());
    }
    serde_yaml::from_str(&content).map_err(|e| AppError::Internal(e.to_string()))
}

pub fn save(path: &Path, map: &ModelSettingsMap) -> AppResult<()> {
    if let Some(parent) = path.parent() {
        std::fs::create_dir_all(parent).map_err(|e| AppError::Io(e.to_string()))?;
    }
    let yaml = serde_yaml::to_string(map).map_err(|e| AppError::Internal(e.to_string()))?;
    std::fs::write(path, yaml).map_err(|e| AppError::Io(e.to_string()))?;
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;
    use tempfile::tempdir;

    #[test]
    fn load_missing_returns_empty() {
        let dir = tempdir().unwrap();
        assert!(load(&dir.path().join("nope.yaml")).unwrap().is_empty());
    }

    #[test]
    fn empty_file_loads_as_empty() {
        let dir = tempdir().unwrap();
        let p = dir.path().join("empty.yaml");
        std::fs::write(&p, "").unwrap();
        assert!(load(&p).unwrap().is_empty());
    }

    #[test]
    fn round_trip_preserves_values() {
        let dir = tempdir().unwrap();
        let p = dir.path().join("s.yaml");
        let mut m = ModelSettingsMap::new();
        m.insert("llama3".into(), ModelSettings { temperature: 0.3, is_thinking: false });
        m.insert("phi".into(), ModelSettings { temperature: 1.5, is_thinking: true });
        save(&p, &m).unwrap();
        assert_eq!(load(&p).unwrap(), m);
    }

    #[test]
    fn settings_without_is_thinking_field_load_as_false() {
        // Back-compat: a file written before the thinking toggle has only `temperature`.
        let dir = tempdir().unwrap();
        let p = dir.path().join("old.yaml");
        std::fs::write(&p, "llama3:\n  temperature: 0.3\n").unwrap();
        let loaded = load(&p).unwrap();
        assert_eq!(loaded["llama3"], ModelSettings { temperature: 0.3, is_thinking: false });
    }

    #[test]
    fn save_creates_missing_parent_dir() {
        let dir = tempdir().unwrap();
        let p = dir.path().join("nested/deep/s.yaml");
        save(&p, &ModelSettingsMap::new()).unwrap();
        assert!(p.exists());
    }
}
