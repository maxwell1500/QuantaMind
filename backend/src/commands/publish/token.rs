use crate::commands::publish::auth::{get_refresh_token, store_refresh_token};
use crate::errors::{AppError, AppResult};
use crate::inference::http::http::{body_or_note, probe_client};
use crate::sync::MutexExt;
use serde::Deserialize;
use std::sync::Mutex;

/// The token endpoint response (OAuth-style). `refresh_token` ROTATES on every
/// call (the server revokes the old one), so we always re-store what comes back.
#[derive(Debug, Clone, Deserialize)]
pub struct Tokens {
    pub access_token: String,
    pub refresh_token: String,
    #[serde(default)]
    pub expires_in: u64,
}

/// Cached short-lived access token for the session. Managed by Tauri; the refresh
/// token lives in the OS vault (`auth.rs`), never here.
#[derive(Default)]
pub struct AuthState {
    access: Mutex<Option<String>>,
}

/// The caller must (re)authenticate — no usable refresh token, or the refresh
/// itself failed. Maps to the publish flow's "trigger login" path.
#[derive(Debug, PartialEq)]
pub struct NeedsAuth;

async fn post_token(base: &str, path: &str, form: &[(&str, &str)]) -> AppResult<Tokens> {
    let resp = probe_client()?
        .post(format!("{base}{path}"))
        .form(form)
        .send()
        .await
        .map_err(|e| AppError::Internal(e.to_string()))?;
    if !resp.status().is_success() {
        let status = resp.status();
        return Err(AppError::Internal(format!("token endpoint {status}: {}", body_or_note(resp).await)));
    }
    resp.json::<Tokens>().await.map_err(|e| AppError::Internal(e.to_string()))
}

/// Exchange a PKCE authorization code for tokens. Pure network — storage is the
/// caller's job (keeps this testable without touching the OS keychain).
pub async fn exchange_code(base: &str, code: &str, verifier: &str) -> AppResult<Tokens> {
    post_token(base, "/token", &[("grant_type", "authorization_code"), ("code", code), ("code_verifier", verifier)]).await
}

/// Trade the stored refresh token for a new access token (and a rotated refresh).
pub async fn refresh_access(base: &str, refresh: &str) -> AppResult<Tokens> {
    post_token(base, "/token/refresh", &[("grant_type", "refresh_token"), ("refresh_token", refresh)]).await
}

/// A usable access token: the cached one, else a refresh using the vault's refresh
/// token (rotating + re-storing it), else `NeedsAuth`. Never panics.
pub async fn access_token(base: &str, state: &AuthState) -> Result<String, NeedsAuth> {
    if let Some(t) = state.access.lock_recover().clone() {
        return Ok(t);
    }
    let refresh = get_refresh_token().ok_or(NeedsAuth)?;
    let tokens = refresh_access(base, &refresh).await.map_err(|_| NeedsAuth)?;
    store_refresh_token(&tokens.refresh_token);
    *state.access.lock_recover() = Some(tokens.access_token.clone());
    Ok(tokens.access_token)
}

/// Drop the cached access token (e.g. after a 401) so the next call refreshes.
pub fn clear_access(state: &AuthState) {
    *state.access.lock_recover() = None;
}

#[cfg(test)]
#[path = "token_tests.rs"]
mod tests;
