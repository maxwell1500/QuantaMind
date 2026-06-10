use crate::commands::stt::eval::{readiness_dir, reports_dir};
use crate::errors::AppError;
use crate::inference::stt::eval::readiness::{verdicts, SttModelVerdict, SttReadinessProfile};
use crate::persistence::stt::{eval_readiness, eval_reports};
use tauri::AppHandle;

/// Assess a stored report against a readiness profile → one verdict per model.
/// All loading happens here; the aggregation + `assess()` stay pure (`verdicts`),
/// so the GUI and a future CLI can't diverge.
#[tauri::command]
pub fn assess_stt_readiness(
    app: AppHandle,
    spec: String,
    profile_id: String,
) -> Result<Vec<SttModelVerdict>, AppError> {
    let profile = eval_readiness::load(&readiness_dir(&app)?, &profile_id)?;
    let report = eval_reports::load(&reports_dir(&app)?, &spec)?.unwrap_or_default();
    Ok(verdicts(&report, &profile))
}

#[tauri::command]
pub fn list_stt_readiness_profiles(app: AppHandle) -> Result<Vec<SttReadinessProfile>, AppError> {
    eval_readiness::list(&readiness_dir(&app)?)
}

#[tauri::command]
pub fn save_stt_readiness_profile(app: AppHandle, profile: SttReadinessProfile) -> Result<(), AppError> {
    eval_readiness::save(&readiness_dir(&app)?, &profile)
}

#[tauri::command]
pub fn delete_stt_readiness_profile(app: AppHandle, id: String) -> Result<(), AppError> {
    eval_readiness::delete(&readiness_dir(&app)?, &id)
}
