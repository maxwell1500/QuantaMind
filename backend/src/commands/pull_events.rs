use crate::commands::emit::log_emit;
use crate::inference::pull_progress::PullProgress;
use serde::Serialize;
use tauri::AppHandle;

pub const EVENT_PULL_PROGRESS: &str = "pull-progress";

#[derive(Serialize, Clone)]
pub struct PullProgressEvent {
    pub pull_id: String,
    pub name: String,
    pub progress: PullProgress,
}

/// Extract a readable message from a caught panic payload.
pub fn panic_message(p: Box<dyn std::any::Any + Send>) -> String {
    if let Some(s) = p.downcast_ref::<&str>() {
        return (*s).to_string();
    }
    if let Some(s) = p.downcast_ref::<String>() {
        return s.clone();
    }
    "unknown panic".to_string()
}

/// Emit a terminal `Failed` progress event for a pull.
pub fn emit_failed(app: &AppHandle, pid: &str, name: &str, message: String) {
    log_emit(app, EVENT_PULL_PROGRESS, PullProgressEvent {
        pull_id: pid.into(),
        name: name.into(),
        progress: PullProgress::Failed { message },
    });
}
