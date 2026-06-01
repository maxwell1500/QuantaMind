use crate::commands::system::health::HealthStatus;
use crate::inference::mlx::server::mlx_endpoint::mlx_endpoint;
use reqwest::Client;
use std::time::Duration;

const PROBE_TIMEOUT: Duration = Duration::from_millis(2500);

/// MLX runs only on Apple Silicon. Off it, mlx_lm.server can't exist, so health
/// is reported unavailable without any HTTP call.
fn mlx_supported() -> bool {
    cfg!(all(target_os = "macos", target_arch = "aarch64"))
}

/// Probe an `mlx_lm.server` via OpenAI's `GET /v1/models` (the only reliable
/// liveness endpoint — no `/api/version` or `/health`). mlx_lm reports no
/// version string here, so `version` stays `None`.
pub async fn mlx_health(endpoint: &str) -> HealthStatus {
    if !mlx_supported() {
        return HealthStatus { available: false, version: None };
    }
    let client = match Client::builder().timeout(PROBE_TIMEOUT).build() {
        Ok(c) => c,
        Err(_) => return HealthStatus { available: false, version: None },
    };
    match client.get(format!("{endpoint}/v1/models")).send().await {
        Ok(r) if r.status().is_success() => HealthStatus { available: true, version: None },
        _ => HealthStatus { available: false, version: None },
    }
}

#[tauri::command]
pub async fn check_mlx_health() -> HealthStatus {
    mlx_health(&mlx_endpoint()).await
}

#[cfg(test)]
#[path = "health_mlx_tests.rs"]
mod tests;
