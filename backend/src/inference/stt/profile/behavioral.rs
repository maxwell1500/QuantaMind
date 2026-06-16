use crate::inference::stt::profile::accumulator::UnitStats;
use crate::inference::stt::transcribe::transcript::{BehavioralProfile, Confidence, Segment};

/// Streaming fold over the transcript's segments → the behavioral profile. Holds
/// only running aggregates (an adjacent-text tracker + a bounded `UnitStats`),
/// never a per-segment/per-word array — safe on a 60-minute file. Fed the same
/// `fresh` batches the sink streams, so it works off the timed critical path.
pub struct BehavioralAccumulator {
    seg_count: u64,
    repeat_count: u64,
    last_text: Option<String>,
    confidence: UnitStats,
}

impl BehavioralAccumulator {
    pub fn new() -> Self {
        BehavioralAccumulator { seg_count: 0, repeat_count: 0, last_text: None, confidence: UnitStats::new() }
    }

    /// Fold a batch of freshly-emitted segments.
    pub fn push(&mut self, segments: &[Segment]) {
        for s in segments {
            let norm = s.text.trim().to_lowercase();
            // Adjacent duplicate text = a stuck/looping decode. Empty text never counts.
            if !norm.is_empty() {
                if self.last_text.as_deref() == Some(norm.as_str()) {
                    self.repeat_count += 1;
                }
                self.last_text = Some(norm);
            }
            self.seg_count += 1;
            // Confidence from word-level probabilities only (a real 0..1 number);
            // segment `avg_logprob` is a different unit and is never mixed in.
            if let Some(words) = &s.words {
                for w in words {
                    if let Some(p) = w.probability {
                        self.confidence.push(p as f32);
                    }
                }
            }
        }
    }

    /// Finalize. `repeat_rate` is always measurable when anything was transcribed
    /// (`Some(0.0)` = counted, none found); `None` only with zero segments.
    /// `confidence` is `None` when no word carried a probability — never `0.0`/`1.0`.
    pub fn finish(self) -> BehavioralProfile {
        let repeat_rate = match self.seg_count {
            0 => None,
            1 => Some(0.0), // one segment: no adjacent pair, but a real "no repeats"
            n => Some(self.repeat_count as f64 / (n - 1) as f64),
        };
        let confidence = match (self.confidence.mean(), self.confidence.percentile(0.05)) {
            (Some(mean), Some(p5)) => Some(Confidence { mean: mean as f32, low_percentile: p5 as f32 }),
            _ => None,
        };
        BehavioralProfile {
            repeat_rate,
            confidence,
            // Filled by the independent-VAD step; None here.
            silence_hallucination_rate: None,
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::inference::stt::transcribe::transcript::Word;

    fn seg(text: &str, words: Option<Vec<(f64, f64)>>) -> Segment {
        Segment {
            text: text.into(),
            start_secs: 0.0,
            end_secs: 1.0,
            avg_logprob: None,
            no_speech_prob: None,
            words: words.map(|ws| {
                ws.into_iter()
                    .map(|(_t, p)| Word { text: "w".into(), start_secs: 0.0, end_secs: 0.5, probability: Some(p) })
                    .collect()
            }),
        }
    }

    #[test]
    fn repeat_rate_fires_on_adjacent_duplicate_text() {
        let mut a = BehavioralAccumulator::new();
        // " hi", " hi", " bye" → one adjacent repeat over two pairs = 0.5.
        a.push(&[seg(" hi", None), seg(" hi", None), seg(" bye", None)]);
        let p = a.finish();
        assert_eq!(p.repeat_rate, Some(0.5), "1 repeat / 2 adjacent pairs");
    }

    #[test]
    fn repeat_rate_is_zero_not_none_when_no_repeats() {
        let mut a = BehavioralAccumulator::new();
        a.push(&[seg("a", None), seg("b", None), seg("c", None)]);
        assert_eq!(a.finish().repeat_rate, Some(0.0), "counted, none found — a real 0.0");
    }

    #[test]
    fn repeat_rate_none_when_nothing_transcribed() {
        assert_eq!(BehavioralAccumulator::new().finish().repeat_rate, None);
    }

    #[test]
    fn confidence_none_when_no_word_probabilities() {
        let mut a = BehavioralAccumulator::new();
        a.push(&[seg("hello world", None)]); // no words → no probabilities
        assert_eq!(a.finish().confidence, None, "no opinion → None, never 0% or 100%");
    }

    #[test]
    fn confidence_summarizes_word_probabilities() {
        let mut a = BehavioralAccumulator::new();
        a.push(&[seg("x", Some(vec![(0.0, 0.9), (0.0, 0.8), (0.0, 0.2)]))]);
        let c = a.finish().confidence.expect("words present → confidence Some");
        assert!((c.mean - 0.633).abs() < 0.01, "mean of 0.9/0.8/0.2, got {}", c.mean);
        assert!(c.low_percentile <= 0.25, "low tail reflects the 0.2, got {}", c.low_percentile);
    }
}
