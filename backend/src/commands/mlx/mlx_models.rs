use crate::commands::mlx::mlx_discover::discover_mlx_models;
use crate::commands::storage::storage_disk::mlx_dir_resolved;
use crate::commands::storage::storage_types::InstalledModelInfo;
use crate::errors::AppError;
use crate::inference::mlx::mlx_supported;

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
