#![deny(clippy::unwrap_used)]
use crate::errors::AppError;
use crate::sync::MutexExt;
use serde::Serialize;
use std::sync::{Mutex, OnceLock};
use sysinfo::{MemoryRefreshKind, RefreshKind, System};

#[derive(Serialize, Clone, Debug, PartialEq)]
pub struct HardwareSnapshot {
    pub total_memory_bytes: u64,
    pub available_memory_bytes: u64,
    pub is_apple_silicon: bool,
}

/// sysinfo's `available_memory()` occasionally returns 0 on macOS when
/// `vm_statistics64` page counts come back zeroed (observed after the
/// user clicks Refresh repeatedly). Fall back to `total − used` so the
/// UI shows a real number instead of "0B available".
pub(crate) fn compute_available(total: u64, available: u64, used: u64) -> u64 {
    if available > 0 { return available; }
    if total > used { return total - used; }
    0
}

fn system() -> &'static Mutex<System> {
    static SYSTEM: OnceLock<Mutex<System>> = OnceLock::new();
    SYSTEM.get_or_init(|| {
        Mutex::new(System::new_with_specifics(
            RefreshKind::new().with_memory(MemoryRefreshKind::everything()),
        ))
    })
}

pub fn snapshot() -> HardwareSnapshot {
    let mut sys = system().lock_recover();
    sys.refresh_memory();
    let total = sys.total_memory();
    let available = compute_available(total, sys.available_memory(), sys.used_memory());
    HardwareSnapshot {
        total_memory_bytes: total,
        available_memory_bytes: available,
        is_apple_silicon: cfg!(all(target_os = "macos", target_arch = "aarch64")),
    }
}

#[tauri::command]
pub fn get_hardware_snapshot() -> Result<HardwareSnapshot, AppError> {
    Ok(snapshot())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn snapshot_reports_nonzero_total() {
        assert!(snapshot().total_memory_bytes > 0);
    }

    #[test]
    fn snapshot_available_at_most_total() {
        let s = snapshot();
        assert!(s.available_memory_bytes <= s.total_memory_bytes);
    }

    #[test]
    fn apple_silicon_flag_matches_cfg() {
        assert_eq!(snapshot().is_apple_silicon,
            cfg!(all(target_os = "macos", target_arch = "aarch64")));
    }

    #[test]
    fn compute_available_passes_through_when_sysinfo_reports_nonzero() {
        assert_eq!(compute_available(16_000, 4_000, 8_000), 4_000);
    }

    #[test]
    fn compute_available_falls_back_to_total_minus_used_when_zero() {
        // sysinfo returned 0 but used is a sane number → use total − used
        assert_eq!(compute_available(16_000, 0, 9_000), 7_000);
    }

    #[test]
    fn compute_available_returns_zero_when_used_meets_or_exceeds_total() {
        assert_eq!(compute_available(16_000, 0, 16_000), 0);
        assert_eq!(compute_available(16_000, 0, 20_000), 0);
    }
}
