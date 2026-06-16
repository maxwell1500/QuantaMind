use crate::errors::{AppError, AppResult};
use crate::inference::stt::eval::readiness::{builtin_profiles, SttReadinessProfile};
use crate::persistence::readiness::safe_filename::safe_filename;
use std::path::{Path, PathBuf};

/// Cap a profile read so a corrupt/huge file can't OOM the process.
pub const MAX_BYTES: u64 = 1024 * 1024;

fn profile_path(dir: &Path, id: &str) -> PathBuf {
    dir.join(format!("{}.json", safe_filename(id)))
}

fn read_profile(path: &Path) -> AppResult<SttReadinessProfile> {
    let len = std::fs::metadata(path)?.len();
    if len > MAX_BYTES {
        return Err(AppError::Validation(format!("STT profile too large ({len} bytes > {MAX_BYTES})")));
    }
    Ok(serde_json::from_str(&std::fs::read_to_string(path)?)?)
}

/// Seed any built-in STT readiness profile not yet on disk (first run). A user's
/// edit to a built-in id overwrites the seed and is preserved across runs.
pub fn ensure_builtins(dir: &Path) -> AppResult<()> {
    std::fs::create_dir_all(dir)?;
    for p in builtin_profiles() {
        let path = profile_path(dir, &p.id);
        if !path.exists() {
            std::fs::write(path, serde_json::to_string_pretty(&p)?)?;
        }
    }
    Ok(())
}

/// Every profile (built-ins seeded first), sorted by name for a stable picker.
pub fn list(dir: &Path) -> AppResult<Vec<SttReadinessProfile>> {
    ensure_builtins(dir)?;
    let mut out = Vec::new();
    for entry in std::fs::read_dir(dir)? {
        let path = entry?.path();
        if path.extension().is_some_and(|e| e == "json") {
            out.push(read_profile(&path)?);
        }
    }
    out.sort_by(|a, b| a.name.cmp(&b.name));
    Ok(out)
}

pub fn load(dir: &Path, id: &str) -> AppResult<SttReadinessProfile> {
    let path = profile_path(dir, id);
    if !path.exists() {
        return Err(AppError::NotFound(format!("STT readiness profile '{id}'")));
    }
    read_profile(&path)
}

pub fn save(dir: &Path, profile: &SttReadinessProfile) -> AppResult<()> {
    if profile.id.trim().is_empty() {
        return Err(AppError::Validation("profile id must not be empty".into()));
    }
    std::fs::create_dir_all(dir)?;
    std::fs::write(profile_path(dir, &profile.id), serde_json::to_string_pretty(profile)?)?;
    Ok(())
}

pub fn delete(dir: &Path, id: &str) -> AppResult<()> {
    let path = profile_path(dir, id);
    if !path.exists() {
        return Err(AppError::NotFound(format!("STT readiness profile '{id}'")));
    }
    std::fs::remove_file(path)?;
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn builtins_seed_then_list_load_save_delete() {
        let dir = tempfile::tempdir().unwrap();
        let all = list(dir.path()).unwrap();
        assert!(all.iter().any(|p| p.id == "high-accuracy-legal"), "presets seeded");
        let one = load(dir.path(), "fast-draft").unwrap();
        assert_eq!(one.min_rtf, Some(3.0));

        let mut edited = one.clone();
        edited.max_wer = Some(0.33);
        save(dir.path(), &edited).unwrap();
        assert_eq!(load(dir.path(), "fast-draft").unwrap().max_wer, Some(0.33), "edit persists");

        assert!(delete(dir.path(), "fast-draft").is_ok());
        assert!(load(dir.path(), "fast-draft").is_err());
    }
}
