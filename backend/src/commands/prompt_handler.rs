use crate::metrics::timing::RunTiming;
use std::sync::{Arc, Mutex};
use tokio_util::sync::CancellationToken;

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
            timing.lock().unwrap().record_token();
        }
        Err(()) => {
            cancel.cancel();
        }
    }
}
