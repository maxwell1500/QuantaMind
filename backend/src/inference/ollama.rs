use crate::errors::{AppError, AppResult};
use futures_util::StreamExt;
use reqwest::Client;
use serde::{Deserialize, Serialize};

#[derive(Serialize)]
struct GenerateRequest<'a> {
    model: &'a str,
    prompt: &'a str,
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
    mut on_token: impl FnMut(&str),
) -> AppResult<()> {
    let client = Client::new();
    let body = GenerateRequest { model, prompt, stream: true };
    let resp = client
        .post(format!("{endpoint}/api/generate"))
        .json(&body)
        .send()
        .await
        .map_err(|e| AppError::Inference(e.to_string()))?;

    if !resp.status().is_success() {
        return Err(AppError::Inference(format!("HTTP {}", resp.status())));
    }

    let mut bytes = resp.bytes_stream();
    let mut buf: Vec<u8> = Vec::new();
    while let Some(piece) = bytes.next().await {
        let piece = piece.map_err(|e| AppError::Inference(e.to_string()))?;
        buf.extend_from_slice(&piece);
        while let Some(nl) = buf.iter().position(|&b| b == b'\n') {
            let line: Vec<u8> = buf.drain(..=nl).collect();
            let trimmed = &line[..line.len() - 1];
            if trimmed.is_empty() {
                continue;
            }
            let chunk: GenerateChunk = serde_json::from_slice(trimmed)
                .map_err(|e| AppError::Inference(format!("bad chunk: {e}")))?;
            if !chunk.response.is_empty() {
                on_token(&chunk.response);
            }
            if chunk.done {
                return Ok(());
            }
        }
    }
    Ok(())
}
