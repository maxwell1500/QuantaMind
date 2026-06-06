#![deny(clippy::unwrap_used)]
use crate::errors::{AppError, AppResult};
use std::fs;
use std::path::Path;

/// Write the readiness card PNG to disk. The frontend snapshots the report card to
/// raw bytes and picks the path via the OS save dialog, so this command stays a
/// thin sink: validate the path, write the bytes. Offline, no auth — ships in
/// every build (unlike the auth/send commands gated behind `enterprise`).
#[tauri::command]
pub fn save_readiness_image(path: String, bytes: Vec<u8>) -> Result<(), AppError> {
    save_inner(&path, &bytes)
}

pub fn save_inner(path: &str, bytes: &[u8]) -> AppResult<()> {
    if path.trim().is_empty() {
        return Err(AppError::Validation("path is empty".into()));
    }
    if bytes.is_empty() {
        return Err(AppError::Validation("image is empty".into()));
    }
    fs::write(Path::new(path), bytes).map_err(|e| AppError::Io(format!("write {path}: {e}")))?;
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn rejects_empty_path_and_empty_bytes() {
        assert!(save_inner("", &[1, 2, 3]).is_err());
        assert!(save_inner("/tmp/qm_x.png", &[]).is_err());
    }

    #[test]
    fn writes_bytes_round_trip() {
        // PNG magic header — proves the exact bytes land on disk unchanged.
        let png = [0x89u8, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A, 0xDE, 0xAD];
        let path = std::env::temp_dir().join("qm_readiness_export_test.png");
        let p = path.to_string_lossy();
        save_inner(&p, &png).expect("write image");
        let back = std::fs::read(&*p).expect("read back image");
        assert_eq!(back, png);
        let _ = std::fs::remove_file(&*p);
    }
}
