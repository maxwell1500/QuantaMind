use crate::inference::stt::transcribe::transcript::PerfProfile;

/// Assemble the performance profile. `encode_ms`/`decode_ms` are `None` for
/// whisper-server, which exposes no encoder/decoder split — the total wall stays
/// in `TranscribeStats`, never split by a guessed ratio. `first_segment_ms` is the
/// measured time from submission to the first streamed segment (the TTFT analog),
/// or `None` if no segment ever streamed.
pub fn profile(first_segment_ms: Option<u64>) -> PerfProfile {
    PerfProfile { first_segment_ms, encode_ms: None, decode_ms: None }
}

/// Real-time factor: decoded audio seconds ÷ wall-clock inference seconds.
/// `> 1.0` is faster than real time. **The denominator is the decoded length**
/// (`WindowReader::decoded_secs`, a sample-count fact), never the container's
/// declared duration — so RTF is reproducible across WAV/MP3/OGG. Returns `None`
/// when either input is non-positive (a zero/empty run yields no fabricated speed).
pub fn rtf(decoded_secs: f64, wall_ms: u64) -> Option<f64> {
    if decoded_secs <= 0.0 || wall_ms == 0 {
        return None;
    }
    Some(decoded_secs / (wall_ms as f64 / 1000.0))
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn rtf_is_decoded_over_wall_seconds() {
        // 60 s of audio transcribed in 30 s of wall → 2× real time.
        assert_eq!(rtf(60.0, 30_000), Some(2.0));
        // 30 s of audio in 60 s of wall → half real time.
        assert_eq!(rtf(30.0, 60_000), Some(0.5));
    }

    #[test]
    fn rtf_is_none_when_a_factor_is_non_positive() {
        assert_eq!(rtf(0.0, 30_000), None, "no decoded audio → no speed, not 0");
        assert_eq!(rtf(60.0, 0), None, "no wall time → undefined, never fabricated");
        assert_eq!(rtf(-1.0, 30_000), None);
    }

    #[test]
    fn perf_leaves_the_encode_decode_split_none() {
        let p = profile(Some(180));
        assert_eq!(p.first_segment_ms, Some(180));
        assert_eq!(p.encode_ms, None, "whisper exposes no split — never guessed");
        assert_eq!(p.decode_ms, None);
    }

    #[test]
    fn perf_keeps_a_missing_first_segment_none() {
        // A run that never streamed a segment → no TTFT analog, not 0.
        assert_eq!(profile(None).first_segment_ms, None);
    }
}
