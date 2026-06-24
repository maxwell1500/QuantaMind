use crate::metrics::throughput::{tokens_per_sec, ttft_ms};
use crate::metrics::timeline::TokenTiming;
use std::time::Instant;

pub struct RunTiming {
    start: Instant,
    first_token: Option<Instant>,
    last_token: Option<Instant>,
    pub token_count: usize,
    timeline: Vec<TokenTiming>,
}

impl RunTiming {
    pub fn start() -> Self {
        Self {
            start: Instant::now(),
            first_token: None,
            last_token: None,
            token_count: 0,
            timeline: Vec::new(),
        }
    }

    pub fn record_token(&mut self, text: &str) {
        let now = Instant::now();
        if self.first_token.is_none() {
            self.first_token = Some(now);
        }
        self.last_token = Some(now);
        self.token_count += 1;
        self.timeline.push(TokenTiming {
            text: text.to_string(),
            t_ms: (now - self.start).as_millis() as u64,
            n: self.token_count as u32,
        });
    }

    pub fn ttft_ms(&self) -> Option<u64> {
        self.first_token.map(|t| ttft_ms(t - self.start))
    }

    pub fn tokens_per_sec(&self) -> Option<f64> {
        let first = self.first_token?;
        let last = self.last_token?;
        tokens_per_sec(last - first, self.token_count)
    }

    pub fn timeline(&self) -> &[TokenTiming] {
        &self.timeline
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::time::Duration;

    #[test]
    fn run_timing_smoke_observes_positive_ttft() {
        let mut t = RunTiming::start();
        std::thread::sleep(Duration::from_millis(20));
        t.record_token("a");
        std::thread::sleep(Duration::from_millis(20));
        t.record_token("b");
        assert_eq!(t.token_count, 2);
        let ttft = t.ttft_ms().expect("ttft");
        assert!(ttft > 0, "ttft was {ttft}");
        let tps = t.tokens_per_sec().expect("tps");
        assert!(tps > 0.0);
    }

    #[test]
    fn timeline_records_each_token_in_order() {
        let mut t = RunTiming::start();
        t.record_token("a");
        std::thread::sleep(Duration::from_millis(5));
        t.record_token("b");
        let tl = t.timeline();
        assert_eq!(tl.len(), 2);
        assert_eq!(tl[0].text, "a");
        assert_eq!(tl[1].text, "b");
        assert_eq!(tl[0].n, 1);
        assert_eq!(tl[1].n, 2);
        assert!(tl[1].t_ms >= tl[0].t_ms, "t_ms not monotonic");
        // First token's t_ms shares the Instant used for ttft_ms.
        assert_eq!(tl[0].t_ms, t.ttft_ms().unwrap());
    }

    #[test]
    fn empty_run_has_empty_timeline() {
        let t = RunTiming::start();
        assert!(t.timeline().is_empty());
        assert_eq!(t.token_count, 0);
    }
}
