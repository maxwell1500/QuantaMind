use crate::commands::emit::log_emit;
use crate::commands::gguf::gguf_cmd::EVENT_MODELS_CHANGED;
use crate::commands::mlx::mlx_discover::discover_mlx_models;
use crate::commands::storage::storage_disk::mlx_dir_resolved;
use crate::commands::storage::storage_types::InstalledModelInfo;
use crate::errors::AppError;
use crate::inference::mlx::mlx_supported;
use std::path::Path;
use tauri::AppHandle;

/// List MLX models discovered on local disk (downloaded via `install_mlx_model`
/// into `~/.quantamind/mlx`). Unlike the other backends this used to query a
/// running server's `/v1/models`, so models only showed after a start; now they
/// appear as soon as they're downloaded. Off Apple Silicon: empty (not an
/// error), matching the frontend's `Promise.allSettled` contract.
#[tauri::command]
pub async fn list_mlx_models() -> Result<Vec<InstalledModelInfo>, AppError> {
    if !mlx_supported() {
        return Ok(Vec::new());
    }
    let dir = mlx_dir_resolved(None);
    Ok(discover_mlx_models(&[dir.as_path()]))
}

/// Guard: only a model directory *inside* the MLX folder (and not the folder
/// itself) may be deleted — never an arbitrary path the frontend might pass.
pub fn is_deletable_mlx_dir(dir: &Path, path: &Path) -> bool {
    path.starts_with(dir) && path != dir
}

/// Delete a downloaded MLX model's directory from the MLX folder.
#[tauri::command]
pub async fn delete_mlx_model(app: AppHandle, path: String) -> Result<(), AppError> {
    let dir = mlx_dir_resolved(None);
    let p = Path::new(&path);
    if !is_deletable_mlx_dir(&dir, p) {
        return Err(AppError::Validation("not an MLX model in the MLX folder".into()));
    }
    std::fs::remove_dir_all(p).map_err(|e| AppError::Io(e.to_string()))?;
    log_emit(&app, EVENT_MODELS_CHANGED, ());
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn only_deletes_subdirs_inside_the_mlx_folder() {
        let dir = Path::new("/home/u/.quantamind/mlx");
        assert!(is_deletable_mlx_dir(dir, Path::new("/home/u/.quantamind/mlx/mlx-community_X")));
        // The folder itself and outside paths are refused.
        assert!(!is_deletable_mlx_dir(dir, dir));
        assert!(!is_deletable_mlx_dir(dir, Path::new("/home/u/.ssh")));
        assert!(!is_deletable_mlx_dir(dir, Path::new("/etc/passwd")));
    }
}
