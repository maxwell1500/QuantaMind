use serde::{Deserialize, Serialize};

/// Probed truth about the decoded audio — derived from the actual decoded
/// samples (`samples_per_channel / rate`), NOT the container's declared header
/// (they differ for VBR / odd headers; RTF in P3 depends on the decoded length).
#[derive(Serialize, Deserialize, Clone, Debug, PartialEq)]
pub struct AudioSpec {
    pub sample_rate_hz: u32,
    pub channels: u16,
    pub duration_secs: f64,
}

#[derive(Serialize, Deserialize, Clone, Debug, PartialEq)]
pub struct Word {
    pub text: String,
    pub start_secs: f64,
    pub end_secs: f64,
    pub probability: Option<f64>,
}

#[derive(Serialize, Deserialize, Clone, Debug, PartialEq)]
pub struct Segment {
    pub text: String,
    pub start_secs: f64,
    pub end_secs: f64,
    /// Whisper's average token log-probability for the segment (confidence).
    pub avg_logprob: Option<f64>,
    /// Probability the segment is non-speech — the hallucinated-silence signal
    /// (P3 metric). Captured faithfully here, never used to relabel.
    pub no_speech_prob: Option<f64>,
    pub words: Option<Vec<Word>>,
}

/// Per-run measurements. **Every field is `Option`** — `None` unless the backend
/// actually emitted it (no fabricated metrics). `rtf` is decoded-seconds ÷
/// wall-seconds (P3), `None` for a zero-length or instantaneous run.
#[derive(Serialize, Deserialize, Clone, Debug, PartialEq, Default)]
pub struct TranscribeStats {
    /// The container's declared duration (or `0.0` for VBR with no frame count).
    pub source_duration_secs: Option<f64>,
    /// The true decoded length (mono frames ÷ rate) — RTF's denominator.
    pub audio_decoded_secs: Option<f64>,
    pub transcribe_wall_ms: Option<u64>,
    pub segment_count: Option<usize>,
    pub detected_language: Option<String>,
    /// The sample rate actually fed to the backend — must be 16 kHz for Whisper.
    pub received_sample_rate_hz: Option<u32>,
    pub rtf: Option<f64>,
}

/// The quality/readiness profile (P3). A typed placeholder so the artifact has a
/// stable shape now; `None` until P3 fills it.
#[derive(Serialize, Deserialize, Clone, Debug, PartialEq)]
pub struct SttProfile {}

/// The canonical transcription artifact — the source of truth (text/SRT/VTT are
/// derived exports later, never this). `complete` is `true` only when the whole
/// clip transcribed without error; a truncated run is never marked complete.
#[derive(Serialize, Deserialize, Clone, Debug, PartialEq)]
pub struct Transcript {
    pub id: String,
    pub model: String,
    pub language: Option<String>,
    pub audio: AudioSpec,
    pub segments: Vec<Segment>,
    pub complete: bool,
    pub stats: TranscribeStats,
    pub stt_profile: Option<SttProfile>,
}

#[cfg(test)]
mod tests {
    use super::*;

    fn sample() -> Transcript {
        Transcript {
            id: "clip-1".into(),
            model: "ggml-tiny.en.bin".into(),
            language: Some("en".into()),
            audio: AudioSpec { sample_rate_hz: 16_000, channels: 1, duration_secs: 30.0 },
            segments: vec![Segment {
                text: " Hello world.".into(),
                start_secs: 0.0,
                end_secs: 1.5,
                avg_logprob: Some(-0.21),
                no_speech_prob: Some(0.01),
                words: Some(vec![Word { text: "Hello".into(), start_secs: 0.0, end_secs: 0.6, probability: Some(0.98) }]),
            }],
            complete: true,
            stats: TranscribeStats {
                received_sample_rate_hz: Some(16_000),
                segment_count: Some(1),
                detected_language: Some("en".into()),
                ..Default::default()
            },
            stt_profile: None,
        }
    }

    #[test]
    fn transcript_round_trips_through_json() {
        let t = sample();
        let json = serde_json::to_string_pretty(&t).unwrap();
        let back: Transcript = serde_json::from_str(&json).unwrap();
        assert_eq!(t, back, "write → read → deep-equal");
        assert!(back.stt_profile.is_none(), "SttProfile slot is None until P3 fills it");
        assert_eq!(back.stats.rtf, None, "an unset RTF round-trips as None, never coerced to 0");
    }
}
