use crate::errors::{AppError, AppResult};
use crate::inference::gguf::{inspect_gguf as inspect, GgufMetadata};
use crate::inference::pull::validate_name;
use std::path::PathBuf;

#[tauri::command]
pub async fn inspect_gguf(path: String) -> Result<GgufMetadata, AppError> {
    inspect(&PathBuf::from(&path))
}

/// Validate inputs and (eventually) call M.12's Modelfile generator +
/// `ollama create`. For M.8 this returns a clear "not implemented" error
/// so the LocalFileTab can render it gracefully; M.12 will replace the
/// body without touching this signature.
#[tauri::command]
pub async fn install_local_gguf(path: String, name: String) -> AppResult<()> {
    validate_name(&name)?;
    let p = PathBuf::from(&path);
    if !p.exists() {
        return Err(AppError::Validation(format!("file does not exist: {path}")));
    }
    let ext_ok = p.extension().and_then(|e| e.to_str())
        .map(|s| s.eq_ignore_ascii_case("gguf")).unwrap_or(false);
    if !ext_ok {
        return Err(AppError::Validation(format!("not a .gguf file: {path}")));
    }
    Err(AppError::Internal(
        "install_local_gguf is awaiting M.12 (Modelfile generator + ollama create)".into(),
    ))
}
