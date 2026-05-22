use crate::commands::gguf_cmd::install_local_gguf;
use crate::errors::{AppError, AppResult};
use crate::inference::hf_download::{download_gguf, DownloadProgress};
use crate::inference::pull::validate_name;
use serde::Serialize;
use std::fs;
use tauri::{AppHandle, Emitter};
use tokio_util::sync::CancellationToken;

const HF_ENDPOINT: &str = "https://huggingface.co";
pub const EVENT_HF_PROGRESS: &str = "hf-progress";

#[derive(Serialize, Clone)]
#[serde(tag = "phase", rename_all = "snake_case")]
pub enum HfPhase {
    Downloading { bytes_completed: u64, bytes_total: u64, speed_bps: u64 },
    Installing,
}

/// Public for testing — installs from an arbitrary HF-compatible endpoint
/// (mockito in tests; `https://huggingface.co` in production).
pub async fn install_hf_gguf_inner(
    app: AppHandle,
    endpoint: &str,
    repo: &str,
    filename: &str,
    name: &str,
) -> AppResult<()> {
    validate_name(name)?;
    let temp_dir = std::env::temp_dir().join("quatamind-hf");
    fs::create_dir_all(&temp_dir).map_err(|e| AppError::Io(e.to_string()))?;
    let safe = name.replace([':', '/'], "_");
    let dest = temp_dir.join(format!("{safe}.gguf"));

    let emit_app = app.clone();
    let on_progress = move |p: DownloadProgress| {
        let _ = emit_app.emit(EVENT_HF_PROGRESS, HfPhase::Downloading {
            bytes_completed: p.bytes_completed,
            bytes_total: p.bytes_total,
            speed_bps: p.speed_bps,
        });
    };

    download_gguf(endpoint, repo, filename, &dest, on_progress, CancellationToken::new()).await?;

    let _ = app.emit(EVENT_HF_PROGRESS, HfPhase::Installing);
    install_local_gguf(dest.to_string_lossy().into_owned(), name.to_string()).await
}

#[tauri::command]
pub async fn install_hf_gguf(
    app: AppHandle,
    repo: String,
    filename: String,
    name: String,
) -> Result<(), AppError> {
    install_hf_gguf_inner(app, HF_ENDPOINT, &repo, &filename, &name).await
}
