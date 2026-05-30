#![deny(clippy::unwrap_used)]
use crate::errors::{AppError, AppResult};
use std::fs;
use std::path::Path;

#[tauri::command]
pub fn save_compare_report(
    path: String,
    format: String,
    contents: String,
) -> Result<(), AppError> {
    save_inner(&path, &format, &contents)
}

pub fn save_inner(path: &str, format: &str, contents: &str) -> AppResult<()> {
    if path.trim().is_empty() {
        return Err(AppError::Validation("path is empty".into()));
    }
    if !matches!(format, "md" | "json" | "html") {
        return Err(AppError::Validation(format!("unknown format: {format}")));
    }
    fs::write(Path::new(path), contents)
        .map_err(|e| AppError::Io(format!("write {path}: {e}")))?;
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn rejects_unknown_format_accepts_html() {
        assert!(save_inner("/tmp/x.bin", "bin", "x").is_err());
        let dir = std::env::temp_dir().join("qm_export_test.html");
        let p = dir.to_string_lossy();
        assert!(save_inner(&p, "html", "<!doctype html>").is_ok());
        assert_eq!(std::fs::read_to_string(&*p).unwrap(), "<!doctype html>");
        let _ = std::fs::remove_file(&*p);
    }
}
