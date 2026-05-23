#![deny(clippy::unwrap_used)]
use crate::errors::AppError;
use serde::Serialize;
use sysinfo::{MemoryRefreshKind, RefreshKind, System};

#[derive(Serialize, Clone, Debug, PartialEq)]
pub struct HardwareSnapshot {
    pub total_memory_bytes: u64,
    pub available_memory_bytes: u64,
    pub is_apple_silicon: bool,
}

pub fn snapshot() -> HardwareSnapshot {
    let mut sys = System::new_with_specifics(
        RefreshKind::new().with_memory(MemoryRefreshKind::everything()),
    );
    sys.refresh_memory();
    HardwareSnapshot {
        total_memory_bytes: sys.total_memory(),
        available_memory_bytes: sys.available_memory(),
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
        let s = snapshot();
        assert!(s.total_memory_bytes > 0, "total_memory_bytes should be > 0");
    }

    #[test]
    fn snapshot_available_at_most_total() {
        let s = snapshot();
        assert!(
            s.available_memory_bytes <= s.total_memory_bytes,
            "available ({}) must be <= total ({})",
            s.available_memory_bytes,
            s.total_memory_bytes,
        );
    }

    #[test]
    fn apple_silicon_flag_matches_cfg() {
        let s = snapshot();
        let expected = cfg!(all(target_os = "macos", target_arch = "aarch64"));
        assert_eq!(s.is_apple_silicon, expected);
    }
}
