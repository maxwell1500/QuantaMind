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
mod tests {
    use super::*;

    #[test]
    fn whisper_dest_prefixes_ggml_and_sanitizes_the_model_id() {
        let p = whisper_dest(Path::new("/s"), "tiny.en");
        assert_eq!(p, PathBuf::from("/s/ggml-tiny.en.bin"));
        let p = whisper_dest(Path::new("/s"), "large-v3");
        assert_eq!(p, PathBuf::from("/s/ggml-large-v3.bin"));
    }

    #[test]
    fn whisper_dest_replaces_path_separators_from_exotic_ids() {
        let p = whisper_dest(Path::new("/s"), "vendor/tiny:q5");
        assert_eq!(p, PathBuf::from("/s/ggml-vendor_tiny_q5.bin"));
    }

    #[test]
    fn vad_dest_keeps_the_repo_filename_sanitized() {
        let p = vad_dest(Path::new("/s"), "ggml-silero-v5.1.2.bin");
        assert_eq!(p, PathBuf::from("/s/ggml-silero-v5.1.2.bin"));
    }

    // One test owns QUANTAMIND_STT_DIR — cargo runs tests in parallel, so a
    // second env-mutating test would race this one.
    #[test]
    fn stt_dir_precedence_setting_then_env_then_default() {
        std::env::set_var("QUANTAMIND_STT_DIR", "/tmp/qm-stt-test");
        assert_eq!(stt_dir(), PathBuf::from("/tmp/qm-stt-test"), "env beats default");
        assert_eq!(
            stt_dir_resolved(Some("/models/stt")),
            PathBuf::from("/models/stt"),
            "setting beats env"
        );
        assert_eq!(
            stt_dir_resolved(Some("  ")),
            PathBuf::from("/tmp/qm-stt-test"),
            "blank setting falls through to env"
        );
        std::env::remove_var("QUANTAMIND_STT_DIR");
        assert!(
            stt_dir_resolved(None).ends_with(".quantamind/stt"),
            "default (no env) falls through to ~/.quantamind/stt"
        );
    }

    #[test]
    fn relative_setting_resolves_to_an_absolute_path() {
        let resolved = stt_dir_resolved(Some("./stt"));
        assert!(resolved.is_absolute(), "expected absolute, got {resolved:?}");
        assert!(resolved.ends_with("stt"));
    }
}
