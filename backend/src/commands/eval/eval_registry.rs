use crate::errors::{AppError, AppResult};
use crate::inference::eval::toolcall::tasks::ToolTask;
use crate::persistence::evals;
use std::path::PathBuf;
use tauri::Manager;

/// The managed directory for user-authored eval collections: one `.json` per
/// collection under the app config dir (mirrors the workspaces recents path).
fn evals_dir(app: &tauri::AppHandle) -> AppResult<PathBuf> {
    let dir = app.path().app_config_dir().map_err(|e| AppError::Io(e.to_string()))?;
    Ok(dir.join("evals"))
}

#[tauri::command]
pub fn list_custom_collections(app: tauri::AppHandle) -> Result<Vec<String>, AppError> {
    evals::list(&evals_dir(&app)?)
}

#[tauri::command]
pub fn load_custom_collection(app: tauri::AppHandle, name: String) -> Result<Vec<ToolTask>, AppError> {
    evals::load(&evals_dir(&app)?, &name)
}

#[tauri::command]
pub fn save_custom_collection(
    app: tauri::AppHandle,
    name: String,
    tasks: Vec<ToolTask>,
) -> Result<(), AppError> {
    evals::save(&evals_dir(&app)?, &name, &tasks)
}

#[tauri::command]
pub fn delete_custom_collection(app: tauri::AppHandle, name: String) -> Result<(), AppError> {
    evals::delete(&evals_dir(&app)?, &name)
}

/// Import an external `.json` collection by PATH (the frontend never reads file
/// contents): read it with the size cap, validate, derive a safe name from the
/// file stem, write it into the managed dir, and return the new name.
#[tauri::command]
pub fn import_custom_collection(
    app: tauri::AppHandle,
    source_path: PathBuf,
) -> Result<String, AppError> {
    let tasks = evals::read_capped(&source_path)?;
    let stem = source_path
        .file_stem()
        .and_then(|s| s.to_str())
        .ok_or_else(|| AppError::Validation("import file has no usable name".into()))?;
    let name = evals::sanitize_name(stem)?;
    let dir = evals_dir(&app)?;
    evals::save(&dir, &name, &tasks)?;
    Ok(name)
}
