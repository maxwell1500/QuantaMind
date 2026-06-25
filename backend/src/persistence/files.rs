//! Size-capped binary/text file I/O for user-selected files (the OCR tool). File I/O stays in Rust
//! (the frontend passes only a path); the cap prevents a mis-picked huge file from OOMing the process.

use crate::errors::{AppError, AppResult};
use std::path::Path;

/// Per-file cap for OCR inputs (images/PDFs) and text exports.
pub const MAX_FILE_BYTES: u64 = 25 * 1024 * 1024;

/// Read a file's raw bytes with the size cap enforced first.
pub fn read_bytes_capped(path: &Path, cap: u64) -> AppResult<Vec<u8>> {
    let len = std::fs::metadata(path)?.len();
    if len > cap {
        return Err(AppError::Validation(format!("file is too large ({len} bytes > {cap} cap)")));
    }
    Ok(std::fs::read(path)?)
}

/// Write text to a file with the size cap enforced (the OCR Export path).
pub fn write_text_capped(path: &Path, content: &str) -> AppResult<()> {
    let len = content.len() as u64;
    if len > MAX_FILE_BYTES {
        return Err(AppError::Validation(format!("content is too large ({len} bytes > {MAX_FILE_BYTES} cap)")));
    }
    std::fs::write(path, content)?;
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;
    use tempfile::tempdir;

    #[test]
    fn read_bytes_round_trips_and_caps_oversize() {
        let dir = tempdir().unwrap();
        let p = dir.path().join("img.bin");
        std::fs::write(&p, [1u8, 2, 3, 4]).unwrap();
        assert_eq!(read_bytes_capped(&p, MAX_FILE_BYTES).unwrap(), vec![1, 2, 3, 4]);
        // cap=2 < 4 bytes → rejected.
        assert!(read_bytes_capped(&p, 2).is_err());
    }

    #[test]
    fn write_text_writes_and_reads_back() {
        let dir = tempdir().unwrap();
        let p = dir.path().join("out.txt");
        write_text_capped(&p, "hello\n--- Page 2 ---\nworld").unwrap();
        assert_eq!(std::fs::read_to_string(&p).unwrap(), "hello\n--- Page 2 ---\nworld");
    }
}
