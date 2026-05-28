use crate::commands::emit::log_emit;
use crate::commands::gguf_cmd::{install_local_gguf_inner, EVENT_MODELS_CHANGED};
use crate::commands::hf_phase::{HfPhase, EVENT_HF_PROGRESS};
use crate::errors::{AppError, AppResult};
use crate::inference::hf::hf_download::{download_gguf, DownloadProgress};
use crate::inference::hf::hf_resume::partial_path;
use crate::inference::pull::pull_name::validate_name;
use crate::sync::MutexExt;
use std::fs;
use std::sync::Mutex;
use tauri::AppHandle;
use tokio_util::sync::CancellationToken;

const DEFAULT_OLLAMA: &str = "http://localhost:11434";
const HF_ENDPOINT: &str = "https://huggingface.co";

#[derive(Default)]
pub struct HfInstallState {
    current: Mutex<Option<CancellationToken>>,
}

pub async fn install_hf_gguf_inner(
    app: AppHandle, state: &HfInstallState, endpoint: &str,
    repo: &str, filename: &str, name: &str,
) -> AppResult<()> {
    validate_name(name)?;
    let temp_dir = std::env::temp_dir().join("quantamind-hf");
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
        log_emit(&dl_app, EVENT_HF_PROGRESS, HfPhase::Downloading {
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
    let on_install = move |phase| {
        log_emit(&install_app, EVENT_HF_PROGRESS, HfPhase::from_create(phase));
    };
    let result = install_local_gguf_inner(DEFAULT_OLLAMA, &dest.to_string_lossy(), name, on_install).await;
    let _ = fs::remove_file(&dest);
    let _ = fs::remove_file(partial_path(&dest));
    if result.is_ok() {
        log_emit(&app, EVENT_MODELS_CHANGED, ());
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
