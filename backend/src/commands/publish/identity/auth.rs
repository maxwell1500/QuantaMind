use crate::sync::MutexExt;
use std::sync::{Mutex, OnceLock};

const SERVICE: &str = "quantamind";
const REFRESH_USER: &str = "publish-refresh";

/// Process-lifetime fallback for the refresh token when the OS secure store is
/// unavailable (headless Linux with no secret service, a locked keychain). The
/// session works for this launch; the user re-logs in next time. Mirrors the
/// `OnceLock<Mutex<_>>` pattern in `system/hardware.rs`.
fn mem() -> &'static Mutex<Option<String>> {
    static MEM_TOKEN: OnceLock<Mutex<Option<String>>> = OnceLock::new();
    MEM_TOKEN.get_or_init(|| Mutex::new(None))
}

/// Whether the refresh token reached durable OS storage or only the session copy.
/// `SessionOnly` (keychain locked/denied/absent) means the user stays signed in for
/// this launch but may need to sign in again next time — surfaced to the UI so the
/// dead-button/denied-keychain state is never silent.
#[derive(Debug, Clone, Copy, PartialEq)]
pub enum Persisted {
    Keychain,
    SessionOnly,
}

/// Persist the rotated refresh token. ALWAYS keep a session copy in memory first, so a
/// later keychain prompt that the user denies can never strand the token; then make a
/// best-effort durable write to the OS secure store. Never panics.
pub fn store_refresh_token(token: &str) -> Persisted {
    *mem().lock_recover() = Some(token.to_string());
    match keyring::Entry::new(SERVICE, REFRESH_USER).and_then(|e| e.set_password(token)) {
        Ok(()) => Persisted::Keychain,
        Err(_) => Persisted::SessionOnly,
    }
}

/// The stored refresh token, or `None` if the user never logged in. Prefers the
/// in-memory session copy (so we never re-prompt the keychain once we have it this
/// launch); only on a cold session does it read the secure store, caching a hit into
/// memory so subsequent calls this launch stay prompt-free.
pub fn get_refresh_token() -> Option<String> {
    if let Some(t) = mem().lock_recover().clone() {
        return Some(t);
    }
    match keyring::Entry::new(SERVICE, REFRESH_USER).and_then(|e| e.get_password()) {
        Ok(t) => {
            *mem().lock_recover() = Some(t.clone());
            Some(t)
        }
        Err(_) => None,
    }
}

/// Forget the refresh token on logout/revoke — best-effort on both stores.
pub fn clear_refresh_token() {
    if let Ok(e) = keyring::Entry::new(SERVICE, REFRESH_USER) {
        let _ = e.delete_credential();
    }
    *mem().lock_recover() = None;
}

/// Serializes the few tests that mutate the process-global vault (here + in
/// `token.rs`) so their parallel runs don't clobber each other's state.
#[cfg(test)]
pub(crate) fn vault_test_lock() -> std::sync::MutexGuard<'static, ()> {
    static LOCK: OnceLock<Mutex<()>> = OnceLock::new();
    LOCK.get_or_init(|| Mutex::new(())).lock_recover()
}

#[cfg(test)]
#[path = "auth_tests.rs"]
mod tests;
