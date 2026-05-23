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
    if !resp.status().is_success() {
        return Err(AppError::Inference(format!("HTTP {}", resp.status())));
    }
    consume_ndjson(resp).await
}

async fn consume_ndjson(resp: reqwest::Response) -> AppResult<()> {
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
