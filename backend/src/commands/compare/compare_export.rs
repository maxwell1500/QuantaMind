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
    if format != "md" && format != "json" {
        return Err(AppError::Validation(format!("unknown format: {format}")));
    }
    fs::write(Path::new(path), contents)
        .map_err(|e| AppError::Io(format!("write {path}: {e}")))?;
    Ok(())
}
