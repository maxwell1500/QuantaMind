use serde::Serialize;
use tauri::{AppHandle, Emitter};

/// Emit a Tauri event, logging on failure instead of swallowing it.
/// Emission fails when the webview is gone; a dropped event must show up
/// in logs, never vanish silently (see `docs/robustness.md`).
pub fn log_emit<S: Serialize + Clone>(app: &AppHandle, event: &str, payload: S) {
    if let Err(e) = app.emit(event, payload) {
        eprintln!("emit '{event}' failed: {e}");
    }
}
