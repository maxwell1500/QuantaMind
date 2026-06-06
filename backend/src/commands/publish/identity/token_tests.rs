use super::*;
use crate::commands::publish::identity::auth::{clear_refresh_token, vault_test_lock};

const TOKENS_JSON: &str = r#"{"access_token":"at_new","refresh_token":"rt_rotated","expires_in":900}"#;

#[tokio::test]
async fn exchange_code_swaps_a_code_for_tokens() {
    let mut s = mockito::Server::new_async().await;
    let m = s.mock("POST", "/token").with_status(200).with_header("content-type", "application/json").with_body(TOKENS_JSON).create_async().await;
    let t = exchange_code(&s.url(), "dummy_code", "verifier").await.expect("exchange ok");
    assert_eq!(t.access_token, "at_new");
    assert_eq!(t.refresh_token, "rt_rotated");
    m.assert_async().await;
}

#[tokio::test]
async fn refresh_access_rotates_the_refresh_token() {
    let mut s = mockito::Server::new_async().await;
    s.mock("POST", "/token/refresh").with_status(200).with_header("content-type", "application/json").with_body(TOKENS_JSON).create_async().await;
    let t = refresh_access(&s.url(), "rt_old").await.expect("refresh ok");
    assert_eq!(t.refresh_token, "rt_rotated"); // a NEW refresh token came back
    assert_eq!(t.access_token, "at_new");
}

#[tokio::test]
async fn access_token_returns_the_cached_token_without_touching_the_network() {
    let state = AuthState::default();
    state.set("cached_at".to_string());
    // An unroutable base proves no network call happens on the cached path.
    let t = access_token("http://127.0.0.1:1", &state).await.expect("cached");
    assert_eq!(t, "cached_at");
}

#[tokio::test]
async fn access_token_is_needs_auth_with_no_cache_and_no_refresh_token() {
    let _guard = vault_test_lock();
    clear_refresh_token();
    let state = AuthState::default();
    assert_eq!(access_token("http://127.0.0.1:1", &state).await, Err(NeedsAuth));
    clear_refresh_token();
}
