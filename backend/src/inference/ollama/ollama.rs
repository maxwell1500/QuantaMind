use crate::errors::{AppError, AppResult};
use crate::inference::http::http::{body_or_note, streaming_client};
pub use crate::inference::generate::generate_options::GenerateOptions;
use futures_util::StreamExt;
use serde::{Deserialize, Serialize};
use tokio_util::sync::CancellationToken;

#[derive(Serialize)]
struct GenerateRequest<'a> {
    model: &'a str,
    prompt: &'a str,
    #[serde(skip_serializing_if = "Option::is_none")]
    system: Option<&'a str>,
    #[serde(skip_serializing_if = "Option::is_none")]
    options: Option<GenerateOptions>,
    #[serde(skip_serializing_if = "Option::is_none")]
    keep_alive: Option<i32>,
    stream: bool,
}

#[derive(Deserialize)]
struct GenerateChunk {
    #[serde(default)]
    response: String,
    done: bool,
}

pub async fn stream_generate(
    endpoint: &str,
    model: &str,
    prompt: &str,
    system: Option<&str>,
    options: Option<GenerateOptions>,
    keep_alive: Option<i32>,
    cancel: CancellationToken,
    mut on_token: impl FnMut(&str),
) -> AppResult<()> {
    let client = streaming_client()?;
    let options = options.filter(|o| !o.is_empty());
    let body = GenerateRequest { model, prompt, system, options, keep_alive, stream: true };
    let resp = client
        .post(format!("{endpoint}/api/generate"))
        .json(&body)
        .send()
        .await
        .map_err(|e| {
            if e.is_timeout() || e.is_connect() {
                AppError::Timeout(format!("connect to Ollama: {e}"))
            } else {
                AppError::Inference(e.to_string())
            }
        })?;

    let status = resp.status();
    if !status.is_success() {
        let body_text = body_or_note(resp).await;
        return Err(AppError::Inference(format!("generate HTTP {status}: {body_text}")));
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
                while let Some(nl) = buf.iter().position(|&b| b == b'\n') {
                    let line: Vec<u8> = buf.drain(..=nl).collect();
                    let trimmed = &line[..line.len() - 1];
                    if trimmed.is_empty() { continue; }
                    let chunk: GenerateChunk = serde_json::from_slice(trimmed)
                        .map_err(|e| AppError::Inference(format!("bad chunk: {e}")))?;
                    if !chunk.response.is_empty() {
                        on_token(&chunk.response);
                    }
                    if cancel.is_cancelled() { return Ok(()); }
                    if chunk.done { return Ok(()); }
                }
            }
        }
    }
    Ok(())
}
