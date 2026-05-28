use crate::commands::compare_payloads::{
    CompareCancelledPayload, CompareDonePayload, CompareErrorPayload, CompareLoadingPayload,
    CompareTokenPayload, EVENT_COMPARE_CANCELLED, EVENT_COMPARE_DONE, EVENT_COMPARE_ERROR,
    EVENT_COMPARE_LOADING, EVENT_COMPARE_RUN_DONE, EVENT_COMPARE_TOKEN,
};
use crate::commands::emit::log_emit;
use crate::inference::compare::compare_sink::CompareSink;
use tauri::AppHandle;

/// Bridges domain compare events onto Tauri events. The single place the
/// compare payload shapes meet the IPC layer (see `docs/layering.md`).
pub struct TauriCompareSink {
    app: AppHandle,
}

impl TauriCompareSink {
    pub fn new(app: AppHandle) -> Self {
        Self { app }
    }
}

impl CompareSink for TauriCompareSink {
    fn loading(&self, model_id: &str, model: &str) {
        log_emit(&self.app, EVENT_COMPARE_LOADING, CompareLoadingPayload {
            model_id: model_id.into(), model: model.into(),
        });
    }
    fn token(&self, model_id: &str, model: &str, text: &str) {
        log_emit(&self.app, EVENT_COMPARE_TOKEN, CompareTokenPayload {
            model_id: model_id.into(), model: model.into(), text: text.into(),
        });
    }
    fn done(&self, model_id: &str, model: &str, ttft_ms: Option<u64>, tokens_per_sec: Option<f64>, token_count: usize) {
        log_emit(&self.app, EVENT_COMPARE_DONE, CompareDonePayload {
            model_id: model_id.into(), model: model.into(), ttft_ms, tokens_per_sec, token_count,
        });
    }
    fn cancelled(&self, model_id: &str, model: &str, token_count: usize) {
        log_emit(&self.app, EVENT_COMPARE_CANCELLED, CompareCancelledPayload {
            model_id: model_id.into(), model: model.into(), token_count,
        });
    }
    fn error(&self, model_id: &str, model: &str, kind: &str, message: &str) {
        log_emit(&self.app, EVENT_COMPARE_ERROR, CompareErrorPayload {
            model_id: model_id.into(), model: model.into(), kind: kind.into(), message: message.into(),
        });
    }
    fn run_done(&self) {
        log_emit(&self.app, EVENT_COMPARE_RUN_DONE, ());
    }
}
