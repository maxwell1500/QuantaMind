use crate::metrics::timeline::TokenTiming;
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
    pub timeline: Vec<TokenTiming>,
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
        timeline: t.timeline().to_vec(),
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn timeline_length_matches_token_count() {
        let timing = Mutex::new(RunTiming::start());
        for tok in ["a", "b", "c"] {
            timing.lock_recover().record_token(tok);
        }
        let p = done_payload(&timing);
        assert_eq!(p.token_count, 3);
        assert_eq!(p.timeline.len(), p.token_count);
        assert_eq!(p.timeline[2].n, 3);
    }

    #[test]
    fn empty_run_yields_empty_timeline() {
        let timing = Mutex::new(RunTiming::start());
        let p = done_payload(&timing);
        assert_eq!(p.token_count, 0);
        assert!(p.timeline.is_empty());
    }
}
