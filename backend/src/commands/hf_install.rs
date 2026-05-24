use crate::commands::gguf_cmd::install_local_gguf_inner;
use crate::errors::{AppError, AppResult};
use crate::inference::create_spec::CreatePhase;
use crate::inference::hf_download::{download_gguf, DownloadProgress};
use crate::inference::hf_resume::partial_path;
use crate::inference::pull_name::validate_name;
use crate::sync::MutexExt;
use serde::Serialize;
use std::fs;
use std::sync::Mutex;
use tauri::{AppHandle, Emitter};
use tokio_util::sync::CancellationToken;

const DEFAULT_OLLAMA: &str = "http://localhost:11434";
const HF_ENDPOINT: &str = "https://huggingface.co";
pub const EVENT_HF_PROGRESS: &str = "hf-progress";

#[derive(Default)]
pub struct HfInstallState {
    current: Mutex<Option<CancellationToken>>,
}

#[derive(Serialize, Clone)]
#[serde(tag = "phase", rename_all = "snake_case")]
pub enum HfPhase {
    Downloading { bytes_completed: u64, bytes_total: u64, speed_bps: u64 },
    Hashing { bytes_completed: u64, bytes_total: u64 },
    Uploading { bytes_completed: u64, bytes_total: u64 },
    Installing,
}

pub async fn install_hf_gguf_inner(
    app: AppHandle, state: &HfInstallState, endpoint: &str,
    repo: &str, filename: &str, name: &str,
) -> AppResult<()> {
    validate_name(name)?;
    let temp_dir = std::env::temp_dir().join("quatamind-hf");
    fs::create_dir_all(&temp_dir).map_err(|e| AppError::Io(e.to_string()))?;
    let safe = name.replace([':', '/'], "_");
    let dest = temp_dir.join(format!("{safe}.gguf"));

    let token = CancellationToken::new();
    {
        let mut g = state.current.lock_recover();
        if g.is_some() {
            return Err(AppError::Validation(
                "another HF install is already in progress — cancel it first".into(),
            ));
        }
        *g = Some(token.clone());
    }

    let dl_app = app.clone();
    let on_dl = move |p: DownloadProgress| {
        let _ = dl_app.emit(EVENT_HF_PROGRESS, HfPhase::Downloading {
            bytes_completed: p.bytes_completed, bytes_total: p.bytes_total, speed_bps: p.speed_bps,
        });
    };
    let dl = download_gguf(endpoint, repo, filename, &dest, on_dl, token.clone()).await;
    if token.is_cancelled() {
        *state.current.lock_recover() = None;
        let _ = fs::remove_file(&dest);
        let _ = fs::remove_file(partial_path(&dest));
        return Err(AppError::Validation("install cancelled".into()));
    }
    dl?;

    let install_app = app.clone();
    let on_install = move |phase: CreatePhase| {
        let mapped = match phase {
            CreatePhase::Hashing { bytes_completed, bytes_total } =>
                HfPhase::Hashing { bytes_completed, bytes_total },
            CreatePhase::Uploading { bytes_completed, bytes_total } =>
                HfPhase::Uploading { bytes_completed, bytes_total },
            CreatePhase::Creating => HfPhase::Installing,
        };
        let _ = install_app.emit(EVENT_HF_PROGRESS, mapped);
    };
    let result = install_local_gguf_inner(DEFAULT_OLLAMA, &dest.to_string_lossy(), name, on_install).await;
    let _ = fs::remove_file(&dest);
    let _ = fs::remove_file(partial_path(&dest));
    if result.is_ok() {
        let _ = app.emit("models-changed", ());
    }
    *state.current.lock_recover() = None;
    result
}

#[tauri::command]
pub async fn install_hf_gguf(
    app: AppHandle, state: tauri::State<'_, HfInstallState>,
    repo: String, filename: String, name: String,
) -> Result<(), AppError> {
    install_hf_gguf_inner(app, state.inner(), HF_ENDPOINT, &repo, &filename, &name).await
}

#[tauri::command]
pub fn cancel_hf_install(state: tauri::State<'_, HfInstallState>) -> Result<(), AppError> {
    if let Some(token) = state.current.lock_recover().take() {
        token.cancel();
    }
    Ok(())
}
