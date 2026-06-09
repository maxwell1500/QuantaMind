use crate::commands::stt::stt_runtime::{is_ready, PROBE_TIMEOUT_MS};
use crate::commands::system::health::HealthStatus;

/// Health of the whisper-server STT sidecar, in the shared `HealthStatus` shape
/// the Ollama/MLX/llama probes return so the frontend can poll all four
/// uniformly. `available` reflects the server's own readiness — `GET /health`
/// == 200, i.e. the model is loaded; a still-loading server (503) reports
/// not-available because audio can't be sent yet. whisper-server reports no
/// version string → `version: None` (no fabricated metrics).
#[tauri::command]
pub async fn check_whisper_health() -> HealthStatus {
    HealthStatus { available: is_ready(PROBE_TIMEOUT_MS).await, version: None }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[tokio::test]
    async fn reports_unavailable_and_never_a_fake_version_when_down() {
        // No whisper-server on 8093 in the test environment.
        let h = check_whisper_health().await;
        assert!(!h.available, "nothing listening on the STT port");
        assert!(h.version.is_none(), "whisper-server has no version — never fabricated");
    }
}
