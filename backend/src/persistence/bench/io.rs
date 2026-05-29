use crate::errors::{AppError, AppResult};
use crate::persistence::bench::schema::BenchConfig;
use std::path::{Path, PathBuf};

pub const SUFFIX: &str = ".bench.yaml";

pub fn read(path: &Path) -> AppResult<BenchConfig> {
    let content = std::fs::read_to_string(path).map_err(|e| AppError::Io(e.to_string()))?;
    serde_yaml::from_str(&content).map_err(|e| AppError::Internal(e.to_string()))
}

pub fn write(path: &Path, c: &BenchConfig) -> AppResult<()> {
    let yaml = serde_yaml::to_string(c).map_err(|e| AppError::Internal(e.to_string()))?;
    std::fs::write(path, yaml).map_err(|e| AppError::Io(e.to_string()))
}

/// `(name, path)` for every `*.bench.yaml` directly in `dir`, sorted by name.
pub fn list(dir: &Path) -> AppResult<Vec<(String, PathBuf)>> {
    let mut out = Vec::new();
    let Ok(entries) = std::fs::read_dir(dir) else { return Ok(out) };
    for e in entries.flatten() {
        let p = e.path();
        if let Some(stem) = p.file_name().and_then(|s| s.to_str()).and_then(|n| n.strip_suffix(SUFFIX)) {
            out.push((stem.to_string(), p));
        }
    }
    out.sort_by(|a, b| a.0.cmp(&b.0));
    Ok(out)
}

#[cfg(test)]
#[path = "io_tests.rs"]
mod tests;
