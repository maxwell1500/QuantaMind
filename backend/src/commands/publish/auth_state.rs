use crate::sync::MutexExt;
use std::sync::Mutex;

/// Cached short-lived access token for the publish session. Kept here (un-gated)
/// so `lib.rs` can `.manage()` it in every build; the refresh token lives in the
/// OS vault (`auth.rs`), never in this struct. The auth/publish code that fills it
/// compiles out of enterprise builds — an unused empty cache is harmless.
#[derive(Default)]
pub struct AuthState {
    access: Mutex<Option<String>>,
}

impl AuthState {
    pub fn cached(&self) -> Option<String> {
        self.access.lock_recover().clone()
    }
    pub fn set(&self, token: String) {
        *self.access.lock_recover() = Some(token);
    }
    /// Drop the cached access token (e.g. after a 401) so the next call refreshes.
    pub fn clear(&self) {
        *self.access.lock_recover() = None;
    }
}
