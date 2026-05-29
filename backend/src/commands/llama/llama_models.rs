use crate::commands::llama::llama_discover::discover_gguf_models;
use crate::commands::settings::user_settings::UserSettingsState;
use crate::commands::storage::storage_types::InstalledModelInfo;
use crate::errors::AppError;

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
