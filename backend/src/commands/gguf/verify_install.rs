use crate::commands::storage::storage::fetch_installed_with_stats;
use crate::errors::{AppError, AppResult};
use std::time::Duration;

/// Poll `/api/tags` with backoff until `name` is registered. Ollama 0.24+
/// streams `{"status":"success"}` from `/api/create` BEFORE the manifest
/// is reflected in `/api/tags`; observed lag is 50–800ms. A one-shot
/// check races and reports a false "silently rolled back".
const DELAYS_MS: &[u64] = &[50, 100, 200, 400, 800, 1500];

pub async fn verify_model_registered(endpoint: &str, name: &str) -> AppResult<()> {
    verify_with_delays(endpoint, name, DELAYS_MS).await
}

pub(crate) async fn verify_with_delays(
    endpoint: &str,
    name: &str,
    delays: &[u64],
) -> AppResult<()> {
    for &d in delays {
        if has_model(endpoint, name).await? {
            return Ok(());
        }
        tokio::time::sleep(Duration::from_millis(d)).await;
    }
    if has_model(endpoint, name).await? {
        return Ok(());
    }
    Err(AppError::Inference(format!(
        "Ollama reported success but `{name}` is not in /api/tags after retries — \
         registration was silently rolled back. Check `~/.ollama/logs/server.log` \
         for the underlying reason."
    )))
}

async fn has_model(endpoint: &str, name: &str) -> AppResult<bool> {
    let models = fetch_installed_with_stats(endpoint)
        .await
        .map_err(|e| AppError::Inference(format!("verify install: {e}")))?;
    Ok(models.iter().any(|m| m.name == name))
}

#[cfg(test)]
#[path = "verify_install_tests.rs"]
mod tests;
