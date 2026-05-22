use std::fs;
use std::path::{Path, PathBuf};

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum ResumeStrategy {
    /// No local `.partial` exists; start from byte 0.
    Fresh,
    /// Local `.partial` is N bytes; send `Range: bytes=N-`.
    Resume(u64),
    /// Local `.partial` already equals the total size; just rename.
    Skip,
    /// Local `.partial` is larger than the server's total — corrupted
    /// (truncated server file? wrong file at this path?). Delete and
    /// re-download from byte 0.
    RedownloadAfterDelete,
}

pub fn decide(local: Option<u64>, total: u64) -> ResumeStrategy {
    match local {
        None => ResumeStrategy::Fresh,
        Some(n) if n == total => ResumeStrategy::Skip,
        Some(n) if n < total => ResumeStrategy::Resume(n),
        Some(_) => ResumeStrategy::RedownloadAfterDelete,
    }
}

pub fn partial_path(dest: &Path) -> PathBuf {
    let mut p = dest.as_os_str().to_os_string();
    p.push(".partial");
    PathBuf::from(p)
}

pub fn local_size(path: &Path) -> Option<u64> {
    fs::metadata(path).ok().map(|m| m.len())
}
