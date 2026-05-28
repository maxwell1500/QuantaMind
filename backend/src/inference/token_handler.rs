use crate::metrics::timing::RunTiming;
use crate::sync::MutexExt;
use std::sync::{Arc, Mutex};
use tokio_util::sync::CancellationToken;

/// Wrap a per-token emit closure with timing + cancellation: each accepted
/// token is counted; an emit failure (`Err(())`) cancels the run. Shared by
/// the single-run and compare paths — domain glue, not IPC-specific.
pub fn make_token_handler<F>(
    mut emit: F,
    cancel: CancellationToken,
    timing: Arc<Mutex<RunTiming>>,
) -> impl FnMut(&str)
where
    F: FnMut(&str) -> Result<(), ()>,
{
    move |t| match emit(t) {
        Ok(()) => {
            timing.lock_recover().record_token();
        }
        Err(()) => {
            cancel.cancel();
        }
    }
}
