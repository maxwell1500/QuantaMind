use std::sync::{Mutex, MutexGuard};

/// Lock a `Mutex` without panicking on poison. If another thread panicked
/// while holding the lock, the data is still accessible and we return
/// what's there. Prefer this over `.lock().unwrap()` everywhere unless
/// poison is a programming bug that should crash the process.
///
/// For state where poison should produce a sentinel/zero output instead
/// of returning poisoned data (e.g. metrics), match on `lock()` directly
/// rather than using this helper.
pub trait MutexExt<T> {
    fn lock_recover(&self) -> MutexGuard<'_, T>;
}

impl<T> MutexExt<T> for Mutex<T> {
    fn lock_recover(&self) -> MutexGuard<'_, T> {
        self.lock().unwrap_or_else(|e| e.into_inner())
    }
}
