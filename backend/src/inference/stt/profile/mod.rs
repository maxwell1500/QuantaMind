// The STT measurement layer (P3): turns a transcription run into a measured
// `SttProfile` (performance + behavioral), under strict no-fake-metrics rules —
// every field is `Option`, `None` when the backend can't report it. Pure/domain:
// holds no AppHandle and never imports `crate::commands`.
pub mod accumulator;
pub mod behavioral;
pub mod perf;

use crate::inference::stt::profile::behavioral::BehavioralAccumulator;
use crate::inference::stt::transcribe::transcript::{BehavioralProfile, Segment};
use tokio::sync::mpsc;
use tokio::task::JoinHandle;

/// Buffer enough fresh batches that the cheap fold keeps up without the transcribe
/// loop ever blocking on a send in practice (a 30 s window's batch arrives roughly
/// once per `/inference` roundtrip).
const CHANNEL_CAP: usize = 64;

/// An off-critical-path profiler: the behavioral fold runs on its **own task**, fed
/// fresh segment batches over a **bounded channel**, so its cost never lands in the
/// transcribe loop's wall clock (which RTF divides by). The loop hands batches over
/// and moves straight on to the next inference call. Dropping the `Profiler` (e.g.
/// an error `?` early-return) closes the channel and aborts the task — no partial
/// profiling state lingers; `finish()` instead drains it and returns the profile.
pub struct Profiler {
    tx: Option<mpsc::Sender<Vec<Segment>>>,
    task: Option<JoinHandle<BehavioralProfile>>,
}

impl Profiler {
    pub fn spawn() -> Self {
        let (tx, mut rx) = mpsc::channel::<Vec<Segment>>(CHANNEL_CAP);
        let task = tokio::spawn(async move {
            let mut acc = BehavioralAccumulator::new();
            while let Some(batch) = rx.recv().await {
                acc.push(&batch);
            }
            acc.finish()
        });
        Profiler { tx: Some(tx), task: Some(task) }
    }

    /// Hand a fresh batch to the fold. The clone is cheap and stays on the loop; the
    /// expensive folding happens on the task. A closed channel is ignored —
    /// profiling is best-effort and must never fail a transcription.
    pub async fn observe(&self, segments: &[Segment]) {
        if let Some(tx) = &self.tx {
            let _ = tx.send(segments.to_vec()).await;
        }
    }

    /// Close the channel and await the folded behavioral profile. Called **after**
    /// the wall clock is stopped, so the fold's time is excluded from RTF.
    pub async fn finish(mut self) -> BehavioralProfile {
        self.tx = None; // drop the sender → the task's recv loop ends and folds out
        match self.task.take() {
            Some(t) => t.await.unwrap_or_else(|_| BehavioralAccumulator::new().finish()),
            None => BehavioralAccumulator::new().finish(),
        }
    }
}

impl Drop for Profiler {
    fn drop(&mut self) {
        // On an error path the Profiler is dropped without finish(): the sender drops
        // here (closing the channel) and the task is aborted so nothing lingers.
        if let Some(t) = &self.task {
            t.abort();
        }
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
        p.observe(&[seg(" hi"), seg(" hi")]).await; // adjacent duplicate
        p.observe(&[seg(" bye")]).await;
        let b = p.finish().await;
        // 3 segments, 1 adjacent repeat over 2 pairs = 0.5.
        assert_eq!(b.repeat_rate, Some(0.5));
        assert_eq!(b.confidence, None, "no word probabilities → None");
    }

    #[tokio::test]
    async fn drop_without_finish_does_not_hang() {
        let p = Profiler::spawn();
        p.observe(&[seg("x")]).await;
        drop(p); // error-path teardown: aborts the task, returns immediately
    }
}
