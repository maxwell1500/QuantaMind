use crate::commands::storage::storage_disk::absolutize;
use std::path::{Path, PathBuf};

/// App-owned STT models folder — the source of truth for installed whisper.cpp
/// models and the shared silero VAD, kept out of the scattered per-tool caches.
/// Precedence: user setting → `QUANTAMIND_STT_DIR` env → `~/.quantamind/stt`.
/// Mirrors `storage_disk::gguf_dir_resolved`.
pub fn stt_dir_resolved(setting: Option<&str>) -> PathBuf {
    if let Some(p) = setting.filter(|s| !s.trim().is_empty()) {
        return absolutize(PathBuf::from(p));
    }
    if let Ok(p) = std::env::var("QUANTAMIND_STT_DIR") {
        return absolutize(PathBuf::from(p));
    }
    let home = std::env::var("HOME").unwrap_or_else(|_| "/".to_string());
    PathBuf::from(home).join(".quantamind/stt")
}

/// The default/env-resolved STT folder (no user-setting override).
pub fn stt_dir() -> PathBuf {
    stt_dir_resolved(None)
}

/// Canonical path for a whisper ggml model identified by `name` (a catalog id
/// like `tiny.en`), sanitizing `:`/`/` and prefixing `ggml-` so the on-disk
/// file matches the repo's `ggml-tiny.en.bin` naming.
pub fn whisper_dest(dir: &Path, name: &str) -> PathBuf {
    let safe = name.replace([':', '/'], "_");
    dir.join(format!("ggml-{safe}.bin"))
}

/// Canonical path for the silero VAD file `name` (already a repo filename such
/// as `ggml-silero-v5.1.2.bin`), sanitizing `:`/`/` for safety.
pub fn vad_dest(dir: &Path, name: &str) -> PathBuf {
    let safe = name.replace([':', '/'], "_");
    dir.join(safe)
}

#[cfg(test)]
#[path = "stt_disk_tests.rs"]
mod tests;
