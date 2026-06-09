use crate::commands::storage::storage_types::DiskUsage;
use std::path::{Path, PathBuf};
use sysinfo::Disks;

/// Make a path absolute so the UI never shows a relative/"hidden" path like
/// `./`. Relative paths are joined onto the current working directory.
pub(crate) fn absolutize(p: PathBuf) -> PathBuf {
    if p.is_absolute() {
        return p;
    }
    std::env::current_dir().map(|cwd| cwd.join(&p)).unwrap_or(p)
}

/// Resolve the on-disk Ollama models directory. Respects `OLLAMA_MODELS`
/// if set; otherwise defaults to `$HOME/.ollama/models` (works on macOS
/// and Linux; Windows users will set the env var per M.13's settings).
pub fn models_dir() -> PathBuf {
    if let Ok(p) = std::env::var("OLLAMA_MODELS") {
        return absolutize(PathBuf::from(p));
    }
    let home = std::env::var("HOME").unwrap_or_else(|_| "/".to_string());
    PathBuf::from(home).join(".ollama/models")
}

/// Shared GGUF weights folder, the source of truth for both backends. HF and
/// local-file downloads are retained here (llama.cpp loads them directly;
/// Ollama imports them). Precedence: user setting → `QUANTAMIND_GGUF_DIR` env →
/// `~/.quantamind/gguf`.
pub fn gguf_dir_resolved(setting: Option<&str>) -> PathBuf {
    if let Some(p) = setting.filter(|s| !s.trim().is_empty()) {
        return absolutize(PathBuf::from(p));
    }
    if let Ok(p) = std::env::var("QUANTAMIND_GGUF_DIR") {
        return absolutize(PathBuf::from(p));
    }
    let home = std::env::var("HOME").unwrap_or_else(|_| "/".to_string());
    PathBuf::from(home).join(".quantamind/gguf")
}

/// The default/env-resolved weights folder (no user-setting override).
pub fn gguf_dir() -> PathBuf {
    gguf_dir_resolved(None)
}

/// Path for a GGUF named `name`, sanitizing `:`/`/` so a model tag like
/// `llama3.2:1b` maps to a safe `llama3.2_1b.gguf` filename.
pub fn gguf_dest(dir: &Path, name: &str) -> PathBuf {
    let safe = name.replace([':', '/'], "_");
    dir.join(format!("{safe}.gguf"))
}

/// Local MLX weights folder. Each MLX repo is snapshotted into its own subdir
/// here (multi-file safetensors models, unlike single-file GGUF). Precedence:
/// user setting → `QUANTAMIND_MLX_DIR` env → `~/.quantamind/mlx`.
pub fn mlx_dir_resolved(setting: Option<&str>) -> PathBuf {
    if let Some(p) = setting.filter(|s| !s.trim().is_empty()) {
        return absolutize(PathBuf::from(p));
    }
    if let Ok(p) = std::env::var("QUANTAMIND_MLX_DIR") {
        return absolutize(PathBuf::from(p));
    }
    let home = std::env::var("HOME").unwrap_or_else(|_| "/".to_string());
    PathBuf::from(home).join(".quantamind/mlx")
}

/// The default/env-resolved MLX weights folder (no user-setting override).
pub fn mlx_dir() -> PathBuf {
    mlx_dir_resolved(None)
}

/// MLX **STT** (mlx-audio whisper) snapshot folder — kept separate from the MLX
/// LLM folder so speech models don't co-mingle with chat models. Precedence:
/// user setting → `QUANTAMIND_MLX_STT_DIR` env → `~/.quantamind/mlx-stt`.
pub fn mlx_stt_dir_resolved(setting: Option<&str>) -> PathBuf {
    if let Some(p) = setting.filter(|s| !s.trim().is_empty()) {
        return absolutize(PathBuf::from(p));
    }
    if let Ok(p) = std::env::var("QUANTAMIND_MLX_STT_DIR") {
        return absolutize(PathBuf::from(p));
    }
    let home = std::env::var("HOME").unwrap_or_else(|_| "/".to_string());
    PathBuf::from(home).join(".quantamind/mlx-stt")
}

/// The default/env-resolved MLX STT folder (no user-setting override).
pub fn mlx_stt_dir() -> PathBuf {
    mlx_stt_dir_resolved(None)
}

/// Subdirectory holding one MLX repo's snapshot, sanitizing `/`/`:` so
/// `mlx-community/Llama-3.2-3B-Instruct-4bit` maps to a safe
/// `mlx-community_Llama-3.2-3B-Instruct-4bit` folder.
pub fn mlx_model_dir(dir: &Path, repo: &str) -> PathBuf {
    let safe = repo.replace(['/', ':'], "_");
    dir.join(safe)
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
