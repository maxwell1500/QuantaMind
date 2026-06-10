use serde::Serialize;

/// One downloadable MLX whisper model, identified by its `mlx-community/whisper-*`
/// repo. `disk_bytes` is the real HF snapshot size (sum of model files), shown
/// before download. `est_vram_bytes` is `None` (unmeasured → "Not available",
/// never fabricated). These run on the mlx-audio engine (Apple Silicon only).
#[derive(Serialize, Clone, Debug, PartialEq)]
pub struct MlxSttCatalogEntry {
    pub repo: &'static str,
    pub display: &'static str,
    pub disk_bytes: u64,
    pub est_vram_bytes: Option<u64>,
    pub multilingual: bool,
}

const fn e(repo: &'static str, display: &'static str, disk_bytes: u64, multilingual: bool) -> MlxSttCatalogEntry {
    MlxSttCatalogEntry { repo, display, disk_bytes, est_vram_bytes: None, multilingual }
}

/// Curated `mlx-community/whisper-*-asr-*` models. **The `-asr-*` family bundles
/// the HF processor (tokenizer + `preprocessor_config.json`) that mlx-audio's
/// whisper requires** — the older `-mlx`/npz repos (just `config.json` +
/// `weights.npz`) crash mlx-audio with "Processor not found", so they're excluded.
/// Sizes verified against the HF repo trees. `.en` repos are English-only.
static CATALOG: &[MlxSttCatalogEntry] = &[
    e("mlx-community/whisper-tiny-asr-fp16", "Tiny (multilingual)", 78_774_283, true),
    e("mlx-community/whisper-tiny.en-asr-fp16", "Tiny (English)", 78_338_567, false),
    e("mlx-community/whisper-base-asr-fp16", "Base (multilingual)", 148_070_180, true),
    e("mlx-community/whisper-base.en-asr-fp16", "Base (English)", 147_633_380, false),
    e("mlx-community/whisper-small-asr-fp16", "Small (multilingual)", 485_624_250, true),
    e("mlx-community/whisper-small.en-asr-fp16", "Small (English)", 485_186_977, false),
    e("mlx-community/whisper-medium-asr-fp16", "Medium (multilingual)", 1_529_183_568, true),
    e("mlx-community/whisper-large-v3-turbo-asr-4bit", "Large v3 Turbo (4-bit)", 468_152_234, true),
    e("mlx-community/whisper-large-v3-turbo-asr-fp16", "Large v3 Turbo (multilingual)", 1_618_636_172, true),
    e("mlx-community/whisper-large-v3-asr-fp16", "Large v3 (multilingual)", 3_087_749_956, true),
];

/// The full curated MLX STT catalog (pre-download disclosure list).
pub fn catalog() -> &'static [MlxSttCatalogEntry] {
    CATALOG
}

/// Look up one entry by its repo id.
pub fn find(repo: &str) -> Option<&'static MlxSttCatalogEntry> {
    CATALOG.iter().find(|e| e.repo == repo)
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::collections::HashSet;

    #[test]
    fn every_entry_is_an_mlx_community_whisper_repo_with_a_real_size() {
        for m in catalog() {
            assert!(m.repo.starts_with("mlx-community/"), "{}", m.repo);
            assert!(m.repo.to_lowercase().contains("whisper"), "{}", m.repo);
            assert!(m.disk_bytes > 1024 * 1024, "{} size", m.repo);
            assert!(m.est_vram_bytes.is_none(), "VRAM must be N/A, never fabricated");
        }
    }

    #[test]
    fn english_only_entries_are_not_multilingual_and_vice_versa() {
        for m in catalog() {
            assert_eq!(m.multilingual, !m.repo.contains(".en"), "{} multilingual flag", m.repo);
        }
    }

    #[test]
    fn repos_are_unique_and_find_works() {
        let ids: HashSet<_> = catalog().iter().map(|m| m.repo).collect();
        assert_eq!(ids.len(), catalog().len());
        assert_eq!(find("mlx-community/whisper-large-v3-asr-fp16").map(|m| m.disk_bytes), Some(3_087_749_956));
        assert!(find("mlx-community/nope").is_none());
    }

    #[test]
    fn every_repo_is_the_mlx_audio_compatible_asr_format() {
        // The old mlx-examples `-mlx` repos (config.json + weights.npz, no HF
        // processor) crash mlx-audio's whisper with "Processor not found"; only
        // the `-asr-*` family bundles the processor. Guard against regressing.
        for m in catalog() {
            assert!(m.repo.contains("-asr-"), "{} must be an mlx-audio asr repo", m.repo);
        }
    }
}
