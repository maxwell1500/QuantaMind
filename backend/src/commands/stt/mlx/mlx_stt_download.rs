use crate::commands::emit::log_emit;
use crate::commands::gguf::gguf_cmd::EVENT_MODELS_CHANGED;
use crate::commands::mlx::mlx_install::fetch_mlx_snapshot;
use crate::commands::storage::storage_disk::mlx_stt_dir;
use crate::commands::stt::stt_download::{SttInstallProgress, SttInstallState, EVENT_STT_PROGRESS};
use crate::errors::AppError;
use crate::inference::hf::hf_snapshot::SnapshotProgress;
use crate::sync::MutexExt;
use tauri::AppHandle;
use tokio_util::sync::CancellationToken;

const HF_ENDPOINT: &str = "https://huggingface.co";

/// Download an `mlx-community/whisper-*` snapshot into `~/.quantamind/mlx-stt`
/// for the mlx-audio engine. Reuses `fetch_mlx_snapshot` (validate → sanitized
/// per-repo dir → `.qm-repo` marker → snapshot) and the **shared STT install
/// guard + progress event**, so it's one-STT-install-at-a-time, cancels via
/// `cancel_stt_install`, and shows in the Downloads page (source "stt").
#[tauri::command]
pub async fn download_mlx_stt_model(
    app: AppHandle,
    state: tauri::State<'_, SttInstallState>,
    repo: String,
) -> Result<(), AppError> {
    let token = CancellationToken::new();
    {
        let mut g = state.current().lock_recover();
        if g.is_some() {
            return Err(AppError::Validation("another STT install is already in progress".into()));
        }
        *g = Some(token.clone());
    }
    let dir = mlx_stt_dir();
    let ev_app = app.clone();
    let label = repo.clone();
    let on_progress = move |p: SnapshotProgress| {
        log_emit(&ev_app, EVENT_STT_PROGRESS, SttInstallProgress::Downloading {
            file: label.clone(),
            bytes_completed: p.bytes_completed,
            bytes_total: p.bytes_total,
            speed_bps: p.speed_bps,
        });
    };
    let result = fetch_mlx_snapshot(HF_ENDPOINT, &repo, &dir, on_progress, token.clone()).await;
    *state.current().lock_recover() = None;
    if token.is_cancelled() {
        return Err(AppError::Validation("install cancelled".into()));
    }
    result?;
    log_emit(&app, EVENT_STT_PROGRESS, SttInstallProgress::Done);
    log_emit(&app, EVENT_MODELS_CHANGED, ());
    Ok(())
}
