use crate::errors::{AppError, AppResult};
use crate::inference::chat_templates::detect_template;
use crate::inference::create_spec::{CreateParameters, CreatePhase, CreateSpec};
use crate::inference::gguf::{inspect_gguf as inspect, GgufMetadata};
use crate::inference::ollama_create::ollama_create;
use crate::inference::pull::validate_name;
use std::path::PathBuf;
use tauri::{AppHandle, Emitter};

const DEFAULT_OLLAMA: &str = "http://localhost:11434";
pub const EVENT_MODELS_CHANGED: &str = "models-changed";
pub const EVENT_LOCAL_INSTALL_PROGRESS: &str = "local-install-progress";

#[tauri::command]
pub async fn inspect_gguf(path: String) -> Result<GgufMetadata, AppError> {
    inspect(&PathBuf::from(&path))
}

pub async fn install_local_gguf_inner<F>(
    endpoint: &str, path: &str, name: &str, on_progress: F,
) -> AppResult<()>
where F: Fn(CreatePhase) + Send + Sync + 'static,
{
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
    let spec = CreateSpec {
        gguf_path: p.canonicalize().unwrap_or(p.clone()),
        chat_template: detect_template(name, Some(&meta.architecture)),
        parameters: CreateParameters::default(),
    };
    ollama_create(endpoint, name, &spec, on_progress).await
}

#[tauri::command]
pub async fn install_local_gguf(app: AppHandle, path: String, name: String) -> AppResult<()> {
    let emit_app = app.clone();
    let on_progress = move |phase: CreatePhase| {
        let _ = emit_app.emit(EVENT_LOCAL_INSTALL_PROGRESS, phase);
    };
    let r = install_local_gguf_inner(DEFAULT_OLLAMA, &path, &name, on_progress).await;
    if r.is_ok() {
        let _ = app.emit(EVENT_MODELS_CHANGED, ());
    }
    r
}
