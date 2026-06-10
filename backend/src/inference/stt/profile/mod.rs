// The STT measurement layer (P3): turns a transcription run into a measured
// `SttProfile` (performance + behavioral), under strict no-fake-metrics rules —
// every field is `Option`, `None` when the backend can't report it. Pure/domain:
// holds no AppHandle and never imports `crate::commands`.
pub mod perf;
