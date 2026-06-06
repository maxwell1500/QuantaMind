use crate::commands::publish::cohort::cohort_key;
use crate::commands::publish::preview_cmd::build_preview;
use crate::commands::publish::auth_state::AuthState;
use crate::commands::publish::identity::token::access_token;
use crate::commands::system::hardware::snapshot;
use crate::errors::{AppError, AppResult};
use crate::inference::eval::readiness::types::ModelVerdict;
use crate::inference::http::http::{body_or_note, probe_client};
use crate::persistence::publish::row::PublishRow;
use reqwest::StatusCode;
use serde::{Deserialize, Serialize};

/// Production publish API base. Injectable in tests via the inner fn; the command
/// uses this const. (Placeholder host until the backend repo is stood up.)
pub const PUBLISH_API: &str = "https://api.quantamind.co";

/// What the UI does next — every server status maps to one of these, so a failed
/// publish never throws an opaque error that could freeze the dialog.
#[derive(Debug, Serialize, PartialEq)]
#[serde(tag = "kind", rename_all = "snake_case")]
pub enum PublishOutcome {
    Ok { board_url: String },
    NeedsAuth,
    Invalid { index: usize },
    UpdateRequired,
    RateLimited,
}

#[derive(Deserialize)]
struct NonceResp {
    nonce: String,
}
#[derive(Deserialize)]
struct BoardResp {
    board_url: String,
}
#[derive(Deserialize)]
struct InvalidResp {
    index: usize,
}

#[derive(Serialize)]
struct PublishRequest<'a> {
    nonce: String,
    hash: &'a str,
    results: &'a [PublishRow],
    #[serde(skip_serializing_if = "Option::is_none")]
    link: Option<&'a str>,
}

/// One batch = one fresh nonce + one POST. The client always GETs a new nonce per
/// attempt (the server burns it on a 422). Status → `PublishOutcome`. Base URL is
/// a param so `mockito` drives the tests.
pub async fn publish_batch(base: &str, token: &str, rows: &[PublishRow], hash: &str, link: Option<&str>) -> AppResult<PublishOutcome> {
    let client = probe_client()?;
    let nonce_resp = client.get(format!("{base}/publish/nonce")).bearer_auth(token).send().await.map_err(net)?;
    if nonce_resp.status() == StatusCode::UNAUTHORIZED {
        return Ok(PublishOutcome::NeedsAuth);
    }
    if !nonce_resp.status().is_success() {
        return Err(AppError::Internal(format!("nonce {}: {}", nonce_resp.status(), body_or_note(nonce_resp).await)));
    }
    let nonce = nonce_resp.json::<NonceResp>().await.map_err(net)?.nonce;

    let body = PublishRequest { nonce, hash, results: rows, link };
    let resp = client.post(format!("{base}/publish")).bearer_auth(token).json(&body).send().await.map_err(net)?;
    match resp.status() {
        StatusCode::OK => Ok(PublishOutcome::Ok { board_url: resp.json::<BoardResp>().await.map_err(net)?.board_url }),
        StatusCode::UNAUTHORIZED => Ok(PublishOutcome::NeedsAuth),
        StatusCode::UNPROCESSABLE_ENTITY => Ok(PublishOutcome::Invalid { index: resp.json::<InvalidResp>().await.map_err(net)?.index }),
        StatusCode::UPGRADE_REQUIRED => Ok(PublishOutcome::UpdateRequired),
        StatusCode::TOO_MANY_REQUESTS => Ok(PublishOutcome::RateLimited),
        other => Err(AppError::Internal(format!("publish {other}: {}", body_or_note(resp).await))),
    }
}

fn net(e: reqwest::Error) -> AppError {
    AppError::Internal(e.to_string())
}

/// Publish the current verdicts to the community board. Builds the same canonical
/// payload the dialog previewed, resolves an access token (→ `NeedsAuth` if none),
/// and sends one batch. A 401 clears the cached token so the next try re-auths.
#[tauri::command]
pub async fn publish_to_board(state: tauri::State<'_, AuthState>, verdicts: Vec<ModelVerdict>, link: Option<String>) -> Result<PublishOutcome, AppError> {
    let preview = build_preview(&verdicts, cohort_key(&snapshot()), env!("CARGO_PKG_VERSION"))?;
    if let Some(inv) = preview.invalid {
        return Ok(PublishOutcome::Invalid { index: inv.index });
    }
    let token = match access_token(PUBLISH_API, &state).await {
        Ok(t) => t,
        Err(_) => return Ok(PublishOutcome::NeedsAuth),
    };
    let outcome = publish_batch(PUBLISH_API, &token, &preview.rows, &preview.hash, link.as_deref()).await?;
    if outcome == PublishOutcome::NeedsAuth {
        state.clear();
    }
    Ok(outcome)
}

#[cfg(test)]
#[path = "publish_cmd_tests.rs"]
mod tests;
