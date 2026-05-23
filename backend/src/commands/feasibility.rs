use crate::commands::storage_disk::{compute_disk_usage, models_dir};
use crate::errors::AppError;
use serde::Serialize;

// 2GB minimum — leaves room for OS swap and app caches.
pub const BLOCK_THRESHOLD_BYTES: u64 = 2 * 1024 * 1024 * 1024;
// 10GB warning — covers the user's other work in the next week.
pub const WARN_THRESHOLD_BYTES: u64 = 10 * 1024 * 1024 * 1024;
// 5% safety margin on top of the catalog's estimated size — Ollama
// reports an approximation, real downloads sometimes weigh more.
pub const SAFETY_MARGIN_PCT: u64 = 5;

#[derive(Serialize, Clone, Debug, PartialEq)]
#[serde(tag = "kind", rename_all = "snake_case")]
pub enum InstallFeasibility {
    Ok,
    Warning {
        free_after_bytes: u64,
    },
    BlockedInsufficientSpace {
        free_after_bytes: u64,
        free_bytes: u64,
        needed_bytes: u64,
    },
}

/// Pure decision function — unit-testable without sysinfo.
pub fn assess(free_bytes: u64, estimated_bytes: u64) -> InstallFeasibility {
    if estimated_bytes == 0 {
        return InstallFeasibility::Warning {
            free_after_bytes: free_bytes,
        };
    }
    // Compute via u128 so the multiply can't lose precision for any u64
    // input (saturating_mul above would silently round u64::MAX to itself).
    let margin = u64::try_from(
        (estimated_bytes as u128 * SAFETY_MARGIN_PCT as u128) / 100u128,
    ).unwrap_or(u64::MAX);
    let needed = estimated_bytes.saturating_add(margin);
    let free_after = free_bytes.saturating_sub(needed);
    if free_after < BLOCK_THRESHOLD_BYTES {
        InstallFeasibility::BlockedInsufficientSpace {
            free_after_bytes: free_after,
            free_bytes,
            needed_bytes: needed,
        }
    } else if free_after < WARN_THRESHOLD_BYTES {
        InstallFeasibility::Warning {
            free_after_bytes: free_after,
        }
    } else {
        InstallFeasibility::Ok
    }
}

#[tauri::command]
pub async fn check_install_feasibility(
    estimated_size_bytes: u64,
) -> Result<InstallFeasibility, AppError> {
    let usage = compute_disk_usage(&models_dir(), 0);
    Ok(assess(usage.free_bytes, estimated_size_bytes))
}
