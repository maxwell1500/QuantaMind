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

#[cfg(test)]
mod tests {
    use super::*;

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
