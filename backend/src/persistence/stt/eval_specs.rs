use crate::errors::{AppError, AppResult};
use crate::inference::stt::eval::spec::SttEvalSpec;
use crate::persistence::evals::sanitize_name;
use std::path::{Path, PathBuf};

/// Cap a spec read so a mis-picked giant file can't OOM the process.
pub const MAX_BYTES: u64 = 1024 * 1024;

fn spec_path(dir: &Path, name: &str) -> AppResult<PathBuf> {
    Ok(dir.join(format!("{}.json", sanitize_name(name)?)))
}

/// Names (file stems) of stored eval specs, sorted. A missing dir is an empty
/// registry, not an error.
pub fn list(dir: &Path) -> AppResult<Vec<String>> {
    if !dir.exists() {
        return Ok(Vec::new());
    }
    let mut names = Vec::new();
    for entry in std::fs::read_dir(dir)? {
        let path = entry?.path();
        if path.extension().is_some_and(|e| e == "json") {
            if let Some(stem) = path.file_stem().and_then(|s| s.to_str()) {
                names.push(stem.to_string());
            }
        }
    }
    names.sort();
    Ok(names)
}

/// Load + validate a spec (size-capped, then ids checked unique/non-empty).
pub fn load(dir: &Path, name: &str) -> AppResult<SttEvalSpec> {
    let path = spec_path(dir, name)?;
    let len = std::fs::metadata(&path)?.len();
    if len > MAX_BYTES {
        return Err(AppError::Validation(format!("eval spec too large ({len} bytes > {MAX_BYTES})")));
    }
    let spec: SttEvalSpec = serde_json::from_str(&std::fs::read_to_string(&path)?)?;
    spec.validate()?;
    Ok(spec)
}

pub fn save(dir: &Path, name: &str, spec: &SttEvalSpec) -> AppResult<()> {
    spec.validate()?;
    std::fs::create_dir_all(dir)?;
    std::fs::write(spec_path(dir, name)?, serde_json::to_string_pretty(spec)?)?;
    Ok(())
}

pub fn delete(dir: &Path, name: &str) -> AppResult<()> {
    let path = spec_path(dir, name)?;
    if !path.exists() {
        return Err(AppError::NotFound(format!("eval spec '{name}'")));
    }
    std::fs::remove_file(path)?;
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::inference::stt::eval::spec::SttEvalTask;

    fn spec() -> SttEvalSpec {
        SttEvalSpec {
            tasks: vec![SttEvalTask { id: "t1".into(), reference: Some("hello".into()), critical_tokens: vec!["hello".into()] }],
        }
    }

    #[test]
    fn save_then_load_round_trips_and_validates() {
        let dir = tempfile::tempdir().unwrap();
        save(dir.path(), "my-eval", &spec()).unwrap();
        assert_eq!(list(dir.path()).unwrap(), vec!["my-eval"]);
        assert_eq!(load(dir.path(), "my-eval").unwrap(), spec());
        assert!(delete(dir.path(), "my-eval").is_ok());
        assert!(load(dir.path(), "my-eval").is_err());
    }

    #[test]
    fn an_invalid_spec_is_refused_on_save() {
        let dir = tempfile::tempdir().unwrap();
        let bad = SttEvalSpec { tasks: vec![] };
        assert!(save(dir.path(), "x", &bad).is_err());
    }
}
