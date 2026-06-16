use crate::commands::emit::log_emit;
use crate::commands::gguf::gguf_cmd::EVENT_MODELS_CHANGED;
use crate::commands::mlx::mlx_discover::discover_mlx_models;
use crate::commands::storage::storage_disk::mlx_dir_resolved;
use crate::commands::storage::storage_types::InstalledModelInfo;
use crate::errors::{AppError, AppResult};
use crate::inference::mlx::mlx_supported;
use std::path::{Path, PathBuf};
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

/// Lexical guard: a directory *inside* the MLX folder (and not the folder
/// itself). This is a prefix test on already-resolved paths — see
/// [`resolve_deletable_mlx_dir`] for the symlink resolution that must run first.
pub fn is_deletable_mlx_dir(dir: &Path, path: &Path) -> bool {
    path.starts_with(dir) && path != dir
}

/// Resolve symlinks on both the candidate and the MLX folder *before* the
/// lexical guard, so a link planted inside the folder can't redirect a recursive
/// delete to an arbitrary directory tree (`starts_with` alone matches the
/// unresolved prefix and would pass). Returns the real directory to delete.
fn resolve_deletable_mlx_dir(dir: &Path, path: &Path) -> AppResult<PathBuf> {
    let real = path.canonicalize().map_err(|e| AppError::Io(e.to_string()))?;
    let real_dir = dir.canonicalize().map_err(|e| AppError::Io(e.to_string()))?;
    if !is_deletable_mlx_dir(&real_dir, &real) {
        return Err(AppError::Validation("not an MLX model in the MLX folder".into()));
    }
    Ok(real)
}

/// Delete a downloaded MLX model's directory from the MLX folder.
#[tauri::command]
pub async fn delete_mlx_model(app: AppHandle, path: String) -> Result<(), AppError> {
    let dir = mlx_dir_resolved(None);
    let real = resolve_deletable_mlx_dir(&dir, Path::new(&path))?;
    std::fs::remove_dir_all(&real).map_err(|e| AppError::Io(e.to_string()))?;
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

    #[cfg(unix)]
    #[test]
    fn resolve_rejects_a_symlink_escaping_the_mlx_folder() {
        use std::os::unix::fs::symlink;
        let tmp = tempfile::tempdir().unwrap();
        let dir = tmp.path().join("mlx");
        std::fs::create_dir(&dir).unwrap();

        // A directory tree outside the MLX folder we must not recursively delete.
        let outside = tmp.path().join("important");
        std::fs::create_dir(&outside).unwrap();
        std::fs::write(outside.join("keep.txt"), b"x").unwrap();

        // A symlink inside the folder pointing at the outside tree.
        let link = dir.join("mlx-community_evil");
        symlink(&outside, &link).unwrap();

        let err = resolve_deletable_mlx_dir(&dir, &link).unwrap_err();
        assert!(matches!(err, AppError::Validation(_)), "symlink escape must be refused");
        assert!(outside.join("keep.txt").exists(), "the outside tree must be untouched");
    }
}
