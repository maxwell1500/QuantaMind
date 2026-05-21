use crate::errors::{AppError, AppResult};
use serde::{Deserialize, Serialize};
use std::path::Path;

#[derive(Serialize, Deserialize, PartialEq, Debug, Clone)]
pub struct StoredPrompt {
    pub model: String,
    pub prompt: String,
}

pub fn save_prompt(path: &Path, value: &StoredPrompt) -> AppResult<()> {
    let yaml =
        serde_yaml::to_string(value).map_err(|e| AppError::Internal(e.to_string()))?;
    std::fs::write(path, yaml).map_err(|e| AppError::Io(e.to_string()))?;
    Ok(())
}

pub fn load_prompt(path: &Path) -> AppResult<StoredPrompt> {
    let content =
        std::fs::read_to_string(path).map_err(|e| AppError::Io(e.to_string()))?;
    serde_yaml::from_str(&content).map_err(|e| AppError::Internal(e.to_string()))
}

#[cfg(test)]
mod tests {
    use super::*;
    use tempfile::tempdir;

    fn round_trip_is_byte_identical(p: StoredPrompt) {
        let dir = tempdir().unwrap();
        let path = dir.path().join("p.yaml");
        save_prompt(&path, &p).unwrap();
        let bytes_a = std::fs::read(&path).unwrap();
        let loaded = load_prompt(&path).unwrap();
        assert_eq!(loaded, p, "loaded struct differs from saved");
        save_prompt(&path, &loaded).unwrap();
        let bytes_b = std::fs::read(&path).unwrap();
        assert_eq!(bytes_a, bytes_b, "save->load->save not byte-identical");
    }

    #[test]
    fn round_trips_plain_ascii() {
        round_trip_is_byte_identical(StoredPrompt {
            model: "llama3.2:1b".into(),
            prompt: "Why is the sky blue?".into(),
        });
    }

    #[test]
    fn round_trips_multiline_prompt() {
        round_trip_is_byte_identical(StoredPrompt {
            model: "phi3:mini".into(),
            prompt: "line one\nline two\nline three".into(),
        });
    }

    #[test]
    fn round_trips_unicode_and_quotes() {
        round_trip_is_byte_identical(StoredPrompt {
            model: "mistral:7b".into(),
            prompt: "世界 — say \"hi\" and 'bye'".into(),
        });
    }

    #[test]
    fn load_missing_file_is_io_error() {
        let dir = tempdir().unwrap();
        let path = dir.path().join("does-not-exist.yaml");
        match load_prompt(&path) {
            Err(AppError::Io(_)) => {}
            other => panic!("expected Io err, got {other:?}"),
        }
    }
}
