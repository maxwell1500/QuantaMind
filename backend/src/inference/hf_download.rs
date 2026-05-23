use crate::errors::{AppError, AppResult};
use crate::inference::hf_request::{build_client, build_url, map_status, validate_repo};
use crate::inference::hf_resume::{decide, local_size, partial_path, ResumeStrategy};
use crate::inference::pull_speed::SpeedTracker;
use futures_util::StreamExt;
use serde::Serialize;
use std::fs::{self, OpenOptions};
use std::io::Write;
use std::path::{Path, PathBuf};
use std::time::{Duration, Instant};
use tokio_util::sync::CancellationToken;

#[derive(Serialize, Clone, Debug, PartialEq)]
pub struct DownloadProgress {
    pub bytes_completed: u64,
    pub bytes_total: u64,
    pub speed_bps: u64,
}

#[derive(Debug, Clone)]
pub struct DownloadResult {
    pub final_path: PathBuf,
    pub sha256: Option<String>,
}

fn parse_content_length(h: Option<&reqwest::header::HeaderValue>, repo: &str) -> AppResult<u64> {
    let v = h.ok_or_else(|| AppError::Inference(format!("{repo}: missing Content-Length")))?;
    let s = v.to_str().map_err(|e| AppError::Inference(format!("{repo}: non-ASCII Content-Length: {e}")))?;
    s.parse().map_err(|e| AppError::Inference(format!("{repo}: unparseable Content-Length '{s}': {e}")))
}

pub async fn download_gguf(
    endpoint: &str,
    repo: &str,
    filename: &str,
    dest_path: &Path,
    on_progress: impl Fn(DownloadProgress),
    cancel: CancellationToken,
) -> AppResult<DownloadResult> {
    validate_repo(repo)?;
    if !filename.to_lowercase().ends_with(".gguf") {
        return Err(AppError::Validation(format!("not a .gguf filename: {filename}")));
    }
    if dest_path.exists() {
        return Ok(DownloadResult { final_path: dest_path.to_path_buf(), sha256: None });
    }
    let url = build_url(endpoint, repo, filename);
    let client = build_client()?;

    let head = client.head(&url).send().await.map_err(|e| AppError::Inference(e.to_string()))?;
    if let Some(err) = map_status(head.status(), repo) { return Err(err); }
    let total = parse_content_length(head.headers().get("content-length"), repo)?;

    let partial = partial_path(dest_path);
    if matches!(decide(local_size(&partial), total), ResumeStrategy::RedownloadAfterDelete) {
        fs::remove_file(&partial).map_err(|e| AppError::Io(e.to_string()))?;
    }

    let strategy = decide(local_size(&partial), total);
    if strategy == ResumeStrategy::Skip {
        fs::rename(&partial, dest_path).map_err(|e| AppError::Io(e.to_string()))?;
        return Ok(DownloadResult { final_path: dest_path.to_path_buf(), sha256: None });
    }
    let start = if let ResumeStrategy::Resume(n) = strategy { n } else { 0 };

    let mut req = client.get(&url);
    if start > 0 { req = req.header("Range", format!("bytes={start}-")); }
    let resp = req.send().await.map_err(|e| AppError::Inference(e.to_string()))?;
    if let Some(err) = map_status(resp.status(), repo) { return Err(err); }

    let mut file = OpenOptions::new().create(true).append(true).open(&partial).map_err(|e| AppError::Io(e.to_string()))?;
    let mut speed = SpeedTracker::new(Duration::from_secs(5));
    let mut completed = start;
    speed.add(Instant::now(), completed);
    let mut bytes = resp.bytes_stream();

    loop {
        tokio::select! {
            biased;
            _ = cancel.cancelled() => return Ok(DownloadResult { final_path: partial.clone(), sha256: None }),
            chunk = bytes.next() => {
                let Some(chunk) = chunk else { break };
                let chunk = chunk.map_err(|e| AppError::Inference(e.to_string()))?;
                if completed + chunk.len() as u64 > total {
                    return Err(AppError::Inference(format!("{repo}: server sent more bytes than Content-Length ({} > {total})", completed + chunk.len() as u64)));
                }
                file.write_all(&chunk).map_err(|e| AppError::Io(e.to_string()))?;
                completed += chunk.len() as u64;
                speed.add(Instant::now(), completed);
                on_progress(DownloadProgress { bytes_completed: completed, bytes_total: total, speed_bps: speed.bps(Instant::now()) });
            }
        }
    }

    drop(file);
    fs::rename(&partial, dest_path).map_err(|e| AppError::Io(e.to_string()))?;
    Ok(DownloadResult { final_path: dest_path.to_path_buf(), sha256: None })
}
