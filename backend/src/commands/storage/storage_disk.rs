use crate::commands::storage::storage_types::DiskUsage;
use std::path::{Path, PathBuf};
use sysinfo::Disks;

/// Resolve the on-disk Ollama models directory. Respects `OLLAMA_MODELS`
/// if set; otherwise defaults to `$HOME/.ollama/models` (works on macOS
/// and Linux; Windows users will set the env var per M.13's settings).
pub fn models_dir() -> PathBuf {
    if let Ok(p) = std::env::var("OLLAMA_MODELS") {
        return PathBuf::from(p);
    }
    let home = std::env::var("HOME").unwrap_or_else(|_| "/".to_string());
    PathBuf::from(home).join(".ollama/models")
}

/// Persistent directory for standalone GGUF files kept for the llama.cpp
/// backend. HF downloads are retained here (not deleted after the Ollama
/// import) so they can be discovered as llama.cpp models. Overridable via
/// `QUANTAMIND_GGUF_DIR` (used by tests and power users).
pub fn gguf_dir() -> PathBuf {
    if let Ok(p) = std::env::var("QUANTAMIND_GGUF_DIR") {
        return PathBuf::from(p);
    }
    let home = std::env::var("HOME").unwrap_or_else(|_| ".".to_string());
    PathBuf::from(home).join(".quantamind/gguf")
}

/// Path for a GGUF named `name`, sanitizing `:`/`/` so a model tag like
/// `llama3.2:1b` maps to a safe `llama3.2_1b.gguf` filename.
pub fn gguf_dest(dir: &Path, name: &str) -> PathBuf {
    let safe = name.replace([':', '/'], "_");
    dir.join(format!("{safe}.gguf"))
}

/// Compute total/free bytes for the disk that holds `probe_path`, plus
/// the caller-supplied sum of all model blob sizes (from /api/tags).
/// Falls back to zero if no disk matches (e.g. exotic mount layout).
pub fn compute_disk_usage(probe_path: &Path, models_bytes: u64) -> DiskUsage {
    let disks = Disks::new_with_refreshed_list();
    let best = disks
        .list()
        .iter()
        .filter(|d| probe_path.starts_with(d.mount_point()))
        .max_by_key(|d| d.mount_point().as_os_str().len());
    let (total, free) = match best {
        Some(d) => (d.total_space(), d.available_space()),
        None => (0u64, 0u64),
    };
    DiskUsage {
        total_bytes: total,
        free_bytes: free,
        ollama_models_bytes: models_bytes,
    }
}

#[cfg(test)]
#[path = "storage_disk_tests.rs"]
mod tests;
