use serde::Serialize;
use std::process::Command;

const MIB: u64 = 1024 * 1024;

/// GPU/VRAM info, best-effort per platform. `unified` = shared memory (Apple
/// Silicon: no separate VRAM pool, so `vram_*` stay None and the UI reports
/// system RAM). `available:false` = couldn't probe → "Not available", never
/// fabricated. See `docs/architecture.md#robustness`.
#[derive(Serialize, Clone, Debug, PartialEq, Default)]
pub struct GpuInfo {
    pub name: Option<String>,
    pub vram_total_bytes: Option<u64>,
    pub vram_free_bytes: Option<u64>,
    pub unified: bool,
    pub available: bool,
}

/// Parse one `nvidia-smi --query-gpu=name,memory.total,memory.free
/// --format=csv,noheader,nounits` line ("RTX 4090, 24576, 3210") into
/// (name, total_mib, free_mib). Pure.
pub fn parse_nvidia_csv(line: &str) -> Option<(String, u64, u64)> {
    let parts: Vec<&str> = line.split(',').map(str::trim).collect();
    if parts.len() < 3 || parts[0].is_empty() {
        return None;
    }
    Some((parts[0].to_string(), parts[1].parse().ok()?, parts[2].parse().ok()?))
}

fn nvidia() -> Option<GpuInfo> {
    let out = Command::new("nvidia-smi")
        .args(["--query-gpu=name,memory.total,memory.free", "--format=csv,noheader,nounits"])
        .output()
        .ok()?;
    if !out.status.success() {
        return None;
    }
    let text = String::from_utf8_lossy(&out.stdout);
    let (name, total_mib, free_mib) = parse_nvidia_csv(text.lines().next()?)?;
    Some(GpuInfo {
        name: Some(name),
        vram_total_bytes: Some(total_mib * MIB),
        vram_free_bytes: Some(free_mib * MIB),
        unified: false,
        available: true,
    })
}

#[cfg(target_os = "macos")]
fn apple() -> Option<GpuInfo> {
    let out = Command::new("sysctl").args(["-n", "machdep.cpu.brand_string"]).output().ok()?;
    let chip = String::from_utf8_lossy(&out.stdout).trim().to_string();
    if !out.status.success() || chip.is_empty() {
        return None;
    }
    // Apple Silicon GPU is the same SoC; memory is unified (no separate pool).
    Some(GpuInfo { name: Some(format!("{chip} (integrated)")), unified: true, available: true, ..Default::default() })
}

#[cfg(not(target_os = "macos"))]
fn apple() -> Option<GpuInfo> {
    None
}

/// Try NVIDIA, then Apple Silicon; otherwise an unavailable GpuInfo.
pub fn probe_gpu() -> GpuInfo {
    nvidia().or_else(apple).unwrap_or_default()
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn parses_nvidia_csv_into_name_and_mib() {
        let r = parse_nvidia_csv("NVIDIA GeForce RTX 4090, 24576, 3210").unwrap();
        assert_eq!(r, ("NVIDIA GeForce RTX 4090".into(), 24576, 3210));
    }

    #[test]
    fn rejects_malformed_csv() {
        assert!(parse_nvidia_csv("").is_none());
        assert!(parse_nvidia_csv("name, notanumber, 5").is_none());
        assert!(parse_nvidia_csv(", 1, 2").is_none());
    }

    #[test]
    fn probe_never_panics() {
        let _ = probe_gpu();
    }
}
