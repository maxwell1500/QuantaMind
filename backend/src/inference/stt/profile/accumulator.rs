/// A bounded streaming summary of values known to lie in `[0, 1]` (e.g. whisper
/// token probabilities). Fixed memory regardless of how many values arrive — a
/// 1000-bucket histogram + a running sum — so a 60-minute transcript with millions
/// of words can never blow the budget. (A fixed histogram is used instead of a P²
/// estimator: the value domain is known `[0, 1]`, so bucketing is both bounded and
/// exact-to-resolution, with none of P²'s fiddly marker math.)
const BUCKETS: usize = 1000;

pub struct UnitStats {
    sum: f64,
    count: u64,
    hist: [u32; BUCKETS],
}

impl UnitStats {
    pub fn new() -> Self {
        UnitStats { sum: 0.0, count: 0, hist: [0; BUCKETS] }
    }

    /// Fold one value (clamped into `[0, 1]`).
    pub fn push(&mut self, v: f32) {
        let v = v.clamp(0.0, 1.0) as f64;
        self.sum += v;
        self.count += 1;
        let bucket = ((v * BUCKETS as f64) as usize).min(BUCKETS - 1);
        self.hist[bucket] += 1;
    }

    pub fn count(&self) -> u64 {
        self.count
    }

    /// Mean of everything pushed, or `None` if nothing was — never a fabricated 0.
    pub fn mean(&self) -> Option<f64> {
        (self.count > 0).then(|| self.sum / self.count as f64)
    }

    /// The value below which a `p` (0..1) fraction of the data falls — the lower
    /// edge of the crossing bucket. `None` if empty.
    pub fn percentile(&self, p: f64) -> Option<f64> {
        if self.count == 0 {
            return None;
        }
        let target = (p.clamp(0.0, 1.0) * self.count as f64).ceil() as u64;
        let mut cum: u64 = 0;
        for (i, &c) in self.hist.iter().enumerate() {
            cum += c as u64;
            if cum >= target.max(1) {
                return Some(i as f64 / BUCKETS as f64);
            }
        }
        Some(1.0)
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn empty_reports_none_never_zero() {
        let s = UnitStats::new();
        assert_eq!(s.count(), 0);
        assert_eq!(s.mean(), None, "no data → no mean, not 0.0");
        assert_eq!(s.percentile(0.05), None);
    }

    #[test]
    fn mean_and_low_percentile_track_a_known_distribution() {
        let mut s = UnitStats::new();
        // Uniform 0.00, 0.01, …, 0.99 — mean ≈ 0.495, 5th pct ≈ 0.05.
        for i in 0..100 {
            s.push(i as f32 / 100.0);
        }
        assert_eq!(s.count(), 100);
        let mean = s.mean().unwrap();
        assert!((mean - 0.495).abs() < 1e-6, "mean {mean}");
        // 5th percentile of 0.00..0.99 (ceil def) is the 5th smallest ≈ 0.04.
        let p5 = s.percentile(0.05).unwrap();
        assert!((0.03..=0.06).contains(&p5), "5th percentile {p5} sits in the low tail");
    }

    #[test]
    fn stays_bounded_under_many_values() {
        let mut s = UnitStats::new();
        for i in 0..1_000_000u32 {
            s.push((i % 100) as f32 / 100.0);
        }
        // No panic / no growth — fixed histogram. Mean of a repeated 0..0.99 ramp.
        assert!((s.mean().unwrap() - 0.495).abs() < 1e-6);
    }
}
