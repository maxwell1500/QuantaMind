use crate::commands::emit::log_emit;
use crate::commands::gguf::gguf_cmd::EVENT_MODELS_CHANGED;
use crate::commands::hf::hf_install::HfInstallState;
use crate::commands::hf::hf_phase::{HfPhase, EVENT_HF_PROGRESS};
use crate::commands::settings::user_settings::UserSettingsState;
use crate::commands::storage::storage_disk::mlx_model_dir;
use crate::errors::{AppError, AppResult};
use crate::inference::hf::hf_browse::repo_all_files;
use crate::inference::hf::hf_request::validate_repo;
use crate::inference::hf::hf_snapshot::{download_snapshot, SnapshotProgress};
use crate::inference::mlx::mlx_supported;
use crate::sync::MutexExt;
use std::fs;
use std::path::{Path, PathBuf};
use tauri::AppHandle;
use tokio_util::sync::CancellationToken;

const HF_ENDPOINT: &str = "https://huggingface.co";
/// Records the original HF repo id inside a model dir so disk discovery can show
/// a friendly name instead of the sanitized folder.
pub const REPO_MARKER: &str = ".qm-repo";

/// Tauri-free core: gate → validate → create the model dir → write the repo
/// marker → enumerate repo files → snapshot them to disk. Returns the model dir.
/// No Ollama import (MLX isn't an Ollama path).
pub async fn fetch_mlx_snapshot(
    endpoint: &str,
    repo: &str,
    mlx_dir: &Path,
    on_progress: impl Fn(SnapshotProgress),
    cancel: CancellationToken,
) -> AppResult<PathBuf> {
    if !mlx_supported() {
        return Err(AppError::Validation("MLX needs Apple Silicon (macOS arm64).".into()));
    }
    validate_repo(repo)?;
    let model_dir = mlx_model_dir(mlx_dir, repo);
    fs::create_dir_all(&model_dir).map_err(|e| AppError::Io(e.to_string()))?;
    // Record the repo id up front so even a partial dir can be labelled.
    let _ = fs::write(model_dir.join(REPO_MARKER), repo);

    let files = repo_all_files(endpoint, repo).await?;
    download_snapshot(endpoint, repo, &files, &model_dir, on_progress, cancel).await?;
    Ok(model_dir)
}

pub async fn install_mlx_inner(
    app: AppHandle,
    state: &HfInstallState,
    endpoint: &str,
    repo: &str,
    mlx_dir: PathBuf,
) -> AppResult<()> {
    let token = CancellationToken::new();
    {
        let mut g = state.current().lock_recover();
        if g.is_some() {
            return Err(AppError::Validation("another install already in progress".into()));
        }
        *g = Some(token.clone());
    }

    let dl_app = app.clone();
    let on_dl = move |p: SnapshotProgress| {
        log_emit(&dl_app, EVENT_HF_PROGRESS, HfPhase::Downloading {
            bytes_completed: p.bytes_completed,
            bytes_total: p.bytes_total,
            speed_bps: p.speed_bps,
        });
    };
    let dl = fetch_mlx_snapshot(endpoint, repo, &mlx_dir, on_dl, token.clone()).await;
    *state.current().lock_recover() = None;

    if token.is_cancelled() {
        return Err(AppError::Validation("install cancelled".into()));
    }
    dl?;
    log_emit(&app, EVENT_MODELS_CHANGED, ());
    Ok(())
}

#[tauri::command]
pub async fn install_mlx_model(
    app: AppHandle,
    state: tauri::State<'_, HfInstallState>,
    settings: tauri::State<'_, UserSettingsState>,
    repo: String,
) -> Result<(), AppError> {
    let dir = settings.mlx_weights_dir();
    install_mlx_inner(app, state.inner(), HF_ENDPOINT, &repo, dir).await
}

#[cfg(test)]
#[path = "mlx_install_tests.rs"]
mod tests;
