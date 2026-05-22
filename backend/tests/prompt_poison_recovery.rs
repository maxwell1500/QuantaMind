use splice_lib::commands::prompt_payloads::done_payload_or_zero;
use splice_lib::metrics::timing::RunTiming;
use splice_lib::sync::MutexExt;
use std::sync::{Arc, Mutex};
use std::thread;

/// F4: poisoning the timing mutex (e.g. a panic in the per-token callback)
/// must not crash subsequent reads. The DonePayload degrades to zero
/// metrics rather than returning poisoned-but-readable data or panicking.
#[test]
fn poisoned_timing_yields_zero_metrics_not_panic() {
    let timing = Arc::new(Mutex::new(RunTiming::start()));
    let t_for_panic = timing.clone();

    // Simulate a panic while holding the lock — poisons the mutex.
    let _ = thread::spawn(move || {
        let _guard = t_for_panic.lock().expect("test setup: lock should be acquirable");
        panic!("simulated callback panic mid-record");
    })
    .join();

    assert!(timing.is_poisoned(), "test precondition: mutex must be poisoned");

    let payload = done_payload_or_zero(&timing);
    assert_eq!(payload.token_count, 0, "poison degrades token_count to 0");
    assert!(payload.ttft_ms.is_none(), "poison degrades ttft_ms to None");
    assert!(payload.tokens_per_sec.is_none(), "poison degrades tokens_per_sec to None");
}

/// F4: lock_recover() must NOT panic on a poisoned mutex; it returns
/// the inner value (in whatever state the panicking thread left it).
#[test]
fn lock_recover_recovers_poisoned_data() {
    let m: Arc<Mutex<u32>> = Arc::new(Mutex::new(42));
    let m_for_panic = m.clone();
    let _ = thread::spawn(move || {
        let mut g = m_for_panic.lock().expect("test setup");
        *g = 99;
        panic!("poison after mutation");
    })
    .join();

    assert!(m.is_poisoned());
    let g = m.lock_recover();
    assert_eq!(*g, 99, "lock_recover returns the post-mutation value");
}
