use std::time::{Duration, Instant};

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

pub struct RunTiming {
    start: Instant,
    first_token: Option<Instant>,
    last_token: Option<Instant>,
    pub token_count: usize,
}

impl RunTiming {
    pub fn start() -> Self {
        Self {
            start: Instant::now(),
            first_token: None,
            last_token: None,
            token_count: 0,
        }
    }

    pub fn record_token(&mut self) {
        let now = Instant::now();
        if self.first_token.is_none() {
            self.first_token = Some(now);
        }
        self.last_token = Some(now);
        self.token_count += 1;
    }

    pub fn ttft_ms(&self) -> Option<u64> {
        self.first_token.map(|t| ttft_ms(t - self.start))
    }

    pub fn tokens_per_sec(&self) -> Option<f64> {
        let first = self.first_token?;
        let last = self.last_token?;
        tokens_per_sec(last - first, self.token_count)
    }
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

    #[test]
    fn run_timing_smoke_observes_positive_ttft() {
        let mut t = RunTiming::start();
        std::thread::sleep(Duration::from_millis(20));
        t.record_token();
        std::thread::sleep(Duration::from_millis(20));
        t.record_token();
        assert_eq!(t.token_count, 2);
        let ttft = t.ttft_ms().expect("ttft");
        assert!(ttft > 0, "ttft was {ttft}");
        let tps = t.tokens_per_sec().expect("tps");
        assert!(tps > 0.0);
    }
}
