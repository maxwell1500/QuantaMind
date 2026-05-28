use crate::commands::emit::log_emit;
use crate::commands::gguf::gguf_cmd::EVENT_MODELS_CHANGED;
use crate::commands::models::pull_events::{emit_failed, panic_message, PullProgressEvent, EVENT_PULL_PROGRESS};
use crate::commands::gguf::verify_install::verify_model_registered;
use crate::errors::{AppError, AppResult};
use crate::inference::pull::pull::pull_model as run_pull;
use crate::inference::pull::pull_name::validate_name;
use crate::sync::MutexExt;
use futures_util::FutureExt;
use std::collections::HashMap;
use std::panic::AssertUnwindSafe;
use std::sync::Mutex;
use tauri::{AppHandle, Manager};
use tokio_util::sync::CancellationToken;
use uuid::Uuid;

const DEFAULT_OLLAMA: &str = "http://localhost:11434";

#[derive(Default)]
pub struct PullState {
    active: Mutex<HashMap<String, CancellationToken>>,
}

#[tauri::command]
pub async fn pull_model(
    app: AppHandle,
    state: tauri::State<'_, PullState>,
    name: String,
) -> Result<String, AppError> {
    validate_name(&name)?;
    let pull_id = Uuid::new_v4().to_string();
    let token = CancellationToken::new();
    state.active.lock_recover().insert(pull_id.clone(), token.clone());

    let pid = pull_id.clone();
    let name_outer = name.clone();
    let emit_app = app.clone();
    tokio::spawn(async move {
        let pid_event = pid.clone();
        let name_event = name_outer.clone();
        let emit_inner = emit_app.clone();
        let task = async move {
            run_pull(DEFAULT_OLLAMA, &name, move |progress| {
                log_emit(&emit_inner, EVENT_PULL_PROGRESS, PullProgressEvent {
                    pull_id: pid_event.clone(), name: name_event.clone(), progress,
                });
            }, token).await
        };
        match AssertUnwindSafe(task).catch_unwind().await {
            Ok(Ok(())) => {
                // Ollama 0.24+ may report pull success before /api/tags
                // reflects the new manifest. Verify before broadcasting so
                // the frontend's refresh sees the new model on first read.
                match verify_model_registered(DEFAULT_OLLAMA, &name_outer).await {
                    Ok(()) => log_emit(&emit_app, EVENT_MODELS_CHANGED, ()),
                    Err(e) => emit_failed(&emit_app, &pid, &name_outer, e.friendly()),
                }
            }
            Ok(Err(e)) => {
                eprintln!("pull_model({pid}) failed: {e:?}");
                emit_failed(&emit_app, &pid, &name_outer, e.friendly());
            }
            Err(panic) => {
                let msg = panic_message(panic);
                eprintln!("pull_model({pid}) PANICKED: {msg}");
                emit_failed(&emit_app, &pid, &name_outer, format!("internal error: {msg}"));
            }
        }
        match emit_app.try_state::<PullState>() {
            Some(state) => { state.active.lock_recover().remove(&pid); }
            None => eprintln!("pull_model({pid}): PullState unavailable on cleanup — token leak"),
        }
    });

    Ok(pull_id)
}

#[tauri::command]
pub fn cancel_pull(
    state: tauri::State<'_, PullState>,
    pull_id: String,
) -> AppResult<()> {
    if let Some(token) = state.active.lock_recover().remove(&pull_id) {
        token.cancel();
        Ok(())
    } else {
        Err(AppError::NotFound(format!("pull_id {pull_id}")))
    }
}
