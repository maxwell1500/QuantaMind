use crate::errors::{AppError, AppResult};
use std::path::Path;
use tauri::{AppHandle, Manager};

/// Regenerable caches under `app_config_dir`, safe to wipe to reclaim space.
/// Each is rebuilt on the next run. User-authored data (`evals/`, `readiness/`)
/// and settings (`user_settings.yaml`, `model_settings.yaml`) are deliberately
/// absent from this allow-list so a cache clear never destroys them.
const CACHE_DIRS: &[&str] = &["jobs", "history", "batch_reports", "traces", "cliff"];

/// Regenerable cache files (the recent-workspace list is navigation history).
const CACHE_FILES: &[&str] = &["recent_workspaces.yaml"];

/// Sum the byte size of every file under `dir` (recursively). Missing dir → 0.
fn dir_size(dir: &Path) -> u64 {
    let Ok(entries) = std::fs::read_dir(dir) else {
        return 0;
    };
    entries
        .flatten()
        .map(|e| match e.file_type() {
            Ok(t) if t.is_dir() => dir_size(&e.path()),
            Ok(_) => e.metadata().map(|m| m.len()).unwrap_or(0),
            Err(_) => 0,
        })
        .sum()
}

/// Delete every regenerable cache under `base`, returning the total bytes freed
/// (measured from on-disk file sizes before removal). A target that doesn't
/// exist is skipped cleanly — clearing an already-empty cache is not an error.
pub fn clear_cache_in(base: &Path) -> AppResult<u64> {
    let mut freed = 0u64;
    for name in CACHE_DIRS {
        let path = base.join(name);
        if path.is_dir() {
            freed += dir_size(&path);
            std::fs::remove_dir_all(&path).map_err(|e| AppError::Io(e.to_string()))?;
        }
    }
    for name in CACHE_FILES {
        let path = base.join(name);
        if path.is_file() {
            freed += std::fs::metadata(&path).map(|m| m.len()).unwrap_or(0);
            std::fs::remove_file(&path).map_err(|e| AppError::Io(e.to_string()))?;
        }
    }
    Ok(freed)
}

/// Clear regenerable app caches (eval history, batch reports, job logs, traces,
/// context-cliff measurements, recent-workspace list). Returns bytes freed.
/// Downloaded models, custom eval collections, readiness profiles, and user
/// settings are never touched.
#[tauri::command]
pub fn clear_app_cache(app: AppHandle) -> Result<u64, AppError> {
    let base = app.path().app_config_dir().map_err(|e| AppError::Io(e.to_string()))?;
    clear_cache_in(&base)
}

#[cfg(test)]
#[path = "storage_cache_tests.rs"]
mod tests;
