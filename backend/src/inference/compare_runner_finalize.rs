#![deny(clippy::unwrap_used)]
use crate::commands::compare_payloads::{
    CompareCancelledPayload, CompareDonePayload, CompareErrorPayload,
    EVENT_COMPARE_CANCELLED, EVENT_COMPARE_DONE, EVENT_COMPARE_ERROR,
};
use crate::errors::AppError;
use crate::inference::compare_runner::RowSpec;
use crate::metrics::timing::RunTiming;
use crate::sync::MutexExt;
use serde::Serialize;
use std::sync::{Arc, Mutex};
use tokio_util::sync::CancellationToken;

pub type CompareEmit = Arc<dyn Fn(&str, serde_json::Value) + Send + Sync>;

pub fn emit<T: Serialize>(emit_fn: &CompareEmit, event: &str, payload: &T) {
    if let Ok(v) = serde_json::to_value(payload) {
        emit_fn(event, v);
    }
}

pub(crate) fn finalize_row(
    emit_fn: &CompareEmit,
    row: &RowSpec,
    timing: &Arc<Mutex<RunTiming>>,
    row_token: &CancellationToken,
    result: Result<(), AppError>,
) {
    let id = row.model_id.to_string();
    match result {
        Ok(()) if row_token.is_cancelled() => emit(emit_fn, EVENT_COMPARE_CANCELLED, &CompareCancelledPayload {
            model_id: id,
            model: row.model.clone(),
            token_count: timing.lock_recover().token_count,
        }),
        Ok(()) => {
            let t = timing.lock_recover();
            emit(emit_fn, EVENT_COMPARE_DONE, &CompareDonePayload {
                model_id: id, model: row.model.clone(),
                ttft_ms: t.ttft_ms(), tokens_per_sec: t.tokens_per_sec(),
                token_count: t.token_count,
            });
        }
        Err(err) => {
            let (kind, message) = app_error_split(&err);
            emit(emit_fn, EVENT_COMPARE_ERROR, &CompareErrorPayload {
                model_id: id, model: row.model.clone(), kind, message,
            });
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
