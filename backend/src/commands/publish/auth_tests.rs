use super::*;

/// All vault assertions live in ONE test: the in-memory fallback is a shared
/// process-global static, so splitting across parallel tests would race.
#[test]
fn get_falls_back_to_in_memory_when_secure_store_has_no_entry() {
    // Start clean: no secure-store entry, no in-memory token. (delete of a
    // nonexistent entry is a no-op; we never write to the real keychain here.)
    clear_refresh_token();
    assert_eq!(get_refresh_token(), None);

    // Simulate the degrade path (secret service unavailable → token kept in mem):
    // get_refresh_token sees no secure-store entry and returns the in-memory token.
    *mem().lock_recover() = Some("rt_fallback".to_string());
    assert_eq!(get_refresh_token(), Some("rt_fallback".to_string()));

    // Clearing forgets it on both stores — never panics.
    clear_refresh_token();
    assert_eq!(get_refresh_token(), None);
}
