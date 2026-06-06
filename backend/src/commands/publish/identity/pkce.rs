use crate::errors::{AppError, AppResult};
use base64::engine::general_purpose::URL_SAFE_NO_PAD;
use base64::Engine as _;
use sha2::{Digest, Sha256};
use tokio::io::{AsyncReadExt, AsyncWriteExt};
use tokio::net::TcpListener;
use uuid::Uuid;

/// The S256 code challenge for a verifier: base64url(no-pad) of SHA-256(verifier).
/// Pure + deterministic so the client and the auth server agree byte-for-byte.
pub fn pkce_challenge(verifier: &str) -> String {
    URL_SAFE_NO_PAD.encode(Sha256::digest(verifier.as_bytes()))
}

/// A fresh (verifier, challenge) pair. The verifier is two v4 UUIDs in hex (64
/// chars) — high-entropy and within PKCE's 43–128-char range; no new RNG dep.
pub fn pkce_pair() -> (String, String) {
    let verifier = format!("{}{}", Uuid::new_v4().simple(), Uuid::new_v4().simple());
    let challenge = pkce_challenge(&verifier);
    (verifier, challenge)
}

/// Extract `code` from the raw redirect request line ("GET /callback?code=…&state=…
/// HTTP/1.1"). Returns `None` if absent. Pure — the parsing the loopback relies on.
pub fn parse_code_from_request(raw: &str) -> Option<String> {
    let path = raw.split_whitespace().nth(1)?; // the request-target
    let query = path.split_once('?')?.1;
    query.split('&').find_map(|kv| kv.strip_prefix("code=").map(|c| c.to_string()))
}

const REDIRECT_PAGE: &str = "<html><body>You can close this tab and return to QuantaMind.</body></html>";

/// Block on the single OAuth loopback redirect, return its `code`, and reply with a
/// "you can close this tab" page. The listener binds an ephemeral 127.0.0.1 port
/// (caller reads `local_addr()` to build the redirect_uri).
pub async fn await_redirect(listener: TcpListener) -> AppResult<String> {
    let (mut stream, _) = listener.accept().await.map_err(|e| AppError::Io(e.to_string()))?;
    let mut buf = [0u8; 4096];
    let n = stream.read(&mut buf).await.map_err(|e| AppError::Io(e.to_string()))?;
    let code = parse_code_from_request(&String::from_utf8_lossy(&buf[..n]));
    let resp = format!(
        "HTTP/1.1 200 OK\r\nContent-Type: text/html\r\nContent-Length: {}\r\nConnection: close\r\n\r\n{}",
        REDIRECT_PAGE.len(),
        REDIRECT_PAGE
    );
    let _ = stream.write_all(resp.as_bytes()).await;
    code.ok_or_else(|| AppError::Validation("OAuth redirect carried no code".into()))
}

#[cfg(test)]
#[path = "pkce_tests.rs"]
mod tests;
