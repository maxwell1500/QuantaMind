use crate::commands::gguf_cmd::EVENT_MODELS_CHANGED;
use crate::errors::{AppError, AppResult};
use crate::inference::pull::{pull_model as run_pull, validate_name};
use crate::inference::pull_progress::PullProgress;
use crate::sync::MutexExt;
use serde::Serialize;
use std::collections::HashMap;
use std::sync::Mutex;
use tauri::{AppHandle, Emitter, Manager};
use tokio_util::sync::CancellationToken;
use uuid::Uuid;

const DEFAULT_OLLAMA: &str = "http://localhost:11434";
pub const EVENT_PULL_PROGRESS: &str = "pull-progress";

#[derive(Default)]
pub struct PullState {
    active: Mutex<HashMap<String, CancellationToken>>,
}

#[derive(Serialize, Clone)]
struct PullProgressEvent {
    pull_id: String,
    name: String,
    progress: PullProgress,
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
        let result = run_pull(
            DEFAULT_OLLAMA,
            &name,
            move |progress| {
                let _ = emit_inner.emit(
                    EVENT_PULL_PROGRESS,
                    PullProgressEvent {
                        pull_id: pid_event.clone(),
                        name: name_event.clone(),
                        progress,
                    },
                );
            },
            token,
        )
        .await;
        if let Err(e) = &result {
            eprintln!("pull_model({pid}) failed: {e:?}");
            let _ = emit_app.emit(
                EVENT_PULL_PROGRESS,
                PullProgressEvent {
                    pull_id: pid.clone(),
                    name: name_outer.clone(),
                    progress: PullProgress::Failed { message: e.friendly() },
                },
            );
        } else {
            let _ = emit_app.emit(EVENT_MODELS_CHANGED, ());
        }
        if let Some(state) = emit_app.try_state::<PullState>() {
            state.active.lock_recover().remove(&pid);
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
