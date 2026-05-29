use crate::commands::llama::llama_discover::discover_gguf_models;
use crate::commands::settings::user_settings::UserSettingsState;
use crate::commands::storage::storage_types::InstalledModelInfo;
use crate::errors::AppError;
use std::path::Path;

/// List GGUF models available to the llama.cpp backend by scanning the shared
/// weights folder; each `*.gguf` becomes a model tagged `backend=llama_cpp`.
#[tauri::command]
pub async fn list_llama_models(
    app: tauri::AppHandle,
    settings: tauri::State<'_, UserSettingsState>,
) -> Result<Vec<InstalledModelInfo>, AppError> {
    let dir = settings.weights_dir(&app)?;
    Ok(discover_gguf_models(&[dir.as_path()]))
}

/// Guard: only a `*.gguf` inside the weights folder may be deleted (never an
/// arbitrary path the frontend might pass).
pub fn is_deletable_gguf(dir: &Path, path: &Path) -> bool {
    path.starts_with(dir)
        && path.extension().map(|e| e.eq_ignore_ascii_case("gguf")).unwrap_or(false)
}

/// Delete a llama.cpp model's GGUF from the shared weights folder.
#[tauri::command]
pub async fn delete_llama_model(
    app: tauri::AppHandle,
    settings: tauri::State<'_, UserSettingsState>,
    path: String,
) -> Result<(), AppError> {
    let dir = settings.weights_dir(&app)?;
    let p = Path::new(&path);
    if !is_deletable_gguf(&dir, p) {
        return Err(AppError::Validation("not a GGUF in the weights folder".into()));
    }
    std::fs::remove_file(p).map_err(|e| AppError::Io(e.to_string()))
}

#[cfg(test)]
#[path = "llama_models_tests.rs"]
mod tests;
