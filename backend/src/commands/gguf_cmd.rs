use crate::commands::storage::fetch_installed_with_stats;
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

/// Confirm the model actually appears in /api/tags after a successful
/// create. Ollama 0.24 has been observed to stream `{"status":"success"}`
/// for some inputs (e.g. tinyllama-1.1b-chat-v1.0.Q8_0.gguf in user
/// reports) while silently rolling back the registration — `ollama list`
/// ends up not showing the new model. Without this check the UI reports
/// false success.
pub async fn verify_model_registered(endpoint: &str, name: &str) -> AppResult<()> {
    let models = fetch_installed_with_stats(endpoint).await
        .map_err(|e| AppError::Inference(format!("verify install: {e}")))?;
    if models.iter().any(|m| m.name == name) {
        return Ok(());
    }
    Err(AppError::Inference(format!(
        "Ollama reported success but `{name}` is not in /api/tags — \
         registration was silently rolled back. Check `~/.ollama/logs/server.log` \
         for the underlying reason."
    )))
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
