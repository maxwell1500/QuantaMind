use crate::commands::publish::auth::store_refresh_token;
use crate::commands::publish::auth_state::AuthState;
use crate::commands::publish::pkce::{await_redirect, pkce_pair};
use crate::commands::publish::publish_cmd::PUBLISH_API;
use crate::commands::publish::token::exchange_code;
use crate::errors::AppError;
use std::time::Duration;
use tauri::{AppHandle, State};
use tauri_plugin_shell::ShellExt;
use tokio::net::TcpListener;

/// How long to wait for the user to complete the browser sign-in before giving up.
const LOGIN_TIMEOUT: Duration = Duration::from_secs(300);

/// PKCE browser sign-in: mint a verifier/challenge, bind an ephemeral loopback
/// listener, open the system browser to `/authorize`, catch the redirect code,
/// exchange it for tokens, and store the rotated refresh token + cache the access
/// token. Thin glue over the unit-tested pkce/redirect/exchange pieces. A timeout
/// keeps a never-completed sign-in from hanging the listener forever.
// `Shell::open` is deprecated in favor of tauri-plugin-opener; we stay on the
// already-present shell plugin (dep-light) — revisit if we adopt opener elsewhere.
#[allow(deprecated)]
#[tauri::command]
pub async fn start_login(app: AppHandle, state: State<'_, AuthState>) -> Result<(), AppError> {
    let (verifier, challenge) = pkce_pair();
    let listener = TcpListener::bind("127.0.0.1:0").await.map_err(|e| AppError::Io(e.to_string()))?;
    let port = listener.local_addr().map_err(|e| AppError::Io(e.to_string()))?.port();
    let redirect = format!("http://127.0.0.1:{port}/callback");

    let url = reqwest::Url::parse_with_params(
        &format!("{PUBLISH_API}/authorize"),
        &[
            ("response_type", "code"),
            ("scope", "publish"),
            ("code_challenge_method", "S256"),
            ("code_challenge", &challenge),
            ("redirect_uri", &redirect),
        ],
    )
    .map_err(|e| AppError::Internal(e.to_string()))?;

    app.shell().open(url.to_string(), None).map_err(|e| AppError::Internal(e.to_string()))?;

    let code = tokio::time::timeout(LOGIN_TIMEOUT, await_redirect(listener))
        .await
        .map_err(|_| AppError::Validation("sign-in timed out — please try again".into()))??;

    let tokens = exchange_code(PUBLISH_API, &code, &verifier).await?;
    store_refresh_token(&tokens.refresh_token);
    state.set(tokens.access_token);
    Ok(())
}
