use crate::metrics::timing::RunTiming;
use serde::Serialize;
use std::sync::Mutex;

#[derive(Serialize, Clone)]
pub struct TokenPayload {
    pub text: String,
}

#[derive(Serialize, Clone)]
pub struct DonePayload {
    pub ttft_ms: Option<u64>,
    pub tokens_per_sec: Option<f64>,
    pub token_count: usize,
}

#[derive(Serialize, Clone)]
pub struct CancelledPayload {
    pub token_count: usize,
}

/// Read a `DonePayload` from the timing mutex. On poison return a
/// zero-valued payload — don't trust recorded data after a panic.
pub fn done_payload_or_zero(timing: &Mutex<RunTiming>) -> DonePayload {
    match timing.lock() {
        Ok(t) => DonePayload {
            ttft_ms: t.ttft_ms(),
            tokens_per_sec: t.tokens_per_sec(),
            token_count: t.token_count,
        },
        Err(_) => DonePayload {
            ttft_ms: None,
            tokens_per_sec: None,
            token_count: 0,
        },
    }
}
