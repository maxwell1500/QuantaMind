/// sysinfo's `available_memory()` occasionally returns 0 on macOS when
/// `vm_statistics64` page counts come back zeroed (observed after the user
/// clicks Refresh repeatedly). Fall back to `total − used` so the UI shows a
/// real number instead of "0B available".
pub(crate) fn compute_available(total: u64, available: u64, used: u64) -> u64 {
    if available > 0 {
        return available;
    }
    if total > used {
        return total - used;
    }
    0
}

/// Nominal unified-memory bandwidth (GB/s) for known Apple-Silicon chips, keyed
/// off the CPU brand string (e.g. "Apple M2 Max"). Local-LLM token speed is
/// bound by this, not by FLOPS. Values are the published headline figures;
/// anything unrecognised (incl. all non-Apple CPUs) returns `None` so the UI
/// shows "Not available" rather than a fabricated number. Pro/Max/Ultra are
/// matched before the bare generation so "M2 Pro" doesn't fall through to "M2".
pub fn guess_memory_bandwidth_gbps(cpu_brand: &str) -> Option<u32> {
    let b = cpu_brand;
    let gbps = if b.contains("M1 Ultra") {
        800
    } else if b.contains("M1 Max") {
        400
    } else if b.contains("M1 Pro") {
        200
    } else if b.contains("M1") {
        68
    } else if b.contains("M2 Ultra") {
        800
    } else if b.contains("M2 Max") {
        400
    } else if b.contains("M2 Pro") {
        200
    } else if b.contains("M2") {
        100
    } else if b.contains("M3 Ultra") {
        800
    } else if b.contains("M3 Max") {
        400
    } else if b.contains("M3 Pro") {
        150
    } else if b.contains("M3") {
        100
    } else if b.contains("M4 Max") {
        410
    } else if b.contains("M4 Pro") {
        273
    } else if b.contains("M4") {
        120
    } else {
        return None;
    };
    Some(gbps)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn bandwidth_known_apple_chips() {
        assert_eq!(guess_memory_bandwidth_gbps("Apple M2 Max"), Some(400));
        assert_eq!(guess_memory_bandwidth_gbps("Apple M1 Pro"), Some(200));
        assert_eq!(guess_memory_bandwidth_gbps("Apple M4"), Some(120));
    }

    #[test]
    fn bandwidth_pro_max_not_shadowed_by_base() {
        // "M2 Pro" must not resolve to the bare-M2 value (100).
        assert_eq!(guess_memory_bandwidth_gbps("Apple M2 Pro"), Some(200));
    }

    #[test]
    fn bandwidth_unknown_is_none_not_fabricated() {
        assert_eq!(guess_memory_bandwidth_gbps("Intel Core i7-9750H"), None);
        assert_eq!(guess_memory_bandwidth_gbps("AMD Ryzen 9"), None);
        assert_eq!(guess_memory_bandwidth_gbps(""), None);
    }

    #[test]
    fn passes_through_when_sysinfo_reports_nonzero() {
        assert_eq!(compute_available(16_000, 4_000, 8_000), 4_000);
    }

    #[test]
    fn falls_back_to_total_minus_used_when_zero() {
        assert_eq!(compute_available(16_000, 0, 9_000), 7_000);
    }

    #[test]
    fn returns_zero_when_used_meets_or_exceeds_total() {
        assert_eq!(compute_available(16_000, 0, 16_000), 0);
        assert_eq!(compute_available(16_000, 0, 20_000), 0);
    }
}
