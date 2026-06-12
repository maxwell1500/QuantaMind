use crate::commands::emit::log_emit;
use crate::commands::gguf::verify_install::verify_model_registered;
use crate::commands::ollama::ollama_runtime::{is_reachable, PROBE_TIMEOUT_MS};
use crate::commands::settings::user_settings::UserSettingsState;
use crate::commands::storage::storage_disk::gguf_dest;
use crate::errors::{AppError, AppResult};
use crate::inference::chat::chat_templates::detect_template;
use crate::inference::create::create_spec::{CreateParameters, CreatePhase, CreateSpec};
use crate::inference::gguf::gguf::{inspect_gguf as inspect, GgufMetadata};
use crate::inference::ollama::ollama_create::ollama_create;
use crate::inference::pull::pull_name::validate_name;
use std::fs;
use std::path::{Path, PathBuf};
use tauri::AppHandle;

const DEFAULT_OLLAMA: &str = "http://localhost:11434";
pub const EVENT_MODELS_CHANGED: &str = "models-changed";
pub const EVENT_LOCAL_INSTALL_PROGRESS: &str = "local-install-progress";

/// Where to copy a local-file install inside the shared folder, or `None` when
/// the picked file is already that exact path (no copy needed).
pub fn retain_dest(dir: &Path, name: &str, src: &Path) -> Option<PathBuf> {
    let dest = gguf_dest(dir, name);
    (src != dest).then_some(dest)
}

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
    // Fail fast (before hashing/uploading a multi-GB file) if Ollama is down.
    if !is_reachable(PROBE_TIMEOUT_MS).await {
        return Err(AppError::Inference(
            "Ollama is not running — start it, then add the model again.".into(),
        ));
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
pub async fn install_local_gguf(
    app: AppHandle,
    settings: tauri::State<'_, UserSettingsState>,
    path: String,
    name: String,
) -> AppResult<()> {
    // Copy into the shared folder so llama.cpp can use it too, then import.
    let dir = settings.weights_dir(&app)?;
    let import_path = match retain_dest(&dir, &name, Path::new(&path)) {
        Some(dest) => {
            fs::create_dir_all(&dir).map_err(|e| AppError::Io(e.to_string()))?;
            fs::copy(&path, &dest).map_err(|e| AppError::Io(e.to_string()))?;
            dest.to_string_lossy().into_owned()
        }
        None => path.clone(),
    };
    let emit_app = app.clone();
    let on_progress = move |phase: CreatePhase| log_emit(&emit_app, EVENT_LOCAL_INSTALL_PROGRESS, phase);
    let r = install_local_gguf_inner(DEFAULT_OLLAMA, &import_path, &name, on_progress).await;
    if r.is_ok() { log_emit(&app, EVENT_MODELS_CHANGED, ()); }
    r
}

#[cfg(test)]
#[path = "gguf_cmd_tests.rs"]
mod tests;
