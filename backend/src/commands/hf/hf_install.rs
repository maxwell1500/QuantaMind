use crate::commands::emit::log_emit;
use crate::commands::gguf::gguf_cmd::{install_local_gguf_inner, EVENT_MODELS_CHANGED};
use crate::commands::hf::hf_phase::{HfPhase, EVENT_HF_PROGRESS};
use crate::commands::ollama::ollama_runtime::{is_reachable, PROBE_TIMEOUT_MS};
use crate::commands::settings::user_settings::UserSettingsState;
use crate::commands::storage::storage_disk::gguf_dest;
use std::path::PathBuf;
use crate::errors::{AppError, AppResult};
use crate::inference::backend::backend_kind::BackendKind;
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

impl HfInstallState {
    /// The shared single-in-flight token slot. Exposed so the MLX install path
    /// (`mlx_install.rs`) shares one cancel channel + one-at-a-time guard with
    /// the GGUF path and `cancel_hf_install` covers both.
    pub fn current(&self) -> &Mutex<Option<CancellationToken>> {
        &self.current
    }
}

/// A failed Ollama import is fatal only on the Ollama backend.
pub fn ollama_import_required(backend: BackendKind) -> bool {
    matches!(backend, BackendKind::Ollama)
}

pub async fn install_hf_gguf_inner(
    app: AppHandle, state: &HfInstallState, endpoint: &str,
    repo: &str, filename: &str, name: &str, backend: BackendKind, dir: PathBuf,
) -> AppResult<()> {
    validate_name(name)?;
    fs::create_dir_all(&dir).map_err(|e| AppError::Io(e.to_string()))?;
    let dest = gguf_dest(&dir, name);

    let token = CancellationToken::new();
    {
        let mut g = state.current.lock_recover();
        if g.is_some() {
            return Err(AppError::Validation("another HF install already in progress".into()));
        }
        *g = Some(token.clone());
    }

    let dl_app = app.clone();
    let on_dl = move |p: DownloadProgress| log_emit(&dl_app, EVENT_HF_PROGRESS, HfPhase::Downloading {
        bytes_completed: p.bytes_completed, bytes_total: p.bytes_total, speed_bps: p.speed_bps,
    });
    let dl = download_gguf(endpoint, repo, filename, &dest, on_dl, token.clone()).await;
    if token.is_cancelled() {
        *state.current.lock_recover() = None;
        let _ = fs::remove_file(&dest); let _ = fs::remove_file(partial_path(&dest));
        return Err(AppError::Validation("install cancelled".into()));
    }
    dl?;

    // Import into Ollama when reachable; the GGUF is kept for llama.cpp regardless.
    let install_app = app.clone();
    let on_install = move |p| log_emit(&install_app, EVENT_HF_PROGRESS, HfPhase::from_create(p));
    let result = if is_reachable(PROBE_TIMEOUT_MS).await {
        install_local_gguf_inner(DEFAULT_OLLAMA, &dest.to_string_lossy(), name, on_install).await
    } else if ollama_import_required(backend) {
        Err(AppError::Inference("Ollama is not running — start it to add this model to Ollama.".into()))
    } else {
        Ok(())
    };
    let _ = fs::remove_file(partial_path(&dest)); // keep `dest`; only the resume marker is transient
    if result.is_ok() { log_emit(&app, EVENT_MODELS_CHANGED, ()); }
    *state.current.lock_recover() = None;
    result
}

#[tauri::command]
pub async fn install_hf_gguf(
    app: AppHandle,
    state: tauri::State<'_, HfInstallState>,
    settings: tauri::State<'_, UserSettingsState>,
    repo: String, filename: String, name: String, backend: Option<BackendKind>,
) -> Result<(), AppError> {
    let backend = backend.unwrap_or_default();
    let dir = settings.weights_dir(&app)?;
    install_hf_gguf_inner(app, state.inner(), HF_ENDPOINT, &repo, &filename, &name, backend, dir).await
}

#[tauri::command]
pub fn cancel_hf_install(state: tauri::State<'_, HfInstallState>) -> Result<(), AppError> {
    if let Some(token) = state.current.lock_recover().take() {
        token.cancel();
    }
    Ok(())
}

#[cfg(test)]
#[path = "hf_install_tests.rs"]
mod tests;
