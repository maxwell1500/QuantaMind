use crate::errors::{AppError, AppResult};
use crate::inference::ndjson::{next_line, tail};
use bytes::Bytes;
use futures_util::Stream;
use futures_util::StreamExt;
use serde::Deserialize;

#[derive(Deserialize)]
struct CreateChunk {
    #[serde(default)]
    status: String,
    #[serde(default)]
    error: Option<String>,
}

pub async fn consume_ndjson(resp: reqwest::Response) -> AppResult<()> {
    let stream = resp.bytes_stream().map(|r| r.map_err(|e| e.to_string()));
    consume_stream(stream).await
}

pub(crate) async fn consume_stream<S>(stream: S) -> AppResult<()>
where
    S: Stream<Item = Result<Bytes, String>>,
{
    futures_util::pin_mut!(stream);
    let mut buf: Vec<u8> = Vec::new();
    let mut last_status = String::new();
    while let Some(piece) = stream.next().await {
        let piece = piece.map_err(AppError::Inference)?;
        buf.extend_from_slice(&piece);
        while let Some(line) = next_line(&mut buf) {
            if let Some(true) = handle_chunk(&line, &mut last_status)? {
                return Ok(());
            }
        }
    }
    // Ollama 0.24+ has been observed to emit the final `success` line
    // without a trailing newline. Parse the un-terminated remainder
    // before declaring failure.
    if let Some(rest) = tail(&buf) {
        if let Some(true) = handle_chunk(rest, &mut last_status)? {
            return Ok(());
        }
    }
    Err(AppError::Inference(format!(
        "ollama create: stream ended without success (last status: {})",
        if last_status.is_empty() { "<none>" } else { &last_status },
    )))
}

/// Parse one NDJSON chunk. Returns `Some(true)` for a "success" status,
/// `Some(false)` for non-terminal status, `None` for an empty line.
fn handle_chunk(line: &[u8], last_status: &mut String) -> AppResult<Option<bool>> {
    if line.is_empty() {
        return Ok(None);
    }
    let chunk: CreateChunk = serde_json::from_slice(line)
        .map_err(|e| AppError::Inference(format!("bad create chunk: {e}")))?;
    if let Some(err) = chunk.error {
        return Err(AppError::Inference(format!("ollama create: {err}")));
    }
    if chunk.status == "success" {
        return Ok(Some(true));
    }
    if !chunk.status.is_empty() {
        *last_status = chunk.status;
    }
    Ok(Some(false))
}

#[cfg(test)]
#[path = "consume_create_tests.rs"]
mod tests;
