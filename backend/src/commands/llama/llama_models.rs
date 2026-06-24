use crate::commands::llama::llama_discover::discover_gguf_models;
use crate::commands::settings::user_settings::UserSettingsState;
use crate::commands::storage::storage_types::InstalledModelInfo;
use crate::errors::{AppError, AppResult};
use std::path::{Path, PathBuf};

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

/// Lexical guard: only a `*.gguf` whose path is prefixed by the weights folder.
/// This is a prefix test on already-resolved paths — see [`resolve_deletable_gguf`]
/// for the symlink resolution that must run first.
pub fn is_deletable_gguf(dir: &Path, path: &Path) -> bool {
    path.starts_with(dir)
        && path.extension().map(|e| e.eq_ignore_ascii_case("gguf")).unwrap_or(false)
}

/// Resolve symlinks on both the candidate and the weights folder *before* the
/// lexical guard, so a link planted inside the folder can't redirect the delete
/// to an arbitrary file (`starts_with` alone matches the unresolved prefix and
/// would pass). Returns the real path to delete.
fn resolve_deletable_gguf(dir: &Path, path: &Path) -> AppResult<PathBuf> {
    let real = path.canonicalize().map_err(|e| AppError::Io(e.to_string()))?;
    let real_dir = dir.canonicalize().map_err(|e| AppError::Io(e.to_string()))?;
    if !is_deletable_gguf(&real_dir, &real) {
        return Err(AppError::Validation("not a GGUF in the weights folder".into()));
    }
    Ok(real)
}

/// Delete a llama.cpp model's GGUF from the shared weights folder.
#[tauri::command]
pub async fn delete_llama_model(
    app: tauri::AppHandle,
    settings: tauri::State<'_, UserSettingsState>,
    path: String,
) -> Result<(), AppError> {
    let dir = settings.weights_dir(&app)?;
    let real = resolve_deletable_gguf(&dir, Path::new(&path))?;
    std::fs::remove_file(&real).map_err(|e| AppError::Io(e.to_string()))
}

#[cfg(test)]
#[path = "llama_models_tests.rs"]
mod tests;
