use crate::commands::stt::stt_runtime::{is_ready, PROBE_TIMEOUT_MS};
use crate::commands::stt::stt_server_types::SttServerState;
use crate::commands::system::health::HealthStatus;
use crate::errors::AppError;

/// Health of the whisper-server STT sidecar, in the shared `HealthStatus` shape
/// the Ollama/MLX/llama probes return so the frontend can poll all four
/// uniformly. `available` is true only when the server is ready (`GET /health`
/// == 200, model loaded) **and the app owns the live child**. A foreign or
/// orphaned whisper-server on the port also answers `/health`, but the app
/// refuses to transcribe against a process it didn't start (the `running_model`
/// ownership check), so a stranger on the port must read as *not* available —
/// otherwise the UI shows a green "running" server that can't transcribe, and
/// `stop` looks like it "auto-restarts" as the port poll keeps re-detecting the
/// stranger. whisper-server reports no version → `version: None`.
#[tauri::command]
pub async fn check_whisper_health(stt: tauri::State<'_, SttServerState>) -> Result<HealthStatus, AppError> {
    // Read ownership (cheap, non-async) before the probe so the State guard isn't
    // held across the await. Infallible — Result is required because the command
    // takes a reference input; always Ok, transparent to the frontend.
    let owned = stt.is_alive();
    Ok(whisper_health(owned).await)
}

/// The decision split out from Tauri state so it's testable: the port probe only
/// matters once a child of *ours* is alive, so owning nothing short-circuits it.
async fn whisper_health(owned: bool) -> HealthStatus {
    let available = owned && is_ready(PROBE_TIMEOUT_MS).await;
    HealthStatus { available, version: None }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[tokio::test]
    async fn unavailable_when_we_own_nothing_even_if_the_port_answers() {
        // owned=false short-circuits the probe → never available, regardless of
        // whether a foreign/orphaned whisper-server happens to hold the port.
        let h = whisper_health(false).await;
        assert!(!h.available, "a server we don't own is not available to us");
        assert!(h.version.is_none(), "whisper-server has no version — never fabricated");
    }
}
