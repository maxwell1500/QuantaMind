#![deny(clippy::unwrap_used)]
use crate::errors::AppError;
use crate::inference::compare_runner::RowSpec;
use crate::inference::compare_sink::CompareSink;
use crate::metrics::timing::RunTiming;
use crate::sync::MutexExt;
use std::sync::{Arc, Mutex};
use tokio_util::sync::CancellationToken;

pub(crate) fn finalize_row(
    sink: &dyn CompareSink,
    row: &RowSpec,
    timing: &Arc<Mutex<RunTiming>>,
    row_token: &CancellationToken,
    result: Result<(), AppError>,
) {
    let id = row.model_id.to_string();
    match result {
        Ok(()) if row_token.is_cancelled() => {
            sink.cancelled(&id, &row.model, timing.lock_recover().token_count);
        }
        Ok(()) => {
            let t = timing.lock_recover();
            sink.done(&id, &row.model, t.ttft_ms(), t.tokens_per_sec(), t.token_count);
        }
        Err(err) => {
            let (kind, message) = app_error_split(&err);
            sink.error(&id, &row.model, &kind, &message);
        }
    }
}

fn app_error_split(e: &AppError) -> (String, String) {
    let (kind, m) = match e {
        AppError::Validation(m) => ("validation", m),
        AppError::NotFound(m) => ("not_found", m),
        AppError::Inference(m) => ("inference", m),
        AppError::Io(m) => ("io", m),
        AppError::Timeout(m) => ("timeout", m),
        AppError::AuthRequired(m) => ("auth_required", m),
        AppError::Internal(m) => ("internal", m),
    };
    (kind.into(), m.clone())
}
