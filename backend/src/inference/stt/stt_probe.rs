use crate::errors::{AppError, AppResult};
use crate::inference::http::http::probe_client;
use std::time::Duration;

/// How long to wait for the local STT server to answer before failing loud.
const REACH_TIMEOUT: Duration = Duration::from_secs(5);

/// Whether `base`'s host is the loopback interface. The STT layer is offline:
/// every transcribe/probe path must target 127.0.0.1 so an OpenAI-compatible
/// engine (whisper-server, faster-whisper) can never silently fall back to
/// api.openai.com. This is the guardrail seam reused by later engines.
pub fn is_loopback(base: &str) -> bool {
    let authority = base.split("://").nth(1).unwrap_or(base);
    let authority = authority.split('/').next().unwrap_or("");
    let host = if authority.starts_with('[') {
        // [::1]:port — keep the bracketed IPv6 host
        authority.split(']').next().unwrap_or("").trim_start_matches('[')
    } else {
        authority.rsplit_once(':').map(|(h, _)| h).unwrap_or(authority)
    };
    host == "localhost" || host == "::1" || host.starts_with("127.")
}

/// Pre-flight a local STT endpoint: refuse anything that isn't loopback, then
/// confirm it answers HTTP within 5s. ANY HTTP response (even 503-loading)
/// means reachable; a transport error (refused/unroutable) or a non-loopback
/// host fails loud with an actionable message — never a silent cloud reach,
/// never a hang. Mirrors `login_cmd::ensure_reachable`, in the domain layer.
pub async fn ensure_local_reachable(base: &str, path: &str) -> AppResult<()> {
    if !is_loopback(base) {
        return Err(AppError::Validation(format!(
            "STT must stay on this machine, but {base} isn't a loopback address — \
             refusing to reach a remote endpoint."
        )));
    }
    let probe = probe_client()?.get(format!("{base}{path}")).send();
    match tokio::time::timeout(REACH_TIMEOUT, probe).await {
        Ok(Ok(_)) => Ok(()),
        _ => Err(AppError::Validation(format!(
            "Can't reach the local STT server at {base} — is it running?"
        ))),
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use mockito::Server;

    #[test]
    fn loopback_hosts_are_recognized() {
        for ok in [
            "http://127.0.0.1:8093",
            "http://localhost:8093",
            "http://127.0.0.1",
            "http://127.1.2.3:80",
            "http://[::1]:8093",
        ] {
            assert!(is_loopback(ok), "{ok} should be loopback");
        }
    }

    #[test]
    fn remote_hosts_are_rejected() {
        for bad in [
            "http://10.0.0.1:9",
            "http://192.168.1.5:8093",
            "https://api.openai.com",
            "http://example.com:8093",
        ] {
            assert!(!is_loopback(bad), "{bad} should not be loopback");
        }
    }

    #[tokio::test]
    async fn a_remote_base_is_refused_before_any_network_call() {
        let err = ensure_local_reachable("https://api.openai.com", "/health").await.unwrap_err();
        assert!(format!("{err:?}").contains("loopback"), "got {err:?}");
    }

    #[tokio::test]
    async fn a_down_local_server_fails_loud() {
        let err = ensure_local_reachable("http://127.0.0.1:1", "/health").await.unwrap_err();
        assert!(format!("{err:?}").contains("Can't reach"), "got {err:?}");
    }

    #[tokio::test]
    async fn a_reachable_local_server_passes() {
        let mut srv = Server::new_async().await;
        let _m = srv.mock("GET", "/health").with_status(200).create_async().await;
        // mockito binds to 127.0.0.1, so it clears the loopback guard.
        assert!(ensure_local_reachable(&srv.url(), "/health").await.is_ok());
    }
}
