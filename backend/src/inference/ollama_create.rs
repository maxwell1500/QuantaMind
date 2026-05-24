use crate::errors::{AppError, AppResult};
use crate::inference::consume_create::consume_ndjson;
use crate::inference::create_body::build_create_body;
use crate::inference::create_spec::{CreatePhase, CreateSpec};
use crate::inference::ollama_blob::{blob_exists, sha256_file, upload_blob};
use reqwest::Client;
use std::sync::Arc;
use std::time::Duration;

pub async fn ollama_create<F>(
    endpoint: &str,
    model_name: &str,
    spec: &CreateSpec,
    on_progress: F,
) -> AppResult<()>
where
    F: Fn(CreatePhase) + Send + Sync + 'static,
{
    let cb = Arc::new(on_progress);

    let hashing_cb = cb.clone();
    let digest = sha256_file(&spec.gguf_path, move |bytes_completed, bytes_total| {
        hashing_cb(CreatePhase::Hashing { bytes_completed, bytes_total });
    })
    .await?;

    if !blob_exists(endpoint, &digest).await? {
        let upload_cb = cb.clone();
        upload_blob(
            endpoint,
            &digest,
            &spec.gguf_path,
            move |bytes_completed, bytes_total| {
                upload_cb(CreatePhase::Uploading { bytes_completed, bytes_total });
            },
        )
        .await?;
    }

    cb(CreatePhase::Creating);
    let body = build_create_body(spec, model_name, &digest)?;
    let client = Client::builder()
        .connect_timeout(Duration::from_secs(60))
        .build()
        .map_err(|e| AppError::Internal(e.to_string()))?;
    let resp = client
        .post(format!("{endpoint}/api/create"))
        .json(&body)
        .send()
        .await
        .map_err(|e| AppError::Inference(e.to_string()))?;
    let status = resp.status();
    if !status.is_success() {
        let body_text = resp.text().await.unwrap_or_default();
        return Err(AppError::Inference(format!(
            "create HTTP {status}: {body_text}"
        )));
    }
    consume_ndjson(resp).await
}
