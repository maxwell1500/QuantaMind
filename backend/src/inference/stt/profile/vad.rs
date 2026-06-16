use crate::inference::stt::transcribe::audio::TARGET_RATE_HZ;
use webrtc_vad::{SampleRate, Vad, VadMode};

/// Identifies an engine purely so the silence metric can *prove* its detector is
/// not the STT model under test — the metric is meaningless (circular) if it
/// reuses the model's own speech/no-speech opinion. See `SpeechDetector::new`.
#[derive(Debug, PartialEq, Eq, Clone, Copy)]
pub enum EngineId {
    WebRtcVad,
    WhisperCpp,
}

/// WebRTC VAD works on 10/20/30 ms frames; 30 ms at 16 kHz = 480 samples.
const FRAME_MS: usize = 30;
const FRAME_SAMPLES: usize = TARGET_RATE_HZ as usize / 1000 * FRAME_MS;

/// An independent, deterministic (non-ML) voice-activity detector over 16 kHz mono
/// PCM. Independent by construction: it loads no model and shares no state with the
/// STT engine, so "the model emitted text during silence" can never be measured
/// against the model's own judgement. `!Send` (wraps a C handle), so it must be
/// built and used on a single thread — never moved across one.
pub struct SpeechDetector {
    vad: Vad,
}

impl SpeechDetector {
    /// `stt_engine` is the engine under test; the assert makes it impossible to
    /// accidentally point the silence metric at the STT model's own VAD.
    pub fn new(stt_engine: EngineId) -> Self {
        assert_ne!(EngineId::WebRtcVad, stt_engine, "VAD must be independent of the STT engine under test");
        SpeechDetector { vad: Vad::new_with_rate_and_mode(SampleRate::Rate16kHz, VadMode::Quality) }
    }

    /// Classify each 30 ms frame of `pcm_16k` and return the **absolute** speech
    /// intervals (seconds) within a window starting at `offset_secs`. A trailing
    /// partial frame is dropped (matches the windowing). f32→i16 per frame.
    pub fn speech_intervals(&mut self, pcm_16k: &[f32], offset_secs: f64) -> Vec<(f64, f64)> {
        let mut intervals = Vec::new();
        let mut run_start: Option<usize> = None;
        let n_frames = pcm_16k.len() / FRAME_SAMPLES;
        let mut frame = [0i16; FRAME_SAMPLES];
        for f in 0..n_frames {
            let base = f * FRAME_SAMPLES;
            for (j, &s) in pcm_16k[base..base + FRAME_SAMPLES].iter().enumerate() {
                frame[j] = (s.clamp(-1.0, 1.0) * 32_767.0).round() as i16;
            }
            let speech = self.vad.is_voice_segment(&frame).unwrap_or(false);
            match (speech, run_start) {
                (true, None) => run_start = Some(f),
                (false, Some(start)) => {
                    intervals.push(frame_span(start, f, offset_secs));
                    run_start = None;
                }
                _ => {}
            }
        }
        if let Some(start) = run_start {
            intervals.push(frame_span(start, n_frames, offset_secs));
        }
        intervals
    }
}

fn frame_span(start_frame: usize, end_frame: usize, offset_secs: f64) -> (f64, f64) {
    let per = FRAME_MS as f64 / 1000.0;
    (offset_secs + start_frame as f64 * per, offset_secs + end_frame as f64 * per)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    #[should_panic(expected = "independent")]
    fn refuses_to_be_the_stt_engine_under_test() {
        // Wiring the detector to its own engine is the #1 circularity trap.
        let _ = SpeechDetector::new(EngineId::WebRtcVad);
    }

    #[test]
    fn digital_silence_has_no_speech_intervals() {
        let mut d = SpeechDetector::new(EngineId::WhisperCpp);
        let silence = vec![0.0f32; TARGET_RATE_HZ as usize]; // 1 s of zeros
        assert!(d.speech_intervals(&silence, 0.0).is_empty(), "VAD marks silence as non-speech");
    }

    #[test]
    fn intervals_are_offset_to_absolute_time() {
        // A trailing partial frame is dropped; offset is applied to whatever's found.
        let mut d = SpeechDetector::new(EngineId::WhisperCpp);
        let r = d.speech_intervals(&[0.0f32; FRAME_SAMPLES * 2], 29.0);
        assert!(r.is_empty(), "still silence, just confirming no panic with an offset");
    }
}
