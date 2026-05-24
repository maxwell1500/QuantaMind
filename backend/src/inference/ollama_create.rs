use crate::errors::{AppError, AppResult};
use crate::inference::create_body::build_create_body;
use crate::inference::create_spec::{CreatePhase, CreateSpec};
use crate::inference::ollama_blob::{blob_exists, sha256_file, upload_blob};
use futures_util::StreamExt;
use reqwest::Client;
use serde::Deserialize;
use std::sync::Arc;
use std::time::Duration;

#[derive(Deserialize)]
struct CreateChunk {
    #[serde(default)]
    status: String,
    #[serde(default)]
    error: Option<String>,
}

pub async fn ollama_create<F>(
    endpoint: &str,
    model_name: &str,
    spec: &CreateSpec,
    on_progress: F,
) -> AppResult<()>
where F: Fn(CreatePhase) + Send + Sync + 'static,
{
    let cb = Arc::new(on_progress);

    let hashing_cb = cb.clone();
    let digest = sha256_file(&spec.gguf_path, move |bytes_completed, bytes_total| {
        hashing_cb(CreatePhase::Hashing { bytes_completed, bytes_total });
    }).await?;

    if !blob_exists(endpoint, &digest).await? {
        let upload_cb = cb.clone();
        upload_blob(endpoint, &digest, &spec.gguf_path, move |bytes_completed, bytes_total| {
            upload_cb(CreatePhase::Uploading { bytes_completed, bytes_total });
        }).await?;
    }

    cb(CreatePhase::Creating);
    let body = build_create_body(spec, model_name, &digest);
    let client = Client::builder()
        .connect_timeout(Duration::from_secs(60))
        .build()
        .map_err(|e| AppError::Internal(e.to_string()))?;
    let resp = client.post(format!("{endpoint}/api/create"))
        .json(&body)
        .send().await
        .map_err(|e| AppError::Inference(e.to_string()))?;
    let status = resp.status();
    if !status.is_success() {
        let body_text = resp.text().await.unwrap_or_default();
        return Err(AppError::Inference(format!("create HTTP {status}: {body_text}")));
    }
    consume_ndjson(resp).await
}

async fn consume_ndjson(resp: reqwest::Response) -> AppResult<()> {
    let mut bytes = resp.bytes_stream();
    let mut buf: Vec<u8> = Vec::new();
    let mut last_status = String::new();
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
            if !chunk.status.is_empty() { last_status = chunk.status; }
        }
    }
    // Stream ended without an explicit `{"status":"success"}`. Treat as
    // failure — otherwise we'd report a fake success to the UI for cases
    // like uploading an mmproj-only or LoRA-only GGUF that Ollama
    // accepts the bytes for but never registers as a usable model.
    Err(AppError::Inference(format!(
        "ollama create: stream ended without success (last status: {})",
        if last_status.is_empty() { "<none>" } else { &last_status },
    )))
}
