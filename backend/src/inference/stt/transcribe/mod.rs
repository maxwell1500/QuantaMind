// P1 transcription seam (whisper.cpp): decode audio in Rust → resample to 16 kHz
// → window → call whisper-server /inference per window → stream segments through
// a sink → assemble a canonical Transcript. Tauri-free (streaming via the
// TranscribeSink trait); strictly offline (loopback-only).
pub mod audio;
pub mod backend;
pub mod sink;
pub mod transcript;
pub mod whisper_cpp;
