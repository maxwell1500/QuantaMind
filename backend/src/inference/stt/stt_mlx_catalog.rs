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

/// Curated `mlx-community/whisper-*` models. Sizes verified against the HF repo
/// trees. `.en` repos are English-only; the rest are multilingual.
static CATALOG: &[MlxSttCatalogEntry] = &[
    e("mlx-community/whisper-tiny", "Tiny (multilingual)", 74_418_444, true),
    e("mlx-community/whisper-base-mlx", "Base (multilingual)", 143_724_466, true),
    e("mlx-community/whisper-base.en-mlx", "Base (English)", 143_723_394, false),
    e("mlx-community/whisper-small-mlx", "Small (multilingual)", 481_307_858, true),
    e("mlx-community/whisper-small.en-mlx", "Small (English)", 481_306_466, false),
    e("mlx-community/whisper-medium-mlx", "Medium (multilingual)", 1_524_925_180, true),
    e("mlx-community/whisper-large-v3-turbo-q4", "Large v3 Turbo (4-bit)", 463_665_005, true),
    e("mlx-community/whisper-large-v3-turbo", "Large v3 Turbo (multilingual)", 1_613_977_880, true),
    e("mlx-community/distil-whisper-large-v3", "Distil Large v3 (multilingual)", 1_509_130_380, true),
    e("mlx-community/whisper-large-v3-mlx", "Large v3 (multilingual)", 3_083_520_685, true),
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
        assert_eq!(find("mlx-community/whisper-large-v3-mlx").map(|m| m.disk_bytes), Some(3_083_520_685));
        assert!(find("mlx-community/nope").is_none());
    }
}
