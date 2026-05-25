use crate::errors::{AppError, AppResult};
use reqwest::Client;
use std::time::Duration;

const CONNECT_TIMEOUT: Duration = Duration::from_secs(60);
const PROBE_TIMEOUT: Duration = Duration::from_secs(30);
const USER_AGENT: &str = concat!("quantamind/", env!("CARGO_PKG_VERSION"));

/// HTTP client for short request/response cycles where a stalled
/// endpoint should fail fast rather than wedge the install. Use for
/// HEAD probes, `/api/version`, `/api/tags`, `/api/delete`, and
/// blob existence checks. UA matters for HF JSON endpoints which can
/// 400 on empty/missing User-Agent behind Cloudflare.
pub fn probe_client() -> AppResult<Client> {
    Client::builder()
        .user_agent(USER_AGENT)
        .connect_timeout(CONNECT_TIMEOUT)
        .timeout(PROBE_TIMEOUT)
        .build()
        .map_err(|e| AppError::Internal(e.to_string()))
}

/// HTTP client for long-lived streaming requests (HF download, blob
/// upload, Ollama NDJSON pull/create/generate). Bounded only by
/// connect timeout — body has no deadline so a slow connection can
/// finish a multi-GB transfer. Stalls are surfaced via progress
/// events + Cancel.
pub fn streaming_client() -> AppResult<Client> {
    Client::builder()
        .user_agent(USER_AGENT)
        .connect_timeout(CONNECT_TIMEOUT)
        .build()
        .map_err(|e| AppError::Internal(e.to_string()))
}
