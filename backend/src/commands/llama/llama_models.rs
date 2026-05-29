use crate::commands::llama::llama_discover::discover_gguf_models;
use crate::commands::storage::storage_disk::gguf_dir;
use crate::commands::storage::storage_types::InstalledModelInfo;
use crate::errors::AppError;

/// List GGUF models available to the llama.cpp backend. Scans the retained
/// HF/GGUF store; each `*.gguf` becomes a model tagged `backend=llama_cpp`.
#[tauri::command]
pub async fn list_llama_models() -> Result<Vec<InstalledModelInfo>, AppError> {
    let dir = gguf_dir();
    Ok(discover_gguf_models(&[dir.as_path()]))
}
