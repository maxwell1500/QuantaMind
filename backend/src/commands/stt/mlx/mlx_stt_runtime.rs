use crate::inference::mlx::server::mlx_runtime::find_available_port;
use reqwest::Client;
use std::time::Duration;

/// MLX-STT dynamic port range start. 8094..=8104 is clear of llama (8081),
/// mlx_lm (8082..=8092), and whisper-server STT (8093).
pub const PORT_BASE: u16 = 8094;
pub const PORT_EXHAUSTED_MSG: &str =
    "STT port range 8094–8104 is in use — stop other STT processes and retry.";

/// Args to launch `mlx_audio.server` on a chosen port. Bound to **127.0.0.1
/// ONLY** — the engine is offline and must never be network-reachable. There is
/// no `--model` at startup: mlx-audio loads the whisper model per request at
/// transcription time. Pure, so the loopback bind is asserted without spawning.
pub fn build_spawn_args(port: u16) -> Vec<String> {
    vec![
        "--host".into(),
        "127.0.0.1".into(),
        "--port".into(),
        port.to_string(),
    ]
}

/// A free port in the MLX-STT range (8094..=8104).
pub fn find_free_port() -> Option<u16> {
    find_available_port(PORT_BASE)
}

/// Reachability of the mlx-audio server on `port`: any HTTP answer on
/// `/v1/models` means it's listening (ready — the model loads per request).
/// 127.0.0.1 only, so this can never reach the cloud.
pub async fn is_reachable(port: u16, timeout_ms: u64) -> bool {
    let Some(c) = Client::builder().timeout(Duration::from_millis(timeout_ms)).build().ok() else {
        return false;
    };
    c.get(format!("http://127.0.0.1:{port}/v1/models")).send().await.is_ok()
}

#[cfg(test)]
mod tests {
    use super::*;

    // This offline guard lives in the runtime (not only in stt_probe) so a future
    // edit to the spawn args can't silently introduce a network-reachable bind.
    #[test]
    fn spawn_args_bind_loopback_only_never_0_0_0_0() {
        let args = build_spawn_args(8094);
        assert_eq!(args, vec!["--host", "127.0.0.1", "--port", "8094"]);
        assert!(args.iter().any(|a| a == "127.0.0.1"), "must bind loopback");
        assert!(!args.iter().any(|a| a.contains("0.0.0.0")), "must never bind 0.0.0.0 (offline)");
        assert!(!args.iter().any(|a| a == "--model"), "no model at startup — per-request");
    }

    #[test]
    fn free_port_is_in_the_stt_range() {
        if let Some(p) = find_free_port() {
            assert!((8094..=8104).contains(&p));
        }
    }
}
