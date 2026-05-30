use std::time::Duration;

pub fn ttft_ms(elapsed: Duration) -> u64 {
    elapsed.as_millis() as u64
}

pub fn tokens_per_sec(span: Duration, count: usize) -> Option<f64> {
    let secs = span.as_secs_f64();
    if secs <= 0.0 || count == 0 {
        return None;
    }
    Some(count as f64 / secs)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn ttft_ms_converts_duration_to_millis() {
        assert_eq!(ttft_ms(Duration::from_millis(0)), 0);
        assert_eq!(ttft_ms(Duration::from_millis(123)), 123);
        assert_eq!(ttft_ms(Duration::from_secs(2)), 2000);
    }

    #[test]
    fn tps_exact_math_100_over_5s_is_20() {
        let v = tokens_per_sec(Duration::from_secs(5), 100).unwrap();
        assert_eq!(v, 20.0);
    }

    #[test]
    fn tps_within_5pct_of_expected() {
        // 50 tokens in 2500ms -> 20 tps
        let actual = tokens_per_sec(Duration::from_millis(2500), 50).unwrap();
        let expected = 20.0;
        let drift = (actual - expected).abs() / expected;
        assert!(drift <= 0.05, "tps {actual} drifted >5% from {expected}");
    }

    #[test]
    fn tps_none_on_zero_count_or_zero_duration() {
        assert!(tokens_per_sec(Duration::from_secs(1), 0).is_none());
        assert!(tokens_per_sec(Duration::from_secs(0), 50).is_none());
    }
}
