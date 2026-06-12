use crate::commands::storage::storage::fetch_installed_with_stats;
use crate::commands::storage::storage_disk::{compute_disk_usage, models_dir};
use crate::commands::storage::storage_types::DiskUsage;
use crate::errors::AppError;

const DEFAULT_OLLAMA: &str = "http://localhost:11434";

/// Disk usage for `endpoint`. Storage info (free/total) never depends on the
/// model runtime, so an unreachable Ollama only zeroes the model-bytes sum
/// instead of failing the whole panel with "Ollama is not running".
pub async fn disk_usage_for(endpoint: &str) -> DiskUsage {
    let sum: u64 = fetch_installed_with_stats(endpoint)
        .await
        .map(|models| models.iter().map(|m| m.size_bytes).sum())
        .unwrap_or(0);
    compute_disk_usage(&models_dir(), sum)
}

#[tauri::command]
pub async fn get_disk_usage() -> Result<DiskUsage, AppError> {
    Ok(disk_usage_for(DEFAULT_OLLAMA).await)
}

#[cfg(test)]
#[path = "storage_usage_tests.rs"]
mod tests;
