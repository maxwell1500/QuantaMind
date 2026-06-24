use crate::errors::AppResult;
use crate::inference::stt::transcribe::sink::TranscribeSink;
use crate::inference::stt::transcribe::transcript::Transcript;
use crate::inference::stt::transcribe::whisper_cpp;
use std::path::Path;

/// Which transcription engine to drive. **Enum dispatch — no `Box<dyn>` /
/// `async-trait`** in the domain, mirroring `BackendKind`. whisper.cpp today;
/// `faster-whisper` could become a further variant.
#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum SttTranscribeEngine {
    WhisperCpp,
}

/// Transcribe `path` with `engine`, streaming segments through `sink`. The single
/// place the engine is chosen (by `match`). Every backend module exposes the same
/// `transcribe(base, path, model, id, sink)` shape — the de-facto backend trait.
pub async fn transcribe(
    engine: SttTranscribeEngine,
    base: &str,
    path: &Path,
    model: &str,
    id: &str,
    sink: &dyn TranscribeSink,
) -> AppResult<Transcript> {
    match engine {
        SttTranscribeEngine::WhisperCpp => whisper_cpp::transcribe(base, path, model, id, sink).await,
    }
}
