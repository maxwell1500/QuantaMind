use crate::metrics::timing::RunTiming;
use crate::sync::MutexExt;
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

/// Read a `DonePayload` from the timing mutex, recovering the recorded
/// data even if a thread panicked while holding the lock. A fabricated
/// zero would be indistinguishable from a real empty run (see
/// `docs/architecture.md#robustness`).
pub fn done_payload(timing: &Mutex<RunTiming>) -> DonePayload {
    let t = timing.lock_recover();
    DonePayload {
        ttft_ms: t.ttft_ms(),
        tokens_per_sec: t.tokens_per_sec(),
        token_count: t.token_count,
    }
}
