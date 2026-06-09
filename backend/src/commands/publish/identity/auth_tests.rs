use super::*;

/// All vault assertions live in ONE test: the in-memory fallback is a shared
/// process-global static, so splitting across parallel tests would race.
#[test]
fn get_falls_back_to_in_memory_when_secure_store_has_no_entry() {
    let _guard = vault_test_lock();
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

    // Write-through: store ALWAYS keeps a session copy, so the token is readable even
    // if the keychain is later denied. (The keychain write may succeed or degrade
    // depending on the host; either way mem holds it — that's the un-bricking guarantee.)
    let outcome = store_refresh_token("rt_session");
    assert!(matches!(outcome, Persisted::Keychain | Persisted::SessionOnly));
    assert_eq!(*mem().lock_recover(), Some("rt_session".to_string()));

    // Memory-first read: a populated session copy is returned without touching the
    // keychain (the source of the repeat prompts). Overwrite mem to prove precedence.
    *mem().lock_recover() = Some("rt_mem_wins".to_string());
    assert_eq!(get_refresh_token(), Some("rt_mem_wins".to_string()));

    clear_refresh_token();
    assert_eq!(get_refresh_token(), None);
}
