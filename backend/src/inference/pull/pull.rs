use crate::errors::{AppError, AppResult};
use crate::inference::http::ndjson::{next_line, tail};
use crate::inference::pull::pull_name::validate_name;
use crate::inference::pull::pull_progress::{classify, PullChunk, PullProgress, PullRequest};
use crate::inference::pull::pull_speed::SpeedTracker;
use futures_util::StreamExt;
use reqwest::Client;
use std::time::{Duration, Instant};
use tokio_util::sync::CancellationToken;

pub async fn pull_model(
    endpoint: &str,
    name: &str,
    mut on_progress: impl FnMut(PullProgress),
    cancel: CancellationToken,
) -> AppResult<()> {
    validate_name(name)?;
    let client = Client::builder()
        .connect_timeout(Duration::from_secs(60))
        .build()
        .map_err(|e| AppError::Internal(e.to_string()))?;
    let resp = client
        .post(format!("{endpoint}/api/pull"))
        .json(&PullRequest { name, stream: true })
        .send()
        .await
        .map_err(|e| AppError::Inference(e.to_string()))?;
    if !resp.status().is_success() {
        return Err(AppError::Inference(format!("HTTP {}", resp.status())));
    }

    let mut speed = SpeedTracker::new(Duration::from_secs(5));
    let mut bytes = resp.bytes_stream();
    let mut buf: Vec<u8> = Vec::new();
    loop {
        tokio::select! {
            _ = cancel.cancelled() => return Ok(()),
            piece = bytes.next() => {
                let Some(piece) = piece else { break };
                let piece = piece.map_err(|e| AppError::Inference(e.to_string()))?;
                buf.extend_from_slice(&piece);
                while let Some(line) = next_line(&mut buf) {
                    if handle_line(&line, &mut speed, &mut on_progress)? { return Ok(()); }
                    if cancel.is_cancelled() { return Ok(()); }
                }
            }
        }
    }
    // Ollama 0.24+ has been observed to close `/api/pull` without
    // terminating the final `{"status":"success"}` line. Parse the
    // un-flushed remainder so we don't silently lose the success frame.
    if let Some(rest) = tail(&buf) {
        if handle_line(rest, &mut speed, &mut on_progress)? { return Ok(()); }
    }
    Ok(())
}

/// Parse one NDJSON line, emit a progress event, and return `true` if it
/// is the terminal `"success"` status.
fn handle_line(
    line: &[u8],
    speed: &mut SpeedTracker,
    on_progress: &mut impl FnMut(PullProgress),
) -> AppResult<bool> {
    if line.is_empty() { return Ok(false); }
    let chunk: PullChunk = serde_json::from_slice(line)
        .map_err(|e| AppError::Inference(format!("bad chunk: {e}")))?;
    if let Some(err_msg) = &chunk.error {
        return Err(AppError::Inference(format!("ollama pull: {err_msg}")));
    }
    let bps = if let Some(c) = chunk.completed {
        speed.add(Instant::now(), c);
        speed.bps(Instant::now())
    } else { 0 };
    match classify(&chunk, bps) {
        Some(p) => on_progress(p),
        None => eprintln!("pull: unrecognised status {:?}, dropping", chunk.status),
    }
    Ok(chunk.status.as_deref() == Some("success"))
}
