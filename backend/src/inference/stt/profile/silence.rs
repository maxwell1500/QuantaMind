use crate::inference::stt::transcribe::transcript::Segment;

/// A segment whose own `avg_logprob` is below this was a low-confidence emission —
/// combined with VAD-silence it's a hallucination (a *confident* word inside a
/// brief VAD gap is likelier a real word the detector clipped). A segment with no
/// `avg_logprob` is treated as low-confidence (we can't vouch for it).
const LOW_LOGPROB: f64 = -1.0;

/// Streaming tally of silence-hallucinations: emitted segments whose time span the
/// **independent** VAD marked non-speech (and which the model wasn't confident
/// about). Holds two counters — no retained per-segment data, so it's bounded on a
/// 60-minute file. Fed per window, alongside that window's speech intervals.
pub struct SilenceAccumulator {
    emitted: u64,
    hallucinated: u64,
}

impl SilenceAccumulator {
    pub fn new() -> Self {
        SilenceAccumulator { emitted: 0, hallucinated: 0 }
    }

    /// Fold a window's segments against that window's VAD speech intervals.
    pub fn push(&mut self, segments: &[Segment], speech: &[(f64, f64)]) {
        for s in segments {
            self.emitted += 1;
            let in_speech = overlaps_speech(s.start_secs, s.end_secs, speech);
            let unsure = s.avg_logprob.map_or(true, |lp| lp < LOW_LOGPROB);
            if !in_speech && unsure {
                self.hallucinated += 1;
            }
        }
    }

    /// hallucinated ÷ emitted, or `None` when nothing was emitted (nothing to judge
    /// — never a fabricated 0).
    pub fn finish(self) -> Option<f64> {
        (self.emitted > 0).then(|| self.hallucinated as f64 / self.emitted as f64)
    }
}

/// Does `[start, end]` overlap any speech interval?
fn overlaps_speech(start: f64, end: f64, speech: &[(f64, f64)]) -> bool {
    speech.iter().any(|&(a, b)| start < b && end > a)
}

#[cfg(test)]
mod tests {
    use super::*;

    fn seg(start: f64, end: f64, avg_logprob: Option<f64>) -> Segment {
        Segment { text: "x".into(), start_secs: start, end_secs: end, avg_logprob, no_speech_prob: None, words: None }
    }

    #[test]
    fn none_when_nothing_emitted() {
        assert_eq!(SilenceAccumulator::new().finish(), None);
    }

    #[test]
    fn a_low_confidence_segment_in_silence_is_a_hallucination() {
        let mut a = SilenceAccumulator::new();
        // One segment over [10,11] s; the only speech is [0,1] s → it's in silence.
        a.push(&[seg(10.0, 11.0, Some(-2.0))], &[(0.0, 1.0)]);
        assert_eq!(a.finish(), Some(1.0), "spoke during VAD-silence → hallucination");
    }

    #[test]
    fn a_segment_overlapping_speech_is_not_a_hallucination() {
        let mut a = SilenceAccumulator::new();
        a.push(&[seg(0.5, 1.5, Some(-2.0))], &[(0.0, 1.0)]); // overlaps the speech region
        assert_eq!(a.finish(), Some(0.0), "real speech, not flagged");
    }

    #[test]
    fn a_confident_segment_in_a_gap_is_not_flagged() {
        let mut a = SilenceAccumulator::new();
        // In silence, but the model was confident (high logprob) → likely real, clipped by VAD.
        a.push(&[seg(10.0, 11.0, Some(-0.1))], &[(0.0, 1.0)]);
        assert_eq!(a.finish(), Some(0.0));
    }

    #[test]
    fn rate_is_the_fraction_of_emitted_segments() {
        let mut a = SilenceAccumulator::new();
        a.push(
            &[seg(0.2, 0.8, Some(-2.0)), seg(10.0, 11.0, Some(-2.0))], // one in speech, one in silence
            &[(0.0, 1.0)],
        );
        assert_eq!(a.finish(), Some(0.5), "1 hallucination / 2 emitted");
    }
}
