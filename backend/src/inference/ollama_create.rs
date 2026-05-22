use crate::errors::{AppError, AppResult};
use futures_util::StreamExt;
use reqwest::Client;
use serde::{Deserialize, Serialize};
use std::time::Duration;

#[derive(Serialize)]
struct CreateRequest<'a> {
    name: &'a str,
    modelfile: &'a str,
}

#[derive(Deserialize)]
struct CreateChunk {
    #[serde(default)]
    status: String,
    #[serde(default)]
    error: Option<String>,
}

/// POST `/api/create` with `{name, modelfile}` and stream the NDJSON
/// response. Returns Ok on `{"status":"success"}`; any chunk with an
/// `error` field aborts with `AppError::Inference`.
pub async fn ollama_create(endpoint: &str, name: &str, modelfile: &str) -> AppResult<()> {
    let client = Client::builder()
        .connect_timeout(Duration::from_secs(60))
        .build()
        .map_err(|e| AppError::Internal(e.to_string()))?;
    let resp = client
        .post(format!("{endpoint}/api/create"))
        .json(&CreateRequest { name, modelfile })
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
            if trimmed.is_empty() { continue; }
            let chunk: CreateChunk = serde_json::from_slice(trimmed)
                .map_err(|e| AppError::Inference(format!("bad create chunk: {e}")))?;
            if let Some(err) = chunk.error {
                return Err(AppError::Inference(format!("ollama create: {err}")));
            }
            if chunk.status == "success" { return Ok(()); }
        }
    }
    Ok(())
}
