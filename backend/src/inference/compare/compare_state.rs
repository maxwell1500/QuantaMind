use std::collections::HashMap;
use std::sync::{Arc, Mutex};
use tokio_util::sync::CancellationToken;
use uuid::Uuid;

/// Per-run cancellation registry shared between the compare run loop and
/// the stop command: one token per in-flight row plus a run-level token.
/// Tauri-free domain state (see `docs/layering.md`); the IPC layer manages
/// it as Tauri `State` and re-exports it from `commands::compare::compare`.
#[derive(Default, Clone)]
pub struct CompareRunState {
    pub rows: Arc<Mutex<HashMap<Uuid, CancellationToken>>>,
    pub run_cancel: Arc<Mutex<Option<CancellationToken>>>,
}
