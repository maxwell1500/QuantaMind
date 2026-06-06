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

/// Persist the rotated refresh token in the OS secure store; on ANY keyring error
/// degrade to the in-memory fallback rather than panicking the thread.
pub fn store_refresh_token(token: &str) {
    match keyring::Entry::new(SERVICE, REFRESH_USER).and_then(|e| e.set_password(token)) {
        Ok(()) => {}
        Err(_) => *mem().lock_recover() = Some(token.to_string()),
    }
}

/// The stored refresh token, or `None` if the user never logged in. Reads the
/// secure store first; on any error falls back to the in-memory token.
pub fn get_refresh_token() -> Option<String> {
    match keyring::Entry::new(SERVICE, REFRESH_USER).and_then(|e| e.get_password()) {
        Ok(t) => Some(t),
        Err(_) => mem().lock_recover().clone(),
    }
}

/// Forget the refresh token on logout/revoke — best-effort on both stores.
pub fn clear_refresh_token() {
    if let Ok(e) = keyring::Entry::new(SERVICE, REFRESH_USER) {
        let _ = e.delete_credential();
    }
    *mem().lock_recover() = None;
}

#[cfg(test)]
#[path = "auth_tests.rs"]
mod tests;
