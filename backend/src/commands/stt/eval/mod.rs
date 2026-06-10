// STT eval IPC (P4): thin command wrappers over the dumb scorer + the pure
// readiness assess(). All I/O (loading transcripts/specs/profiles, streaming rows)
// lives here; the scoring + assessment stay pure in `inference/stt/eval/`.
pub mod eval_cmd;
pub mod readiness_cmd;

use crate::errors::{AppError, AppResult};
use std::path::PathBuf;
use tauri::{AppHandle, Manager};

fn cfg(app: &AppHandle) -> AppResult<PathBuf> {
    app.path().app_config_dir().map_err(|e| AppError::Io(e.to_string()))
}

/// Eval specs (the instruction sets).
pub(crate) fn evals_dir(app: &AppHandle) -> AppResult<PathBuf> {
    Ok(cfg(app)?.join("stt_evals"))
}
/// Streamed scored reports (one JSONL per spec).
pub(crate) fn reports_dir(app: &AppHandle) -> AppResult<PathBuf> {
    Ok(cfg(app)?.join("stt_reports"))
}
/// STT readiness profiles.
pub(crate) fn readiness_dir(app: &AppHandle) -> AppResult<PathBuf> {
    Ok(cfg(app)?.join("stt_readiness"))
}
/// The canonical transcript store the scorer reads (same dir the transcribe command writes).
pub(crate) fn transcripts_dir(app: &AppHandle) -> AppResult<PathBuf> {
    Ok(cfg(app)?.join("transcripts"))
}
