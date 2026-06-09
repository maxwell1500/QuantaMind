use serde::Serialize;

/// All whisper.cpp ggml models are hosted in one repo.
pub const WHISPER_REPO: &str = "ggerganov/whisper.cpp";
/// The silero VAD is a single shared file, pinned once and paired with every
/// whisper model (P3's silence-hallucination metric needs it).
pub const VAD_REPO: &str = "ggml-org/whisper-vad";
pub const VAD_FILE: &str = "ggml-silero-v6.2.0.bin";
pub const VAD_DISK_BYTES: u64 = 885_098;

/// One downloadable whisper model. Disk sizes are the real HF file sizes (shown
/// before download, like the text-model catalog). `est_vram_bytes` is `None` —
/// runtime VRAM isn't measured yet, so the UI shows "Not available" rather than
/// a fabricated figure (no fake metrics).
#[derive(Serialize, Clone, Debug, PartialEq)]
pub struct SttCatalogEntry {
    pub id: &'static str,
    pub display: &'static str,
    pub whisper_repo: &'static str,
    pub whisper_file: &'static str,
    pub disk_bytes: u64,
    pub est_vram_bytes: Option<u64>,
    pub multilingual: bool,
}

const fn e(
    id: &'static str,
    display: &'static str,
    whisper_file: &'static str,
    disk_bytes: u64,
    multilingual: bool,
) -> SttCatalogEntry {
    SttCatalogEntry {
        id,
        display,
        whisper_repo: WHISPER_REPO,
        whisper_file,
        disk_bytes,
        est_vram_bytes: None,
        multilingual,
    }
}

/// The curated list: tiny/base/small/medium in `.en` + multilingual, plus the
/// large-v3 pair (multilingual only). Sizes verified against the HF repo tree.
static CATALOG: &[SttCatalogEntry] = &[
    e("tiny.en", "Tiny (English)", "ggml-tiny.en.bin", 77_704_715, false),
    e("tiny", "Tiny (multilingual)", "ggml-tiny.bin", 77_691_713, true),
    e("base.en", "Base (English)", "ggml-base.en.bin", 147_964_211, false),
    e("base", "Base (multilingual)", "ggml-base.bin", 147_951_465, true),
    e("small.en", "Small (English)", "ggml-small.en.bin", 487_614_201, false),
    e("small", "Small (multilingual)", "ggml-small.bin", 487_601_967, true),
    e("medium.en", "Medium (English)", "ggml-medium.en.bin", 1_533_774_781, false),
    e("medium", "Medium (multilingual)", "ggml-medium.bin", 1_533_763_059, true),
    e("large-v3", "Large v3 (multilingual)", "ggml-large-v3.bin", 3_095_033_483, true),
    e("large-v3-turbo", "Large v3 Turbo (multilingual)", "ggml-large-v3-turbo.bin", 1_624_555_275, true),
];

/// The full curated catalog (for the pre-download disclosure list).
pub fn catalog() -> &'static [SttCatalogEntry] {
    CATALOG
}

/// Look up one entry by its catalog id (e.g. `tiny.en`).
pub fn find(id: &str) -> Option<&'static SttCatalogEntry> {
    CATALOG.iter().find(|e| e.id == id)
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::collections::HashSet;

    #[test]
    fn every_entry_names_a_ggml_bin_above_the_validator_floor() {
        for m in catalog() {
            assert!(m.whisper_file.starts_with("ggml-"), "{}", m.whisper_file);
            assert!(m.whisper_file.ends_with(".bin"), "{}", m.whisper_file);
            assert!(m.disk_bytes > 1024 * 1024, "{} is below the whisper validator floor", m.id);
            assert_eq!(m.whisper_repo, WHISPER_REPO);
            assert!(m.est_vram_bytes.is_none(), "VRAM must be unmeasured (N/A), never fabricated");
        }
    }

    #[test]
    fn english_only_entries_are_not_multilingual_and_vice_versa() {
        for m in catalog() {
            assert_eq!(m.multilingual, !m.id.ends_with(".en"), "{} multilingual flag", m.id);
        }
    }

    #[test]
    fn ids_are_unique() {
        let ids: HashSet<_> = catalog().iter().map(|m| m.id).collect();
        assert_eq!(ids.len(), catalog().len(), "duplicate catalog ids");
    }

    #[test]
    fn find_resolves_a_known_id_and_rejects_an_unknown_one() {
        assert_eq!(find("large-v3").map(|m| m.disk_bytes), Some(3_095_033_483));
        assert!(find("nonexistent").is_none());
    }

    #[test]
    fn the_vad_pairing_is_pinned_and_nonempty() {
        assert!(!VAD_REPO.is_empty() && !VAD_FILE.is_empty());
        assert!(VAD_FILE.ends_with(".bin"));
        assert!(VAD_DISK_BYTES > 256 * 1024, "VAD must clear its validator floor");
    }
}
