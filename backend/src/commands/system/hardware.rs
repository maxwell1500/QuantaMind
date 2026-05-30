#![deny(clippy::unwrap_used)]
use crate::commands::system::gpu::{probe_gpu, GpuInfo};
use crate::commands::system::hardware_mem::compute_available;
use crate::errors::AppError;
use crate::sync::MutexExt;
use serde::Serialize;
use std::sync::{Mutex, OnceLock};
use sysinfo::{CpuRefreshKind, MemoryRefreshKind, RefreshKind, System};

#[derive(Serialize, Clone, Debug, PartialEq)]
pub struct HardwareSnapshot {
    pub total_memory_bytes: u64,
    pub available_memory_bytes: u64,
    pub is_apple_silicon: bool,
    pub cpu: String,
    pub physical_cores: Option<usize>,
    pub os_name: Option<String>,
    pub os_version: Option<String>,
    pub arch: String,
    pub gpu: GpuInfo,
}

fn system() -> &'static Mutex<System> {
    static SYSTEM: OnceLock<Mutex<System>> = OnceLock::new();
    SYSTEM.get_or_init(|| {
        Mutex::new(System::new_with_specifics(
            RefreshKind::new()
                .with_memory(MemoryRefreshKind::everything())
                .with_cpu(CpuRefreshKind::everything()),
        ))
    })
}

pub fn snapshot() -> HardwareSnapshot {
    let mut sys = system().lock_recover();
    sys.refresh_memory();
    let total = sys.total_memory();
    let available = compute_available(total, sys.available_memory(), sys.used_memory());
    let cpu = sys.cpus().first().map(|c| c.brand().trim().to_string()).unwrap_or_default();
    HardwareSnapshot {
        total_memory_bytes: total,
        available_memory_bytes: available,
        is_apple_silicon: cfg!(all(target_os = "macos", target_arch = "aarch64")),
        cpu,
        physical_cores: sys.physical_core_count(),
        os_name: System::name(),
        os_version: System::os_version(),
        arch: std::env::consts::ARCH.to_string(),
        gpu: probe_gpu(),
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
    fn snapshot_reports_nonzero_total_and_an_arch() {
        let s = snapshot();
        assert!(s.total_memory_bytes > 0);
        assert!(!s.arch.is_empty());
    }

    #[test]
    fn available_at_most_total() {
        let s = snapshot();
        assert!(s.available_memory_bytes <= s.total_memory_bytes);
    }

    #[test]
    fn apple_silicon_flag_matches_cfg() {
        assert_eq!(snapshot().is_apple_silicon, cfg!(all(target_os = "macos", target_arch = "aarch64")));
    }
}
