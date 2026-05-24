use crate::errors::{AppError, AppResult};
use crate::inference::pull_progress::{classify, PullChunk, PullProgress, PullRequest};
use crate::inference::pull_speed::SpeedTracker;
use futures_util::StreamExt;
use reqwest::Client;
use std::time::{Duration, Instant};
use tokio_util::sync::CancellationToken;

pub fn validate_name(name: &str) -> AppResult<()> {
    if name.trim().is_empty() {
        return Err(AppError::Validation("name is empty".into()));
    }
    let bad = ['/', '\\', '\0', '"', '\'', ' ', '\t', '\n'];
    if name.chars().any(|c| bad.contains(&c)) {
        return Err(AppError::Validation(format!("name has illegal char: {name}")));
    }
    Ok(())
}

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
                while let Some(nl) = buf.iter().position(|&b| b == b'\n') {
                    let line: Vec<u8> = buf.drain(..=nl).collect();
                    let trimmed = &line[..line.len() - 1];
                    if trimmed.is_empty() { continue; }
                    let chunk: PullChunk = serde_json::from_slice(trimmed)
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
                    if cancel.is_cancelled() { return Ok(()); }
                    if chunk.status.as_deref() == Some("success") { return Ok(()); }
                }
            }
        }
    }
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn empty_name_rejected() {
        assert!(matches!(validate_name(""), Err(AppError::Validation(_))));
        assert!(matches!(validate_name("   "), Err(AppError::Validation(_))));
    }

    #[test]
    fn path_separators_and_quotes_rejected() {
        for bad in ["foo/bar", "x\\y", "foo bar", "say \"hi\"", "it's"] {
            assert!(matches!(validate_name(bad), Err(AppError::Validation(_))), "should reject {bad}");
        }
    }

    #[test]
    fn valid_names_accepted() {
        for ok in ["llama3.2:1b", "phi3.5:latest", "qwen2.5-coder:7b-instruct-q4_K_M"] {
            validate_name(ok).expect("should accept");
        }
    }
}
