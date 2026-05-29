use crate::errors::{AppError, AppResult};
use crate::inference::generate::generate_options::GenerateOptions;
use crate::inference::http::http::{body_or_note, streaming_client};
use crate::inference::http::ndjson::next_line;
use crate::inference::llama::llama_wire::{strip_sse, CompletionChunk, CompletionRequest};
use futures_util::StreamExt;
use tokio_util::sync::CancellationToken;

/// Stream a generation from a `llama-server` `/completion` endpoint. The server
/// is single-model (fixed at spawn), so `spec.model` is not sent. Mirrors
/// `ollama::stream_generate`: token text flows through `on_token`, and the call
/// returns when the model stops or `cancel` fires.
pub async fn stream_generate(
    endpoint: &str,
    prompt: &str,
    system: Option<&str>,
    options: Option<GenerateOptions>,
    cancel: CancellationToken,
    mut on_token: impl FnMut(&str),
) -> AppResult<()> {
    let client = streaming_client()?;
    let full = match system {
        Some(s) if !s.is_empty() => format!("{s}\n\n{prompt}"),
        _ => prompt.to_string(),
    };
    let body = CompletionRequest::new(full, options.filter(|o| !o.is_empty()));
    let resp = client
        .post(format!("{endpoint}/completion"))
        .json(&body)
        .send()
        .await
        .map_err(|e| {
            if e.is_timeout() || e.is_connect() {
                AppError::Timeout(format!("connect to llama-server: {e}"))
            } else {
                AppError::Inference(e.to_string())
            }
        })?;

    let status = resp.status();
    if !status.is_success() {
        let body_text = body_or_note(resp).await;
        return Err(AppError::Inference(format!("completion HTTP {status}: {body_text}")));
    }

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
                    let payload = strip_sse(&line);
                    if payload.is_empty() || payload == b"[DONE]" { continue; }
                    let chunk: CompletionChunk = serde_json::from_slice(payload)
                        .map_err(|e| AppError::Inference(format!("bad chunk: {e}")))?;
                    if !chunk.content.is_empty() {
                        on_token(&chunk.content);
                    }
                    if cancel.is_cancelled() { return Ok(()); }
                    if chunk.stop { return Ok(()); }
                }
            }
        }
    }
    Ok(())
}
