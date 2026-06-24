use crate::errors::AppResult;
use crate::inference::hf::hf_browse::HfRepoFile;
use crate::inference::hf::hf_download::{download_file, DownloadProgress};
use serde::Serialize;
use std::fs;
use std::path::Path;
use tokio_util::sync::CancellationToken;

/// Aggregate progress across all files of a repo snapshot. `bytes_*` sum every
/// file so the UI shows one bar; `files_done`/`files_total` give a coarse count.
#[derive(Serialize, Clone, Debug, PartialEq)]
pub struct SnapshotProgress {
    pub bytes_completed: u64,
    pub bytes_total: u64,
    pub speed_bps: u64,
    pub files_done: usize,
    pub files_total: usize,
}

/// Download every file of a repo into `dest_dir`, preserving nested paths.
/// Sequential (one file at a time) with per-file `.partial` resume — a finished
/// file short-circuits, a cancel leaves partials for a later retry. `on_progress`
/// reports the running total across files.
pub async fn download_snapshot(
    endpoint: &str,
    repo: &str,
    files: &[HfRepoFile],
    dest_dir: &Path,
    on_progress: impl Fn(SnapshotProgress),
    cancel: CancellationToken,
) -> AppResult<()> {
    let bytes_total: u64 = files.iter().map(|f| f.size_bytes).sum();
    let files_total = files.len();
    let mut done_bytes: u64 = 0;

    for (i, file) in files.iter().enumerate() {
        let dest = dest_dir.join(&file.path);
        if let Some(parent) = dest.parent() {
            fs::create_dir_all(parent).map_err(|e| crate::errors::AppError::Io(e.to_string()))?;
        }
        let base = done_bytes;
        download_file(
            endpoint,
            repo,
            &file.path,
            &dest,
            |p: DownloadProgress| {
                on_progress(SnapshotProgress {
                    bytes_completed: base + p.bytes_completed,
                    bytes_total,
                    speed_bps: p.speed_bps,
                    files_done: i,
                    files_total,
                });
            },
            cancel.clone(),
        )
        .await?;

        if cancel.is_cancelled() {
            return Ok(()); // partials left in place; a retry resumes them
        }
        done_bytes += file.size_bytes;
        on_progress(SnapshotProgress {
            bytes_completed: done_bytes,
            bytes_total,
            speed_bps: 0,
            files_done: i + 1,
            files_total,
        });
    }
    Ok(())
}
