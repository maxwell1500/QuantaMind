use crate::errors::{AppError, AppResult};
use bytes::Bytes;
use futures_util::TryStreamExt;
use reqwest::Client;
use sha2::{Digest, Sha256};
use std::path::Path;
use std::sync::atomic::{AtomicU64, Ordering};
use std::sync::Arc;
use tokio::fs::File;
use tokio::io::AsyncReadExt;
use tokio_util::io::ReaderStream;

pub async fn sha256_file<F>(path: &Path, on_progress: F) -> AppResult<String>
where F: Fn(u64, u64) + Send,
{
    let total = tokio::fs::metadata(path).await.map_err(|e| AppError::Io(e.to_string()))?.len();
    let mut file = File::open(path).await.map_err(|e| AppError::Io(e.to_string()))?;
    let mut hasher = Sha256::new();
    let mut buf = vec![0u8; 64 * 1024];
    let mut completed = 0u64;
    loop {
        let n = file.read(&mut buf).await.map_err(|e| AppError::Io(e.to_string()))?;
        if n == 0 { break; }
        hasher.update(&buf[..n]);
        completed += n as u64;
        on_progress(completed, total);
    }
    Ok(format!("{:x}", hasher.finalize()))
}

pub async fn blob_exists(endpoint: &str, digest: &str) -> AppResult<bool> {
    let client = Client::new();
    let resp = client.head(format!("{endpoint}/api/blobs/sha256:{digest}"))
        .send().await.map_err(|e| AppError::Inference(e.to_string()))?;
    Ok(resp.status().is_success())
}

pub async fn upload_blob<F>(endpoint: &str, digest: &str, path: &Path, on_progress: F) -> AppResult<()>
where F: Fn(u64, u64) + Send + Sync + 'static,
{
    let total = tokio::fs::metadata(path).await.map_err(|e| AppError::Io(e.to_string()))?.len();
    let file = File::open(path).await.map_err(|e| AppError::Io(e.to_string()))?;
    let completed = Arc::new(AtomicU64::new(0));
    let cb = Arc::new(on_progress);
    let stream = ReaderStream::new(file).map_ok(move |chunk: Bytes| {
        let new = completed.fetch_add(chunk.len() as u64, Ordering::SeqCst) + chunk.len() as u64;
        cb(new, total);
        chunk
    });
    let body = reqwest::Body::wrap_stream(stream);
    let client = Client::new();
    let resp = client.post(format!("{endpoint}/api/blobs/sha256:{digest}"))
        .body(body)
        .send().await.map_err(|e| AppError::Inference(e.to_string()))?;
    if !resp.status().is_success() {
        return Err(AppError::Inference(format!("blob upload: HTTP {}", resp.status())));
    }
    Ok(())
}
