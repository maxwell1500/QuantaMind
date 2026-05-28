use quantamind_lib::commands::prompt::prompt_payloads::done_payload;
use quantamind_lib::metrics::timing::RunTiming;
use quantamind_lib::sync::MutexExt;
use std::sync::{Arc, Mutex};
use std::thread;

/// F4: poisoning the timing mutex (e.g. a panic in the per-token callback)
/// must not crash subsequent reads, and the payload must reflect the data
/// actually recorded before the panic — never a fabricated zero, which is
/// indistinguishable from a real empty run (see docs/robustness.md).
#[test]
fn poisoned_timing_recovers_recorded_metrics_not_zero() {
    let timing = Arc::new(Mutex::new(RunTiming::start()));
    {
        let mut g = timing.lock().expect("setup");
        g.record_token();
        g.record_token();
    }
    let t_for_panic = timing.clone();

    // Simulate a panic while holding the lock — poisons the mutex.
    let _ = thread::spawn(move || {
        let _guard = t_for_panic.lock().expect("test setup: lock should be acquirable");
        panic!("simulated callback panic mid-record");
    })
    .join();

    assert!(timing.is_poisoned(), "test precondition: mutex must be poisoned");

    let payload = done_payload(&timing);
    assert_eq!(payload.token_count, 2, "recovers the real recorded count, not a fabricated 0");
    assert!(payload.ttft_ms.is_some(), "recovers the recorded ttft, not None");
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
