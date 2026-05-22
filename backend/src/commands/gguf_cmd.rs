use crate::errors::{AppError, AppResult};
use crate::inference::chat_templates::detect_template;
use crate::inference::gguf::{inspect_gguf as inspect, GgufMetadata};
use crate::inference::modelfile::{generate_modelfile, ModelfileParameters, ModelfileSpec};
use crate::inference::ollama_create::ollama_create;
use crate::inference::pull::validate_name;
use std::path::PathBuf;
use tauri::{AppHandle, Emitter};

const DEFAULT_OLLAMA: &str = "http://localhost:11434";
pub const EVENT_MODELS_CHANGED: &str = "models-changed";

#[tauri::command]
pub async fn inspect_gguf(path: String) -> Result<GgufMetadata, AppError> {
    inspect(&PathBuf::from(&path))
}

pub async fn install_local_gguf_inner(endpoint: &str, path: &str, name: &str) -> AppResult<()> {
    validate_name(name)?;
    let p = PathBuf::from(path);
    if !p.exists() {
        return Err(AppError::Validation(format!("file does not exist: {path}")));
    }
    let ext_ok = p.extension().and_then(|e| e.to_str())
        .map(|s| s.eq_ignore_ascii_case("gguf")).unwrap_or(false);
    if !ext_ok {
        return Err(AppError::Validation(format!("not a .gguf file: {path}")));
    }
    let meta = inspect(&p)?;
    let template = detect_template(name, Some(&meta.architecture));
    let spec = ModelfileSpec {
        gguf_path: p.canonicalize().unwrap_or(p.clone()),
        chat_template: template,
        parameters: ModelfileParameters::default(),
    };
    let modelfile = generate_modelfile(&spec);
    ollama_create(endpoint, name, &modelfile).await
}

#[tauri::command]
pub async fn install_local_gguf(app: AppHandle, path: String, name: String) -> AppResult<()> {
    let r = install_local_gguf_inner(DEFAULT_OLLAMA, &path, &name).await;
    if r.is_ok() {
        let _ = app.emit(EVENT_MODELS_CHANGED, ());
    }
    r
}
