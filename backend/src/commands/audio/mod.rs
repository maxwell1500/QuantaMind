// Native microphone capture (cpal). Lives outside commands/stt/ (which is at the
// 10-file limit) and because WKWebView can't reliably do getUserMedia on macOS —
// the Rust process captures the mic and hands a WAV path to the STT transcribe path.
pub mod capture;
