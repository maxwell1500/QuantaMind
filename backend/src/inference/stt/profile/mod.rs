// The STT measurement layer (P3): turns a transcription run into a measured
// `SttProfile` (performance + behavioral), under strict no-fake-metrics rules —
// every field is `Option`, `None` when the backend can't report it. Pure/domain:
// holds no AppHandle and never imports `crate::commands`.
pub mod accumulator;
pub mod behavioral;
pub mod perf;
pub mod silence;
pub mod vad;

use crate::inference::stt::profile::behavioral::BehavioralAccumulator;
use crate::inference::stt::profile::silence::SilenceAccumulator;
use crate::inference::stt::profile::vad::{EngineId, SpeechDetector};
use crate::inference::stt::transcribe::transcript::{BehavioralProfile, Segment};
use tokio::sync::mpsc;
use tokio::task::JoinHandle;

/// PCM windows are ~2 MB each, so keep the buffer small — the fold is fast and the
/// loop rarely waits, but this caps worst-case buffered memory under backpressure.
const CHANNEL_CAP: usize = 8;

/// One window handed to the off-path fold: the freshly-emitted segments plus the
/// raw 16 kHz mono PCM (for the independent VAD) and its absolute start time.
struct ProfileChunk {
    segments: Vec<Segment>,
    pcm_16k: Vec<f32>,
    window_start_secs: f64,
}

/// An off-critical-path profiler: the behavioral + VAD fold runs on a **blocking
/// thread** (the `Vad` C handle is `!Send`, so it's built and used there, never
/// moved), fed over a **bounded channel**. Its cost never lands in the transcribe
/// loop's wall clock (which RTF divides by) — the loop hands a window over and
/// moves straight on. Dropping the `Profiler` (e.g. an error `?`) closes the
/// channel; the thread drains and exits. `finish()` joins it for the profile.
pub struct Profiler {
    tx: Option<mpsc::Sender<ProfileChunk>>,
    task: Option<JoinHandle<BehavioralProfile>>,
}

impl Profiler {
    pub fn spawn() -> Self {
        let (tx, mut rx) = mpsc::channel::<ProfileChunk>(CHANNEL_CAP);
        // spawn_blocking: the Vad is !Send, so it lives entirely on this thread.
        let task = tokio::task::spawn_blocking(move || {
            let mut behavioral = BehavioralAccumulator::new();
            let mut detector = SpeechDetector::new(EngineId::WhisperCpp);
            let mut silence = SilenceAccumulator::new();
            while let Some(chunk) = rx.blocking_recv() {
                behavioral.push(&chunk.segments);
                let speech = detector.speech_intervals(&chunk.pcm_16k, chunk.window_start_secs);
                silence.push(&chunk.segments, &speech);
            }
            let mut profile = behavioral.finish();
            profile.silence_hallucination_rate = silence.finish();
            profile
        });
        Profiler { tx: Some(tx), task: Some(task) }
    }

    /// Hand one window to the fold. The clones are cheap and stay on the loop; the
    /// VAD + stats folding happens on the blocking thread. A closed channel is
    /// ignored — profiling is best-effort and must never fail a transcription.
    pub async fn observe(&self, segments: &[Segment], pcm_16k: &[f32], window_start_secs: f64) {
        if let Some(tx) = &self.tx {
            let chunk = ProfileChunk {
                segments: segments.to_vec(),
                pcm_16k: pcm_16k.to_vec(),
                window_start_secs,
            };
            let _ = tx.send(chunk).await;
        }
    }

    /// Close the channel and await the folded behavioral profile. Called **after**
    /// the wall clock is stopped, so the fold's time is excluded from RTF.
    pub async fn finish(mut self) -> BehavioralProfile {
        self.tx = None; // drop the sender → the thread drains and folds out
        match self.task.take() {
            Some(t) => t.await.unwrap_or_else(|_| BehavioralAccumulator::new().finish()),
            None => BehavioralAccumulator::new().finish(),
        }
    }
}

impl Drop for Profiler {
    fn drop(&mut self) {
        // On an error path the Profiler is dropped without finish(): the sender drops
        // here, closing the channel, so the blocking thread drains and exits on its
        // own (a spawn_blocking task can't be aborted, but it returns promptly).
        self.tx = None;
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::inference::stt::transcribe::transcript::Segment;

    fn seg(text: &str) -> Segment {
        Segment { text: text.into(), start_secs: 0.0, end_secs: 1.0, avg_logprob: None, no_speech_prob: None, words: None }
    }

    #[tokio::test]
    async fn folds_batches_fed_through_the_channel() {
        let p = Profiler::spawn();
        let silence = [0.0f32; 16_000]; // 1 s of silence per window
        p.observe(&[seg(" hi"), seg(" hi")], &silence, 0.0).await; // adjacent duplicate
        p.observe(&[seg(" bye")], &silence, 1.0).await;
        let b = p.finish().await;
        // 3 segments, 1 adjacent repeat over 2 pairs = 0.5.
        assert_eq!(b.repeat_rate, Some(0.5));
        assert_eq!(b.confidence, None, "no word probabilities → None");
        // All three were emitted over digital silence → all flagged.
        assert_eq!(b.silence_hallucination_rate, Some(1.0), "text over VAD-silence");
    }

    #[tokio::test]
    async fn drop_without_finish_does_not_hang() {
        let p = Profiler::spawn();
        p.observe(&[seg("x")], &[0.0f32; 16_000], 0.0).await;
        drop(p); // error-path teardown: closes the channel, thread exits, returns immediately
    }
}
