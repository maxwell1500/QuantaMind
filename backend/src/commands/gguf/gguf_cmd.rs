use crate::commands::emit::log_emit;
use crate::commands::gguf::verify_install::verify_model_registered;
use crate::errors::{AppError, AppResult};
use crate::inference::chat::chat_templates::detect_template;
use crate::inference::create::create_spec::{CreateParameters, CreatePhase, CreateSpec};
use crate::inference::gguf::gguf::{inspect_gguf as inspect, GgufMetadata};
use crate::inference::ollama::ollama_create::ollama_create;
use crate::inference::pull::pull_name::validate_name;
use std::path::PathBuf;
use tauri::AppHandle;

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
    let canonical = p.canonicalize().map_err(|e| AppError::Io(
        format!("cannot resolve absolute path for {path}: {e}")
    ))?;
    let spec = CreateSpec {
        gguf_path: canonical,
        chat_template: detect_template(name, Some(&meta.architecture)),
        parameters: CreateParameters::default(),
    };
    ollama_create(endpoint, name, &spec, on_progress).await?;
    verify_model_registered(endpoint, name).await
}

#[tauri::command]
pub async fn install_local_gguf(app: AppHandle, path: String, name: String) -> AppResult<()> {
    let emit_app = app.clone();
    let on_progress = move |phase: CreatePhase| {
        log_emit(&emit_app, EVENT_LOCAL_INSTALL_PROGRESS, phase);
    };
    let r = install_local_gguf_inner(DEFAULT_OLLAMA, &path, &name, on_progress).await;
    if r.is_ok() {
        log_emit(&app, EVENT_MODELS_CHANGED, ());
    }
    r
}
