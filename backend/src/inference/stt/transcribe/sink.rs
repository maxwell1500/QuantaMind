use super::transcript::Segment;

/// Streaming surface for a transcription run. The harness (and a future command
/// layer) implements this to forward segments/progress; the backend stays
/// Tauri-free. `Send + Sync` so it can be shared across the per-window pump.
/// Parallel to `BatchSink` in `inference/eval/batch.rs`.
pub trait TranscribeSink: Send + Sync {
    /// One window's segments, with timestamps already offset to absolute time.
    fn segments(&self, segments: &[Segment]);
    /// Progress through the clip, in decoded seconds.
    fn progress(&self, processed_secs: f64, total_secs: f64);
}

/// A no-op sink for callers that only want the final `Transcript`.
pub struct NullSink;
impl TranscribeSink for NullSink {
    fn segments(&self, _segments: &[Segment]) {}
    fn progress(&self, _processed_secs: f64, _total_secs: f64) {}
}
